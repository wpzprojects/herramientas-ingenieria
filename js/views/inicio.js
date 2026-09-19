// Pantalla de bienvenida - equivalente a Pantalla_Bienvenida del original en
// Power Apps. Estatica: solo presenta tiles grandes hacia las secciones
// principales de la app (las 4 del original + Funciones de IA).

import { icon } from "../icons.js";

const TILES = [
  {
    title: "Cálculos",
    desc: "Ampacidad, cortocircuito, pérdidas, regulación y ocupación de ductos.",
    icon: "calculator",
    hash: "#/calculos",
  },
  {
    title: "Catálogos",
    desc: "Consulta técnica de conductores desnudos, semiaislados, XLPE y de tuberías.",
    icon: "book",
    hash: "#/catalogos",
  },
  {
    title: "Normatividad",
    desc: "RETIE, NTC 2050 y resoluciones del sector eléctrico colombiano.",
    icon: "archive",
    hash: "#/normatividad",
  },
  {
    title: "Funciones de IA",
    desc: "Análisis de escenarios con calculadoras locales y herramientas de redacción.",
    icon: "sparkles",
    hash: "#/ia",
  },
  {
    title: "Varios",
    desc: "Codificación de entregables, coordenadas y conversión de unidades.",
    icon: "grid",
    hash: "#/varios",
  },
];

export function render(container) {
  container.innerHTML = `
    <div class="menu-grid menu-grid--row">
      ${TILES.map(
        (t) => `
        <a class="menu-tile menu-tile--row" href="${t.hash}">
          <span class="tile-icon">${icon(t.icon)}</span>
          <span class="tile-body">
            <span class="tile-title">${t.title}</span>
            <span class="tile-desc">${t.desc}</span>
          </span>
        </a>`
      ).join("")}
    </div>
  `;
}
