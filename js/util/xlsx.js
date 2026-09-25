// Escritor mínimo de libros de Excel (.xlsx), sin dependencias: un .xlsx es un ZIP de archivos XML (ver ./zip.js).
// Solo lo necesario para exportar tablas de resultados: varias hojas, texto y números, anchos de columna, celdas combinadas
// y unos pocos estilos con nombre.
//
// crearXlsx([{ nombre: "Hoja", anchos: [40, 12], combinar: ["A1:D1"], filas: [[celda, …], …] }, …]) -> Uint8Array
// celda = null | "texto" | número | { v: texto|número, estilo?: nombre de ESTILOS, dec?: 0|1|2 (decimales de un número) }

import { crearZip } from "./zip.js";

export const MIME_XLSX = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";

// Formatos de número: los incorporados de Excel 3 (#,##0) y 4 (#,##0.00) y uno propio para un decimal.
const FORMATO_DEC = { 0: 3, 1: 164, 2: 4, 3: 165, 4: 166 };

// fuente: 0 normal, 1 negrita, 2 título, 3 gris pequeña · relleno: 2 cabecera, 3 sección, 4 total · borde: 1 fino
const ESTILOS = {
  normal: { fuente: 0, relleno: 0, borde: 0 },
  titulo: { fuente: 2, relleno: 0, borde: 0 },
  nota: { fuente: 3, relleno: 0, borde: 0, ajustar: true },
  cabecera: { fuente: 1, relleno: 2, borde: 1, ajustar: true },
  seccion: { fuente: 1, relleno: 3, borde: 1 },
  etiqueta: { fuente: 1, relleno: 0, borde: 1, ajustar: true },
  celda: { fuente: 0, relleno: 0, borde: 1, ajustar: true },
  total: { fuente: 1, relleno: 4, borde: 1, ajustar: true },
};

// Un estilo de celda (xf) por cada combinación estilo × formato de número que se use.
function registroEstilos() {
  const lista = [];
  const indice = new Map();
  const obtener = (nombre, dec) => {
    const clave = `${nombre}|${dec ?? ""}`;
    if (!indice.has(clave)) {
      indice.set(clave, lista.length);
      lista.push({ ...ESTILOS[nombre] ?? ESTILOS.normal, formato: dec == null ? 0 : FORMATO_DEC[dec] ?? 4 });
    }
    return indice.get(clave);
  };
  obtener("normal"); // el índice 0 es el estilo por defecto
  return { lista, obtener };
}

const esc = (s) =>
  String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    // caracteres de control que XML no admite
    .replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, "");

/** Letra(s) de la columna: 0 → A, 25 → Z, 26 → AA. */
export function columna(i) {
  let s = "";
  for (let n = i + 1; n > 0; n = Math.floor((n - 1) / 26)) s = String.fromCharCode(65 + ((n - 1) % 26)) + s;
  return s;
}

function hojaXml(hoja, estilos) {
  const filas = hoja.filas
    .map((fila, r) => {
      const celdas = fila
        .map((c, k) => {
          if (c === null || c === undefined || c === "") return "";
          const celda = typeof c === "object" ? c : { v: c };
          const ref = `${columna(k)}${r + 1}`;
          const esNumero = typeof celda.v === "number" && Number.isFinite(celda.v);
          const s = estilos.obtener(celda.estilo ?? "normal", esNumero ? celda.dec : null);
          if (celda.v === null || celda.v === undefined || celda.v === "") return s ? `<c r="${ref}" s="${s}"/>` : "";
          if (esNumero) return `<c r="${ref}" s="${s}"><v>${celda.v}</v></c>`;
          return `<c r="${ref}" s="${s}" t="inlineStr"><is><t xml:space="preserve">${esc(celda.v)}</t></is></c>`;
        })
        .join("");
      return `<row r="${r + 1}">${celdas}</row>`;
    })
    .join("");
  const cols = (hoja.anchos ?? []).map((w, i) => `<col min="${i + 1}" max="${i + 1}" width="${w}" customWidth="1"/>`).join("");
  const combinar = (hoja.combinar ?? []).length ? `<mergeCells count="${hoja.combinar.length}">${hoja.combinar.map((m) => `<mergeCell ref="${m}"/>`).join("")}</mergeCells>` : "";
  return (
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
    `<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">` +
    (cols ? `<cols>${cols}</cols>` : "") +
    `<sheetData>${filas}</sheetData>${combinar}` +
    `<pageMargins left="0.5" right="0.5" top="0.6" bottom="0.6" header="0.3" footer="0.3"/>` +
    `<pageSetup orientation="landscape" fitToWidth="1" fitToHeight="0"/>` +
    `</worksheet>`
  );
}

function estilosXml(lista) {
  const fuentes = [
    `<font><sz val="11"/><name val="Calibri"/><family val="2"/></font>`,
    `<font><b/><sz val="11"/><name val="Calibri"/><family val="2"/></font>`,
    `<font><b/><sz val="14"/><name val="Calibri"/><family val="2"/></font>`,
    `<font><sz val="9"/><color rgb="FF555555"/><name val="Calibri"/><family val="2"/></font>`,
  ];
  const relleno = (rgb) => `<fill><patternFill patternType="solid"><fgColor rgb="${rgb}"/><bgColor indexed="64"/></patternFill></fill>`;
  const rellenos = [`<fill><patternFill patternType="none"/></fill>`, `<fill><patternFill patternType="gray125"/></fill>`, relleno("FFD9E8E8"), relleno("FFEEF2F2"), relleno("FFF3F3F3")];
  const fino = `<left style="thin"><color rgb="FFB0B7BD"/></left><right style="thin"><color rgb="FFB0B7BD"/></right><top style="thin"><color rgb="FFB0B7BD"/></top><bottom style="thin"><color rgb="FFB0B7BD"/></bottom>`;
  const bordes = [`<border><left/><right/><top/><bottom/><diagonal/></border>`, `<border>${fino}<diagonal/></border>`];
  const xfs = lista
    .map(
      (x) =>
        `<xf numFmtId="${x.formato}" fontId="${x.fuente}" fillId="${x.relleno}" borderId="${x.borde}" xfId="0"` +
        `${x.formato ? ' applyNumberFormat="1"' : ""}${x.fuente ? ' applyFont="1"' : ""}${x.relleno ? ' applyFill="1"' : ""}${x.borde ? ' applyBorder="1"' : ""}` +
        (x.ajustar ? ` applyAlignment="1"><alignment vertical="top" wrapText="1"/></xf>` : "/>")
    )
    .join("");
  return (
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
    `<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">` +
    `<numFmts count="3"><numFmt numFmtId="164" formatCode="#,##0.0"/><numFmt numFmtId="165" formatCode="#,##0.000"/><numFmt numFmtId="166" formatCode="#,##0.0000"/></numFmts>` +
    `<fonts count="${fuentes.length}">${fuentes.join("")}</fonts>` +
    `<fills count="${rellenos.length}">${rellenos.join("")}</fills>` +
    `<borders count="${bordes.length}">${bordes.join("")}</borders>` +
    `<cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>` +
    `<cellXfs count="${lista.length}">${xfs}</cellXfs>` +
    `<cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles>` +
    `</styleSheet>`
  );
}

/** Nombre de hoja válido para Excel: sin : \ / ? * [ ], máximo 31 caracteres. */
const nombreHoja = (s, i) => (String(s || `Hoja ${i + 1}`).replace(/[:\\/?*[\]]/g, " ").slice(0, 31).trim() || `Hoja ${i + 1}`);

export function crearXlsx(hojas) {
  const estilos = registroEstilos();
  const xmlHojas = hojas.map((h) => hojaXml(h, estilos)); // primero las hojas: registran los estilos que usan
  const archivos = [
    {
      nombre: "[Content_Types].xml",
      contenido:
        `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
        `<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">` +
        `<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>` +
        `<Default Extension="xml" ContentType="application/xml"/>` +
        `<Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>` +
        `<Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>` +
        hojas.map((_, i) => `<Override PartName="/xl/worksheets/sheet${i + 1}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>`).join("") +
        `</Types>`,
    },
    {
      nombre: "_rels/.rels",
      contenido:
        `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
        `<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">` +
        `<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/>` +
        `</Relationships>`,
    },
    {
      nombre: "xl/workbook.xml",
      contenido:
        `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
        `<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">` +
        `<sheets>${hojas.map((h, i) => `<sheet name="${esc(nombreHoja(h.nombre, i))}" sheetId="${i + 1}" r:id="rId${i + 1}"/>`).join("")}</sheets>` +
        `</workbook>`,
    },
    {
      nombre: "xl/_rels/workbook.xml.rels",
      contenido:
        `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
        `<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">` +
        hojas.map((_, i) => `<Relationship Id="rId${i + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet${i + 1}.xml"/>`).join("") +
        `<Relationship Id="rId${hojas.length + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>` +
        `</Relationships>`,
    },
    { nombre: "xl/styles.xml", contenido: estilosXml(estilos.lista) },
    ...xmlHojas.map((contenido, i) => ({ nombre: `xl/worksheets/sheet${i + 1}.xml`, contenido })),
  ];
  return crearZip(archivos);
}
