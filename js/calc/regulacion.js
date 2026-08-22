// Caida de tension (regulacion) en una linea trifasica de distribucion, a
// partir de la resistencia e impedancia efectiva del conductor, incluido
// el calculo de la reactancia inductiva por geometria de fases.
// Transcripcion literal de "Calculo de regulacion.pa.yaml" (OnSelect de
// Boton_Calcular_3). Cada paso estaba envuelto en IfError(...,0) en el
// original -- se replica ese mismo comportamiento por paso.
//
// El resultado `caidaTensionPct` ya viene multiplicado por 100 (igual que
// Caida_Tension*100 en el original) y se muestra anteponiendo "%" sin
// volver a escalar.

const safe = (fn) => {
  try {
    const v = fn();
    return Number.isFinite(v) ? v : 0;
  } catch {
    return 0;
  }
};

/**
 * @param {object} p
 * @param {number} p.tensionLineaKv - tension linea-linea (kV)
 * @param {number} p.potenciaActivaMw - potencia activa (MW)
 * @param {number} p.factorPotencia - factor de potencia (cos phi), 0-1
 * @param {number} p.longitudKm - longitud de la linea (km)
 * @param {number} p.resistenciaOhmKm - resistencia AC del conductor (Ohm/km)
 * @param {number} p.rmgM - radio medio geometrico (m)
 * @param {number} p.dabM - distancia fases A-B (m)
 * @param {number} p.dacM - distancia fases A-C (m)
 * @param {number} p.dbcM - distancia fases B-C (m)
 */
export function calcularRegulacion(p) {
  const corriente = safe(() => (p.potenciaActivaMw * 1000) / (p.tensionLineaKv * p.factorPotencia * Math.sqrt(3)));
  const potenciaS = safe(() => p.potenciaActivaMw / p.factorPotencia);
  const potenciaQ = safe(() => Math.sqrt(potenciaS ** 2 - p.potenciaActivaMw ** 2));

  const reactanciaInductiva = safe(
    () => 0.0754 * Math.log(Math.cbrt(p.dabM * p.dacM * p.dbcM) / p.rmgM)
  );
  const impedanciaEfectiva = safe(
    () => p.resistenciaOhmKm * p.factorPotencia + reactanciaInductiva * Math.sin(Math.acos(p.factorPotencia))
  );
  const factorDeRegulacion = safe(
    () => p.resistenciaOhmKm + reactanciaInductiva * Math.tan(Math.acos(p.factorPotencia))
  );
  const constanteRegulacion = safe(() => factorDeRegulacion / (10 * p.tensionLineaKv ** 2));
  const caidaTension = safe(
    () => (Math.sqrt(3) * corriente * impedanciaEfectiva * p.longitudKm) / (p.tensionLineaKv * 1000)
  );

  return {
    corriente,
    potenciaS,
    potenciaQ,
    reactanciaInductiva,
    impedanciaEfectiva,
    constanteRegulacion,
    caidaTensionPct: caidaTension * 100,
  };
}
