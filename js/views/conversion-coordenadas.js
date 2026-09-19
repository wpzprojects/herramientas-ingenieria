// Conversion de coordenadas geograficas/proyectadas entre los 7 sistemas de
// SISTEMAS (WGS84, MAGNA-SIRGAS Bogota Oeste/Bogota/Este, Origen Unico
// Nacional, UTM 18N/19N), usando el motor convertirCoordenadas de
// ../calc/coordenadas.js. Debajo, el boton «Otros sistemas de coordenadas» despliega un panel para convertir entre cualquier par de
// unos 500 codigos EPSG (los de Colombia y los mas usados en el mundo) con proj4js (../calc/coordenadas-epsg.js); reemplaza al
// enlace al cuaderno de Google Colab que habia antes.

import { icon } from "../icons.js";
import { fmt, loadData, escapeHtml } from "../util/format.js";
import { SISTEMAS, convertirCoordenadas } from "../calc/coordenadas.js";
import { cargarProj4 } from "../util/proj4.js";
import { parseCodigoEpsg, infoSistema, convertirEntreSistemas } from "../calc/coordenadas-epsg.js";

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
      <button type="button" class="btn btn-ghost" id="btn-otros-sistemas" aria-expanded="false" aria-controls="panel-epsg">
        ${icon("map")} Otros sistemas de coordenadas
      </button>
    </div>

    <div id="panel-epsg" hidden>
      <form class="card" id="form-epsg" novalidate>
        <p class="text-sm text-muted" style="margin-top: 0;">
          Escriba el código EPSG de cada sistema (por ejemplo 4326 = WGS84, 3116 = MAGNA-SIRGAS Bogotá, 9377 = Origen Nacional).
          Hay unos 500 sistemas incluidos —los de Colombia y los más usados en el mundo— y funciona sin conexión a internet.
        </p>
        <div class="grid-2">
          <div class="field">
            <label for="f-epsg-origen">EPSG de entrada</label>
            <input type="text" id="f-epsg-origen" inputmode="numeric" autocomplete="off" list="lista-epsg" value="4326" required>
            <span class="hint" id="nombre-epsg-origen"></span>
          </div>
          <div class="field">
            <label for="f-epsg-destino">EPSG de salida</label>
            <input type="text" id="f-epsg-destino" inputmode="numeric" autocomplete="off" list="lista-epsg" value="3116" required>
            <span class="hint" id="nombre-epsg-destino"></span>
          </div>
        </div>
        <datalist id="lista-epsg"></datalist>

        <div class="grid-2">
          <div class="field">
            <label for="f-epsg-x" id="label-epsg-x">Longitud (grados, negativo = oeste)</label>
            <input type="number" id="f-epsg-x" step="any" required>
          </div>
          <div class="field">
            <label for="f-epsg-y" id="label-epsg-y">Latitud (grados)</label>
            <input type="number" id="f-epsg-y" step="any" required>
          </div>
        </div>

        <div class="btn-row">
          <button type="submit" class="btn btn-primary">Convertir</button>
        </div>
      </form>
      <div id="resultado-epsg"></div>
    </div>
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
      <div class="result-panel" style="margin-top: var(--space-4);">
        <div class="result-metric">
          <div class="value" style="font-size: 1.4rem;">${texto}</div>
          <div class="label">${sistemaOrigen.label} → ${sistemaDestino.label}</div>
        </div>
      </div>
    `;
  });

  // ---------- Otros sistemas de coordenadas (EPSG) ----------
  const btnOtros = container.querySelector("#btn-otros-sistemas");
  const panelEpsg = container.querySelector("#panel-epsg");
  const formEpsg = container.querySelector("#form-epsg");
  const fEpsgOrigen = container.querySelector("#f-epsg-origen");
  const fEpsgDestino = container.querySelector("#f-epsg-destino");
  const nombreOrigen = container.querySelector("#nombre-epsg-origen");
  const nombreDestino = container.querySelector("#nombre-epsg-destino");
  const fEpsgX = container.querySelector("#f-epsg-x");
  const fEpsgY = container.querySelector("#f-epsg-y");
  const labelEpsgX = container.querySelector("#label-epsg-x");
  const labelEpsgY = container.querySelector("#label-epsg-y");
  const wrapEpsg = container.querySelector("#resultado-epsg");

  let proj4 = null;
  let catalogo = null;
  let cargaEnCurso = null;

  /** Descarga (una sola vez) la libreria y el catalogo de codigos; despues funciona sin internet (service worker). */
  function cargarHerramientas() {
    if (proj4 && catalogo) return Promise.resolve();
    cargaEnCurso ??= Promise.all([cargarProj4(), loadData("sistemas-epsg")])
      .then(([p, c]) => {
        proj4 = p;
        catalogo = c;
        container.querySelector("#lista-epsg").innerHTML = Object.entries(c)
          .map(([codigo, e]) => `<option value="${codigo}" label="${escapeHtml(e[0])}"></option>`)
          .join("");
      })
      .catch((err) => {
        cargaEnCurso = null;
        throw err;
      });
    return cargaEnCurso;
  }

  /** Nombre del sistema bajo el campo (o el error si el codigo no esta) y etiquetas de las coordenadas segun el de entrada. */
  function actualizarSistemas() {
    if (!catalogo) return;
    const describir = (campo, hint) => {
      const texto = campo.value.trim();
      hint.classList.remove("hint-error");
      if (!texto) {
        hint.textContent = "";
        return null;
      }
      const codigo = parseCodigoEpsg(texto);
      const s = codigo ? infoSistema(codigo, catalogo) : null;
      if (!s) {
        hint.textContent = codigo ? `El código ${codigo} no está entre los sistemas incluidos.` : "Escriba solo el número del código EPSG (por ejemplo 3116).";
        hint.classList.add("hint-error");
        return null;
      }
      hint.textContent = `${s.nombre} · ${s.unidad}`;
      return s;
    };
    const origen = describir(fEpsgOrigen, nombreOrigen);
    describir(fEpsgDestino, nombreDestino);
    if (origen && !origen.esGeo) {
      labelEpsgX.textContent = `Este / X (${origen.unidad})`;
      labelEpsgY.textContent = `Norte / Y (${origen.unidad})`;
    } else {
      labelEpsgX.textContent = "Longitud (grados, negativo = oeste)";
      labelEpsgY.textContent = "Latitud (grados)";
    }
  }

  btnOtros.addEventListener("click", async () => {
    const abrir = panelEpsg.hidden;
    panelEpsg.hidden = !abrir;
    btnOtros.setAttribute("aria-expanded", String(abrir));
    if (!abrir) return;
    try {
      await cargarHerramientas();
      actualizarSistemas();
    } catch {
      wrapEpsg.innerHTML = `<div class="callout callout-danger">No se pudo cargar la herramienta de conversión. Cierre y abra la aplicación e intente de nuevo.</div>`;
    }
  });

  fEpsgOrigen.addEventListener("input", actualizarSistemas);
  fEpsgDestino.addEventListener("input", actualizarSistemas);

  formEpsg.addEventListener("submit", async (e) => {
    e.preventDefault();
    try {
      await cargarHerramientas();
    } catch {
      wrapEpsg.innerHTML = `<div class="callout callout-danger">No se pudo cargar la herramienta de conversión.</div>`;
      return;
    }
    actualizarSistemas();
    const codOrigen = parseCodigoEpsg(fEpsgOrigen.value);
    const codDestino = parseCodigoEpsg(fEpsgDestino.value);
    if (!codOrigen || !codDestino) {
      wrapEpsg.innerHTML = `<div class="callout callout-danger" style="margin-top: var(--space-4);">Escriba el código EPSG de entrada y el de salida (solo el número, por ejemplo 3116).</div>`;
      return;
    }
    if (!formEpsg.reportValidity()) return;
    try {
      const r = convertirEntreSistemas(proj4, catalogo, codOrigen, codDestino, Number(fEpsgX.value), Number(fEpsgY.value));
      const texto = r.esGeoDestino
        ? `Longitud: ${fmt(r.x, 6)}   Latitud: ${fmt(r.y, 6)}`
        : `Este: ${fmt(r.x, 4)}   Norte: ${fmt(r.y, 4)}`;
      const unidad = r.esGeoDestino ? "" : ` (${r.destino.unidad})`;
      wrapEpsg.innerHTML = `
        <div class="result-panel" style="margin-top: var(--space-4);">
          <div class="result-metric">
            <div class="value" style="font-size: 1.4rem;">${texto}</div>
            <div class="label">${escapeHtml(`${r.origen.codigo} · ${r.origen.nombre}`)} → ${escapeHtml(`${r.destino.codigo} · ${r.destino.nombre}`)}${unidad}</div>
          </div>
        </div>
        ${r.avisos.map((a) => `<div class="callout callout-warning" style="margin-top: var(--space-3);">${escapeHtml(a.texto)}</div>`).join("")}
      `;
    } catch (err) {
      wrapEpsg.innerHTML = `<div class="callout callout-danger" style="margin-top: var(--space-4);">${escapeHtml(err.message)}</div>`;
    }
  });
}
