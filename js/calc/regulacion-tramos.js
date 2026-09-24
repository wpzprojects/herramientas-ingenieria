// Regulacion (caida de tension) de un circuito de uno o varios tramos.
// NO reemplaza a regulacion.js (transcripcion literal de la app original): lo usa tramo por tramo. Es logica de la
// pantalla de Regulacion, sin DOM, para poder probarla aparte. El dato de partida y la sugerencia de calibre son comunes
// con Perdidas y viven en circuito.js (aqui se reexportan).
//
// Varios tramos: la corriente, la potencia aparente y la reactiva dependen solo de P, V y FP (no del conductor ni de la
// longitud), asi que son las mismas para todos los tramos (se asume la misma corriente a lo largo del circuito, sin
// cargas intermedias). El % de caida de tension total es la suma del % de cada tramo. Cada tramo tiene su propio
// conductor, su longitud y su propia disposicion de fases.
//
// Varios conductores por fase (haz): la resistencia efectiva es R/N y el radio medio geometrico (RMG) pasa a ser el
// equivalente del haz, que depende de la separacion entre subconductores (calcularRmgHaz).

import { calcularRegulacion } from "./regulacion.js";
import { clasificarPorUmbrales } from "./circuito.js";

export { potenciaActivaMw, sugerirCalibre } from "./circuito.js";

// Referencias de diseño (NO son un limite normativo): hasta 5 % es optimo y hasta 10 % se considera aceptable.
export const UMBRAL_OPTIMO_PCT = 5;
export const UMBRAL_ACEPTABLE_PCT = 10;

/**
 * RMG equivalente (mm) de un haz de N subconductores identicos, equiespaciados en un poligono regular con separacion
 * `separacionM` entre subconductores adyacentes: (N · RMG · r^(N-1))^(1/N), con r = separacion / (2·sen(π/N)).
 * Para N = 2, 3 y 4 se reduce a las formulas conocidas √(RMG·d), ∛(RMG·d²) y 1.091·⁴√(RMG·d³).
 */
export function calcularRmgHaz(rmgMm, n, separacionM) {
  if (n <= 1) return rmgMm;
  const radioMm = (separacionM * 1000) / (2 * Math.sin(Math.PI / n));
  return Math.pow(rmgMm * n * Math.pow(radioMm, n - 1), 1 / n);
}

/**
 * @param {{tensionLineaKv:number, potenciaActivaMw:number, factorPotencia:number}} base
 * @param {{resistenciaOhmKm:number, rmgMm:number, longitudKm:number, dabM:number, dacM:number, dbcM:number,
 *          numConductoresPorFase?:number, separacionHazM?:number}[]} tramos
 *        resistenciaOhmKm y rmgMm son los de UN conductor; con N conductores por fase la resistencia efectiva es R/N y el RMG el del haz.
 * @returns {{corriente:number, potenciaS:number, potenciaQ:number,
 *            tramos:{numero:number, resistenciaEfectivaOhmKm:number, rmgEfectivoMm:number, reactanciaInductiva:number, impedanciaEfectiva:number, constanteRegulacion:number, caidaTensionPct:number}[],
 *            caidaTensionPct:number}}
 */
export function calcularRegulacionTramos(base, tramos) {
  const filas = [];
  let comunes = null;
  tramos.forEach((t, i) => {
    const n = t.numConductoresPorFase ?? 1;
    const resistenciaEfectivaOhmKm = t.resistenciaOhmKm / n;
    const rmgEfectivoMm = calcularRmgHaz(t.rmgMm, n, t.separacionHazM ?? 0);
    const r = calcularRegulacion({
      ...base,
      longitudKm: t.longitudKm,
      resistenciaOhmKm: resistenciaEfectivaOhmKm,
      rmgM: rmgEfectivoMm / 1000,
      dabM: t.dabM,
      dacM: t.dacM,
      dbcM: t.dbcM,
    });
    comunes ??= r;
    filas.push({ numero: i + 1, resistenciaEfectivaOhmKm, rmgEfectivoMm, reactanciaInductiva: r.reactanciaInductiva, impedanciaEfectiva: r.impedanciaEfectiva, constanteRegulacion: r.constanteRegulacion, caidaTensionPct: r.caidaTensionPct });
  });
  return {
    corriente: comunes.corriente,
    potenciaS: comunes.potenciaS,
    potenciaQ: comunes.potenciaQ,
    tramos: filas,
    caidaTensionPct: filas.reduce((s, f) => s + f.caidaTensionPct, 0),
  };
}

/** «Óptimo» hasta 5 %, «Aceptable» hasta 10 % y «Elevado» por encima. */
export function clasificarRegulacion(pct) {
  return clasificarPorUmbrales(pct, UMBRAL_OPTIMO_PCT, UMBRAL_ACEPTABLE_PCT);
}
