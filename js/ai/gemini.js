// Cliente minimo de la API REST de Gemini (Google AI Studio), por fetch
// directo desde el navegador con la clave del usuario. Sin dependencias.
//
// Los nombres de modelo cambian con el tiempo: no se fijan aqui, se listan
// con listarModelos() y el usuario elige en Configuracion.

const BASE = "https://generativelanguage.googleapis.com/v1beta";

export class ErrorGemini extends Error {
  /** @param {"offline"|"red"|"clave"|"cuota"|"modelo"|"bloqueo"|"servidor"|"solicitud"|"vacio"} tipo */
  constructor(mensaje, { tipo = "solicitud", status = 0 } = {}) {
    super(mensaje);
    this.name = "ErrorGemini";
    this.tipo = tipo;
    this.status = status;
  }
}

// Punto de inyeccion para pruebas (tools/verify_ia.html): si esta definido,
// reemplaza a fetch. Recibe ({ ruta, cuerpo }) y devuelve el JSON de respuesta.
let mock = null;
export function usarMock(fn) {
  mock = fn;
}

const dormir = (ms) => new Promise((r) => setTimeout(r, ms));

function segundosDeReintento(detalles) {
  for (const d of detalles || []) {
    if (typeof d?.retryDelay === "string") {
      const s = parseFloat(d.retryDelay);
      if (Number.isFinite(s)) return s;
    }
  }
  return null;
}

function traducirError(status, cuerpo) {
  const e = cuerpo?.error || {};
  const detalle = e.message ? ` (${e.message})` : "";
  if (status === 400 && /API key not valid|API_KEY_INVALID/i.test(e.message || "")) {
    return new ErrorGemini("La clave de API no es válida. Revísala en Configuración.", { tipo: "clave", status });
  }
  if (status === 400 && /API key expired/i.test(e.message || "")) {
    return new ErrorGemini("La clave de API expiró. Genera una nueva en Google AI Studio.", { tipo: "clave", status });
  }
  if (status === 401 || status === 403) {
    return new ErrorGemini(`La clave no tiene permiso para usar este servicio${detalle}.`, { tipo: "clave", status });
  }
  if (status === 404) {
    return new ErrorGemini(
      `El modelo seleccionado no existe o ya no está disponible${detalle}. Elige otro en Configuración.`,
      { tipo: "modelo", status }
    );
  }
  if (status === 429) {
    return new ErrorGemini(
      "Límite gratuito de uso alcanzado (por minuto o por día). Espera un momento e intenta de nuevo.",
      { tipo: "cuota", status }
    );
  }
  if (status >= 500) {
    return new ErrorGemini("El servicio de Gemini no está disponible en este momento. Intenta de nuevo en unos segundos.", {
      tipo: "servidor",
      status,
    });
  }
  return new ErrorGemini(`La solicitud fue rechazada por Gemini${detalle || ` (código ${status})`}.`, {
    tipo: "solicitud",
    status,
  });
}

async function peticion(ruta, { metodo = "GET", cuerpo, clave, signal } = {}) {
  if (mock) return mock({ ruta, cuerpo });

  if (typeof navigator !== "undefined" && navigator.onLine === false) {
    throw new ErrorGemini("Sin conexión a internet. La IA necesita conexión; el resto de la app sigue disponible.", {
      tipo: "offline",
    });
  }
  if (!clave) throw new ErrorGemini("Falta la clave de API. Configúrala en Inteligencia artificial → Configuración.", { tipo: "clave" });

  for (let intento = 0; ; intento++) {
    let res;
    try {
      res = await fetch(`${BASE}${ruta}`, {
        method: metodo,
        headers: { "Content-Type": "application/json", "x-goog-api-key": clave },
        body: cuerpo ? JSON.stringify(cuerpo) : undefined,
        signal,
      });
    } catch (err) {
      if (err?.name === "AbortError") throw err;
      throw new ErrorGemini("No se pudo contactar a Gemini. Revisa tu conexión (o si la red corporativa bloquea el acceso).", {
        tipo: "red",
      });
    }

    let json = null;
    try {
      json = await res.json();
    } catch {
      /* respuesta sin cuerpo JSON */
    }
    if (res.ok) return json;

    // Reintento unico para 503, y para 429 solo si la espera sugerida es corta.
    if (intento < 2 && (res.status === 503 || res.status === 429)) {
      const sugerido = segundosDeReintento(json?.error?.details);
      if (res.status === 503 || (sugerido !== null && sugerido <= 10)) {
        await dormir((sugerido ?? 2.5 * (intento + 1)) * 1000);
        continue;
      }
    }
    throw traducirError(res.status, json);
  }
}

/**
 * Lista los modelos disponibles para la clave que soportan generateContent.
 * @returns {Promise<{id:string, nombre:string}[]>}
 */
export async function listarModelos(clave) {
  const modelos = [];
  let token = "";
  for (let pagina = 0; pagina < 4; pagina++) {
    const json = await peticion(`/models?pageSize=200${token ? `&pageToken=${encodeURIComponent(token)}` : ""}`, { clave });
    for (const m of json?.models || []) {
      if (!(m.supportedGenerationMethods || []).includes("generateContent")) continue;
      const id = String(m.name || "").replace(/^models\//, "");
      if (id) modelos.push({ id, nombre: m.displayName || id });
    }
    token = json?.nextPageToken || "";
    if (!token) break;
  }
  return modelos;
}

/** Elige un modelo razonable por defecto: preferentemente "flash" estable de mayor version. */
export function elegirModeloPorDefecto(modelos) {
  const excluir = /image|tts|audio|live|embedding|aqa|robotics|computer|imagen|veo|gemma|learnlm|banana/i;
  const candidatos = modelos.filter((m) => /^gemini-/.test(m.id) && !excluir.test(m.id));
  const puntaje = (m) => {
    const version = parseFloat((m.id.match(/gemini-(\d+(?:\.\d+)?)/) || [])[1] || "0");
    let p = version * 100;
    if (/flash/.test(m.id)) p += 50;
    if (/lite/.test(m.id)) p -= 30;
    if (/preview|exp|thinking/.test(m.id)) p -= 20;
    if (/-\d{3}$/.test(m.id)) p -= 5;
    return p;
  };
  return candidatos.sort((a, b) => puntaje(b) - puntaje(a))[0]?.id || null;
}

/**
 * Una llamada a generateContent.
 * @param {object} o
 * @param {string} o.clave
 * @param {string} o.modelo
 * @param {string} [o.sistema] - instrucciones de sistema
 * @param {object[]} o.contenidos - historial [{role, parts}]
 * @param {object[]} [o.herramientas] - functionDeclarations
 * @param {"AUTO"|"NONE"} [o.modoHerramientas]
 * @param {number} [o.temperatura]
 * @returns {Promise<{content:object, texto:string, llamadas:{name:string,args:object}[], finishReason:string}>}
 */
export async function generar({ clave, modelo, sistema, contenidos, herramientas, modoHerramientas, temperatura, signal }) {
  const cuerpo = { contents: contenidos };
  if (sistema) cuerpo.systemInstruction = { parts: [{ text: sistema }] };
  if (herramientas?.length) {
    cuerpo.tools = [{ functionDeclarations: herramientas }];
    if (modoHerramientas) cuerpo.toolConfig = { functionCallingConfig: { mode: modoHerramientas } };
  }
  if (temperatura !== undefined) cuerpo.generationConfig = { temperature: temperatura };

  const json = await peticion(`/models/${encodeURIComponent(modelo)}:generateContent`, {
    metodo: "POST",
    cuerpo,
    clave,
    signal,
  });

  const cand = json?.candidates?.[0];
  if (!cand) {
    const motivo = json?.promptFeedback?.blockReason;
    throw new ErrorGemini(
      motivo ? `Gemini bloqueó la solicitud (${motivo}). Reformula el texto.` : "Gemini no devolvió ninguna respuesta.",
      { tipo: motivo ? "bloqueo" : "vacio" }
    );
  }

  // Se conserva el turno del modelo tal cual (incluye firmas de razonamiento
  // que algunos modelos exigen recibir de vuelta junto a las llamadas a funciones).
  const content = { role: "model", parts: cand.content?.parts || [] };
  const texto = content.parts
    .filter((p) => typeof p.text === "string" && !p.thought)
    .map((p) => p.text)
    .join("");
  const llamadas = content.parts.filter((p) => p.functionCall).map((p) => ({ name: p.functionCall.name, args: p.functionCall.args || {} }));

  return { content, texto, llamadas, finishReason: cand.finishReason || "" };
}

/** Prueba minima de conexion: lista modelos y devuelve cuantos hay. */
export async function probarConexion(clave) {
  const modelos = await listarModelos(clave);
  return modelos;
}
