// Herramientas (function calling) que Gemini puede invocar. Cada calculadora
// de js/calc/*.js se expone como una herramienta: la IA NUNCA calcula, solo
// decide que herramienta usar y con que parametros; los numeros salen de los
// mismos motores (y catalogos) que usan las pantallas de Calculos.
//
// Cada ejecucion queda registrada ("corrida") con sus entradas, supuestos y
// resultados para poder auditarla en la interfaz: la tabla de escenarios se
// dibuja con estos datos, no con texto de la IA.
//
// Los adaptadores replican lo que hace cada vista antes de llamar al motor
// (busqueda del conductor en el catalogo, valores por defecto, etc.).

import { loadData, distinct } from "../util/format.js";
import { calcularPerdidasTramos, clasificarPerdidas, UMBRAL_OPTIMO_PCT as P_OPT, UMBRAL_ACEPTABLE_PCT as P_ACE } from "../calc/perdidas-tramos.js";
import { calcularRegulacionTramos, clasificarRegulacion, UMBRAL_OPTIMO_PCT as R_OPT, UMBRAL_ACEPTABLE_PCT as R_ACE } from "../calc/regulacion-tramos.js";
import { potenciaActivaMw } from "../calc/circuito.js";
import { compararCalibres } from "../calc/cortocircuito-calibre.js";
import { calcularCortocircuito } from "../calc/cortocircuito.js";
import { calcularAmpacidadAerea } from "../calc/ampacidad-aerea.js";
import { calcularAmpacidadSubterranea } from "../calc/ampacidad-subterranea.js";
import { calcularPantalla } from "../calc/ampacidad-subterranea-pantalla.js";
import { calcularOcupacionGrupos } from "../calc/ocupacion-grupos.js";
import {
  compararOpciones as compararOpcionesEconomico,
  sensibilidad as sensibilidadEconomico,
  sensibilidadInstalacion as sensibilidadInstalacionEconomico,
} from "../calc/conductor-economico.js";
import { convertirBase, datosCalibre, calibrePorArea, CALIBRES } from "../calc/unidades-extendido.js";
import { SISTEMAS, convertirCoordenadas } from "../calc/coordenadas.js";
import { parseCodigoEpsg, infoSistema, convertirEntreSistemas, avisosArea } from "../calc/coordenadas-epsg.js";
import { cargarProj4 } from "../util/proj4.js";

export class ErrorHerramienta extends Error {}

export const MAX_PUNTOS_BARRIDO = 40;
const MAX_FILAS_CONSULTA = 15;

// ---------------------------------------------------------------- utilidades

const norm = (s) =>
  String(s ?? "")
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "");
const normCalibre = (s) => norm(s).replace(/awg|kcmil|mcm|mm2|mm²|\s+/g, "");
const redondear = (v, cifras = 6) => (typeof v === "number" && Number.isFinite(v) ? Number(v.toPrecision(cifras)) : v);

const ent = (clave, etiqueta, valor, unidad = "") => ({ clave, etiqueta, valor, unidad });
const res = (clave, etiqueta, valor, unidad = "", dec = 2) => ({ clave, etiqueta, valor, unidad, dec });

// Constructores de definicion de parametros. `d` describe el parametro para el
// modelo; `e` (opcional) es la etiqueta corta que se muestra en las tablas.
const etiquetaDe = (c) => c.e || c.d;
const N = (n, d, o = {}) => ({ n, t: "number", d, ...o });
const I = (n, d, o = {}) => ({ n, t: "integer", d, ...o });
const S = (n, d, o = {}) => ({ n, t: "string", d, ...o });

// ---------------------------------------------------------------- esquema y validacion

function esquemaDe(campos) {
  const properties = {};
  for (const c of campos) {
    let desc = c.d;
    if (c.u) desc += ` [${c.u}]`;
    if ("defecto" in c) desc += ` (por defecto ${c.defecto})`;
    if (c.min !== undefined || c.max !== undefined) {
      const lo = c.min !== undefined ? `${c.minExcl ? ">" : "≥"} ${c.min}` : "";
      const hi = c.max !== undefined ? `≤ ${c.max}` : "";
      desc += ` (rango: ${[lo, hi].filter(Boolean).join(", ")})`;
    }
    const p = { type: c.t, description: desc };
    if (c.enum) p.enum = c.enum;
    if (c.t === "array") p.items = c.itemCampos ? esquemaDe(c.itemCampos) : { type: c.items };
    properties[c.n] = p;
  }
  const required = campos.filter((c) => c.req).map((c) => c.n);
  return { type: "object", properties, ...(required.length ? { required } : {}) };
}

/** Valida y completa los argumentos. Devuelve { v, entradas, supuestos, ignorados } o lanza ErrorHerramienta. */
function normalizar(campos, args) {
  const v = {};
  const entradas = [];
  const supuestos = [];
  const errores = [];
  const entrada = args && typeof args === "object" ? args : {};
  const conocidos = new Set(campos.map((c) => c.n));
  const ignorados = Object.keys(entrada).filter((k) => !conocidos.has(k));

  for (const c of campos) {
    const raw = entrada[c.n];
    if (raw === undefined || raw === null || raw === "") {
      if (c.req) {
        errores.push(`falta el parámetro obligatorio "${c.n}" (${c.d})`);
      } else if ("defecto" in c) {
        v[c.n] = c.defecto;
        supuestos.push(`${etiquetaDe(c)}: ${c.defecto}${c.u ? ` ${c.u}` : ""} (valor por defecto de la calculadora)`);
        if (!c.oculto) entradas.push(ent(c.n, etiquetaDe(c), c.defecto, c.u));
      }
      continue;
    }

    if (c.t === "number" || c.t === "integer") {
      const x = typeof raw === "number" ? raw : parseFloat(String(raw).replace(",", "."));
      if (!Number.isFinite(x)) {
        errores.push(`"${c.n}" debe ser un número (recibido: ${JSON.stringify(raw)})`);
        continue;
      }
      if (c.t === "integer" && !Number.isInteger(x)) {
        errores.push(`"${c.n}" debe ser un entero (recibido: ${x})`);
        continue;
      }
      if (c.min !== undefined && (c.minExcl ? x <= c.min : x < c.min)) {
        errores.push(`"${c.n}" debe ser ${c.minExcl ? "mayor que" : "al menos"} ${c.min} (recibido: ${x})`);
        continue;
      }
      if (c.max !== undefined && x > c.max) {
        errores.push(`"${c.n}" debe ser como máximo ${c.max} (recibido: ${x})`);
        continue;
      }
      v[c.n] = x;
    } else if (c.t === "array") {
      if (!Array.isArray(raw)) {
        errores.push(`"${c.n}" debe ser una lista`);
        continue;
      }
      if (c.itemCampos) {
        const items = [];
        raw.forEach((it, i) => {
          try {
            items.push(normalizar(c.itemCampos, it).v);
          } catch (e) {
            if (!(e instanceof ErrorHerramienta)) throw e;
            errores.push(`${c.n}[${i + 1}]: ${e.message.replace(/^Parámetros inválidos: /, "").replace(/\.$/, "")}`);
          }
        });
        v[c.n] = items;
      } else {
        v[c.n] = raw;
      }
    } else {
      const texto = String(raw).trim();
      if (c.enum) {
        const canon = c.enum.find((e) => norm(e) === norm(texto));
        if (!canon) {
          errores.push(`"${c.n}" debe ser uno de: ${c.enum.join(", ")} (recibido: "${texto}")`);
          continue;
        }
        v[c.n] = canon;
      } else {
        v[c.n] = texto;
      }
    }
    if (!c.oculto && v[c.n] !== undefined && c.t !== "array") entradas.push(ent(c.n, etiquetaDe(c), v[c.n], c.u));
  }

  if (errores.length) throw new ErrorHerramienta(`Parámetros inválidos: ${errores.join("; ")}.`);
  return { v, entradas, supuestos, ignorados };
}

// ---------------------------------------------------------------- catalogo de conductores

const CAMPOS_CONDUCTOR = [
  S("red", "Tipo de red del conductor: 'Aerea' (catálogo de conductores desnudos) o 'Subterranea' (catálogo XLPE de media tensión)", {
    enum: ["Aerea", "Subterranea"],
    oculto: true,
  }),
  S("material", "Aerea: familia del conductor (ACSR, AAAC, ACAR, AAC o ACSS). Subterranea: material (Cobre o Aluminio)", { oculto: true }),
  S("calibre", "Calibre del catálogo, por ejemplo '4/0', '336.4' o '500' (AWG/kcmil; en XLPE también hay calibres en mm² como '95'). Usa buscar_conductor si dudas", {
    oculto: true,
  }),
  S("referencia", "Solo red Aerea (opcional): nombre clave de la referencia, por ejemplo 'Penguin (6/1)', cuando el calibre tiene varias", { oculto: true }),
];

/** Busca la fila del catalogo segun red+material+calibre (+referencia), igual que las calculadoras (primera coincidencia). */
async function resolverConductor(v, extra) {
  if (!v.red || !v.material || !v.calibre) {
    throw new ErrorHerramienta('Para tomar el conductor del catálogo indica "red", "material" y "calibre" (o entrega los valores manuales).');
  }
  if (v.red === "Aerea") {
    const desnudos = await loadData("conductores-desnudos");
    const tipos = distinct(desnudos, "tipo");
    const tipo = tipos.find((t) => norm(t) === norm(v.material));
    if (!tipo) throw new ErrorHerramienta(`El material/tipo "${v.material}" no existe en conductores desnudos. Opciones: ${tipos.join(", ")}.`);
    const deTipo = desnudos.filter((c) => c.tipo === tipo);
    const porCalibre = deTipo.filter((c) => normCalibre(c.calibre_awg_kcmil) === normCalibre(v.calibre));
    if (!porCalibre.length) {
      throw new ErrorHerramienta(`El calibre "${v.calibre}" no existe para ${tipo}. Calibres disponibles: ${distinct(deTipo, "calibre_awg_kcmil", "area_seccion_aluminio_mm2").join(", ")}.`);
    }
    let fila = porCalibre[0];
    if (v.referencia) {
      const q = norm(v.referencia);
      const r = porCalibre.find((c) => norm(c.nombre_clave) === q) || porCalibre.find((c) => norm(c.nombre_clave).includes(q));
      if (!r) throw new ErrorHerramienta(`La referencia "${v.referencia}" no existe para ${tipo} ${v.calibre}. Opciones: ${porCalibre.map((c) => c.nombre_clave).join(", ")}.`);
      fila = r;
    } else if (porCalibre.length > 1) {
      extra.notas.push(
        `Hay ${porCalibre.length} referencias ${tipo} de calibre ${fila.calibre_awg_kcmil} (${porCalibre.map((c) => c.nombre_clave).join(", ")}); se usó la primera (${fila.nombre_clave}), igual que la calculadora. Se puede fijar otra con "referencia".`
      );
    }
    return { fila, red: "Aerea", etiqueta: `${tipo} ${fila.calibre_awg_kcmil} (${fila.nombre_clave})` };
  }

  const xlpe = await loadData("conductores-xlpe");
  const materiales = distinct(xlpe, "material_conductor");
  const material = materiales.find((m) => norm(m) === norm(v.material));
  if (!material) throw new ErrorHerramienta(`El material "${v.material}" no existe en el catálogo XLPE. Opciones: ${materiales.join(", ")}.`);
  const deMaterial = xlpe.filter((c) => c.material_conductor === material);
  const porCalibre = deMaterial.filter((c) => normCalibre(c.calibre_awg_kcmil) === normCalibre(v.calibre));
  if (!porCalibre.length) {
    throw new ErrorHerramienta(`El calibre "${v.calibre}" no existe para XLPE ${material}. Calibres disponibles: ${distinct(deMaterial, "calibre_awg_kcmil", "area_conductor_mm2").join(", ")}.`);
  }
  const fila = porCalibre[0];
  if (porCalibre.length > 1) {
    extra.notas.push(
      `Hay ${porCalibre.length} construcciones XLPE ${material} de calibre ${fila.calibre_awg_kcmil} (según nivel de tensión/pantalla); se usó la primera (${fila.nivel_tension_kv}, ${fila.pantalla}), igual que la calculadora.`
    );
  }
  return { fila, red: "Subterranea", etiqueta: `XLPE ${material} ${fila.calibre_awg_kcmil}` };
}

async function resistencia75(v, extra) {
  if (v.resistencia_ohm_km !== undefined) {
    extra.entradas.push(ent("resistencia_ohm_km", "Resistencia AC a 75 °C (manual)", v.resistencia_ohm_km, "Ω/km"));
    return { r75: v.resistencia_ohm_km, fila: null };
  }
  const c = await resolverConductor(v, extra);
  const r75 = c.fila.r_ac_75c_ohm_km;
  if (!Number.isFinite(r75)) throw new ErrorHerramienta(`El conductor ${c.etiqueta} no tiene resistencia AC a 75 °C en el catálogo; indica "resistencia_ohm_km".`);
  extra.entradas.push(ent("conductor", "Conductor", c.etiqueta), ent("resistencia_ohm_km", "Resistencia AC a 75 °C (catálogo)", r75, "Ω/km"));
  return { r75, fila: c.fila };
}

// ---------------------------------------------------------------- calculadoras

const MAX_TRAMOS = 10;
const sinDefecto = (campos) => campos.map(({ defecto, req, ...c }) => c);

const CAMPOS_LINEA = [
  N("tension_kv", "Tensión línea-línea", { u: "kV", req: true, min: 0, minExcl: true }),
  N("factor_potencia", "Factor de potencia (cos φ)", { e: "Factor de potencia", req: true, min: 0, minExcl: true, max: 1 }),
  N("potencia_mw", "DATO DE PARTIDA (indica solo uno de los tres): potencia activa", { e: "Potencia activa", u: "MW", min: 0, minExcl: true }),
  N("potencia_mva", "DATO DE PARTIDA (alternativa): potencia aparente; la activa es S·cos φ", { e: "Potencia aparente", u: "MVA", min: 0, minExcl: true }),
  N("corriente_a", "DATO DE PARTIDA (alternativa): corriente de línea; la activa es √3·V·I·cos φ", { e: "Corriente de línea", u: "A", min: 0, minExcl: true }),
  N("longitud_km", "Longitud de la línea (un solo tramo; con varios tramos va dentro de cada uno de \"tramos\")", { e: "Longitud de la línea", u: "km", min: 0, minExcl: true }),
];
const CAMPO_R_MANUAL = N("resistencia_ohm_km", "Resistencia AC a 75 °C del conductor (opcional: reemplaza al catálogo)", { u: "Ω/km", min: 0, max: 10000, oculto: true });
const CAMPO_POR_FASE = I("conductores_por_fase", "Conductores por fase (haz); la resistencia efectiva es R/N (por defecto 1)", { min: 1, max: 6, oculto: true });

/** Campo `tramos`: lista de tramos; cada dato que un tramo no trae lo toma del nivel superior (sirve de valor común). */
const campoTramos = (campos) => ({
  n: "tramos",
  t: "array",
  d: `Solo con VARIOS tramos en serie (hasta ${MAX_TRAMOS}), cada uno con su conductor y su longitud; lo que un tramo no indique se toma del nivel superior. La corriente es la misma en todos y el resultado total es la suma de los tramos`,
  itemCampos: sinDefecto(campos),
});

/** Dato de partida: exactamente uno de potencia_mw, potencia_mva o corriente_a. Devuelve la potencia activa (MW). */
function datoPartida(v) {
  const dados = ["potencia_mw", "potencia_mva", "corriente_a"].filter((k) => v[k] !== undefined);
  if (dados.length !== 1) {
    throw new ErrorHerramienta(
      dados.length ? `Indica solo UN dato de partida (recibí ${dados.join(", ")}).` : 'Falta el dato de partida: indica "potencia_mw" (potencia activa), "potencia_mva" (aparente) o "corriente_a".'
    );
  }
  const modo = { potencia_mw: "potencia", potencia_mva: "aparente", corriente_a: "corriente" }[dados[0]];
  const potenciaMw = potenciaActivaMw({ modo, potenciaMw: v.potencia_mw, potenciaMva: v.potencia_mva, corrienteA: v.corriente_a, tensionKv: v.tension_kv, factorPotencia: v.factor_potencia });
  return { modo, potenciaMw };
}

/** Lista de tramos con lo heredable del nivel superior; sin `tramos` es un solo tramo con los datos superiores. */
const listaTramos = (v, heredables) =>
  (v.tramos?.length ? v.tramos : [{}]).map((t) => Object.fromEntries(heredables.map((k) => [k, t[k] ?? v[k]])));

/** Copia lo que se anotó al resolver el tramo i (de n) con «Tramo i — » delante si hay varios. */
function volcarTramo(extra, sub, i, n) {
  const pre = n > 1 ? `Tramo ${i + 1} — ` : "";
  for (const e of sub.entradas) extra.entradas.push(n > 1 ? { ...e, clave: `tramo${i + 1}_${e.clave}`, etiqueta: pre + e.etiqueta } : e);
  extra.supuestos.push(...sub.supuestos.map((x) => pre + x));
  extra.notas.push(...sub.notas.map((x) => pre + x));
}

const subNuevo = () => ({ entradas: [], supuestos: [], notas: [] });
const enTramo = (i, n) => (n > 1 ? ` en el tramo ${i + 1}` : "");

const HEREDABLES_PERDIDAS = ["red", "material", "calibre", "referencia", "resistencia_ohm_km", "longitud_km", "conductores_por_fase"];
const CAMPOS_TRAMO_PERDIDAS = [...CAMPOS_CONDUCTOR, CAMPO_R_MANUAL, CAMPO_POR_FASE, N("longitud_km", "Longitud del tramo", { u: "km", min: 0, minExcl: true })];

const nota = (optimo, aceptable, que) => `Referencias de diseño (NO son límite normativo): ${que} hasta ${optimo} % es óptimo, hasta ${aceptable} % es aceptable y por encima es elevado.`;

const T_PERDIDAS = {
  nombre: "calcular_perdidas",
  tipo: "calculo",
  titulo: "Pérdidas",
  descripcion:
    "Calcula corriente, potencias aparente/reactiva y el % de pérdidas por efecto Joule de una línea trifásica de uno o varios tramos, ajustado por factor de carga, y las clasifica como Óptimo / Aceptable / Elevado (referencias de diseño, no límite normativo). " +
    "El dato de partida es potencia_mw, potencia_mva o corriente_a (uno solo). El conductor de cada tramo se define con red+material+calibre (resistencia AC a 75 °C del catálogo) o con resistencia_ohm_km manual; con varios conductores por fase usa conductores_por_fase. " +
    "Para un solo tramo basta con los campos de nivel superior; para varios tramos en serie usa \"tramos\".",
  campos: [...CAMPOS_LINEA, N("factor_carga", "Factor de carga Fc", { req: true, min: 0, max: 1 }), ...CAMPOS_CONDUCTOR, CAMPO_R_MANUAL, CAMPO_POR_FASE, campoTramos(CAMPOS_TRAMO_PERDIDAS)],
  async calcular(v, extra) {
    const { modo, potenciaMw } = datoPartida(v);
    const lista = listaTramos(v, HEREDABLES_PERDIDAS);
    const n = lista.length;
    const tramos = [];
    for (const [i, t] of lista.entries()) {
      if (t.longitud_km === undefined) throw new ErrorHerramienta(`Falta "longitud_km"${enTramo(i, n)}.`);
      const sub = subNuevo();
      const { r75 } = await resistencia75(t, sub);
      const porFase = t.conductores_por_fase ?? 1;
      if (porFase > 1) sub.entradas.push(ent("conductores_por_fase", "Conductores por fase", porFase));
      if (n > 1) sub.entradas.push(ent("longitud_km", "Longitud", t.longitud_km, "km"));
      volcarTramo(extra, sub, i, n);
      tramos.push({ resistenciaOhmKm: r75, longitudKm: t.longitud_km, numConductoresPorFase: porFase });
    }
    const r = calcularPerdidasTramos({ tensionLineaKv: v.tension_kv, potenciaActivaMw: potenciaMw, factorPotencia: v.factor_potencia, factorCarga: v.factor_carga }, tramos);
    extra.notas.push(nota(P_OPT, P_ACE, "las pérdidas"));
    const salida = [
      res("corriente_a", "Corriente", r.corriente, "A"),
      res("potencia_aparente_mva", "Potencia aparente", r.potenciaS, "MVA"),
      res("potencia_reactiva_mvar", "Potencia reactiva", r.potenciaQ, "MVAR"),
    ];
    if (modo !== "potencia") salida.push(res("potencia_activa_mw", "Potencia activa", potenciaMw, "MW"));
    salida.push(res("perdidas_pct", n > 1 ? "Pérdidas totales" : "Pérdidas", r.perdidasPct, "%"), res("perdidas_mw", n > 1 ? "Pérdidas totales de potencia" : "Pérdidas de potencia", r.perdidasMw, "MW", 4));
    if (n > 1) {
      r.tramos.forEach((f, i) => salida.push(res(`tramo${i + 1}_perdidas_pct`, `Tramo ${i + 1} — Pérdidas`, f.perdidasPct, "%"), res(`tramo${i + 1}_perdidas_mw`, `Tramo ${i + 1} — Pérdidas de potencia`, f.perdidasMw, "MW", 4)));
    }
    salida.push(res("clasificacion", "Clasificación (referencia de diseño)", clasificarPerdidas(r.perdidasPct).etiqueta));
    return salida;
  },
};

const HEREDABLES_REGULACION = [...HEREDABLES_PERDIDAS, "rmg_m", "dab_m", "dac_m", "dbc_m", "separacion_haz_m"];
const CAMPOS_TRAMO_REGULACION = [
  ...CAMPOS_TRAMO_PERDIDAS,
  N("rmg_m", "Radio medio geométrico de UN conductor (opcional: reemplaza al catálogo)", { u: "m", min: 0, minExcl: true, oculto: true }),
  N("separacion_haz_m", "Separación entre subconductores del haz (obligatoria con más de 1 conductor por fase)", { u: "m", min: 0, minExcl: true, oculto: true }),
  N("dab_m", "Distancia entre fases A-B del tramo", { u: "m", min: 0, minExcl: true }),
  N("dac_m", "Distancia entre fases A-C del tramo", { u: "m", min: 0, minExcl: true }),
  N("dbc_m", "Distancia entre fases B-C del tramo", { u: "m", min: 0, minExcl: true }),
];

const T_REGULACION = {
  nombre: "calcular_regulacion",
  tipo: "calculo",
  titulo: "Regulación",
  descripcion:
    "Calcula la caída de tensión (%) de una línea trifásica de uno o varios tramos, con corriente, potencias y constante de regulación, y la clasifica como Óptimo / Aceptable / Elevado (referencias de diseño, no límite normativo). " +
    "El dato de partida es potencia_mw, potencia_mva o corriente_a (uno solo). El conductor de cada tramo se define con red+material+calibre (resistencia y radio medio geométrico del catálogo) o con valores manuales; con varios conductores por fase usa conductores_por_fase y separacion_haz_m. " +
    "Para un solo tramo basta con los campos de nivel superior; para varios tramos en serie usa \"tramos\" (cada uno con su longitud, conductor y distancias entre fases).",
  campos: [
    ...CAMPOS_LINEA,
    ...CAMPOS_CONDUCTOR,
    CAMPO_R_MANUAL,
    CAMPO_POR_FASE,
    N("rmg_m", "Radio medio geométrico de UN conductor (opcional: reemplaza al catálogo)", { u: "m", min: 0, minExcl: true, oculto: true }),
    N("separacion_haz_m", "Separación entre subconductores del haz (obligatoria con más de 1 conductor por fase)", { u: "m", min: 0, minExcl: true, oculto: true }),
    N("dab_m", "Distancia entre fases A-B", { u: "m", min: 0, minExcl: true, defecto: 2 }),
    N("dac_m", "Distancia entre fases A-C", { u: "m", min: 0, minExcl: true, defecto: 2.84 }),
    N("dbc_m", "Distancia entre fases B-C", { u: "m", min: 0, minExcl: true, defecto: 0.84 }),
    campoTramos(CAMPOS_TRAMO_REGULACION),
  ],
  async calcular(v, extra) {
    const { modo, potenciaMw } = datoPartida(v);
    const lista = listaTramos(v, HEREDABLES_REGULACION);
    const n = lista.length;
    const tramos = [];
    for (const [i, t] of lista.entries()) {
      if (t.longitud_km === undefined) throw new ErrorHerramienta(`Falta "longitud_km"${enTramo(i, n)}.`);
      const sub = subNuevo();
      const { r75, fila } = await resistencia75(t, sub);
      let rmgM = t.rmg_m;
      if (rmgM === undefined) {
        if (!fila) throw new ErrorHerramienta(`Con "resistencia_ohm_km" manual también debes indicar "rmg_m" (radio medio geométrico en metros)${enTramo(i, n)}.`);
        rmgM = fila.radio_medio_geometrico_mm / 1000;
        if (!Number.isFinite(rmgM) || rmgM <= 0) throw new ErrorHerramienta(`El conductor no tiene radio medio geométrico en el catálogo; indica "rmg_m"${enTramo(i, n)}.`);
        sub.entradas.push(ent("rmg_m", "Radio medio geométrico (catálogo)", rmgM, "m"));
      } else {
        sub.entradas.push(ent("rmg_m", "Radio medio geométrico (manual)", rmgM, "m"));
      }
      const porFase = t.conductores_por_fase ?? 1;
      if (porFase > 1) {
        if (t.separacion_haz_m === undefined) throw new ErrorHerramienta(`Con más de 1 conductor por fase indica "separacion_haz_m" (separación entre subconductores, en m)${enTramo(i, n)}.`);
        sub.entradas.push(ent("conductores_por_fase", "Conductores por fase", porFase), ent("separacion_haz_m", "Separación entre subconductores del haz", t.separacion_haz_m, "m"));
      }
      if (n > 1) sub.entradas.push(ent("longitud_km", "Longitud", t.longitud_km, "km"), ent("dab_m", "Distancia A-B", t.dab_m, "m"), ent("dac_m", "Distancia A-C", t.dac_m, "m"), ent("dbc_m", "Distancia B-C", t.dbc_m, "m"));
      volcarTramo(extra, sub, i, n);
      tramos.push({ resistenciaOhmKm: r75, rmgMm: rmgM * 1000, longitudKm: t.longitud_km, dabM: t.dab_m, dacM: t.dac_m, dbcM: t.dbc_m, numConductoresPorFase: porFase, separacionHazM: t.separacion_haz_m });
    }
    const r = calcularRegulacionTramos({ tensionLineaKv: v.tension_kv, potenciaActivaMw: potenciaMw, factorPotencia: v.factor_potencia }, tramos);
    extra.notas.push(nota(R_OPT, R_ACE, "la caída de tensión"));
    const salida = [
      res("corriente_a", "Corriente", r.corriente, "A"),
      res("potencia_aparente_mva", "Potencia aparente", r.potenciaS, "MVA"),
      res("potencia_reactiva_mvar", "Potencia reactiva", r.potenciaQ, "MVAR"),
    ];
    if (modo !== "potencia") salida.push(res("potencia_activa_mw", "Potencia activa", potenciaMw, "MW"));
    if (n === 1) salida.push(res("constante_regulacion", "Constante de regulación", r.tramos[0].constanteRegulacion, "", 7));
    salida.push(res("caida_tension_pct", n > 1 ? "Caída de tensión total" : "Caída de tensión", r.caidaTensionPct, "%"));
    if (n > 1) {
      r.tramos.forEach((f, i) => salida.push(res(`tramo${i + 1}_constante_regulacion`, `Tramo ${i + 1} — Constante de regulación`, f.constanteRegulacion, "", 7), res(`tramo${i + 1}_caida_tension_pct`, `Tramo ${i + 1} — Caída de tensión`, f.caidaTensionPct, "%")));
    }
    r.tramos.forEach((f, i) => {
      if ((tramos[i].numConductoresPorFase ?? 1) > 1) {
        const pre = n > 1 ? `Tramo ${i + 1} — ` : "";
        const cl = n > 1 ? `tramo${i + 1}_` : "";
        salida.push(res(`${cl}resistencia_efectiva_ohm_km`, `${pre}Resistencia efectiva del haz`, f.resistenciaEfectivaOhmKm, "Ω/km", 4), res(`${cl}rmg_efectivo_mm`, `${pre}RMG equivalente del haz`, f.rmgEfectivoMm, "mm", 3));
      }
    });
    salida.push(res("clasificacion", "Clasificación (referencia de diseño)", clasificarRegulacion(r.caidaTensionPct).etiqueta));
    return salida;
  },
};

const T_CORTOCIRCUITO = {
  nombre: "calcular_cortocircuito",
  tipo: "calculo",
  titulo: "Cortocircuito",
  descripcion:
    "Calcula la corriente de cortocircuito admisible (kA) de un conductor según el límite térmico y el tiempo de despeje. " +
    "El área sale del catálogo (red+material+calibre) o se ingresa manualmente con area_mm2 + material_electrico. " +
    "Con corriente_falla_ka (la corriente de falla que el conductor debe soportar) además dice si el calibre elegido cumple, el área mínima requerida y, con conductor del catálogo, el calibre más pequeño del mismo tipo y material que la soporta.",
  campos: [
    ...CAMPOS_CONDUCTOR,
    N("area_mm2", "Área del conductor (opcional: reemplaza al catálogo)", { u: "mm²", min: 0, minExcl: true, max: 10000, oculto: true }),
    S("material_electrico", "Cobre o Aluminio; solo necesario con area_mm2 manual", { enum: ["Cobre", "Aluminio"], oculto: true }),
    N("temp_operacion_c", "Temperatura de operación del conductor (por defecto 75 en red aérea, 90 en subterránea)", { e: "Temperatura de operación", u: "°C", min: 0, max: 500 }),
    N("temp_falla_c", "Temperatura máxima admisible en falla", { e: "Temperatura en falla", u: "°C", min: 0, max: 500, defecto: 250 }),
    N("tiempo_s", "Tiempo de despeje de la falla", { u: "s", min: 0, minExcl: true, max: 60, defecto: 0.3 }),
    N("corriente_falla_ka", "OPCIONAL: corriente de falla que el conductor debe soportar (activa el veredicto, el área mínima y el calibre sugerido)", { e: "Corriente de falla a soportar", u: "kA", min: 0, minExcl: true, max: 1000 }),
  ],
  async calcular(v, extra) {
    let area;
    let materialElectrico;
    let red = v.red;
    let fila = null;
    if (v.area_mm2 !== undefined) {
      area = v.area_mm2;
      materialElectrico = v.material_electrico || (red === "Aerea" ? "Aluminio" : null);
      if (!materialElectrico) throw new ErrorHerramienta('Con "area_mm2" manual indica "material_electrico" (Cobre o Aluminio).');
      extra.entradas.push(ent("area_mm2", "Área del conductor (manual)", area, "mm²"));
    } else {
      const c = await resolverConductor(v, extra);
      red = c.red;
      fila = c.fila;
      area = red === "Aerea" ? c.fila.area_seccion_aluminio_mm2 : c.fila.area_conductor_mm2;
      if (!Number.isFinite(area)) throw new ErrorHerramienta(`El conductor ${c.etiqueta} no tiene área en el catálogo; indica "area_mm2".`);
      // igual que la vista: en red aerea todos los tipos son de aluminio
      materialElectrico = red === "Aerea" ? "Aluminio" : c.fila.material_conductor;
      extra.entradas.push(ent("conductor", "Conductor", c.etiqueta), ent("area_mm2", "Área del conductor (catálogo)", area, "mm²"));
    }
    extra.entradas.push(ent("material_electrico", "Material eléctrico", materialElectrico));

    const topDefecto = red === "Subterranea" ? 90 : 75;
    let top = v.temp_operacion_c;
    if (top === undefined) {
      top = topDefecto;
      extra.supuestos.push(`Temperatura de operación: ${topDefecto} °C (por defecto según el tipo de red)`);
      extra.entradas.push(ent("temp_operacion_c", "Temperatura de operación", top, "°C"));
    }
    if (v.temp_falla_c <= top) throw new ErrorHerramienta("La temperatura de falla debe ser mayor que la temperatura de operación.");

    const r = calcularCortocircuito({ material: materialElectrico, areaMm2: area, tempOperacionC: top, tempFallaC: v.temp_falla_c, tiempoS: v.tiempo_s });
    const salida = [res("capacidad_cc_ka", "Corriente de cortocircuito admisible", r.capacidadCcKa, "kA")];
    if (v.corriente_falla_ka === undefined) return salida;

    // Corriente a soportar: igual que la pantalla (cortocircuito-calibre.js). Los candidatos son los calibres del mismo tipo y material.
    const objetivo = v.corriente_falla_ka;
    const cond = { material: materialElectrico, tempOperacionC: top, tempFallaC: v.temp_falla_c, tiempoS: v.tiempo_s };
    const aereo = red === "Aerea";
    let candidatos = [];
    if (fila) {
      const catalogo = await loadData(aereo ? "conductores-desnudos" : "conductores-xlpe");
      const campoMaterial = aereo ? "tipo" : "material_conductor";
      const campoArea = aereo ? "area_seccion_aluminio_mm2" : "area_conductor_mm2";
      const vistos = new Set();
      candidatos = catalogo
        .filter((f) => {
          if (f[campoMaterial] !== fila[campoMaterial] || !f.calibre_awg_kcmil || f[campoArea] == null || vistos.has(f.calibre_awg_kcmil)) return false;
          vistos.add(f.calibre_awg_kcmil);
          return true;
        })
        .map((f) => ({ calibre: f.calibre_awg_kcmil, area: f[campoArea] }));
    }
    const cmp = compararCalibres(candidatos, cond, objetivo, fila ? fila.calibre_awg_kcmil : null);
    salida.push(
      res("cumple_corriente", "El conductor soporta la corriente de falla", r.capacidadCcKa >= objetivo),
      res("margen_ka", "Margen (capacidad − corriente a soportar)", r.capacidadCcKa - objetivo, "kA"),
      res("area_minima_mm2", "Área mínima requerida", cmp.areaMinimaMm2, "mm²")
    );
    if (fila) {
      if (cmp.sugerido) {
        salida.push(res("calibre_sugerido", "Calibre más pequeño que la soporta (mismo tipo y material)", cmp.sugerido.calibre), res("area_calibre_sugerido_mm2", "Área del calibre sugerido", cmp.sugerido.area, "mm²"), res("capacidad_calibre_sugerido_ka", "Capacidad del calibre sugerido", cmp.sugerido.capacidadCcKa, "kA"));
      } else if (cmp.mayor) {
        salida.push(res("calibre_sugerido", "Ningún calibre del catálogo la soporta; el de mayor capacidad es", cmp.mayor.calibre), res("capacidad_calibre_sugerido_ka", "Capacidad de ese calibre", cmp.mayor.capacidadCcKa, "kA"));
      }
    } else {
      extra.notas.push("Con área manual no se sugiere calibre: solo se informa el área mínima requerida.");
    }
    return salida;
  },
};

const T_AMP_AEREA = {
  nombre: "calcular_ampacidad_aerea",
  tipo: "calculo",
  titulo: "Ampacidad aérea",
  descripcion:
    "Calcula la corriente admisible (A) de un conductor aéreo en régimen permanente (balance térmico IEEE Std 738). " +
    "Diámetro y resistencias salen del catálogo de conductores desnudos (tipo+calibre) o se ingresan manualmente.",
  campos: [
    S("tipo", "Familia del conductor desnudo: ACSR, AAAC, ACAR, AAC o ACSS", { oculto: true }),
    S("calibre", "Calibre del catálogo, por ejemplo '4/0', '336.4', '477'", { oculto: true }),
    S("referencia", "Opcional: nombre clave de la referencia cuando el calibre tiene varias", { oculto: true }),
    N("diametro_mm", "Diámetro del cable (opcional: reemplaza al catálogo)", { u: "mm", min: 0, minExcl: true, max: 1000, oculto: true }),
    N("r_ac_25c_ohm_km", "Resistencia AC a 25 °C (opcional: reemplaza al catálogo)", { u: "Ω/km", min: 0, max: 1000, oculto: true }),
    N("r_ac_75c_ohm_km", "Resistencia AC a 75 °C (opcional: reemplaza al catálogo)", { u: "Ω/km", min: 0, max: 1000, oculto: true }),
    N("epsilon", "Emisividad ε", { min: 0.23, max: 0.91, defecto: 0.5 }),
    N("alfa", "Absortividad α", { min: 0.23, max: 0.91, defecto: 0.5 }),
    N("ta_c", "Temperatura ambiente", { u: "°C", min: -100, max: 1000, defecto: 25 }),
    N("tc_c", "Temperatura máxima admisible del conductor", { u: "°C", min: 0, max: 1000, defecto: 75 }),
    N("vw_ms", "Velocidad del viento", { u: "m/s", min: 0, max: 100, defecto: 0.61 }),
    N("angulo_viento_deg", "Ángulo entre viento y conductor", { u: "°", min: 0, max: 360, defecto: 90 }),
    N("elevacion_m", "Elevación sobre el nivel del mar", { u: "m", min: 0, max: 10000, defecto: 0 }),
    N("qse_wm2", "Radiación solar total Qse", { u: "W/m²", min: 0, max: 3000, defecto: 1000 }),
    N("theta_deg", "Ángulo efectivo de incidencia solar θ", { u: "°", min: 0, max: 1000, defecto: 90 }),
  ],
  async calcular(v, extra) {
    let { diametro_mm: d, r_ac_25c_ohm_km: r25, r_ac_75c_ohm_km: r75 } = v;
    if (d === undefined || r25 === undefined || r75 === undefined) {
      if (!v.tipo || !v.calibre) throw new ErrorHerramienta('Indica "tipo" y "calibre" del conductor (o diametro_mm, r_ac_25c_ohm_km y r_ac_75c_ohm_km manuales).');
      const c = await resolverConductor({ red: "Aerea", material: v.tipo, calibre: v.calibre, referencia: v.referencia }, extra);
      extra.entradas.push(ent("conductor", "Conductor", c.etiqueta));
      d ??= c.fila.diametro_cable_mm;
      r25 ??= c.fila.r_ac_25c_ohm_km;
      r75 ??= c.fila.r_ac_75c_ohm_km;
    }
    if (![d, r25, r75].every(Number.isFinite)) throw new ErrorHerramienta("Faltan diámetro o resistencias del conductor en el catálogo; ingrésalos manualmente.");
    extra.entradas.push(ent("diametro_mm", "Diámetro del cable", d, "mm"), ent("r_ac_25c_ohm_km", "Resistencia AC a 25 °C", r25, "Ω/km"), ent("r_ac_75c_ohm_km", "Resistencia AC a 75 °C", r75, "Ω/km"));
    if (v.tc_c <= v.ta_c) throw new ErrorHerramienta("La temperatura máxima del conductor debe ser mayor que la ambiente.");

    const r = calcularAmpacidadAerea({
      diametroMm: d,
      rBajoOhmKm: r25,
      rAltoOhmKm: r75,
      epsilon: v.epsilon,
      alfa: v.alfa,
      taC: v.ta_c,
      tcC: v.tc_c,
      vwMs: v.vw_ms,
      anguloVientoDeg: v.angulo_viento_deg,
      elevacionM: v.elevacion_m,
      qseWm2: v.qse_wm2,
      thetaDeg: v.theta_deg,
    });
    if (!(r.ampacidad > 0)) throw new ErrorHerramienta("Con esos datos el balance térmico no admite corriente (la ganancia solar supera la disipación).");
    return [
      res("ampacidad_a", "Ampacidad", r.ampacidad, "A", 1),
      res("conveccion_w_m", "Pérdida por convección (Qc)", r.intermedios.qc, "W/m", 2),
      res("radiacion_w_m", "Pérdida por radiación (Qr)", r.intermedios.qr, "W/m", 2),
      res("ganancia_solar_w_m", "Ganancia solar (Qs)", r.intermedios.qs, "W/m", 2),
    ];
  },
};

const T_AMP_SUBT = {
  nombre: "calcular_ampacidad_subterranea",
  tipo: "calculo",
  titulo: "Ampacidad subterránea",
  descripcion:
    "Calcula la corriente admisible (A) de un cable de media tensión en banco de ductos, en régimen permanente (IEC 60287-1-1). " +
    "La construcción del cable sale del catálogo según material, calibre, pantalla y nivel de aislamiento. " +
    "En cable monopolar también entrega la corriente circulante en la pantalla (puesta a tierra «Ambos Extremos») o la tensión inducida a circuito abierto en V/km («Unipuntual» y «Cross-bonding»).",
  campos: [
    S("tipo_cable", "Tipo de cable", { enum: ["Monopolar", "Tripolar"], defecto: "Monopolar" }),
    S("material", "Material del conductor", { enum: ["Cobre", "Aluminio"], req: true }),
    S("calibre", "Calibre: 1/0 AWG, 2/0 AWG, 3/0 AWG, 4/0 AWG, 250 kcmil, 350 kcmil, 500 kcmil, 750 kcmil o 1000 kcmil", { e: "Calibre", req: true }),
    S("tipo_pantalla", "Tipo de pantalla metálica", { enum: ["Hilos", "Cinta"], req: true }),
    N("nivel_aislamiento_kv", "Nivel de aislamiento: 15, 35 o 46", { e: "Nivel de aislamiento", u: "kV", req: true }),
    N("nivel_aislamiento_pct", "Porcentaje de aislamiento: 100 o 133 (a 46 kV solo 100)", { e: "% de aislamiento", defecto: 100 }),
    S("puesta_tierra", "Puesta a tierra de pantallas (solo aplica a monopolar)", { e: "Puesta a tierra de pantallas", enum: ["Unipuntual", "Ambos Extremos", "Cross-bonding"], defecto: "Unipuntual" }),
    N("tension_kv", "Tensión del sistema línea-línea", { u: "kV", min: 0, minExcl: true, max: 46, defecto: 34.5 }),
    N("frecuencia_hz", "Frecuencia", { u: "Hz", min: 0, minExcl: true, max: 300, defecto: 60 }),
    N("temp_max_c", "Temperatura máxima del conductor", { u: "°C", min: 0, max: 300, defecto: 90 }),
    N("temp_terreno_c", "Temperatura del terreno", { u: "°C", min: -100, max: 100, defecto: 25 }),
    N("rho_suelo_kmw", "Resistividad térmica del suelo", { u: "K·m/W", min: 0, minExcl: true, max: 1000, defecto: 1 }),
    N("u_ducto_kmw", "Resistencia térmica del ducto", { u: "K·m/W", min: 0, max: 5, defecto: 0.3 }),
    N("separacion_fases_m", "Separación entre fases (solo monopolar)", { e: "Separación entre fases", u: "m", min: 0, minExcl: true, max: 1, defecto: 0.04 }),
    I("num_circuitos", "Número de circuitos en el banco", { min: 1, max: 6, defecto: 1 }),
    N("profundidad_banco_m", "Profundidad de enterramiento del banco", { u: "m", min: 0, minExcl: true, max: 10, defecto: 1 }),
    N("separacion_ductos_m", "Separación entre ductos (relevante con más de 1 circuito)", { e: "Separación entre ductos", u: "m", min: 0.05, max: 1, defecto: 0.2 }),
  ],
  async calcular(v, extra) {
    const cables = await loadData("construccion-cable-subterraneo");
    const cable = cables.find(
      (c) =>
        c.material === v.material &&
        normCalibre(c.calibre_awg_kcmil) === normCalibre(v.calibre) &&
        c.tipo_pantalla === v.tipo_pantalla &&
        c.nivel_aislamiento_kv === v.nivel_aislamiento_kv &&
        c.nivel_aislamiento_pct === v.nivel_aislamiento_pct
    );
    if (!cable) {
      const disponibles = distinct(
        cables.filter((c) => c.material === v.material),
        "calibre_awg_kcmil"
      );
      throw new ErrorHerramienta(
        `No existe una construcción de cable para ${v.material} ${v.calibre}, pantalla ${v.tipo_pantalla}, ${v.nivel_aislamiento_kv} kV / ${v.nivel_aislamiento_pct}%. ` +
          `Combinaciones de nivel válidas: 15/100, 15/133, 35/100, 35/133 y 46/100. Calibres de ${v.material}: ${disponibles.join(", ")}.`
      );
    }
    extra.entradas.push(ent("cable", "Construcción de cable", `${v.material} ${cable.calibre_awg_kcmil}, pantalla de ${v.tipo_pantalla}`));
    if (v.tipo_cable === "Tripolar") extra.notas.push("En cable tripolar la puesta a tierra y la separación entre fases no influyen en el cálculo (igual que la calculadora).");

    const datos = {
      tipoCable: v.tipo_cable,
      cable,
      tipoPantalla: v.tipo_pantalla,
      nivelAislamientoKv: v.nivel_aislamiento_kv,
      puestaTierra: v.puesta_tierra,
      tensionSistemaKv: v.tension_kv,
      frecuenciaHz: v.frecuencia_hz,
      tempMaxC: v.temp_max_c,
      tempTerrenoC: v.temp_terreno_c,
      rhoSueloKmW: v.rho_suelo_kmw,
      uDuctoKmW: v.u_ducto_kmw,
      separacionFasesM: v.separacion_fases_m,
      numCircuitos: v.num_circuitos,
      profundidadBancoM: v.profundidad_banco_m,
      separacionDuctosM: v.separacion_ductos_m,
    };
    const r = calcularAmpacidadSubterranea(datos);
    const i = r.intermedios;
    const salida = [
      res("ampacidad_a", "Ampacidad", r.ampacidad, "A", 1),
      res("resistencia_ac_ohm_m", "Resistencia AC efectiva (R)", i.varR, "Ω/m", 8),
      res("perdida_dielectrica_w_m", "Pérdida dieléctrica (Wd)", i.varWd, "W/m", 6),
      res("lambda1", "Factor de pérdidas en pantalla (λ1)", i.lambda1, "", 4),
      res("t4_kmw", "Resistencia térmica externa (T4)", i.T4, "K·m/W", 4),
      res("delta_theta_c", "Salto térmico admisible (Δθ)", i.deltaTheta, "°C", 1),
    ];
    // Pantalla del cable monopolar (misma logica de la pantalla de la app): solo aplica a monopolar.
    const pant = calcularPantalla(datos, r.ampacidad);
    if (pant) {
      salida.push(res("reactancia_mutua_ohm_m", "Reactancia mutua conductor–pantalla (Xm)", pant.xmOhmM, "Ω/m", 8), res("resistencia_pantalla_ohm_m", "Resistencia de la pantalla a la temperatura máxima (Rs,op)", pant.rsOpOhmM, "Ω/m", 8));
      if (pant.tipo === "circulante") salida.push(res("corriente_circulante_pantalla_a", "Corriente circulante en la pantalla", pant.corrienteA, "A", 1));
      else {
        salida.push(res("tension_inducida_pantalla_v_km", "Tensión inducida en la pantalla a circuito abierto", pant.tensionVKm, "V/km", 1));
        extra.notas.push(`Con puesta a tierra «${v.puesta_tierra}» no circula corriente por la pantalla: queda una tensión inducida a circuito abierto (V por km de cable).`);
      }
    }
    return salida;
  },
};

const MAX_GRUPOS = 6;
const CAMPOS_GRUPO_OCUPACION = [
  I("numero_conductores", "Número de conductores de este tipo", { min: 1, max: 9 }),
  N("diametro_conductor_mm", "Diámetro exterior de cada conductor de este tipo (o usa el catálogo XLPE con material + calibre)", { u: "mm", min: 0, minExcl: true }),
  S("material", "Catálogo XLPE de media tensión: Cobre o Aluminio (junto con calibre; el diámetro es el exterior total del cable)"),
  S("calibre", "Catálogo XLPE: calibre, por ejemplo '4/0', '500' o '95'"),
  S("nivel_tension_kv", "Catálogo XLPE (opcional): nivel de tensión, por ejemplo '15 kV', '35 kV', '17.5 kV' o '36 kV'"),
  N("porcentaje_aislamiento_pct", "Catálogo XLPE (opcional): nivel de aislamiento, 100 o 133 (solo series de 15 y 35 kV)", { min: 0 }),
  S("pantalla", "Catálogo XLPE (opcional): 'Hilos' o 'Cinta' (pantalla de hilos o de cinta de cobre)"),
];

/** Diametro exterior (mm) de un tipo de conductor: el dado, o el del catalogo XLPE (primera coincidencia, igual que la pantalla). */
async function diametroGrupo(t, sub, etiqueta) {
  if (t.diametro_conductor_mm !== undefined) {
    sub.entradas.push(ent("diametro_conductor_mm", "Diámetro del conductor", t.diametro_conductor_mm, "mm"));
    return t.diametro_conductor_mm;
  }
  if (!t.material || !t.calibre) throw new ErrorHerramienta(`Indica "diametro_conductor_mm" o, del catálogo XLPE, "material" y "calibre"${etiqueta}.`);
  const xlpe = await loadData("conductores-xlpe");
  const materiales = distinct(xlpe, "material_conductor");
  const material = materiales.find((m) => norm(m) === norm(t.material));
  if (!material) throw new ErrorHerramienta(`El material "${t.material}" no existe en el catálogo XLPE. Opciones: ${materiales.join(", ")}${etiqueta}.`);
  let filas = xlpe.filter((c) => c.material_conductor === material && normCalibre(c.calibre_awg_kcmil) === normCalibre(t.calibre));
  if (!filas.length) {
    throw new ErrorHerramienta(`El calibre "${t.calibre}" no existe para XLPE ${material}. Calibres disponibles: ${distinct(xlpe.filter((c) => c.material_conductor === material), "calibre_awg_kcmil", "area_conductor_mm2").join(", ")}${etiqueta}.`);
  }
  if (t.nivel_tension_kv) {
    const q = norm(t.nivel_tension_kv).replace(/kv/, "").trim();
    filas = filas.filter((c) => norm(c.nivel_tension_kv).replace(/kv/, "").trim() === q);
  }
  if (t.porcentaje_aislamiento_pct !== undefined) filas = filas.filter((c) => c.porcentaje_aislamiento_pct === t.porcentaje_aislamiento_pct);
  if (t.pantalla) filas = filas.filter((c) => norm(c.pantalla).includes(norm(t.pantalla)));
  if (!filas.length) throw new ErrorHerramienta(`No hay un cable XLPE ${material} ${t.calibre} con ese nivel de tensión, aislamiento y pantalla${etiqueta}.`);
  const fila = filas[0];
  if (filas.length > 1) {
    sub.notas.push(`Hay ${filas.length} cables XLPE ${material} ${fila.calibre_awg_kcmil} (según nivel de tensión, aislamiento y pantalla); se usó el primero (${fila.nivel_tension_kv}, ${fila.pantalla}), igual que la calculadora. Se puede fijar con nivel_tension_kv, porcentaje_aislamiento_pct y pantalla.`);
  }
  sub.entradas.push(ent("conductor", "Conductor (catálogo XLPE)", `${material} ${fila.calibre_awg_kcmil}, ${fila.nivel_tension_kv}, ${fila.pantalla}`), ent("diametro_conductor_mm", "Diámetro exterior total del cable (catálogo)", fila.diametro_total_conductor_mm, "mm"));
  return fila.diametro_total_conductor_mm;
}

const T_OCUPACION = {
  nombre: "calcular_ocupacion_ductos",
  tipo: "calculo",
  titulo: "Ocupación de ductos",
  descripcion:
    "Calcula el % de ocupación de un ducto según el número y diámetro de los conductores y lo valida contra el límite de la NTC-2050 (Cap. 9, Tabla 1, según el número TOTAL de conductores). " +
    "Entrega también el radio de curvatura (12 veces el diámetro exterior del conductor). " +
    "El diámetro interno del ducto sale del catálogo (tipo_tuberia + diametro_nominal) o se ingresa con diametro_tubo_mm. " +
    "El diámetro del conductor se da con diametro_conductor_mm o se toma del catálogo XLPE (material + calibre). Para un solo tipo de conductor bastan los campos de nivel superior; " +
    "si el ducto lleva varios tipos (p. ej. una terna de un calibre y otra de otro) usa \"grupos\", uno por tipo.",
  campos: [
    I("numero_conductores", "Número de conductores dentro del ducto (un solo tipo de conductor)", { e: "Número de conductores", min: 1, max: 9 }),
    N("diametro_conductor_mm", "Diámetro exterior de cada conductor (un solo tipo)", { e: "Diámetro del conductor", u: "mm", min: 0, minExcl: true }),
    S("material", "Un solo tipo, del catálogo XLPE: Cobre o Aluminio (con calibre, en lugar de diametro_conductor_mm)", { oculto: true }),
    S("calibre", "Un solo tipo, del catálogo XLPE: calibre, por ejemplo '4/0' o '500'", { oculto: true }),
    S("nivel_tension_kv", "Catálogo XLPE (opcional): nivel de tensión, por ejemplo '15 kV' o '35 kV'", { oculto: true }),
    N("porcentaje_aislamiento_pct", "Catálogo XLPE (opcional): 100 o 133", { oculto: true, min: 0 }),
    S("pantalla", "Catálogo XLPE (opcional): 'Hilos' o 'Cinta'", { oculto: true }),
    {
      n: "grupos",
      t: "array",
      d: `Solo con VARIOS tipos de conductor en el mismo ducto (hasta ${MAX_GRUPOS}): un objeto por tipo con numero_conductores y diametro_conductor_mm (o material + calibre del catálogo XLPE). Si se usa, se ignoran los campos de un solo tipo`,
      itemCampos: CAMPOS_GRUPO_OCUPACION,
    },
    S("tipo_tuberia", "Tipo de tubería del catálogo (usa buscar_tuberia para ver las opciones)", { oculto: true }),
    S("diametro_nominal", 'Diámetro nominal comercial, por ejemplo 2", 4" o 3/4"', { oculto: true }),
    N("diametro_tubo_mm", "Diámetro interno del ducto (opcional: reemplaza al catálogo)", { u: "mm", min: 0, minExcl: true, max: 10000, oculto: true }),
  ],
  async calcular(v, extra) {
    let dTubo = v.diametro_tubo_mm;
    if (dTubo === undefined) {
      if (!v.tipo_tuberia || !v.diametro_nominal) throw new ErrorHerramienta('Indica "tipo_tuberia" y "diametro_nominal" (o "diametro_tubo_mm" manual).');
      const tuberias = await loadData("tuberias");
      const tipos = distinct(tuberias, "tipo");
      const tipo = tipos.find((t) => norm(t) === norm(v.tipo_tuberia)) || tipos.find((t) => norm(t).includes(norm(v.tipo_tuberia)));
      if (!tipo) throw new ErrorHerramienta(`El tipo de tubería "${v.tipo_tuberia}" no existe. Opciones: ${tipos.join(" | ")}.`);
      const limpio = (s) => norm(s).replace(/["'\s]|pulg|in\b/g, "");
      const deTipo = tuberias.filter((t) => t.tipo === tipo);
      const fila = deTipo.find((t) => limpio(t.diametro_nominal) === limpio(v.diametro_nominal));
      if (!fila) throw new ErrorHerramienta(`No hay diámetro nominal "${v.diametro_nominal}" para ${tipo}. Disponibles: ${[...new Set(deTipo.map((t) => t.diametro_nominal))].join(", ")}.`);
      dTubo = fila.diametro_interno_min_mm;
      extra.entradas.push(ent("tuberia", "Tubería", `${tipo} — ${fila.diametro_nominal}`), ent("diametro_tubo_mm", "Diámetro interno del ducto (catálogo)", dTubo, "mm"));
    } else {
      extra.entradas.push(ent("diametro_tubo_mm", "Diámetro interno del ducto (manual)", dTubo, "mm"));
    }

    const lista = v.grupos?.length ? v.grupos : [v];
    if (v.grupos?.length && v.numero_conductores !== undefined) extra.notas.push('Con "grupos" se ignoran los campos de un solo tipo (numero_conductores, diametro_conductor_mm…).');
    if (lista.length > MAX_GRUPOS) throw new ErrorHerramienta(`Máximo ${MAX_GRUPOS} tipos de conductor en "grupos" (recibí ${lista.length}).`);
    const n = lista.length;
    const grupos = [];
    for (const [i, t] of lista.entries()) {
      if (t.numero_conductores === undefined) throw new ErrorHerramienta(`Falta "numero_conductores"${enTramo(i, n).replace("tramo", "tipo de conductor")}.`);
      const sub = subNuevo();
      const diametroMm = await diametroGrupo(t, sub, enTramo(i, n).replace("tramo", "tipo de conductor"));
      sub.entradas.push(ent("numero_conductores", "Número de conductores", t.numero_conductores));
      const pre = n > 1 ? `Tipo ${i + 1} — ` : "";
      for (const e of sub.entradas) extra.entradas.push(n > 1 ? { ...e, clave: `grupo${i + 1}_${e.clave}`, etiqueta: pre + e.etiqueta } : e);
      extra.notas.push(...sub.notas.map((x) => pre + x));
      grupos.push({ cantidad: t.numero_conductores, diametroMm });
    }

    const r = calcularOcupacionGrupos(dTubo, grupos);
    const salida = [
      res("ocupacion_pct", "Ocupación", r.ocupacionPct, "%"),
      res("limite_pct", "Límite NTC-2050", r.limitePct, "%", 0),
      res("disponible_pct", "Disponible", r.disponiblePct, "%"),
      res("cumple", "Cumple el límite", r.cumple),
    ];
    if (n > 1) salida.push(res("total_conductores", "Total de conductores en el ducto", r.totalConductores, "", 0), res("area_total_mm2", "Área ocupada por los conductores", r.areaCables, "mm²"));
    if (r.totalConductores === 3 && r.jammingRatio !== null) {
      salida.push(res("jamming_ratio", "Relación de atascamiento (D ducto / D conductor)", r.jammingRatio, "", 2), res("riesgo_atascamiento", "Riesgo de atascamiento (2.8–3.2)", r.riesgoAtascamiento));
    }
    if (n === 1) salida.push(res("radio_curvatura_mm", "Radio de curvatura (12D)", r.grupos[0].radioCurvaturaMm, "mm"));
    else {
      r.grupos.forEach((g, i) =>
        salida.push(
          res(`grupo${i + 1}_area_mm2`, `Tipo ${i + 1} — Área ocupada`, g.areaTotal, "mm²"),
          res(`grupo${i + 1}_ocupacion_pct`, `Tipo ${i + 1} — % del ducto`, g.ocupacionPct, "%"),
          res(`grupo${i + 1}_radio_curvatura_mm`, `Tipo ${i + 1} — Radio de curvatura (12D)`, g.radioCurvaturaMm, "mm")
        )
      );
    }
    return salida;
  },
};

const CALCULADORAS = [T_PERDIDAS, T_REGULACION, T_CORTOCIRCUITO, T_AMP_AEREA, T_AMP_SUBT, T_OCUPACION];

// ---------------------------------------------------------------- conductor economico (no entra al barrido: no encaja en su patron de un solo calibre por corrida)

const MIN_OPCIONES_ECONOMICO = 2;
const MAX_OPCIONES_ECONOMICO = 5;

const T_CONDUCTOR_ECONOMICO = {
  nombre: "calcular_conductor_economico",
  tipo: "calculo",
  titulo: "Conductor económico",
  descripcion:
    `Compara entre ${MIN_OPCIONES_ECONOMICO} y ${MAX_OPCIONES_ECONOMICO} opciones de conductor para una línea NUEVA por su COSTO TOTAL ACTUALIZADO (inversión inicial + valor presente del costo de las pérdidas durante "anios"); gana la de menor costo total. ` +
      "El dato de partida es potencia_mw, potencia_mva o corriente_a (uno solo), igual que en Pérdidas. Cada opción de \"opciones\" define su conductor (red+material+calibre del catálogo, o resistencia manual), sus conductores por fase y su costo_conductor_km (precio de UN conductor por km); costo_instalacion_km es opcional (sin él solo se considera el conductor). " +
      "No incluye valor residual, operación y mantenimiento, impuestos ni otras condiciones técnicas (regulación, cortocircuito): esas se validan con las otras calculadoras.",
  campos: [
    ...CAMPOS_LINEA,
    N("factor_carga", "Factor de carga Fc", { req: true, min: 0, max: 1 }),
    N("crecimiento_demanda_pct", "Crecimiento anual de la demanda a partir del año 1; con 0 no crece (uso típico en líneas de una planta de generación ya dimensionada, p. ej. una granja solar, que no va a superar su capacidad instalada)", {
      e: "Crecimiento anual de la demanda",
      min: 0,
      max: 100,
      defecto: 0,
    }),
    I("anios", "Años de análisis (horizonte del estudio; la inversión se paga al inicio del proyecto)", { e: "Años de análisis", min: 1, max: 60, req: true }),
    N("tasa_descuento_pct", "Tasa de descuento nominal anual, con la que se trae a valor de hoy el costo de las pérdidas", { e: "Tasa de descuento", min: 0, max: 100, req: true }),
    N("precio_kwh", "Precio de la energía perdida en el año 1 (costo de compra o reconocido, no la tarifa de venta)", { e: "Precio de la energía perdida", u: "$/kWh", min: 0, minExcl: true, req: true }),
    N("escalada_energia_pct", "Aumento anual del precio de la energía; con 0 no cambia", { e: "Aumento anual del precio", min: 0, max: 100, defecto: 0 }),
    {
      n: "opciones",
      t: "array",
      d: `Entre ${MIN_OPCIONES_ECONOMICO} y ${MAX_OPCIONES_ECONOMICO} opciones de conductor a comparar`,
      req: true,
      itemCampos: [
        ...CAMPOS_CONDUCTOR,
        CAMPO_R_MANUAL,
        CAMPO_POR_FASE,
        N("costo_conductor_km", "Precio de UN conductor (un hilo) por km; se multiplica por 3 fases, conductores por fase y la longitud de la línea para obtener la inversión", { e: "Costo del conductor", u: "$/km", min: 0, minExcl: true, req: true }),
        N("costo_instalacion_km", "Costo de instalación por km de línea sin el conductor (postes, aisladores, herrajes, mano de obra, transporte); opcional, suele ser similar entre calibres cercanos", { e: "Costo de instalación", u: "$/km", min: 0 }),
      ],
    },
  ],
  async calcular(v, extra) {
    const { modo, potenciaMw } = datoPartida(v);
    const listaOp = v.opciones ?? [];
    if (listaOp.length < MIN_OPCIONES_ECONOMICO || listaOp.length > MAX_OPCIONES_ECONOMICO) {
      throw new ErrorHerramienta(`Indica entre ${MIN_OPCIONES_ECONOMICO} y ${MAX_OPCIONES_ECONOMICO} opciones en "opciones" (recibí ${listaOp.length}).`);
    }
    const opciones = [];
    const etiquetas = [];
    for (const [i, t] of listaOp.entries()) {
      if (t.costo_conductor_km === undefined) throw new ErrorHerramienta(`Falta "costo_conductor_km" en la opción ${i + 1}.`);
      const sub = subNuevo();
      const { r75, fila } = await resistencia75(t, sub);
      const porFase = t.conductores_por_fase ?? 1;
      const costoInstalacionKm = t.costo_instalacion_km ?? 0;
      if (t.costo_instalacion_km === undefined) sub.notas.push("costo de instalación no indicado: solo se considera el conductor");
      sub.entradas.push(ent("costo_conductor_km", "Costo del conductor", t.costo_conductor_km, "$/km"));
      if (t.costo_instalacion_km !== undefined) sub.entradas.push(ent("costo_instalacion_km", "Costo de instalación", t.costo_instalacion_km, "$/km"));
      if (porFase > 1) sub.entradas.push(ent("conductores_por_fase", "Conductores por fase", porFase));
      const pre = `Opción ${i + 1} — `;
      for (const e of sub.entradas) extra.entradas.push({ ...e, clave: `opcion${i + 1}_${e.clave}`, etiqueta: pre + e.etiqueta });
      extra.supuestos.push(...sub.supuestos.map((x) => pre + x));
      extra.notas.push(...sub.notas.map((x) => pre + x));
      const sufijoHaz = porFase > 1 ? ` ×${porFase}` : "";
      etiquetas.push(fila ? `${fila.tipo ?? fila.material_conductor} ${fila.calibre_awg_kcmil}${sufijoHaz}` : `manual${sufijoHaz}`);
      opciones.push({ resistenciaOhmKm: r75, numConductoresPorFase: porFase, costoConductorKm: t.costo_conductor_km, costoInstalacionKm });
    }
    const base = {
      tensionLineaKv: v.tension_kv,
      potenciaActivaMw: potenciaMw,
      factorPotencia: v.factor_potencia,
      factorCarga: v.factor_carga,
      longitudKm: v.longitud_km,
      crecimientoDemandaPct: v.crecimiento_demanda_pct ?? 0,
      anios: v.anios,
      tasaDescuentoPct: v.tasa_descuento_pct,
      precioKwh: v.precio_kwh,
      escaladaEnergiaPct: v.escalada_energia_pct ?? 0,
    };
    const r = compararOpcionesEconomico(base, opciones);
    const s = sensibilidadEconomico(base, opciones);
    extra.notas.push(
      "No se incluyen valor residual, costos de operación y mantenimiento, impuestos ni otras condiciones técnicas (regulación, cortocircuito): son decisiones de alcance de esta calculadora."
    );

    const salida = [];
    if (modo !== "potencia") salida.push(res("potencia_activa_mw", "Potencia activa (año 1)", potenciaMw, "MW"));
    salida.push(res("corriente_a", "Corriente (año 1)", r.opciones[0].corrienteAnio1, "A"));
    r.opciones.forEach((o, i) => {
      const pre = `Opción ${i + 1}`;
      const compensa =
        i === r.indiceBase ? "Base (menor inversión)" : o.inversion <= r.opciones[r.indiceBase].inversion ? "—" : o.puntoEquilibrio == null ? `no en ${base.anios} años` : `año ${o.puntoEquilibrio}`;
      salida.push(
        res(`opcion${i + 1}_conductor`, `${pre} — Conductor`, etiquetas[i]),
        res(`opcion${i + 1}_inversion`, `${pre} — Inversión inicial`, o.inversion, "$", 0),
        res(`opcion${i + 1}_perdidas_pct`, `${pre} — Pérdidas del año 1`, o.perdidasPctAnio1, "%"),
        res(`opcion${i + 1}_perdidas_mwh`, `${pre} — Pérdidas del año 1`, o.energiaKwhAnio1 / 1000, "MWh", 1),
        res(`opcion${i + 1}_costo_perdidas_vp`, `${pre} — Costo de las pérdidas (VP)`, o.costoPerdidasVp, "$", 0),
        res(`opcion${i + 1}_costo_total`, `${pre} — Costo total actualizado`, o.costoTotal, "$", 0),
        res(`opcion${i + 1}_compensa`, `${pre} — Compensa su mayor inversión`, compensa)
      );
    });
    salida.push(res("opcion_menor_costo", "Opción de menor costo total", `Opción ${r.mejor + 1} — ${etiquetas[r.mejor]}`));
    salida.push(res("sensibilidad_robusta", "La opción ganadora es la misma en todos los escenarios de sensibilidad", s.cambia ? "No" : "Sí"));

    const instalacionIndicada = listaOp.map((t) => t.costo_instalacion_km !== undefined);
    const filasInstalacion = sensibilidadInstalacionEconomico(r, base.longitudKm, instalacionIndicada);
    filasInstalacion.forEach(({ opcion, umbralKm }) => {
      salida.push(res(`opcion${opcion + 1}_umbral_instalacion_km`, `Opción ${opcion + 1} — diferencia de instalación necesaria para cambiar la conclusión`, umbralKm, "$/km", 0));
    });
    if (filasInstalacion.length) {
      extra.notas.push(
        "Como el costo de instalación no se indicó para alguna opción, \"opcionN_umbral_instalacion_km\" es la DIFERENCIA de costo de instalación (entre esa opción y la de menor costo) que haría cambiar cuál es la más económica; no dice cuál instalación sería más cara (eso no se sabe) ni es una estimación del costo de instalación."
      );
    }
    return salida;
  },
};

// ---------------------------------------------------------------- consultas de catalogo

const T_BUSCAR_CONDUCTOR = {
  nombre: "buscar_conductor",
  tipo: "consulta",
  titulo: "Consulta de conductores",
  descripcion:
    "Consulta los catálogos de conductores (desnudos, semiaislados, XLPE). Sin filtros devuelve las familias/materiales y calibres disponibles. " +
    "Úsala antes de calcular si no estás seguro de un calibre o referencia, y para conocer resistencias, diámetros y ampacidades de catálogo.",
  campos: [
    S("familia", "Catálogo a consultar", { enum: ["desnudos", "semiaislados", "xlpe"], req: true }),
    S("tipo_o_material", "Filtro opcional: en desnudos la familia (ACSR, AAAC…); en xlpe y semiaislados el material (Cobre, Aluminio, AAAC…)"),
    S("calibre", "Filtro opcional por calibre, por ejemplo '4/0' o '477'"),
    S("texto", "Filtro opcional por texto del nombre de la referencia"),
  ],
  async consultar(v) {
    const clave = { desnudos: "conductores-desnudos", semiaislados: "conductores-semiaislados", xlpe: "conductores-xlpe" }[v.familia];
    const filas = await loadData(clave);
    const campoTipo = { desnudos: "tipo", semiaislados: "material_conductor", xlpe: "material_conductor" }[v.familia];

    let sel = filas;
    if (v.tipo_o_material) sel = sel.filter((c) => norm(c[campoTipo]) === norm(v.tipo_o_material));
    if (v.calibre) sel = sel.filter((c) => normCalibre(c.calibre_awg_kcmil) === normCalibre(v.calibre));
    if (v.texto) sel = sel.filter((c) => norm(c.nombre_clave || "").includes(norm(v.texto)));

    if (!v.tipo_o_material && !v.calibre && !v.texto) {
      const grupos = {};
      for (const f of filas) (grupos[f[campoTipo]] ||= []).push(f.calibre_awg_kcmil);
      return {
        total: filas.length,
        grupos: Object.fromEntries(Object.entries(grupos).map(([k, cal]) => [k, { cantidad: cal.length, calibres: [...new Set(cal)].slice(0, 60) }])),
      };
    }

    const proyectar = {
      desnudos: (c) => ({
        tipo: c.tipo, calibre: c.calibre_awg_kcmil, referencia: c.nombre_clave, area_mm2: c.area_seccion_aluminio_mm2, diametro_mm: c.diametro_cable_mm,
        r_ac_25c_ohm_km: c.r_ac_25c_ohm_km, r_ac_75c_ohm_km: c.r_ac_75c_ohm_km, rmg_mm: c.radio_medio_geometrico_mm, corriente_75c_a: c.corriente_75c_a, masa_kg_km: c.masa_kg_km,
      }),
      semiaislados: (c) => ({
        capas: c.capas, tension: c.tension_operacion_kv, material: c.material_conductor, calibre: c.calibre_awg_kcmil, referencia: c.nombre_clave,
        diametro_total_mm: c.diametro_total_mm, masa_kg_km: c.masa_total_kg_km,
      }),
      xlpe: (c) => ({
        nivel_tension: c.nivel_tension_kv, aislamiento_pct: c.porcentaje_aislamiento_pct, material: c.material_conductor, calibre: c.calibre_awg_kcmil,
        area_mm2: c.area_conductor_mm2, diametro_conductor_mm: c.diametro_conductor_mm, diametro_total_mm: c.diametro_total_conductor_mm,
        r_ac_75c_ohm_km: c.r_ac_75c_ohm_km, r_ac_90c_ohm_km: c.r_ac_90c_ohm_km, rmg_mm: c.radio_medio_geometrico_mm,
      }),
    }[v.familia];
    return { coincidencias: sel.length, mostrando: Math.min(sel.length, MAX_FILAS_CONSULTA), filas: sel.slice(0, MAX_FILAS_CONSULTA).map(proyectar) };
  },
};

const T_BUSCAR_TUBERIA = {
  nombre: "buscar_tuberia",
  tipo: "consulta",
  titulo: "Consulta de tuberías",
  descripcion: "Consulta el catálogo de tuberías (ductos): tipos disponibles, diámetros nominales y diámetro interno en mm. Sin filtros lista los tipos.",
  campos: [S("tipo", "Filtro opcional por tipo de tubería (texto parcial, por ejemplo 'PVC' o 'EMT')")],
  async consultar(v) {
    const tuberias = await loadData("tuberias");
    if (!v.tipo) return { tipos: distinct(tuberias, "tipo") };
    const sel = tuberias.filter((t) => norm(t.tipo).includes(norm(v.tipo)));
    return {
      coincidencias: sel.length,
      filas: sel.slice(0, 30).map((t) => ({ tipo: t.tipo, diametro_nominal: t.diametro_nominal, diametro_interno_mm: t.diametro_interno_min_mm })),
    };
  },
};

// ---------------------------------------------------------------- barrido

const T_BARRIDO = {
  nombre: "barrer_parametro",
  tipo: "barrido",
  titulo: "Barrido de parámetro",
  descripcion:
    `Ejecuta una calculadora varias veces variando UN parámetro (análisis de sensibilidad o comparación de escenarios), hasta ${MAX_PUNTOS_BARRIDO} puntos, ` +
    "en una sola llamada. Los demás parámetros van fijos en parametros_json. Para variar valores numéricos usa desde/hasta/pasos o la lista valores; " +
    "para comparar alternativas de texto (calibres, materiales…) usa valores_texto.",
  campos: [
    S("herramienta", "Calculadora a ejecutar", { req: true, enum: CALCULADORAS.map((t) => t.nombre) }),
    S("parametros_json", "Objeto JSON, escrito como texto, con los parámetros fijos de esa calculadora (mismos nombres que en la calculadora)", { req: true }),
    S("parametro", "Nombre del parámetro que se va a variar", { req: true }),
    N("desde", "Valor inicial (con hasta y pasos)"),
    N("hasta", "Valor final (con desde y pasos)"),
    I("pasos", `Cantidad de puntos entre desde y hasta, incluidos los extremos (2 a ${MAX_PUNTOS_BARRIDO})`, { min: 2, max: MAX_PUNTOS_BARRIDO, defecto: 10 }),
    { n: "valores", t: "array", items: "number", d: "Lista explícita de valores numéricos (alternativa a desde/hasta/pasos)" },
    { n: "valores_texto", t: "array", items: "string", d: "Lista explícita de valores de texto, por ejemplo calibres ['1/0','4/0','336.4']" },
  ],
};

// ---------------------------------------------------------------- herramientas de diseno (opcionales)
// Meta-herramientas: no traen formulas nuevas; combinan las calculadoras de arriba para responder preguntas de DISENO
// (que conductor cumple, cumple este conductor, que valor deja el resultado justo en el limite). Son `opcional`: el agente
// estandar NO las usa; solo un agente propio las activa. Para funcionar el agente necesita tambien habilitadas las
// calculadoras que ellas usan (igual que el barrido).

const DESC_LIMITES =
  "Referencias de diseño de la aplicación (NO son límite normativo): pérdidas 1 % óptimo / 3 % aceptable; regulación 5 % óptimo / 10 % aceptable. " +
  "Si el usuario no da un límite se usa el «aceptable» y hay que decirlo.";

const CAMPOS_CASO = [
  ...sinDefecto(CAMPOS_LINEA),
  N("factor_carga", "Factor de carga Fc (necesario para evaluar las pérdidas)", { e: "Factor de carga", min: 0, max: 1 }),
  I("conductores_por_fase", "Conductores por fase (haz); por defecto 1", { e: "Conductores por fase", min: 1, max: 6 }),
  N("dab_m", "Distancia entre fases A-B (necesaria para evaluar la regulación)", { e: "Distancia A-B", u: "m", min: 0, minExcl: true }),
  N("dac_m", "Distancia entre fases A-C (regulación)", { e: "Distancia A-C", u: "m", min: 0, minExcl: true }),
  N("dbc_m", "Distancia entre fases B-C (regulación)", { e: "Distancia B-C", u: "m", min: 0, minExcl: true }),
  N("perdidas_max_pct", `Límite de pérdidas (%). ${DESC_LIMITES}`, { e: "Pérdidas máximas", u: "%", min: 0, minExcl: true, max: 100 }),
  N("regulacion_max_pct", "Límite de caída de tensión (%). Por defecto 10 (aceptable)", { e: "Caída de tensión máxima", u: "%", min: 0, minExcl: true, max: 100 }),
  N("corriente_falla_ka", "Corriente de falla que el conductor debe soportar (activa el criterio de cortocircuito)", { e: "Corriente de falla a soportar", u: "kA", min: 0, minExcl: true }),
  N("tiempo_s", "Tiempo de despeje de la falla (por defecto 0.3)", { e: "Tiempo de despeje", u: "s", min: 0, minExcl: true, max: 60 }),
  N("temp_falla_c", "Temperatura máxima admisible en falla (por defecto 250)", { e: "Temperatura en falla", u: "°C", min: 0, max: 500 }),
  N("ta_c", "Solo red Aerea, ampacidad: temperatura ambiente (por defecto 25)", { e: "Temperatura ambiente", u: "°C", min: -100, max: 1000 }),
  N("vw_ms", "Solo red Aerea, ampacidad: velocidad del viento (por defecto 0.61)", { e: "Velocidad del viento", u: "m/s", min: 0, max: 100 }),
];

const CRITERIOS_TXT =
  "Se evalúan SOLO los criterios para los que hay datos: pérdidas (tensión, factor de potencia, dato de partida, longitud y factor de carga), " +
  "regulación (lo mismo, sin factor de carga, más las tres distancias entre fases), ampacidad (solo red Aerea; necesita el dato de partida para conocer la corriente de carga) " +
  "y cortocircuito (con corriente_falla_ka). Hace falta al menos un criterio. Una línea de un solo tramo.";

const calcDe = (nombre) => CALCULADORAS.find((c) => c.nombre === nombre);

function exigirPermitida(ctx, nombre) {
  if (ctx.permitidas && !ctx.permitidas.has(nombre)) {
    throw new ErrorHerramienta(`Para esto el agente necesita también la calculadora "${nombre}", que no está habilitada. Disponibles: ${disponibles(ctx).join(", ")}.`);
  }
}

const tomar = (v, claves) => Object.fromEntries(claves.filter((k) => v[k] !== undefined).map((k) => [k, v[k]]));

/** Corriente de carga (A) a partir del dato de partida. */
function corrienteCarga(v) {
  if (v.corriente_a !== undefined) return v.corriente_a;
  const { potenciaMw } = datoPartida(v);
  return (potenciaMw * 1000) / (Math.sqrt(3) * v.tension_kv * v.factor_potencia);
}

/** Que criterios se pueden evaluar con los datos recibidos. */
function criteriosActivos(v, red) {
  const hayLinea = v.tension_kv !== undefined && v.factor_potencia !== undefined && ["potencia_mw", "potencia_mva", "corriente_a"].some((k) => v[k] !== undefined);
  const c = { perdidas: false, regulacion: false, ampacidad: false, cortocircuito: false, faltantes: [] };
  if (hayLinea && v.longitud_km !== undefined && v.factor_carga !== undefined) c.perdidas = true;
  if (hayLinea && v.longitud_km !== undefined && v.dab_m !== undefined && v.dac_m !== undefined && v.dbc_m !== undefined) c.regulacion = true;
  if (hayLinea && red === "Aerea") c.ampacidad = true;
  if (v.corriente_falla_ka !== undefined) c.cortocircuito = true;
  if (v.perdidas_max_pct !== undefined && !c.perdidas) c.faltantes.push('"perdidas_max_pct" se dio pero faltan datos para las pérdidas (tensión, factor de potencia, dato de partida, longitud_km y factor_carga)');
  if (v.regulacion_max_pct !== undefined && !c.regulacion) c.faltantes.push('"regulacion_max_pct" se dio pero faltan datos para la regulación (tensión, factor de potencia, dato de partida, longitud_km y dab_m, dac_m, dbc_m)');
  if (c.faltantes.length) throw new ErrorHerramienta(`Faltan datos: ${c.faltantes.join("; ")}.`);
  if (!(c.perdidas || c.regulacion || c.ampacidad || c.cortocircuito)) {
    throw new ErrorHerramienta(
      "No hay datos para ningún criterio: da los de pérdidas o regulación (línea + longitud + factor_carga o distancias), el dato de partida (ampacidad, red Aerea) o corriente_falla_ka (cortocircuito)."
    );
  }
  return c;
}

/** Evalua UN conductor del catalogo contra los criterios activos. Devuelve el valor y el cumplimiento de cada criterio. */
async function evaluarConductor(v, red, material, calibre, referencia, act) {
  const salida = { criterios: [] };
  const linea = tomar(v, ["tension_kv", "factor_potencia", "potencia_mw", "potencia_mva", "corriente_a", "longitud_km", "conductores_por_fase"]);
  const cond = { red, material, calibre, ...(referencia ? { referencia } : {}) };
  const valor = (corrida, clave) => corrida.resultados.find((r) => r.clave === clave)?.valor;

  if (act.perdidas) {
    const c = await correrCalculo(calcDe("calcular_perdidas"), { ...linea, factor_carga: v.factor_carga, ...cond });
    const limite = v.perdidas_max_pct ?? P_ACE;
    const x = valor(c, "perdidas_pct");
    salida.criterios.push({ clave: "perdidas_pct", nombre: "Pérdidas", valor: x, unidad: "%", dec: 2, limite, sentido: "max", cumple: x <= limite });
  }
  if (act.regulacion) {
    const c = await correrCalculo(calcDe("calcular_regulacion"), { ...linea, ...tomar(v, ["dab_m", "dac_m", "dbc_m"]), ...cond });
    const limite = v.regulacion_max_pct ?? R_ACE;
    const x = valor(c, "caida_tension_pct");
    salida.criterios.push({ clave: "caida_tension_pct", nombre: "Caída de tensión", valor: x, unidad: "%", dec: 2, limite, sentido: "max", cumple: x <= limite });
  }
  if (act.ampacidad) {
    const c = await correrCalculo(calcDe("calcular_ampacidad_aerea"), { tipo: material, calibre, ...(referencia ? { referencia } : {}), ...tomar(v, ["ta_c", "vw_ms"]) });
    const x = valor(c, "ampacidad_a");
    const carga = corrienteCarga(v);
    salida.criterios.push({ clave: "ampacidad_a", nombre: "Ampacidad", valor: x, unidad: "A", dec: 1, limite: carga, limiteEtiqueta: "corriente de carga", sentido: "min", cumple: x >= carga });
  }
  if (act.cortocircuito) {
    const c = await correrCalculo(calcDe("calcular_cortocircuito"), { ...cond, ...tomar(v, ["tiempo_s", "temp_falla_c"]) });
    const x = valor(c, "capacidad_cc_ka");
    salida.criterios.push({ clave: "capacidad_cc_ka", nombre: "Corriente de cortocircuito admisible", valor: x, unidad: "kA", dec: 2, limite: v.corriente_falla_ka, limiteEtiqueta: "corriente de falla", sentido: "min", cumple: x >= v.corriente_falla_ka });
  }
  salida.cumple = salida.criterios.every((k) => k.cumple);
  return salida;
}

/** Calculadoras que hay que tener habilitadas segun los criterios activos. */
const CALCS_DE_CRITERIOS = { perdidas: "calcular_perdidas", regulacion: "calcular_regulacion", ampacidad: "calcular_ampacidad_aerea", cortocircuito: "calcular_cortocircuito" };
function exigirCalculadoras(ctx, act) {
  for (const [k, nombre] of Object.entries(CALCS_DE_CRITERIOS)) if (act[k]) exigirPermitida(ctx, nombre);
}

const resCriterio = (k) => [res(k.clave, k.nombre, k.valor, k.unidad, k.dec)];
const textoCriterio = (k) => `${k.nombre} ${k.sentido === "max" ? "≤" : "≥"} ${redondear(k.limite)} ${k.unidad}`;

/** Filas del catalogo de una red+material, una por calibre (la primera, como hacen las calculadoras), de menor a mayor area. */
async function candidatosDe(red, material) {
  if (red === "Aerea") {
    const desnudos = await loadData("conductores-desnudos");
    const tipos = distinct(desnudos, "tipo");
    const tipo = tipos.find((t) => norm(t) === norm(material));
    if (!tipo) throw new ErrorHerramienta(`El material/tipo "${material}" no existe en conductores desnudos. Opciones: ${tipos.join(", ")}.`);
    const vistos = new Set();
    const lista = desnudos.filter((c) => c.tipo === tipo && Number.isFinite(c.area_seccion_aluminio_mm2) && !vistos.has(c.calibre_awg_kcmil) && vistos.add(c.calibre_awg_kcmil));
    return { material: tipo, filas: lista.map((f) => ({ calibre: f.calibre_awg_kcmil, area: f.area_seccion_aluminio_mm2, etiqueta: `${tipo} ${f.calibre_awg_kcmil} (${f.nombre_clave})` })).sort((a, b) => a.area - b.area) };
  }
  const xlpe = await loadData("conductores-xlpe");
  const materiales = distinct(xlpe, "material_conductor");
  const mat = materiales.find((m) => norm(m) === norm(material));
  if (!mat) throw new ErrorHerramienta(`El material "${material}" no existe en el catálogo XLPE. Opciones: ${materiales.join(", ")}.`);
  const vistos = new Set();
  const lista = xlpe.filter((c) => c.material_conductor === mat && Number.isFinite(c.area_conductor_mm2) && !vistos.has(c.calibre_awg_kcmil) && vistos.add(c.calibre_awg_kcmil));
  return { material: mat, filas: lista.map((f) => ({ calibre: f.calibre_awg_kcmil, area: f.area_conductor_mm2, etiqueta: `XLPE ${mat} ${f.calibre_awg_kcmil}` })).sort((a, b) => a.area - b.area) };
}

const CAMPOS_RED_MATERIAL = [
  S("red", "Tipo de red: 'Aerea' (catálogo de conductores desnudos) o 'Subterranea' (catálogo XLPE)", { e: "Red", req: true, enum: ["Aerea", "Subterranea"] }),
  S("material", "Aerea: familia (ACSR, AAAC, ACAR, AAC o ACSS). Subterranea: material (Cobre o Aluminio)", { e: "Material", req: true }),
];

const T_DIMENSIONAR = {
  nombre: "dimensionar_conductor",
  tipo: "diseno",
  titulo: "Dimensionar conductor",
  grupo: "Análisis",
  opcional: true,
  descripcion:
    "Encuentra el conductor MÁS PEQUEÑO del catálogo (de una familia o material) que cumple TODOS los criterios pedidos, evaluando cada calibre con las calculadoras. " +
    `${CRITERIOS_TXT} Devuelve el conductor recomendado, la tabla de todos los calibres evaluados y qué criterios incumple cada uno. ${DESC_LIMITES}`,
  campos: [...CAMPOS_RED_MATERIAL, ...CAMPOS_CASO],
  async ejecutar(args, ctx) {
    const { v, entradas, supuestos } = normalizar(this.campos, args);
    const act = criteriosActivos(v, v.red);
    exigirCalculadoras(ctx, act);
    consumir(ctx, 1);
    const { material, filas } = await candidatosDe(v.red, v.material);
    if (!filas.length) throw new ErrorHerramienta("No hay conductores con área en el catálogo para esa red y material.");

    const evaluados = [];
    const noEvaluables = [];
    for (const f of filas) {
      try {
        evaluados.push({ f, r: await evaluarConductor(v, v.red, material, f.calibre, null, act) });
      } catch (e) {
        if (!(e instanceof ErrorHerramienta)) throw e;
        noEvaluables.push(`${f.etiqueta}: ${e.message}`);
      }
    }
    if (!evaluados.length) throw new ErrorHerramienta(`No se pudo evaluar ningún calibre. ${noEvaluables[0] || ""}`);

    const criterios = evaluados[0].r.criterios.map(textoCriterio);
    const notas = [`Se evaluaron ${evaluados.length} calibres de ${material} (${v.red === "Aerea" ? "conductores desnudos" : "cables XLPE"}), de menor a mayor área; criterios: ${criterios.join(" · ")}.`];
    if (act.perdidas) notas.push(nota(P_OPT, P_ACE, "las pérdidas"));
    if (act.regulacion) notas.push(nota(R_OPT, R_ACE, "la caída de tensión"));
    if (act.ampacidad) notas.push("Ampacidad con las condiciones de la calculadora aérea (por defecto o las dadas), comparada con la corriente de carga.");
    if (act.cortocircuito) notas.push("Cortocircuito: capacidad admisible del conductor comparada con la corriente de falla dada.");
    if (noEvaluables.length) notas.push(`No evaluables (${noEvaluables.length}): ${noEvaluables.slice(0, 3).join(" | ")}${noEvaluables.length > 3 ? " …" : ""}`);
    notas.push("De cada calibre se usó la primera referencia del catálogo, igual que las calculadoras.");

    // una fila del reporte por calibre evaluado (la tabla del reporte sale de aqui, no de texto de la IA)
    for (const { f, r } of evaluados) {
      ctx.log.push({
        id: ctx.siguienteId++,
        herramienta: this.nombre,
        titulo: this.titulo,
        barrido: true,
        entradas: [...entradas, ent("conductor", "Conductor", f.etiqueta)],
        supuestos,
        notas,
        resultados: [...r.criterios.flatMap(resCriterio), res("cumple", "Cumple todos los criterios", r.cumple)],
      });
    }

    const elegido = evaluados.find((e) => e.r.cumple);
    const fila = ({ f, r }) => ({
      conductor: f.etiqueta,
      area_mm2: redondear(f.area),
      cumple: r.cumple,
      valores: Object.fromEntries(r.criterios.map((k) => [k.clave, redondear(k.valor)])),
      ...(r.cumple ? {} : { incumple: r.criterios.filter((k) => !k.cumple).map(textoCriterio) }),
    });
    return {
      ok: true,
      criterios_usados: criterios,
      conductor_recomendado: elegido ? fila(elegido) : null,
      ...(elegido ? {} : { mensaje: "Ningún calibre del catálogo cumple todos los criterios juntos; ver los valores de cada uno (por ejemplo, considera más conductores por fase, otra familia o relajar un criterio)." }),
      calibres_evaluados: evaluados.map(fila),
      notas,
    };
  },
};

const T_VERIFICAR = {
  nombre: "verificar_conductor",
  tipo: "diseno",
  titulo: "Verificar conductor",
  grupo: "Análisis",
  opcional: true,
  descripcion:
    "Verifica UN conductor concreto del catálogo contra todos los criterios para los que hay datos y dice, criterio por criterio, su valor, el límite, el margen y si cumple. " +
    `${CRITERIOS_TXT} ${DESC_LIMITES}`,
  campos: [
    ...CAMPOS_RED_MATERIAL,
    S("calibre", "Calibre del catálogo, por ejemplo '4/0', '336.4' o '500'. Usa buscar_conductor si dudas", { e: "Calibre", req: true }),
    S("referencia", "Solo red Aerea (opcional): nombre clave de la referencia cuando el calibre tiene varias", { e: "Referencia" }),
    ...CAMPOS_CASO,
  ],
  async ejecutar(args, ctx) {
    const { v, entradas, supuestos } = normalizar(this.campos, args);
    const act = criteriosActivos(v, v.red);
    exigirCalculadoras(ctx, act);
    consumir(ctx, 1);
    const { material, filas } = await candidatosDe(v.red, v.material);
    const fila = filas.find((f) => normCalibre(f.calibre) === normCalibre(v.calibre));
    if (!fila) throw new ErrorHerramienta(`El calibre "${v.calibre}" no existe para ${material}. Calibres disponibles: ${filas.map((f) => f.calibre).join(", ")}.`);
    const r = await evaluarConductor(v, v.red, material, fila.calibre, v.referencia, act);
    const notas = [];
    if (act.perdidas) notas.push(nota(P_OPT, P_ACE, "las pérdidas"));
    if (act.regulacion) notas.push(nota(R_OPT, R_ACE, "la caída de tensión"));
    ctx.log.push({
      id: ctx.siguienteId++,
      herramienta: this.nombre,
      titulo: this.titulo,
      entradas: [...entradas, ent("conductor", "Conductor", fila.etiqueta)],
      supuestos,
      notas,
      resultados: [...r.criterios.flatMap(resCriterio), res("cumple", "Cumple todos los criterios", r.cumple)],
    });
    return {
      ok: true,
      conductor: fila.etiqueta,
      cumple_todos: r.cumple,
      criterios: r.criterios.map((k) => ({
        criterio: k.nombre,
        valor: redondear(k.valor),
        unidad: k.unidad,
        limite: `${k.sentido === "max" ? "≤" : "≥"} ${redondear(k.limite)} ${k.unidad}${k.limiteEtiqueta ? ` (${k.limiteEtiqueta})` : ""}`,
        margen: redondear(k.sentido === "max" ? k.limite - k.valor : k.valor - k.limite),
        cumple: k.cumple,
      })),
      ...(notas.length ? { notas } : {}),
    };
  },
};

const CALCS_LIMITE = ["calcular_perdidas", "calcular_regulacion", "calcular_cortocircuito", "calcular_ampacidad_aerea", "calcular_ampacidad_subterranea"];

const T_LIMITE = {
  nombre: "resolver_valor_limite",
  tipo: "diseno",
  titulo: "Buscar valor límite",
  grupo: "Análisis",
  opcional: true,
  descripcion:
    "Solucionador inverso: encuentra el valor de UN parámetro numérico de una calculadora con el que un resultado queda justo en un valor objetivo " +
    "(por ejemplo la longitud máxima para una caída de tensión de 5 %, o la potencia máxima para un 3 % de pérdidas). " +
    "Los demás parámetros van fijos en parametros_json (SIN el que se busca). Se busca dentro de [minimo, maximo] por bisección y se asume que el resultado crece o decrece de forma continua con el parámetro; " +
    "si el objetivo no está entre los resultados de los dos extremos lo avisa.",
  campos: [
    S("herramienta", "Calculadora a usar", { req: true, enum: CALCS_LIMITE }),
    S("parametros_json", "Objeto JSON, escrito como texto, con los parámetros fijos de esa calculadora (mismos nombres que en la calculadora)", { req: true }),
    S("parametro", "Nombre del parámetro numérico que se busca (por ejemplo longitud_km o potencia_mw)", { req: true }),
    S("resultado", "Clave del resultado que debe llegar al objetivo (por ejemplo caida_tension_pct, perdidas_pct, capacidad_cc_ka, ampacidad_a)", { req: true }),
    N("valor_objetivo", "Valor que debe tener el resultado", { req: true }),
    N("minimo", "Extremo inferior del rango de búsqueda del parámetro", { req: true }),
    N("maximo", "Extremo superior del rango de búsqueda del parámetro", { req: true }),
  ],
  async ejecutar(args, ctx) {
    const { v } = normalizar(this.campos, args);
    const tool = calcDe(v.herramienta);
    exigirPermitida(ctx, tool.nombre);
    let base;
    try {
      base = JSON.parse(v.parametros_json);
    } catch {
      throw new ErrorHerramienta('"parametros_json" no es un JSON válido (debe ser un objeto escrito como texto).');
    }
    if (!base || typeof base !== "object" || Array.isArray(base)) throw new ErrorHerramienta('"parametros_json" debe ser un objeto JSON.');
    const campo = tool.campos.find((c) => c.n === v.parametro);
    if (!campo || (campo.t !== "number" && campo.t !== "integer")) {
      throw new ErrorHerramienta(`"${v.parametro}" no es un parámetro numérico de ${tool.nombre}. Numéricos: ${tool.campos.filter((c) => c.t === "number" || c.t === "integer").map((c) => c.n).join(", ")}.`);
    }
    if (!(v.minimo < v.maximo)) throw new ErrorHerramienta('"minimo" debe ser menor que "maximo".');
    delete base[v.parametro];
    consumir(ctx, 1);

    const evaluar = async (x) => {
      let c;
      try {
        c = await correrCalculo(tool, { ...base, [v.parametro]: x });
      } catch (e) {
        if (e instanceof ErrorHerramienta) throw new ErrorHerramienta(`Con ${v.parametro} = ${redondear(x)}: ${e.message}`);
        throw e;
      }
      const r = c.resultados.find((q) => q.clave === v.resultado);
      if (!r) throw new ErrorHerramienta(`"${v.resultado}" no es un resultado de ${tool.nombre}. Resultados: ${c.resultados.map((q) => q.clave).join(", ")}.`);
      if (typeof r.valor !== "number") throw new ErrorHerramienta(`"${v.resultado}" no es un resultado numérico.`);
      return { corrida: c, y: r.valor };
    };

    let lo = v.minimo;
    let hi = v.maximo;
    const fLo = (await evaluar(lo)).y - v.valor_objetivo;
    const fHi = (await evaluar(hi)).y - v.valor_objetivo;
    if (fLo === 0 || fHi === 0) {
      lo = hi = fLo === 0 ? lo : hi;
    } else if (Math.sign(fLo) === Math.sign(fHi)) {
      throw new ErrorHerramienta(
        `El objetivo ${v.valor_objetivo} no está dentro del rango: con ${v.parametro} = ${redondear(v.minimo)} el resultado es ${redondear(fLo + v.valor_objetivo)} y con ${redondear(v.maximo)} es ${redondear(fHi + v.valor_objetivo)}. Amplía el rango o revisa el parámetro y el resultado elegidos.`
      );
    } else {
      const signoLo = Math.sign(fLo);
      for (let i = 0; i < 80 && hi - lo > 1e-12 * Math.max(1, Math.abs(hi)); i++) {
        const mid = (lo + hi) / 2;
        const f = (await evaluar(mid)).y - v.valor_objetivo;
        if (f === 0) {
          lo = hi = mid;
          break;
        }
        if (Math.sign(f) === signoLo) lo = mid;
        else hi = mid;
      }
    }
    const x = redondear((lo + hi) / 2);
    const fin = await evaluar(x); // la solucion redondeada a 6 cifras: lo que se muestra y se registra sale de este calculo
    ctx.log.push({ id: ctx.siguienteId++, ...fin.corrida, barrido: true, parametroBarrido: v.parametro });
    return {
      ok: true,
      herramienta: tool.nombre,
      parametro_buscado: v.parametro,
      valor_encontrado: x,
      resultado: v.resultado,
      resultado_en_ese_valor: redondear(fin.y),
      valor_objetivo: v.valor_objetivo,
      parametros_fijos: base,
      nota: "Solución por bisección; el resultado en ese valor lo entrega la propia calculadora (parámetro redondeado a 6 cifras).",
    };
  },
};

const DISENO = [T_DIMENSIONAR, T_VERIFICAR, T_LIMITE];

// ---------------------------------------------------------------- ficha del proyecto (opcional; la usa el agente riguroso)
// No calcula ni gasta presupuesto (como "consulta"), pero SI debe persistir durante toda la conversacion y
// aparecer en el reporte (a diferencia de "consulta", que ni se guarda): por eso tiene su propio tipo "ficha".

const CAMPOS_PARAMETRO_FICHA = [
  S("clave", "Identificador corto del parámetro, en snake_case (ej. tension_kv)", { req: true }),
  S("etiqueta", "Nombre visible del parámetro (ej. Tensión nominal)", { req: true }),
  S("valor", "Valor confirmado, como texto (puede ser numérico o categórico, ej. \"34.5\" o \"ACSR\")", { req: true }),
  S("unidad", "Unidad del valor, si aplica (ej. kV)", {}),
  S("origen", "'usuario' si el usuario lo dio o lo cambió; 'defecto' si aceptó dejar el valor por defecto de la calculadora", { req: true, enum: ["usuario", "defecto"] }),
];

const T_FICHA_PROYECTO = {
  nombre: "guardar_ficha_proyecto",
  tipo: "ficha",
  titulo: "Ficha del proyecto",
  grupo: "Análisis",
  opcional: true,
  descripcion:
    "Registra o actualiza, por categoría (por ejemplo Sistema, Conductor, Instalación, Condiciones ambientales), los parámetros del " +
    "proyecto que el usuario ya confirmó o aceptó dejar en su valor por defecto. NO calcula nada: es la memoria de los datos de entrada " +
    "para la memoria de cálculo final, y queda registrada en el reporte como tabla «Datos del proyecto», separada de los cálculos. " +
    "Llámala cada vez que una categoría de datos quede confirmada (se puede llamar varias veces, una por categoría, a medida que avanza " +
    "la conversación); si se vuelve a llamar con la misma categoría y clave, el valor se actualiza.",
  campos: [
    S("categoria", "Nombre de la categoría de datos (ej. \"Sistema\", \"Conductor\", \"Instalación\")", { req: true }),
    { n: "parametros", t: "array", d: "Parámetros confirmados de esta categoría", req: true, itemCampos: CAMPOS_PARAMETRO_FICHA },
  ],
  async ejecutar(args, ctx) {
    const { v } = normalizar(this.campos, args);
    let cat = ctx.ficha.find((c) => norm(c.categoria) === norm(v.categoria));
    if (!cat) {
      cat = { categoria: v.categoria, parametros: [] };
      ctx.ficha.push(cat);
    } else {
      cat.categoria = v.categoria; // conserva el nombre mas reciente con el que se la nombro
    }
    for (const p of v.parametros) {
      const i = cat.parametros.findIndex((x) => x.clave === p.clave);
      if (i >= 0) cat.parametros[i] = p;
      else cat.parametros.push(p);
    }
    ctx.log.push({ id: ctx.siguienteId++, herramienta: this.nombre, titulo: this.titulo, ficha: true });
    return { ok: true, categoria: cat.categoria, parametros_guardados: cat.parametros.length, ficha_actual: ctx.ficha };
  },
};

// ---------------------------------------------------------------- varios (opcionales)
// Modulos de la seccion Varios. Son `opcional`: el agente estandar NO los usa; un agente propio los activa con su casilla.
// Quedan fuera de CALCULADORAS, asi que el barrido de parametros tampoco los ofrece.

const CIFRAS_VARIOS = 12; // cifras significativas que recibe el modelo (ver paraModeloResultados)

// Unidades: catalogo data/unidades.json (el mismo de la pantalla con «Habilitar todas las conversiones»): cualquier unidad a
// cualquier otra de su categoria, con factores exactos. La unidad se reconoce por codigo, simbolo o nombre («kgf.m», «kgf·m»,
// «kilogramo-fuerza metro»); primero se busca la coincidencia exacta y luego sin mayusculas ni tildes.
const buscarPor = (lista, dado, campos) => {
  const textos = (x) => campos.map((c) => x[c]).filter(Boolean);
  const exacta = lista.filter((x) => textos(x).includes(dado));
  if (exacta.length === 1) return exacta[0];
  const suave = lista.filter((x) => textos(x).some((t) => norm(t) === norm(dado)));
  return suave.length === 1 ? suave[0] : exacta[0] ?? null;
};
const rotuloUnidad = (u) => `${u.simbolo} (${u.nombre})`;

// Calibre de conductor: «calibre» (AWG/kcmil) -> mm2, kcmil o diametro; mm2 -> calibre comercial mas cercano.
const UNIDADES_CALIBRE = [
  { codigo: "calibre", simbolo: "AWG/kcmil", nombre: "calibre de conductor" },
  { codigo: "mm2", simbolo: "mm²", nombre: "sección en milímetros cuadrados" },
  { codigo: "kcmil", simbolo: "kcmil", nombre: "sección en kcmil" },
  { codigo: "d_mm", simbolo: "mm", nombre: "diámetro en milímetros" },
];
const DESTINOS_CALIBRE = { calibre: ["mm2", "kcmil", "d_mm"], mm2: ["calibre"] };

function convertirCalibre(v, origen, destino, extra) {
  if (!(destino.codigo in { mm2: 1, kcmil: 1, d_mm: 1, calibre: 1 }) || !DESTINOS_CALIBRE[origen.codigo]?.includes(destino.codigo)) {
    throw new ErrorHerramienta(`En Calibre desde ${origen.simbolo} se puede convertir a: ${DESTINOS_CALIBRE[origen.codigo]?.map((c) => UNIDADES_CALIBRE.find((u) => u.codigo === c).simbolo + " (" + c + ")").join(", ") || "(ninguna)"}.`);
  }
  if (origen.codigo === "calibre") {
    if (!v.calibre) throw new ErrorHerramienta(`Indica "calibre" (por ejemplo "4/0 AWG" o "500 kcmil"). Calibres: ${CALIBRES.map((c) => c.codigo).join(", ")}.`);
    const c = CALIBRES.find((x) => normCalibre(x.codigo) === normCalibre(v.calibre));
    if (!c) throw new ErrorHerramienta(`El calibre "${v.calibre}" no está en la lista. Calibres: ${CALIBRES.map((x) => x.codigo).join(", ")}.`);
    const d = datosCalibre(c.codigo);
    extra.entradas.push(ent("categoria", "Categoría", "Calibre de conductor"), ent("calibre", "Calibre", d.codigo), ent("unidad_destino", "Unidad de destino", destino.simbolo));
    const valor = { mm2: d.areaMm2, kcmil: d.kcmil, d_mm: d.diametroMm }[destino.codigo];
    return [{ ...res("valor_convertido", `${destino.codigo === "d_mm" ? "Diámetro" : "Sección"} de ${d.codigo}`, valor, destino.simbolo), dec: undefined, cifras: CIFRAS_VARIOS }];
  }
  if (v.valor === undefined) throw new ErrorHerramienta('Falta "valor" (la sección en mm²).');
  const c = calibrePorArea(v.valor);
  if (!c) throw new ErrorHerramienta("La sección debe ser mayor que cero.");
  extra.entradas.push(ent("categoria", "Categoría", "Calibre de conductor"), { ...ent("valor", "Sección", v.valor, "mm²"), cifras: CIFRAS_VARIOS });
  if (!c.exacto) extra.notas.push(`No hay un calibre comercial de exactamente ${v.valor} mm²: se da el más cercano (${c.codigo}, ${c.areaMm2.toFixed(2)} mm², ${c.diferenciaPct > 0 ? "+" : ""}${c.diferenciaPct.toFixed(1)} %).`);
  return [
    res("valor_convertido", "Calibre comercial más cercano", c.codigo),
    { ...res("area_calibre_mm2", "Sección de ese calibre", c.areaMm2, "mm²"), dec: undefined, cifras: CIFRAS_VARIOS },
    res("diferencia_pct", "Diferencia con la sección pedida", c.diferenciaPct, "%", 2),
  ];
}

const T_CONVERTIR_UNIDADES = {
  nombre: "convertir_unidades",
  tipo: "calculo",
  grupo: "Varios",
  opcional: true,
  titulo: "Conversión de unidades",
  // Las categorias de la descripcion reflejan data/unidades.json (lo vigila tools/verify_ia.html).
  descripcion:
    "Convierte un valor entre unidades de ingeniería (cualquier unidad a cualquier otra de su categoría, con factores exactos). " +
    "Categorías: Longitud, Area, Volumen, Masa, Densidad, Fuerza, Presion, Esfuerzo, Momento, Potencia, Energia, Velocidad, Tiempo, Temperatura, Angulos, PesoLineal (peso por longitud), ResistenciaLineal (resistencia por longitud), ResistividadTermica (resistividad térmica del suelo) y Calibre (calibre AWG/kcmil ↔ mm²). " +
    "La unidad se puede escribir con su abreviatura o su nombre (m, mm, ft, in, km, mi, kgf, N, kN, lbf, kgf.m, N.m, Pa, kPa, MPa, psi, bar, atm, kW, hp, kWh, BTU, kg, lb, L, gal, ohm/km, ohm/kft, K.m/W, C, F, K, deg, rad…); " +
    "si no existe, el error lista las unidades de la categoría. Para Calibre: de \"calibre\" (con el parámetro calibre, p. ej. \"4/0 AWG\") a mm2, kcmil o d_mm (diámetro), o de mm2 (con valor) a \"calibre\" (el comercial más cercano).",
  campos: [
    S("categoria", "Categoría de la magnitud (Longitud, Area, Volumen, Masa, Densidad, Fuerza, Presion, Esfuerzo, Momento, Potencia, Energia, Velocidad, Tiempo, Temperatura, Angulos, PesoLineal, ResistenciaLineal, ResistividadTermica, Calibre)", { req: true, oculto: true }),
    S("unidad_origen", "Unidad en la que está el valor (abreviatura o nombre; en Calibre: 'calibre' o 'mm2')", { req: true, oculto: true }),
    S("unidad_destino", "Unidad a la que se quiere convertir (abreviatura o nombre; en Calibre: 'mm2', 'kcmil', 'd_mm' o 'calibre')", { req: true, oculto: true }),
    N("valor", "Valor a convertir, en la unidad de origen (no se usa cuando el origen de Calibre es 'calibre')", { oculto: true }),
    S("calibre", "Solo categoría Calibre con origen 'calibre': el calibre, por ejemplo '4/0 AWG', '2 AWG' o '500 kcmil'", { oculto: true }),
  ],
  async calcular(v, extra) {
    const catalogo = await loadData("unidades");
    const categorias = catalogo.categorias;
    const cat = buscarPor(categorias, v.categoria, ["clave", "nombre"]);
    if (!cat) throw new ErrorHerramienta(`La categoría "${v.categoria}" no existe. Categorías: ${categorias.map((c) => c.clave).join(", ")}.`);

    if (cat.especial === "calibre") {
      const origen = buscarPor(UNIDADES_CALIBRE, v.unidad_origen, ["codigo", "simbolo", "nombre"]);
      const destino = buscarPor(UNIDADES_CALIBRE, v.unidad_destino, ["codigo", "simbolo", "nombre"]);
      for (const [dado, hallada] of [[v.unidad_origen, origen], [v.unidad_destino, destino]]) {
        if (!hallada) throw new ErrorHerramienta(`La unidad "${dado}" no existe en Calibre. Unidades: ${UNIDADES_CALIBRE.map((u) => u.codigo).join(", ")}.`);
      }
      return convertirCalibre(v, origen, destino, extra);
    }

    const origen = buscarPor(cat.unidades, v.unidad_origen, ["codigo", "simbolo", "nombre"]);
    const destino = buscarPor(cat.unidades, v.unidad_destino, ["codigo", "simbolo", "nombre"]);
    for (const [dado, hallada] of [[v.unidad_origen, origen], [v.unidad_destino, destino]]) {
      if (!hallada) throw new ErrorHerramienta(`La unidad "${dado}" no existe en la categoría ${cat.clave}. Unidades: ${cat.unidades.map(rotuloUnidad).join(", ")}.`);
    }
    if (v.valor === undefined) throw new ErrorHerramienta('Falta el parámetro "valor".');
    const valor = convertirBase(catalogo, cat.clave, origen.codigo, destino.codigo, v.valor);
    extra.entradas.push(
      ent("categoria", "Categoría", cat.clave),
      ent("unidad_origen", "Unidad de origen", origen.simbolo),
      ent("unidad_destino", "Unidad de destino", destino.simbolo),
      { ...ent("valor", "Valor", v.valor), cifras: CIFRAS_VARIOS }
    );
    // sin `dec` ni unidad: los factores dan magnitudes muy distintas y la unidad ya va entre las entradas
    return [{ ...res("valor_convertido", "Valor convertido", valor), dec: undefined, cifras: CIFRAS_VARIOS }];
  },
};

const sistemaDe = (epsg) => SISTEMAS.find((s) => String(s.epsg) === epsg);
const MAX_PUNTOS_COORD = 50;
const CAMPOS_PUNTO = [
  N("este_o_longitud", "Este en metros si el sistema de origen es proyectado; longitud en grados (negativa al oeste) si es geográfico"),
  N("norte_o_latitud", "Norte en metros si el sistema de origen es proyectado; latitud en grados si es geográfico"),
];

const T_CONVERTIR_COORDENADAS = {
  nombre: "convertir_coordenadas",
  tipo: "calculo",
  grupo: "Varios",
  opcional: true,
  titulo: "Conversión de coordenadas",
  descripcion:
    "Convierte una o varias coordenadas entre sistemas de referencia con su código EPSG (~500 códigos: los de Colombia y los más usados del mundo). " +
    `Los principales: ${SISTEMAS.map((s) => s.label).join("; ")}; también las cuadrículas urbanas de Colombia, MAGNA-SIRGAS (4686), Bogotá 1975 (4218/21897), SIRGAS (4674), NAD83, ETRS89 y las zonas UTM (326xx norte, 327xx sur). ` +
    "En un sistema geográfico (p. ej. 4326) se da longitud (negativa al oeste) y latitud, en grados decimales; en uno proyectado, Este y Norte en la unidad del sistema (casi siempre metros). " +
    "Siempre va primero el valor horizontal (este o longitud) y después el vertical (norte o latitud). " +
    "Un punto: este_o_longitud y norte_o_latitud. Varios puntos (hasta " + MAX_PUNTOS_COORD + "): la lista puntos. La herramienta avisa si el punto queda fuera del área de uso de un sistema o si el cambio de datum es aproximado.",
  campos: [
    S("sistema_origen", "Código EPSG del sistema en el que está la coordenada dada, por ejemplo 4326, 3116, 9377 o 'EPSG:32618'", { req: true, oculto: true }),
    S("sistema_destino", "Código EPSG del sistema al que se quiere convertir", { req: true, oculto: true }),
    { ...CAMPOS_PUNTO[0], oculto: true },
    { ...CAMPOS_PUNTO[1], oculto: true },
    { n: "puntos", t: "array", d: `Varios puntos a convertir (hasta ${MAX_PUNTOS_COORD}), cada uno con este_o_longitud y norte_o_latitud; en lugar de los dos campos de un solo punto`, itemCampos: CAMPOS_PUNTO },
  ],
  async calcular(v, extra) {
    const catalogo = await loadData("sistemas-epsg");
    const resolver = (dado, lado) => {
      const codigo = parseCodigoEpsg(String(dado));
      const info = codigo && infoSistema(codigo, catalogo);
      if (!info) {
        throw new ErrorHerramienta(
          `El código EPSG "${dado}" (${lado}) no está entre los ~${Object.keys(catalogo).length} sistemas incluidos: debe ser uno de los códigos del catálogo de la aplicación (Colombia y los más usados del mundo). Los principales: ${SISTEMAS.map((s) => s.epsg).join(", ")}.`
        );
      }
      const s7 = sistemaDe(info.codigo);
      return { ...info, s7, etiqueta: s7 ? s7.label : `${info.codigo} - ${info.nombre}` };
    };
    const o = resolver(v.sistema_origen, "origen");
    const d = resolver(v.sistema_destino, "destino");

    const lista = v.puntos?.length ? v.puntos : [{ este_o_longitud: v.este_o_longitud, norte_o_latitud: v.norte_o_latitud }];
    if (lista.length > MAX_PUNTOS_COORD) throw new ErrorHerramienta(`Máximo ${MAX_PUNTOS_COORD} puntos por llamada (recibí ${lista.length}).`);
    if (v.puntos?.length && v.este_o_longitud !== undefined) extra.notas.push('Con "puntos" se ignoran este_o_longitud y norte_o_latitud.');
    const n = lista.length;
    lista.forEach((p, i) => {
      if (p.este_o_longitud === undefined || p.norte_o_latitud === undefined) {
        throw new ErrorHerramienta(n > 1 || v.puntos?.length ? `Al punto ${i + 1} le falta este_o_longitud o norte_o_latitud.` : 'Indica "este_o_longitud" y "norte_o_latitud" (o una lista "puntos").');
      }
    });

    let proj4 = null;
    const la7 = o.s7 && d.s7;
    if (!la7) {
      try {
        proj4 = await cargarProj4();
      } catch {
        throw new ErrorHerramienta("No se pudo cargar la librería de proyecciones necesaria para estos sistemas.");
      }
    }
    extra.entradas.push(ent("sistema_origen", "Sistema de entrada", o.etiqueta), ent("sistema_destino", "Sistema de salida", d.etiqueta));
    const salida = [];
    const wgs84 = SISTEMAS[0];
    for (const [i, p] of lista.entries()) {
      const x = p.este_o_longitud;
      const y = p.norte_o_latitud;
      const pre = n > 1 ? `Punto ${i + 1} — ` : "";
      const cl = n > 1 ? `punto${i + 1}_` : "";
      if (o.esGeo) {
        if (Math.abs(x) > 180) throw new ErrorHerramienta(`La longitud debe estar entre -180 y 180 grados (recibido: ${x}${n > 1 ? `, punto ${i + 1}` : ""}). Con ${o.etiqueta}, "este_o_longitud" es la longitud y "norte_o_latitud" la latitud.`);
        if (Math.abs(y) > 90) throw new ErrorHerramienta(`La latitud debe estar entre -90 y 90 grados (recibido: ${y}${n > 1 ? `, punto ${i + 1}` : ""}). Con ${o.etiqueta}, "este_o_longitud" es la longitud y "norte_o_latitud" la latitud.`);
      } else if (Math.abs(x) <= 180 && Math.abs(y) <= 90) {
        extra.notas.push(`${pre}Los valores (${x}, ${y}) parecen grados, pero el sistema de entrada (${o.etiqueta}) es proyectado (${o.unidad}): verifica que sea el sistema de origen correcto.`);
      }
      extra.entradas.push(
        { ...ent(`${cl}este_o_longitud`, `${pre}${o.esGeo ? "Longitud" : "Este"}`, x, o.esGeo ? "°" : ""), cifras: CIFRAS_VARIOS },
        { ...ent(`${cl}norte_o_latitud`, `${pre}${o.esGeo ? "Latitud" : "Norte"}`, y, o.esGeo ? "°" : ""), cifras: CIFRAS_VARIOS }
      );
      let xOut;
      let yOut;
      let avisos;
      if (la7) {
        // Los 7 sistemas de siempre: motor original; el area de uso sale del catalogo (como en la pantalla).
        ({ xOut, yOut } = convertirCoordenadas(o.s7, d.s7, x, y));
        const ll = o.esGeo ? { xOut: x, yOut: y } : convertirCoordenadas(o.s7, wgs84, x, y);
        avisos = avisosArea({ nombre: o.etiqueta, bbox: o.bbox }, { nombre: d.etiqueta, bbox: d.bbox }, ll.xOut, ll.yOut);
      } else {
        try {
          const r = convertirEntreSistemas(proj4, catalogo, o.codigo, d.codigo, x, y);
          xOut = r.x;
          yOut = r.y;
          avisos = r.avisos;
        } catch (e) {
          throw new ErrorHerramienta(`${e.message}${n > 1 ? ` (punto ${i + 1})` : ""}`);
        }
      }
      extra.notas.push(...avisos.map((a) => pre + a.texto));
      const unidad = d.esGeo ? "°" : d.unidad === "metros" ? "m" : d.unidad;
      const etiquetas = d.esGeo ? ["Longitud", "Latitud"] : ["Este", "Norte"];
      const claves = d.esGeo ? ["longitud", "latitud"] : ["este", "norte"];
      const dec = d.esGeo ? 6 : 4;
      salida.push(
        { ...res(cl + claves[0], pre + etiquetas[0], xOut, unidad, dec), cifras: CIFRAS_VARIOS },
        { ...res(cl + claves[1], pre + etiquetas[1], yOut, unidad, dec), cifras: CIFRAS_VARIOS }
      );
    }
    return salida;
  },
};

const VARIOS = [T_CONVERTIR_UNIDADES, T_CONVERTIR_COORDENADAS];

// ---------------------------------------------------------------- registro y ejecucion

const REGISTRO = Object.fromEntries(
  [...CALCULADORAS, T_CONDUCTOR_ECONOMICO, T_BUSCAR_CONDUCTOR, T_BUSCAR_TUBERIA, T_BARRIDO, ...DISENO, T_FICHA_PROYECTO, ...VARIOS].map((t) => [t.nombre, t])
);

// Cada agente elige cuales herramientas puede usar. Una herramienta con `opcional: true` no forma parte de las del
// agente estandar (queda desmarcada hasta que un agente propio la active); `grupo` la ubica en el formulario.
const GRUPOS = { calculo: "Calculadoras", consulta: "Catálogos", barrido: "Análisis" };

/** Herramientas de la app, para que el formulario del agente ofrezca cuales habilitar. */
export function catalogoHerramientas() {
  return Object.values(REGISTRO).map((t) => ({ nombre: t.nombre, titulo: t.titulo, grupo: t.grupo || GRUPOS[t.tipo], descripcion: t.descripcion }));
}

/** Las del agente estandar: todas salvo las opcionales. */
export const HERRAMIENTAS_ESTANDAR = Object.freeze(Object.values(REGISTRO).filter((t) => !t.opcional).map((t) => t.nombre));

/** Todas las herramientas registradas (estandar + opcionales), para agentes que deban tenerlas todas habilitadas. */
export const HERRAMIENTAS_TODAS = Object.freeze(Object.values(REGISTRO).map((t) => t.nombre));

/** Deja solo nombres que existen (sin repetidos), en el orden del registro. */
export function herramientasValidas(nombres) {
  const pedidas = new Set(nombres);
  return Object.keys(REGISTRO).filter((n) => pedidas.has(n));
}

const disponibles = (ctx) => (ctx?.permitidas ? [...ctx.permitidas] : Object.keys(REGISTRO));

/**
 * functionDeclarations para Gemini. Con `permitidas` (lista de nombres) solo se declaran esas; el barrido solo ofrece
 * las calculadoras permitidas y se omite si no hay ninguna.
 */
export function declaraciones(permitidas) {
  const ok = permitidas ? new Set(permitidas) : null;
  const calcs = CALCULADORAS.filter((t) => !ok || ok.has(t.nombre)).map((t) => t.nombre);
  return Object.values(REGISTRO)
    .filter((t) => (!ok || ok.has(t.nombre)) && ((t.tipo !== "barrido" && t.tipo !== "diseno") || calcs.length))
    .map((t) => {
      const parameters = esquemaDe(t.campos);
      if (t.tipo === "barrido") parameters.properties.herramienta.enum = calcs;
      if (t.nombre === "resolver_valor_limite") parameters.properties.herramienta.enum = CALCS_LIMITE.filter((n) => calcs.includes(n));
      return { name: t.nombre, description: t.descripcion, parameters };
    });
}

/** Titulo corto de una llamada para las etiquetas del chat. El barrido dice ademas SOBRE QUE calculadora corre («Barrido de parámetro · Pérdidas»). */
export function tituloDe(nombre, args = null) {
  const base = REGISTRO[nombre]?.titulo || nombre;
  if (nombre === "barrer_parametro") {
    const sobre = REGISTRO[args?.herramienta]?.titulo;
    if (sobre) return `${base} · ${sobre}`;
  }
  return base;
}

/** Ejecuta una calculadora y devuelve una "corrida" auditable. Lanza ErrorHerramienta si hay datos invalidos. */
async function correrCalculo(tool, args) {
  const { v, entradas, supuestos, ignorados } = normalizar(tool.campos, args);
  const extra = { entradas: [], supuestos: [], notas: [] };
  const resultados = await tool.calcular(v, extra);
  for (const r of resultados) {
    if (typeof r.valor === "number" && !Number.isFinite(r.valor)) {
      throw new ErrorHerramienta("El cálculo no produjo un resultado válido con esos datos (revisa unidades y rangos).");
    }
  }
  const notas = [...extra.notas];
  if (ignorados.length) notas.push(`Parámetros no reconocidos e ignorados: ${ignorados.join(", ")}.`);
  return {
    herramienta: tool.nombre,
    titulo: tool.titulo,
    entradas: [...extra.entradas, ...entradas],
    supuestos: [...extra.supuestos, ...supuestos],
    notas,
    resultados,
  };
}

// Al modelo se le entregan 6 cifras significativas, salvo que la entrada o el resultado pida otra cantidad con `cifras`
// (coordenadas y conversiones: 6 cifras dejarian metros de error en un Este de 4 881 143 m).
const paraModeloEntradas = (es) => es.map((e) => ({ nombre: e.etiqueta, valor: redondear(e.valor, e.cifras), ...(e.unidad ? { unidad: e.unidad } : {}) }));
const paraModeloResultados = (rs) => rs.map((r) => ({ nombre: r.etiqueta, valor: redondear(r.valor, r.cifras), ...(r.unidad ? { unidad: r.unidad } : {}) }));

function consumir(ctx, n) {
  const p = ctx.presupuesto;
  if (p.usado + n > p.max) {
    ctx.presupuestoAgotado = true; // para que ejecutarTurno lo muestre igual que el limite de rondas, sin depender de que la IA lo cuente bien
    throw new ErrorHerramienta(
      `Se alcanzó el límite de cálculos por pregunta (${p.max}; quedan ${Math.max(p.max - p.usado, 0)}). Resume con lo obtenido y sugiere continuar en una nueva pregunta.`
    );
  }
  p.usado += n;
}

function linspace(desde, hasta, pasos) {
  return Array.from({ length: pasos }, (_, i) => desde + ((hasta - desde) * i) / (pasos - 1));
}

async function ejecutarBarrido(args, ctx) {
  const { v } = normalizar(T_BARRIDO.campos, args);
  const tool = CALCULADORAS.find((t) => t.nombre === v.herramienta);
  if (ctx.permitidas && !ctx.permitidas.has(tool.nombre)) {
    throw new ErrorHerramienta(`La herramienta "${tool.nombre}" no está habilitada para este agente. Disponibles: ${disponibles(ctx).join(", ")}.`);
  }

  let base;
  try {
    base = JSON.parse(v.parametros_json);
  } catch {
    throw new ErrorHerramienta('"parametros_json" no es un JSON válido (debe ser un objeto escrito como texto).');
  }
  if (!base || typeof base !== "object" || Array.isArray(base)) throw new ErrorHerramienta('"parametros_json" debe ser un objeto JSON.');

  const campo = tool.campos.find((c) => c.n === v.parametro);
  if (!campo) throw new ErrorHerramienta(`"${v.parametro}" no es un parámetro de ${tool.nombre}. Parámetros: ${tool.campos.map((c) => c.n).join(", ")}.`);

  let valores;
  if (Array.isArray(v.valores_texto) && v.valores_texto.length) valores = v.valores_texto.map(String);
  else if (Array.isArray(v.valores) && v.valores.length) valores = v.valores.map(Number);
  else if (v.desde !== undefined && v.hasta !== undefined) valores = linspace(v.desde, v.hasta, v.pasos);
  else throw new ErrorHerramienta('Indica "desde" y "hasta" (con "pasos"), o una lista en "valores" / "valores_texto".');
  if (valores.length > MAX_PUNTOS_BARRIDO) throw new ErrorHerramienta(`Máximo ${MAX_PUNTOS_BARRIDO} puntos por barrido (pediste ${valores.length}).`);
  if (valores.some((x) => typeof x === "number" && !Number.isFinite(x))) throw new ErrorHerramienta("La lista de valores contiene números no válidos.");
  consumir(ctx, valores.length);

  const puntos = [];
  let columnas = [];
  for (const valor of valores) {
    try {
      const corrida = await correrCalculo(tool, { ...base, [v.parametro]: valor });
      corrida.barrido = true;
      corrida.parametroBarrido = v.parametro;
      ctx.log.push({ id: ctx.siguienteId++, ...corrida });
      columnas = corrida.resultados.map((r) => ({ clave: r.clave, nombre: r.etiqueta, unidad: r.unidad }));
      puntos.push({ [v.parametro]: valor, resultados: Object.fromEntries(corrida.resultados.map((r) => [r.clave, redondear(r.valor)])) });
    } catch (e) {
      if (!(e instanceof ErrorHerramienta)) throw e;
      ctx.log.push({ id: ctx.siguienteId++, herramienta: tool.nombre, titulo: tool.titulo, error: `${v.parametro} = ${valor}: ${e.message}` });
      puntos.push({ [v.parametro]: valor, error: e.message });
    }
  }
  return { ok: true, herramienta: tool.nombre, parametro_variado: v.parametro, columnas, puntos, parametros_fijos: base };
}

/**
 * Ejecuta una llamada de Gemini. Nunca lanza por datos invalidos: devuelve
 * { ok:false, error } para que el modelo corrija y reintente.
 * @param {{presupuesto:{max:number,usado:number}, permitidas?:Set<string>|null, log:object[], siguienteId:number}} ctx
 *   `permitidas` (opcional): nombres de las herramientas habilitadas para el agente; null/ausente = todas.
 */
export async function ejecutarLlamada(nombre, args, ctx) {
  const tool = REGISTRO[nombre];
  if (!tool) return { ok: false, error: `Herramienta desconocida "${nombre}". Disponibles: ${disponibles(ctx).join(", ")}.` };
  if (ctx.permitidas && !ctx.permitidas.has(nombre)) {
    return { ok: false, error: `La herramienta "${nombre}" no está habilitada para este agente. Disponibles: ${disponibles(ctx).join(", ")}.` };
  }
  try {
    if (tool.tipo === "calculo") {
      consumir(ctx, 1);
      const corrida = await correrCalculo(tool, args);
      ctx.log.push({ id: ctx.siguienteId++, ...corrida });
      return {
        ok: true,
        herramienta: nombre,
        entradas_usadas: paraModeloEntradas(corrida.entradas),
        supuestos: corrida.supuestos,
        resultados: paraModeloResultados(corrida.resultados),
        ...(corrida.notas.length ? { notas: corrida.notas } : {}),
      };
    }
    if (tool.tipo === "consulta") {
      const { v } = normalizar(tool.campos, args);
      const salida = await tool.consultar(v);
      ctx.log.push({ id: ctx.siguienteId++, herramienta: nombre, titulo: tool.titulo, consulta: true });
      return { ok: true, ...salida };
    }
    if (tool.tipo === "diseno" || tool.tipo === "ficha") return await tool.ejecutar(args, ctx);
    return await ejecutarBarrido(args, ctx);
  } catch (e) {
    if (!(e instanceof ErrorHerramienta)) {
      console.error("Error inesperado en herramienta", nombre, e);
      const msg = `Error interno al ejecutar ${nombre}: ${e?.message || e}`;
      ctx.log.push({ id: ctx.siguienteId++, herramienta: nombre, titulo: tool.titulo, error: msg });
      return { ok: false, error: msg };
    }
    ctx.log.push({ id: ctx.siguienteId++, herramienta: nombre, titulo: tool.titulo, error: e.message });
    return { ok: false, error: e.message };
  }
}

export function crearContexto(maxCalculos, logPrevio = [], fichaPrevia = []) {
  const siguienteId = logPrevio.reduce((m, r) => Math.max(m, r.id || 0), 0) + 1;
  return { presupuesto: { max: maxCalculos, usado: 0 }, log: logPrevio, ficha: fichaPrevia, siguienteId };
}

// ---------------------------------------------------------------- formato de valores

/** Formatea un valor de entrada o resultado para mostrar. */
export function formatearValor(valor, dec) {
  if (typeof valor === "boolean") return valor ? "Sí" : "No";
  if (valor === null || valor === undefined) return "—";
  if (typeof valor === "number") {
    if (!Number.isFinite(valor)) return "—";
    return dec !== undefined ? valor.toFixed(dec) : String(Number(valor.toPrecision(6)));
  }
  return String(valor);
}
