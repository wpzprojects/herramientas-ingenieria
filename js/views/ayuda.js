// Pantalla de ayuda/documentacion de la app: estatica, sin datos externos.
// Genera la lista de herramientas de cada seccion a partir de sectionMenus
// para que quede siempre sincronizada con la navegacion real.

import { sectionMenus, sectionMeta } from "../nav.js";
import { estadoAcceso } from "../auth/acceso.js";
import { itemHabilitado, TEXTO_BLOQUEADO } from "../auth/permisos.js";

const SECCIONES = ["calculos", "catalogos", "normatividad", "ia", "varios"];
const APP_VERSION = "1.0.0";

export function render(container) {
  const nivel = estadoAcceso().nivel;
  container.innerHTML = `
    <div class="breadcrumb"><a href="#/">Inicio</a> <span>/</span> <span>Ayuda</span></div>
    <h1 class="page-title">Ayuda</h1>

    ${SECCIONES.map((key) => {
      const meta = sectionMeta[key];
      const items = sectionMenus[key];
      return `
        <div class="card">
          <h2 class="section-title" style="margin-top:0">${meta.title}</h2>
          <p class="text-muted ayuda-intro">${meta.subtitle}</p>
          <ul class="ayuda-lista">
            ${items
              .map(
                (item) => `
              <li>
                ${
                  itemHabilitado(item, nivel)
                    ? `<a href="${item.hash}"><strong>${item.title}</strong></a>`
                    : `<span class="enlace-bloqueado" title="${TEXTO_BLOQUEADO}"><strong>${item.title}</strong></span>`
                }<span class="ayuda-desc"> — ${item.desc}</span>
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
