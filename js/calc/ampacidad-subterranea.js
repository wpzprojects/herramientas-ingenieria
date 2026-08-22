// Ampacidad de cables subterraneos en banco de ductos - metodologia
// IEC 60287-1-1 (resistencia AC con efecto piel/proximidad, perdida
// dielectrica, factor de perdidas en pantalla, resistencias termicas de
// las capas del cable, y resistencia termica externa del suelo con el
// metodo de imagenes de Kennelly para el calentamiento mutuo entre
// circuitos vecinos del banco). Transcripcion literal de
// "Calculo de ampacidad subterraneos.pa.yaml" (OnSelect de btnCalcular_6).
//
// Limitaciones ya declaradas en el panel de formulas del original: no
// distingue formacion en trebol vs. plana (misma formula de proximidad
// para ambas), y solo calcula regimen permanente (no transitorio ni
// secado del suelo).

/**
 * Calcula la geometria de un banco de ductos: hasta 3 columnas por fila,
 * y determina el ducto "activo" (el mas cercano al centro geometrico del
 * banco), que es el que se usa como referencia termica.
 */
function geometriaBanco(numCircuitos, profundidadBancoM, separacionDuctosM) {
  const ductos = [];
  for (let i = 1; i <= numCircuitos; i++) {
    const columna = (i - 1) % 3;
    const fila = Math.floor((i - 1) / 3);
    ductos.push({
      ductoId: i,
      posX: columna * separacionDuctosM,
      profundidad: profundidadBancoM + fila * separacionDuctosM,
    });
  }
  const centroX = ductos.reduce((s, d) => s + d.posX, 0) / ductos.length;
  const centroProfundidad = ductos.reduce((s, d) => s + d.profundidad, 0) / ductos.length;

  let ductoActivo = ductos[0];
  let minDist = Infinity;
  for (const d of ductos) {
    const dist = Math.hypot(d.posX - centroX, d.profundidad - centroProfundidad);
    if (dist < minDist) {
      minDist = dist;
      ductoActivo = d;
    }
  }
  return { ductos, ductoActivo };
}

/**
 * @param {object} p
 * @param {"Monopolar"|"Tripolar"} p.tipoCable
 * @param {object} p.cable - fila de data/construccion-cable-subterraneo.json ya resuelta por lookup
 * @param {"Hilos"|"Cinta"} p.tipoPantalla
 * @param {number} p.nivelAislamientoKv
 * @param {"Unipuntual"|"Ambos Extremos"|"Cross-bonding"} p.puestaTierra
 * @param {number} p.tensionSistemaKv - tension linea-linea
 * @param {number} p.frecuenciaHz
 * @param {number} p.tempMaxC
 * @param {number} p.tempTerrenoC
 * @param {number} p.rhoSueloKmW
 * @param {number} p.uDuctoKmW
 * @param {number} p.separacionFasesM
 * @param {number} p.numCircuitos
 * @param {number} p.profundidadBancoM
 * @param {number} p.separacionDuctosM
 */
export function calcularAmpacidadSubterranea(p) {
  const cable = p.cable;
  const esTripolar = p.tipoCable === "Tripolar";

  const varN = esTripolar ? 1 : 3;
  const varOmega = 2 * Math.PI * p.frecuenciaHz;
  const varU0 = (p.tensionSistemaKv * 1000) / Math.sqrt(3);

  // Paso 2 - resistencia AC del conductor (efecto piel + proximidad)
  const varRprima = cable.r0_ohm_m * (1 + cable.alpha20 * (p.tempMaxC - 20));
  const varXs2 = ((8 * Math.PI * p.frecuenciaHz) / varRprima) * 1e-7;
  const varYs = varXs2 ** 2 / (192 + 0.8 * varXs2 ** 2);
  const varXp2 = ((8 * Math.PI * p.frecuenciaHz) / varRprima) * 1e-7;
  const dsRatio = cable.dc_m / p.separacionFasesM;
  const ypFactor = varXp2 ** 2 / (192 + 0.8 * varXp2 ** 2);
  const varYp = esTripolar ? 0 : ypFactor * dsRatio ** 2 * (0.312 * dsRatio ** 2 + 1.18 / (ypFactor + 0.27));
  const varR = varRprima * (1 + varYs + varYp);

  // Paso 3 - perdida dielectrica
  const varC = (cable.epsilon_r * 1e-9) / (18 * Math.log(cable.ds_m / cable.dc_m));
  const varWd = varOmega * varC * varU0 ** 2 * cable.tan_delta;

  // Paso 3b - Rs efectivo de la pantalla
  let rsEfectivo;
  if (p.tipoPantalla === "Hilos") {
    rsEfectivo = cable.rs_ohm_m;
  } else {
    const tCinta = p.nivelAislamientoKv === 15 ? 0.000127 : 0.000203;
    const wEfectivo = Math.PI * cable.ds_m * 0.88;
    rsEfectivo = 0.000000017241 / (tCinta * wEfectivo);
  }

  // Paso 4 - lambda1 (factor de perdidas en la pantalla)
  let lambda1;
  if (esTripolar) {
    lambda1 = 0.02;
  } else if (p.puestaTierra === "Ambos Extremos") {
    const xm = 2 * varOmega * 1e-7 * Math.log((2 * p.separacionFasesM) / cable.ds_m);
    const rsOp = rsEfectivo * (1 + cable.alpha20 * (p.tempMaxC - 20));
    lambda1 = (rsOp / varR) * (1 / (1 + (rsOp / xm) ** 2)) + 0.01;
  } else {
    lambda1 = 0.02; // Unipuntual o Cross-bonding
  }

  // Paso 5 - resistencias termicas internas (capas del cable)
  const T1 = (cable.rho_aislamiento / (2 * Math.PI)) * Math.log(1 + (2 * cable.t1_m) / cable.dc_m);
  const T2 = (cable.rho_relleno / (2 * Math.PI)) * Math.log(1 + (2 * cable.t2_m) / cable.ds_m);
  const T3 = (cable.rho_chaqueta / (2 * Math.PI)) * Math.log(1 + (2 * cable.t3_m) / cable.de_m);

  // Paso 6 - geometria del banco y resistencia termica externa (imagenes de Kennelly)
  const { ductos, ductoActivo } = geometriaBanco(p.numCircuitos, p.profundidadBancoM, p.separacionDuctosM);
  const rhoSuelo = p.rhoSueloKmW;

  const T4propia = p.uDuctoKmW + (rhoSuelo / (2 * Math.PI)) * Math.log((4 * ductoActivo.profundidad) / cable.de_m);
  const otros = ductos.filter((d) => d.ductoId !== ductoActivo.ductoId);
  const T4mutuo = otros.reduce((sum, d) => {
    const num = Math.hypot(d.posX - ductoActivo.posX, d.profundidad + ductoActivo.profundidad);
    const den = Math.hypot(d.posX - ductoActivo.posX, d.profundidad - ductoActivo.profundidad);
    return sum + (rhoSuelo / (2 * Math.PI)) * Math.log(num / den);
  }, 0);
  const T4 = T4propia + T4mutuo;

  // Paso 7 - ampacidad final
  const deltaTheta = p.tempMaxC - p.tempTerrenoC;
  const numerador = deltaTheta - varWd * (0.5 * T1 + varN * (T2 + T3 + T4));
  const denominador = varR * T1 + varN * varR * (1 + lambda1) * T2 + varN * varR * (1 + lambda1) * (T3 + T4);

  const intermedios = {
    varR, varWd, lambda1, T1, T2, T3, T4, T4propia, T4mutuo,
    deltaTheta, numerador, denominador, ductoActivo, ductos,
  };

  if (numerador <= 0) {
    const err = new Error(
      "Los datos de entrada dan un salto térmico negativo o insuficiente — revisa Δθ y Wd. No se puede calcular una ampacidad válida."
    );
    err.intermedios = intermedios;
    throw err;
  }

  return { ampacidad: Math.sqrt(numerador / denominador), intermedios };
}
