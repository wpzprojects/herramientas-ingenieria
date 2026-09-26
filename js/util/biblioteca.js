// Biblioteca técnica (2026-09-26, pedido del usuario): referencias de consulta (apartes de normas, tablas, figuras,
// notas) organizadas por fuente. Cada registro: { id, fuente, titulo, texto, imagenes: [{ src | id, pie }] }.
//  - La LISTA de registros es un catálogo más del servidor («biblioteca», js/util/catalogos-remotos.js): trae los de
//    fábrica (data/biblioteca.json, con imágenes de assets/: `src`) y, si el administrador la editó, gana el servidor.
//    Sin historial de versiones (decisión del usuario: se puede volver a cargar un registro borrado).
//  - Cada imagen subida desde la app es un documento propio en Firestore (biblioteca_imagenes/{id} = { datos: data URL,
//    tipo, creado }), porque el almacenamiento de archivos de Firebase ya no es gratuito. Para que quepa (< 1 MB) la app
//    la reduce al subirla (máx. 1600 px de lado, JPEG/WebP). Las ya vistas se guardan en el dispositivo (Cache API) y
//    se pueden consultar sin conexión.

import { lectorActivo } from "./catalogos-remotos.js";

export const CATALOGO = "biblioteca";
export const LADO_MAXIMO = 1600; // px
export const LIMITE_BYTES = 900_000; // margen bajo el 1 MB de Firestore
const CACHE = "biblioteca-imagenes";
const clave = (id) => `/biblioteca-imagen/${encodeURIComponent(id)}`;

const rutaAsset = (src) => `${window.__BASE_PATH__ || ""}${src}`;

/** Fuentes distintas, en el orden en que aparecen. */
export const fuentesDe = (filas) => [...new Set(filas.map((f) => f.fuente).filter(Boolean))];

/** Identificador para una imagen nueva (letras, números, guion; 20 caracteres). */
export function nuevoIdImagen() {
  const a = new Uint8Array(12);
  crypto.getRandomValues(a);
  return `img-${[...a].map((b) => b.toString(36).padStart(2, "0")).join("").slice(0, 16)}`;
}

// Cada operación con la copia del dispositivo tiene un tiempo máximo: si la Cache API no responde (pasa en el Edge sin
// pantalla de las pruebas, y podría pasar con un almacenamiento dañado), se sigue como si no hubiera copia.
const conLimite = (promesa, ms = 1500) => Promise.race([promesa, new Promise((r) => setTimeout(() => r(null), ms))]);

async function abrirCache() {
  try {
    return typeof caches !== "undefined" ? await conLimite(caches.open(CACHE)) : null;
  } catch {
    return null;
  }
}

/** Guarda en el dispositivo una imagen (data URL) para verla sin conexión. */
export async function guardarEnDispositivo(id, datos) {
  const c = await abrirCache();
  try {
    await conLimite(c?.put(clave(id), new Response(datos, { headers: { "Content-Type": "text/plain" } })));
  } catch {
    /* sin espacio o sin Cache API: se seguirá descargando */
  }
}

/**
 * Dirección que puede usar un <img>: la del archivo de la app (`src`) o la data URL de una imagen del servidor (primero
 * la copia del dispositivo; si no hay, se descarga y se guarda). null si no se pudo obtener.
 */
export async function urlDeImagen(img) {
  if (img?.src) return rutaAsset(img.src);
  if (!img?.id) return null;
  const c = await abrirCache();
  try {
    const guardada = await conLimite(c?.match(clave(img.id)));
    if (guardada) return await conLimite(guardada.text());
  } catch {
    /* sigue con el servidor */
  }
  try {
    const datos = await lectorActivo().imagen?.(img.id);
    if (typeof datos === "string" && datos.startsWith("data:image/")) {
      guardarEnDispositivo(img.id, datos);
      return datos;
    }
  } catch {
    /* sin conexión o sin servidor */
  }
  return null;
}

/** Quita del dispositivo las imágenes que ya no usa ningún registro. */
export async function limpiarDispositivo(filas) {
  const c = await abrirCache();
  if (!c) return;
  const usadas = new Set(filas.flatMap((f) => (f.imagenes || []).map((i) => i.id).filter(Boolean)).map(clave));
  try {
    for (const req of (await conLimite(c.keys())) || []) if (!usadas.has(new URL(req.url).pathname)) await conLimite(c.delete(req));
  } catch {
    /* no es grave */
  }
}

/** Tamaño aproximado en bytes de una data URL (base64). */
export const bytesDe = (dataUrl) => Math.round(((dataUrl.length - dataUrl.indexOf(",") - 1) * 3) / 4);

/**
 * Reduce y comprime una imagen para subirla: lado mayor ≤ `lado` px y peso < `limite` bytes. Usa WebP si el navegador lo
 * sabe escribir (conserva mejor el texto de las tablas) y, si no, JPEG; baja la calidad y luego el tamaño hasta que quepa.
 * @param {Blob} archivo
 * @returns {Promise<{datos:string, tipo:string, ancho:number, alto:number}>}
 */
export async function comprimirImagen(archivo, { lado = LADO_MAXIMO, limite = LIMITE_BYTES } = {}) {
  if (!archivo || !/^image\//.test(archivo.type)) throw new Error("El archivo no es una imagen.");
  const bitmap = await cargarImagen(archivo);
  let escala = Math.min(1, lado / Math.max(bitmap.width, bitmap.height));
  const lienzo = document.createElement("canvas");
  for (let intento = 0; intento < 8; intento++) {
    lienzo.width = Math.max(1, Math.round(bitmap.width * escala));
    lienzo.height = Math.max(1, Math.round(bitmap.height * escala));
    const ctx = lienzo.getContext("2d");
    ctx.fillStyle = "#ffffff"; // las transparencias quedan en blanco (JPEG no tiene transparencia)
    ctx.fillRect(0, 0, lienzo.width, lienzo.height);
    ctx.drawImage(bitmap, 0, 0, lienzo.width, lienzo.height);
    for (const calidad of [0.85, 0.72, 0.6]) {
      let datos = lienzo.toDataURL("image/webp", calidad);
      let tipo = "image/webp";
      if (!datos.startsWith("data:image/webp")) {
        datos = lienzo.toDataURL("image/jpeg", calidad);
        tipo = "image/jpeg";
      }
      if (bytesDe(datos) < limite && datos.length < 990_000) return { datos, tipo, ancho: lienzo.width, alto: lienzo.height };
    }
    escala *= 0.8; // no cupo ni con la calidad más baja: se reduce el tamaño
  }
  throw new Error("La imagen es demasiado grande incluso reducida.");
}

// Con un <img> (funciona en todos los navegadores; createImageBitmap no termina en el Edge sin pantalla de las pruebas).
function cargarImagen(archivo) {
  return new Promise((ok, mal) => {
    const url = URL.createObjectURL(archivo);
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(url);
      ok(img);
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      mal(new Error("No se pudo leer la imagen."));
    };
    img.src = url;
  });
}
