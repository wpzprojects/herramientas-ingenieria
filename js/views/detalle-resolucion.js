// Ficha de detalle de una resolucion individual.
// data/resoluciones.json: { id, resolucion, fecha (año), objeto, resumen }.
// El id en la ruta llega como string; el id en el JSON es numerico.

import { loadData } from "../util/format.js";

export async function render(container, { id }) {
  const rows = await loadData("resoluciones");
  const row = rows.find((r) => String(r.id) === id);

  if (!row) {
    container.innerHTML = `
      <div class="breadcrumb"><a href="#/normatividad/resoluciones">Resoluciones</a></div>
      <div class="empty-state">
        <h2>Resolución no encontrada</h2>
        <p class="text-muted">No existe una resolución con id <code>${id}</code>.</p>
        <p><a class="btn btn-primary" href="#/normatividad/resoluciones">Volver a Resoluciones</a></p>
      </div>
    `;
    return;
  }

  container.innerHTML = `
    <div class="breadcrumb">
      <a href="#/normatividad">Normatividad</a> <span>/</span>
      <a href="#/normatividad/resoluciones">Resoluciones</a> <span>/</span>
      <span>${row.resolucion}</span>
    </div>
    <h1 class="page-title">${row.resolucion}</h1>
    <p class="page-subtitle">${row.objeto}</p>

    <div class="detail-grid">
      <div class="detail-item">
        <span class="k">Resolución</span>
        <span class="v">${row.resolucion}</span>
      </div>
      <div class="detail-item">
        <span class="k">Año</span>
        <span class="v">${row.fecha}</span>
      </div>
    </div>

    <div class="card">
      <h3 class="section-title" style="margin-top:0">Resumen</h3>
      <div style="white-space: pre-wrap; line-height: 1.6;">${row.resumen}</div>
    </div>

    <div class="btn-row">
      <a class="btn btn-ghost" href="#/normatividad/resoluciones">← Volver a Resoluciones</a>
    </div>
  `;
}
