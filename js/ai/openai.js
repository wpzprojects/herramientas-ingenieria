// Cliente minimo de la API REST de OpenAI (Chat Completions), por fetch
// directo desde el navegador con la clave del usuario. Sin dependencias.
// Misma interfaz publica que gemini.js (generar/listarModelos/probarConexion)
// para que analisis.js y las vistas puedan usar cualquier proveedor igual:
// el formato de conversacion que reciben y devuelven es el "neutro" de
// Gemini (role/parts/functionCall/functionResponse); este archivo traduce
// hacia/desde el formato nativo de OpenAI puertas adentro.

import { ErrorProveedorIA } from "./errores.js";
import { usoDesdeOpenAI } from "./uso.js";

const BASE = "https://api.openai.com/v1";

export class ErrorOpenAI extends ErrorProveedorIA {
  constructor(mensaje, opciones = {}) {
    super(mensaje, { ...opciones, proveedor: "openai" });
    this.name = "ErrorOpenAI";
  }
}

let mock = null;
export function usarMock(fn) {
  mock = fn;
}

const dormir = (ms) => new Promise((r) => setTimeout(r, ms));

function traducirError(status, cuerpo) {
  const e = cuerpo?.error || {};
  const detalle = e.message ? ` (${e.message})` : "";
  if (status === 401) {
    return new ErrorOpenAI("La clave de API no es válida. Revísala en Configuración.", { tipo: "clave", status });
  }
  if (status === 403) {
    return new ErrorOpenAI(`La clave no tiene permiso para usar este servicio${detalle}.`, { tipo: "clave", status });
  }
  if (status === 404) {
    return new ErrorOpenAI(
      `El modelo seleccionado no existe o ya no está disponible${detalle}. Elige otro en Configuración.`,
      { tipo: "modelo", status }
    );
  }
  if (status === 429) {
    return new ErrorOpenAI("Límite de uso alcanzado (cuota o solicitudes por minuto). Espera un momento e intenta de nuevo.", {
      tipo: "cuota",
      status,
    });
  }
  if (status >= 500) {
    return new ErrorOpenAI("El servicio de OpenAI no está disponible en este momento. Intenta de nuevo en unos segundos.", {
      tipo: "servidor",
      status,
    });
  }
  return new ErrorOpenAI(`La solicitud fue rechazada por OpenAI${detalle || ` (código ${status})`}.`, {
    tipo: "solicitud",
    status,
  });
}

async function peticion(ruta, { metodo = "GET", cuerpo, clave, signal } = {}) {
  if (mock) return mock({ ruta, cuerpo });

  if (typeof navigator !== "undefined" && navigator.onLine === false) {
    throw new ErrorOpenAI("Sin conexión a internet. La IA necesita conexión; el resto de la app sigue disponible.", { tipo: "offline" });
  }
  if (!clave) throw new ErrorOpenAI("Falta la clave de API. Configúrala en Funciones con IA → Configuración.", { tipo: "clave" });

  for (let intento = 0; ; intento++) {
    let res;
    try {
      res = await fetch(`${BASE}${ruta}`, {
        method: metodo,
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${clave}` },
        body: cuerpo ? JSON.stringify(cuerpo) : undefined,
        signal,
      });
    } catch (err) {
      if (err?.name === "AbortError") throw err;
      throw new ErrorOpenAI("No se pudo contactar a OpenAI. Revisa tu conexión (o si la red corporativa bloquea el acceso).", { tipo: "red" });
    }

    let json = null;
    try {
      json = await res.json();
    } catch {
      /* respuesta sin cuerpo JSON */
    }
    if (res.ok) return json;

    if (intento < 2 && (res.status === 429 || res.status >= 500)) {
      await dormir(2.5 * (intento + 1) * 1000);
      continue;
    }
    throw traducirError(res.status, json);
  }
}

const EXCLUIR_MODELO = /whisper|tts|dall-e|embedding|moderation|davinci|babbage|curie|ada-|realtime|audio|transcribe|image/i;

/**
 * Lista los modelos disponibles para la clave. OpenAI no marca capacidades
 * (a diferencia de Gemini): se filtran por heuristica los que claramente no
 * sirven para chat con function-calling.
 * @returns {Promise<{id:string, nombre:string}[]>}
 */
export async function listarModelos(clave) {
  const json = await peticion("/models", { clave });
  const modelos = (json?.data || [])
    .map((m) => String(m.id || ""))
    .filter((id) => id && !EXCLUIR_MODELO.test(id))
    .sort();
  return modelos.map((id) => ({ id, nombre: id }));
}

/** Elige un modelo razonable por defecto: preferentemente "mini" estable de mayor generacion. */
export function elegirModeloPorDefecto(modelos) {
  const candidatos = modelos.filter((m) => /^(gpt-|o\d)/.test(m.id));
  const puntaje = (m) => {
    const version = parseFloat((m.id.match(/(?:gpt-|o)(\d+(?:\.\d+)?)/) || [])[1] || "0");
    let p = version * 100;
    if (/mini/.test(m.id)) p += 50;
    if (/nano/.test(m.id)) p += 20;
    if (/preview|exp|alpha|beta/.test(m.id)) p -= 30;
    if (/-\d{4}-\d{2}-\d{2}$/.test(m.id)) p -= 5; // version fechada: preferir el alias sin fecha
    return p;
  };
  return candidatos.sort((a, b) => puntaje(b) - puntaje(a))[0]?.id || null;
}

function argumentosSeguros(json) {
  try {
    return JSON.parse(json || "{}") || {};
  } catch {
    return {};
  }
}

/** Traduce el historial "neutro" (formato Gemini) al formato de mensajes de OpenAI. */
function aMensajes(sistema, contenidos) {
  const mensajes = [];
  if (sistema) mensajes.push({ role: "system", content: sistema });
  let idsPendientes = null; // ids sintetizados de las tool_calls del turno "model" anterior, en orden
  for (const turno of contenidos) {
    const llamadas = turno.parts.filter((p) => p.functionCall);
    const respuestas = turno.parts.filter((p) => p.functionResponse);
    const textos = turno.parts.filter((p) => typeof p.text === "string" && !p.thought);
    if (llamadas.length) {
      const texto = textos.map((p) => p.text).join("");
      const ids = llamadas.map((_, i) => `call_${mensajes.length}_${i}`);
      mensajes.push({
        role: "assistant",
        content: texto || null,
        tool_calls: llamadas.map((p, i) => ({
          id: ids[i],
          type: "function",
          function: { name: p.functionCall.name, arguments: JSON.stringify(p.functionCall.args || {}) },
        })),
      });
      idsPendientes = ids;
    } else if (respuestas.length) {
      // corresponden, por posicion, a las tool_calls del turno "model" inmediatamente anterior
      respuestas.forEach((p, i) => {
        mensajes.push({ role: "tool", tool_call_id: idsPendientes?.[i] || `call_desconocido_${i}`, content: JSON.stringify(p.functionResponse.response) });
      });
      idsPendientes = null;
    } else {
      mensajes.push({ role: turno.role === "model" ? "assistant" : "user", content: textos.map((p) => p.text).join("") });
    }
  }
  return mensajes;
}

/**
 * Una llamada a chat/completions, con la misma firma/forma de retorno que gemini.js:generar().
 * @param {object} o
 * @param {string} o.clave
 * @param {string} o.modelo
 * @param {string} [o.sistema]
 * @param {object[]} o.contenidos - historial en formato neutro (Gemini) [{role, parts}]
 * @param {object[]} [o.herramientas] - functionDeclarations [{name, description, parameters}]
 * @param {"AUTO"|"NONE"} [o.modoHerramientas]
 * @param {number} [o.temperatura]
 * @returns {Promise<{content:object, texto:string, llamadas:{name:string,args:object}[], finishReason:string}>}
 */
export async function generar({ clave, modelo, sistema, contenidos, herramientas, modoHerramientas, temperatura, signal }) {
  const cuerpo = { model: modelo, messages: aMensajes(sistema, contenidos) };
  if (herramientas?.length) {
    cuerpo.tools = herramientas.map((h) => ({ type: "function", function: { name: h.name, description: h.description, parameters: h.parameters } }));
    if (modoHerramientas === "NONE") cuerpo.tool_choice = "none";
    else if (modoHerramientas === "AUTO") cuerpo.tool_choice = "auto";
  }
  if (temperatura !== undefined) cuerpo.temperature = temperatura;

  const json = await peticion("/chat/completions", { metodo: "POST", cuerpo, clave, signal });

  const cand = json?.choices?.[0];
  if (!cand) throw new ErrorOpenAI("OpenAI no devolvió ninguna respuesta.", { tipo: "vacio" });
  if (cand.finish_reason === "content_filter") {
    throw new ErrorOpenAI("OpenAI bloqueó la solicitud (filtro de contenido). Reformula el texto.", { tipo: "bloqueo" });
  }

  const msg = cand.message || {};
  const parts = [];
  if (msg.content) parts.push({ text: msg.content });
  for (const tc of msg.tool_calls || []) {
    if (tc.type !== "function") continue;
    parts.push({ functionCall: { name: tc.function?.name, args: argumentosSeguros(tc.function?.arguments) } });
  }

  const content = { role: "model", parts };
  const texto = parts
    .filter((p) => typeof p.text === "string")
    .map((p) => p.text)
    .join("");
  const llamadas = parts.filter((p) => p.functionCall).map((p) => p.functionCall);

  return { content, texto, llamadas, finishReason: cand.finish_reason || "", uso: usoDesdeOpenAI(json) };
}

/** Prueba minima de conexion: lista modelos y devuelve cuantos hay. */
export async function probarConexion(clave) {
  return listarModelos(clave);
}
