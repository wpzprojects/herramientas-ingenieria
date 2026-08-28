// Catalogo filtrable de codigos de entregables (planos, informes, etc).
// data/codificacion.json: { id, codigo, entregable, especialidad }.

import { loadData, distinct, debounce, escapeHtml } from "../util/format.js";

export async function render(container) {
  const rows = await loadData("codificacion");
  const especialidades = distinct(rows, "especialidad");

  container.innerHTML = `
    <div class="breadcrumb"><a href="#/">Inicio</a> <span>/</span> <a href="#/varios">Varios</a> <span>/</span> <span>Codificación de entregables</span></div>
    <h1 class="page-title">Codificación de entregables</h1>
    <p class="page-subtitle">Catálogo consultable de códigos estándar de documentos y planos por especialidad.</p>

    <div class="toolbar">
      <div class="field search">
        <label for="f-buscar">Buscar</label>
        <input type="search" id="f-buscar" placeholder="Buscar por código o entregable…">
      </div>
      <div class="field">
        <label for="f-especialidad">Especialidad</label>
        <select id="f-especialidad">
          <option value="">Todas las categorías</option>
          ${especialidades.map((e) => `<option value="${escapeHtml(e)}">${escapeHtml(e)}</option>`).join("")}
        </select>
      </div>
      <div class="field">
        <label>&nbsp;</label>
        <button type="button" class="btn btn-ghost" id="btn-orden">
          <span id="btn-orden-icon" aria-hidden="true">↑</span>
          <span id="btn-orden-texto">Código A→Z</span>
        </button>
      </div>
    </div>

    <p class="row-count" id="row-count"></p>
    <div class="table-wrap">
      <table>
        <thead>
          <tr>
            <th>Código</th>
            <th class="wrap">Entregable</th>
            <th>Especialidad</th>
          </tr>
        </thead>
        <tbody id="tbody-codificacion"></tbody>
      </table>
    </div>
  `;

  const fBuscar = container.querySelector("#f-buscar");
  const fEspecialidad = container.querySelector("#f-especialidad");
  const btnOrden = container.querySelector("#btn-orden");
  const btnOrdenTexto = container.querySelector("#btn-orden-texto");
  const btnOrdenIcon = container.querySelector("#btn-orden-icon");
  const tbody = container.querySelector("#tbody-codificacion");
  const rowCount = container.querySelector("#row-count");

  let ordenAsc = true;

  function aplicarFiltros() {
    const texto = fBuscar.value.trim().toLowerCase();
    const especialidad = fEspecialidad.value;

    let filtradas = rows.filter((r) => {
      if (especialidad && r.especialidad !== especialidad) return false;
      if (!texto) return true;
      return String(r.codigo).toLowerCase().includes(texto) || String(r.entregable).toLowerCase().includes(texto);
    });

    filtradas = filtradas.slice().sort((a, b) => {
      const cmp = String(a.codigo).localeCompare(String(b.codigo), "es", { numeric: true });
      return ordenAsc ? cmp : -cmp;
    });

    rowCount.textContent = `${filtradas.length} código(s)`;
    tbody.innerHTML = filtradas
      .map(
        (r) => `
      <tr>
        <td class="mono">${r.codigo}</td>
        <td class="wrap">${r.entregable}</td>
        <td>${r.especialidad}</td>
      </tr>`
      )
      .join("");
  }

  fBuscar.addEventListener("input", debounce(aplicarFiltros, 200));
  fEspecialidad.addEventListener("change", aplicarFiltros);
  btnOrden.addEventListener("click", () => {
    ordenAsc = !ordenAsc;
    btnOrdenTexto.textContent = ordenAsc ? "Código A→Z" : "Código Z→A";
    btnOrdenIcon.textContent = ordenAsc ? "↑" : "↓";
    aplicarFiltros();
  });

  aplicarFiltros();
}
