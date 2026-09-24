// Catalogo filtrable de resoluciones del sector electrico (CREG y afines).
// data/resoluciones.json: { id, resolucion, fecha (año), objeto, resumen }.

import { loadData, distinct, debounce, escapeHtml } from "../util/format.js";
import { CAMPOS_RESOLUCION } from "./detalle-resolucion.js";
import { esAdministrador, esquemaDe, agregarRegistro, guardarCatalogo, abrirEditor, botonesAdmin } from "../util/edicion-catalogo.js";

export async function render(container) {
  const rows = await loadData("resoluciones");
  const anios = distinct(rows, "fecha");

  container.innerHTML = `
    <div class="breadcrumb"><a href="#/">Inicio</a> <span>/</span> <a href="#/normatividad">Normatividad</a> <span>/</span> <span>Resoluciones</span></div>
    <h1 class="page-title">Resoluciones del sector</h1>

    <div id="res-lista">
    <div class="toolbar">
      <div class="field search">
        <label for="f-buscar">Buscar</label>
        <input type="search" id="f-buscar" placeholder="Buscar por resolución, objeto o resumen…">
      </div>
      <div class="field">
        <label for="f-anio">Año</label>
        <select id="f-anio">
          <option value="">Todos</option>
          ${anios.map((a) => `<option value="${escapeHtml(a)}">${escapeHtml(a)}</option>`).join("")}
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
    </div>
    <div id="res-editor"></div>
  `;

  // Administrador: «Agregar registro» (se publica de inmediato; ver js/util/edicion-catalogo.js)
  if (esAdministrador()) {
    const lista = container.querySelector("#res-lista");
    const editor = container.querySelector("#res-editor");
    lista.before(
      botonesAdmin([
        {
          accion: "agregar",
          icono: "plus",
          texto: "Agregar registro",
          clase: "btn-primary",
          alHacer: (e) => {
            const acciones = e.currentTarget.parentElement;
            lista.hidden = acciones.hidden = true;
            abrirEditor(editor, {
              titulo: "Agregar resolución",
              esquema: esquemaDe(rows, CAMPOS_RESOLUCION),
              textoConfirmar: "¿Agregar esta resolución? Se publica de inmediato para todos los usuarios.",
              alCancelar: () => {
                editor.innerHTML = "";
                lista.hidden = acciones.hidden = false;
              },
              alGuardar: async (registro) => {
                const { filas, id } = agregarRegistro(rows, registro);
                await guardarCatalogo("resoluciones", filas, `Agregó «${registro.resolucion}»`);
                location.hash = `#/normatividad/resoluciones/${id}`;
              },
            });
          },
        },
      ])
    );
  }

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
      <tr class="clickable" data-id="${escapeHtml(r.id)}">
        <td>${escapeHtml(r.resolucion)}</td>
        <td>${escapeHtml(r.fecha)}</td>
        <td class="wrap">${escapeHtml(r.objeto)}</td>
      </tr>`
      )
      .join("");

    tbody.querySelectorAll("tr.clickable").forEach((tr) => {
      tr.addEventListener("click", () => {
        location.hash = `#/normatividad/resoluciones/${encodeURIComponent(tr.dataset.id)}`;
      });
    });
  }

  fBuscar.addEventListener("input", debounce(aplicarFiltros, 200));
  fAnio.addEventListener("change", aplicarFiltros);

  aplicarFiltros();
}
