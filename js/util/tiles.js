// Tarjeta (.menu-tile) de un menu de seccion, segun el nivel de acceso: enlace normal si el modulo esta habilitado y, si no,
// la misma tarjeta sin enlace (con una ayuda al pasar el cursor). Ver js/auth/permisos.js.

import { icon } from "../icons.js";
import { estadoAcceso } from "../auth/acceso.js";
import { itemHabilitado, TEXTO_BLOQUEADO } from "../auth/permisos.js";

export function tileMenu(item) {
  const cuerpo = `
          <span class="tile-icon">${icon(item.icon)}</span>
          <span class="tile-body">
            <span class="tile-title">${item.title}</span>
            <span class="tile-desc">${item.desc}</span>
          </span>`;
  return itemHabilitado(item, estadoAcceso().nivel)
    ? `
        <a class="menu-tile menu-tile--row" href="${item.hash}">${cuerpo}
        </a>`
    : `
        <div class="menu-tile menu-tile--row menu-tile--bloqueado" aria-disabled="true" title="${TEXTO_BLOQUEADO}">${cuerpo}
          <span class="tile-candado">${icon("lock")}</span>
        </div>`;
}
