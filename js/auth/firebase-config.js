// Configuracion PUBLICA del proyecto de Firebase. Estos valores (apiKey, projectId...) son
// identificadores publicos por diseno: la seguridad no depende de ocultarlos sino de las reglas de
// Firestore (firebase/firestore.rules), que aplica el servidor de Google.
//
// Mientras sea null, la pantalla "Configuracion avanzada" avisa que el servicio no esta configurado.
// Para activarlo: crear el proyecto (ver README, seccion "Acceso con Google y Firebase") y pegar aqui
// el bloque que muestra la consola de Firebase, por ejemplo:
//
// export const firebaseConfig = {
//   apiKey: "AIza...",
//   authDomain: "mi-proyecto.firebaseapp.com",
//   projectId: "mi-proyecto",
//   appId: "1:1234567890:web:abcdef",
// };

export const firebaseConfig = null;

// Version del SDK que se carga desde el CDN de Google (gstatic), sin build step.
export const FIREBASE_SDK_VERSION = "11.10.0";
