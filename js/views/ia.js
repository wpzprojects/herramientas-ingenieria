// Menu de la seccion "Inteligencia artificial". Mismo patron que varios.js.

import { icon } from "../icons.js";
import { sectionMenus, sectionMeta } from "../nav.js";

export function render(container) {
  const meta = sectionMeta.ia;
  const items = sectionMenus.ia;

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
    <div class="callout callout-info" style="margin-top: var(--space-5);">
      <span>Esta sección necesita conexión a internet y una clave gratuita de Google Gemini. El resto de la aplicación sigue funcionando sin conexión.</span>
    </div>
  `;
}
