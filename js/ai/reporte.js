// Reporte de escenarios: tablas deterministas construidas a partir de las
// corridas reales de las calculadoras (nunca de texto de la IA), en HTML para
// pantalla/impresion y en Markdown para copiar o descargar.

import { escapeHtml } from "../util/format.js";
import { markdownAHtml } from "./markdown.js";
import { formatearValor } from "./tools.js";

const MAX_FILAS = 200;

const nombreColumna = (c) => (c.unidad ? `${c.etiqueta} (${c.unidad})` : c.etiqueta);

/** Agrupa las corridas exitosas por calculadora y separa entradas variables de constantes. */
export function armarTablas(log) {
  const grupos = new Map();
  const errores = [];
  for (const r of log) {
    if (r.consulta) continue;
    if (r.error) {
      errores.push(r);
      continue;
    }
    if (!grupos.has(r.herramienta)) grupos.set(r.herramienta, { titulo: r.titulo, corridas: [] });
    grupos.get(r.herramienta).corridas.push(r);
  }

  const tablas = [];
  for (const g of grupos.values()) {
    const corridas = g.corridas.slice(0, MAX_FILAS);
    const claves = [];
    const meta = new Map();
    for (const c of corridas) {
      for (const e of c.entradas) {
        if (!meta.has(e.clave)) {
          meta.set(e.clave, e);
          claves.push(e.clave);
        }
      }
    }
    const valorDe = (c, k) => c.entradas.find((e) => e.clave === k)?.valor;
    const multiples = corridas.length > 1;
    const variables = multiples ? claves.filter((k) => new Set(corridas.map((c) => String(valorDe(c, k)))).size > 1) : [];
    const comunes = claves.filter((k) => !variables.includes(k)).map((k) => ({ ...meta.get(k), valor: valorDe(corridas[0], k) }));

    const colsRes = [];
    for (const c of corridas) for (const r of c.resultados) if (!colsRes.some((x) => x.clave === r.clave)) colsRes.push({ clave: r.clave, etiqueta: r.etiqueta, unidad: r.unidad, dec: r.dec });

    tablas.push({
      titulo: g.titulo,
      total: g.corridas.length,
      recortada: g.corridas.length > corridas.length,
      colsVar: variables.map((k) => meta.get(k)),
      comunes,
      colsRes,
      filas: corridas.map((c) => ({
        vars: variables.map((k) => formatearValor(valorDe(c, k))),
        res: colsRes.map((col) => {
          const r = c.resultados.find((x) => x.clave === col.clave);
          return r ? formatearValor(r.valor, r.dec) : "—";
        }),
      })),
      supuestos: [...new Set(g.corridas.flatMap((c) => c.supuestos || []))],
      notas: [...new Set(g.corridas.flatMap((c) => c.notas || []))],
    });
  }
  return { tablas, errores };
}

const textoComunes = (comunes) => comunes.map((e) => `${e.etiqueta}: ${formatearValor(e.valor)}${e.unidad ? ` ${e.unidad}` : ""}`).join(" · ");

/** HTML de la seccion "Calculos ejecutados". `exportable` agrega bordes en linea para pegar en Word/correo. */
export function escenariosHtml(log, { exportable = false } = {}) {
  const { tablas, errores } = armarTablas(log);
  if (!tablas.length && !errores.length) return "";
  const tAttr = exportable ? ' border="1" cellpadding="4" cellspacing="0" style="border-collapse:collapse;font-size:12px"' : "";

  let html = exportable ? "<h2>Cálculos ejecutados</h2>" : '<h2 class="section-title" style="margin-top:0">Cálculos ejecutados</h2>';
  for (const t of tablas) {
    const cab =
      `<th>#</th>` +
      t.colsVar.map((c) => `<th class="num">${escapeHtml(nombreColumna(c))}</th>`).join("") +
      t.colsRes.map((c) => `<th class="num">${escapeHtml(nombreColumna(c))}</th>`).join("");
    const filas = t.filas
      .map((f, i) => `<tr><td>${i + 1}</td>${f.vars.map((v) => `<td class="num">${escapeHtml(v)}</td>`).join("")}${f.res.map((v) => `<td class="num">${escapeHtml(v)}</td>`).join("")}</tr>`)
      .join("");
    html += `<h3>${escapeHtml(t.titulo)} — ${t.total} escenario${t.total === 1 ? "" : "s"}${t.recortada ? ` (se muestran ${MAX_FILAS})` : ""}</h3>`;
    html += `<div class="table-wrap"><table${tAttr}><thead><tr>${cab}</tr></thead><tbody>${filas}</tbody></table></div>`;
    if (t.comunes.length) html += `<p class="comunes"><strong>Datos comunes:</strong> ${escapeHtml(textoComunes(t.comunes))}</p>`;
    if (t.supuestos.length) html += `<p class="comunes"><strong>Supuestos:</strong> ${escapeHtml(t.supuestos.join(" · "))}</p>`;
    if (t.notas.length) html += `<p class="comunes"><strong>Notas:</strong> ${escapeHtml(t.notas.join(" · "))}</p>`;
  }
  if (errores.length) {
    html += `<h3>Cálculos con error (${errores.length})</h3><ul>${errores.slice(0, 20).map((e) => `<li>${escapeHtml(e.titulo)}: ${escapeHtml(e.error)}</li>`).join("")}</ul>`;
  }
  return html;
}

const celdaMd = (s) => String(s).replace(/\|/g, "\\|").replace(/\n/g, " ");

export function escenariosMd(log) {
  const { tablas, errores } = armarTablas(log);
  if (!tablas.length && !errores.length) return "";
  let md = "## Cálculos ejecutados\n\n";
  for (const t of tablas) {
    const cols = ["#", ...t.colsVar.map(nombreColumna), ...t.colsRes.map(nombreColumna)];
    md += `### ${t.titulo} — ${t.total} escenario${t.total === 1 ? "" : "s"}\n\n`;
    md += `| ${cols.map(celdaMd).join(" | ")} |\n|${cols.map(() => "---").join("|")}|\n`;
    md += t.filas.map((f, i) => `| ${[i + 1, ...f.vars, ...f.res].map(celdaMd).join(" | ")} |`).join("\n") + "\n\n";
    if (t.comunes.length) md += `**Datos comunes:** ${textoComunes(t.comunes)}\n\n`;
    if (t.supuestos.length) md += `**Supuestos:** ${t.supuestos.join(" · ")}\n\n`;
    if (t.notas.length) md += `**Notas:** ${t.notas.join(" · ")}\n\n`;
  }
  if (errores.length) md += `### Cálculos con error (${errores.length})\n\n${errores.slice(0, 20).map((e) => `- ${e.titulo}: ${e.error}`).join("\n")}\n\n`;
  return md;
}

export const AVISO_REPORTE =
  "Reporte generado con asistencia de IA. Los valores numéricos provienen de las calculadoras de la aplicación (Herramientas de Ingeniería); " +
  "la interpretación y las recomendaciones deben ser validadas con criterio de ingeniería.";

function encabezadoMd({ fecha, modelo }) {
  return `_${fecha} · Modelo: ${modelo}_\n\n`;
}

/** Reporte completo en Markdown: narrativa de la IA + tablas de escenarios + aviso. */
export function reporteMd({ narrativa, log, fecha, modelo }) {
  return `${narrativa ? `${narrativa.trim()}\n\n` : "# Reporte de escenarios\n\n"}${encabezadoMd({ fecha, modelo })}${escenariosMd(log)}---\n\n_${AVISO_REPORTE}_\n`;
}

/** Igual que reporteMd pero en HTML autocontenido (para pegar en Word/correo). */
export function reporteHtmlExportable({ narrativa, log, fecha, modelo }) {
  return (
    (narrativa ? markdownAHtml(narrativa) : "<h2>Reporte de escenarios</h2>") +
    `<p><em>${escapeHtml(fecha)} · Modelo: ${escapeHtml(modelo)}</em></p>` +
    escenariosHtml(log, { exportable: true }) +
    `<hr><p><em>${escapeHtml(AVISO_REPORTE)}</em></p>`
  );
}
