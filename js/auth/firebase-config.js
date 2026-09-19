// Configuracion PUBLICA del proyecto de Firebase. Estos valores (apiKey, projectId...) son
// identificadores publicos por diseno: la seguridad no depende de ocultarlos sino de las reglas de
// Firestore (firebase/firestore.rules), que aplica el servidor de Google.
//
// Si fuera null, la pantalla "Configuracion avanzada" avisaria que el servicio no esta configurado
// (ver README, seccion "Acceso con Google y Firebase"). Proyecto: herramientas-ingenieria (plan Spark).

export const firebaseConfig = {
  apiKey: "AIzaSyBOfEH2PNMCqF_siaHXKCVAnZwh5gnms08",
  authDomain: "herramientas-ingenieria.firebaseapp.com",
  projectId: "herramientas-ingenieria",
  storageBucket: "herramientas-ingenieria.firebasestorage.app",
  messagingSenderId: "124980507723",
  appId: "1:124980507723:web:dc5f215cf827fabe02c9ce",
};

// Version del SDK que se carga desde el CDN de Google (gstatic), sin build step.
export const FIREBASE_SDK_VERSION = "11.10.0";
