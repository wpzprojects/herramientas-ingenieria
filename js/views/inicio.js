// Pantalla de bienvenida - equivalente a Pantalla_Bienvenida del original en
// Power Apps. Estatica: solo presenta 4 tiles grandes hacia las secciones
// principales de la app.

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
    desc: "Consulta técnica de conductores desnudos, semiaislados y XLPE.",
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
    title: "Varios",
    desc: "Codificación de entregables, coordenadas y conversión de unidades.",
    icon: "grid",
    hash: "#/varios",
  },
];

export function render(container) {
  container.innerHTML = `
    <h1 class="page-title">Herramientas de Ingeniería</h1>
    <p class="page-subtitle">Calculadoras, catálogos y normatividad para ingeniería de líneas y redes de distribución eléctrica.</p>
    <div class="menu-grid">
      ${TILES.map(
        (t) => `
        <a class="menu-tile" href="${t.hash}">
          <span class="tile-icon">${icon(t.icon)}</span>
          <span class="tile-title">${t.title}</span>
          <span class="tile-desc">${t.desc}</span>
        </a>`
      ).join("")}
    </div>
  `;
}
