// Conversion de unidades: cascada Categoria -> Unidad origen -> Unidad
// destino sobre data/factores-conversion.json, usando el motor generico
// convertirUnidad de ../calc/unidades.js.

import { fmt, loadData, distinct, escapeHtml } from "../util/format.js";
import { convertirUnidad } from "../calc/unidades.js";

export async function render(container) {
  const tabla = await loadData("factores-conversion");
  const categorias = distinct(tabla, "categoria");

  container.innerHTML = `
    <div class="breadcrumb"><a href="#/">Inicio</a> <span>/</span> <a href="#/varios">Varios</a> <span>/</span> <span>Conversión de unidades</span></div>
    <h1 class="page-title">Conversión de unidades</h1>

    <form class="card" id="form-conversion" novalidate>
      <div class="grid-3">
        <div class="field">
          <label for="f-categoria">Categoría</label>
          <select id="f-categoria" required>
            <option value="">Seleccione…</option>
            ${categorias.map((c) => `<option value="${escapeHtml(c)}">${escapeHtml(c)}</option>`).join("")}
          </select>
        </div>
        <div class="field">
          <label for="f-origen">Unidad origen</label>
          <select id="f-origen" required disabled>
            <option value="">Seleccione una categoría primero</option>
          </select>
        </div>
        <div class="field">
          <label for="f-destino">Unidad destino</label>
          <select id="f-destino" required disabled>
            <option value="">Seleccione una unidad origen primero</option>
          </select>
        </div>
      </div>

      <div class="field">
        <label for="f-valor">Valor a convertir</label>
        <input type="number" id="f-valor" step="any" required>
      </div>

      <div class="btn-row">
        <button type="submit" class="btn btn-primary">Convertir</button>
      </div>
    </form>

    <div id="resultado-wrap"></div>
  `;

  const form = container.querySelector("#form-conversion");
  const selCategoria = container.querySelector("#f-categoria");
  const selOrigen = container.querySelector("#f-origen");
  const selDestino = container.querySelector("#f-destino");
  const fValor = container.querySelector("#f-valor");
  const wrap = container.querySelector("#resultado-wrap");

  selCategoria.addEventListener("change", () => {
    const categoria = selCategoria.value;
    const origenes = categoria ? distinct(tabla.filter((r) => r.categoria === categoria), "unidad_origen") : [];
    selOrigen.innerHTML = origenes.length
      ? `<option value="">Seleccione…</option>` +
        origenes.map((u) => `<option value="${escapeHtml(u)}">${escapeHtml(u)}</option>`).join("")
      : `<option value="">Seleccione una categoría primero</option>`;
    selOrigen.disabled = !origenes.length;
    selDestino.innerHTML = `<option value="">Seleccione una unidad origen primero</option>`;
    selDestino.disabled = true;
    wrap.innerHTML = "";
  });

  selOrigen.addEventListener("change", () => {
    const categoria = selCategoria.value;
    const origen = selOrigen.value;
    const destinos = origen
      ? distinct(tabla.filter((r) => r.categoria === categoria && r.unidad_origen === origen), "unidad_destino")
      : [];
    selDestino.innerHTML = destinos.length
      ? `<option value="">Seleccione…</option>` +
        destinos.map((u) => `<option value="${escapeHtml(u)}">${escapeHtml(u)}</option>`).join("")
      : `<option value="">Seleccione una unidad origen primero</option>`;
    selDestino.disabled = !destinos.length;
    wrap.innerHTML = "";
  });

  selDestino.addEventListener("change", () => {
    wrap.innerHTML = "";
  });

  form.addEventListener("submit", (e) => {
    e.preventDefault();
    if (!form.reportValidity()) return;

    const categoria = selCategoria.value;
    const unidadOrigen = selOrigen.value;
    const unidadDestino = selDestino.value;
    const valor = Number(fValor.value);

    const resultado = convertirUnidad(tabla, { categoria, unidadOrigen, unidadDestino, valor });

    if (resultado === null) {
      wrap.innerHTML = `
        <div class="callout callout-danger">No existe conversión definida para esa combinación.</div>
      `;
      return;
    }

    wrap.innerHTML = `
      <div class="result-panel">
        <div class="result-metric">
          <div class="value">${fmt(resultado, 4)}<span class="unit">${unidadDestino}</span></div>
          <div class="label">${valor} ${unidadOrigen} → ${unidadDestino}</div>
        </div>
      </div>
    `;
  });
}
