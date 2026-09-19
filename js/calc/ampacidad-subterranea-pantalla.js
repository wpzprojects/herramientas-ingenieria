// Corriente circulante y tension inducida en la pantalla de un cable subterraneo monopolar, a partir de la ampacidad ya
// calculada (idea tomada de la «Calculadora Normativa»). Sin DOM. Usa los mismos datos de cable y las mismas formulas de la
// reactancia mutua y de la resistencia de la pantalla que el motor (./ampacidad-subterranea.js), que no se toca.
//  - Pantallas a tierra en AMBOS EXTREMOS (circuito cerrado): circula corriente por la pantalla.
//  - UNIPUNTUAL o CROSS-BONDING: no circula corriente; queda una tension inducida a circuito abierto (V por km de cable).
// En cables tripolares no aplica (la pantalla es comun a las tres fases).

/**
 * @param {object} p - los mismos datos que recibe calcularAmpacidadSubterranea
 * @param {number} ampacidadA - ampacidad calculada (A)
 * @returns {null | {tipo:"circulante"|"inducida", xmOhmM:number, rsOpOhmM:number, corrienteA?:number, tensionVKm?:number}}
 */
export function calcularPantalla(p, ampacidadA) {
  if (p.tipoCable === "Tripolar") return null;
  const cable = p.cable;
  const omega = 2 * Math.PI * p.frecuenciaHz;
  const rs =
    p.tipoPantalla === "Hilos"
      ? cable.rs_ohm_m
      : 0.000000017241 / ((p.nivelAislamientoKv === 15 ? 0.000127 : 0.000203) * (Math.PI * cable.ds_m * 0.88));
  const rsOpOhmM = rs * (1 + cable.alpha20 * (p.tempMaxC - 20));
  const xmOhmM = 2 * omega * 1e-7 * Math.log((2 * p.separacionFasesM) / cable.ds_m);
  if (p.puestaTierra === "Ambos Extremos") {
    return { tipo: "circulante", xmOhmM, rsOpOhmM, corrienteA: (ampacidadA * xmOhmM) / Math.sqrt(rsOpOhmM ** 2 + xmOhmM ** 2) };
  }
  return { tipo: "inducida", xmOhmM, rsOpOhmM, tensionVKm: ampacidadA * xmOhmM * 1000 };
}
