// Capa de acceso (login con Google + lista de usuarios autorizados + claves de
// Gemini en el servidor). La app habla con un "backend" que cumple este contrato:
//
//   disponible()                       -> true si el servicio esta configurado
//   observarSesion(cb)                 -> cb(usuario|null) ahora y en cada cambio; devuelve funcion para dejar de observar
//                                         usuario = { email, nombre, foto }
//   iniciarSesion()                    -> abre el login de Google; devuelve el usuario
//   cerrarSesion()
//   obtenerPerfil()                    -> { email, rol } si el correo esta en la lista, o null si no tiene acceso
//   listarUsuarios()                   -> [{ email, rol, agregadoPor, fecha }]           (requiere estar autorizado)
//   guardarUsuario(email, rol)         -> agrega o cambia el rol                          (solo admin)
//   quitarUsuario(email)               ->                                                 (solo admin)
//   leerClaveCompartida()              -> string | null                                   (requiere estar autorizado)
//   guardarClaveCompartida(clave|null) -> guarda o borra                                  (solo admin)
//   leerClavePersonal()                -> string | null                                   (solo el propio usuario)
//   guardarClavePersonal(clave|null)   -> guarda o borra                                  (solo el propio usuario)
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

/** Solo para pruebas (tools/verify_ia.html, tools/preview_ia.html). */
export function usarBackend(b) {
  backend = b;
}

/** Devuelve el backend real, o null si Firebase aun no esta configurado (js/auth/firebase-config.js). */
export async function obtenerBackend() {
  if (backend) return backend;
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
