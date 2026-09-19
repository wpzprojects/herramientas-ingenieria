// Piezas de calculo comunes a las pantallas de circuitos de varios tramos (Perdidas, Regulacion), sin DOM:
// el dato de partida, las etiquetas orientativas segun referencias de diseño y la sugerencia de calibre.

/**
 * Potencia activa (MW) a partir del dato con el que se parte.
 * @param {object} p
 * @param {"potencia"|"aparente"|"corriente"} p.modo
 * @param {number} [p.potenciaMw] - potencia activa (MW), si modo = "potencia"
 * @param {number} [p.potenciaMva] - potencia aparente (MVA), si modo = "aparente"
 * @param {number} [p.corrienteA] - corriente (A), si modo = "corriente"
 * @param {number} p.tensionKv - tension de linea (kV)
 * @param {number} p.factorPotencia
 */
export function potenciaActivaMw({ modo, potenciaMw, potenciaMva, corrienteA, tensionKv, factorPotencia }) {
  if (modo === "aparente") return potenciaMva * factorPotencia;
  if (modo === "corriente") return (Math.sqrt(3) * tensionKv * corrienteA * factorPotencia) / 1000;
  return potenciaMw;
}

/**
 * Etiqueta orientativa segun dos referencias de diseño (NO son un limite normativo): hasta `optimo` es «Óptimo», hasta
 * `adecuado` es «Adecuado» y por encima es «Elevado». `clase` es la clase de badge de la app ("" = neutra).
 */
export function clasificarPorUmbrales(pct, optimo, adecuado) {
  if (pct <= optimo) return { clave: "optimo", etiqueta: "Óptimo", clase: "badge-success" };
  if (pct <= adecuado) return { clave: "adecuado", etiqueta: "Adecuado", clase: "" };
  return { clave: "elevado", etiqueta: "Elevado", clase: "badge-warning" };
}

/**
 * Del listado de calibres (ordenado por area ascendente) elige el mas pequeño que no supera el objetivo y una
 * ventana de `margen` calibres a cada lado. Si se indica el calibre `actual` y queda fuera de esa ventana, se agrega
 * (en su lugar por area) para poder compararlo con el sugerido.
 * @param {{calibre:string, area:number}[]} candidatos - cada uno con el valor a comparar en la propiedad `campo`
 * @param {number} objetivo - valor maximo aceptado (%)
 * @param {string} [campo] - propiedad de cada candidato que se compara con el objetivo
 * @returns {{sugerido:object|null, menor:object|null, ventana:object[]}} `menor` = el de menor valor (util si ninguno cumple)
 */
export function sugerirCalibre(candidatos, objetivo, margen = 3, actual = null, campo = "perdidasPct") {
  let idx = candidatos.findIndex((c) => c[campo] <= objetivo);
  const sugerido = idx === -1 ? null : candidatos[idx];
  if (idx === -1) idx = candidatos.length;
  const desde = Math.max(0, idx - margen);
  const hasta = Math.min(candidatos.length, idx + margen);
  const ventana = candidatos.filter((c, i) => (i >= desde && i < hasta) || c.calibre === actual);
  const menor = candidatos.reduce((m, c) => (m === null || c[campo] < m[campo] ? c : m), null);
  return { sugerido, menor, ventana };
}
