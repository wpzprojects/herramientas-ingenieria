// Pantalla de ayuda/documentacion de la app: estatica, sin datos externos.
// Genera la lista de herramientas de cada seccion a partir de sectionMenus
// para que quede siempre sincronizada con la navegacion real.

import { sectionMenus, sectionMeta } from "../nav.js";

const SECCIONES = ["calculos", "catalogos", "normatividad", "varios"];

export function render(container) {
  container.innerHTML = `
    <h1 class="page-title">Ayuda</h1>
    <p class="page-subtitle">Cómo usar Herramientas de Ingeniería.</p>

    <div class="callout callout-info">
      Esta aplicación funciona 100% offline una vez cargada por primera vez: es instalable como
      PWA y todos los catálogos, tablas normativas y datos de cálculo viven embebidos en la app,
      sin necesitar conexión a internet (con la única excepción del enlace externo opcional de
      Google Colab en la herramienta de conversión de coordenadas).
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
  `;
}
