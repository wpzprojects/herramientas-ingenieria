// Pérdidas de un circuito de uno o varios tramos.
// NO reemplaza a perdidas.js (transcripcion literal de la app original): lo usa tramo por tramo.
// Es logica de la pantalla de Pérdidas, sin DOM, para poder probarla aparte. El dato de partida y la sugerencia de
// calibre son comunes con Regulacion y viven en circuito.js (aqui se reexportan).
//
// Varios tramos: la corriente, la potencia aparente y la reactiva dependen solo de P, V y FP (no de R ni de L),
// asi que son las mismas para todos los tramos (se asume la misma corriente a lo largo del circuito, sin cargas
// intermedias). El % de pérdidas total es la suma del % de cada tramo.

import { calcularPerdidas } from "./perdidas.js";
import { clasificarPorUmbrales } from "./circuito.js";

export { potenciaActivaMw, sugerirCalibre } from "./circuito.js";

// Referencias de diseño (NO son un limite normativo): hasta 1 % es optimo y hasta 3 % se considera aceptable.
export const UMBRAL_OPTIMO_PCT = 1;
export const UMBRAL_ACEPTABLE_PCT = 3;

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

/** «Óptimo» hasta 1 %, «Aceptable» hasta 3 % y «Elevado» por encima. */
export function clasificarPerdidas(pct) {
  return clasificarPorUmbrales(pct, UMBRAL_OPTIMO_PCT, UMBRAL_ACEPTABLE_PCT);
}
