// Ocupacion de un ducto con uno o varios TIPOS de conductor (p. ej. una terna de un calibre y otra de otro).
// Se apoya en el motor original (./ocupacion-ductos.js), que sigue intacto: cada tipo pasa por el, y aqui solo se suman las
// areas y se aplica el limite NTC-2050 segun el numero TOTAL de conductores dentro del ducto.

import { calcularOcupacionDuctos, getLimiteOcupacion } from "./ocupacion-ductos.js";

export { getLimiteOcupacion };

/**
 * @param {number} diametroTuboMm - diametro interno de la tuberia (mm)
 * @param {{cantidad:number, diametroMm:number}[]} grupos - un elemento por tipo de conductor (cantidad y diametro exterior)
 */
export function calcularOcupacionGrupos(diametroTuboMm, grupos) {
  const porGrupo = grupos.map((g, i) => {
    const r = calcularOcupacionDuctos({ numeroConductores: g.cantidad, diametroConductorMm: g.diametroMm, diametroTuboMm });
    return { numero: i + 1, cantidad: g.cantidad, diametroMm: g.diametroMm, areaCable: r.areaCable, areaTotal: r.areaCables, ocupacionPct: r.ocupacionPct, areaTubo: r.areaTubo };
  });

  const totalConductores = porGrupo.reduce((s, g) => s + g.cantidad, 0);
  const areaCables = porGrupo.reduce((s, g) => s + g.areaTotal, 0);
  const areaTubo = porGrupo[0].areaTubo;
  const ocupacionPct = Number.isFinite(areaCables / areaTubo) ? (areaCables * 100) / areaTubo : 0;
  const limitePct = getLimiteOcupacion(totalConductores);

  // El riesgo de atascamiento se define para una terna de conductores iguales: con exactamente 3 en total y el mismo diametro.
  const mismoDiametro = grupos.every((g) => g.diametroMm === grupos[0].diametroMm);
  const jamming = totalConductores === 3 && mismoDiametro ? calcularOcupacionDuctos({ numeroConductores: 3, diametroConductorMm: grupos[0].diametroMm, diametroTuboMm }) : null;

  return {
    grupos: porGrupo.map(({ areaTubo: _a, ...g }) => g),
    totalConductores,
    areaCables,
    areaTubo,
    ocupacionPct,
    disponiblePct: 100 - ocupacionPct,
    limitePct,
    cumple: ocupacionPct <= limitePct,
    jammingRatio: jamming ? jamming.jammingRatio : null,
    riesgoAtascamiento: jamming ? jamming.riesgoAtascamiento : false,
  };
}
