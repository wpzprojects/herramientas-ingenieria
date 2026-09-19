// Conversion de unidades del modo «Habilitar todas las conversiones» (pantalla Conversion de unidades). Sin DOM.
// Cada categoria de data/unidades.json tiene una unidad base; cada unidad trae su factor a la base y (solo temperaturas) un desfase:
//     base = valor * factor + offset        destino = (base - offset_destino) / factor_destino
// asi TODA unidad se convierte a TODA otra de su categoria con factores exactos. El motor de pares (./unidades.js) no se toca: lo
// siguen usando el modo normal de la pantalla y la herramienta de la IA.

/** valor -> valor, o null si la categoria o alguna unidad no existe. */
export function convertirBase(catalogo, categoria, origen, destino, valor) {
  const cat = catalogo.categorias.find((c) => c.clave === categoria);
  const uo = cat?.unidades.find((u) => u.codigo === origen);
  const ud = cat?.unidades.find((u) => u.codigo === destino);
  if (!uo || !ud || !Number.isFinite(valor)) return null;
  return ((valor * uo.factor + uo.offset) - ud.offset) / ud.factor;
}

// ---------------------------------------------------------------------------------------------------------------------------
// Calibre de conductor: AWG (norma ASTM B258) y kcmil <-> seccion en mm² y diametro en mm.
//   diametro AWG n [mm] = 0.127 · 92^((36 − n)/39)      (n = 0 es 1/0, −1 es 2/0, −2 es 3/0, −3 es 4/0)
//   area = π/4 · d²                                       1 kcmil = 0.506707479 mm²
// ---------------------------------------------------------------------------------------------------------------------------

const MM2_POR_KCMIL = (Math.PI / 4) * 0.0254 ** 2 * 1000; // 1 cmil = área de un círculo de 0.001 in de diámetro; 1 kcmil = 1000 cmil

/** Calibres comerciales, de menor a mayor seccion. */
export const CALIBRES = [
  ...[18, 16, 14, 12, 10, 8, 6, 4, 3, 2, 1].map((n) => ({ codigo: `${n} AWG`, tipo: "awg", n })),
  ...[0, -1, -2, -3].map((n) => ({ codigo: `${1 - n}/0 AWG`, tipo: "awg", n })),
  ...[250, 300, 350, 400, 500, 600, 750, 1000].map((k) => ({ codigo: `${k} kcmil`, tipo: "kcmil", kcmil: k })),
];

/** {codigo, diametroMm, areaMm2, kcmil} de un calibre de la lista. */
export function datosCalibre(codigo) {
  const c = CALIBRES.find((x) => x.codigo === codigo);
  if (!c) return null;
  if (c.tipo === "kcmil") {
    const area = c.kcmil * MM2_POR_KCMIL;
    return { codigo, diametroMm: Math.sqrt((4 * area) / Math.PI), areaMm2: area, kcmil: c.kcmil };
  }
  const d = 0.127 * 92 ** ((36 - c.n) / 39);
  const area = (Math.PI / 4) * d * d;
  return { codigo, diametroMm: d, areaMm2: area, kcmil: area / MM2_POR_KCMIL };
}

/** Calibre comercial mas cercano (en seccion) a un area en mm². Dice si es exacto (<0.5 %) y el anterior/siguiente. */
export function calibrePorArea(areaMm2) {
  if (!(areaMm2 > 0)) return null;
  const datos = CALIBRES.map((c) => datosCalibre(c.codigo));
  let mejor = 0;
  datos.forEach((d, i) => {
    if (Math.abs(Math.log(d.areaMm2 / areaMm2)) < Math.abs(Math.log(datos[mejor].areaMm2 / areaMm2))) mejor = i;
  });
  const d = datos[mejor];
  return { ...d, diferenciaPct: ((d.areaMm2 - areaMm2) / areaMm2) * 100, exacto: Math.abs(d.areaMm2 / areaMm2 - 1) < 0.005 };
}
