// Radiacion solar sobre un conductor aereo a partir de la posicion del sol (IEEE Std 738, calculo del calor solar):
// declinacion, angulo horario, altura y azimut del sol, flujo solar Qs segun la atmosfera, correccion por
// elevacion (Ksolar) y angulo efectivo de incidencia theta. Entrega Qse y theta para el motor de ampacidad aerea
// (../calc/ampacidad-aerea.js), que no cambia: sigue recibiendo esos dos valores.

const RAD = Math.PI / 180;

// Coeficientes del polinomio Qs(Hc) de IEEE 738 (unidades SI: Hc en grados, Qs en W/m²).
const COEF_QS = {
  Clara: [-42.2391, 63.8044, -1.922, 3.46921e-2, -3.61118e-4, 1.94318e-6, -4.07608e-9],
  Industrial: [53.1821, 14.211, 6.6138e-1, -3.1658e-2, 5.4654e-4, -4.3446e-6, 1.3236e-8],
};

/** Dia del año (1…366) de una fecha "AAAA-MM-DD". */
export function diaDelAnio(fechaIso) {
  const [a, m, d] = String(fechaIso).split("-").map(Number);
  if (!a || !m || !d) return NaN;
  return Math.round((Date.UTC(a, m - 1, d) - Date.UTC(a, 0, 0)) / 86400000);
}

/**
 * @param {object} p
 * @param {number} p.latitudDeg - latitud (°, positiva al norte)
 * @param {number} p.diaAnio - dia del año (1…365)
 * @param {number} p.horaSolar - hora solar (h, 12 = mediodia solar)
 * @param {number} p.azimutLineaDeg - azimut de la linea (°, 0 = norte-sur, 90 = oriente-occidente)
 * @param {"Clara"|"Industrial"} p.atmosfera
 * @param {number} p.elevacionM - elevacion sobre el nivel del mar (m)
 */
export function calcularRadiacionSolar(p) {
  const lat = p.latitudDeg * RAD;
  const declinacionDeg = 23.46 * Math.sin(((284 + p.diaAnio) / 365) * 360 * RAD);
  const d = declinacionDeg * RAD;
  const anguloHorarioDeg = (p.horaSolar - 12) * 15;
  const w = anguloHorarioDeg * RAD;

  const senHc = Math.cos(lat) * Math.cos(d) * Math.cos(w) + Math.sin(lat) * Math.sin(d);
  const alturaSolDeg = Math.asin(Math.max(-1, Math.min(1, senHc))) / RAD;

  // Azimut del sol medido desde el norte en sentido horario. IEEE 738 lo da como C + arctan(chi), con
  // chi = sen(w) / (sen(Lat)·cos(w) − cos(Lat)·tan(d)) y la constante C segun el cuadrante; atan2 da lo mismo
  // sin la tabla y sin dividir por cero cuando el denominador se anula.
  const azimutSolDeg = (Math.atan2(Math.sin(w), Math.sin(lat) * Math.cos(w) - Math.cos(lat) * Math.tan(d)) / RAD + 180 + 360) % 360;

  const c = COEF_QS[p.atmosfera] || COEF_QS.Clara;
  const qsMar = alturaSolDeg > 0 ? Math.max(0, c.reduce((s, k, i) => s + k * alturaSolDeg ** i, 0)) : 0;
  const kSolar = 1 + 1.148e-4 * p.elevacionM - 1.108e-8 * p.elevacionM ** 2;
  const qseWm2 = qsMar * kSolar;

  const cosTheta = Math.cos(Math.max(0, alturaSolDeg) * RAD) * Math.cos((azimutSolDeg - p.azimutLineaDeg) * RAD);
  const thetaDeg = Math.acos(Math.max(-1, Math.min(1, cosTheta))) / RAD;

  return { qseWm2, thetaDeg, intermedios: { declinacionDeg, anguloHorarioDeg, alturaSolDeg, azimutSolDeg, qsMar, kSolar } };
}

/**
 * Dia del año en que el sol calienta mas el conductor a la hora dada (maximo de Qse·sen θ, que es lo que entra
 * en Qs = α·Qse·sen θ·D). Recorre los 365 dias; en empate se queda con el primero.
 */
export function peorDiaDelAnio(p) {
  let mejor = { diaAnio: 1, valor: -Infinity };
  for (let n = 1; n <= 365; n++) {
    const r = calcularRadiacionSolar({ ...p, diaAnio: n });
    const valor = r.qseWm2 * Math.sin(r.thetaDeg * RAD);
    if (valor > mejor.valor + 1e-9) mejor = { diaAnio: n, valor };
  }
  return mejor.diaAnio;
}

/** Fecha "AAAA-MM-DD" del dia N del año dado. */
export function fechaDeDia(anio, diaAnio) {
  return new Date(Date.UTC(anio, 0, diaAnio)).toISOString().slice(0, 10);
}
