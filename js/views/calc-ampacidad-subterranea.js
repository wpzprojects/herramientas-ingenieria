// Calculadora de ampacidad de cables subterraneos en banco de ductos
// (IEC 60287-1-1).

import { fmt, loadData, distinct, escapeHtml } from "../util/format.js";
import { calcularAmpacidadSubterranea } from "../calc/ampacidad-subterranea.js";

const ORDEN_CALIBRES = ["1/0 AWG", "2/0 AWG", "3/0 AWG", "4/0 AWG", "250 kcmil", "350 kcmil", "500 kcmil", "750 kcmil", "1000 kcmil"];

const FORMULAS_HTML = `Metodología IEC 60287-1-1 (régimen permanente):

  Ampacidad = √( (Δθ − Wd·(0.5·T1 + n·(T2+T3+T4))) / (n·R·[T1/n + (1+λ1)·(T2+T3+T4)]) )

  R  = resistencia AC del conductor, incluyendo efecto piel y de proximidad
  Wd = pérdida dieléctrica del aislamiento
  λ1 = factor de pérdidas por corrientes inducidas/circulantes en la pantalla
  T1 = resistencia térmica del aislamiento
  T2 = resistencia térmica de la cubierta/relleno
  T3 = resistencia térmica de la chaqueta exterior
  T4 = resistencia térmica externa (suelo + ducto), calculada con el método
       de imágenes de Kennelly para el acoplamiento térmico entre el ducto
       activo y los demás ductos del banco
  Δθ = salto térmico admisible entre el conductor y el terreno

Limitaciones conocidas:
  • No distingue formación en trébol vs. formación plana — usa la misma
    fórmula de proximidad para ambas.
  • Solo calcula régimen permanente (no transitorio ni secado del suelo).`;

const HINTS = {
  puestaTierra:
    "Unipuntual: en un extremo del cable.",
  tempTerreno: "Valores típicos: 15-20°C en clima frío, 25-30°C en clima cálido/tropical.",
  rhoSuelo: "Tipos de suelo: Saturado / muy húmedo: 0.5-0.7; Arena o arcilla húmeda: 0.7-1.0; Tierra común compactada: 1.0-1.2; Arena seca: 2.0-3.0; Roca/suelo muy seco: 2.5-3.5",
  uDucto: "Típicos: PVC ≈ 0.3 - 0.4 K·m/W; Fibra de vidrio: 0.2 - 0.3; Metálico: 0.05 - 0.1; Cualquier ducto embebido en concreto: 0.1 - 0.2",
  separacionFases: "Valores típicos entre 0.04 y 0.10 m entre fases.",
  separacionDuctos: "Depende de la norma; valores típicos entre 0.15 y 0.30 m",
};

export async function render(container) {
  const cables = await loadData("construccion-cable-subterraneo");
  const materiales = distinct(cables, "material");
  const calibres = ORDEN_CALIBRES.filter((c) => cables.some((row) => row.calibre_awg_kcmil === c));
  const tiposPantalla = distinct(cables, "tipo_pantalla");
  const nivelesKv = distinct(cables, "nivel_aislamiento_kv");

  container.innerHTML = `
    <div class="breadcrumb"><a href="#/">Inicio</a> <span>/</span> <a href="#/calculos">Cálculos</a> <span>/</span> <span>Ampacidad subterránea</span></div>
    <h1 class="page-title">Ampacidad de cables subterráneos</h1>
    <p class="page-subtitle">Corriente admisible en régimen permanente de un cable en banco de ductos, según IEC 60287-1-1.</p>

    <form class="card" id="form-calc" novalidate>
      <div class="grid-2">
        <div class="field">
          <label for="f-tipocable">Tipo de cable</label>
          <select id="f-tipocable" required>
            <option value="Monopolar">Monopolar</option>
            <option value="Tripolar">Tripolar</option>
          </select>
        </div>
        <div class="field">
          <label for="f-material">Material</label>
          <select id="f-material" required>
            ${materiales.map((m) => `<option value="${escapeHtml(m)}">${escapeHtml(m)}</option>`).join("")}
          </select>
        </div>
      </div>

      <div class="grid-2">
        <div class="field">
          <label for="f-calibre">Calibre</label>
          <select id="f-calibre" required>
            ${calibres.map((c) => `<option value="${escapeHtml(c)}">${escapeHtml(c)}</option>`).join("")}
          </select>
        </div>
        <div class="field">
          <label for="f-pantalla">Tipo de pantalla</label>
          <select id="f-pantalla" required>
            ${tiposPantalla.map((t) => `<option value="${escapeHtml(t)}">${escapeHtml(t)}</option>`).join("")}
          </select>
        </div>
      </div>

      <div class="grid-2">
        <div class="field">
          <label for="f-nivelkv">Nivel de aislamiento (kV)</label>
          <select id="f-nivelkv" required>
            ${nivelesKv.map((k) => `<option value="${k}">${k}</option>`).join("")}
          </select>
        </div>
        <div class="field">
          <label for="f-nivelpct">% de aislamiento</label>
          <select id="f-nivelpct" required></select>
        </div>
      </div>

      <div class="field">
        <label for="f-tierra">Puesta a tierra de pantallas</label>
        <select id="f-tierra" required>
          <option value="Unipuntual">Unipuntual</option>
          <option value="Ambos Extremos">Ambos Extremos</option>
          <option value="Cross-bonding">Cross-bonding</option>
        </select>
        <span class="hint">${HINTS.puestaTierra}</span>
      </div>

      <div class="grid-2">
        <div class="field">
          <label for="f-tension">Tensión del sistema (kV, línea-línea)</label>
          <input type="number" id="f-tension" min="0" max="46" step="0.1" value="34.5" required>
        </div>
        <div class="field">
          <label for="f-frecuencia">Frecuencia (Hz)</label>
          <input type="number" id="f-frecuencia" min="0" max="300" step="1" value="60" required>
        </div>
      </div>

      <div class="grid-2">
        <div class="field">
          <label for="f-tempmax">Temperatura máxima del conductor (°C)</label>
          <input type="number" id="f-tempmax" min="0" max="300" step="0.1" value="90" required>
        </div>
        <div class="field">
          <label for="f-tempterreno">Temperatura del terreno (°C)</label>
          <input type="number" id="f-tempterreno" min="-100" max="100" step="0.1" value="25" required>
          <span class="hint">${HINTS.tempTerreno}</span>
        </div>
      </div>

      <div class="grid-2">
        <div class="field">
          <label for="f-rhosuelo">Resistividad térmica del suelo (K·m/W)</label>
          <input type="number" id="f-rhosuelo" min="-100" max="1000" step="0.01" value="1" required>
          <span class="hint">${HINTS.rhoSuelo}</span>
        </div>
        <div class="field">
          <label for="f-uducto">Resistencia térmica del ducto (K·m/W)</label>
          <input type="number" id="f-uducto" min="0" max="5" step="0.01" value="0.3" required>
          <span class="hint">${HINTS.uDucto}</span>
        </div>
      </div>

      <div class="grid-2">
        <div class="field">
          <label for="f-sepfases">Separación entre fases (m)</label>
          <input type="number" id="f-sepfases" min="0" max="1" step="0.01" value="0.04" required>
          <span class="hint">${HINTS.separacionFases}</span>
        </div>
        <div class="field">
          <label for="f-ncircuitos">Número de circuitos en el banco</label>
          <input type="number" id="f-ncircuitos" min="0" max="6" step="1" value="1" required>
        </div>
      </div>

      <div class="grid-2">
        <div class="field">
          <label for="f-profundidad">Profundidad de enterramiento del banco (m)</label>
          <input type="number" id="f-profundidad" min="0" max="10" step="0.01" value="1" required>
        </div>
        <div class="field">
          <label for="f-sepductos">Separación entre ductos (m)</label>
          <input type="number" id="f-sepductos" min="0.05" max="1" step="0.01" value="0.2" required disabled>
          <span class="hint">${HINTS.separacionDuctos}</span>
        </div>
      </div>

      <div class="btn-row">
        <button type="submit" class="btn btn-primary">Calcular</button>
      </div>
    </form>

    <div id="resultado-wrap"></div>
  `;

  const form = container.querySelector("#form-calc");
  const selTipoCable = container.querySelector("#f-tipocable");
  const selMaterial = container.querySelector("#f-material");
  const selCalibre = container.querySelector("#f-calibre");
  const selPantalla = container.querySelector("#f-pantalla");
  const selNivelKv = container.querySelector("#f-nivelkv");
  const selNivelPct = container.querySelector("#f-nivelpct");
  const selTierra = container.querySelector("#f-tierra");
  const fTension = container.querySelector("#f-tension");
  const fFrecuencia = container.querySelector("#f-frecuencia");
  const fTempMax = container.querySelector("#f-tempmax");
  const fTempTerreno = container.querySelector("#f-tempterreno");
  const fRhoSuelo = container.querySelector("#f-rhosuelo");
  const fUDucto = container.querySelector("#f-uducto");
  const fSepFases = container.querySelector("#f-sepfases");
  const fNCircuitos = container.querySelector("#f-ncircuitos");
  const fProfundidad = container.querySelector("#f-profundidad");
  const fSepDuctos = container.querySelector("#f-sepductos");

  function actualizarNivelPct() {
    const kv = parseFloat(selNivelKv.value);
    const opciones = kv === 46 ? [100] : [100, 133];
    selNivelPct.innerHTML = opciones.map((p) => `<option value="${p}">${p}</option>`).join("");
  }

  function actualizarDisponibilidad() {
    const esTripolar = selTipoCable.value === "Tripolar";
    selTierra.disabled = esTripolar;
    fSepFases.disabled = esTripolar;

    const numCircuitos = parseInt(fNCircuitos.value, 10);
    fSepDuctos.disabled = !(numCircuitos > 1);
  }

  selNivelKv.addEventListener("change", actualizarNivelPct);
  selTipoCable.addEventListener("change", actualizarDisponibilidad);
  fNCircuitos.addEventListener("input", actualizarDisponibilidad);

  actualizarNivelPct();
  actualizarDisponibilidad();

  form.addEventListener("submit", (e) => {
    e.preventDefault();
    if (!form.reportValidity()) return;

    const tipoCable = selTipoCable.value;
    const material = selMaterial.value;
    const calibre = selCalibre.value;
    const tipoPantalla = selPantalla.value;
    const nivelAislamientoKv = parseFloat(selNivelKv.value);
    const nivelAislamientoPct = parseFloat(selNivelPct.value);

    const cable = cables.find(
      (row) =>
        row.calibre_awg_kcmil === calibre &&
        row.material === material &&
        row.tipo_pantalla === tipoPantalla &&
        row.nivel_aislamiento_kv === nivelAislamientoKv &&
        row.nivel_aislamiento_pct === nivelAislamientoPct
    );

    if (!cable) {
      renderError("No existe una construcción de cable para esa combinación.");
      return;
    }

    const p = {
      tipoCable,
      cable,
      tipoPantalla,
      nivelAislamientoKv,
      puestaTierra: selTierra.value,
      tensionSistemaKv: parseFloat(fTension.value),
      frecuenciaHz: parseFloat(fFrecuencia.value),
      tempMaxC: parseFloat(fTempMax.value),
      tempTerrenoC: parseFloat(fTempTerreno.value),
      rhoSueloKmW: parseFloat(fRhoSuelo.value),
      uDuctoKmW: parseFloat(fUDucto.value),
      separacionFasesM: parseFloat(fSepFases.value),
      numCircuitos: parseInt(fNCircuitos.value, 10),
      profundidadBancoM: parseFloat(fProfundidad.value),
      separacionDuctosM: parseFloat(fSepDuctos.value),
    };

    try {
      const data = calcularAmpacidadSubterranea(p);
      renderResultado(data, p, { material, calibre, tipoPantalla, nivelAislamientoKv, nivelAislamientoPct });
    } catch (err) {
      renderError(err.message);
    }
  });

  function renderError(msg) {
    const wrap = container.querySelector("#resultado-wrap");
    wrap.innerHTML = `<div class="callout callout-danger">${msg}</div>`;
    wrap.scrollIntoView({ behavior: "smooth", block: "nearest" });
  }

  function renderResultado(data, p, ctx) {
    const wrap = container.querySelector("#resultado-wrap");
    const i = data.intermedios;

    const reporte = [
      `Tipo de cable: ${p.tipoCable}`,
      `Material: ${ctx.material}`,
      `Calibre: ${ctx.calibre}`,
      `Tipo de pantalla: ${ctx.tipoPantalla}`,
      `Nivel de aislamiento: ${fmt(ctx.nivelAislamientoKv, 0)} kV — ${fmt(ctx.nivelAislamientoPct, 0)}%`,
      `Puesta a tierra de pantallas: ${p.tipoCable === "Tripolar" ? "N/A (tripolar)" : p.puestaTierra}`,
      `Tensión del sistema: ${fmt(p.tensionSistemaKv)} kV`,
      `Frecuencia: ${fmt(p.frecuenciaHz, 0)} Hz`,
      `Temperatura máxima del conductor: ${fmt(p.tempMaxC)} °C`,
      `Temperatura del terreno: ${fmt(p.tempTerrenoC)} °C`,
      `Resistividad térmica del suelo: ${fmt(p.rhoSueloKmW)} K·m/W`,
      `Resistencia térmica del ducto: ${fmt(p.uDuctoKmW)} K·m/W`,
      `Separación entre fases: ${p.tipoCable === "Tripolar" ? "N/A (tripolar)" : fmt(p.separacionFasesM)} m`,
      `Número de circuitos en el banco: ${fmt(p.numCircuitos, 0)}`,
      `Profundidad de enterramiento del banco: ${fmt(p.profundidadBancoM)} m`,
      `Separación entre ductos: ${p.numCircuitos > 1 ? fmt(p.separacionDuctosM) + " m" : "N/A (1 circuito)"}`,
      ``,
      `R (resistencia AC efectiva): ${fmt(i.varR, 8)} Ω/m`,
      `Wd (pérdida dieléctrica): ${fmt(i.varWd, 6)} W/m`,
      `λ1 (factor de pérdidas en pantalla): ${fmt(i.lambda1, 4)}`,
      `T1 (resistencia térmica del aislamiento): ${fmt(i.T1, 4)} K·m/W`,
      `T2 (resistencia térmica del relleno): ${fmt(i.T2, 4)} K·m/W`,
      `T3 (resistencia térmica de la chaqueta): ${fmt(i.T3, 4)} K·m/W`,
      `T4 (resistencia térmica externa): ${fmt(i.T4, 4)} K·m/W`,
      `Δθ (salto térmico admisible): ${fmt(i.deltaTheta)} °C`,
      ``,
      `Ampacidad: ${fmt(data.ampacidad)} A`,
    ].join("\n");

    wrap.innerHTML = `
      <div class="card">
        <div class="tabs">
          <button type="button" class="tab-btn active" data-tab="resultado">Resultado</button>
          <button type="button" class="tab-btn" data-tab="reporte">Reporte</button>
          <button type="button" class="tab-btn" data-tab="formulas">Fórmulas</button>
        </div>
        <div class="tab-panel" data-panel="resultado">
          <div class="result-panel">
            <div class="result-metric">
              <div class="value">${fmt(data.ampacidad)}<span class="unit">A</span></div>
              <div class="label">Ampacidad admisible</div>
            </div>
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
