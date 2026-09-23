// Agentes de "Analisis con calculadoras": cada uno es el prompt de sistema con el que trabaja Gemini, mas las
// instrucciones del reporte, una temperatura opcional y la lista de herramientas que puede usar (js/ai/tools.js;
// un agente guardado sin lista usa las del estandar). Los agentes predeterminados viven en el codigo
// (AGENTES_PREDETERMINADOS: hoy el estandar y el riguroso): son de solo lectura, no se guardan ni se pueden
// borrar; se pueden ver y duplicar. Los agentes propios se guardan en el navegador (localStorage).

import { SISTEMA_ANALISIS, PROMPT_REPORTE, SISTEMA_RIGUROSO, PROMPT_REPORTE_RIGUROSO } from "./analisis.js";
import { HERRAMIENTAS_ESTANDAR, HERRAMIENTAS_TODAS, herramientasValidas } from "./tools.js";

const K_AGENTES = "ia.agentesAnalisis";
const K_ACTIVO = "ia.agenteAnalisisActivo";

const AGENTE_ESTANDAR = Object.freeze({
  id: "analisis-estandar",
  nombre: "Agente estándar",
  descripcion: "Reglas y reporte originales de la aplicación (solo lectura).",
  temperatura: null, // null = la de Configuracion de IA
  instrucciones: SISTEMA_ANALISIS,
  reporte: PROMPT_REPORTE,
  herramientas: HERRAMIENTAS_ESTANDAR,
  predefinido: true,
});

const AGENTE_RIGUROSO = Object.freeze({
  id: "analisis-riguroso",
  nombre: "Agente riguroso",
  descripcion: "Pide todos los datos por categoría (avisando los valores por defecto) para una memoria de cálculo completa (solo lectura).",
  temperatura: null,
  instrucciones: SISTEMA_RIGUROSO,
  reporte: PROMPT_REPORTE_RIGUROSO,
  herramientas: HERRAMIENTAS_TODAS,
  predefinido: true,
});

/** Los predeterminados, en el orden en que se muestran; ambos de solo lectura, viven en el codigo. */
export const AGENTES_PREDETERMINADOS = Object.freeze([AGENTE_ESTANDAR, AGENTE_RIGUROSO]);

// Alias de compatibilidad: "el" predeterminado historico es el primero (el estandar).
export const ID_PREDETERMINADO = AGENTE_ESTANDAR.id;
export const AGENTE_PREDETERMINADO = AGENTE_ESTANDAR;

/**
 * Regla que la aplicacion agrega SIEMPRE al final de los agentes propios y que ninguna instruccion puede quitar:
 * la IA no calcula, solo interpreta lo que devuelven las calculadoras (principio de esta funcion).
 */
export const REGLA_FIJA =
  "REGLA OBLIGATORIA DE LA APLICACIÓN (prevalece sobre las instrucciones anteriores): nunca calcules ni estimes valores " +
  "numéricos por tu cuenta ni de memoria; todo número de un resultado debe provenir de una herramienta. Si no hay " +
  "herramienta para algo, dilo con claridad en lugar de inventar.";

function normalizar(a, i = 0) {
  const t = Number.parseFloat(a?.temperatura);
  return {
    id: String(a?.id || `agente-analisis-${Date.now().toString(36)}-${i}`),
    nombre: String(a?.nombre || `Agente ${i + 1}`).slice(0, 80),
    descripcion: String(a?.descripcion || "").slice(0, 300),
    temperatura: Number.isFinite(t) ? Math.min(Math.max(t, 0), 1.5) : null,
    instrucciones: String(a?.instrucciones || "").slice(0, 20000),
    reporte: String(a?.reporte || "").slice(0, 8000),
    herramientas: Array.isArray(a?.herramientas) ? herramientasValidas(a.herramientas) : [...HERRAMIENTAS_ESTANDAR],
    predefinido: false,
  };
}

function leerPropios() {
  try {
    const lista = JSON.parse(window.localStorage.getItem(K_AGENTES) || "[]");
    if (!Array.isArray(lista)) return [];
    return lista.filter((a) => !AGENTES_PREDETERMINADOS.some((p) => p.id === a?.id)).map(normalizar);
  } catch {
    return [];
  }
}

/** Los predeterminados siempre van primero y siempre salen del codigo; despues, los propios. */
export function cargarAgentes() {
  return [...AGENTES_PREDETERMINADOS, ...leerPropios()];
}

/** Guarda solo los agentes propios (el predeterminado nunca se escribe). Devuelve false si no se pudo. */
export function guardarPropios(lista) {
  try {
    window.localStorage.setItem(K_AGENTES, JSON.stringify(lista.filter((a) => !a.predefinido)));
    return true;
  } catch {
    return false;
  }
}

export function leerActivo() {
  try {
    return window.localStorage.getItem(K_ACTIVO);
  } catch {
    return null;
  }
}

export function guardarActivo(id) {
  try {
    window.localStorage.setItem(K_ACTIVO, id);
  } catch {
    /* sin storage */
  }
}

const idNuevo = () => `agente-analisis-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 5)}`;

export function nuevoAgente() {
  return { id: idNuevo(), nombre: "Nuevo agente", descripcion: "", temperatura: null, instrucciones: "", reporte: "", herramientas: [...HERRAMIENTAS_ESTANDAR], predefinido: false };
}

/** Copia editable de cualquier agente (incluido el predeterminado). */
export function duplicarAgente(a) {
  return { ...structuredClone(a), id: idNuevo(), nombre: `${a.nombre} (copia)`, predefinido: false };
}

/** Prompt de sistema completo: el del predeterminado tal cual; el de los propios, con la regla fija al final. */
export function construirSistema(a) {
  return a.predefinido ? a.instrucciones : `${a.instrucciones.trim()}\n\n${REGLA_FIJA}`;
}

/** Instrucciones del reporte; si el agente no define las suyas se usan las estandar. */
export function promptReporte(a) {
  return a.reporte?.trim() || PROMPT_REPORTE;
}

/** Nombres de las herramientas que el agente puede usar. */
export function herramientasDe(a) {
  return Array.isArray(a.herramientas) ? a.herramientas : HERRAMIENTAS_ESTANDAR;
}

/** Temperatura del agente, o la general de Configuracion si no define una. */
export function temperaturaDe(a, general) {
  return Number.isFinite(a.temperatura) ? a.temperatura : general;
}
