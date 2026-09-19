// Nivel de acceso de quien usa la app: "visitante" | "usuario" | "admin".
//
//  - Sin sesion, o con sesion pero fuera de la lista de autorizados (coleccion `usuarios` de Firestore): visitante.
//  - En la lista: "usuario" o "admin" segun su rol.
//
// Como la app funciona sin internet, la confirmacion del servidor se guarda en el dispositivo (localStorage, clave
// `acceso.cache`: correo, rol y CUANDO la confirmo el servidor). Reglas:
//  - Con internet: al abrir la app (y al volver a ella tras unas horas, o al recuperar la conexion) se consulta la lista.
//      * sigue en la lista            -> se renueva la fecha de confirmacion (los 15 dias vuelven a empezar);
//      * ya no esta / cerro sesion    -> pierde el acceso de inmediato (se borra la cache);
//      * no se pudo consultar (error) -> se conserva la cache.
//  - Sin internet: vale la cache si la ultima confirmacion tiene menos de 15 dias; si no, modo visitante hasta reconectarse.
// Es un control de USO de la interfaz: la seguridad real (lista, claves de Gemini) la aplican las reglas de Firestore.

import { obtenerBackend, esperarSesion } from "./backend.js";

export const VIGENCIA_SIN_CONEXION_MS = 15 * 24 * 60 * 60 * 1000;
export const REVALIDAR_TRAS_MS = 6 * 60 * 60 * 1000;
const TOLERANCIA_RELOJ_MS = 24 * 60 * 60 * 1000; // si el reloj del equipo "retrocede" mas que esto, la cache no se acepta
export const CLAVE_CACHE = "acceso.cache";

let reloj = () => Date.now();
/** Solo para pruebas: reemplaza el reloj. */
export function usarReloj(f) {
  reloj = f || (() => Date.now());
}

const SIN_ACCESO = Object.freeze({ nivel: "visitante", email: "", fuente: "ninguna", validadoEn: 0 });
let estado = SIN_ACCESO;
const oyentes = new Set();

// ---------------------------------------------------------------- cache

export function leerCache() {
  try {
    const c = JSON.parse(localStorage.getItem(CLAVE_CACHE) || "null");
    if (c && typeof c.email === "string" && (c.rol === "admin" || c.rol === "usuario") && Number.isFinite(c.validadoEn)) return c;
  } catch {
    /* sin storage o dato dañado: sin cache */
  }
  return null;
}
function guardarCache(c) {
  try {
    localStorage.setItem(CLAVE_CACHE, JSON.stringify(c));
  } catch {
    /* sin storage: el acceso dura solo esta sesion */
  }
}
export function limpiarCache() {
  try {
    localStorage.removeItem(CLAVE_CACHE);
  } catch {
    /* nada */
  }
}

/** Nivel que da una cache en el instante `ahora` ("visitante" si no hay, esta vencida o el reloj retrocedio). */
export function nivelDeCache(cache, ahora) {
  if (!cache) return "visitante";
  const edad = ahora - cache.validadoEn;
  if (edad < -TOLERANCIA_RELOJ_MS || edad > VIGENCIA_SIN_CONEXION_MS) return "visitante";
  return cache.rol === "admin" ? "admin" : "usuario";
}

/** Hasta cuando vale la cache sin conexion (ms), o null si no hay. */
export function venceLaCache(cache) {
  return cache ? cache.validadoEn + VIGENCIA_SIN_CONEXION_MS : null;
}

// ---------------------------------------------------------------- estado

export const estadoAcceso = () => estado;

export function alCambiarAcceso(cb) {
  oyentes.add(cb);
  return () => oyentes.delete(cb);
}

function fijar(nuevo) {
  const cambio = nuevo.nivel !== estado.nivel || nuevo.email !== estado.email;
  estado = Object.freeze(nuevo);
  if (cambio) oyentes.forEach((cb) => cb(estado));
}

function aplicarCache() {
  const c = leerCache();
  const nivel = nivelDeCache(c, reloj());
  fijar(nivel === "visitante" ? SIN_ACCESO : { nivel, email: c.email, fuente: "cache", validadoEn: c.validadoEn });
}

// ---------------------------------------------------------------- validacion contra el servidor

let enCurso = null;
let suscrito = false;
let ultimoCorreo;

function vigilarSesion(b) {
  if (suscrito) return;
  suscrito = true;
  let primera = true;
  b.observarSesion((u) => {
    const correo = u?.email ?? null;
    if (primera) {
      primera = false;
      ultimoCorreo = correo;
      return;
    }
    if (correo !== ultimoCorreo) {
      ultimoCorreo = correo;
      revalidar(); // inicio o cierre de sesion (en Perfil o en otra pestaña)
    }
  });
}

/** Consulta al servidor y actualiza el nivel. Nunca lanza: ante cualquier fallo de red se conserva la cache. */
export function revalidar() {
  if (enCurso) return enCurso;
  enCurso = (async () => {
    try {
      const b = await obtenerBackend();
      if (!b) return fijar(SIN_ACCESO);
      if (typeof navigator !== "undefined" && navigator.onLine === false) return aplicarCache();
      try {
        await b.listo?.(); // carga el SDK: sin el, no hay forma de saber si hay sesion (no confundir con "sin sesion")
      } catch {
        return aplicarCache();
      }
      vigilarSesion(b);
      const usuario = await esperarSesion(b);
      if (!usuario) {
        limpiarCache();
        return fijar(SIN_ACCESO);
      }
      let perfil;
      try {
        perfil = await b.obtenerPerfil();
      } catch {
        return aplicarCache(); // no se pudo consultar: se conserva lo ultimo confirmado
      }
      if (!perfil) {
        limpiarCache();
        return fijar(SIN_ACCESO);
      }
      const validadoEn = reloj();
      guardarCache({ email: perfil.email, rol: perfil.rol, validadoEn });
      fijar({ nivel: perfil.rol === "admin" ? "admin" : "usuario", email: perfil.email, fuente: "servidor", validadoEn });
    } catch {
      aplicarCache();
    } finally {
      enCurso = null;
    }
  })();
  return enCurso;
}

/** Solo para pruebas: vuelve al estado inicial (sin cache, sin sesion vigilada, sin validacion en curso). */
export function reiniciarAccesoParaPruebas() {
  estado = SIN_ACCESO;
  enCurso = null;
  suscrito = false;
  ultimoCorreo = undefined;
  limpiarCache();
}

/**
 * Arranque de la app: aplica de inmediato lo guardado en el dispositivo (sin esperar a la red) y luego valida contra el
 * servidor en segundo plano. Ademas vuelve a validar al recuperar la conexion y al volver a la app tras unas horas.
 */
export function iniciarAcceso() {
  aplicarCache();
  const validacion = revalidar();
  if (typeof window !== "undefined") {
    window.addEventListener("online", () => revalidar());
    document.addEventListener("visibilitychange", () => {
      if (document.visibilityState !== "visible") return;
      if (typeof navigator !== "undefined" && navigator.onLine === false) return aplicarCache(); // ¿vencio la cache?
      if (estado.fuente !== "servidor" || reloj() - estado.validadoEn > REVALIDAR_TRAS_MS) revalidar();
    });
  }
  return validacion;
}
