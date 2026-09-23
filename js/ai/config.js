// Configuracion de la seccion de IA: clave de API, modelo y parametros, por
// proveedor (Gemini, OpenAI, Anthropic). La clave vive SOLO en el navegador
// del usuario (localStorage si elige recordarla, sessionStorage si no) y
// solo se envia al proveedor elegido.
// Todo acceso a storage va envuelto en try/catch: puede no estar disponible
// (ventana privada, datos bloqueados) y la app debe seguir funcionando.
//
// Las claves de storage de Gemini se mantienen SIN cambios ("ia.apiKey",
// "ia.ajustes") para no perder lo que los usuarios ya tenian guardado; los
// demas proveedores usan una clave namespaced ("ia.apiKey.openai", etc).

export const AJUSTES_POR_DEFECTO = {
  gemini: {
    modelo: "gemini-2.5-flash", // se reemplaza por la lista real del usuario en Configuracion
    temperatura: 0.3,
    maxRondas: 8, // idas y vueltas modelo <-> herramientas por pregunta
    maxCalculos: 60, // cantidad maxima de calculos individuales por pregunta
  },
  openai: {
    modelo: "",
    temperatura: 0.3,
    maxRondas: 8,
    maxCalculos: 60,
  },
  anthropic: {
    modelo: "",
    temperatura: 0.3,
    maxRondas: 8,
    maxCalculos: 60,
    maxTokens: 4096, // Anthropic exige max_tokens explicito, sin default implicito
  },
};

const claveStorageDe = (proveedor) => (proveedor === "gemini" ? "ia.apiKey" : `ia.apiKey.${proveedor}`);
const ajustesStorageDe = (proveedor) => (proveedor === "gemini" ? "ia.ajustes" : `ia.ajustes.${proveedor}`);

function almacen(tipo) {
  try {
    return tipo === "session" ? window.sessionStorage : window.localStorage;
  } catch {
    return null;
  }
}

function leer(tipo, clave) {
  try {
    return almacen(tipo)?.getItem(clave) ?? null;
  } catch {
    return null;
  }
}

function escribir(tipo, clave, valor) {
  try {
    almacen(tipo)?.setItem(clave, valor);
    return true;
  } catch {
    return false;
  }
}

function quitar(tipo, clave) {
  try {
    almacen(tipo)?.removeItem(clave);
  } catch {
    /* sin storage */
  }
}

export function obtenerClave(proveedor = "gemini") {
  const k = claveStorageDe(proveedor);
  return leer("session", k) || leer("local", k) || "";
}

export function hayClave(proveedor = "gemini") {
  return obtenerClave(proveedor).length > 0;
}

/** true si la clave quedo guardada de forma persistente (localStorage). */
export function clavePersistente(proveedor = "gemini") {
  return !!leer("local", claveStorageDe(proveedor));
}

export function guardarClave(clave, recordar, proveedor = "gemini") {
  const k = claveStorageDe(proveedor);
  const limpia = String(clave || "").trim();
  quitar("local", k);
  quitar("session", k);
  if (!limpia) return false;
  return escribir(recordar ? "local" : "session", k, limpia);
}

export function borrarClave(proveedor = "gemini") {
  const k = claveStorageDe(proveedor);
  quitar("local", k);
  quitar("session", k);
}

export function enmascarar(clave) {
  if (!clave) return "";
  if (clave.length <= 10) return "•".repeat(clave.length);
  return `${clave.slice(0, 4)}${"•".repeat(8)}${clave.slice(-4)}`;
}

export function obtenerAjustes(proveedor = "gemini") {
  let guardados = {};
  try {
    guardados = JSON.parse(leer("local", ajustesStorageDe(proveedor)) || "{}") || {};
  } catch {
    guardados = {};
  }
  return { ...(AJUSTES_POR_DEFECTO[proveedor] || AJUSTES_POR_DEFECTO.gemini), ...guardados };
}

export function guardarAjustes(parcial, proveedor = "gemini") {
  const nuevos = { ...obtenerAjustes(proveedor), ...parcial };
  return escribir("local", ajustesStorageDe(proveedor), JSON.stringify(nuevos));
}

export function borrarAjustes(proveedor = "gemini") {
  quitar("local", ajustesStorageDe(proveedor));
}
