// Menu de la seccion "Normatividad": tiles hacia las 4 pantallas de tablas
// normativas + el catalogo de resoluciones. Mismo patron que calculos.js.

import { icon } from "../icons.js";
import { sectionMenus, sectionMeta } from "../nav.js";

export function render(container) {
  const meta = sectionMeta.normatividad;
  const items = sectionMenus.normatividad;

  container.innerHTML = `
    <div class="breadcrumb"><a href="#/">Inicio</a> <span>/</span> <span>${meta.title}</span></div>
    <h1 class="page-title">${meta.title}</h1>
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
