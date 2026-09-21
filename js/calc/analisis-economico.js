// Analisis economico de una linea NUEVA: compara de 2 a 5 opciones de conductor por su COSTO TOTAL ACTUALIZADO
// (inversion inicial + valor presente del costo de las perdidas durante N años). Gana la de menor costo total.
// Sin DOM, para poder probarlo aparte. Las perdidas salen del motor de Pérdidas (perdidas.js), sin modificarlo, asi que
// usan el mismo factor de pérdidas y las mismas formulas que esa pantalla.
//
// Convenciones (las mismas que se muestran en la pestaña «Fórmulas»):
//  - La inversion se paga en el año 0. Las perdidas de cada año se pagan al final de ese año (t = 1…N) y se descuentan
//    con (1 + r)^t. Todo en pesos corrientes: la tasa de descuento es nominal y el precio de la energia sube `escalada` % al año.
//  - La demanda indicada es la del año 1; crece `crecimiento` % cada año. La corriente crece igual y las perdidas, con su cuadrado.
//  - Las perdidas de potencia que da el motor (MW) ya incluyen el factor de pérdidas (Fp), o sea que son la potencia
//    media perdida: energia anual = MW · 1000 · 8760 h (kWh).
//  - No hay valor residual ni costos de operacion y mantenimiento (decision del usuario: no cambian cual opcion gana).

import { calcularPerdidas } from "./perdidas.js";

export const HORAS_ANIO = 8760;

/**
 * @param {object} base
 * @param {number} base.tensionLineaKv
 * @param {number} base.potenciaActivaMw - demanda del año 1 (MW)
 * @param {number} base.factorPotencia
 * @param {number} base.factorCarga
 * @param {number} base.longitudKm
 * @param {number} base.anios - años de analisis (entero >= 1)
 * @param {number} base.tasaDescuentoPct - tasa de descuento nominal (%)
 * @param {number} base.precioKwh - precio de la energia perdida en el año 1 ($/kWh)
 * @param {number} [base.escaladaEnergiaPct=0] - aumento anual del precio de la energia (%)
 * @param {number} [base.crecimientoDemandaPct=0] - aumento anual de la demanda (%)
 * @param {object} opcion
 * @param {number} opcion.resistenciaOhmKm - resistencia AC de UN conductor (Ω/km)
 * @param {number} [opcion.numConductoresPorFase=1]
 * @param {number} opcion.costoConductorKm - precio de UN conductor por km ($/km)
 * @param {number} opcion.costoInstalacionKm - resto de la instalacion por km de linea ($/km)
 */
export function calcularOpcion(base, opcion) {
  const n = opcion.numConductoresPorFase ?? 1;
  const resistenciaEfectivaOhmKm = opcion.resistenciaOhmKm / n;
  const r = calcularPerdidas({
    tensionLineaKv: base.tensionLineaKv,
    potenciaActivaMw: base.potenciaActivaMw,
    factorPotencia: base.factorPotencia,
    factorCarga: base.factorCarga,
    resistenciaOhmKm: resistenciaEfectivaOhmKm,
    longitudKm: base.longitudKm,
  });
  const perdidasMw1 = (r.perdidasPct / 100) * base.potenciaActivaMw;

  const g = 1 + (base.crecimientoDemandaPct ?? 0) / 100;
  const e = 1 + (base.escaladaEnergiaPct ?? 0) / 100;
  const d = 1 + base.tasaDescuentoPct / 100;

  const costoConductores = base.longitudKm * 3 * n * opcion.costoConductorKm;
  const costoInstalacion = base.longitudKm * opcion.costoInstalacionKm;
  const inversion = costoConductores + costoInstalacion;

  const anios = [];
  const acumulado = [inversion]; // valor presente acumulado (indice = año; el 0 es la inversion)
  let costoPerdidasVp = 0;
  for (let t = 1; t <= base.anios; t++) {
    const crecimiento = g ** (t - 1);
    const perdidasMw = perdidasMw1 * crecimiento ** 2;
    const energiaKwh = perdidasMw * 1000 * HORAS_ANIO;
    const precioKwh = base.precioKwh * e ** (t - 1);
    const costo = energiaKwh * precioKwh;
    const valorPresente = costo / d ** t;
    costoPerdidasVp += valorPresente;
    acumulado.push(inversion + costoPerdidasVp);
    anios.push({ anio: t, corrienteA: r.corriente * crecimiento, perdidasMw, energiaKwh, precioKwh, costo, valorPresente });
  }

  return {
    resistenciaEfectivaOhmKm,
    corrienteAnio1: r.corriente,
    corrienteUltimoAnio: r.corriente * g ** (base.anios - 1),
    perdidasPctAnio1: r.perdidasPct,
    perdidasMwAnio1: perdidasMw1,
    energiaKwhAnio1: perdidasMw1 * 1000 * HORAS_ANIO,
    costoConductores,
    costoInstalacion,
    inversion,
    costoPerdidasVp,
    costoTotal: inversion + costoPerdidasVp,
    anios,
    acumulado,
  };
}

/**
 * Compara las opciones. `mejor` = indice de la de menor costo total (la primera si empatan). `base` (de los puntos de equilibrio)
 * = la de menor inversion. Para las demas, `puntoEquilibrio` = primer año en que su costo acumulado (descontado) deja de
 * superar al de la opcion de menor inversion, o null si no lo alcanza dentro del horizonte (o si no invierte mas que ella).
 * @returns {{opciones:object[], mejor:number, indiceBase:number}}
 */
export function compararOpciones(base, opciones) {
  const res = opciones.map((o) => calcularOpcion(base, o));
  const menorIdx = (valor) => res.reduce((m, r, i) => (valor(r) < valor(res[m]) ? i : m), 0);
  const mejor = menorIdx((r) => r.costoTotal);
  const indiceBase = menorIdx((r) => r.inversion);
  const b = res[indiceBase];
  const lista = res.map((r, i) => {
    let puntoEquilibrio = null;
    if (i !== indiceBase && r.inversion > b.inversion) {
      for (let t = 1; t <= base.anios; t++) {
        if (r.acumulado[t] <= b.acumulado[t]) {
          puntoEquilibrio = t;
          break;
        }
      }
    }
    return { ...r, diferenciaVsMejor: r.costoTotal - res[mejor].costoTotal, puntoEquilibrio };
  });
  return { opciones: lista, mejor, indiceBase };
}

/** Variaciones de la tabla de sensibilidad: cada una cambia UN supuesto y el resto queda igual. */
export const ESCENARIOS_SENSIBILIDAD = [
  { clave: "energia+", etiqueta: "Precio de la energía +10 %", aplicar: (b) => ({ ...b, precioKwh: b.precioKwh * 1.1 }) },
  { clave: "energia-", etiqueta: "Precio de la energía −10 %", aplicar: (b) => ({ ...b, precioKwh: b.precioKwh * 0.9 }) },
  { clave: "demanda+", etiqueta: "Demanda +10 %", aplicar: (b) => ({ ...b, potenciaActivaMw: b.potenciaActivaMw * 1.1 }) },
  { clave: "demanda-", etiqueta: "Demanda −10 %", aplicar: (b) => ({ ...b, potenciaActivaMw: b.potenciaActivaMw * 0.9 }) },
  { clave: "tasa+", etiqueta: "Tasa de descuento +2 puntos", aplicar: (b) => ({ ...b, tasaDescuentoPct: b.tasaDescuentoPct + 2 }) },
  { clave: "tasa-", etiqueta: "Tasa de descuento −2 puntos", aplicar: (b) => ({ ...b, tasaDescuentoPct: b.tasaDescuentoPct - 2 }), valido: (b) => b.tasaDescuentoPct - 2 >= 0 },
];

/**
 * Repite el calculo cambiando un supuesto a la vez. Devuelve la fila «Base» y una por escenario, con el costo total de cada
 * opcion y cual gana; `cambia` dice si en algun escenario gana una opcion distinta de la del caso base.
 * @returns {{filas:{clave:string, etiqueta:string, totales:number[], ganador:number}[], cambia:boolean}}
 */
export function sensibilidad(base, opciones) {
  const correr = (clave, etiqueta, b) => {
    const totales = opciones.map((o) => calcularOpcion(b, o).costoTotal);
    return { clave, etiqueta, totales, ganador: totales.reduce((m, v, i) => (v < totales[m] ? i : m), 0) };
  };
  const filas = [correr("base", "Caso base", base)];
  for (const s of ESCENARIOS_SENSIBILIDAD) {
    if (s.valido && !s.valido(base)) continue;
    filas.push(correr(s.clave, s.etiqueta, s.aplicar(base)));
  }
  return { filas, cambia: filas.some((f) => f.ganador !== filas[0].ganador) };
}
