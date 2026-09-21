// Menu de la seccion "Funciones con IA". Mismo patron que varios.js.

import { icon } from "../icons.js";
import { tileMenu } from "../util/tiles.js";
import { sectionMenus, sectionMeta } from "../nav.js";

export function render(container) {
  const meta = sectionMeta.ia;
  const items = sectionMenus.ia;

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
