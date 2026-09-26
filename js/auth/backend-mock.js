// Backend SIMULADO en memoria, solo para pruebas (tools/verify_ia.html y tools/preview_ia.html).
// Replica las reglas de firebase/firestore.rules: solo un admin gestiona la lista, un admin no puede
// quitarse ni bajarse el rol a si mismo, la clave personal solo la ve su dueno, etc.
// NUNCA se usa en la app real (ver obtenerBackend en backend.js).

import { ErrorAcceso, ROLES, normalizarCorreo, correoValido } from "./backend.js";

const MAX_HISTORIAL = 10;
const CATALOGOS_CONOCIDOS = ["conductores-desnudos", "conductores-semiaislados", "conductores-xlpe", "tuberias", "resoluciones", "codificacion"];

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
  const servidor = { indice: {}, documentos: {}, historial: {} }; // catalogos publicados
  const valoraciones = new Map(); // correo -> Map(id -> valoracion)
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
      requerirAdmin(); // como las reglas: solo un administrador ve la lista completa
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

    // Catalogos: el mock guarda lo publicado en `servidor` (el mismo objeto que lee el lector simulado de las pruebas,
    // ver lectorDesdeMock en js/util/catalogos-remotos.js). Replica las reglas: solo admin, nombre conocido, tamaño.
    async publicarCatalogo(nombre, { datos, huellaFabrica, cambio = "" }) {
      await espera();
      requerirAdmin();
      if (!CATALOGOS_CONOCIDOS.includes(nombre)) throw new ErrorAcceso("Catálogo desconocido.", "permiso");
      if (typeof datos !== "string" || datos.length >= 1000000) throw new ErrorAcceso("El catálogo no es válido o es demasiado grande.", "permiso");
      const actual = servidor.indice[nombre];
      const version = Math.max(Date.now(), (actual?.version || 0) + 1);
      const fecha = new Date().toISOString();
      let historial = actual?.historial || [];
      if (actual && !historial.some((h) => h.version === actual.version) && servidor.documentos[nombre]) {
        servidor.historial[`${nombre}__${actual.version}`] = { nombre, datos: servidor.documentos[nombre].datos, version: actual.version };
        historial = [{ version: actual.version, fecha: actual.fecha, actualizadoPor: actual.actualizadoPor, cambio: actual.cambio || "Publicación anterior" }, ...historial];
      }
      historial = [{ version, fecha, actualizadoPor: correo(), cambio }, ...historial];
      for (const h of historial.slice(MAX_HISTORIAL)) delete servidor.historial[`${nombre}__${h.version}`];
      servidor.documentos[nombre] = { datos, version };
      servidor.historial[`${nombre}__${version}`] = { nombre, datos, version };
      servidor.indice[nombre] = { version, huellaFabrica, actualizadoPor: correo(), fecha, cambio, historial: historial.slice(0, MAX_HISTORIAL) };
      return version;
    },
    async leerVersionHistorial(nombre, version) {
      await espera();
      requerirAdmin();
      return servidor.historial[`${nombre}__${version}`]?.datos ?? null;
    },
    servidor,

    // Valoraciones guardadas: replica las reglas (solo el dueño; forma, nombre y tamaño validados).
    async listarValoraciones() {
      await espera();
      requerirUsuario();
      return [...(valoraciones.get(correo())?.values() ?? [])].map((v) => ({ ...v }));
    },
    async guardarValoracion({ id, nombre, resumen = "", datos, creado, actualizado }) {
      await espera();
      requerirUsuario();
      const valida =
        /^[A-Za-z0-9_-]{8,64}$/.test(id) &&
        typeof nombre === "string" && nombre.length > 0 && nombre.length <= 120 &&
        typeof resumen === "string" && resumen.length <= 200 &&
        typeof datos === "string" && datos.length < 500000 &&
        Number.isFinite(creado) && Number.isFinite(actualizado);
      if (!valida) throw new ErrorAcceso("Tu cuenta no tiene permiso para esta operación.", "permiso");
      if (!valoraciones.has(correo())) valoraciones.set(correo(), new Map());
      valoraciones.get(correo()).set(id, { id, nombre, resumen, datos, creado, actualizado });
    },
    async eliminarValoracion(id) {
      await espera();
      requerirUsuario();
      valoraciones.get(correo())?.delete(id);
    },
    valoraciones,

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
