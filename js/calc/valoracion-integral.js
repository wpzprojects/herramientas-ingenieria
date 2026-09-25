// Valoración integral de conductores: evalúa de 1 a 6 escenarios (tensión + conductor + conductores por fase) para una
// misma conexión (misma potencia y longitud) con TODOS los criterios a la vez: ampacidad (aérea IEEE 738 o subterránea
// IEC 60287), pérdidas, regulación, cortocircuito y, si hay precios, el costo total actualizado.
// Sin DOM y SIN fórmulas nuevas: combina los motores de las demás calculadoras, que no se tocan. Los límites son las
// referencias de diseño que ya usa la app (pérdidas 3 %, regulación 10 %) y, en ampacidad, que la corriente no la supere.
//
// Supuestos propios de esta combinación (se dicen en la pestaña Fórmulas):
//  - Varios conductores por fase en AÉREA: haz (R/N y RMG equivalente del haz, como Regulación); ampacidad = N × la de
//    un conductor y capacidad de cortocircuito = N × la de uno.
//  - Varios conductores por fase en SUBTERRÁNEA: N circuitos (ternas) en paralelo, cada uno en su ducto del mismo banco.
//    La ampacidad de uno se calcula con el calentamiento mutuo de los N circuitos (y de los otros circuitos que se
//    indiquen) y se multiplica por N; la impedancia es la de un circuito dividida entre N (sin acople entre ternas).
//  - Cable subterráneo monopolar en trébol: las tres distancias entre fases son la separación entre fases.

import { calcularPerdidasTramos, clasificarPerdidas, UMBRAL_ACEPTABLE_PCT as LIMITE_PERDIDAS } from "./perdidas-tramos.js";
import { calcularRegulacionTramos, clasificarRegulacion, UMBRAL_ACEPTABLE_PCT as LIMITE_REGULACION } from "./regulacion-tramos.js";
import { calcularAmpacidadAerea } from "./ampacidad-aerea.js";
import { calcularAmpacidadSubterranea } from "./ampacidad-subterranea.js";
import { calcularCortocircuito } from "./cortocircuito.js";
import { areaMinimaMm2 } from "./cortocircuito-calibre.js";
import { calcularOpcion } from "./conductor-economico.js";

export { LIMITE_PERDIDAS, LIMITE_REGULACION };
export const MIN_ESCENARIOS = 1;
export const MAX_ESCENARIOS = 6;
export const MAX_CIRCUITOS_BANCO = 6; // el mismo máximo de la calculadora de Ampacidad subterránea

/** Calibres del catálogo de construcción de cables subterráneos, de menor a mayor (los mismos de Ampacidad subterránea). */
export const CALIBRES_SUBTERRANEOS = ["1/0 AWG", "2/0 AWG", "3/0 AWG", "4/0 AWG", "250 kcmil", "350 kcmil", "500 kcmil", "750 kcmil", "1000 kcmil"];

/** Nivel de aislamiento (kV) del cable subterráneo para una tensión de línea; null si el catálogo no tiene cables para ella. */
export function nivelAislamientoPara(tensionKv) {
  if (!(tensionKv > 0)) return null;
  if (tensionKv <= 15) return 15;
  if (tensionKv <= 35) return 35;
  if (tensionKv <= 46) return 46;
  return null;
}

/**
 * Datos del conductor que necesitan los motores, sacados de los catálogos.
 * @param {object} e - elección de la pantalla: red, material, calibre, referencia (aérea), tipoPantalla y
 *   nivelAislamientoPct (subterránea) y tensionKv
 * @param {{desnudos:object[], xlpe:object[], cables:object[]}} cat
 * @returns {{ok:true, ...}|{ok:false, error:string}}
 */
export function datosConductor(e, cat) {
  if (e.red === "Aerea") {
    const fila = cat.desnudos.find((f) => f.tipo === e.material && f.calibre_awg_kcmil === e.calibre && f.nombre_clave === e.referencia);
    if (!fila) return { ok: false, error: "Falta elegir el conductor (tipo, calibre y referencia)." };
    return {
      ok: true,
      resistenciaOhmKm: fila.r_ac_75c_ohm_km,
      r25OhmKm: fila.r_ac_25c_ohm_km,
      rmgMm: fila.radio_medio_geometrico_mm,
      diametroMm: fila.diametro_cable_mm,
      areaMm2: fila.area_seccion_aluminio_mm2,
      materialCc: "Aluminio", // igual que en Cortocircuito: la red aérea se calcula como aluminio (área de aluminio)
      masaKgKm: fila.masa_kg_km ?? null,
    };
  }
  const nivel = nivelAislamientoPara(e.tensionKv);
  if (nivel === null) return { ok: false, error: `El catálogo de cables subterráneos llega hasta 46 kV: no hay cables para ${e.tensionKv} kV.` };
  const cable = cat.cables.find(
    (c) => c.material === e.material && c.calibre_awg_kcmil === e.calibre && c.tipo_pantalla === e.tipoPantalla && c.nivel_aislamiento_kv === nivel && c.nivel_aislamiento_pct === e.nivelAislamientoPct
  );
  if (!cable) return { ok: false, error: `No hay en el catálogo un cable de ${e.material} ${e.calibre}, pantalla de ${String(e.tipoPantalla).toLowerCase()}, ${nivel} kV al ${e.nivelAislamientoPct} %.` };
  // Resistencia AC a 75 °C, RMG, área y peso: del catálogo XLPE (el mismo que usan Pérdidas y Regulación en subterráneo).
  const calibreXlpe = e.calibre.replace(/\s*(AWG|kcmil)$/i, "");
  const candidatos = cat.xlpe.filter((x) => x.material_conductor === e.material && x.calibre_awg_kcmil === calibreXlpe);
  const pantallaXlpe = e.tipoPantalla === "Hilos" ? "Hilos de cobre" : "Cinta de cobre";
  const nivelXlpe = `${Math.min(nivel, 35)} kV`;
  const puntaje = (x) => (x.nivel_tension_kv === nivelXlpe ? 2 : 0) + (x.pantalla === pantallaXlpe ? 1 : 0);
  const xlpe = candidatos.sort((a, b) => puntaje(b) - puntaje(a))[0];
  if (!xlpe) return { ok: false, error: `No hay en el catálogo XLPE un cable de ${e.material} ${calibreXlpe} para tomar su resistencia.` };
  return {
    ok: true,
    cable,
    nivelAislamientoKv: nivel,
    resistenciaOhmKm: xlpe.r_ac_75c_ohm_km,
    rmgMm: xlpe.radio_medio_geometrico_mm,
    areaMm2: xlpe.area_conductor_mm2,
    materialCc: e.material,
    masaKgKm: xlpe.masa_total_kg_km ?? null,
  };
}

/**
 * Evalúa un escenario con todos los criterios.
 * @param {object} comun
 * @param {number} comun.potenciaActivaMw
 * @param {number} comun.factorPotencia
 * @param {number} comun.factorCarga
 * @param {number} comun.longitudKm
 * @param {{taC,tcC,vwMs,anguloVientoDeg,elevacionM,epsilon,alfa,qseWm2,thetaDeg}} comun.aerea
 * @param {{tempMaxC,tempTerrenoC,rhoSueloKmW,uDuctoKmW,profundidadBancoM,frecuenciaHz}} comun.subterranea
 * @param {number} comun.tempFallaC - temperatura máxima admisible en falla (°C)
 * @param {null|{anios,tasaDescuentoPct,precioKwh,escaladaEnergiaPct,crecimientoDemandaPct}} comun.economia - null = sin costos
 * @param {object} esc
 * @param {"Aerea"|"Subterranea"} esc.red
 * @param {number} esc.tensionKv
 * @param {number} esc.n - conductores por fase
 * @param {object} esc.conductor - lo que devuelve datosConductor (ok: true)
 * @param {number} [esc.dabM], [esc.dacM], [esc.dbcM], [esc.separacionHazM] - aérea
 * @param {string} [esc.puestaTierra], [esc.separacionFasesM], [esc.separacionDuctosM], [esc.otrosCircuitos] - subterránea
 * @param {number|null} esc.corrienteFallaKa - null = sin dato (solo se informa la capacidad)
 * @param {number} esc.tiempoDespejeS
 * @param {null|{costoConductorKm:number, costoInstalacionKm:number, instalacionIndicada:boolean}} esc.costos
 */
export function evaluarEscenario(comun, esc) {
  const c = esc.conductor;
  const n = esc.n;
  const aerea = esc.red === "Aerea";
  const base = { tensionLineaKv: esc.tensionKv, potenciaActivaMw: comun.potenciaActivaMw, factorPotencia: comun.factorPotencia };

  // Pérdidas (mismo motor de la pantalla de Pérdidas: R/N)
  const p = calcularPerdidasTramos({ ...base, factorCarga: comun.factorCarga }, [{ resistenciaOhmKm: c.resistenciaOhmKm, longitudKm: comun.longitudKm, numConductoresPorFase: n }]);
  const perdidas = {
    pct: p.perdidasPct,
    kw: p.perdidasMw * 1000,
    energiaMwhAnio: p.perdidasMw * 8760,
    factorPerdidas: p.factorPerdidas,
    resistenciaEfectivaOhmKm: p.tramos[0].resistenciaEfectivaOhmKm,
    clase: clasificarPerdidas(p.perdidasPct),
  };
  perdidas.cumple = perdidas.pct <= LIMITE_PERDIDAS;

  // Regulación (mismo motor de la pantalla de Regulación)
  let regulacion;
  if (aerea) {
    const r = calcularRegulacionTramos(base, [
      { resistenciaOhmKm: c.resistenciaOhmKm, rmgMm: c.rmgMm, longitudKm: comun.longitudKm, dabM: esc.dabM, dacM: esc.dacM, dbcM: esc.dbcM, numConductoresPorFase: n, separacionHazM: esc.separacionHazM },
    ]);
    const t = r.tramos[0];
    regulacion = { pct: r.caidaTensionPct, reactanciaOhmKm: t.reactanciaInductiva, impedanciaOhmKm: t.impedanciaEfectiva, rmgEfectivoMm: t.rmgEfectivoMm, constante: t.constanteRegulacion };
  } else {
    // Un circuito en trébol; N circuitos en paralelo dividen la impedancia (y la caída) entre N.
    const s = esc.separacionFasesM;
    const r = calcularRegulacionTramos(base, [{ resistenciaOhmKm: c.resistenciaOhmKm, rmgMm: c.rmgMm, longitudKm: comun.longitudKm, dabM: s, dacM: s, dbcM: s, numConductoresPorFase: 1 }]);
    const t = r.tramos[0];
    regulacion = { pct: r.caidaTensionPct / n, reactanciaOhmKm: t.reactanciaInductiva / n, impedanciaOhmKm: t.impedanciaEfectiva / n, rmgEfectivoMm: t.rmgEfectivoMm, constante: t.constanteRegulacion / n };
  }
  regulacion.clase = clasificarRegulacion(regulacion.pct);
  regulacion.cumple = regulacion.pct <= LIMITE_REGULACION;

  // Ampacidad (N conductores o N circuitos por fase)
  const corrienteA = p.corriente;
  let ampacidad;
  if (aerea) {
    const a = comun.aerea;
    const r = calcularAmpacidadAerea({ diametroMm: c.diametroMm, rBajoOhmKm: c.r25OhmKm, rAltoOhmKm: c.resistenciaOhmKm, ...a });
    ampacidad = Number.isFinite(r.ampacidad) && r.ampacidad > 0
      ? { porConductorA: r.ampacidad, tempMaxC: a.tcC }
      : { error: "Con estas condiciones el balance térmico no admite corriente (temperatura máxima menor que la ambiente o sol excesivo).", tempMaxC: a.tcC };
  } else {
    const s = comun.subterranea;
    const circuitos = n + (esc.otrosCircuitos ?? 0);
    try {
      const r = calcularAmpacidadSubterranea({
        tipoCable: "Monopolar",
        cable: c.cable,
        tipoPantalla: c.cable.tipo_pantalla,
        nivelAislamientoKv: c.nivelAislamientoKv,
        puestaTierra: esc.puestaTierra,
        tensionSistemaKv: esc.tensionKv,
        frecuenciaHz: s.frecuenciaHz,
        tempMaxC: s.tempMaxC,
        tempTerrenoC: s.tempTerrenoC,
        rhoSueloKmW: s.rhoSueloKmW,
        uDuctoKmW: s.uDuctoKmW,
        separacionFasesM: esc.separacionFasesM,
        numCircuitos: circuitos,
        profundidadBancoM: s.profundidadBancoM,
        separacionDuctosM: esc.separacionDuctosM,
      });
      ampacidad = { porConductorA: r.ampacidad, tempMaxC: s.tempMaxC, circuitosBanco: circuitos };
    } catch (err) {
      ampacidad = { error: err.message, tempMaxC: s.tempMaxC, circuitosBanco: circuitos };
    }
  }
  if (!ampacidad.error) {
    ampacidad.totalA = ampacidad.porConductorA * n;
    ampacidad.usoPct = (corrienteA / ampacidad.totalA) * 100;
    ampacidad.cumple = corrienteA <= ampacidad.totalA;
  } else {
    ampacidad.cumple = false;
  }

  // Cortocircuito (temperatura de operación = la máxima del conductor en servicio: 75 °C aérea, 90 °C subterránea)
  const condiciones = { material: c.materialCc, tempOperacionC: ampacidad.tempMaxC, tempFallaC: comun.tempFallaC, tiempoS: esc.tiempoDespejeS };
  const porConductorKa = calcularCortocircuito({ ...condiciones, areaMm2: c.areaMm2 }).capacidadCcKa;
  const falla = esc.corrienteFallaKa;
  const cortocircuito = {
    porConductorKa,
    totalKa: porConductorKa * n,
    tempOperacionC: condiciones.tempOperacionC,
    corrienteFallaKa: falla,
    cumple: falla == null ? null : porConductorKa * n >= falla,
    areaMinimaMm2: falla == null ? null : areaMinimaMm2(falla / n, condiciones), // por conductor
  };

  // Costos (mismo motor de Conductor económico; la tensión es la de este escenario)
  const economia =
    comun.economia && esc.costos
      ? calcularOpcion(
          { ...base, factorCarga: comun.factorCarga, longitudKm: comun.longitudKm, ...comun.economia },
          { resistenciaOhmKm: c.resistenciaOhmKm, numConductoresPorFase: n, costoConductorKm: esc.costos.costoConductorKm, costoInstalacionKm: esc.costos.costoInstalacionKm }
        )
      : null;

  const incumple = [
    ...(ampacidad.cumple ? [] : [ampacidad.error ? "ampacidad (no calculable)" : "ampacidad"]),
    ...(perdidas.cumple ? [] : ["pérdidas"]),
    ...(regulacion.cumple ? [] : ["regulación"]),
    ...(cortocircuito.cumple === false ? ["cortocircuito"] : []),
  ];

  return {
    corrienteA,
    potenciaS: p.potenciaS,
    perdidas,
    regulacion,
    ampacidad,
    cortocircuito,
    economia,
    incumple,
    cumpleTodo: incumple.length === 0,
  };
}

/**
 * Evalúa todos los escenarios y los compara.
 * `mejorCosto` = índice del de menor costo total entre los que tienen costos (null si ninguno los tiene);
 * `recomendado` = el de menor costo total entre los que CUMPLEN todos los criterios (null si no hay costos o ninguno cumple).
 * `diferenciaVsMejor` de cada escenario con costos = su costo total menos el de `mejorCosto`.
 */
export function compararEscenarios(comun, escenarios) {
  const res = escenarios.map((e) => evaluarEscenario(comun, e));
  const conCosto = res.map((r, i) => (r.economia ? i : -1)).filter((i) => i >= 0);
  const menor = (lista) => (lista.length ? lista.reduce((m, i) => (res[i].economia.costoTotal < res[m].economia.costoTotal ? i : m), lista[0]) : null);
  const mejorCosto = menor(conCosto);
  const recomendado = menor(conCosto.filter((i) => res[i].cumpleTodo));
  for (const r of res) if (r.economia) r.economia.diferenciaVsMejor = r.economia.costoTotal - res[mejorCosto].economia.costoTotal;
  return {
    escenarios: res,
    cumplen: res.map((r, i) => (r.cumpleTodo ? i : -1)).filter((i) => i >= 0),
    mejorCosto,
    recomendado,
    costosCompletos: conCosto.length === res.length,
  };
}
