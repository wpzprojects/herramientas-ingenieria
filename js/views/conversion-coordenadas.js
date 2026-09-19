// Conversion de coordenadas geograficas/proyectadas entre los 7 sistemas de
// SISTEMAS (WGS84, MAGNA-SIRGAS Bogota Oeste/Bogota/Este, Origen Unico
// Nacional, UTM 18N/19N), usando el motor convertirCoordenadas de
// ../calc/coordenadas.js.

import { icon } from "../icons.js";
import { fmt } from "../util/format.js";
import { SISTEMAS, convertirCoordenadas } from "../calc/coordenadas.js";

const COLAB_URL = "https://colab.research.google.com/drive/1a9hHzgw7JdCHuN9V1MjOQcHz_YQxaIjp";

function opcionesSistemas() {
  return SISTEMAS.map((s) => `<option value="${s.epsg}">${s.label}</option>`).join("");
}

export function render(container) {
  container.innerHTML = `
    <div class="breadcrumb"><a href="#/">Inicio</a> <span>/</span> <a href="#/varios">Varios</a> <span>/</span> <span>Conversión de coordenadas</span></div>
    <h1 class="page-title">Conversión de coordenadas</h1>

    <form class="card" id="form-coordenadas" novalidate>
      <div class="grid-2">
        <div class="field">
          <label for="f-sistema-origen">Sistema de entrada</label>
          <select id="f-sistema-origen" required>${opcionesSistemas()}</select>
        </div>
        <div class="field">
          <label for="f-sistema-destino">Sistema de salida</label>
          <select id="f-sistema-destino" required>${opcionesSistemas()}</select>
        </div>
      </div>

      <div class="grid-2">
        <div class="field">
          <label for="f-x" id="label-x">Longitud (grados, negativo = oeste)</label>
          <input type="number" id="f-x" step="any" required>
        </div>
        <div class="field">
          <label for="f-y" id="label-y">Latitud (grados)</label>
          <input type="number" id="f-y" step="any" required>
        </div>
      </div>

      <div class="btn-row">
        <button type="submit" class="btn btn-primary">Convertir</button>
      </div>
    </form>

    <div id="resultado-wrap"></div>

    <div class="btn-row">
      <a class="btn btn-ghost" href="${COLAB_URL}" target="_blank" rel="noopener">
        ${icon("externalLink")} Otros sistemas EPSG (Google Colab)
      </a>
    </div>
    <p class="text-sm text-muted">
      Requiere conexión a internet — enlace externo del autor original para sistemas de coordenadas no cubiertos aquí.
    </p>
  `;

  const form = container.querySelector("#form-coordenadas");
  const selOrigen = container.querySelector("#f-sistema-origen");
  const selDestino = container.querySelector("#f-sistema-destino");
  const labelX = container.querySelector("#label-x");
  const labelY = container.querySelector("#label-y");
  const fX = container.querySelector("#f-x");
  const fY = container.querySelector("#f-y");
  const wrap = container.querySelector("#resultado-wrap");

  // Sistema de salida por defecto distinto del de entrada, para que el
  // primer envio del formulario muestre algo mas util que "identidad".
  selDestino.selectedIndex = 1;

  function actualizarEtiquetas() {
    const sistema = SISTEMAS.find((s) => String(s.epsg) === selOrigen.value);
    if (sistema?.esGeo) {
      labelX.textContent = "Longitud (grados, negativo = oeste)";
      labelY.textContent = "Latitud (grados)";
    } else {
      labelX.textContent = "Este / X (m)";
      labelY.textContent = "Norte / Y (m)";
    }
  }

  selOrigen.addEventListener("change", actualizarEtiquetas);
  actualizarEtiquetas();

  form.addEventListener("submit", (e) => {
    e.preventDefault();
    if (!form.reportValidity()) return;

    const sistemaOrigen = SISTEMAS.find((s) => String(s.epsg) === selOrigen.value);
    const sistemaDestino = SISTEMAS.find((s) => String(s.epsg) === selDestino.value);
    const xIn = Number(fX.value);
    const yIn = Number(fY.value);

    const { xOut, yOut, esGeoDestino } = convertirCoordenadas(sistemaOrigen, sistemaDestino, xIn, yIn);

    const texto = esGeoDestino
      ? `Longitud: ${fmt(xOut, 6)}   Latitud: ${fmt(yOut, 6)}`
      : `Este: ${fmt(xOut, 4)}   Norte: ${fmt(yOut, 4)}`;

    wrap.innerHTML = `
      <div class="result-panel">
        <div class="result-metric">
          <div class="value" style="font-size: 1.4rem;">${texto}</div>
          <div class="label">${sistemaOrigen.label} → ${sistemaDestino.label}</div>
        </div>
      </div>
    `;
  });
}
