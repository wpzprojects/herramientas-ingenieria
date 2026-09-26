// Valoraciones integrales guardadas (2026-09-25, pedido del usuario): se guardan SIEMPRE en este dispositivo
// (localStorage) y, si hay servicio, sesión y conexión, también en la cuenta del usuario (Firestore:
// usuarios/{correo}/valoraciones/{id}), para retomarlas desde otro equipo o el celular.
//
// Robustez (pedido explícito): nada de esto puede detener la pantalla. Cada llamada al servidor tiene un tiempo
// máximo y todos los errores se atrapan; las funciones públicas NUNCA lanzan: devuelven lo que haya en el dispositivo
// y un estado que la pantalla muestra como aviso. Lo que no se pudo subir queda marcado como `pendiente` y los
// borrados que no llegaron al servidor, en `eliminadas`; se completan en la siguiente sincronización.
//
// Registro: { id, nombre, resumen, datos (texto JSON con el formulario), creado, actualizado (ms), cuenta (correo o
// null), pendiente (bool) }. Al unir con el servidor gana el que tenga `actualizado` más reciente.

import { obtenerBackend, esperarSesion } from "../auth/backend.js";
import { estadoAcceso } from "../auth/acceso.js";

export const CLAVE_LOCAL = "valoraciones.guardadas";
export const MAX_GUARDADAS = 100;
export const MAX_NOMBRE = 120;
export const MAX_DATOS = 400000; // caracteres del JSON del formulario (las reglas del servidor aceptan hasta 500 000)
const TIEMPO_MAXIMO_MS = 8000;

// ---------------------------------------------------------------- almacenamiento local

function leerLocal() {
  try {
    const v = JSON.parse(localStorage.getItem(CLAVE_LOCAL) || "null");
    const items = Array.isArray(v?.items) ? v.items.filter(registroValido) : [];
    const eliminadas = Array.isArray(v?.eliminadas) ? v.eliminadas.filter((e) => e && typeof e.id === "string") : [];
    return { items, eliminadas };
  } catch {
    return { items: [], eliminadas: [] };
  }
}

function escribirLocal(estado) {
  try {
    localStorage.setItem(CLAVE_LOCAL, JSON.stringify(estado));
    return true;
  } catch {
    return false; // sin espacio o sin almacenamiento: se informa como error local
  }
}

export function registroValido(r) {
  return (
    !!r &&
    typeof r.id === "string" &&
    /^[A-Za-z0-9_-]{8,64}$/.test(r.id) &&
    typeof r.nombre === "string" &&
    r.nombre.trim() !== "" &&
    typeof r.datos === "string" &&
    Number.isFinite(r.actualizado)
  );
}

/** Id nuevo, válido para el servidor (letras, números, guiones). */
export function nuevoId() {
  try {
    if (crypto?.randomUUID) return crypto.randomUUID();
  } catch {
    /* sin crypto */
  }
  return `v${Date.now().toString(36)}${Math.random().toString(36).slice(2, 10)}`;
}

/** Correo de la cuenta con acceso (también sin conexión, por la cache de acceso), o null. */
const cuentaActual = () => {
  try {
    const e = estadoAcceso();
    return e && e.nivel !== "visitante" && e.email ? e.email : null;
  } catch {
    return null;
  }
};
// Lo guardado sin cuenta se muestra y se adopta; si aún no se sabe qué cuenta hay (sin validación de acceso), se muestra todo.
const deLaCuenta = (r, cuenta) => !cuenta || !r.cuenta || r.cuenta === cuenta;

// ---------------------------------------------------------------- servidor (nunca lanza)

const conTiempo = (promesa, ms = TIEMPO_MAXIMO_MS) =>
  Promise.race([promesa, new Promise((_, rechazar) => setTimeout(() => rechazar(new Error("tiempo")), ms))]);

let backendPruebas; // solo pruebas
/** Solo para pruebas: fija el backend (o null = sin servicio) sin pasar por Firebase. */
export function usarBackendValoraciones(b) {
  backendPruebas = b;
}

/**
 * Backend listo para usar, o el motivo por el que no se puede: "sin-servicio" (Firebase no configurado o no cargó),
 * "sin-conexion", "sin-sesion" (no hay sesión o la cuenta no está autorizada).
 */
async function servidor() {
  if (typeof navigator !== "undefined" && navigator.onLine === false) return { motivo: "sin-conexion" };
  try {
    const b = backendPruebas !== undefined ? backendPruebas : await conTiempo(obtenerBackend());
    if (!b || typeof b.listarValoraciones !== "function") return { motivo: "sin-servicio" };
    const u = await conTiempo(esperarSesion(b), 5000);
    if (!u?.email) return { motivo: "sin-sesion" };
    return { b, email: String(u.email).toLowerCase() };
  } catch {
    return { motivo: "sin-servicio" };
  }
}

const MENSAJES = {
  "sin-servicio": "Guardadas solo en este dispositivo: el servicio de la cuenta no está disponible.",
  "sin-conexion": "Sin conexión: se muestran las guardadas en este dispositivo; se sincronizan al volver la conexión.",
  "sin-sesion": "Guardadas solo en este dispositivo: inicia sesión en Perfil para tenerlas también en tu cuenta.",
  error: "No se pudo sincronizar con tu cuenta; se muestran las guardadas en este dispositivo.",
};

const GUARDADA_SOLO_LOCAL = {
  "sin-servicio": "Guardada en este dispositivo (el servicio de la cuenta no está disponible).",
  "sin-conexion": "Guardada en este dispositivo; se subirá a tu cuenta cuando haya conexión.",
  "sin-sesion": "Guardada en este dispositivo. Inicia sesión en Perfil para tenerla también en tu cuenta.",
};

// ---------------------------------------------------------------- API pública (ninguna función lanza)

/**
 * Sube lo pendiente, aplica los borrados pendientes y une con lo que haya en la cuenta. Devuelve la lista (más reciente
 * primero) y el estado: { items, remoto: true|false, mensaje }.
 */
export async function sincronizar() {
  const local = leerLocal();
  const cuenta = cuentaActual();
  const s = await servidor();
  if (!s.b) return { items: ordenar(local.items.filter((r) => deLaCuenta(r, cuenta))), remoto: false, mensaje: MENSAJES[s.motivo] };
  try {
    const remotos = (await conTiempo(s.b.listarValoraciones())).filter(registroValido);
    const porId = new Map(remotos.map((r) => [r.id, { ...r, cuenta: s.email, pendiente: false }]));

    // borrados hechos sin conexión
    const quedan = [];
    for (const e of local.eliminadas) {
      if (e.cuenta && e.cuenta !== s.email) {
        quedan.push(e);
        continue;
      }
      try {
        if (porId.has(e.id)) await conTiempo(s.b.eliminarValoracion(e.id));
        porId.delete(e.id);
      } catch {
        quedan.push(e);
      }
    }

    const otrasCuentas = [];
    for (const r of local.items) {
      if (!deLaCuenta(r, s.email)) {
        otrasCuentas.push(r); // de otra persona que usó este equipo: se deja quieto
        continue;
      }
      const remoto = porId.get(r.id);
      if (r.pendiente || !r.cuenta) {
        if (!remoto || r.actualizado >= remoto.actualizado) {
          try {
            await conTiempo(s.b.guardarValoracion(aRemoto(r)));
            porId.set(r.id, { ...r, cuenta: s.email, pendiente: false });
          } catch {
            porId.set(r.id, { ...r, cuenta: s.email, pendiente: true });
          }
        }
      } else if (remoto && r.actualizado > remoto.actualizado) {
        porId.set(r.id, { ...r, pendiente: false });
      }
      // sincronizada antes y ya no está en la cuenta: se borró desde otro equipo, así que no se vuelve a agregar
    }
    const items = [...porId.values()];
    escribirLocal({ items: [...items, ...otrasCuentas], eliminadas: quedan });
    const pendientes = items.filter((r) => r.pendiente).length;
    return {
      items: ordenar(items),
      remoto: true,
      mensaje: pendientes ? `${pendientes === 1 ? "Una valoración aún no se ha podido subir" : `${pendientes} valoraciones aún no se han podido subir`} a tu cuenta; se reintentará.` : "Sincronizadas con tu cuenta.",
    };
  } catch {
    return { items: ordenar(local.items.filter((r) => deLaCuenta(r, cuenta))), remoto: false, mensaje: MENSAJES.error };
  }
}

/** Lista lo que hay en este dispositivo (sin ir al servidor). */
export function listarLocales() {
  const cuenta = cuentaActual();
  return ordenar(leerLocal().items.filter((r) => deLaCuenta(r, cuenta)));
}

/**
 * Guarda (crea o, con `id` existente, reemplaza). Primero en el dispositivo; luego intenta subirla a la cuenta.
 * @returns {Promise<{ok:boolean, registro?:object, remoto:boolean, mensaje:string}>}
 */
export async function guardar({ id = null, nombre, datos, resumen = "" }) {
  const limpio = String(nombre ?? "").trim().slice(0, MAX_NOMBRE);
  if (!limpio) return { ok: false, remoto: false, mensaje: "Escribe un nombre para la valoración." };
  const texto = typeof datos === "string" ? datos : JSON.stringify(datos);
  if (texto.length > MAX_DATOS) return { ok: false, remoto: false, mensaje: "La valoración es demasiado grande para guardarla." };

  const local = leerLocal();
  const ahora = Date.now();
  const previo = id ? local.items.find((r) => r.id === id) : null;
  const registro = {
    id: previo ? previo.id : nuevoId(),
    nombre: limpio,
    resumen: String(resumen).slice(0, 200),
    datos: texto,
    creado: previo?.creado ?? ahora,
    actualizado: ahora,
    cuenta: previo?.cuenta ?? cuentaActual(),
    pendiente: true,
  };
  if (!previo && local.items.filter((r) => deLaCuenta(r, cuentaActual())).length >= MAX_GUARDADAS) {
    return { ok: false, remoto: false, mensaje: `Ya hay ${MAX_GUARDADAS} valoraciones guardadas: elimina alguna antes de guardar otra.` };
  }
  const items = previo ? local.items.map((r) => (r.id === registro.id ? registro : r)) : [registro, ...local.items];
  if (!escribirLocal({ ...local, items })) return { ok: false, remoto: false, mensaje: "No se pudo guardar en este dispositivo (sin espacio o almacenamiento bloqueado)." };

  const s = await servidor();
  if (!s.b) return { ok: true, registro, remoto: false, mensaje: GUARDADA_SOLO_LOCAL[s.motivo] };
  try {
    await conTiempo(s.b.guardarValoracion(aRemoto(registro)));
    const subido = { ...registro, cuenta: s.email, pendiente: false };
    const actual = leerLocal();
    escribirLocal({ ...actual, items: actual.items.map((r) => (r.id === subido.id ? subido : r)) });
    return { ok: true, registro: subido, remoto: true, mensaje: "Guardada en este dispositivo y en tu cuenta." };
  } catch {
    return { ok: true, registro, remoto: false, mensaje: "Guardada en este dispositivo. No se pudo subir a tu cuenta; se reintentará." };
  }
}

/** Elimina en el dispositivo y, si se puede, en la cuenta (si no, queda pendiente de borrar allá). */
export async function eliminar(id) {
  const local = leerLocal();
  const r = local.items.find((x) => x.id === id);
  const sincronizada = r && r.cuenta && !r.pendiente;
  const items = local.items.filter((x) => x.id !== id);
  const eliminadas = sincronizada ? [...local.eliminadas, { id, cuenta: r.cuenta }] : local.eliminadas;
  escribirLocal({ items, eliminadas });
  if (!sincronizada) return { ok: true, remoto: false };
  const s = await servidor();
  if (!s.b || s.email !== r.cuenta) return { ok: true, remoto: false };
  try {
    await conTiempo(s.b.eliminarValoracion(id));
    const actual = leerLocal();
    escribirLocal({ ...actual, eliminadas: actual.eliminadas.filter((e) => e.id !== id) });
    return { ok: true, remoto: true };
  } catch {
    return { ok: true, remoto: false };
  }
}

/** Los datos del formulario de una guardada, ya convertidos (null si están dañados). */
export function leerDatos(registro) {
  try {
    const d = JSON.parse(registro.datos);
    return d && typeof d === "object" ? d : null;
  } catch {
    return null;
  }
}

const ordenar = (items) => [...items].sort((a, b) => b.actualizado - a.actualizado);
const aRemoto = (r) => ({ id: r.id, nombre: r.nombre, resumen: r.resumen || "", datos: r.datos, creado: r.creado, actualizado: r.actualizado });
