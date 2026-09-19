// Que pantallas puede abrir cada nivel de acceso. Sin DOM ni red: solo reglas.
//   visitante = sin sesion, o con sesion pero fuera de la lista de autorizados: solo el PRIMER modulo de cada grupo
//               (los items con `libre: true` en sectionMenus de nav.js), el Inicio, los menus de cada seccion y el Perfil;
//   usuario / admin = todo.
// Es un control de USO de la interfaz (los archivos del sitio son publicos); lo protegido de verdad vive en el servidor.

import { sectionMenus } from "../nav.js";

export const NIVELES = ["visitante", "usuario", "admin"];
export const TEXTO_BLOQUEADO = "Disponible al iniciar sesión con una cuenta autorizada";

const segmentos = (ruta) => String(ruta).split("/").filter(Boolean);
const rutaDeHash = (hash) => `/${segmentos(String(hash).replace(/^#/, "")).join("/")}`;

// «/ayuda/configuracion» es la ruta anterior del Perfil y solo redirige a #/perfil.
const SIEMPRE = new Set(["/perfil", "/ayuda/configuracion"]);

/** Rutas (sin «#») de los modulos libres para visitantes. */
export const RUTAS_LIBRES = Object.values(sectionMenus)
  .flat()
  .filter((item) => item.libre)
  .map((item) => rutaDeHash(item.hash));

/** ¿El item de un menu (tarjeta o enlace de Ayuda) esta habilitado para este nivel? */
export const itemHabilitado = (item, nivel) => nivel !== "visitante" || item.libre === true;

/** ¿Puede este nivel abrir la ruta (por ejemplo «/calculos/perdidas»)? */
export function permitida(ruta, nivel) {
  if (nivel !== "visitante") return true;
  const seg = segmentos(ruta);
  if (seg.length <= 1) return true; // Inicio, menus de seccion y Perfil
  const p = `/${seg.join("/")}`;
  if (SIEMPRE.has(p)) return true;
  return RUTAS_LIBRES.some((libre) => p === libre || p.startsWith(`${libre}/`));
}
