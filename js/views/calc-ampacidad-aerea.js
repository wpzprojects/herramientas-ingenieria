// Calculadora de ampacidad de conductores aereos (IEEE Std 738).

import { fmt, loadData, distinct, escapeHtml } from "../util/format.js";
import { calcularAmpacidadAerea } from "../calc/ampacidad-aerea.js";

const FORMULAS_HTML = `Metodologia IEEE Std 738 (balance termico en regimen permanente):

  Convección + Radiación emitida = Radiación solar absorbida + Calentamiento resistivo

  Ampacidad = √((Qc + Qr − Qs) / R)

  Qc = max(Qcn, Qc1, Qc2)   — convección natural y forzada (2 correlaciones), se toma el mayor
  Qr = 17.8·D·ε·[((Tc+273)/100)⁴ − ((Ta+273)/100)⁴]   — radiación emitida
  Qs = α·Qse·sen(θ)·D                                   — radiación solar absorbida
  R  = interpolación lineal de la resistencia AC entre 25°C y 75°C, evaluada en Tc

Nota: Qse (radiación solar total) y θ (ángulo efectivo de incidencia solar) se
ingresan manualmente en esta calculadora. El cálculo de posición solar del
estándar completo (a partir de fecha, hora y latitud) no está implementado.`;

export async function render(container) {
  const conductores = await loadData("conductores-desnudos");
  const tipos = distinct(conductores, "tipo");

  container.innerHTML = `
    <div class="breadcrumb"><a href="#/">Inicio</a> <span>/</span> <a href="#/calculos">Cálculos</a> <span>/</span> <span>Ampacidad aérea</span></div>
    <h1 class="page-title">Ampacidad de conductores aéreos</h1>
    <p class="page-subtitle">Corriente admisible en régimen permanente de un conductor aéreo, según el balance térmico IEEE Std 738.</p>

    <form class="card" id="form-calc" novalidate>
      <div class="grid-2">
        <div class="field">
          <label for="f-tipo">Tipo</label>
          <select id="f-tipo" required>
            <option value="">Seleccione…</option>
            ${tipos.map((t) => `<option value="${escapeHtml(t)}">${escapeHtml(t)}</option>`).join("")}
          </select>
        </div>
        <div class="field">
          <label for="f-calibre">Calibre</label>
          <select id="f-calibre" required disabled>
            <option value="">Seleccione un tipo primero</option>
          </select>
        </div>
      </div>

      <div class="field">
        <label for="f-referencia">Referencia</label>
        <select id="f-referencia" required disabled>
          <option value="">Seleccione un calibre primero</option>
        </select>
      </div>

      <div class="grid-3">
        <div class="field">
          <label for="f-diametro">Diámetro del cable (mm)</label>
          <input type="number" id="f-diametro" min="0" max="1000" step="0.01" required disabled>
          <label class="checkbox-row"><input type="checkbox" id="chk-diametro"> Modificar manualmente</label>
        </div>
        <div class="field">
          <label for="f-rbajo">Resistencia AC a 25°C (Ω/km)</label>
          <input type="number" id="f-rbajo" min="0" max="1000" step="0.01" required disabled>
          <label class="checkbox-row"><input type="checkbox" id="chk-rbajo"> Modificar manualmente</label>
        </div>
        <div class="field">
          <label for="f-ralto">Resistencia AC a 75°C (Ω/km)</label>
          <input type="number" id="f-ralto" min="0" max="1000" step="0.01" required disabled>
          <label class="checkbox-row"><input type="checkbox" id="chk-ralto"> Modificar manualmente</label>
        </div>
      </div>

      <div class="grid-2">
        <div class="field">
          <label for="f-epsilon">Emisividad (ε)</label>
          <input type="number" id="f-epsilon" min="0.23" max="0.91" step="0.01" value="0.5" required>
        </div>
        <div class="field">
          <label for="f-alfa">Absortividad (α)</label>
          <input type="number" id="f-alfa" min="0.23" max="0.91" step="0.01" value="0.5" required>
        </div>
      </div>

      <div class="grid-2">
        <div class="field">
          <label for="f-ta">Temperatura ambiente (°C)</label>
          <input type="number" id="f-ta" min="-100" max="1000" step="0.1" value="25" required>
        </div>
        <div class="field">
          <label for="f-tc">Temperatura máxima del conductor (°C)</label>
          <input type="number" id="f-tc" min="0" max="1000" step="0.1" value="75" required>
        </div>
      </div>

      <div class="grid-2">
        <div class="field">
          <label for="f-vw">Velocidad del viento (m/s)</label>
          <input type="number" id="f-vw" min="0" max="100" step="0.01" value="0.61" required>
        </div>
        <div class="field">
          <label for="f-angulo">Ángulo viento-conductor (°)</label>
          <input type="number" id="f-angulo" min="0" max="360" step="1" value="90" required>
        </div>
      </div>

      <div class="field">
        <label for="f-elevacion">Elevación sobre el nivel del mar (m)</label>
        <input type="number" id="f-elevacion" min="0" max="10000" step="1" value="0" required>
      </div>

      <div class="grid-2">
        <div class="field">
          <label for="f-qse">Radiación solar total Qse (W/m²)</label>
          <input type="number" id="f-qse" min="0" max="3000" step="1" value="1000" required disabled>
          <label class="checkbox-row"><input type="checkbox" id="chk-qse"> Modificar manualmente</label>
        </div>
        <div class="field">
          <label for="f-theta">Ángulo efectivo de incidencia solar θ (°)</label>
          <input type="number" id="f-theta" min="0" max="1000" step="1" value="90" required disabled>
          <label class="checkbox-row"><input type="checkbox" id="chk-theta"> Modificar manualmente</label>
        </div>
      </div>

      <div class="btn-row">
        <button type="submit" class="btn btn-primary">Calcular</button>
      </div>
    </form>

    <div id="resultado-wrap"></div>
  `;

  const form = container.querySelector("#form-calc");
  const selTipo = container.querySelector("#f-tipo");
  const selCalibre = container.querySelector("#f-calibre");
  const selReferencia = container.querySelector("#f-referencia");

  const fDiametro = container.querySelector("#f-diametro");
  const fRbajo = container.querySelector("#f-rbajo");
  const fRalto = container.querySelector("#f-ralto");
  const fEpsilon = container.querySelector("#f-epsilon");
  const fAlfa = container.querySelector("#f-alfa");
  const fTa = container.querySelector("#f-ta");
  const fTc = container.querySelector("#f-tc");
  const fVw = container.querySelector("#f-vw");
  const fAngulo = container.querySelector("#f-angulo");
  const fElevacion = container.querySelector("#f-elevacion");
  const fQse = container.querySelector("#f-qse");
  const fTheta = container.querySelector("#f-theta");

  const chkDiametro = container.querySelector("#chk-diametro");
  const chkRbajo = container.querySelector("#chk-rbajo");
  const chkRalto = container.querySelector("#chk-ralto");
  const chkQse = container.querySelector("#chk-qse");
  const chkTheta = container.querySelector("#chk-theta");

  let conductorSeleccionado = null;

  function syncDefaults() {
    if (!chkDiametro.checked) fDiametro.value = conductorSeleccionado ? conductorSeleccionado.diametro_cable_mm : "";
    if (!chkRbajo.checked) fRbajo.value = conductorSeleccionado ? conductorSeleccionado.r_ac_25c_ohm_km : "";
    if (!chkRalto.checked) fRalto.value = conductorSeleccionado ? conductorSeleccionado.r_ac_75c_ohm_km : "";
  }

  chkDiametro.addEventListener("change", () => {
    fDiametro.disabled = !chkDiametro.checked;
    if (!chkDiametro.checked) syncDefaults();
  });
  chkRbajo.addEventListener("change", () => {
    fRbajo.disabled = !chkRbajo.checked;
    if (!chkRbajo.checked) syncDefaults();
  });
  chkRalto.addEventListener("change", () => {
    fRalto.disabled = !chkRalto.checked;
    if (!chkRalto.checked) syncDefaults();
  });
  chkQse.addEventListener("change", () => {
    fQse.disabled = !chkQse.checked;
    if (!chkQse.checked) fQse.value = 1000;
  });
  chkTheta.addEventListener("change", () => {
    fTheta.disabled = !chkTheta.checked;
    if (!chkTheta.checked) fTheta.value = 90;
  });

  selTipo.addEventListener("change", () => {
    const tipo = selTipo.value;
    const calibres = tipo ? distinct(conductores.filter((c) => c.tipo === tipo), "calibre_awg_kcmil") : [];
    selCalibre.innerHTML = calibres.length
      ? `<option value="">Seleccione…</option>` +
        calibres.map((c) => `<option value="${escapeHtml(c)}">${escapeHtml(c)}</option>`).join("")
      : `<option value="">Seleccione un tipo primero</option>`;
    selCalibre.disabled = !calibres.length;
    selReferencia.innerHTML = `<option value="">Seleccione un calibre primero</option>`;
    selReferencia.disabled = true;
    conductorSeleccionado = null;
    syncDefaults();
  });

  selCalibre.addEventListener("change", () => {
    const tipo = selTipo.value;
    const calibre = selCalibre.value;
    const refs = calibre ? conductores.filter((c) => c.tipo === tipo && c.calibre_awg_kcmil === calibre) : [];
    selReferencia.innerHTML = refs.length
      ? `<option value="">Seleccione…</option>` +
        refs.map((c) => `<option value="${escapeHtml(c.nombre_clave)}">${escapeHtml(c.nombre_clave)}</option>`).join("")
      : `<option value="">Seleccione un calibre primero</option>`;
    selReferencia.disabled = !refs.length;
    conductorSeleccionado = null;
    syncDefaults();
  });

  selReferencia.addEventListener("change", () => {
    const tipo = selTipo.value;
    const calibre = selCalibre.value;
    const nombre = selReferencia.value;
    conductorSeleccionado =
      conductores.find((c) => c.tipo === tipo && c.calibre_awg_kcmil === calibre && c.nombre_clave === nombre) || null;
    syncDefaults();
  });

  form.addEventListener("submit", (e) => {
    e.preventDefault();
    if (!form.reportValidity()) return;

    const p = {
      diametroMm: parseFloat(fDiametro.value),
      rBajoOhmKm: parseFloat(fRbajo.value),
      rAltoOhmKm: parseFloat(fRalto.value),
      epsilon: parseFloat(fEpsilon.value),
      alfa: parseFloat(fAlfa.value),
      taC: parseFloat(fTa.value),
      tcC: parseFloat(fTc.value),
      vwMs: parseFloat(fVw.value),
      anguloVientoDeg: parseFloat(fAngulo.value),
      elevacionM: parseFloat(fElevacion.value),
      qseWm2: parseFloat(fQse.value),
      thetaDeg: parseFloat(fTheta.value),
    };

    const data = calcularAmpacidadAerea(p);
    renderResultado(data, p, { tipo: selTipo.value, calibre: selCalibre.value, referencia: selReferencia.value });
  });

  function renderResultado(data, p, ctx) {
    const wrap = container.querySelector("#resultado-wrap");
    const i = data.intermedios;

    const reporte = [
      `Tipo: ${ctx.tipo}`,
      `Calibre: ${ctx.calibre}`,
      `Referencia: ${ctx.referencia}`,
      `Diámetro: ${fmt(p.diametroMm)} mm`,
      `Resistencia AC 25°C: ${fmt(p.rBajoOhmKm)} Ω/km`,
      `Resistencia AC 75°C: ${fmt(p.rAltoOhmKm)} Ω/km`,
      `Emisividad (ε): ${fmt(p.epsilon)}`,
      `Absortividad (α): ${fmt(p.alfa)}`,
      `Temperatura ambiente: ${fmt(p.taC)} °C`,
      `Temperatura máxima del conductor: ${fmt(p.tcC)} °C`,
      `Velocidad del viento: ${fmt(p.vwMs)} m/s`,
      `Ángulo viento-conductor: ${fmt(p.anguloVientoDeg)} °`,
      `Elevación sobre el nivel del mar: ${fmt(p.elevacionM)} m`,
      `Radiación solar total (Qse): ${fmt(p.qseWm2)} W/m²`,
      `Ángulo efectivo de incidencia solar (θ): ${fmt(p.thetaDeg)} °`,
      ``,
      `Qc (convección): ${fmt(i.qc)} W/m`,
      `Qr (radiación emitida): ${fmt(i.qr)} W/m`,
      `Qs (radiación solar absorbida): ${fmt(i.qs)} W/m`,
      `R (resistencia efectiva): ${fmt(i.r * 1000, 4)} Ω/km`,
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
