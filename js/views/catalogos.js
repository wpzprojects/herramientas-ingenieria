// Menu de la seccion "Catalogos": 4 tiles que llevan a cada familia de
// conductores (desnudos / semiaislados / XLPE) y al catalogo de tuberias, igual patron que las demas
// pantallas de menu principal (ver sectionMenus/sectionMeta en nav.js).

import { icon } from "../icons.js";
import { el } from "../util/format.js";
import { estadoAcceso } from "../auth/acceso.js";
import { itemHabilitado, TEXTO_BLOQUEADO } from "../auth/permisos.js";
import { sectionMenus, sectionMeta } from "../nav.js";

export async function render(container, params) {
  const meta = sectionMeta.catalogos;
  const items = sectionMenus.catalogos;

  container.append(
    el("nav", { class: "breadcrumb" }, [el("a", { href: "#/" }, "Inicio"), el("span", {}, "/"), el("span", {}, meta.title)]),
    el("h1", { class: "page-title" }, meta.title)
  );

  const grid = el("div", { class: "menu-grid menu-grid--row" });
  items.forEach((item) => {
    const habilitado = itemHabilitado(item, estadoAcceso().nivel);
    grid.append(
      el(habilitado ? "a" : "div", habilitado ? { class: "menu-tile menu-tile--row", href: item.hash } : { class: "menu-tile menu-tile--row menu-tile--bloqueado", "aria-disabled": "true", title: TEXTO_BLOQUEADO }, [
        el("span", { class: "tile-icon", html: icon(item.icon) }),
        el("span", { class: "tile-body" }, [
          el("span", { class: "tile-title" }, item.title),
          el("span", { class: "tile-desc" }, item.desc),
        ]),
      ])
    );
  });
  container.append(grid);
}
