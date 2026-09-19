// Backend SIMULADO en memoria, solo para pruebas (tools/verify_ia.html y tools/preview_ia.html).
// Replica las reglas de firebase/firestore.rules: solo un admin gestiona la lista, un admin no puede
// quitarse ni bajarse el rol a si mismo, la clave personal solo la ve su dueno, etc.
// NUNCA se usa en la app real (ver obtenerBackend en backend.js).

import { ErrorAcceso, ROLES, normalizarCorreo, correoValido } from "./backend.js";

/**
 * @param {object} [o]
 * @param {{email:string, rol:'admin'|'usuario'}[]} [o.usuarios]
 * @param {object|null} [o.sesion] - usuario con sesion iniciada al arrancar
 * @param {object} [o.cuentaAlIniciar] - usuario que devuelve iniciarSesion()
 * @param {string|null} [o.claveCompartida]
 * @param {boolean} [o.sinConexion]
 */
export function crearBackendMock({ usuarios = [], sesion = null, cuentaAlIniciar = null, claveCompartida = null, sinConexion = false } = {}) {
  const lista = new Map(usuarios.map((u) => [normalizarCorreo(u.email), { rol: u.rol, agregadoPor: u.agregadoPor || "consola", fecha: u.fecha || 0 }]));
  const personales = new Map();
  let compartida = claveCompartida;
  let actual = sesion;
  const oyentes = new Set();
  const espera = () => new Promise((r) => setTimeout(r, 0));

  const emitir = () => oyentes.forEach((cb) => cb(actual));
  const correo = () => (actual ? normalizarCorreo(actual.email) : null);
  const esUsuario = () => !!actual && lista.has(correo());
  const esAdmin = () => esUsuario() && lista.get(correo()).rol === "admin";
  const requerirRed = () => {
    if (sinConexion) throw new ErrorAcceso("Sin conexión a internet.", "offline");
  };
  const requerirUsuario = () => {
    requerirRed();
    if (!esUsuario()) throw new ErrorAcceso("No tienes permiso para esta operación.", "permiso");
  };
  const requerirAdmin = () => {
    requerirRed();
    if (!esAdmin()) throw new ErrorAcceso("Solo un administrador puede hacer esto.", "permiso");
  };

  return {
    esMock: true,
    disponible: () => true,
    async listo() {
      requerirRed();
    },

    observarSesion(cb) {
      oyentes.add(cb);
      queueMicrotask(() => oyentes.has(cb) && cb(actual));
      return () => oyentes.delete(cb);
    },
    async iniciarSesion() {
      await espera();
      requerirRed();
      if (!cuentaAlIniciar) throw new ErrorAcceso("Inicio de sesión cancelado.", "cancelado");
      actual = cuentaAlIniciar;
      emitir();
      return actual;
    },
    async cerrarSesion() {
      await espera();
      actual = null;
      emitir();
    },
    async obtenerPerfil() {
      await espera();
      requerirRed();
      if (!actual) return null;
      const d = lista.get(correo());
      return d ? { email: correo(), rol: d.rol } : null;
    },

    async listarUsuarios() {
      await espera();
      requerirUsuario();
      return [...lista].map(([email, d]) => ({ email, ...d })).sort((a, b) => a.email.localeCompare(b.email));
    },
    async guardarUsuario(email, rol) {
      await espera();
      requerirAdmin();
      const id = normalizarCorreo(email);
      if (!correoValido(id)) throw new ErrorAcceso("El correo no es válido.", "invalido");
      if (!ROLES.includes(rol)) throw new ErrorAcceso("Rol no válido.", "invalido");
      if (id === correo() && rol !== "admin") throw new ErrorAcceso("No puedes quitarte el rol de administrador a ti mismo.", "permiso");
      lista.set(id, { rol, agregadoPor: correo(), fecha: Date.now() });
    },
    async quitarUsuario(email) {
      await espera();
      requerirAdmin();
      const id = normalizarCorreo(email);
      if (id === correo()) throw new ErrorAcceso("No puedes quitarte a ti mismo de la lista.", "permiso");
      lista.delete(id);
      personales.delete(id);
    },

    async leerClaveCompartida() {
      await espera();
      requerirUsuario();
      return compartida;
    },
    async guardarClaveCompartida(clave) {
      await espera();
      requerirAdmin();
      compartida = clave || null;
    },
    async leerClavePersonal() {
      await espera();
      requerirUsuario();
      return personales.get(correo()) ?? null;
    },
    async guardarClavePersonal(clave) {
      await espera();
      requerirUsuario();
      if (clave) personales.set(correo(), clave);
      else personales.delete(correo());
    },

    // ---- solo para pruebas: cambiar de cuenta sin pasar por el login ----
    _entrarComo(usuario) {
      actual = usuario;
      emitir();
    },
    _conexion(hay) {
      sinConexion = !hay;
    },
  };
}
