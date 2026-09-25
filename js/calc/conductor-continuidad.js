// Calibre del conductor de continuidad de tierra (GCC, "ground continuity conductor" de IEEE 575; ECC en la norma IEC)
// que acompaña a un circuito de cables monopolares con las pantallas a tierra en un solo punto. Se dimensiona por
// cortocircuito con la misma ecuacion adiabatica de la calculadora de Cortocircuito (./cortocircuito.js, sin tocarla),
// despejando el area: el GCC debe llevar la corriente de falla a tierra que regresa por el durante el tiempo de despeje.

import { calcularCortocircuito } from "./cortocircuito.js";

// Calibres comerciales AWG/kcmil con su area nominal (mm²).
export const CALIBRES_GCC = [
  { calibre: "8 AWG", areaMm2: 8.367 },
  { calibre: "6 AWG", areaMm2: 13.3 },
  { calibre: "4 AWG", areaMm2: 21.15 },
  { calibre: "2 AWG", areaMm2: 33.62 },
  { calibre: "1 AWG", areaMm2: 42.41 },
  { calibre: "1/0 AWG", areaMm2: 53.49 },
  { calibre: "2/0 AWG", areaMm2: 67.43 },
  { calibre: "3/0 AWG", areaMm2: 85.01 },
  { calibre: "4/0 AWG", areaMm2: 107.2 },
  { calibre: "250 kcmil", areaMm2: 126.7 },
  { calibre: "300 kcmil", areaMm2: 152.0 },
  { calibre: "350 kcmil", areaMm2: 177.3 },
  { calibre: "400 kcmil", areaMm2: 202.7 },
  { calibre: "500 kcmil", areaMm2: 253.4 },
  { calibre: "600 kcmil", areaMm2: 304.0 },
  { calibre: "750 kcmil", areaMm2: 380.0 },
  { calibre: "1000 kcmil", areaMm2: 506.7 },
];

/**
 * @param {object} p
 * @param {"Cobre"|"Aluminio"} p.material
 * @param {number} p.corrienteKa - corriente de falla a tierra que regresa por el GCC (kA)
 * @param {number} p.tiempoS - tiempo de despeje de la falla (s)
 * @param {number} p.tempInicialC - temperatura del GCC antes de la falla (°C)
 * @param {number} p.tempFinalC - temperatura maxima admisible al final de la falla (°C)
 * @returns {{areaMinimaMm2: number, sugerido: {calibre: string, areaMm2: number}|null, intermedios: object}}
 *   sugerido = el calibre comercial de menor area que la cubre (null si supera 1000 kcmil).
 */
export function dimensionarGcc(p) {
  // La capacidad es proporcional al area: se calcula la de 1 mm² y se despeja.
  const porMm2 = calcularCortocircuito({ material: p.material, areaMm2: 1, tempOperacionC: p.tempInicialC, tempFallaC: p.tempFinalC, tiempoS: p.tiempoS });
  const areaMinimaMm2 = p.corrienteKa / porMm2.capacidadCcKa;
  const sugerido = CALIBRES_GCC.find((c) => c.areaMm2 >= areaMinimaMm2) || null;
  return { areaMinimaMm2, sugerido, intermedios: { ...porMm2.intermedios, kaPorMm2: porMm2.capacidadCcKa } };
}
