// Historial local de conversaciones de IA (IndexedDB del navegador).
// Nada sale del equipo. Si IndexedDB no esta disponible, todo degrada a "sin
// historial" sin romper las vistas.

const DB = "herramientas-ia";
const STORE = "conversaciones";

function abrir() {
  return new Promise((resolve, reject) => {
    if (typeof indexedDB === "undefined") return reject(new Error("IndexedDB no disponible"));
    const req = indexedDB.open(DB, 1);
    req.onupgradeneeded = () => {
      const store = req.result.createObjectStore(STORE, { keyPath: "id" });
      store.createIndex("tipo", "tipo");
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function tx(modo, fn) {
  const db = await abrir();
  try {
    return await new Promise((resolve, reject) => {
      const t = db.transaction(STORE, modo);
      const store = t.objectStore(STORE);
      const req = fn(store);
      t.oncomplete = () => resolve(req?.result);
      t.onerror = () => reject(t.error);
      t.onabort = () => reject(t.error);
    });
  } finally {
    db.close();
  }
}

export function nuevoId() {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;
}

/** Guarda (crea o reemplaza) una conversacion. Devuelve true si se pudo. */
export async function guardar(conv) {
  try {
    await tx("readwrite", (s) => s.put({ ...conv, actualizado: Date.now() }));
    return true;
  } catch {
    return false;
  }
}

/** Conversaciones de un tipo ("analisis" | "redaccion"), mas recientes primero. */
export async function listar(tipo) {
  try {
    const todas = (await tx("readonly", (s) => s.index("tipo").getAll(tipo))) || [];
    return todas.sort((a, b) => b.actualizado - a.actualizado);
  } catch {
    return [];
  }
}

export async function obtener(id) {
  try {
    return (await tx("readonly", (s) => s.get(id))) || null;
  } catch {
    return null;
  }
}

export async function borrar(id) {
  try {
    await tx("readwrite", (s) => s.delete(id));
    return true;
  } catch {
    return false;
  }
}

export async function borrarTodo() {
  try {
    await tx("readwrite", (s) => s.clear());
    return true;
  } catch {
    return false;
  }
}

export async function contar() {
  try {
    return (await tx("readonly", (s) => s.count())) || 0;
  } catch {
    return 0;
  }
}
