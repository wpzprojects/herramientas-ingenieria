// Ficha de detalle de una resolucion individual.
// data/resoluciones.json: { id, resolucion, fecha (año), objeto, resumen }.
// El id en la ruta llega como string; el id en el JSON es numerico.

import { loadData, escapeHtml } from "../util/format.js";
import { esAdministrador, esquemaDe, reemplazarRegistro, quitarRegistro, guardarCatalogo, abrirEditor, botonesAdmin } from "../util/edicion-catalogo.js";

// Campos del formulario de edición (también lo usa «Agregar» en resoluciones.js).
export const CAMPOS_RESOLUCION = [
  { key: "resolucion", label: "Resolución" },
  { key: "fecha", label: "Año", entero: true },
  { key: "objeto", label: "Objeto", largo: true },
  { key: "resumen", label: "Resumen", largo: true },
];

export async function render(container, { id }) {
  const rows = await loadData("resoluciones");
  const row = rows.find((r) => String(r.id) === id);

  if (!row) {
    container.innerHTML = `
      <div class="breadcrumb"><a href="#/">Inicio</a> <span>/</span> <a href="#/normatividad">Normatividad</a> <span>/</span> <a href="#/normatividad/resoluciones">Resoluciones</a></div>
      <div class="empty-state">
        <h2>Resolución no encontrada</h2>
        <p class="text-muted">No existe una resolución con id <code>${escapeHtml(id)}</code>.</p>
        <p><a class="btn btn-primary" href="#/normatividad/resoluciones">Volver a Resoluciones</a></p>
      </div>
    `;
    return;
  }

  container.innerHTML = `
    <div class="breadcrumb">
      <a href="#/">Inicio</a> <span>/</span>
      <a href="#/normatividad">Normatividad</a> <span>/</span>
      <a href="#/normatividad/resoluciones">Resoluciones</a> <span>/</span>
      <span>${escapeHtml(row.resolucion)}</span>
    </div>
    <h1 class="page-title">${escapeHtml(row.resolucion)}</h1>
    <p class="page-subtitle">${escapeHtml(row.objeto)}</p>

    <div id="res-zona">
    <div class="detail-grid">
      <div class="detail-item">
        <span class="k">Resolución</span>
        <span class="v">${escapeHtml(row.resolucion)}</span>
      </div>
      <div class="detail-item">
        <span class="k">Año</span>
        <span class="v">${escapeHtml(row.fecha)}</span>
      </div>
    </div>

    <div class="card">
      <h3 class="section-title" style="margin-top:0">Resumen</h3>
      <div style="white-space: pre-wrap; line-height: 1.6;">${escapeHtml(row.resumen)}</div>
    </div>

    <div class="btn-row">
      <a class="btn btn-ghost" href="#/normatividad/resoluciones">← Volver a Resoluciones</a>
    </div>
    </div>
  `;

  // Administrador: Editar / Eliminar (se publican de inmediato; ver js/util/edicion-catalogo.js)
  if (!esAdministrador()) return;
  const zona = container.querySelector("#res-zona");
  const volver = () => render(container, { id });
  zona.prepend(
    botonesAdmin([
      {
        accion: "editar",
        icono: "pencil",
        texto: "Editar",
        alHacer: () =>
          abrirEditor(zona, {
            titulo: `Editar ${row.resolucion}`,
            esquema: esquemaDe(rows, CAMPOS_RESOLUCION),
            valores: row,
            textoConfirmar: `¿Guardar los cambios de «${row.resolucion}»? Se publican de inmediato para todos los usuarios.`,
            alCancelar: volver,
            alGuardar: async (registro) => {
              await guardarCatalogo("resoluciones", reemplazarRegistro(rows, row.id, registro), `Editó «${row.resolucion}»`);
              await volver();
            },
          }),
      },
      {
        accion: "eliminar",
        icono: "trash",
        texto: "Eliminar",
        alHacer: async () => {
          if (!confirm(`¿Eliminar «${row.resolucion}»? Se publica de inmediato para todos; si fue un error, se recupera desde el historial en Perfil > Catálogos.`)) return;
          try {
            await guardarCatalogo("resoluciones", quitarRegistro(rows, row.id), `Eliminó «${row.resolucion}»`);
            location.hash = "#/normatividad/resoluciones";
          } catch (err) {
            zona.insertAdjacentHTML("afterbegin", `<div class="callout callout-danger"><span>No se pudo eliminar: ${escapeHtml(err?.message || String(err))}</span></div>`);
          }
        },
      },
    ])
  );
}
