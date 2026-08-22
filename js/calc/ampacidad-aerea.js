// Ampacidad de conductores aereos - metodologia IEEE Std 738 (balance
// termico en regimen permanente). Transcripcion literal de las formulas
// de "Calculo de ampacidad aereos.pa.yaml" (OnSelect de btnCalcular_3).
//
// Nota del propio texto de ayuda original: Qse (radiacion solar total) y
// theta (angulo efectivo de incidencia solar) se ingresan manualmente en
// esta version; el calculo de posicion solar (fecha/hora/latitud/azimut)
// de la norma IEEE 738 completa queda fuera de alcance, igual que en la
// app original.

const TBAJO = 25; // punto fijo inferior de interpolacion de resistencia (°C)
const TALTO = 75; // punto fijo superior de interpolacion de resistencia (°C)

const rad = (deg) => (deg * Math.PI) / 180;

/**
 * @param {object} p
 * @param {number} p.diametroMm - diametro del conductor (mm)
 * @param {number} p.rBajoOhmKm - resistencia AC a 25 C (Ohm/km)
 * @param {number} p.rAltoOhmKm - resistencia AC a 75 C (Ohm/km)
 * @param {number} p.epsilon - emisividad (0.23-0.91)
 * @param {number} p.alfa - absortividad (0.23-0.91)
 * @param {number} p.taC - temperatura ambiente (C)
 * @param {number} p.tcC - temperatura maxima admisible del conductor (C)
 * @param {number} p.vwMs - velocidad del viento (m/s)
 * @param {number} p.anguloVientoDeg - angulo viento-conductor phi (grados)
 * @param {number} p.elevacionM - elevacion sobre el nivel del mar He (m)
 * @param {number} p.qseWm2 - radiacion solar total (W/m2)
 * @param {number} p.thetaDeg - angulo efectivo de incidencia solar (grados)
 */
export function calcularAmpacidadAerea(p) {
  const D = p.diametroMm / 1000;
  const Ta = p.taC;
  const Tc = p.tcC;
  const Vw = p.vwMs;
  const phi = p.anguloVientoDeg;
  const He = p.elevacionM;
  const epsilon = p.epsilon;
  const alfa = p.alfa;
  const Qse = p.qseWm2;
  const theta = p.thetaDeg;

  const Tfilm = (Tc + Ta) / 2;
  const rhof = (1.293 - 0.0001525 * He + 0.000000006379 * He ** 2) / (1 + 0.00367 * Tfilm);
  const muf = (0.000001458 * (Tfilm + 273) ** 1.5) / (Tfilm + 383.4);
  const kf = 0.02424 + 0.00007477 * Tfilm - 0.000000004407 * Tfilm ** 2;
  const re = (D * rhof * Vw) / muf;
  const kangle = 1.194 - Math.cos(rad(phi)) + 0.194 * Math.cos(rad(2 * phi)) + 0.368 * Math.sin(rad(2 * phi));

  const qcn = 3.645 * rhof ** 0.5 * D ** 0.75 * (Tc - Ta) ** 1.25;
  const qc1 = kangle * (1.01 + 1.35 * re ** 0.52) * kf * (Tc - Ta);
  const qc2 = kangle * 0.754 * re ** 0.6 * kf * (Tc - Ta);
  const qc = Math.max(qcn, qc1, qc2);

  const qr = 17.8 * D * epsilon * (((Tc + 273) / 100) ** 4 - ((Ta + 273) / 100) ** 4);
  const qs = alfa * Qse * Math.sin(rad(theta)) * D;

  const r = (p.rBajoOhmKm + ((p.rAltoOhmKm - p.rBajoOhmKm) / (TALTO - TBAJO)) * (Tc - TBAJO)) / 1000;

  const ampacidad = Math.sqrt((qc + qr - qs) / r);

  return {
    ampacidad,
    intermedios: { Tfilm, rhof, muf, kf, re, kangle, qcn, qc1, qc2, qc, qr, qs, r },
  };
}
