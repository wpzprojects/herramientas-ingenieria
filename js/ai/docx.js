// Reporte de escenarios como documento de Word editable (.docx), generado en el navegador sin librerias.
// Un .docx es un ZIP de archivos XML (js/util/zip.js). Se usan los MISMOS datos que el PDF: el texto de la IA (Markdown -> HTML ->
// Word) y las tablas de calculos (escenariosHtml). Diseno igual al del PDF: Carta vertical, margenes de 2 cm, encabezado, titulos con
// estilos reales de Word (sirven para el panel de navegacion), «Conclusiones» sombreada, tablas con cabecera que se repite y pie
// «Pagina X de Y».
// crearDocxDocumento (2026-09-26) convierte con el mismo motor un documento de impresion ya armado (el PDF de la
// Valoracion integral): celdas combinadas, colores verde/amarillo/rojo de las celdas y hoja horizontal si hace falta.

import { crearZip } from "../util/zip.js";
import { markdownAHtml } from "./markdown.js";
import { escenariosHtml, fichaHtml, AVISO_REPORTE } from "./reporte.js";

export const MIME_DOCX = "application/vnd.openxmlformats-officedocument.wordprocessingml.document";

const ANCHO_TEXTO = 9972; // twips: Carta (12240) menos 2 x 2 cm (1134)
const NS = 'xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"';

const esc = (s) =>
  String(s)
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");

// ---------------------------------------------------------------- texto en linea

function rPr(f = {}) {
  let x = "";
  if (f.code) x += '<w:rFonts w:ascii="Consolas" w:hAnsi="Consolas" w:cs="Consolas"/>';
  if (f.b) x += "<w:b/>";
  if (f.i) x += "<w:i/>";
  if (f.color) x += `<w:color w:val="${f.color}"/>`;
  if (f.sz) x += `<w:sz w:val="${f.sz}"/><w:szCs w:val="${f.sz}"/>`;
  return x ? `<w:rPr>${x}</w:rPr>` : "";
}

const run = (texto, f) => (texto === "" ? "" : `<w:r>${rPr(f)}<w:t xml:space="preserve">${esc(texto)}</w:t></w:r>`);

/** Nodos HTML en linea (texto, negrita, cursiva, codigo, saltos) -> runs de Word. */
function enLinea(nodos, f = {}, pre = false) {
  let x = "";
  for (const n of nodos) {
    if (n.nodeType === 3) {
      x += run(pre ? n.textContent : n.textContent.replace(/\s+/g, " "), f);
    } else if (n.nodeType === 1) {
      const t = n.tagName;
      if (t === "BR") x += "<w:r><w:br/></w:r>";
      else if (t === "UL" || t === "OL") continue; // las listas anidadas se procesan aparte
      else if (t === "DIV") x += (x ? "<w:r><w:br/></w:r>" : "") + enLinea(n.childNodes, { ...f, sz: f.sz ? f.sz - 2 : 18, color: "555555" }, pre); // subtexto de una celda
      else {
        const g = { ...f };
        if (t === "STRONG" || t === "B") g.b = true;
        if (t === "EM" || t === "I") g.i = true;
        if (t === "CODE") g.code = true;
        x += enLinea(n.childNodes, g, pre);
      }
    }
  }
  return x;
}

// ---------------------------------------------------------------- parrafos

function parrafo(runs, o = {}) {
  let p = "";
  if (o.estilo) p += `<w:pStyle w:val="${o.estilo}"/>`;
  if (o.keepNext) p += "<w:keepNext/>";
  if (o.numId) p += `<w:numPr><w:ilvl w:val="${o.ilvl || 0}"/><w:numId w:val="${o.numId}"/></w:numPr>`;
  const bordes = [];
  if (o.caja) bordes.push('<w:left w:val="single" w:sz="18" w:space="8" w:color="333333"/>');
  else if (o.citar) bordes.push('<w:left w:val="single" w:sz="12" w:space="8" w:color="999999"/>');
  if (o.bordeAbajo) bordes.push(`<w:bottom w:val="single" w:sz="${o.bordeAbajo}" w:space="4" w:color="333333"/>`);
  if (o.recuadro) {
    bordes.length = 0;
    for (const l of ["top", "left", "bottom", "right"]) bordes.push(`<w:${l} w:val="single" w:sz="4" w:space="6" w:color="999999"/>`);
  }
  if (bordes.length) p += `<w:pBdr>${bordes.join("")}</w:pBdr>`;
  const relleno = o.caja ? "F2F2F2" : o.relleno;
  if (relleno) p += `<w:shd w:val="clear" w:color="auto" w:fill="${relleno}"/>`;
  if (o.antes != null || o.despues != null) p += `<w:spacing${o.antes != null ? ` w:before="${o.antes}"` : ""}${o.despues != null ? ` w:after="${o.despues}"` : ""}/>`;
  if (o.caja || o.citar) p += `<w:ind w:left="${o.caja ? 200 : 240}"/>`;
  if (o.jc) p += `<w:jc w:val="${o.jc}"/>`;
  return `<w:p>${p ? `<w:pPr>${p}</w:pPr>` : ""}${runs}</w:p>`;
}

// ---------------------------------------------------------------- tablas

// Relleno de una celda segun su clase (los mismos colores «Bueno» / «Neutral» / «Malo» del Excel)
const RELLENO_CELDA = { "vi-doc-bueno": "C6EFCE", "vi-doc-neutral": "FFEB9C", "vi-doc-malo": "FFC7CE" };
const rellenoDe = (c) => Object.keys(RELLENO_CELDA).find((k) => c.classList.contains(k));

function tabla(nodo, ctx) {
  const ANCHO = ctx.ancho || ANCHO_TEXTO;
  const filas = [...nodo.querySelectorAll("tr")];
  if (!filas.length) return "";
  const ncol = Math.max(...filas.map((f) => [...f.children].reduce((n, c) => n + (Number(c.getAttribute("colspan")) || 1), 0)));
  // ancho de cada columna en proporcion al contenido (con minimo y maximo), para que «Conductor» no quede apretada
  const pesos = Array.from({ length: ncol }, (_, j) => {
    let m = 5;
    filas.forEach((f) => {
      const c = f.children[j];
      if (!c || Number(c.getAttribute("colspan")) > 1) return;
      const t = c.textContent.trim();
      const largo = c.tagName === "TH" ? Math.max(...t.split(/\s+/).map((w) => w.length), 4) : t.length;
      m = Math.max(m, Math.min(largo, 24));
    });
    return m;
  });
  const suma = pesos.reduce((a, b) => a + b, 0);
  const anchos = pesos.map((p) => Math.floor((ANCHO * p) / suma));
  anchos[ncol - 1] += ANCHO - anchos.reduce((a, b) => a + b, 0);

  let x =
    `<w:tbl><w:tblPr><w:tblW w:w="${ANCHO}" w:type="dxa"/>` +
    '<w:tblBorders><w:top w:val="single" w:sz="4" w:space="0" w:color="999999"/><w:left w:val="single" w:sz="4" w:space="0" w:color="999999"/>' +
    '<w:bottom w:val="single" w:sz="4" w:space="0" w:color="999999"/><w:right w:val="single" w:sz="4" w:space="0" w:color="999999"/>' +
    '<w:insideH w:val="single" w:sz="4" w:space="0" w:color="BBBBBB"/><w:insideV w:val="single" w:sz="4" w:space="0" w:color="BBBBBB"/></w:tblBorders>' +
    '<w:tblLayout w:type="fixed"/><w:tblCellMar><w:top w:w="40" w:type="dxa"/><w:left w:w="80" w:type="dxa"/><w:bottom w:w="40" w:type="dxa"/><w:right w:w="80" w:type="dxa"/></w:tblCellMar></w:tblPr>' +
    `<w:tblGrid>${anchos.map((a) => `<w:gridCol w:w="${a}"/>`).join("")}</w:tblGrid>`;

  let par = 0;
  for (const f of filas) {
    const cabecera = [...f.children].some((c) => c.tagName === "TH");
    if (!cabecera) par++;
    x += `<w:tr><w:trPr><w:cantSplit/>${cabecera ? "<w:tblHeader/>" : ""}</w:trPr>`;
    const seccion = f.classList.contains("vi-doc-seccion");
    const negrita = cabecera || seccion || f.classList.contains("vi-doc-total");
    for (let j = 0, k = 0; j < ncol; k++) {
      const c = f.children[k];
      const span = c ? Math.min(Number(c.getAttribute("colspan")) || 1, ncol - j) : 1;
      const ancho = anchos.slice(j, j + span).reduce((a, b) => a + b, 0);
      const clase = c && rellenoDe(c);
      const fondo = clase ? RELLENO_CELDA[clase] : cabecera || seccion ? "E9E9E9" : par % 2 === 0 ? "F6F6F6" : null;
      x += `<w:tc><w:tcPr><w:tcW w:w="${ancho}" w:type="dxa"/>${span > 1 ? `<w:gridSpan w:val="${span}"/>` : ""}${fondo ? `<w:shd w:val="clear" w:color="auto" w:fill="${fondo}"/>` : ""}</w:tcPr>`;
      const derecha = c && c.classList.contains("num");
      x += parrafo(c ? enLinea(c.childNodes, { sz: 17, b: negrita }) : "", { antes: 0, despues: 0, jc: derecha ? "right" : null });
      x += "</w:tc>";
      j += span;
    }
    x += "</w:tr>";
  }
  ctx.hayTabla = true;
  return x + "</w:tbl>" + parrafo("", { antes: 0, despues: 60 }); // Word exige un parrafo despues de una tabla
}

// ---------------------------------------------------------------- bloques

function lista(nodo, nivel, ctx, caja) {
  const ordenada = nodo.tagName === "OL";
  const numId = ordenada ? ++ctx.ultimoNum : 1; // cada lista numerada reinicia en 1; las de vinetas comparten el numId 1
  if (ordenada) ctx.ordenadas.push(numId);
  let x = "";
  for (const li of nodo.children) {
    if (li.tagName !== "LI") continue;
    x += parrafo(enLinea(li.childNodes), { numId, ilvl: Math.min(nivel, 8), caja, despues: 40 });
    for (const sub of li.children) if (sub.tagName === "UL" || sub.tagName === "OL") x += lista(sub, nivel + 1, ctx, caja);
  }
  return x;
}

/** Recorre los nodos de un bloque HTML y devuelve el XML de Word. `mapa` dice que estilo lleva cada titulo (h2…h5). */
function bloques(nodos, mapa, ctx) {
  let x = "";
  for (const n of nodos) {
    if (n.nodeType === 3) {
      if (n.textContent.trim()) x += parrafo(run(n.textContent.trim()), { caja: n._caja });
      continue;
    }
    if (n.nodeType !== 1) continue;
    const t = n.tagName;
    const caja = !!n._caja;
    if (/^H[1-6]$/.test(t)) {
      const estilo = typeof mapa[t] === "function" ? mapa[t](n) : mapa[t] || "Heading3";
      x += parrafo(enLinea(n.childNodes), { estilo, caja });
    } else if (t === "P") {
      const comun = n.classList.contains("comunes");
      x += parrafo(enLinea(n.childNodes, comun ? { sz: 17, color: "555555" } : {}), { caja, despues: comun ? 60 : null });
    } else if (t === "UL" || t === "OL") x += lista(n, 0, ctx, caja);
    else if (t === "BLOCKQUOTE") x += parrafo(enLinea(n.childNodes, { color: "444444" }), { citar: true });
    else if (t === "PRE") {
      for (const linea of n.textContent.replace(/\n$/, "").split("\n")) x += parrafo(run(linea, { code: true, sz: 18 }), { relleno: "F5F5F5", antes: 0, despues: 0 });
      x += parrafo("", { antes: 0, despues: 60 });
    } else if (t === "HR") x += parrafo("", { bordeAbajo: 4, despues: 120 });
    else if (t === "TABLE") x += tabla(n, ctx);
    else x += bloques(n.childNodes, mapa, ctx); // div, section, .table-wrap…
  }
  return x;
}

/** Marca como «caja» el titulo «Conclusiones» y lo que sigue hasta la proxima seccion del mismo nivel o superior. */
function marcarConclusiones(nodos) {
  const arr = [...nodos];
  const i = arr.findIndex((n) => n.nodeType === 1 && /^H[2-4]$/.test(n.tagName) && /^conclusi/i.test(n.textContent.trim()));
  if (i < 0) return;
  const nivel = Number(arr[i].tagName[1]);
  for (let k = i; k < arr.length; k++) {
    if (k > i && arr[k].nodeType === 1 && /^H[1-6]$/.test(arr[k].tagName) && Number(arr[k].tagName[1]) <= nivel) break;
    arr[k]._caja = true;
  }
}

const aNodos = (html) => {
  const t = document.createElement("template");
  t.innerHTML = html;
  return [...t.content.childNodes];
};

// ---------------------------------------------------------------- partes del paquete

const ESTILOS = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:styles ${NS}>
<w:docDefaults><w:rPrDefault><w:rPr><w:rFonts w:ascii="Calibri" w:hAnsi="Calibri" w:eastAsia="Calibri" w:cs="Calibri"/><w:sz w:val="21"/><w:szCs w:val="21"/><w:lang w:val="es-CO" w:eastAsia="es-CO" w:bidi="ar-SA"/></w:rPr></w:rPrDefault>
<w:pPrDefault><w:pPr><w:spacing w:after="120" w:line="276" w:lineRule="auto"/></w:pPr></w:pPrDefault></w:docDefaults>
<w:style w:type="paragraph" w:default="1" w:styleId="Normal"><w:name w:val="Normal"/><w:qFormat/></w:style>
<w:style w:type="paragraph" w:styleId="Title"><w:name w:val="Title"/><w:basedOn w:val="Normal"/><w:next w:val="Normal"/><w:uiPriority w:val="10"/><w:qFormat/><w:pPr><w:keepNext/><w:spacing w:before="0" w:after="160" w:line="240" w:lineRule="auto"/></w:pPr><w:rPr><w:b/><w:color w:val="111111"/><w:sz w:val="36"/><w:szCs w:val="36"/></w:rPr></w:style>
<w:style w:type="paragraph" w:styleId="Heading1"><w:name w:val="heading 1"/><w:basedOn w:val="Normal"/><w:next w:val="Normal"/><w:uiPriority w:val="9"/><w:qFormat/><w:pPr><w:keepNext/><w:keepLines/><w:pBdr><w:bottom w:val="single" w:sz="4" w:space="1" w:color="999999"/></w:pBdr><w:spacing w:before="280" w:after="100" w:line="240" w:lineRule="auto"/><w:outlineLvl w:val="0"/></w:pPr><w:rPr><w:b/><w:color w:val="111111"/><w:sz w:val="26"/><w:szCs w:val="26"/></w:rPr></w:style>
<w:style w:type="paragraph" w:styleId="Heading2"><w:name w:val="heading 2"/><w:basedOn w:val="Normal"/><w:next w:val="Normal"/><w:uiPriority w:val="9"/><w:qFormat/><w:pPr><w:keepNext/><w:keepLines/><w:spacing w:before="200" w:after="80" w:line="240" w:lineRule="auto"/><w:outlineLvl w:val="1"/></w:pPr><w:rPr><w:b/><w:color w:val="222222"/><w:sz w:val="22"/><w:szCs w:val="22"/></w:rPr></w:style>
<w:style w:type="paragraph" w:styleId="Heading3"><w:name w:val="heading 3"/><w:basedOn w:val="Normal"/><w:next w:val="Normal"/><w:uiPriority w:val="9"/><w:qFormat/><w:pPr><w:keepNext/><w:keepLines/><w:spacing w:before="160" w:after="60" w:line="240" w:lineRule="auto"/><w:outlineLvl w:val="2"/></w:pPr><w:rPr><w:b/><w:color w:val="333333"/></w:rPr></w:style>
<w:style w:type="paragraph" w:styleId="Footer"><w:name w:val="footer"/><w:basedOn w:val="Normal"/><w:uiPriority w:val="99"/><w:pPr><w:spacing w:after="0" w:line="240" w:lineRule="auto"/></w:pPr><w:rPr><w:color w:val="666666"/><w:sz w:val="16"/><w:szCs w:val="16"/></w:rPr></w:style>
</w:styles>`;

function numeracion(ordenadas) {
  const nivelesVineta = Array.from({ length: 9 }, (_, i) => `<w:lvl w:ilvl="${i}"><w:start w:val="1"/><w:numFmt w:val="bullet"/><w:lvlText w:val="${i % 2 ? "–" : "•"}"/><w:lvlJc w:val="left"/><w:pPr><w:ind w:left="${360 + 360 * i}" w:hanging="260"/></w:pPr></w:lvl>`).join("");
  const formatos = ["decimal", "lowerLetter", "lowerRoman"];
  const nivelesNum = Array.from({ length: 9 }, (_, i) => `<w:lvl w:ilvl="${i}"><w:start w:val="1"/><w:numFmt w:val="${formatos[i % 3]}"/><w:lvlText w:val="%${i + 1}."/><w:lvlJc w:val="left"/><w:pPr><w:ind w:left="${400 + 360 * i}" w:hanging="360"/></w:pPr></w:lvl>`).join("");
  return (
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<w:numbering ${NS}>` +
    `<w:abstractNum w:abstractNumId="0"><w:multiLevelType w:val="hybridMultilevel"/>${nivelesVineta}</w:abstractNum>` +
    `<w:abstractNum w:abstractNumId="1"><w:multiLevelType w:val="hybridMultilevel"/>${nivelesNum}</w:abstractNum>` +
    '<w:num w:numId="1"><w:abstractNumId w:val="0"/></w:num>' +
    ordenadas.map((id) => `<w:num w:numId="${id}"><w:abstractNumId w:val="1"/><w:lvlOverride w:ilvl="0"><w:startOverride w:val="1"/></w:lvlOverride></w:num>`).join("") +
    "</w:numbering>"
  );
}

const campo = (instr) =>
  `<w:r><w:fldChar w:fldCharType="begin"/></w:r><w:r><w:instrText xml:space="preserve"> ${instr} </w:instrText></w:r><w:r><w:fldChar w:fldCharType="separate"/></w:r><w:r><w:t>1</w:t></w:r><w:r><w:fldChar w:fldCharType="end"/></w:r>`;

const pie = (titulo = "Reporte de escenarios", ancho = ANCHO_TEXTO) =>
  `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<w:ftr ${NS}><w:p><w:pPr><w:pStyle w:val="Footer"/><w:tabs><w:tab w:val="right" w:pos="${ancho}"/></w:tabs></w:pPr>` +
  `${run(`Herramientas de Ingeniería · ${titulo}`)}<w:r><w:tab/></w:r>${run("Página ")}${campo("PAGE")}${run(" de ")}${campo("NUMPAGES")}</w:p></w:ftr>`;

const TIPOS =
  '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">' +
  '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/>' +
  '<Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>' +
  '<Override PartName="/word/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.styles+xml"/>' +
  '<Override PartName="/word/numbering.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.numbering+xml"/>' +
  '<Override PartName="/word/footer1.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.footer+xml"/>' +
  '<Override PartName="/docProps/core.xml" ContentType="application/vnd.openxmlformats-package.core-properties+xml"/></Types>';

const REL_PAQUETE =
  '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' +
  '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/>' +
  '<Relationship Id="rId2" Type="http://schemas.openxmlformats.org/package/2006/relationships/metadata/core-properties" Target="docProps/core.xml"/></Relationships>';

const REL_DOCUMENTO =
  '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' +
  '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>' +
  '<Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/numbering" Target="numbering.xml"/>' +
  '<Relationship Id="rId3" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/footer" Target="footer1.xml"/></Relationships>';

const nucleo = (fecha, titulo = "Reporte de escenarios") =>
  '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<cp:coreProperties xmlns:cp="http://schemas.openxmlformats.org/package/2006/metadata/core-properties" xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:dcterms="http://purl.org/dc/terms/" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance">' +
  `<dc:title>${esc(titulo)}</dc:title><dc:creator>Herramientas de Ingeniería</dc:creator><dcterms:created xsi:type="dcterms:W3CDTF">${fecha.toISOString()}</dcterms:created></cp:coreProperties>`;

// ---------------------------------------------------------------- documento

/**
 * @param {{narrativa:string, log:object[], ficha?:object[], fecha:string, modelo:string, agente:string}} d
 * @returns {Uint8Array} contenido del .docx
 */
export function crearDocx({ narrativa, log, ficha, fecha, modelo, agente }) {
  const ctx = { ultimoNum: 1, ordenadas: [], hayTabla: false };
  const nodosNarrativa = aNodos(narrativa ? markdownAHtml(narrativa) : "");
  marcarConclusiones(nodosNarrativa);

  // «# » de la IA llega como h2 (titulo) y «## » como h3 (secciones): el primer h2 es el Title, el resto Heading1/2/3
  let primero = true;
  const mapaNarrativa = {
    H2: () => (primero ? ((primero = false), "Title") : "Heading1"),
    H3: "Heading1",
    H4: "Heading2",
    H5: "Heading3",
    H1: "Title",
  };
  const mapaEscenarios = { H2: "Heading1", H3: "Heading2", H4: "Heading3" };

  let cuerpo =
    parrafo(run("HERRAMIENTAS DE INGENIERÍA", { sz: 17, color: "666666" }), { keepNext: true, despues: 20 }) +
    (narrativa ? parrafo(run("REPORTE DE ESCENARIOS", { b: true, sz: 19, color: "333333" }), { keepNext: true, despues: 20 }) : parrafo(run("Reporte de escenarios"), { estilo: "Title" })) +
    parrafo(run(`${fecha} · Agente: ${agente} · Modelo: ${modelo}`, { sz: 18, color: "555555" }), { bordeAbajo: 12, despues: 240 });

  cuerpo += bloques(nodosNarrativa, mapaNarrativa, ctx);
  cuerpo += bloques(aNodos(fichaHtml(ficha)), mapaEscenarios, ctx);
  cuerpo += bloques(aNodos(escenariosHtml(log)), mapaEscenarios, ctx);
  cuerpo += parrafo(run(AVISO_REPORTE, { sz: 17, color: "555555" }), { recuadro: true, antes: 360 });

  return empaquetar(cuerpo, ctx, {});
}

/** Arma el paquete .docx (Carta vertical, u horizontal con `apaisado`). */
function empaquetar(cuerpo, ctx, { titulo, apaisado = false }) {
  const pagina = apaisado ? '<w:pgSz w:w="15840" w:h="12240" w:orient="landscape"/>' : '<w:pgSz w:w="12240" w:h="15840"/>';
  const seccion =
    `<w:sectPr><w:footerReference w:type="default" r:id="rId3"/>${pagina}` +
    '<w:pgMar w:top="1134" w:right="1134" w:bottom="1247" w:left="1134" w:header="567" w:footer="567" w:gutter="0"/></w:sectPr>';
  const documento = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<w:document ${NS}><w:body>${cuerpo}${seccion}</w:body></w:document>`;

  return crearZip([
    { nombre: "[Content_Types].xml", contenido: TIPOS },
    { nombre: "_rels/.rels", contenido: REL_PAQUETE },
    { nombre: "docProps/core.xml", contenido: nucleo(new Date(), titulo) },
    { nombre: "word/document.xml", contenido: documento },
    { nombre: "word/_rels/document.xml.rels", contenido: REL_DOCUMENTO },
    { nombre: "word/styles.xml", contenido: ESTILOS },
    { nombre: "word/numbering.xml", contenido: numeracion(ctx.ordenadas) },
    { nombre: "word/footer1.xml", contenido: pie(titulo, ctx.ancho || ANCHO_TEXTO) },
  ]);
}

/**
 * Word a partir de un documento de impresion ya armado (el mismo del PDF): encabezado (.doc-cab), recuadro de
 * conclusion (.vi-doc-conclusion), titulos h3, parrafos, listas y tablas.
 * @param {HTMLElement} doc
 * @param {{titulo:string, apaisado?:boolean}} o
 * @returns {Uint8Array}
 */
export function crearDocxDocumento(doc, { titulo, apaisado = false }) {
  const ctx = { ultimoNum: 1, ordenadas: [], hayTabla: false, ancho: apaisado ? 15840 - 2 * 1134 : ANCHO_TEXTO };
  let cuerpo = "";
  for (const n of doc.children) {
    if (n.classList.contains("doc-cab")) {
      const app = n.querySelector(".doc-app");
      const h1 = n.querySelector("h1");
      const meta = n.querySelector(".doc-meta");
      if (app) cuerpo += parrafo(run(app.textContent.trim().toUpperCase(), { sz: 17, color: "666666" }), { keepNext: true, despues: 20 });
      if (h1) cuerpo += parrafo(run(h1.textContent.trim()), { estilo: "Title" });
      if (meta) cuerpo += parrafo(run(meta.textContent.trim(), { sz: 18, color: "555555" }), { bordeAbajo: 12, despues: 240 });
    } else if (n.classList.contains("vi-doc-conclusion")) {
      cuerpo += parrafo(enLinea(n.childNodes), { caja: true, despues: 200 });
    } else if (n.tagName === "P") {
      cuerpo += parrafo(enLinea(n.childNodes, { sz: 18, color: "555555" }), { antes: 120 });
    } else {
      cuerpo += bloques([n], { H2: "Heading1", H3: "Heading1", H4: "Heading2" }, ctx);
    }
  }
  return empaquetar(cuerpo, ctx, { titulo, apaisado });
}
