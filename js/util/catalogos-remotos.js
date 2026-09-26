// Catálogos servidos desde Firestore (fase 1, 2026-09-24). La app trae los catálogos «de fábrica» (data/*.json) y, si
// el administrador los publicó en el servidor, usa la copia del servidor: gana SIEMPRE el servidor (decisión del
// usuario). Sin internet o sin servidor se sigue con lo último guardado en el dispositivo, o con los de fábrica: la app
// nunca queda sin datos.
//
//  - Lectura: pública, con la API REST de Firestore (una petición web, sin cargar el SDK de Firebase). Al abrir la app se
//    lee solo `catalogos/_indice` (1 lectura) y se descarga un catálogo únicamente si cambió su versión.
//  - Copia en el dispositivo: localStorage["catalogo.servidor.<nombre>"] = { version, fecha, actualizadoPor, datos }
//    (`datos` = el JSON en texto). No va en el respaldo de Perfil > Datos (es del servidor).
//  - loadData() (js/util/format.js) pregunta aquí primero. Los arneses de tools/ (que fijan window.__BASE_PATH__) usan
//    SIEMPRE los de fábrica para que sus resultados no dependan de lo publicado; verify_catalogos.html lo activa con
//    window.__USAR_CATALOGOS_SERVIDOR__ = true.
//  - Escritura: solo el administrador, con backend.publicarCatalogo() (reglas en firebase/firestore.rules).

export const CATALOGOS_EDITABLES = [
  { nombre: "conductores-desnudos", titulo: "Conductores desnudos" },
  { nombre: "conductores-semiaislados", titulo: "Conductores semiaislados" },
  { nombre: "conductores-xlpe", titulo: "Conductores XLPE" },
  { nombre: "tuberias", titulo: "Tuberías" },
  { nombre: "resoluciones", titulo: "Resoluciones" },
  { nombre: "codificacion", titulo: "Codificación de entregables" },
];
export const NOMBRES_EDITABLES = CATALOGOS_EDITABLES.map((c) => c.nombre);
export const PREFIJO_COPIA = "catalogo.servidor.";
const esEditable = (nombre) => NOMBRES_EDITABLES.includes(nombre);

// ------------------------------------------------------------------ copia local

/** ¿loadData debe preferir la copia del servidor? En la app sí; en los arneses de tools/ no (salvo que lo pidan). */
export function usarServidor() {
  return window.__USAR_CATALOGOS_SERVIDOR__ ?? !window.__BASE_PATH__;
}

function leerCruda(nombre) {
  try {
    const c = JSON.parse(localStorage.getItem(PREFIJO_COPIA + nombre) || "null");
    return c && typeof c.datos === "string" && typeof c.version === "number" ? c : null;
  } catch {
    return null;
  }
}

/** Datos de la copia del servidor guardada en el dispositivo, o null si no hay (o está dañada). */
export function datosDelServidor(nombre) {
  if (!esEditable(nombre)) return null;
  const c = leerCruda(nombre);
  if (!c) return null;
  try {
    const d = JSON.parse(c.datos);
    return datosValidos(d) ? d : null;
  } catch {
    return null;
  }
}

/** { version, fecha, actualizadoPor } de la copia local, sin los datos. */
export function infoCopia(nombre) {
  const c = leerCruda(nombre);
  return c ? { version: c.version, fecha: c.fecha || null, actualizadoPor: c.actualizadoPor || "" } : null;
}

export function borrarCopias() {
  for (const n of NOMBRES_EDITABLES) {
    try {
      localStorage.removeItem(PREFIJO_COPIA + n);
    } catch {
      /* sin storage */
    }
  }
}

/** Resumen para Perfil > Aplicación: cuántos catálogos vienen del servidor y la fecha más reciente. */
export function resumenOrigen() {
  const copias = NOMBRES_EDITABLES.map(infoCopia).filter(Boolean);
  const fechas = copias.map((c) => c.fecha).filter(Boolean).sort();
  return { deServidor: copias.length, total: NOMBRES_EDITABLES.length, ultimaFecha: fechas.at(-1) || null };
}

const datosValidos = (d) => Array.isArray(d) && d.length > 0 && d.every((f) => f && typeof f === "object" && !Array.isArray(f));

// ------------------------------------------------------------------ fábrica y huella

/** El catálogo de fábrica tal cual viene en data/ (sin pasar por la copia del servidor). */
export async function cargarFabrica(nombre) {
  const base = window.__BASE_PATH__ || "";
  const res = await fetch(`${base}data/${nombre}.json`);
  if (!res.ok) throw new Error(`No se pudo cargar data/${nombre}.json`);
  const texto = await res.text();
  return { texto, datos: JSON.parse(texto) };
}

/** JSON compacto y estable: no cambia con espacios, sangría o fines de línea (CRLF) del archivo. */
export const textoCompacto = (datos) => JSON.stringify(datos);

/** Huella SHA-256 (hex) del catálogo en forma compacta: sirve para saber si los de fábrica cambiaron desde que se publicaron. */
export async function huella(datos) {
  const bytes = new TextEncoder().encode(textoCompacto(datos));
  const h = await crypto.subtle.digest("SHA-256", bytes);
  return [...new Uint8Array(h)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

// ------------------------------------------------------------------ lectura del servidor (API REST)

const valorRest = (v) => {
  if (!v) return undefined;
  if ("integerValue" in v) return Number(v.integerValue);
  if ("doubleValue" in v) return Number(v.doubleValue);
  if ("stringValue" in v) return v.stringValue;
  if ("timestampValue" in v) return v.timestampValue;
  if ("arrayValue" in v) return (v.arrayValue.values || []).map(valorRest);
  if ("mapValue" in v) return Object.fromEntries(Object.entries(v.mapValue.fields || {}).map(([k, x]) => [k, valorRest(x)]));
  if ("nullValue" in v) return null;
  return undefined;
};

/** Documento REST de `_indice` → { nombre: { version, huellaFabrica, actualizadoPor, fecha } } (solo catálogos conocidos). */
export function parsearIndiceRest(doc) {
  const cats = valorRest(doc?.fields?.catalogos) || {};
  const out = {};
  for (const [nombre, v] of Object.entries(cats)) {
    if (!esEditable(nombre) || !v || !Number.isFinite(v.version)) continue;
    const historial = (Array.isArray(v.historial) ? v.historial : [])
      .filter((h) => h && Number.isFinite(h.version))
      .map((h) => ({ version: h.version, fecha: h.fecha || null, actualizadoPor: h.actualizadoPor || "", cambio: h.cambio || "" }));
    out[nombre] = { version: v.version, huellaFabrica: v.huellaFabrica || "", actualizadoPor: v.actualizadoPor || "", fecha: v.fecha || null, cambio: v.cambio || "", historial };
  }
  return out;
}

/** Documento REST de un catálogo → { datos (texto), version }. */
export function parsearCatalogoRest(doc) {
  return { datos: valorRest(doc?.fields?.datos), version: valorRest(doc?.fields?.version) };
}

async function config() {
  try {
    return (await import("../auth/firebase-config.js")).firebaseConfig || null;
  } catch {
    return null;
  }
}

async function leerDocumentoRest(id) {
  const cfg = await config();
  if (!cfg) return null;
  const url = `https://firestore.googleapis.com/v1/projects/${cfg.projectId}/databases/(default)/documents/catalogos/${encodeURIComponent(id)}?key=${cfg.apiKey}`;
  const res = await fetch(url, { cache: "no-store" });
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(`El servidor respondió ${res.status}.`);
  return res.json();
}

export const lectorRest = {
  async indice() {
    const doc = await leerDocumentoRest("_indice");
    return doc ? parsearIndiceRest(doc) : null;
  },
  async catalogo(nombre) {
    const doc = await leerDocumentoRest(nombre);
    return doc ? parsearCatalogoRest(doc) : null;
  },
};

/** Lector que lee lo publicado en el backend simulado (solo pruebas). */
export function lectorDesdeMock(mock) {
  return {
    indice: async () => (Object.keys(mock.servidor.indice).length ? structuredClone(mock.servidor.indice) : null),
    catalogo: async (n) => (mock.servidor.documentos[n] ? { ...mock.servidor.documentos[n] } : null),
  };
}

let lector = lectorRest;
/** Solo pruebas. */
export function usarLector(l) {
  lector = l || lectorRest;
}
/** Lector activo (el panel del administrador lo usa para ver lo publicado). */
export const lectorActivo = () => lector;

// ------------------------------------------------------------------ sincronización

let enCurso = null;

/**
 * Trae del servidor los catálogos cuya versión cambió y los guarda en el dispositivo.
 * @returns {Promise<{actualizados: string[], error: string|null}>}  Nunca rechaza: si algo falla, se sigue con lo que hay.
 */
export function sincronizarCatalogos() {
  if (enCurso) return enCurso;
  enCurso = (async () => {
    const actualizados = [];
    if (typeof navigator !== "undefined" && navigator.onLine === false) return { actualizados, error: "sin conexión" };
    try {
      const indice = await lector.indice();
      if (!indice) return { actualizados, error: null }; // nada publicado aún: se usan los de fábrica
      for (const [nombre, meta] of Object.entries(indice)) {
        if (infoCopia(nombre)?.version === meta.version) continue;
        try {
          const doc = await lector.catalogo(nombre);
          if (!doc || typeof doc.datos !== "string") continue;
          const datos = JSON.parse(doc.datos);
          if (!datosValidos(datos)) continue; // un catálogo dañado en el servidor no reemplaza al que ya se tiene
          localStorage.setItem(PREFIJO_COPIA + nombre, JSON.stringify({ version: doc.version ?? meta.version, fecha: meta.fecha, actualizadoPor: meta.actualizadoPor, datos: doc.datos }));
          actualizados.push(nombre);
        } catch {
          /* ese catálogo queda como estaba; se reintenta la próxima vez */
        }
      }
      return { actualizados, error: null };
    } catch (e) {
      return { actualizados, error: String(e?.message || e) };
    }
  })().finally(() => {
    enCurso = null;
  });
  return enCurso;
}
