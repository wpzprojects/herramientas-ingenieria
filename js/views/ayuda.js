// Pantalla de ayuda/documentacion de la app: estatica, sin datos externos.
// Genera la lista de herramientas de cada seccion a partir de sectionMenus
// para que quede siempre sincronizada con la navegacion real.

import { sectionMenus, sectionMeta } from "../nav.js";

const SECCIONES = ["calculos", "catalogos", "normatividad", "varios"];
const APP_VERSION = "1.0.0";

export function render(container) {
  container.innerHTML = `
    <h1 class="page-title">Ayuda</h1>
    <p class="page-subtitle">Cómo usar Herramientas de Ingeniería.</p>

    <div class="callout callout-info">
      Esta aplicación funciona 100% offline una vez cargada por primera vez: es instalable como
      PWA y todos los catálogos, tablas normativas y datos de cálculo viven embebidos en la app,
      sin necesitar conexión a internet.
    </div>

    ${SECCIONES.map((key) => {
      const meta = sectionMeta[key];
      const items = sectionMenus[key];
      return `
        <div class="card">
          <h2 class="section-title" style="margin-top:0">${meta.title}</h2>
          <p class="text-muted">${meta.subtitle}</p>
          <ul>
            ${items
              .map(
                (item) => `
              <li>
                <a href="${item.hash}"><strong>${item.title}</strong></a> — ${item.desc}
              </li>`
              )
              .join("")}
          </ul>
        </div>`;
    }).join("")}

    <div class="card dev-card">
      <div class="dev-header">
        <span class="dev-avatar">WP</span>
        <div>
          <p class="dev-name">Wilsson Uriel Perez Valero</p>
          <p class="dev-role">Herramientas de Ingeniería</p>
        </div>
      </div>
      <div class="dev-contact">
        <a href="mailto:wperez.net@hotmail.com">wperez.net@hotmail.com</a>
        <a href="tel:+573104762477">+57 310 476 2477</a>
      </div>
      <p class="dev-footer">Colombia · 2026 · v${APP_VERSION}</p>
    </div>
  `;
}
