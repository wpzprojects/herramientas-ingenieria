// Utilidades de formato equivalentes a Text(valor, "#.00", "en-US") de Power Fx,
// y helpers pequeños de DOM/datos usados por todas las vistas.

// Necesario porque algunos valores de catalogo traen caracteres que rompen
// HTML si se interpolan crudos en un atributo (ej. diametro_nominal de
// tuberias.json trae comillas dobles como simbolo de pulgadas: 1/2").
export function escapeHtml(value) {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

export function fmt(value, decimals = 2) {
  if (value === null || value === undefined || Number.isNaN(value) || !Number.isFinite(value)) return "—";
  return value.toFixed(decimals);
}

// Los "%" en los textos originales de Power Fx son literales (el valor ya
// viene pre-escalado 0-100 desde la formula), no un especificador Excel
// que multiplique de nuevo por 100 - se replica ese mismo comportamiento aqui.
export function fmtPercent(value, decimals = 2) {
  if (value === null || value === undefined || Number.isNaN(value) || !Number.isFinite(value)) return "—";
  return `${value.toFixed(decimals)}%`;
}

export function parseNum(value) {
  if (typeof value === "number") return value;
  if (value === null || value === undefined || value === "") return NaN;
  return parseFloat(String(value).replace(",", "."));
}

export function el(tag, attrs = {}, children = []) {
  const node = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs || {})) {
    if (v === null || v === undefined || v === false) continue;
    if (k === "class") node.className = v;
    else if (k === "html") node.innerHTML = v;
    else if (k.startsWith("on") && typeof v === "function") node.addEventListener(k.slice(2), v);
    else node.setAttribute(k, v === true ? "" : v);
  }
  for (const child of [].concat(children)) {
    if (child === null || child === undefined || child === false) continue;
    node.append(child instanceof Node ? child : document.createTextNode(String(child)));
  }
  return node;
}

export function debounce(fn, delay = 200) {
  let t;
  return (...args) => {
    clearTimeout(t);
    t = setTimeout(() => fn(...args), delay);
  };
}

const dataCache = new Map();
export async function loadData(name) {
  if (dataCache.has(name)) return dataCache.get(name);
  const base = window.__BASE_PATH__ || "";
  const res = await fetch(`${base}data/${name}.json`);
  if (!res.ok) throw new Error(`No se pudo cargar data/${name}.json`);
  const json = await res.json();
  dataCache.set(name, json);
  return json;
}

/**
 * Copia de las filas de un catalogo que no trae `id` (p. ej. tuberias.json), con un `id` = posicion (1, 2, 3...). Sirve para
 * abrir la ficha de detalle (#/catalogos/:familia/:id). No modifica los datos cacheados que usan las calculadoras.
 */
export function conIdPorPosicion(rows) {
  return rows.map((r, i) => ({ ...r, id: String(i + 1) }));
}

/**
 * Valores distintos de `key` en `rows`. Por defecto se ordenan como texto (orden natural, numérico dentro del texto).
 * Con `ordenarPor` (nombre de otro campo numérico de la fila, p. ej. un área) se ordenan por ESE valor en su lugar: lo usan
 * los calibres AWG/kcmil, donde el orden alfabético/natural del texto ("1", "1/0", "2"…) no coincide con el tamaño real del
 * conductor (un AWG más bajo o un kcmil más alto es más grueso). Si a algún valor le falta ese campo, cae al orden de texto.
 */
export function distinct(rows, key, ordenarPor) {
  const valores = [...new Set(rows.map((r) => r[key]).filter((v) => v !== null && v !== undefined && v !== ""))];
  const ordenTexto = (a, b) => String(a).localeCompare(String(b), "es", { numeric: true });
  if (!ordenarPor) return valores.sort(ordenTexto);

  const valorNumerico = new Map();
  for (const r of rows) {
    const k = r[key];
    const v = r[ordenarPor];
    if (k === null || k === undefined || k === "" || v === null || v === undefined || valorNumerico.has(k)) continue;
    valorNumerico.set(k, v);
  }
  return valores.sort((a, b) => {
    const av = valorNumerico.get(a);
    const bv = valorNumerico.get(b);
    return av !== undefined && bv !== undefined ? av - bv : ordenTexto(a, b);
  });
}
