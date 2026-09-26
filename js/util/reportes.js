// Pestaña «Reportes» de las calculadoras (2026-09-26, pedido del usuario; piloto en Pérdidas): un selector «Tipo de reporte»
// con Texto (TXT, el de siempre), Memoria de cálculo en LaTeX (cada paso: la fórmula, la misma con los valores y el
// resultado; dibujada con KaTeX en letra pequeña y con «Copiar LaTeX»), PDF (se imprime o guarda, como el Asistente técnico)
// y Word (.docx, se descarga de una). PDF y Word llevan: encabezado, datos de entrada, resultados principales, desarrollo
// del cálculo y los gráficos al final. En Word las ecuaciones van como texto matemático (Cambria Math) y los gráficos como
// imágenes PNG dibujadas en tema claro.
//
// Uso: tarjetaResultadosHtml({…, conDocumentos: true}) y, después de pintar, activarReportes(wrap, { titulo, texto, pasos,
// graficos }). `pasos` = [{ titulo, tex, texto }] (tex = LaTeX para KaTeX; texto = la misma ecuación en texto plano Unicode
// para Word); `graficos` = [{ titulo, svg }] (cadenas <svg>); `texto` = el reporte de texto (de él salen los datos de
// entrada y los resultados: líneas «Etiqueta: valor» de sus secciones PARÁMETROS DE ENTRADA y RESULTADOS).

import { escapeHtml } from "./format.js";
import { cargarKatex, ecuacionHtml } from "./katex.js";

const fechaLarga = () => new Date().toLocaleString("es-CO", { dateStyle: "long", timeStyle: "short" });
const fechaArchivo = () => new Date().toISOString().slice(0, 10);
const slug = (t) => t.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");

/** Opciones del selector (las que no traen documento solo ven el texto). */
export function selectorReportesHtml(reporteHtmlTexto, conDocumentos) {
  if (!conDocumentos) return `<div class="report-block">${reporteHtmlTexto}</div>`;
  // Una sola fila: el tipo de reporte y, a su derecha, la acción de ese tipo (en el celular baja a la segunda línea).
  // Los cuatro tipos se ven igual: una hoja blanca con el contenido (pedido del usuario, 2026-09-26).
  return `
          <div class="rep-cab">
            <label for="rep-tipo">Tipo de reporte</label>
            <select id="rep-tipo" class="rep-tipo">
              <option value="txt">Texto (TXT)</option>
              <option value="latex">Memoria de cálculo (LaTeX)</option>
              <option value="pdf">PDF</option>
              <option value="docx">Word (.docx)</option>
            </select>
            <button type="button" class="btn btn-primary rep-accion" data-rep-accion="copiar-txt">Copiar</button>
            <span class="text-muted text-sm" data-rep-msg></span>
          </div>
          <div class="rep-vista rep-hoja" data-rep="txt"><div class="report-block">${reporteHtmlTexto}</div></div>
          <div class="rep-vista rep-hoja" data-rep="latex" hidden><div class="memoria-caja" data-memoria><p class="text-muted text-sm">Cargando la memoria de cálculo…</p></div></div>
          <div class="rep-vista rep-hoja" data-rep="pdf" hidden><div class="rep-previa" data-previa="pdf"></div></div>
          <div class="rep-vista rep-hoja" data-rep="docx" hidden><div class="rep-previa" data-previa="docx"></div></div>`;
}

/** Líneas «Etiqueta: valor» de una sección del reporte de texto (entre su título y el siguiente título en mayúsculas). */
export function seccionDelReporte(texto, titulo) {
  const lineas = texto.split("\n");
  const i = lineas.findIndex((l) => l.trim() === titulo);
  if (i < 0) return [];
  const filas = [];
  for (let k = i + 1; k < lineas.length; k++) {
    const l = lineas[k];
    if (/^[A-ZÁÉÍÓÚÑ ]+:$/.test(l.trim()) && k > i + 1) break; // siguiente sección
    if (/^-+$/.test(l.trim()) || !l.trim()) continue;
    const j = l.indexOf(": ");
    if (j > 0) filas.push([l.slice(0, j).trim(), l.slice(j + 2).trim(), /^\s/.test(l)]);
    else filas.push([l.trim().replace(/:$/, ""), "", false, true]); // subtítulo (p. ej. «Tramo 1:»)
  }
  return filas;
}

/** LaTeX para copiar y pegar en un documento: un párrafo por paso con su ecuación. */
export function memoriaLatex(titulo, pasos) {
  return [`\\section*{Memoria de cálculo: ${titulo}}`, "", ...pasos.flatMap((p) => [`\\paragraph{${p.titulo}}`, `\\[ ${p.tex} \\]`, ""])].join("\n");
}

/** Convierte un <svg> (con las variables de color del tema) en PNG, en TEMA CLARO, para el Word. */
export async function svgAPng(svgTexto, escala = 2) {
  const caja = document.createElement("div");
  caja.className = "vista-tema";
  caja.dataset.vista = "light";
  caja.style.cssText = "position:absolute;left:-10000px;top:0;width:900px;background:var(--bg)";
  caja.innerHTML = svgTexto;
  document.body.append(caja);
  try {
    const svg = caja.querySelector("svg");
    const vb = (svg.getAttribute("viewBox") || "0 0 460 380").split(/\s+/).map(Number);
    const [ancho, alto] = [vb[2], vb[3]];
    svg.setAttribute("width", ancho);
    svg.setAttribute("height", alto);
    // los colores vienen de variables CSS: se fijan los valores ya calculados (el SVG suelto no las conoce)
    const originales = [svg, ...svg.querySelectorAll("*")];
    const clon = svg.cloneNode(true);
    const copias = [clon, ...clon.querySelectorAll("*")];
    originales.forEach((el, i) => {
      const cs = getComputedStyle(el);
      const c = copias[i];
      if (el.namespaceURI !== "http://www.w3.org/2000/svg" || ["defs", "linearGradient", "clipPath", "filter"].includes(el.tagName)) return;
      c.removeAttribute("class");
      const estilo = [`fill:${cs.fill}`, `stroke:${cs.stroke}`, `opacity:${cs.opacity}`];
      if (el.tagName === "stop") estilo.push(`stop-color:${cs.stopColor}`);
      if (el.tagName === "text") estilo.push(`font-family:${cs.fontFamily}`);
      c.setAttribute("style", estilo.join(";"));
    });
    clon.setAttribute("xmlns", "http://www.w3.org/2000/svg");
    const fondo = document.createElementNS("http://www.w3.org/2000/svg", "rect");
    fondo.setAttribute("x", vb[0]);
    fondo.setAttribute("y", vb[1]);
    fondo.setAttribute("width", ancho);
    fondo.setAttribute("height", alto);
    fondo.setAttribute("style", `fill:${getComputedStyle(caja).backgroundColor}`);
    clon.insertBefore(fondo, clon.firstChild);
    const datos = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(new XMLSerializer().serializeToString(clon))}`;
    const img = await new Promise((ok, mal) => {
      const im = new Image();
      im.onload = () => ok(im);
      im.onerror = () => mal(new Error("No se pudo dibujar el gráfico."));
      im.src = datos;
    });
    const lienzo = document.createElement("canvas");
    lienzo.width = Math.round(ancho * escala);
    lienzo.height = Math.round(alto * escala);
    lienzo.getContext("2d").drawImage(img, 0, 0, lienzo.width, lienzo.height);
    return { png: lienzo.toDataURL("image/png"), ancho, alto };
  } finally {
    caja.remove();
  }
}

/** Documento (para imprimir o convertir a Word). `paraWord`: ecuaciones como texto e imágenes PNG en vez de SVG. */
export async function documento({ titulo, texto, pasos, graficos }, { paraWord = false } = {}) {
  const doc = document.createElement("div");
  doc.id = "doc-impresion";
  doc.className = "doc-impresion doc-calculo";
  const tabla = (filas) =>
    `<table class="doc-datos"><tbody>${filas
      .map(([k, v, sangria, sub]) => (sub ? `<tr class="doc-sub"><td colspan="2">${escapeHtml(k)}</td></tr>` : `<tr><td>${sangria ? "&nbsp;&nbsp;" : ""}${escapeHtml(k)}</td><td>${escapeHtml(v)}</td></tr>`))
      .join("")}</tbody></table>`;
  let desarrollo = "";
  if (paraWord) {
    desarrollo = pasos.map((p) => `<h4>${escapeHtml(p.titulo)}</h4><p class="ecuacion">${escapeHtml(p.texto)}</p>`).join("");
  } else {
    let katex = null;
    try {
      katex = await cargarKatex();
    } catch {
      /* sin KaTeX: el texto plano */
    }
    desarrollo = pasos.map((p) => `<div class="doc-paso"><div class="doc-paso-titulo">${escapeHtml(p.titulo)}</div>${katex ? `<div class="doc-ecuacion">${ecuacionHtml(katex, p.tex)}</div>` : `<p class="ecuacion">${escapeHtml(p.texto)}</p>`}</div>`).join("");
  }
  let figuras = "";
  for (const g of graficos) {
    if (paraWord) {
      try {
        const im = await svgAPng(g.svg);
        figuras += `<h4>${escapeHtml(g.titulo)}</h4><div><img src="${im.png}" data-ancho="${im.ancho}" data-alto="${im.alto}" alt="${escapeHtml(g.titulo)}"></div>`;
      } catch {
        /* un gráfico que no se pudo convertir no impide el documento */
      }
    } else figuras += `<figure class="doc-figura vista-tema" data-vista="light"><figcaption>${escapeHtml(g.titulo)}</figcaption>${g.svg}</figure>`;
  }
  doc.innerHTML =
    `<header class="doc-cab"><div class="doc-app">Herramientas de Ingeniería</div><h1>${escapeHtml(titulo)}</h1><p class="doc-meta">${escapeHtml(fechaLarga())}</p></header>` +
    `<h3>Datos de entrada</h3>${tabla(seccionDelReporte(texto, "PARÁMETROS DE ENTRADA:"))}` +
    `<h3>Resultados</h3>${tabla(seccionDelReporte(texto, "RESULTADOS:"))}` +
    `<h3>Desarrollo del cálculo</h3>${desarrollo}` +
    (figuras ? `<h3>Gráficos</h3>${figuras}` : "");
  return doc;
}

function descargar(nombre, contenido, tipo) {
  const url = URL.createObjectURL(new Blob([contenido], { type: tipo }));
  const a = document.createElement("a");
  a.href = url;
  a.download = nombre;
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/** Activa el selector y las acciones de la pestaña «Reportes». */
export function activarReportes(wrap, datos) {
  const sel = wrap.querySelector(".rep-tipo");
  if (!sel) return;
  const vistas = [...wrap.querySelectorAll(".rep-vista")];
  let memoriaLista = false;
  async function pintarMemoria() {
    if (memoriaLista) return;
    memoriaLista = true;
    const caja = wrap.querySelector("[data-memoria]");
    try {
      const katex = await cargarKatex();
      caja.innerHTML = datos.pasos.map((p) => `<div class="memoria-paso"><div class="memoria-titulo">${escapeHtml(p.titulo)}</div><div class="memoria-ecuacion">${ecuacionHtml(katex, p.tex)}</div></div>`).join("");
    } catch {
      caja.innerHTML = datos.pasos.map((p) => `<div class="memoria-paso"><div class="memoria-titulo">${escapeHtml(p.titulo)}</div><p class="memoria-texto">${escapeHtml(p.texto)}</p></div>`).join("");
    }
  }
  // Vista previa del PDF y del Word: el MISMO documento que se imprime o se descarga, como una hoja blanca
  const previas = {};
  async function pintarPrevia(tipo) {
    if (previas[tipo]) return;
    previas[tipo] = true;
    const caja = wrap.querySelector(`[data-previa="${tipo}"]`);
    caja.innerHTML = `<p class="text-muted text-sm">Preparando la vista previa…</p>`;
    try {
      const doc = await documento(datos, { paraWord: tipo === "docx" });
      doc.removeAttribute("id");
      caja.innerHTML = "";
      caja.append(doc);
    } catch {
      caja.innerHTML = `<p class="text-muted text-sm">No se pudo preparar la vista previa.</p>`;
      previas[tipo] = false;
    }
  }
  // el botón de acción cambia con el tipo de reporte
  const ACCIONES = { txt: ["copiar-txt", "Copiar"], latex: ["copiar-latex", "Copiar LaTeX"], pdf: ["pdf", "Descargar PDF"], docx: ["docx", "Descargar Word"] };
  const botonAccion = wrap.querySelector(".rep-accion");
  sel.addEventListener("change", () => {
    vistas.forEach((v) => (v.hidden = v.dataset.rep !== sel.value));
    [botonAccion.dataset.repAccion, botonAccion.textContent] = ACCIONES[sel.value];
    if (sel.value === "latex") pintarMemoria();
    if (sel.value === "pdf" || sel.value === "docx") pintarPrevia(sel.value);
  });
  wrap.addEventListener("click", async (e) => {
    const b = e.target.closest("[data-rep-accion]");
    if (!b || !wrap.contains(b)) return;
    const accion = b.dataset.repAccion;
    if (accion === "copiar-latex" || accion === "copiar-txt") {
      const msg = wrap.querySelector("[data-rep-msg]");
      try {
        await navigator.clipboard.writeText(accion === "copiar-txt" ? datos.texto : memoriaLatex(datos.titulo, datos.pasos));
        msg.textContent = "¡Copiado!";
      } catch {
        msg.textContent = "No se pudo copiar.";
      }
      setTimeout(() => (msg.textContent = ""), 1800);
    } else if (accion === "pdf") {
      document.getElementById("doc-impresion")?.remove();
      document.body.append(await documento(datos));
      document.body.classList.add("imprimiendo-reporte");
      document.documentElement.classList.add("imprimiendo-reporte");
      window.addEventListener(
        "afterprint",
        () => {
          document.body.classList.remove("imprimiendo-reporte");
          document.documentElement.classList.remove("imprimiendo-reporte");
          document.getElementById("doc-impresion")?.remove();
        },
        { once: true }
      );
      window.print();
    } else if (accion === "docx") {
      b.disabled = true;
      try {
        const { crearDocxDocumento, MIME_DOCX } = await import("../ai/docx.js"); // se carga solo al pedir el Word
        const doc = await documento(datos, { paraWord: true });
        descargar(`${slug(datos.titulo)}-${fechaArchivo()}.docx`, crearDocxDocumento(doc, { titulo: datos.titulo }), MIME_DOCX);
      } finally {
        b.disabled = false;
      }
    }
  });
}
