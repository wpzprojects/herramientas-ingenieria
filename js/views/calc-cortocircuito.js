// Calculadora de capacidad de corriente de cortocircuito admisible.

import { fmt, loadData, distinct, escapeHtml } from "../util/format.js";
import { calcularCortocircuito } from "../calc/cortocircuito.js";

const FORMULAS_HTML = `I_CC = A · k1 · √( log10((T2+λ)/(T1+λ)) / t ) / 1000     [kA]

  A  = área del conductor (mm²)
  T1 = temperatura de operación (°C)
  T2 = temperatura máxima admisible en falla (°C)
  t  = tiempo de despeje de la falla (s)
  λ  = 234 (Cobre) / 228 (Aluminio)
  k1 = 341 (Cobre) / 224 (Aluminio)

El logaritmo es en base 10.`;

export async function render(container) {
  const desnudos = await loadData("conductores-desnudos");
  const xlpe = await loadData("conductores-xlpe");

  container.innerHTML = `
    <div class="breadcrumb"><a href="#/">Inicio</a> <span>/</span> <a href="#/calculos">Cálculos</a> <span>/</span> <span>Cortocircuito</span></div>
    <h1 class="page-title">Capacidad de corriente de cortocircuito</h1>

    <form class="card" id="form-calc" novalidate>
      <div class="grid-2">
        <div class="field">
          <label for="f-red">Tipo de red</label>
          <select id="f-red" required>
            <option value="Aereo">Aéreo</option>
            <option value="Subterraneo">Subterráneo</option>
          </select>
        </div>
        <div class="field">
          <label for="f-material">Material / Tipo de conductor</label>
          <select id="f-material" required></select>
        </div>
      </div>

      <div class="field">
        <label for="f-calibre">Calibre</label>
        <select id="f-calibre" required disabled>
          <option value="">Seleccione un material primero</option>
        </select>
      </div>

      <div class="field">
        <label for="f-area">Área del conductor (mm²)</label>
        <input type="number" id="f-area" min="0" max="10000" step="0.01" required disabled>
        <label class="checkbox-row"><input type="checkbox" id="chk-area"> Modificar manualmente</label>
      </div>

      <div class="grid-2">
        <div class="field">
          <label for="f-top">Temperatura de operación (°C)</label>
          <input type="number" id="f-top" min="0" max="500" step="0.1" required disabled>
          <label class="checkbox-row"><input type="checkbox" id="chk-top"> Modificar manualmente</label>
        </div>
        <div class="field">
          <label for="f-tfalla">Temperatura máxima admisible en falla (°C)</label>
          <input type="number" id="f-tfalla" min="0" max="500" step="0.1" value="250" required disabled>
          <label class="checkbox-row"><input type="checkbox" id="chk-tfalla"> Modificar manualmente</label>
        </div>
      </div>

      <div class="field">
        <label for="f-tiempo">Tiempo de despeje de la falla (s)</label>
        <input type="number" id="f-tiempo" min="0" max="60" step="0.1" value="0.3" required>
      </div>

      <div class="btn-row">
        <button type="submit" class="btn btn-primary">Calcular</button>
      </div>
    </form>

    <div id="resultado-wrap"></div>
  `;

  const form = container.querySelector("#form-calc");
  const selRed = container.querySelector("#f-red");
  const selMaterial = container.querySelector("#f-material");
  const selCalibre = container.querySelector("#f-calibre");
  const fArea = container.querySelector("#f-area");
  const fTop = container.querySelector("#f-top");
  const fTfalla = container.querySelector("#f-tfalla");
  const fTiempo = container.querySelector("#f-tiempo");
  const chkArea = container.querySelector("#chk-area");
  const chkTop = container.querySelector("#chk-top");
  const chkTfalla = container.querySelector("#chk-tfalla");

  let filaSeleccionada = null;

  function opcionesMaterial() {
    return selRed.value === "Aereo" ? distinct(desnudos, "tipo") : distinct(xlpe, "material_conductor");
  }

  function poblarMaterial() {
    const opciones = opcionesMaterial();
    selMaterial.innerHTML = opciones.map((o) => `<option value="${escapeHtml(o)}">${escapeHtml(o)}</option>`).join("");
    poblarCalibre();
  }

  function poblarCalibre() {
    const red = selRed.value;
    const material = selMaterial.value;
    const calibres =
      red === "Aereo"
        ? distinct(desnudos.filter((c) => c.tipo === material), "calibre_awg_kcmil")
        : distinct(xlpe.filter((c) => c.material_conductor === material), "calibre_awg_kcmil");
    selCalibre.innerHTML = calibres.length
      ? `<option value="">Seleccione…</option>` +
        calibres.map((c) => `<option value="${escapeHtml(c)}">${escapeHtml(c)}</option>`).join("")
      : `<option value="">Sin calibres disponibles</option>`;
    selCalibre.disabled = !calibres.length;
    filaSeleccionada = null;
    syncDefaults();
  }

  function resolverFila() {
    const red = selRed.value;
    const material = selMaterial.value;
    const calibre = selCalibre.value;
    if (!calibre) return null;
    if (red === "Aereo") {
      return desnudos.find((c) => c.tipo === material && c.calibre_awg_kcmil === calibre) || null;
    }
    return xlpe.find((c) => c.material_conductor === material && c.calibre_awg_kcmil === calibre) || null;
  }

  function defaultArea() {
    if (!filaSeleccionada) return "";
    return selRed.value === "Aereo" ? filaSeleccionada.area_seccion_aluminio_mm2 : filaSeleccionada.area_conductor_mm2;
  }

  function defaultTop() {
    return selRed.value === "Subterraneo" ? 90 : 75;
  }

  function syncDefaults() {
    if (!chkArea.checked) fArea.value = defaultArea();
    if (!chkTop.checked) fTop.value = defaultTop();
  }

  selRed.addEventListener("change", () => {
    poblarMaterial();
    if (!chkTop.checked) fTop.value = defaultTop();
  });
  selMaterial.addEventListener("change", poblarCalibre);
  selCalibre.addEventListener("change", () => {
    filaSeleccionada = resolverFila();
    syncDefaults();
  });

  chkArea.addEventListener("change", () => {
    fArea.disabled = !chkArea.checked;
    if (!chkArea.checked) fArea.value = defaultArea();
  });
  chkTop.addEventListener("change", () => {
    fTop.disabled = !chkTop.checked;
    if (!chkTop.checked) fTop.value = defaultTop();
  });
  chkTfalla.addEventListener("change", () => {
    fTfalla.disabled = !chkTfalla.checked;
    if (!chkTfalla.checked) fTfalla.value = 250;
  });

  // inicializacion
  poblarMaterial();
  fTop.value = defaultTop();

  form.addEventListener("submit", (e) => {
    e.preventDefault();
    if (!form.reportValidity()) return;

    const red = selRed.value;
    // El combo de "Material/Tipo" en red Aerea en realidad ofrece los TIPOS
    // de conductor del catalogo (ACSR/AAAC/ACAR/AAC/ACSS), todos de aluminio
    // (con o sin alma de acero) -- solo sirve para filtrar el calibre. El
    // calculo de cortocircuito solo distingue Cobre/Aluminio, asi que para
    // red aerea siempre se envia "Aluminio" sin importar el tipo elegido.
    const material = red === "Aereo" ? "Aluminio" : selMaterial.value;

    const p = {
      material,
      areaMm2: parseFloat(fArea.value),
      tempOperacionC: parseFloat(fTop.value),
      tempFallaC: parseFloat(fTfalla.value),
      tiempoS: parseFloat(fTiempo.value),
    };

    const data = calcularCortocircuito(p);
    renderResultado(data, p, { red, tipoMaterial: selMaterial.value, calibre: selCalibre.value, materialElectrico: material });
  });

  function renderResultado(data, p, ctx) {
    const wrap = container.querySelector("#resultado-wrap");

    const reporte = [
      `Tipo de red: ${ctx.red === "Aereo" ? "Aéreo" : "Subterráneo"}`,
      `Tipo/Material de conductor: ${ctx.tipoMaterial}`,
      `Calibre: ${ctx.calibre}`,
      `Material eléctrico usado en el cálculo: ${ctx.materialElectrico}`,
      `Área del conductor: ${fmt(p.areaMm2)} mm²`,
      `Temperatura de operación: ${fmt(p.tempOperacionC)} °C`,
      `Temperatura máxima admisible en falla: ${fmt(p.tempFallaC)} °C`,
      `Tiempo de despeje de la falla: ${fmt(p.tiempoS, 1)} s`,
      ``,
      `λ (constante material): ${fmt(data.intermedios.tempRes0, 0)}`,
      `k1 (constante material): ${fmt(data.intermedios.k1, 0)}`,
      `log10((T2+λ)/(T1+λ)): ${fmt(data.intermedios.logaritmo, 5)}`,
      ``,
      `Capacidad de cortocircuito: ${fmt(data.capacidadCcKa)} kA`,
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
              <div class="value">${fmt(data.capacidadCcKa)}<span class="unit">kA</span></div>
              <div class="label">Capacidad de corriente de cortocircuito</div>
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
