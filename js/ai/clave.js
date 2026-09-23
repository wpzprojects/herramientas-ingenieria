// Fuente de la clave de Gemini que usan las funciones con IA:
//   "local"      -> la clave guardada en este navegador (por defecto; ver ai/config.js)
//   "personal"   -> la clave personal del usuario, guardada en el servidor
//   "compartida" -> la clave compartida por los usuarios autorizados, guardada en el servidor
// La clave del servidor solo vive EN MEMORIA mientras la app esta abierta: nunca se copia a localStorage.
//
// Multi-proveedor (2026-09-23): este archivo SOLO aplica a Gemini. OpenAI y Anthropic no tienen
// clave "personal"/"compartida" en el servidor: siempre usan la clave local de config.js
// (obtenerClave(proveedor)), sin pasar por prepararClave()/obtenerFuente() de aqui.

import { obtenerClave, hayClave } from "./config.js";
import { obtenerBackend, esperarSesion } from "../auth/backend.js";

const K_FUENTE = "ia.fuenteClave";
export const FUENTES = ["local", "personal", "compartida"];
export const ETIQUETA_FUENTE = {
  local: "la clave guardada en este navegador",
  personal: "tu clave personal guardada en el servidor",
  compartida: "la clave compartida guardada en el servidor",
};

export function obtenerFuente() {
  try {
    const f = window.localStorage.getItem(K_FUENTE);
    return FUENTES.includes(f) ? f : "local";
  } catch {
    return "local";
  }
}

export function guardarFuente(fuente) {
  try {
    window.localStorage.setItem(K_FUENTE, FUENTES.includes(fuente) ? fuente : "local");
  } catch {
    /* sin storage: se usa "local" */
  }
  olvidarClaveServidor();
}

let enMemoria = "";

export function olvidarClaveServidor() {
  enMemoria = "";
}

/** Clave lista para usar (sincrona). Llama antes a prepararClave(). */
export function claveEnUso() {
  return obtenerFuente() === "local" ? obtenerClave() : enMemoria;
}

/**
 * Deja lista la clave segun la fuente elegida.
 * @returns {Promise<{ok:true, fuente:string} | {ok:false, motivo:string, mensaje:string}>}
 *   motivo: "sin-clave-local" | "offline" | "sin-servicio" | "sin-sesion" | "sin-acceso" | "sin-clave-servidor" | "error"
 */
export async function prepararClave() {
  const fuente = obtenerFuente();
  if (fuente === "local") {
    return hayClave()
      ? { ok: true, fuente }
      : { ok: false, motivo: "sin-clave-local", mensaje: "Falta la clave de API de este navegador." };
  }
  if (typeof navigator !== "undefined" && navigator.onLine === false) {
    return { ok: false, motivo: "offline", mensaje: "Sin conexión a internet." };
  }
  try {
    const b = await obtenerBackend();
    if (!b) return { ok: false, motivo: "sin-servicio", mensaje: "El servicio de acceso todavía no está configurado." };
    if (!(await esperarSesion(b))) return { ok: false, motivo: "sin-sesion", mensaje: "Todavía no has iniciado sesión con tu cuenta de Google." };
    if (!(await b.obtenerPerfil())) return { ok: false, motivo: "sin-acceso", mensaje: "Tu cuenta no tiene acceso a la clave guardada en el servidor." };
    const clave = fuente === "personal" ? await b.leerClavePersonal() : await b.leerClaveCompartida();
    if (!clave) {
      return {
        ok: false,
        motivo: "sin-clave-servidor",
        mensaje: fuente === "personal" ? "Aún no guardaste tu clave personal en el servidor." : "Todavía no hay una clave compartida en el servidor.",
      };
    }
    enMemoria = clave;
    return { ok: true, fuente };
  } catch (err) {
    return { ok: false, motivo: "error", mensaje: err?.message || "No se pudo obtener la clave del servidor." };
  }
}
