// Renderizador minimo de Markdown -> HTML para las respuestas de la IA.
// Sin dependencias. Seguridad: TODO el texto se escapa antes de insertar
// etiquetas propias, y solo se generan enlaces http(s).
// Soporta: titulos, negrita/cursiva, codigo, listas, tablas, citas, reglas y parrafos.

import { escapeHtml } from "../util/format.js";

function inline(texto) {
  let s = escapeHtml(texto);
  s = s.replace(/`([^`]+)`/g, "<code>$1</code>");
  s = s.replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>");
  s = s.replace(/(^|[^*])\*([^*\s][^*]*)\*(?!\*)/g, "$1<em>$2</em>");
  s = s.replace(/\[([^\]]+)\]\((https?:\/\/[^)\s]+)\)/g, '<a href="$2" target="_blank" rel="noopener noreferrer">$1</a>');
  return s;
}

function celdas(linea) {
  return linea
    .trim()
    .replace(/^\|/, "")
    .replace(/\|$/, "")
    .split("|")
    .map((c) => c.trim());
}

const esSeparadorTabla = (l) => /^\s*\|?\s*:?-{2,}:?\s*(\|\s*:?-{2,}:?\s*)*\|?\s*$/.test(l);

export function markdownAHtml(md) {
  const lineas = String(md ?? "").replace(/\r\n?/g, "\n").split("\n");
  const html = [];
  let i = 0;

  while (i < lineas.length) {
    const linea = lineas[i];

    if (!linea.trim()) {
      i++;
      continue;
    }

    // bloque de codigo
    if (/^```/.test(linea)) {
      const cod = [];
      i++;
      while (i < lineas.length && !/^```/.test(lineas[i])) cod.push(lineas[i++]);
      i++;
      html.push(`<pre><code>${escapeHtml(cod.join("\n"))}</code></pre>`);
      continue;
    }

    // titulos
    const h = linea.match(/^(#{1,4})\s+(.*)$/);
    if (h) {
      const nivel = Math.min(h[1].length + 1, 5); // # -> h2 (el h1 es el de la pagina)
      html.push(`<h${nivel}>${inline(h[2])}</h${nivel}>`);
      i++;
      continue;
    }

    // regla horizontal
    if (/^\s*([-*_])\1{2,}\s*$/.test(linea)) {
      html.push("<hr>");
      i++;
      continue;
    }

    // tabla
    if (linea.includes("|") && i + 1 < lineas.length && esSeparadorTabla(lineas[i + 1])) {
      const cab = celdas(linea);
      i += 2;
      const filas = [];
      while (i < lineas.length && lineas[i].includes("|") && lineas[i].trim()) filas.push(celdas(lineas[i++]));
      html.push(
        `<div class="table-wrap"><table><thead><tr>${cab.map((c) => `<th class="wrap">${inline(c)}</th>`).join("")}</tr></thead><tbody>${filas
          .map((f) => `<tr>${cab.map((_, k) => `<td class="wrap">${inline(f[k] ?? "")}</td>`).join("")}</tr>`)
          .join("")}</tbody></table></div>`
      );
      continue;
    }

    // cita
    if (/^>\s?/.test(linea)) {
      const cita = [];
      while (i < lineas.length && /^>\s?/.test(lineas[i])) cita.push(lineas[i++].replace(/^>\s?/, ""));
      html.push(`<blockquote>${inline(cita.join(" "))}</blockquote>`);
      continue;
    }

    // listas (un nivel de anidacion por sangria)
    if (/^\s*([-*+]|\d+[.)])\s+/.test(linea)) {
      const ordenada = /^\s*\d+[.)]\s+/.test(linea);
      const items = [];
      while (i < lineas.length && /^\s*([-*+]|\d+[.)])\s+/.test(lineas[i])) {
        const m = lineas[i].match(/^(\s*)(?:[-*+]|\d+[.)])\s+(.*)$/);
        items.push({ sangria: m[1].length, texto: m[2] });
        i++;
      }
      html.push(renderLista(items, ordenada));
      continue;
    }

    // parrafo: junta lineas consecutivas
    const parrafo = [];
    while (
      i < lineas.length &&
      lineas[i].trim() &&
      !/^(#{1,4}\s|```|>\s?|\s*([-*+]|\d+[.)])\s+)/.test(lineas[i]) &&
      !(lineas[i].includes("|") && i + 1 < lineas.length && esSeparadorTabla(lineas[i + 1]))
    ) {
      parrafo.push(lineas[i++]);
    }
    html.push(`<p>${inline(parrafo.join(" "))}</p>`);
  }

  return html.join("\n");
}

function renderLista(items, ordenada) {
  const tag = ordenada ? "ol" : "ul";
  let out = `<${tag}>`;
  let k = 0;
  while (k < items.length) {
    const it = items[k];
    let hijos = [];
    let j = k + 1;
    while (j < items.length && items[j].sangria > it.sangria) hijos.push(items[j++]);
    out += `<li>${inline(it.texto)}${hijos.length ? renderLista(hijos, false) : ""}</li>`;
    k = j;
  }
  return out + `</${tag}>`;
}
