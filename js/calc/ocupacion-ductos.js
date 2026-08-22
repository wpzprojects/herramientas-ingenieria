// Porcentaje de ocupacion de un ducto segun numero/diametro de conductores
// vs. diametro interno del ducto, validado contra los limites NTC-2050
// (Cap. 9, Tabla 1). Transcripcion literal de "Ocupación de ductos.pa.yaml"
// (OnSelect de Boton_Calcular_0). El original usa el literal 3.1416 (no
// Math.PI) para el area del circulo -- se preserva para fidelidad exacta.

const PI_APROX = 3.1416;

const LIMITES_OCUPACION = { 1: 53, 2: 31 }; // 3 o mas conductores -> 40 (ver getLimite)

export function getLimiteOcupacion(numeroConductores) {
  return LIMITES_OCUPACION[numeroConductores] ?? 40;
}

/**
 * @param {object} p
 * @param {number} p.numeroConductores
 * @param {number} p.diametroConductorMm
 * @param {number} p.diametroTuboMm - diametro interno de la tuberia (mm), ya resuelto
 *   (por catalogo T_Tuberias o ingreso manual, segun corresponda en la vista)
 */
export function calcularOcupacionDuctos(p) {
  const areaCable = PI_APROX * (p.diametroConductorMm / 2) ** 2;
  const areaCables = areaCable * p.numeroConductores;
  const areaTubo = PI_APROX * (p.diametroTuboMm / 2) ** 2;
  const ocupacionPct = Number.isFinite(areaCables / areaTubo) ? (areaCables * 100) / areaTubo : 0;

  const limitePct = getLimiteOcupacion(p.numeroConductores);
  const cumple = ocupacionPct <= limitePct;

  // riesgo de atascamiento ("jamming ratio"), solo relevante con exactamente 3 conductores
  let jammingRatio = null;
  let riesgoAtascamiento = false;
  if (p.numeroConductores === 3) {
    jammingRatio = p.diametroTuboMm / p.diametroConductorMm;
    riesgoAtascamiento = jammingRatio > 2.8 && jammingRatio < 3.2;
  }

  return {
    areaCable,
    areaCables,
    areaTubo,
    ocupacionPct,
    disponiblePct: 100 - ocupacionPct,
    limitePct,
    cumple,
    jammingRatio,
    riesgoAtascamiento,
  };
}
