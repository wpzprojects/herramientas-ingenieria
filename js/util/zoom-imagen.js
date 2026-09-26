// Zoom de imágenes normativas (2026-09-26, pedido del usuario): botones «−» y «+» arriba de la imagen, a la derecha,
// con el porcentaje en medio. Arranca al 80 % del ancho de su recuadro y va de 40 % a 300 %; el recuadro crece con la
// altura de la imagen y solo se desplaza a lo ancho. Lo usan la Biblioteca técnica, Distancias de seguridad y Corriente
// de conductores NTC (en esta, el encabezado fijo y el cuerpo crecen juntos).

import { icon } from "../icons.js";

export const ZOOMS = [40, 60, 80, 100, 125, 150, 200, 250, 300];
export const ZOOM_INICIAL = 80;

/** Controles «−» / % / «+» (el grupo lleva `data-zoom` con el valor actual). */
export function zoomHtml(nombre = "la imagen") {
  return `
    <div class="zoom-imagen" role="group" aria-label="Zoom de ${nombre}" data-zoom="${ZOOM_INICIAL}">
      <button type="button" class="btn btn-sm btn-ghost btn-icono" data-zoom-paso="-1" aria-label="Alejar">${icon("minus")}</button>
      <span class="zoom-imagen-valor" aria-live="polite">${ZOOM_INICIAL} %</span>
      <button type="button" class="btn btn-sm btn-ghost btn-icono" data-zoom-paso="1" aria-label="Acercar">${icon("plus")}</button>
    </div>`;
}

/**
 * Atiende los clics de los controles de zoom dentro de `raiz` (delegado). `aplicar(grupo, z)` cambia el tamaño de la
 * imagen que corresponde a ese grupo de controles.
 */
export function activarZoom(raiz, aplicar) {
  raiz.addEventListener("click", (e) => {
    const b = e.target.closest("[data-zoom-paso]");
    const grupo = b?.closest(".zoom-imagen");
    if (!grupo || !raiz.contains(grupo)) return;
    const i = Math.max(0, Math.min(ZOOMS.length - 1, ZOOMS.indexOf(Number(grupo.dataset.zoom)) + Number(b.dataset.zoomPaso)));
    const z = ZOOMS[i];
    grupo.dataset.zoom = String(z);
    grupo.querySelector(".zoom-imagen-valor").textContent = `${z} %`;
    grupo.querySelector('[data-zoom-paso="-1"]').disabled = i === 0;
    grupo.querySelector('[data-zoom-paso="1"]').disabled = i === ZOOMS.length - 1;
    aplicar(grupo, z);
  });
}

/** Zoom actual de un grupo de controles. */
export const zoomDe = (grupo) => Number(grupo?.dataset.zoom) || ZOOM_INICIAL;
