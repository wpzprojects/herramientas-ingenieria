// Carga perezosa de proj4js (vendor/proj4, copia local MIT: la app funciona sin internet). Solo se descarga al abrir el panel
// «Otros sistemas de coordenadas» del conversor; despues queda disponible el global `proj4`.

import { registrarColUrban } from "./proj4-col-urban.js";

let cargando = null;

/** @returns {Promise<Function>} el objeto global proj4; rechaza si no se pudo cargar (p. ej. archivo no disponible). */
export function cargarProj4() {
  if (window.proj4) return Promise.resolve(registrarColUrban(window.proj4));
  if (cargando) return cargando;
  const base = window.__BASE_PATH__ || "";
  cargando = new Promise((resolve, reject) => {
    const js = document.createElement("script");
    js.src = `${base}vendor/proj4/proj4.js`;
    js.onload = () => resolve(registrarColUrban(window.proj4)); // proj4 no trae «Colombia Urban» (cuadriculas urbanas): se agrega
    js.onerror = () => {
      cargando = null;
      js.remove();
      reject(new Error("No se pudo cargar proj4"));
    };
    document.head.append(js);
  });
  return cargando;
}
