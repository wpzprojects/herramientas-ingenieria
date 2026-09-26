// Capa de acceso (login con Google + lista de usuarios autorizados + claves de
// Gemini en el servidor). La app habla con un "backend" que cumple este contrato:
//
//   disponible()                       -> true si el servicio esta configurado
//   listo()                            -> carga el servicio; rechaza (ErrorAcceso "red") si no hay conexion. Lo usa acceso.js
//   observarSesion(cb)                 -> cb(usuario|null) ahora y en cada cambio; devuelve funcion para dejar de observar
//                                         usuario = { email, nombre, foto }
//   iniciarSesion()                    -> abre el login de Google; devuelve el usuario
//   cerrarSesion()
//   obtenerPerfil()                    -> { email, rol } si el correo esta en la lista, o null si no tiene acceso
//   listarUsuarios()                   -> [{ email, rol, agregadoPor, fecha }]           (solo admin)
//   guardarUsuario(email, rol)         -> agrega o cambia el rol                          (solo admin)
//   quitarUsuario(email)               ->                                                 (solo admin)
//   leerClaveCompartida()              -> string | null                                   (requiere estar autorizado)
//   guardarClaveCompartida(clave|null) -> guarda o borra                                  (solo admin)
//   leerClavePersonal()                -> string | null                                   (solo el propio usuario)
//   guardarClavePersonal(clave|null)   -> guarda o borra                                  (solo el propio usuario)
//   publicarCatalogo(nombre, {datos, huellaFabrica, cambio}) -> version (numero)          (solo admin; guarda la version
//                                         en el historial, maximo 10 por catalogo)
//   leerVersionHistorial(nombre, version) -> datos (texto) | null                         (solo admin)
//                                         `datos` = el catalogo en texto JSON. Leer los catalogos NO pasa por aqui: es
//                                         publico y se hace con la API REST (js/util/catalogos-remotos.js)
//   listarValoraciones()               -> [{ id, nombre, resumen, datos, creado, actualizado }]  (solo las del propio usuario)
//   guardarValoracion({ id, nombre, resumen, datos, creado, actualizado })  -> crea o reemplaza (solo el propio usuario)
//   eliminarValoracion(id)             ->                                                 (solo el propio usuario)
//                                         Valoraciones integrales guardadas (js/util/valoraciones-guardadas.js, que
//                                         nunca deja que un error de aqui detenga la pantalla)
//
// La SEGURIDAD real la aplica el servidor (reglas de Firestore, ver firebase/firestore.rules):
// este codigo del navegador es publico y no se puede confiar en el. Aqui solo se decide que
// mostrar. El backend simulado (backend-mock.js) existe unicamente para pruebas y NUNCA se
// selecciona solo: si Firebase no esta configurado, obtenerBackend() devuelve null.

export const ROLES = ["admin", "usuario"];

export class ErrorAcceso extends Error {
  /** @param {"offline"|"cancelado"|"popup"|"permiso"|"red"|"invalido"|"otro"} tipo */
  constructor(mensaje, tipo = "otro") {
    super(mensaje);
    this.name = "ErrorAcceso";
    this.tipo = tipo;
  }
}

export const normalizarCorreo = (s) => String(s ?? "").trim().toLowerCase();
export const correoValido = (s) => /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(s);

let backend = null;
let sinBackendForzado = false;

/** Solo para pruebas (tools/verify_ia.html, tools/preview_ia.html). */
export function usarBackend(b) {
  backend = b;
  sinBackendForzado = false;
}

/** Solo para pruebas: simula que el servicio de acceso no esta configurado. */
export function simularSinBackend() {
  backend = null;
  sinBackendForzado = true;
}

/** Devuelve el backend real, o null si Firebase aun no esta configurado (js/auth/firebase-config.js). */
export async function obtenerBackend() {
  if (backend) return backend;
  if (sinBackendForzado) return null;
  const { firebaseConfig } = await import("./firebase-config.js");
  if (!firebaseConfig) return null;
  const { crearBackendFirebase } = await import("./backend-firebase.js");
  backend = crearBackendFirebase(firebaseConfig);
  return backend;
}

/** Espera al primer estado de sesion (Firebase restaura la sesion de forma asincrona). */
export function esperarSesion(b) {
  return new Promise((resolve) => {
    let hecho = false;
    let quitar = () => {};
    quitar = b.observarSesion((u) => {
      if (hecho) return;
      hecho = true;
      queueMicrotask(() => quitar());
      resolve(u);
    });
  });
}
