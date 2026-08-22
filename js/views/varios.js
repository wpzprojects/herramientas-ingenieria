// Menu de la seccion "Varios": tiles hacia codificacion, coordenadas y
// unidades. Mismo patron que calculos.js / normatividad.js.

import { icon } from "../icons.js";
import { sectionMenus, sectionMeta } from "../nav.js";

export function render(container) {
  const meta = sectionMeta.varios;
  const items = sectionMenus.varios;

  container.innerHTML = `
    <h1 class="page-title">${meta.title}</h1>
    <p class="page-subtitle">${meta.subtitle}</p>
    <div class="menu-grid">
      ${items
        .map(
          (item) => `
        <a class="menu-tile" href="${item.hash}">
          <span class="tile-icon">${icon(item.icon)}</span>
          <span class="tile-title">${item.title}</span>
          <span class="tile-desc">${item.desc}</span>
        </a>`
        )
        .join("")}
    </div>
  `;
}
