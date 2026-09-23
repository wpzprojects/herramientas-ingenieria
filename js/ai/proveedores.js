// Registro central de proveedores de IA. No traduce nada por si mismo (eso
// vive dentro de cada cliente, ver gemini.js/openai.js/anthropic.js): solo
// resuelve "cual proveedor" y expone los metadatos que necesita la UI
// (nombre, donde se consigue la clave, formato esperado, si admite guardar
// la clave en el servidor).

import * as gemini from "./gemini.js";
import * as openai from "./openai.js";
import * as anthropic from "./anthropic.js";
import { ErrorProveedorIA } from "./errores.js";

export const PROVEEDORES = {
  gemini: {
    id: "gemini",
    nombre: "Google (Gemini)",
    nombreCorto: "Gemini",
    cliente: gemini,
    urlClave: "https://aistudio.google.com/apikey",
    placeholderClave: "Pega aquí tu clave (AIza…)",
    formatoClave: /^AIza/,
    soportaFuenteServidor: true,
  },
  openai: {
    id: "openai",
    nombre: "OpenAI (ChatGPT)",
    nombreCorto: "OpenAI",
    cliente: openai,
    urlClave: "https://platform.openai.com/api-keys",
    placeholderClave: "Pega aquí tu clave (sk-…)",
    formatoClave: /^sk-/,
    soportaFuenteServidor: false,
  },
  anthropic: {
    id: "anthropic",
    nombre: "Anthropic (Claude)",
    nombreCorto: "Claude",
    cliente: anthropic,
    urlClave: "https://console.anthropic.com/settings/keys",
    placeholderClave: "Pega aquí tu clave (sk-ant-…)",
    formatoClave: /^sk-ant-/,
    soportaFuenteServidor: false,
  },
};

export const ORDEN_PROVEEDORES = ["gemini", "openai", "anthropic"];

const K_PROVEEDOR = "ia.proveedor";

export function obtenerProveedorActivo() {
  try {
    const p = window.localStorage.getItem(K_PROVEEDOR);
    return PROVEEDORES[p] ? p : "gemini";
  } catch {
    return "gemini";
  }
}

export function guardarProveedorActivo(id) {
  try {
    window.localStorage.setItem(K_PROVEEDOR, PROVEEDORES[id] ? id : "gemini");
  } catch {
    /* sin storage: se usa "gemini" */
  }
}

/** Proveedor de una conversacion guardada; las anteriores a esta funcion (sin campo) se asumen Gemini. */
export function proveedorDe(conv) {
  return PROVEEDORES[conv?.proveedor] ? conv.proveedor : "gemini";
}

export { ErrorProveedorIA };
