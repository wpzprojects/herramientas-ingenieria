// Corriente de falla a soportar: area minima requerida y sugerencia de calibre para el calculo de cortocircuito, sin DOM.
// Se apoya en el motor original (./cortocircuito.js), que no se toca: la capacidad de un conductor es proporcional a su area,
// asi que el area minima sale de dividir la corriente a soportar entre la capacidad de 1 mm² (misma formula despejada).

import { calcularCortocircuito } from "./cortocircuito.js";
import { sugerirCalibre } from "./circuito.js";

/**
 * Area minima (mm²) cuya capacidad de cortocircuito iguala la corriente a soportar.
 * @param {number} objetivoKa - corriente de falla a soportar (kA)
 * @param {{material:string, tempOperacionC:number, tempFallaC:number, tiempoS:number}} p - condiciones (sin area)
 */
export function areaMinimaMm2(objetivoKa, p) {
  return objetivoKa / calcularCortocircuito({ ...p, areaMm2: 1 }).capacidadCcKa;
}

/**
 * Compara los calibres disponibles con la corriente a soportar.
 * @param {{calibre:string, area:number}[]} candidatos - calibres del mismo tipo y material
 * @param {object} p - condiciones (sin area), ver areaMinimaMm2
 * @param {number} objetivoKa
 * @param {string|null} [actual] - calibre elegido por el usuario (siempre aparece en la comparacion)
 * @returns {{areaMinimaMm2:number, sugerido:object|null, mayor:object|null, ventana:object[]}} `sugerido` = el de menor area que
 *   soporta la corriente; `mayor` = el de mayor capacidad (util si ninguno alcanza); `ventana` = los cercanos, con `capacidadCcKa`.
 */
export function compararCalibres(candidatos, p, objetivoKa, actual = null) {
  const conCapacidad = candidatos
    .map((c) => {
      const capacidadCcKa = calcularCortocircuito({ ...p, areaMm2: c.area }).capacidadCcKa;
      return { ...c, capacidadCcKa, faltaKa: objetivoKa - capacidadCcKa }; // faltaKa <= 0 → la soporta
    })
    .sort((a, b) => a.area - b.area);
  const { sugerido, menor, ventana } = sugerirCalibre(conCapacidad, 0, 3, actual, "faltaKa");
  return { areaMinimaMm2: areaMinimaMm2(objetivoKa, p), sugerido, mayor: menor, ventana };
}
