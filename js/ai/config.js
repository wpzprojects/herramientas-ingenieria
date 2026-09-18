// Configuracion de la seccion de IA: clave de API de Gemini, modelo y
// parametros. La clave vive SOLO en el navegador del usuario (localStorage si
// elige recordarla, sessionStorage si no) y solo se envia a Google.
// Todo acceso a storage va envuelto en try/catch: puede no estar disponible
// (ventana privada, datos bloqueados) y la app debe seguir funcionando.

const K_CLAVE = "ia.apiKey";
const K_AJUSTES = "ia.ajustes";

export const AJUSTES_POR_DEFECTO = {
  modelo: "gemini-2.5-flash", // se reemplaza por la lista real del usuario en Configuracion
  temperatura: 0.3,
  maxRondas: 8, // idas y vueltas modelo <-> herramientas por pregunta
  maxCalculos: 60, // cantidad maxima de calculos individuales por pregunta
};

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

export function obtenerClave() {
  return leer("session", K_CLAVE) || leer("local", K_CLAVE) || "";
}

export function hayClave() {
  return obtenerClave().length > 0;
}

/** true si la clave quedo guardada de forma persistente (localStorage). */
export function clavePersistente() {
  return !!leer("local", K_CLAVE);
}

export function guardarClave(clave, recordar) {
  const limpia = String(clave || "").trim();
  quitar("local", K_CLAVE);
  quitar("session", K_CLAVE);
  if (!limpia) return false;
  return escribir(recordar ? "local" : "session", K_CLAVE, limpia);
}

export function borrarClave() {
  quitar("local", K_CLAVE);
  quitar("session", K_CLAVE);
}

export function enmascarar(clave) {
  if (!clave) return "";
  if (clave.length <= 10) return "•".repeat(clave.length);
  return `${clave.slice(0, 4)}${"•".repeat(8)}${clave.slice(-4)}`;
}

export function obtenerAjustes() {
  let guardados = {};
  try {
    guardados = JSON.parse(leer("local", K_AJUSTES) || "{}") || {};
  } catch {
    guardados = {};
  }
  return { ...AJUSTES_POR_DEFECTO, ...guardados };
}

export function guardarAjustes(parcial) {
  const nuevos = { ...obtenerAjustes(), ...parcial };
  return escribir("local", K_AJUSTES, JSON.stringify(nuevos));
}

export function borrarAjustes() {
  quitar("local", K_AJUSTES);
}
