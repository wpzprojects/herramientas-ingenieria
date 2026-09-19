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
import { calcularPerdidas } from "../calc/perdidas.js";
import { calcularRegulacion } from "../calc/regulacion.js";
import { calcularCortocircuito } from "../calc/cortocircuito.js";
import { calcularAmpacidadAerea } from "../calc/ampacidad-aerea.js";
import { calcularAmpacidadSubterranea } from "../calc/ampacidad-subterranea.js";
import { calcularOcupacionDuctos } from "../calc/ocupacion-ductos.js";

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
    if (c.t === "array") p.items = { type: c.items };
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
      v[c.n] = raw;
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
      throw new ErrorHerramienta(`El calibre "${v.calibre}" no existe para ${tipo}. Calibres disponibles: ${distinct(deTipo, "calibre_awg_kcmil").join(", ")}.`);
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
    throw new ErrorHerramienta(`El calibre "${v.calibre}" no existe para XLPE ${material}. Calibres disponibles: ${distinct(deMaterial, "calibre_awg_kcmil").join(", ")}.`);
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

const CAMPOS_LINEA = [
  N("tension_kv", "Tensión línea-línea", { u: "kV", req: true, min: 0, minExcl: true }),
  N("potencia_mw", "Potencia activa", { u: "MW", req: true, min: 0, minExcl: true }),
  N("factor_potencia", "Factor de potencia (cos φ). Si solo se conoce la potencia aparente en MVA, usa esa potencia con factor 1", { e: "Factor de potencia", req: true, min: 0, minExcl: true, max: 1 }),
  N("longitud_km", "Longitud de la línea", { u: "km", req: true, min: 0, minExcl: true }),
];
const CAMPO_R_MANUAL = N("resistencia_ohm_km", "Resistencia AC a 75 °C del conductor (opcional: reemplaza al catálogo)", { u: "Ω/km", min: 0, max: 10000, oculto: true });

const T_PERDIDAS = {
  nombre: "calcular_perdidas",
  tipo: "calculo",
  titulo: "Pérdidas",
  descripcion:
    "Calcula corriente, potencias aparente/reactiva y el % de pérdidas por efecto Joule de una línea trifásica, ajustado por factor de carga. " +
    "El conductor se define con red+material+calibre (resistencia AC a 75 °C del catálogo) o con resistencia_ohm_km manual.",
  campos: [...CAMPOS_LINEA, N("factor_carga", "Factor de carga Fc", { req: true, min: 0, max: 1 }), ...CAMPOS_CONDUCTOR, CAMPO_R_MANUAL],
  async calcular(v, extra) {
    const { r75 } = await resistencia75(v, extra);
    const r = calcularPerdidas({
      tensionLineaKv: v.tension_kv,
      potenciaActivaMw: v.potencia_mw,
      factorPotencia: v.factor_potencia,
      resistenciaOhmKm: r75,
      longitudKm: v.longitud_km,
      factorCarga: v.factor_carga,
    });
    return [
      res("corriente_a", "Corriente", r.corriente, "A"),
      res("potencia_aparente_mva", "Potencia aparente", r.potenciaS, "MVA"),
      res("potencia_reactiva_mvar", "Potencia reactiva", r.potenciaQ, "MVAR"),
      res("perdidas_pct", "Pérdidas", r.perdidasPct, "%"),
    ];
  },
};

const T_REGULACION = {
  nombre: "calcular_regulacion",
  tipo: "calculo",
  titulo: "Regulación",
  descripcion:
    "Calcula la caída de tensión (%) de una línea trifásica, con corriente, potencias y constante de regulación. " +
    "El conductor se define con red+material+calibre (resistencia y radio medio geométrico del catálogo) o con valores manuales.",
  campos: [
    ...CAMPOS_LINEA,
    ...CAMPOS_CONDUCTOR,
    CAMPO_R_MANUAL,
    N("rmg_m", "Radio medio geométrico del conductor (opcional: reemplaza al catálogo)", { u: "m", min: 0, minExcl: true, oculto: true }),
    N("dab_m", "Distancia entre fases A-B", { u: "m", min: 0, minExcl: true, defecto: 2 }),
    N("dac_m", "Distancia entre fases A-C", { u: "m", min: 0, minExcl: true, defecto: 2.84 }),
    N("dbc_m", "Distancia entre fases B-C", { u: "m", min: 0, minExcl: true, defecto: 0.84 }),
  ],
  async calcular(v, extra) {
    const { r75, fila } = await resistencia75(v, extra);
    let rmgM = v.rmg_m;
    if (rmgM === undefined) {
      if (!fila) throw new ErrorHerramienta('Con "resistencia_ohm_km" manual también debes indicar "rmg_m" (radio medio geométrico en metros).');
      rmgM = fila.radio_medio_geometrico_mm / 1000;
      if (!Number.isFinite(rmgM) || rmgM <= 0) throw new ErrorHerramienta('El conductor no tiene radio medio geométrico en el catálogo; indica "rmg_m".');
      extra.entradas.push(ent("rmg_m", "Radio medio geométrico (catálogo)", rmgM, "m"));
    } else {
      extra.entradas.push(ent("rmg_m", "Radio medio geométrico (manual)", rmgM, "m"));
    }
    const r = calcularRegulacion({
      tensionLineaKv: v.tension_kv,
      potenciaActivaMw: v.potencia_mw,
      factorPotencia: v.factor_potencia,
      longitudKm: v.longitud_km,
      resistenciaOhmKm: r75,
      rmgM,
      dabM: v.dab_m,
      dacM: v.dac_m,
      dbcM: v.dbc_m,
    });
    return [
      res("corriente_a", "Corriente", r.corriente, "A"),
      res("potencia_aparente_mva", "Potencia aparente", r.potenciaS, "MVA"),
      res("potencia_reactiva_mvar", "Potencia reactiva", r.potenciaQ, "MVAR"),
      res("constante_regulacion", "Constante de regulación", r.constanteRegulacion, "", 7),
      res("caida_tension_pct", "Caída de tensión", r.caidaTensionPct, "%"),
    ];
  },
};

const T_CORTOCIRCUITO = {
  nombre: "calcular_cortocircuito",
  tipo: "calculo",
  titulo: "Cortocircuito",
  descripcion:
    "Calcula la corriente de cortocircuito admisible (kA) de un conductor según el límite térmico y el tiempo de despeje. " +
    "El área sale del catálogo (red+material+calibre) o se ingresa manualmente con area_mm2 + material_electrico.",
  campos: [
    ...CAMPOS_CONDUCTOR,
    N("area_mm2", "Área del conductor (opcional: reemplaza al catálogo)", { u: "mm²", min: 0, minExcl: true, max: 10000, oculto: true }),
    S("material_electrico", "Cobre o Aluminio; solo necesario con area_mm2 manual", { enum: ["Cobre", "Aluminio"], oculto: true }),
    N("temp_operacion_c", "Temperatura de operación del conductor (por defecto 75 en red aérea, 90 en subterránea)", { e: "Temperatura de operación", u: "°C", min: 0, max: 500 }),
    N("temp_falla_c", "Temperatura máxima admisible en falla", { e: "Temperatura en falla", u: "°C", min: 0, max: 500, defecto: 250 }),    N("tiempo_s", "Tiempo de despeje de la falla", { u: "s", min: 0, minExcl: true, max: 60, defecto: 0.3 }),
  ],
  async calcular(v, extra) {
    let area;
    let materialElectrico;
    let red = v.red;
    if (v.area_mm2 !== undefined) {
      area = v.area_mm2;
      materialElectrico = v.material_electrico || (red === "Aerea" ? "Aluminio" : null);
      if (!materialElectrico) throw new ErrorHerramienta('Con "area_mm2" manual indica "material_electrico" (Cobre o Aluminio).');
      extra.entradas.push(ent("area_mm2", "Área del conductor (manual)", area, "mm²"));
    } else {
      const c = await resolverConductor(v, extra);
      red = c.red;
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
    return [res("capacidad_cc_ka", "Corriente de cortocircuito admisible", r.capacidadCcKa, "kA")];
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
    "La construcción del cable sale del catálogo según material, calibre, pantalla y nivel de aislamiento.",
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

    const r = calcularAmpacidadSubterranea({
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
    });
    const i = r.intermedios;
    return [
      res("ampacidad_a", "Ampacidad", r.ampacidad, "A", 1),
      res("resistencia_ac_ohm_m", "Resistencia AC efectiva (R)", i.varR, "Ω/m", 8),
      res("perdida_dielectrica_w_m", "Pérdida dieléctrica (Wd)", i.varWd, "W/m", 6),
      res("lambda1", "Factor de pérdidas en pantalla (λ1)", i.lambda1, "", 4),
      res("t4_kmw", "Resistencia térmica externa (T4)", i.T4, "K·m/W", 4),
      res("delta_theta_c", "Salto térmico admisible (Δθ)", i.deltaTheta, "°C", 1),
    ];
  },
};

const T_OCUPACION = {
  nombre: "calcular_ocupacion_ductos",
  tipo: "calculo",
  titulo: "Ocupación de ductos",
  descripcion:
    "Calcula el % de ocupación de un ducto según el número y diámetro de los conductores y lo valida contra el límite de la NTC-2050 (Cap. 9, Tabla 1). " +
    "El diámetro interno del ducto sale del catálogo (tipo_tuberia + diametro_nominal) o se ingresa con diametro_tubo_mm.",
  campos: [
    I("numero_conductores", "Número de conductores dentro del ducto", { e: "Número de conductores", req: true, min: 1, max: 9 }),
    N("diametro_conductor_mm", "Diámetro exterior de cada conductor", { e: "Diámetro del conductor", u: "mm", req: true, min: 0, minExcl: true }),
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
    const r = calcularOcupacionDuctos({ numeroConductores: v.numero_conductores, diametroConductorMm: v.diametro_conductor_mm, diametroTuboMm: dTubo });
    const salida = [
      res("ocupacion_pct", "Ocupación", r.ocupacionPct, "%"),
      res("limite_pct", "Límite NTC-2050", r.limitePct, "%", 0),
      res("disponible_pct", "Disponible", r.disponiblePct, "%"),
      res("cumple", "Cumple el límite", r.cumple),
    ];
    if (v.numero_conductores === 3) {
      salida.push(res("jamming_ratio", "Relación de atascamiento (D ducto / D conductor)", r.jammingRatio, "", 2), res("riesgo_atascamiento", "Riesgo de atascamiento (2.8–3.2)", r.riesgoAtascamiento));
    }
    return salida;
  },
};

const CALCULADORAS = [T_PERDIDAS, T_REGULACION, T_CORTOCIRCUITO, T_AMP_AEREA, T_AMP_SUBT, T_OCUPACION];

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

// ---------------------------------------------------------------- registro y ejecucion

const REGISTRO = Object.fromEntries([...CALCULADORAS, T_BUSCAR_CONDUCTOR, T_BUSCAR_TUBERIA, T_BARRIDO].map((t) => [t.nombre, t]));

/** functionDeclarations para Gemini. */
export function declaraciones() {
  return Object.values(REGISTRO).map((t) => ({ name: t.nombre, description: t.descripcion, parameters: esquemaDe(t.campos) }));
}

export function tituloDe(nombre) {
  return REGISTRO[nombre]?.titulo || nombre;
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

const paraModeloEntradas = (es) => es.map((e) => ({ nombre: e.etiqueta, valor: redondear(e.valor), ...(e.unidad ? { unidad: e.unidad } : {}) }));
const paraModeloResultados = (rs) => rs.map((r) => ({ nombre: r.etiqueta, valor: redondear(r.valor), ...(r.unidad ? { unidad: r.unidad } : {}) }));

function consumir(ctx, n) {
  const p = ctx.presupuesto;
  if (p.usado + n > p.max) {
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
 * @param {{presupuesto:{max:number,usado:number}, log:object[], siguienteId:number}} ctx
 */
export async function ejecutarLlamada(nombre, args, ctx) {
  const tool = REGISTRO[nombre];
  if (!tool) return { ok: false, error: `Herramienta desconocida "${nombre}". Disponibles: ${Object.keys(REGISTRO).join(", ")}.` };
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

export function crearContexto(maxCalculos, logPrevio = []) {
  const siguienteId = logPrevio.reduce((m, r) => Math.max(m, r.id || 0), 0) + 1;
  return { presupuesto: { max: maxCalculos, usado: 0 }, log: logPrevio, siguienteId };
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
