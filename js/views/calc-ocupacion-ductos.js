// Calculadora de porcentaje de ocupacion de un ducto (NTC-2050 Cap. 9, Tabla 1).

import { fmt, fmtPercent, loadData, distinct, escapeHtml } from "../util/format.js";
import { calcularOcupacionDuctos, getLimiteOcupacion } from "../calc/ocupacion-ductos.js";

const FORMULAS_HTML = `%Ocup = (n·Ac / At)·100

  Ac = (π/4)·Dc²     — área de un conductor
  At = (π/4)·Di²     — área interna del ducto
  n  = número de conductores

Límites de ocupación (NTC-2050, Cap. 9, Tabla 1):
  1 conductor  → 53%
  2 conductores → 31%
  3 o más conductores → 40%

Riesgo de atascamiento ("jamming ratio"): con exactamente 3 conductores, si
la razón (diámetro interno del ducto / diámetro del conductor) cae entre 2.8
y 3.2, los conductores pueden trabarse entre sí durante el halado del cable
— se recomienda subir al siguiente diámetro comercial de tubería.`;

function dedupeOrdered(rows, key) {
  const seen = new Set();
  const out = [];
  for (const r of rows) {
    const v = r[key];
    if (v === null || v === undefined || v === "" || seen.has(v)) continue;
    seen.add(v);
    out.push(v);
  }
  return out;
}

export async function render(container) {
  const tuberias = await loadData("tuberias");
  const tipos = distinct(tuberias, "tipo");

  container.innerHTML = `
    <div class="breadcrumb"><a href="#/">Inicio</a> <span>/</span> <a href="#/calculos">Cálculos</a> <span>/</span> <span>Ocupación de ductos</span></div>
    <h1 class="page-title">Ocupación de ductos</h1>
    <p class="page-subtitle">Porcentaje de ocupación de ductos según el número y diámetro de los conductores, validado contra los límites de la NTC-2050.</p>

    <form class="card" id="form-calc" novalidate>
      <div class="grid-2">
        <div class="field">
          <label for="f-n">Número de conductores</label>
          <select id="f-n" required>
            ${[1, 2, 3, 4, 5, 6, 7, 8, 9].map((n) => `<option value="${n}" ${n === 3 ? "selected" : ""}>${n}</option>`).join("")}
          </select>
          <span class="hint" id="hint-limite"></span>
        </div>
        <div class="field">
          <label for="f-diametro">Diámetro del conductor (mm)</label>
          <input type="number" id="f-diametro" min="0" step="0.01" value="30" required>
        </div>
      </div>

      <div class="grid-2">
        <div class="field">
          <label for="f-tipo">Tipo de tubería</label>
          <select id="f-tipo" required>
            <option value="">Seleccione…</option>
            ${tipos.map((t) => `<option value="${escapeHtml(t)}">${escapeHtml(t)}</option>`).join("")}
          </select>
        </div>
        <div class="field">
          <label for="f-nominal">Diámetro nominal</label>
          <select id="f-nominal" required disabled>
            <option value="">Seleccione un tipo primero</option>
          </select>
        </div>
      </div>

      <label class="checkbox-row"><input type="checkbox" id="chk-manual"> Ingresar diámetro interno manualmente</label>
      <div class="field" id="wrap-manual" hidden style="margin-top: var(--space-3);">
        <label for="f-manual">Diámetro interno de la tubería (mm)</label>
        <input type="number" id="f-manual" min="0" max="10000" step="0.01" value="100">
      </div>

      <div class="btn-row">
        <button type="submit" class="btn btn-primary">Calcular</button>
      </div>
    </form>

    <div id="resultado-wrap"></div>
  `;

  const form = container.querySelector("#form-calc");
  const fN = container.querySelector("#f-n");
  const hintLimite = container.querySelector("#hint-limite");
  const fDiametro = container.querySelector("#f-diametro");
  const selTipo = container.querySelector("#f-tipo");
  const selNominal = container.querySelector("#f-nominal");
  const chkManual = container.querySelector("#chk-manual");
  const wrapManual = container.querySelector("#wrap-manual");
  const fManual = container.querySelector("#f-manual");

  function actualizarHintLimite() {
    hintLimite.textContent = `Límite NTC-2050 aplicable: ${getLimiteOcupacion(parseInt(fN.value, 10))}%`;
  }
  fN.addEventListener("change", actualizarHintLimite);
  actualizarHintLimite();

  selTipo.addEventListener("change", () => {
    const tipo = selTipo.value;
    const nominales = tipo ? dedupeOrdered(tuberias.filter((t) => t.tipo === tipo), "diametro_nominal") : [];
    selNominal.innerHTML = nominales.length
      ? `<option value="">Seleccione…</option>` +
        nominales.map((d) => `<option value="${escapeHtml(d)}">${escapeHtml(d)}</option>`).join("")
      : `<option value="">Seleccione un tipo primero</option>`;
    selNominal.disabled = !nominales.length;
  });

  chkManual.addEventListener("change", () => {
    wrapManual.hidden = !chkManual.checked;
    selNominal.required = !chkManual.checked;
    selTipo.required = !chkManual.checked;
  });

  form.addEventListener("submit", (e) => {
    e.preventDefault();
    if (!form.reportValidity()) return;

    const numeroConductores = parseInt(fN.value, 10);
    const diametroConductorMm = parseFloat(fDiametro.value);

    let diametroTuboMm;
    let etiquetaTubo;
    if (chkManual.checked) {
      diametroTuboMm = parseFloat(fManual.value);
      etiquetaTubo = "Ingresado manualmente";
    } else {
      const fila = tuberias.find((t) => t.tipo === selTipo.value && t.diametro_nominal === selNominal.value);
      if (!fila) {
        renderError("No existe una tubería para esa combinación de tipo y diámetro nominal.");
        return;
      }
      diametroTuboMm = fila.diametro_interno_min_mm;
      etiquetaTubo = `${selTipo.value} — ${selNominal.value} (catálogo)`;
    }

    const data = calcularOcupacionDuctos({ numeroConductores, diametroConductorMm, diametroTuboMm });
    renderResultado(data, { numeroConductores, diametroConductorMm, diametroTuboMm, etiquetaTubo });
  });

  function renderError(msg) {
    const wrap = container.querySelector("#resultado-wrap");
    wrap.innerHTML = `<div class="callout callout-danger">${msg}</div>`;
    wrap.scrollIntoView({ behavior: "smooth", block: "nearest" });
  }

  function renderResultado(data, ctx) {
    const wrap = container.querySelector("#resultado-wrap");
    const pct = Math.min(Math.max(data.ocupacionPct, 0), 100);
    const donutColor = data.cumple ? "var(--accent)" : "var(--danger)";

    const jammingHtml =
      ctx.numeroConductores === 3 && data.riesgoAtascamiento
        ? `<div class="callout callout-warning" style="margin-top: var(--space-4);">
            Riesgo de atascamiento ("jamming ratio" = ${fmt(data.jammingRatio, 2)}, entre 2.8 y 3.2) con exactamente
            3 conductores: pueden trabarse entre sí durante el halado del cable. Se recomienda subir al siguiente
            diámetro comercial de tubería.
          </div>`
        : "";

    const reporte = [
      `Número de conductores: ${ctx.numeroConductores}`,
      `Diámetro del conductor: ${fmt(ctx.diametroConductorMm)} mm`,
      `Tubería: ${ctx.etiquetaTubo}`,
      `Diámetro interno de la tubería: ${fmt(ctx.diametroTuboMm)} mm`,
      ``,
      `Área de un conductor: ${fmt(data.areaCable)} mm²`,
      `Área total de conductores: ${fmt(data.areaCables)} mm²`,
      `Área interna del ducto: ${fmt(data.areaTubo)} mm²`,
      ``,
      `Porcentaje de ocupación: ${fmtPercent(data.ocupacionPct)}`,
      `Porcentaje disponible: ${fmtPercent(data.disponiblePct)}`,
      `Límite aplicable (NTC-2050): ${fmtPercent(data.limitePct)}`,
      `Cumple: ${data.cumple ? "Sí" : "No"}`,
      data.jammingRatio !== null ? `Jamming ratio: ${fmt(data.jammingRatio, 2)}` : null,
    ]
      .filter((l) => l !== null)
      .join("\n");

    wrap.innerHTML = `
      <div class="card">
        <div class="tabs">
          <button type="button" class="tab-btn active" data-tab="resultado">Resultado</button>
          <button type="button" class="tab-btn" data-tab="reporte">Reporte</button>
          <button type="button" class="tab-btn" data-tab="formulas">Fórmulas</button>
        </div>
        <div class="tab-panel" data-panel="resultado">
          <div class="result-panel">
            <div style="display:flex; gap: var(--space-6); align-items: center; flex-wrap: wrap;">
              <div style="width:140px;height:140px;border-radius:50%;flex:0 0 auto;background:conic-gradient(${donutColor} 0% ${pct}%, var(--donut-track) ${pct}% 100%);"></div>
              <div style="flex: 1 1 240px;">
                <div class="result-metric">
                  <div class="value">${fmtPercent(data.ocupacionPct)} <span class="badge ${data.cumple ? "badge-success" : "badge-danger"}">${data.cumple ? "Cumple" : "No cumple"}</span></div>
                  <div class="label">Porcentaje de ocupación (límite ${fmtPercent(data.limitePct)})</div>
                </div>
                <div class="result-metric">
                  <div class="value">${fmtPercent(data.disponiblePct)}</div>
                  <div class="label">Porcentaje disponible</div>
                </div>
              </div>
            </div>
            ${jammingHtml}
          </div>
        </div>
        <div class="tab-panel" data-panel="reporte" hidden>
          <div class="report-block">${reporte}</div>
        </div>
        <div class="tab-panel" data-panel="formulas" hidden>
          <div class="formula-block">${FORMULAS_HTML}</div>
        </div>
      </div>
    `;

    wrap.querySelectorAll(".tab-btn").forEach((btn) => {
      btn.addEventListener("click", () => {
        wrap.querySelectorAll(".tab-btn").forEach((b) => b.classList.toggle("active", b === btn));
        wrap.querySelectorAll(".tab-panel").forEach((panel) => {
          panel.hidden = panel.dataset.panel !== btn.dataset.tab;
        });
      });
    });

    wrap.scrollIntoView({ behavior: "smooth", block: "nearest" });
  }
}
