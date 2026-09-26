// Cliente minimo de la API REST de Anthropic (Messages API), por fetch
// directo desde el navegador con la clave del usuario. Sin dependencias.
// Misma interfaz publica que gemini.js/openai.js (generar/listarModelos/
// probarConexion); el formato de conversacion que entra y sale de generar()
// es el "neutro" de Gemini (role/parts/functionCall/functionResponse), y
// este archivo traduce hacia/desde el formato nativo de Anthropic.
//
// Anthropic bloquea CORS por defecto para llamadas desde el navegador: hace
// falta el header "anthropic-dangerous-direct-browser-access" (pensado por
// el propio proveedor para apps 100% cliente como esta). Sin el, el fetch
// falla por CORS antes de llegar al servidor.

import { ErrorProveedorIA } from "./errores.js";
import { usoDesdeAnthropic } from "./uso.js";

const BASE = "https://api.anthropic.com/v1";
const VERSION = "2023-06-01";

export class ErrorAnthropic extends ErrorProveedorIA {
  constructor(mensaje, opciones = {}) {
    super(mensaje, { ...opciones, proveedor: "anthropic" });
    this.name = "ErrorAnthropic";
  }
}

let mock = null;
export function usarMock(fn) {
  mock = fn;
}

const dormir = (ms) => new Promise((r) => setTimeout(r, ms));

function traducirError(status, cuerpo) {
  const e = cuerpo?.error || {};
  const tipo = e.type || "";
  const detalle = e.message ? ` (${e.message})` : "";
  if (status === 401) {
    return new ErrorAnthropic("La clave de API no es válida. Revísala en Configuración.", { tipo: "clave", status });
  }
  if (status === 403) {
    return new ErrorAnthropic(`La clave no tiene permiso para usar este servicio${detalle}.`, { tipo: "clave", status });
  }
  if (status === 404) {
    return new ErrorAnthropic(
      `El modelo seleccionado no existe o ya no está disponible${detalle}. Elige otro en Configuración.`,
      { tipo: "modelo", status }
    );
  }
  if (status === 400 && /model/i.test(e.message || "")) {
    return new ErrorAnthropic(`El modelo seleccionado no es válido${detalle}. Elige otro en Configuración.`, { tipo: "modelo", status });
  }
  if (status === 429) {
    return new ErrorAnthropic("Límite de uso alcanzado (cuota o solicitudes por minuto). Espera un momento e intenta de nuevo.", {
      tipo: "cuota",
      status,
    });
  }
  if (status === 529 || (tipo === "overloaded_error" && status >= 500)) {
    return new ErrorAnthropic("El servicio de Claude está saturado en este momento. Intenta de nuevo en unos segundos.", {
      tipo: "servidor",
      status,
    });
  }
  if (status >= 500) {
    return new ErrorAnthropic("El servicio de Claude no está disponible en este momento. Intenta de nuevo en unos segundos.", {
      tipo: "servidor",
      status,
    });
  }
  return new ErrorAnthropic(`La solicitud fue rechazada por Claude${detalle || ` (código ${status})`}.`, {
    tipo: "solicitud",
    status,
  });
}

async function peticion(ruta, { metodo = "GET", cuerpo, clave, signal } = {}) {
  if (mock) return mock({ ruta, cuerpo });

  if (typeof navigator !== "undefined" && navigator.onLine === false) {
    throw new ErrorAnthropic("Sin conexión a internet. La IA necesita conexión; el resto de la app sigue disponible.", { tipo: "offline" });
  }
  if (!clave) throw new ErrorAnthropic("Falta la clave de API. Configúrala en Funciones con IA → Configuración.", { tipo: "clave" });

  const headers = {
    "Content-Type": "application/json",
    "x-api-key": clave,
    "anthropic-version": VERSION,
    "anthropic-dangerous-direct-browser-access": "true",
  };

  for (let intento = 0; ; intento++) {
    let res;
    try {
      res = await fetch(`${BASE}${ruta}`, { method: metodo, headers, body: cuerpo ? JSON.stringify(cuerpo) : undefined, signal });
    } catch (err) {
      if (err?.name === "AbortError") throw err;
      throw new ErrorAnthropic("No se pudo contactar a Claude. Revisa tu conexión (o si la red corporativa bloquea el acceso).", { tipo: "red" });
    }

    let json = null;
    try {
      json = await res.json();
    } catch {
      /* respuesta sin cuerpo JSON */
    }
    if (res.ok) return json;

    if (intento < 2 && (res.status === 429 || res.status === 500 || res.status === 529)) {
      await dormir(2.5 * (intento + 1) * 1000);
      continue;
    }
    throw traducirError(res.status, json);
  }
}

/** @returns {Promise<{id:string, nombre:string}[]>} */
export async function listarModelos(clave) {
  const modelos = [];
  let after = "";
  for (let pagina = 0; pagina < 4; pagina++) {
    const json = await peticion(`/models?limit=100${after ? `&after_id=${encodeURIComponent(after)}` : ""}`, { clave });
    for (const m of json?.data || []) {
      if (m.id) modelos.push({ id: m.id, nombre: m.display_name || m.id });
    }
    if (!json?.has_more || !modelos.length) break;
    after = modelos[modelos.length - 1].id;
  }
  return modelos;
}

/** Elige un modelo razonable por defecto: preferentemente "sonnet" estable de mayor version. */
export function elegirModeloPorDefecto(modelos) {
  const candidatos = modelos.filter((m) => /^claude-/.test(m.id));
  const puntaje = (m) => {
    const version = parseFloat((m.id.match(/claude-(?:opus-|sonnet-|haiku-)?(\d+(?:\.\d+)?)/) || [])[1] || "0");
    let p = version * 100;
    if (/sonnet/.test(m.id)) p += 50;
    if (/haiku/.test(m.id)) p += 30;
    if (/opus/.test(m.id)) p += 10;
    if (/latest$/.test(m.id)) p += 5;
    return p;
  };
  return candidatos.sort((a, b) => puntaje(b) - puntaje(a))[0]?.id || null;
}

/** Traduce el historial "neutro" (formato Gemini) a la lista de mensajes de Anthropic. */
function aMensajes(contenidos) {
  const mensajes = [];
  let idsPendientes = null;
  for (const turno of contenidos) {
    const llamadas = turno.parts.filter((p) => p.functionCall);
    const respuestas = turno.parts.filter((p) => p.functionResponse);
    const textos = turno.parts.filter((p) => typeof p.text === "string" && !p.thought);
    if (llamadas.length) {
      const ids = llamadas.map((_, i) => `toolu_${mensajes.length}_${i}`);
      const content = [];
      if (textos.length) content.push({ type: "text", text: textos.map((p) => p.text).join("") });
      llamadas.forEach((p, i) => content.push({ type: "tool_use", id: ids[i], name: p.functionCall.name, input: p.functionCall.args || {} }));
      mensajes.push({ role: "assistant", content });
      idsPendientes = ids;
    } else if (respuestas.length) {
      const content = respuestas.map((p, i) => ({
        type: "tool_result",
        tool_use_id: idsPendientes?.[i] || `toolu_desconocido_${i}`,
        content: JSON.stringify(p.functionResponse.response),
      }));
      mensajes.push({ role: "user", content });
      idsPendientes = null;
    } else {
      mensajes.push({ role: turno.role === "model" ? "assistant" : "user", content: textos.map((p) => p.text).join("") });
    }
  }
  return mensajes;
}

/**
 * Una llamada a /messages, con la misma firma/forma de retorno que gemini.js:generar().
 * @param {object} o
 * @param {string} o.clave
 * @param {string} o.modelo
 * @param {string} [o.sistema]
 * @param {object[]} o.contenidos - historial en formato neutro (Gemini) [{role, parts}]
 * @param {object[]} [o.herramientas] - [{name, description, parameters}]
 * @param {"AUTO"|"NONE"} [o.modoHerramientas]
 * @param {number} [o.temperatura]
 * @param {number} [o.maxTokens] - obligatorio para Anthropic; sin valor por defecto implicito
 * @returns {Promise<{content:object, texto:string, llamadas:{name:string,args:object}[], finishReason:string}>}
 */
export async function generar({ clave, modelo, sistema, contenidos, herramientas, modoHerramientas, temperatura, maxTokens, signal }) {
  const cuerpo = { model: modelo, max_tokens: maxTokens || 4096, messages: aMensajes(contenidos) };
  if (sistema) cuerpo.system = sistema;
  if (herramientas?.length) {
    cuerpo.tools = herramientas.map((h) => ({ name: h.name, description: h.description, input_schema: h.parameters }));
    if (modoHerramientas === "NONE") cuerpo.tool_choice = { type: "none" };
    else if (modoHerramientas === "AUTO") cuerpo.tool_choice = { type: "auto" };
  }
  if (temperatura !== undefined) cuerpo.temperature = temperatura;

  const json = await peticion("/messages", { metodo: "POST", cuerpo, clave, signal });

  const bloques = json?.content;
  if (!Array.isArray(bloques)) throw new ErrorAnthropic("Claude no devolvió ninguna respuesta.", { tipo: "vacio" });

  const parts = [];
  for (const b of bloques) {
    if (b.type === "text") parts.push({ text: b.text });
    else if (b.type === "tool_use") parts.push({ functionCall: { name: b.name, args: b.input || {} } });
  }

  const content = { role: "model", parts };
  const texto = parts
    .filter((p) => typeof p.text === "string")
    .map((p) => p.text)
    .join("");
  const llamadas = parts.filter((p) => p.functionCall).map((p) => p.functionCall);

  return { content, texto, llamadas, finishReason: json.stop_reason || "", uso: usoDesdeAnthropic(json) };
}

/** Prueba minima de conexion: lista modelos y devuelve cuantos hay. */
export async function probarConexion(clave) {
  return listarModelos(clave);
}
