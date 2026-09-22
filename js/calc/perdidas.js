// Perdidas de potencia por efecto Joule en una linea trifasica, ajustadas
// por factor de carga.
//
// El factor de perdidas usa la forma cuadratica clasica de Buller-Woodrow
// (Fp = 0.3*Fc + 0.7*Fc^2). Hasta 2026-09-22 esta calculadora (y Conductor
// economico, que reutiliza este motor) usaba la forma LINEAL (0.7*Fc + 0.3)
// para replicar el comportamiento de "Calculo de perdidas.pa.yaml" en la app
// original de Power Apps (ya retirada del repo). Se volvio a la cuadratica
// porque la lineal puede dar Fp > Fc, matematicamente imposible para una
// carga real (el limite teorico es Fc^2 <= Fp <= Fc): sobreestimaba las
// perdidas, en un caso real validado hora a hora contra una curva de
// generacion solar, hasta en un 74%. Decision del propietario del negocio
// (el mismo que en su momento pidio la paridad con Power Apps), 2026-09-22.
//
// El resultado `perdidasPct` ya viene en escala de porcentaje (incluye el
// *100 dentro de la formula) — se muestra anteponiendo "%" sin volver a
// multiplicar, igual que hacia Text(Perdidas,"#.00%") en el original.

/**
 * @param {object} p
 * @param {number} p.tensionLineaKv - tension linea-linea (kV)
 * @param {number} p.potenciaActivaMw - potencia activa (MW)
 * @param {number} p.factorPotencia - factor de potencia (cos phi), 0-1
 * @param {number} p.resistenciaOhmKm - resistencia AC del conductor (Ohm/km)
 * @param {number} p.longitudKm - longitud de la linea (km)
 * @param {number} p.factorCarga - factor de carga Fc, 0-1
 */
export function calcularPerdidas(p) {
  const corriente = (p.potenciaActivaMw * 1000) / (p.tensionLineaKv * p.factorPotencia * Math.sqrt(3));
  const potenciaS = p.potenciaActivaMw / p.factorPotencia;
  const potenciaQ = Math.sqrt(potenciaS ** 2 - p.potenciaActivaMw ** 2);
  const factorPerdidas = 0.3 * p.factorCarga + 0.7 * p.factorCarga ** 2;
  const perdidasPct =
    (Math.sqrt(3) * corriente * p.resistenciaOhmKm * p.longitudKm * factorPerdidas * 100) /
    (p.tensionLineaKv * 1000 * p.factorPotencia);

  return { corriente, potenciaS, potenciaQ, perdidasPct, intermedios: { factorPerdidas } };
}
