// Agentes de "Analisis con calculadoras": cada uno es el prompt de sistema con el que trabaja Gemini, mas las
// instrucciones del reporte y una temperatura opcional. El agente predeterminado vive en el codigo
// (SISTEMA_ANALISIS y PROMPT_REPORTE de analisis.js): es de solo lectura, no se guarda ni se puede borrar; se puede
// ver y duplicar. Los agentes propios se guardan en el navegador (localStorage).

import { SISTEMA_ANALISIS, PROMPT_REPORTE } from "./analisis.js";

const K_AGENTES = "ia.agentesAnalisis";
const K_ACTIVO = "ia.agenteAnalisisActivo";

export const ID_PREDETERMINADO = "analisis-estandar";

export const AGENTE_PREDETERMINADO = Object.freeze({
  id: ID_PREDETERMINADO,
  nombre: "Agente estándar",
  descripcion: "Reglas y reporte originales de la aplicación (solo lectura).",
  temperatura: null, // null = la de Configuracion de IA
  instrucciones: SISTEMA_ANALISIS,
  reporte: PROMPT_REPORTE,
  predefinido: true,
});

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
    predefinido: false,
  };
}

function leerPropios() {
  try {
    const lista = JSON.parse(window.localStorage.getItem(K_AGENTES) || "[]");
    if (!Array.isArray(lista)) return [];
    return lista.filter((a) => a?.id !== ID_PREDETERMINADO).map(normalizar);
  } catch {
    return [];
  }
}

/** El predeterminado siempre va primero y siempre sale del codigo; despues, los propios. */
export function cargarAgentes() {
  return [AGENTE_PREDETERMINADO, ...leerPropios()];
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
  return { id: idNuevo(), nombre: "Nuevo agente", descripcion: "", temperatura: null, instrucciones: "", reporte: "", predefinido: false };
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

/** Temperatura del agente, o la general de Configuracion si no define una. */
export function temperaturaDe(a, general) {
  return Number.isFinite(a.temperatura) ? a.temperatura : general;
}
