// Consumo de tokens (2026-09-26, pedido del usuario): cada respuesta de la IA ya trae cuántos tokens usó (Gemini:
// usageMetadata, OpenAI: usage, Anthropic: usage); se lee de ahí, SIN llamadas adicionales, así que mostrarlo no gasta
// nada. Las APIs no informan el saldo del plan (solo límites por minuto), por eso no se muestra un «% consumido».
//
// Formato neutro: { entrada, salida, llamadas } (entrada = lo enviado: instrucciones, historial y resultados de cálculos;
// salida = lo generado, incluido el razonamiento interno si el modelo lo cobra; llamadas = peticiones a la API: una
// pregunta con calculadoras hace varias rondas).

import { el } from "../util/format.js";
import { activarInfos } from "../util/info-campo.js";

const n = (v) => (Number.isFinite(Number(v)) ? Number(v) : 0);

export function usoDesdeGemini(json) {
  const u = json?.usageMetadata;
  if (!u) return null;
  return { entrada: n(u.promptTokenCount) + n(u.toolUsePromptTokenCount), salida: n(u.candidatesTokenCount) + n(u.thoughtsTokenCount), llamadas: 1 };
}

export function usoDesdeOpenAI(json) {
  const u = json?.usage;
  if (!u) return null;
  return { entrada: n(u.prompt_tokens), salida: n(u.completion_tokens), llamadas: 1 };
}

export function usoDesdeAnthropic(json) {
  const u = json?.usage;
  if (!u) return null;
  return { entrada: n(u.input_tokens) + n(u.cache_creation_input_tokens) + n(u.cache_read_input_tokens), salida: n(u.output_tokens), llamadas: 1 };
}

/** Suma dos consumos (cualquiera puede ser null). */
export function sumarUso(a, b) {
  if (!a) return b ? { ...b } : null;
  if (!b) return { ...a };
  return { entrada: a.entrada + b.entrada, salida: a.salida + b.salida, llamadas: (a.llamadas || 0) + (b.llamadas || 0) };
}

export const totalDe = (u) => (u ? u.entrada + u.salida : 0);

/** «850 tokens», «3.2 k tokens», «1.25 M tokens». */
export function textoTokens(t) {
  if (t < 1000) return `${t} tokens`;
  if (t < 1_000_000) return `${(t / 1000).toFixed(t < 10_000 ? 1 : 0)} k tokens`;
  return `${(t / 1_000_000).toFixed(2)} M tokens`;
}

/** Consumo de toda la conversación (suma el de cada respuesta que lo tenga). */
export const usoConversacion = (mensajes = []) => mensajes.reduce((s, m) => sumarUso(s, m.uso || null), null);

const detalle = (u) =>
  `Entrada: ${textoTokens(u.entrada)} (instrucciones, historial y resultados de los cálculos) · Salida: ${textoTokens(u.salida)} · ${u.llamadas} ${u.llamadas === 1 ? "llamada" : "llamadas"} a la IA`;

/** Texto pequeño bajo una respuesta: «≈ 3.2 k tokens». null si no hay dato (conversaciones anteriores a esta función). */
export function nodoUso(u) {
  if (!u) return null;
  return el("span", { class: "ia-uso", title: detalle(u) }, `≈ ${textoTokens(totalDe(u))}`);
}

/**
 * Total de la conversación en la barra de título de la tarjeta «Conversación» (con un botón «i» que da el detalle).
 * Vacío si aún no hay consumo registrado.
 */
export function pintarTotal(contenedor, mensajes) {
  const u = usoConversacion(mensajes);
  if (!u) {
    contenedor.innerHTML = "";
    return;
  }
  const info = `${detalle(u)}. Sirve para comparar cuánto consume una consulta frente a otra; el saldo de tu plan solo se ve en la consola del proveedor.`;
  contenedor.innerHTML = "";
  contenedor.append(el("label", { class: "ia-uso-total", "data-info": info }, `Total: ${textoTokens(totalDe(u))}`));
  activarInfos(contenedor);
}
