// Menu de la seccion "Calculos": tiles hacia las 6 calculadoras. Este mismo
// patron (sectionMeta + sectionMenus -> .menu-grid de .menu-tile) se
// reutiliza igual en las vistas de menu de catalogos/normatividad/varios,
// por eso se mantiene deliberadamente simple y generico.

import { icon } from "../icons.js";
import { sectionMenus, sectionMeta } from "../nav.js";

export function render(container) {
  const meta = sectionMeta.calculos;
  const items = sectionMenus.calculos;

  container.innerHTML = `
    <div class="breadcrumb"><a href="#/">Inicio</a> <span>/</span> <span>${meta.title}</span></div>
    <h1 class="page-title">${meta.title}</h1>
    <p class="page-subtitle">${meta.subtitle}</p>
    <div class="menu-grid menu-grid--row">
      ${items
        .map(
          (item) => `
        <a class="menu-tile menu-tile--row" href="${item.hash}">
          <span class="tile-icon">${icon(item.icon)}</span>
          <span class="tile-body">
            <span class="tile-title">${item.title}</span>
            <span class="tile-desc">${item.desc}</span>
          </span>
        </a>`
        )
        .join("")}
    </div>
  `;
}
