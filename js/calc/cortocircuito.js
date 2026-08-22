// Capacidad de corriente de cortocircuito admisible de un conductor,
// segun el limite termico durante el tiempo de despeje de la falla.
// Transcripcion literal de "Calculo de cortocircuito.pa.yaml"
// (OnSelect de Boton_Calcular_4). Formula: I_CC = A . k1 . sqrt(log10((T2+lambda)/(T1+lambda)) / t) / 1000

const CONSTANTES_MATERIAL = {
  Cobre: { tempRes0: 234, k1: 341 },
  Aluminio: { tempRes0: 228, k1: 224 },
};

/**
 * @param {object} p
 * @param {"Cobre"|"Aluminio"} p.material
 * @param {number} p.areaMm2 - area del conductor (mm2)
 * @param {number} p.tempOperacionC - temperatura de operacion (C)
 * @param {number} p.tempFallaC - temperatura maxima admisible en falla (C)
 * @param {number} p.tiempoS - tiempo de despeje de la falla (s)
 */
export function calcularCortocircuito(p) {
  const { tempRes0, k1 } = CONSTANTES_MATERIAL[p.material];
  const logaritmo = Math.log10((p.tempFallaC + tempRes0) / (p.tempOperacionC + tempRes0));
  const capacidadCcKa = (p.areaMm2 * k1 * Math.sqrt(logaritmo / p.tiempoS)) / 1000;
  return { capacidadCcKa, intermedios: { tempRes0, k1, logaritmo } };
}
