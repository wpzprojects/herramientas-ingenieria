// Catalogo filtrable de resoluciones del sector electrico (CREG y afines).
// data/resoluciones.json: { id, resolucion, fecha (año), objeto, resumen }.

import { fmt, loadData, distinct, debounce } from "../util/format.js";

export async function render(container) {
  const rows = await loadData("resoluciones");
  const anios = distinct(rows, "fecha");

  container.innerHTML = `
    <div class="breadcrumb"><a href="#/">Inicio</a> <span>/</span> <a href="#/normatividad">Normatividad</a> <span>/</span> <span>Resoluciones</span></div>
    <h1 class="page-title">Resoluciones del sector</h1>

    <div class="toolbar">
      <div class="field search">
        <label for="f-buscar">Buscar</label>
        <input type="search" id="f-buscar" placeholder="Buscar por resolución, objeto o resumen…">
      </div>
      <div class="field">
        <label for="f-anio">Año</label>
        <select id="f-anio">
          <option value="">Todos</option>
          ${anios.map((a) => `<option value="${a}">${a}</option>`).join("")}
        </select>
      </div>
    </div>

    <p class="row-count" id="row-count"></p>
    <div class="table-wrap">
      <table>
        <thead>
          <tr>
            <th>Resolución</th>
            <th>Año</th>
            <th class="wrap">Objetivo</th>
          </tr>
        </thead>
        <tbody id="tbody-resoluciones"></tbody>
      </table>
    </div>
  `;

  const fBuscar = container.querySelector("#f-buscar");
  const fAnio = container.querySelector("#f-anio");
  const tbody = container.querySelector("#tbody-resoluciones");
  const rowCount = container.querySelector("#row-count");

  function aplicarFiltros() {
    const texto = fBuscar.value.trim().toLowerCase();
    const anio = fAnio.value;

    const filtradas = rows.filter((r) => {
      if (anio && String(r.fecha) !== anio) return false;
      if (!texto) return true;
      return (
        String(r.resolucion).toLowerCase().includes(texto) ||
        String(r.objeto).toLowerCase().includes(texto) ||
        String(r.resumen).toLowerCase().includes(texto)
      );
    });

    rowCount.textContent = `${filtradas.length} resolución(es)`;
    tbody.innerHTML = filtradas
      .map(
        (r) => `
      <tr class="clickable" data-id="${r.id}">
        <td>${r.resolucion}</td>
        <td>${r.fecha}</td>
        <td class="wrap">${r.objeto}</td>
      </tr>`
      )
      .join("");

    tbody.querySelectorAll("tr.clickable").forEach((tr) => {
      tr.addEventListener("click", () => {
        location.hash = `#/normatividad/resoluciones/${tr.dataset.id}`;
      });
    });
  }

  fBuscar.addEventListener("input", debounce(aplicarFiltros, 200));
  fAnio.addEventListener("change", aplicarFiltros);

  aplicarFiltros();
}
