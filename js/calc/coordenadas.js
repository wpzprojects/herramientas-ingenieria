// Conversion de coordenadas entre WGS84 geograficas y proyecciones
// MAGNA-SIRGAS / UTM, via Transversa de Mercator con series de Kruger
// (orden 6). Transcripcion literal del algoritmo de
// "Pantalla_Conversion_Coordenadas.pa.yaml" (OnVisible + BtnConvertir).
//
// El original simula seno/coseno hiperbolico con (Exp(x)-Exp(-x))/2 y
// (Exp(x)+Exp(-x))/2 porque Power Fx no los tiene nativos; aqui se usan
// Math.sinh/Math.cosh/Math.asinh nativos de JS, matematicamente
// equivalentes (mayor precision numerica, mismo resultado).
//
// OJO con Atan2: Power Fx Atan2(x, y) sigue la convencion de Excel, que
// equivale a atan2(y, x) en JS/Python (orden de argumentos invertido).
// Las 3 llamadas de abajo intercambian el orden respecto al Atan2(...) del
// .pa.yaml original por esa razon (verificado numericamente con un caso de
// ida y vuelta: WGS84 -> proyectada -> WGS84 debe devolver el punto exacto).

export const SISTEMAS = [
  { epsg: 4326, label: "4326 - WGS84 Coordenadas Geográficas", elipsoide: "WGS84", lat0: 0, lon0: 0, k0: 1, FE: 0, FN: 0, esGeo: true },
  { epsg: 3115, label: "3115 - MAGNA-SIRGAS Bogotá Oeste", elipsoide: "GRS80", lat0: 4.59620041666667, lon0: -77.0775079166667, k0: 1, FE: 1000000, FN: 1000000, esGeo: false },
  { epsg: 3116, label: "3116 - MAGNA-SIRGAS Bogotá", elipsoide: "GRS80", lat0: 4.59620041666667, lon0: -74.0775079166667, k0: 1, FE: 1000000, FN: 1000000, esGeo: false },
  { epsg: 3117, label: "3117 - MAGNA-SIRGAS Bogotá Este", elipsoide: "GRS80", lat0: 4.59620041666667, lon0: -71.0775079166667, k0: 1, FE: 1000000, FN: 1000000, esGeo: false },
  { epsg: 9377, label: "9377 - MAGNA-SIRGAS Origen Único Nacional", elipsoide: "GRS80", lat0: 4, lon0: -73, k0: 0.9992, FE: 5000000, FN: 2000000, esGeo: false },
  { epsg: 32618, label: "32618 - WGS84 UTM 18N", elipsoide: "WGS84", lat0: 0, lon0: -75, k0: 0.9996, FE: 500000, FN: 0, esGeo: false },
  { epsg: 32619, label: "32619 - WGS84 UTM 19N", elipsoide: "WGS84", lat0: 0, lon0: -69, k0: 0.9996, FE: 500000, FN: 0, esGeo: false },
];

function ellipsoidParams(a, f) {
  const e = Math.sqrt(f * (2 - f));
  const n = f / (2 - f);
  const A = (a / (1 + n)) * (1 + n ** 2 / 4 + n ** 4 / 64 + n ** 6 / 256);

  const a1 = (1 / 2) * n - (2 / 3) * n ** 2 + (5 / 16) * n ** 3 + (41 / 180) * n ** 4 - (127 / 288) * n ** 5 + (7891 / 37800) * n ** 6;
  const a2 = (13 / 48) * n ** 2 - (3 / 5) * n ** 3 + (557 / 1440) * n ** 4 + (281 / 630) * n ** 5 - (1983433 / 1935360) * n ** 6;
  const a3 = (61 / 240) * n ** 3 - (103 / 140) * n ** 4 + (15061 / 26880) * n ** 5 + (167603 / 181440) * n ** 6;
  const a4 = (49561 / 161280) * n ** 4 - (179 / 168) * n ** 5 + (6601661 / 7257600) * n ** 6;
  const a5 = (34729 / 80640) * n ** 5 - (3418889 / 1995840) * n ** 6;
  const a6 = (212378941 / 319334400) * n ** 6;

  const b1 = (1 / 2) * n - (2 / 3) * n ** 2 + (37 / 96) * n ** 3 - (1 / 360) * n ** 4 - (81 / 512) * n ** 5 + (96199 / 604800) * n ** 6;
  const b2 = (1 / 48) * n ** 2 + (1 / 15) * n ** 3 - (437 / 1440) * n ** 4 + (46 / 105) * n ** 5 - (1118711 / 3870720) * n ** 6;
  const b3 = (17 / 480) * n ** 3 - (37 / 840) * n ** 4 - (209 / 4480) * n ** 5 + (5569 / 90720) * n ** 6;
  const b4 = (4397 / 161280) * n ** 4 - (11 / 504) * n ** 5 - (830251 / 7257600) * n ** 6;
  const b5 = (4583 / 161280) * n ** 5 - (108847 / 3991680) * n ** 6;
  const b6 = (20648693 / 638668800) * n ** 6;

  const d1 = 2 * n - (2 / 3) * n ** 2 - 2 * n ** 3 + (116 / 45) * n ** 4 + (26 / 45) * n ** 5 - (2854 / 675) * n ** 6;
  const d2 = (7 / 3) * n ** 2 - (8 / 5) * n ** 3 - (227 / 45) * n ** 4 + (2704 / 315) * n ** 5 + (2323 / 945) * n ** 6;
  const d3 = (56 / 15) * n ** 3 - (136 / 35) * n ** 4 - (1262 / 105) * n ** 5 + (73814 / 2835) * n ** 6;
  const d4 = (4279 / 630) * n ** 4 - (332 / 35) * n ** 5 - (399572 / 14175) * n ** 6;
  const d5 = (4174 / 315) * n ** 5 - (144838 / 6237) * n ** 6;
  const d6 = (601676 / 22275) * n ** 6;

  return { a, f, e, n, A, aCoef: [a1, a2, a3, a4, a5, a6], bCoef: [b1, b2, b3, b4, b5, b6], dCoef: [d1, d2, d3, d4, d5, d6] };
}

const GRS80 = ellipsoidParams(6378137, 1 / 298.257222101);
const WGS84 = ellipsoidParams(6378137, 1 / 298.257223563);
const paramsFor = (elipsoide) => (elipsoide === "GRS80" ? GRS80 : WGS84);

const sumSeries = (coef, fn) => coef.reduce((acc, ck, i) => acc + ck * fn(i + 1), 0);

/** M0: "northing" del paralelo origen de un sistema (formula compartida por Kruger directo e inverso). */
function northingOrigen({ e, A, aCoef }, k0, phi0) {
  const argT0 = 0.5 * Math.log((1 + Math.sin(phi0)) / (1 - Math.sin(phi0))) - e * 0.5 * Math.log((1 + e * Math.sin(phi0)) / (1 - e * Math.sin(phi0)));
  const t0 = Math.sinh(argT0);
  const xiP0 = Math.atan(t0);
  const xi0 = xiP0 + sumSeries(aCoef, (k) => Math.sin(2 * k * xiP0));
  return k0 * A * xi0;
}

/** Entrada proyectada -> {phi, lambda} en radianes (Kruger inverso). */
function proyectadaALatLon(sistema, xIn, yIn) {
  const ep = paramsFor(sistema.elipsoide);
  const { e, A, bCoef, dCoef } = ep;
  const phi0 = (sistema.lat0 * Math.PI) / 180;
  const lambda0 = (sistema.lon0 * Math.PI) / 180;
  const M0 = northingOrigen(ep, sistema.k0, phi0);

  const xiPt = (yIn - sistema.FN + M0) / (sistema.k0 * A);
  const etaPt = (xIn - sistema.FE) / (sistema.k0 * A);

  const xiPrime = xiPt - sumSeries(bCoef, (k) => Math.sin(2 * k * xiPt) * Math.cosh(2 * k * etaPt));
  const etaPrime = etaPt - sumSeries(bCoef, (k) => Math.cos(2 * k * xiPt) * Math.sinh(2 * k * etaPt));

  const sinhEtaPrime = Math.sinh(etaPrime);
  const chi = Math.atan2(Math.sin(xiPrime), Math.sqrt(sinhEtaPrime ** 2 + Math.cos(xiPrime) ** 2));
  const dLambda = Math.atan2(sinhEtaPrime, Math.cos(xiPrime));

  const phi = chi + sumSeries(dCoef, (k) => Math.sin(2 * k * chi));
  const lambda = lambda0 + dLambda;
  return { phi, lambda };
}

/** {phi, lambda} en radianes -> salida proyectada {x, y} (Kruger directo). */
function latLonAProyectada(sistema, phi, lambda) {
  const ep = paramsFor(sistema.elipsoide);
  const { e, A, aCoef } = ep;
  const phi0 = (sistema.lat0 * Math.PI) / 180;
  const lambda0 = (sistema.lon0 * Math.PI) / 180;
  const dLambda = lambda - lambda0;

  const argT = 0.5 * Math.log((1 + Math.sin(phi)) / (1 - Math.sin(phi))) - e * 0.5 * Math.log((1 + e * Math.sin(phi)) / (1 - e * Math.sin(phi)));
  const t = Math.sinh(argT);
  const xiP = Math.atan2(t, Math.cos(dLambda));
  const etaArg = Math.sin(dLambda) / Math.sqrt(t ** 2 + Math.cos(dLambda) ** 2);
  const etaP = Math.asinh(etaArg);

  const xi = xiP + sumSeries(aCoef, (k) => Math.sin(2 * k * xiP) * Math.cosh(2 * k * etaP));
  const eta = etaP + sumSeries(aCoef, (k) => Math.cos(2 * k * xiP) * Math.sinh(2 * k * etaP));

  const M0 = northingOrigen(ep, sistema.k0, phi0);
  return { x: sistema.FE + sistema.k0 * A * eta, y: sistema.FN + sistema.k0 * A * xi - M0 };
}

/**
 * @param {object} sistemaOrigen - una fila de SISTEMAS
 * @param {object} sistemaDestino - una fila de SISTEMAS
 * @param {number} xIn - Longitud (grados) si origen geografico, o Este (m) si proyectado
 * @param {number} yIn - Latitud (grados) si origen geografico, o Norte (m) si proyectado
 * @returns {{ xOut: number, yOut: number, esGeoDestino: boolean }}
 */
export function convertirCoordenadas(sistemaOrigen, sistemaDestino, xIn, yIn) {
  let phi, lambda;
  if (sistemaOrigen.esGeo) {
    phi = (yIn * Math.PI) / 180;
    lambda = (xIn * Math.PI) / 180;
  } else {
    ({ phi, lambda } = proyectadaALatLon(sistemaOrigen, xIn, yIn));
  }

  if (sistemaDestino.esGeo) {
    return { xOut: (lambda * 180) / Math.PI, yOut: (phi * 180) / Math.PI, esGeoDestino: true };
  }
  const { x, y } = latLonAProyectada(sistemaDestino, phi, lambda);
  return { xOut: x, yOut: y, esGeoDestino: false };
}
