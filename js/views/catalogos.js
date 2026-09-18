// Menu de la seccion "Catalogos": 3 tiles que llevan a cada familia de
// conductores (desnudos / semiaislados / XLPE), igual patron que las demas
// pantallas de menu principal (ver sectionMenus/sectionMeta en nav.js).

import { icon } from "../icons.js";
import { el } from "../util/format.js";
import { sectionMenus, sectionMeta } from "../nav.js";

export async function render(container, params) {
  const meta = sectionMeta.catalogos;
  const items = sectionMenus.catalogos;

  container.append(
    el("nav", { class: "breadcrumb" }, [el("a", { href: "#/" }, "Inicio"), el("span", {}, "/"), el("span", {}, meta.title)]),
    el("h1", { class: "page-title" }, meta.title),
    el("p", { class: "page-subtitle" }, meta.subtitle)
  );

  const grid = el("div", { class: "menu-grid menu-grid--row" });
  items.forEach((item) => {
    grid.append(
      el("a", { class: "menu-tile menu-tile--row", href: item.hash }, [
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
