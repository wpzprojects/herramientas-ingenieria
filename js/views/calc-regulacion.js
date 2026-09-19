// Calculadora de caida de tension (regulacion) en una linea trifasica.

import { fmt, fmtPercent, loadData, distinct, escapeHtml } from "../util/format.js";
import { calcularRegulacion } from "../calc/regulacion.js";

const FORMULAS_HTML = `I = (P·1000) / (V·cos φ·√3)                                    [A]
S = P / cos φ                                                   [MVA]
Q = √(S² − P²)                                                   [MVAR]

Xl = 0.0754·ln( ∛(Dab·Dac·Dbc) / RMG )                           [Ω/km]  — reactancia inductiva
Z  = R·cos φ + Xl·sen(φ)                                         [Ω/km]  — impedancia efectiva
Fr = R + Xl·tan φ                                                        — factor de regulación
K  = Fr / (10·V²)                                                        — constante de regulación

% Caída de tensión = (√3·I·Z·L·100) / (V·1000)

Nota: la reactancia inductiva y la impedancia efectiva son valores
intermedios del cálculo (no se muestran en el resultado ni en el reporte,
igual que en la aplicación original).`;

export async function render(container) {
  const desnudos = await loadData("conductores-desnudos");
  const xlpe = await loadData("conductores-xlpe");

  container.innerHTML = `
    <div class="breadcrumb"><a href="#/">Inicio</a> <span>/</span> <a href="#/calculos">Cálculos</a> <span>/</span> <span>Regulación</span></div>
    <h1 class="page-title">Regulación (caída de tensión)</h1>

    <form class="card" id="form-calc" novalidate>
      <div class="grid-2">
        <div class="field">
          <label for="f-tension">Tensión de línea (kV)</label>
          <input type="number" id="f-tension" min="0" step="0.01" value="34.5" required>
        </div>
        <div class="field">
          <label for="f-potencia">Potencia activa (MW)</label>
          <input type="number" id="f-potencia" min="0" step="0.01" value="9.9" required>
        </div>
      </div>

      <div class="grid-2">
        <div class="field">
          <label for="f-fp">Factor de potencia</label>
          <input type="number" id="f-fp" min="0" max="1" step="0.01" value="0.95" required>
          <span class="hint">Si solo conoces la potencia aparente (MVA), ingrésala aquí y usa factor de potencia = 1.</span>
        </div>
        <div class="field">
          <label for="f-longitud">Longitud de la línea (km)</label>
          <input type="number" id="f-longitud" min="0" step="0.01" value="5.2" required>
        </div>
      </div>

      <div class="grid-2">
        <div class="field">
          <label for="f-red">Tipo de red</label>
          <select id="f-red" required>
            <option value="Aerea">Aérea</option>
            <option value="Subterranea">Subterránea</option>
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

      <div class="grid-2">
        <div class="field">
          <label for="f-resistencia">Resistencia AC a 75°C (Ω/km)</label>
          <input type="number" id="f-resistencia" min="0" max="10000" step="0.01" required disabled>
          <label class="checkbox-row"><input type="checkbox" id="chk-resistencia"> Modificar manualmente</label>
        </div>
        <div class="field">
          <label for="f-rmg">Radio medio geométrico (m)</label>
          <input type="number" id="f-rmg" min="0" step="0.000001" required disabled>
          <label class="checkbox-row"><input type="checkbox" id="chk-rmg"> Modificar manualmente</label>
        </div>
      </div>

      <div class="grid-3">
        <div class="field">
          <label for="f-dab">Distancia fase A-B (m)</label>
          <input type="number" id="f-dab" min="0" step="0.01" value="2" required>
        </div>
        <div class="field">
          <label for="f-dac">Distancia fase A-C (m)</label>
          <input type="number" id="f-dac" min="0" step="0.01" value="2.84" required>
        </div>
        <div class="field">
          <label for="f-dbc">Distancia fase B-C (m)</label>
          <input type="number" id="f-dbc" min="0" step="0.01" value="0.84" required>
        </div>
      </div>

      <div class="btn-row">
        <button type="submit" class="btn btn-primary">Calcular</button>
      </div>
    </form>

    <div id="resultado-wrap"></div>
  `;

  const form = container.querySelector("#form-calc");
  const fTension = container.querySelector("#f-tension");
  const fPotencia = container.querySelector("#f-potencia");
  const fFp = container.querySelector("#f-fp");
  const fLongitud = container.querySelector("#f-longitud");
  const selRed = container.querySelector("#f-red");
  const selMaterial = container.querySelector("#f-material");
  const selCalibre = container.querySelector("#f-calibre");
  const fResistencia = container.querySelector("#f-resistencia");
  const fRmg = container.querySelector("#f-rmg");
  const chkResistencia = container.querySelector("#chk-resistencia");
  const chkRmg = container.querySelector("#chk-rmg");
  const fDab = container.querySelector("#f-dab");
  const fDac = container.querySelector("#f-dac");
  const fDbc = container.querySelector("#f-dbc");

  let filaSeleccionada = null;

  function poblarMaterial() {
    const opciones = selRed.value === "Aerea" ? distinct(desnudos, "tipo") : distinct(xlpe, "material_conductor");
    selMaterial.innerHTML = opciones.map((o) => `<option value="${escapeHtml(o)}">${escapeHtml(o)}</option>`).join("");
    poblarCalibre();
  }

  function poblarCalibre() {
    const red = selRed.value;
    const material = selMaterial.value;
    const calibres =
      red === "Aerea"
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
    if (red === "Aerea") {
      return desnudos.find((c) => c.tipo === material && c.calibre_awg_kcmil === calibre) || null;
    }
    return xlpe.find((c) => c.material_conductor === material && c.calibre_awg_kcmil === calibre) || null;
  }

  function syncDefaults() {
    if (!chkResistencia.checked) fResistencia.value = filaSeleccionada ? filaSeleccionada.r_ac_75c_ohm_km : "";
    if (!chkRmg.checked) fRmg.value = filaSeleccionada ? filaSeleccionada.radio_medio_geometrico_mm / 1000 : "";
  }

  selRed.addEventListener("change", poblarMaterial);
  selMaterial.addEventListener("change", poblarCalibre);
  selCalibre.addEventListener("change", () => {
    filaSeleccionada = resolverFila();
    syncDefaults();
  });
  chkResistencia.addEventListener("change", () => {
    fResistencia.disabled = !chkResistencia.checked;
    if (!chkResistencia.checked) syncDefaults();
  });
  chkRmg.addEventListener("change", () => {
    fRmg.disabled = !chkRmg.checked;
    if (!chkRmg.checked) syncDefaults();
  });

  poblarMaterial();

  form.addEventListener("submit", (e) => {
    e.preventDefault();
    if (!form.reportValidity()) return;

    const p = {
      tensionLineaKv: parseFloat(fTension.value),
      potenciaActivaMw: parseFloat(fPotencia.value),
      factorPotencia: parseFloat(fFp.value),
      longitudKm: parseFloat(fLongitud.value),
      resistenciaOhmKm: parseFloat(fResistencia.value),
      rmgM: parseFloat(fRmg.value),
      dabM: parseFloat(fDab.value),
      dacM: parseFloat(fDac.value),
      dbcM: parseFloat(fDbc.value),
    };

    const data = calcularRegulacion(p);
    renderResultado(data, p, { red: selRed.value, material: selMaterial.value, calibre: selCalibre.value });
  });

  function renderResultado(data, p, ctx) {
    const wrap = container.querySelector("#resultado-wrap");

    const reporte = [
      `Tensión de línea: ${fmt(p.tensionLineaKv)} kV`,
      `Potencia activa: ${fmt(p.potenciaActivaMw)} MW`,
      `Factor de potencia: ${fmt(p.factorPotencia)}`,
      `Longitud de la línea: ${fmt(p.longitudKm)} km`,
      `Tipo de red: ${ctx.red === "Aerea" ? "Aérea" : "Subterránea"}`,
      `Material/Tipo de conductor: ${ctx.material}`,
      `Calibre: ${ctx.calibre}`,
      `Resistencia AC a 75°C: ${fmt(p.resistenciaOhmKm)} Ω/km`,
      `Radio medio geométrico: ${fmt(p.rmgM, 6)} m`,
      `Distancia fase A-B: ${fmt(p.dabM)} m`,
      `Distancia fase A-C: ${fmt(p.dacM)} m`,
      `Distancia fase B-C: ${fmt(p.dbcM)} m`,
      ``,
      `Corriente: ${fmt(data.corriente)} A`,
      `Potencia aparente: ${fmt(data.potenciaS)} MVA`,
      `Potencia reactiva: ${fmt(data.potenciaQ)} MVAR`,
      `Constante de regulación: ${fmt(data.constanteRegulacion, 7)}`,
      `Caída de tensión: ${fmtPercent(data.caidaTensionPct)}`,
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
            <div class="grid-2">
              <div class="result-metric">
                <div class="value">${fmt(data.potenciaS)}<span class="unit">MVA</span></div>
                <div class="label">Potencia aparente</div>
              </div>
              <div class="result-metric">
                <div class="value">${fmt(data.potenciaQ)}<span class="unit">MVAR</span></div>
                <div class="label">Potencia reactiva</div>
              </div>
              <div class="result-metric">
                <div class="value">${fmt(data.corriente)}<span class="unit">A</span></div>
                <div class="label">Corriente</div>
              </div>
              <div class="result-metric">
                <div class="value">${fmt(data.constanteRegulacion, 7)}</div>
                <div class="label">Constante de regulación</div>
              </div>
              <div class="result-metric">
                <div class="value">${fmtPercent(data.caidaTensionPct)}</div>
                <div class="label">Caída de tensión</div>
              </div>
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
