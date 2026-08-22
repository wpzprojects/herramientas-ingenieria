// Motor generico de conversion de unidades (factor + offset), con
// resolucion directa o inversa cuando solo existe la fila contraria en la
// tabla. Transcripcion literal de la logica de
// "Pantalla_Conversion_Unidadades.pa.yaml" (OnSelect de btnConvertir).

/**
 * @param {Array} tabla - filas de data/factores-conversion.json
 * @param {object} p
 * @param {string} p.categoria
 * @param {string} p.unidadOrigen
 * @param {string} p.unidadDestino
 * @param {number} p.valor
 * @returns {number|null} null si no existe conversion directa ni inversa
 */
export function convertirUnidad(tabla, p) {
  const fila = tabla.find(
    (r) => r.categoria === p.categoria && r.unidad_origen === p.unidadOrigen && r.unidad_destino === p.unidadDestino
  );
  if (fila) return p.valor * fila.factor + fila.offset;

  const filaInversa = tabla.find(
    (r) => r.categoria === p.categoria && r.unidad_origen === p.unidadDestino && r.unidad_destino === p.unidadOrigen
  );
  if (filaInversa) return (p.valor - filaInversa.offset) / filaInversa.factor;

  return null;
}
