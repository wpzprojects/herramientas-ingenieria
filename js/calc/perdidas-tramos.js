// Pérdidas de un circuito de uno o varios tramos y resolucion del "dato de partida".
// NO reemplaza a perdidas.js (transcripcion literal de la app original): lo usa tramo por tramo.
// Es logica de la pantalla de Pérdidas, sin DOM, para poder probarla aparte.
//
// Varios tramos: la corriente, la potencia aparente y la reactiva dependen solo de P, V y FP (no de R ni de L),
// asi que son las mismas para todos los tramos (se asume la misma corriente a lo largo del circuito, sin cargas
// intermedias). El % de pérdidas total es la suma del % de cada tramo.

import { calcularPerdidas } from "./perdidas.js";

// Referencias de diseño (NO son un limite normativo): hasta 1 % es optimo y hasta 3 % se considera adecuado.
export const UMBRAL_OPTIMO_PCT = 1;
export const UMBRAL_ADECUADO_PCT = 3;

/**
 * Potencia activa (MW) a partir del dato con el que se parte.
 * @param {object} p
 * @param {"potencia"|"aparente"|"corriente"} p.modo
 * @param {number} [p.potenciaMw] - potencia activa (MW), si modo = "potencia"
 * @param {number} [p.potenciaMva] - potencia aparente (MVA), si modo = "aparente"
 * @param {number} [p.corrienteA] - corriente (A), si modo = "corriente"
 * @param {number} p.tensionKv - tension de linea (kV)
 * @param {number} p.factorPotencia
 */
export function potenciaActivaMw({ modo, potenciaMw, potenciaMva, corrienteA, tensionKv, factorPotencia }) {
  if (modo === "aparente") return potenciaMva * factorPotencia;
  if (modo === "corriente") return (Math.sqrt(3) * tensionKv * corrienteA * factorPotencia) / 1000;
  return potenciaMw;
}

/**
 * @param {{tensionLineaKv:number, potenciaActivaMw:number, factorPotencia:number, factorCarga:number}} base
 * @param {{resistenciaOhmKm:number, longitudKm:number, numConductoresPorFase?:number}[]} tramos
 *        resistenciaOhmKm es la de UN conductor; con N conductores por fase la efectiva es R/N.
 * @returns {{corriente:number, potenciaS:number, potenciaQ:number, factorPerdidas:number,
 *            tramos:{numero:number, resistenciaEfectivaOhmKm:number, perdidasPct:number, perdidasMw:number}[],
 *            perdidasPct:number, perdidasMw:number}}
 */
export function calcularPerdidasTramos(base, tramos) {
  const filas = [];
  let comunes = null;
  tramos.forEach((t, i) => {
    const resistenciaEfectivaOhmKm = t.resistenciaOhmKm / (t.numConductoresPorFase ?? 1);
    const r = calcularPerdidas({ ...base, resistenciaOhmKm: resistenciaEfectivaOhmKm, longitudKm: t.longitudKm });
    comunes ??= r;
    filas.push({ numero: i + 1, resistenciaEfectivaOhmKm, perdidasPct: r.perdidasPct, perdidasMw: (r.perdidasPct / 100) * base.potenciaActivaMw });
  });
  return {
    corriente: comunes.corriente,
    potenciaS: comunes.potenciaS,
    potenciaQ: comunes.potenciaQ,
    factorPerdidas: comunes.intermedios.factorPerdidas,
    tramos: filas,
    perdidasPct: filas.reduce((s, f) => s + f.perdidasPct, 0),
    perdidasMw: filas.reduce((s, f) => s + f.perdidasMw, 0),
  };
}

/** Etiqueta orientativa segun las referencias de diseño. `clase` es la clase de badge de la app ("" = neutra). */
export function clasificarPerdidas(pct) {
  if (pct <= UMBRAL_OPTIMO_PCT) return { clave: "optimo", etiqueta: "Óptimo", clase: "badge-success" };
  if (pct <= UMBRAL_ADECUADO_PCT) return { clave: "adecuado", etiqueta: "Adecuado", clase: "" };
  return { clave: "mayores", etiqueta: "Mayores pérdidas", clase: "badge-warning" };
}

/**
 * Del listado de calibres (ordenado por area ascendente) elige el mas pequeño que no supera el objetivo y una
 * ventana de `margen` calibres a cada lado. Si se indica el calibre `actual` y queda fuera de esa ventana, se agrega
 * (en su lugar por area) para poder compararlo con el sugerido.
 * @param {{calibre:string, area:number, perdidasPct:number}[]} candidatos
 * @returns {{sugerido:object|null, menor:object|null, ventana:object[]}} `menor` = el de menores pérdidas (util si ninguno cumple)
 */
export function sugerirCalibre(candidatos, objetivoPct = UMBRAL_ADECUADO_PCT, margen = 3, actual = null) {
  let idx = candidatos.findIndex((c) => c.perdidasPct <= objetivoPct);
  const sugerido = idx === -1 ? null : candidatos[idx];
  if (idx === -1) idx = candidatos.length;
  const desde = Math.max(0, idx - margen);
  const hasta = Math.min(candidatos.length, idx + margen);
  const ventana = candidatos.filter((c, i) => (i >= desde && i < hasta) || c.calibre === actual);
  const menor = candidatos.reduce((m, c) => (m === null || c.perdidasPct < m.perdidasPct ? c : m), null);
  return { sugerido, menor, ventana };
}
