// Interfaz comun de resultados de las calculadoras en tarjetas (Perdidas, Regulacion...): tarjeta con las pestañas
// Resultado / Reporte / Fórmulas, reporte de texto con las etiquetas en negrita y panel de fórmulas con KaTeX.

import { escapeHtml } from "./format.js";
import { cargarKatex, ecuacionHtml } from "./katex.js";

/** Linea divisoria del reporte de texto: corta (30 caracteres) para que no se parta en pantallas angostas. */
export const LINEA_REPORTE = "-".repeat(30);

/** Texto del reporte → HTML: las lineas que son etiquetas van en negrita. El texto que se copia no cambia. */
export function reporteHtml(texto, etiquetas) {
  return texto
    .split("\n")
    .map((linea) => (etiquetas.includes(linea) ? `<strong>${escapeHtml(linea)}</strong>` : escapeHtml(linea)))
    .join("\n");
}

/**
 * Tarjeta de resultados con sus tres pestañas.
 * @param {string} o.resultado - HTML de la pestaña Resultado
 * @param {string} o.reporte - HTML del reporte (ver reporteHtml)
 * @param {string} o.formulasPlano - texto plano de respaldo de las fórmulas (se ve mientras carga KaTeX o si no carga)
 */
export function tarjetaResultadosHtml({ resultado, reporte, formulasPlano }) {
  return `
      <div class="card tarjeta-borde">
        <div class="tabs">
          <button type="button" class="tab-btn active" data-tab="resultado">Resultado</button>
          <button type="button" class="tab-btn" data-tab="reporte">Reporte</button>
          <button type="button" class="tab-btn" data-tab="formulas">Fórmulas</button>
        </div>
        <div class="tab-panel" data-panel="resultado">${resultado}</div>
        <div class="tab-panel" data-panel="reporte" hidden>
          <div class="report-block">${reporte}</div>
        </div>
        <div class="tab-panel" data-panel="formulas" hidden>
          <div id="formulas-katex" class="formula-caja" hidden></div>
          <div class="formula-block" id="formulas-plano">${escapeHtml(formulasPlano)}</div>
        </div>
      </div>`;
}

/**
 * Contenido de la subtarjeta de fórmulas: grupos de ecuaciones, «Descripción de las variables» (viñetas con el símbolo
 * dibujado por KaTeX) y «Notas».
 * @param {object} katex
 * @param {{titulo:string, ecuaciones:string[]}[]} o.grupos
 * @param {{tex:string, texto:string}[]} o.etiquetas
 * @param {string} o.nota
 */
export function formulasHtml(katex, { grupos, etiquetas, nota }) {
  return (
    grupos
      .map((g) => `<div class="result-subhead">${escapeHtml(g.titulo)}</div>` + g.ecuaciones.map((tex) => `<div class="formula-katex">${ecuacionHtml(katex, tex)}</div>`).join(""))
      .join("") +
    `<div class="result-subhead">Descripción de las variables</div><ul class="formula-etiquetas">` +
    etiquetas.map((e) => `<li><span class="formula-simbolo">${katex.renderToString(e.tex, { throwOnError: false })}</span><span>${escapeHtml(e.texto)}</span></li>`).join("") +
    `</ul><div class="result-subhead">Notas</div><p class="text-muted text-sm formula-vars">${escapeHtml(nota)}</p>`
  );
}

/**
 * Activa las pestañas de la tarjeta de resultados. KaTeX se carga (y las fórmulas se dibujan) la primera vez que se abre «Fórmulas».
 * @param {HTMLElement} wrap - contenedor de la tarjeta
 * @param {{grupos:object[], etiquetas:object[], nota:string}} formulas
 */
export function activarPestanas(wrap, formulas) {
  let listas = false;

  /** Ancho comun de la columna de simbolos = el del simbolo mas ancho, para que todos los textos queden alineados. */
  function alinearSimbolos() {
    const ul = wrap.querySelector("#formulas-katex .formula-etiquetas");
    if (!ul || !ul.getClientRects().length) return; // si esta oculta no se puede medir: se alinea al abrir la pestaña
    const simbolos = [...ul.querySelectorAll(".formula-simbolo")];
    const medir = () => {
      ul.style.setProperty("--ancho-simbolo", "0px");
      const ancho = Math.max(...simbolos.map((s) => s.getBoundingClientRect().width));
      if (ancho > 0) ul.style.setProperty("--ancho-simbolo", `${Math.ceil(ancho)}px`);
      else ul.style.removeProperty("--ancho-simbolo");
    };
    medir();
    document.fonts?.ready.then(medir); // las fuentes de KaTeX pueden terminar de cargar despues
  }

  async function mostrarFormulas() {
    if (listas) return;
    listas = true;
    try {
      const katex = await cargarKatex();
      const caja = wrap.querySelector("#formulas-katex");
      caja.innerHTML = formulasHtml(katex, formulas);
      caja.hidden = false; // la subtarjeta solo aparece cuando ya hay fórmulas dibujadas; mientras tanto se ve el texto plano
      wrap.querySelector("#formulas-plano").hidden = true;
    } catch {
      listas = false; // sin KaTeX se queda el texto plano; se reintenta la proxima vez que se abra la pestaña
    }
  }

  wrap.querySelectorAll(".tab-btn").forEach((btn) => {
    btn.addEventListener("click", async () => {
      wrap.querySelectorAll(".tab-btn").forEach((b) => b.classList.toggle("active", b === btn));
      wrap.querySelectorAll(".tab-panel").forEach((panel) => {
        panel.hidden = panel.dataset.panel !== btn.dataset.tab;
      });
      if (btn.dataset.tab === "formulas") {
        await mostrarFormulas();
        alinearSimbolos();
      }
    });
  });
}
