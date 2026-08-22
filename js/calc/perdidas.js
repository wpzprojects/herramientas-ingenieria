// Perdidas de potencia por efecto Joule en una linea trifasica, ajustadas
// por factor de carga. Transcripcion literal de "Calculo de perdidas.pa.yaml"
// (OnSelect de Boton_Calcular_1).
//
// Nota de fidelidad: el factor de perdidas se implementa tal como corre en
// produccion en la app original, (0.7*Fc + 0.3) -- lineal -- y NO con la
// forma cuadratica clasica de Buller-Woodrow (0.7*Fc^2 + 0.3*Fc) que
// aparece documentada en el panel de formulas de esa misma pantalla.
// Decision confirmada explicitamente con el propietario del negocio al
// migrar: se prioriza paridad con el comportamiento real de la app sobre
// la teoria documentada.
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
  const factorPerdidas = 0.7 * p.factorCarga + 0.3;
  const perdidasPct =
    (Math.sqrt(3) * corriente * p.resistenciaOhmKm * p.longitudKm * factorPerdidas * 100) /
    (p.tensionLineaKv * 1000 * p.factorPotencia);

  return { corriente, potenciaS, potenciaQ, perdidasPct, intermedios: { factorPerdidas } };
}
