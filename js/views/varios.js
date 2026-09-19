// Menu de la seccion "Varios": tiles hacia codificacion, coordenadas y
// unidades. Mismo patron que calculos.js / normatividad.js.

import { icon } from "../icons.js";
import { tileMenu } from "../util/tiles.js";
import { sectionMenus, sectionMeta } from "../nav.js";

export function render(container) {
  const meta = sectionMeta.varios;
  const items = sectionMenus.varios;

  container.innerHTML = `
    <div class="breadcrumb"><a href="#/">Inicio</a> <span>/</span> <span>${meta.title}</span></div>
    <h1 class="page-title">${meta.title}</h1>
    <div class="menu-grid menu-grid--row">
      ${items
        .map(
          (item) => tileMenu(item)
        )
        .join("")}
    </div>
  `;
}
