// Backend REAL sobre Firebase (Authentication con Google + Firestore). El SDK se carga desde el CDN
// de Google (gstatic) solo cuando se necesita, sin build step ni dependencias en el repositorio; el
// resto de la app sigue funcionando sin internet. Las llamadas a gstatic/firebase son de otro origen,
// asi que el service worker no las intercepta.
//
// La seguridad la aplican las reglas de Firestore (firebase/firestore.rules), no este codigo.

import { ErrorAcceso, normalizarCorreo, correoValido, ROLES } from "./backend.js";
import { FIREBASE_SDK_VERSION } from "./firebase-config.js";

const CDN = `https://www.gstatic.com/firebasejs/${FIREBASE_SDK_VERSION}`;
const MAX_HISTORIAL = 10; // versiones que se guardan por catalogo (decidido con el usuario)

function traducir(err) {
  const c = String(err?.code || "");
  if (typeof navigator !== "undefined" && navigator.onLine === false) return new ErrorAcceso("Sin conexión a internet.", "offline");
  if (c === "auth/popup-closed-by-user" || c === "auth/cancelled-popup-request") return new ErrorAcceso("Inicio de sesión cancelado.", "cancelado");
  if (c === "auth/popup-blocked") return new ErrorAcceso("El navegador bloqueó la ventana de Google. Permite las ventanas emergentes para este sitio e inténtalo de nuevo.", "popup");
  if (c === "auth/unauthorized-domain") return new ErrorAcceso("Este sitio no está en los dominios autorizados de Firebase (Authentication → Configuración → Dominios autorizados).", "otro");
  if (c === "auth/network-request-failed" || c === "unavailable") return new ErrorAcceso("No se pudo contactar al servidor. Revisa tu conexión.", "red");
  if (c === "permission-denied") return new ErrorAcceso("Tu cuenta no tiene permiso para esta operación.", "permiso");
  return new ErrorAcceso(`Error inesperado (${c || err?.message || "desconocido"}).`, "otro");
}

export function crearBackendFirebase(firebaseConfig) {
  let sdk = null;

  // Carga perezosa: solo se descarga el SDK al entrar a Configuracion avanzada o al usar una clave guardada en el servidor.
  async function cargar() {
    if (sdk) return sdk;
    try {
      const [{ initializeApp }, auth, fs] = await Promise.all([
        import(`${CDN}/firebase-app.js`),
        import(`${CDN}/firebase-auth.js`),
        import(`${CDN}/firebase-firestore.js`),
      ]);
      const app = initializeApp(firebaseConfig);
      sdk = { auth, fs, authInst: auth.getAuth(app), db: fs.getFirestore(app) };
      return sdk;
    } catch (err) {
      throw new ErrorAcceso("No se pudo cargar el servicio de acceso. Revisa tu conexión.", "red");
    }
  }

  const aUsuario = (u) => (u ? { email: normalizarCorreo(u.email), nombre: u.displayName || "", foto: u.photoURL || "" } : null);

  async function correoActual() {
    const { authInst } = await cargar();
    if (!authInst.currentUser?.email) throw new ErrorAcceso("No hay una sesión iniciada.", "permiso");
    return normalizarCorreo(authInst.currentUser.email);
  }

  return {
    esMock: false,
    disponible: () => true,

    /** Carga el SDK (rechaza con ErrorAcceso si no hay red). Sirve para distinguir «sin sesion» de «no se pudo comprobar». */
    async listo() {
      await cargar();
    },

    observarSesion(cb) {
      let cancelado = false;
      let quitar = () => {};
      cargar()
        .then(({ auth, authInst }) => {
          if (!cancelado) quitar = auth.onAuthStateChanged(authInst, (u) => cb(aUsuario(u)));
        })
        .catch(() => cb(null));
      return () => {
        cancelado = true;
        quitar();
      };
    },

    async iniciarSesion() {
      try {
        const { auth, authInst } = await cargar();
        const proveedor = new auth.GoogleAuthProvider();
        proveedor.setCustomParameters({ prompt: "select_account" });
        const r = await auth.signInWithPopup(authInst, proveedor);
        return aUsuario(r.user);
      } catch (err) {
        throw err instanceof ErrorAcceso ? err : traducir(err);
      }
    },

    async cerrarSesion() {
      try {
        const { auth, authInst } = await cargar();
        await auth.signOut(authInst);
      } catch (err) {
        throw err instanceof ErrorAcceso ? err : traducir(err);
      }
    },

    async obtenerPerfil() {
      try {
        const { fs, db } = await cargar();
        const email = await correoActual();
        const s = await fs.getDoc(fs.doc(db, "usuarios", email));
        return s.exists() ? { email, rol: s.data().rol } : null;
      } catch (err) {
        if (err instanceof ErrorAcceso && err.tipo === "permiso") return null;
        throw err instanceof ErrorAcceso ? err : traducir(err);
      }
    },

    async listarUsuarios() {
      try {
        const { fs, db } = await cargar();
        const s = await fs.getDocs(fs.collection(db, "usuarios"));
        return s.docs
          .map((d) => ({ email: d.id, rol: d.data().rol, agregadoPor: d.data().agregadoPor || "", fecha: d.data().fecha?.toMillis?.() ?? 0 }))
          .sort((a, b) => a.email.localeCompare(b.email));
      } catch (err) {
        throw err instanceof ErrorAcceso ? err : traducir(err);
      }
    },

    async guardarUsuario(email, rol) {
      const id = normalizarCorreo(email);
      if (!correoValido(id)) throw new ErrorAcceso("El correo no es válido.", "invalido");
      if (!ROLES.includes(rol)) throw new ErrorAcceso("Rol no válido.", "invalido");
      try {
        const { fs, db } = await cargar();
        const yo = await correoActual();
        await fs.setDoc(fs.doc(db, "usuarios", id), { rol, agregadoPor: yo, fecha: fs.serverTimestamp() });
      } catch (err) {
        throw err instanceof ErrorAcceso ? err : traducir(err);
      }
    },

    async quitarUsuario(email) {
      try {
        const { fs, db } = await cargar();
        await fs.deleteDoc(fs.doc(db, "usuarios", normalizarCorreo(email)));
      } catch (err) {
        throw err instanceof ErrorAcceso ? err : traducir(err);
      }
    },

    async leerClaveCompartida() {
      try {
        const { fs, db } = await cargar();
        const s = await fs.getDoc(fs.doc(db, "ajustes", "gemini"));
        return s.exists() ? s.data().clave || null : null;
      } catch (err) {
        throw err instanceof ErrorAcceso ? err : traducir(err);
      }
    },

    async guardarClaveCompartida(clave) {
      try {
        const { fs, db } = await cargar();
        const ref = fs.doc(db, "ajustes", "gemini");
        if (!clave) await fs.deleteDoc(ref);
        else await fs.setDoc(ref, { clave, actualizadoPor: await correoActual(), fecha: fs.serverTimestamp() });
      } catch (err) {
        throw err instanceof ErrorAcceso ? err : traducir(err);
      }
    },

    async leerClavePersonal() {
      try {
        const { fs, db } = await cargar();
        const s = await fs.getDoc(fs.doc(db, "usuarios", await correoActual(), "secretos", "gemini"));
        return s.exists() ? s.data().clave || null : null;
      } catch (err) {
        throw err instanceof ErrorAcceso ? err : traducir(err);
      }
    },

    async guardarClavePersonal(clave) {
      try {
        const { fs, db } = await cargar();
        const ref = fs.doc(db, "usuarios", await correoActual(), "secretos", "gemini");
        if (!clave) await fs.deleteDoc(ref);
        else await fs.setDoc(ref, { clave });
      } catch (err) {
        throw err instanceof ErrorAcceso ? err : traducir(err);
      }
    },

    // Catalogo + su copia en el historial + su entrada en el indice, en un solo lote (o queda todo, o nada). El historial
    // guarda las ultimas MAX_HISTORIAL versiones; si la version publicada aun no estaba en el (publicada antes de que
    // existiera el historial), se copia primero para poder volver a ella.
    async publicarCatalogo(nombre, { datos, huellaFabrica, cambio = "" }) {
      try {
        const { fs, db } = await cargar();
        const yo = await correoActual();
        const version = Date.now();
        const fecha = new Date().toISOString();
        const refIndice = fs.doc(db, "catalogos", "_indice");
        const actual = (await fs.getDoc(refIndice)).data()?.catalogos?.[nombre] || null;
        const lote = fs.writeBatch(db);
        let historial = Array.isArray(actual?.historial) ? actual.historial : [];
        if (actual && !historial.some((h) => h.version === actual.version)) {
          const previo = await fs.getDoc(fs.doc(db, "catalogos", nombre));
          if (previo.exists()) {
            lote.set(fs.doc(db, "catalogos_historial", `${nombre}__${actual.version}`), { nombre, datos: previo.data().datos, version: actual.version });
            const f = actual.fecha?.toDate?.().toISOString?.() || fecha;
            historial = [{ version: actual.version, fecha: f, actualizadoPor: actual.actualizadoPor || "", cambio: actual.cambio || "Publicación anterior" }, ...historial];
          }
        }
        historial = [{ version, fecha, actualizadoPor: yo, cambio }, ...historial];
        for (const h of historial.slice(MAX_HISTORIAL)) lote.delete(fs.doc(db, "catalogos_historial", `${nombre}__${h.version}`));
        lote.set(fs.doc(db, "catalogos", nombre), { datos, version });
        lote.set(fs.doc(db, "catalogos_historial", `${nombre}__${version}`), { nombre, datos, version });
        lote.set(
          refIndice,
          { catalogos: { [nombre]: { version, huellaFabrica, actualizadoPor: yo, fecha: fs.serverTimestamp(), cambio, historial: historial.slice(0, MAX_HISTORIAL) } }, fecha: fs.serverTimestamp() },
          { merge: true }
        );
        await lote.commit();
        return version;
      } catch (err) {
        throw err instanceof ErrorAcceso ? err : traducir(err);
      }
    },

    // Valoraciones integrales guardadas: usuarios/{correo}/valoraciones/{id}; solo las ve y cambia su dueño (reglas).
    async listarValoraciones() {
      try {
        const { fs, db } = await cargar();
        const q = await fs.getDocs(fs.collection(db, "usuarios", await correoActual(), "valoraciones"));
        return q.docs.map((d) => ({ id: d.id, ...d.data() }));
      } catch (err) {
        throw err instanceof ErrorAcceso ? err : traducir(err);
      }
    },

    async guardarValoracion({ id, nombre, resumen = "", datos, creado, actualizado }) {
      try {
        const { fs, db } = await cargar();
        await fs.setDoc(fs.doc(db, "usuarios", await correoActual(), "valoraciones", id), { nombre, resumen, datos, creado, actualizado });
      } catch (err) {
        throw err instanceof ErrorAcceso ? err : traducir(err);
      }
    },

    async eliminarValoracion(id) {
      try {
        const { fs, db } = await cargar();
        await fs.deleteDoc(fs.doc(db, "usuarios", await correoActual(), "valoraciones", id));
      } catch (err) {
        throw err instanceof ErrorAcceso ? err : traducir(err);
      }
    },

    async leerVersionHistorial(nombre, version) {
      try {
        const { fs, db } = await cargar();
        const s = await fs.getDoc(fs.doc(db, "catalogos_historial", `${nombre}__${version}`));
        return s.exists() ? s.data().datos : null;
      } catch (err) {
        throw err instanceof ErrorAcceso ? err : traducir(err);
      }
    },
  };
}
