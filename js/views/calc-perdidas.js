// Calculadora de perdidas de potencia por efecto Joule en una linea trifasica.

import { fmt, fmtPercent, loadData, distinct, escapeHtml } from "../util/format.js";
import { calcularPerdidas } from "../calc/perdidas.js";

const FORMULAS_HTML = `I = (P·1000) / (V·cos φ·√3)              [A]
S = P / cos φ                             [MVA]
Q = √(S² − P²)                            [MVAR]

Fp = 0.7·Fc + 0.3                         (factor de pérdidas, forma lineal)

% Pérdidas = (√3·I·R·L·Fp·100) / (V·1000·cos φ)

Nota de fidelidad: esta calculadora usa la forma LINEAL del factor de
pérdidas (0.7·Fc + 0.3), replicando el comportamiento real de la aplicación
original en producción — no la forma cuadrática clásica de Buller-Woodrow
(0.7·Fc² + 0.3·Fc) que aparecía documentada en su panel de fórmulas. Es una
decisión de fidelidad confirmada intencionalmente al migrar.`;

export async function render(container) {
  const desnudos = await loadData("conductores-desnudos");
  const xlpe = await loadData("conductores-xlpe");

  container.innerHTML = `
    <div class="breadcrumb"><a href="#/calculos">Cálculos</a> <span>/</span> <span>Pérdidas</span></div>
    <h1 class="page-title">Pérdidas de potencia</h1>
    <p class="page-subtitle">Corriente, potencia y porcentaje de pérdidas de una línea trifásica, ajustado por factor de carga.</p>

    <form class="card" id="form-calc" novalidate>
      <div class="grid-2">
        <div class="field">
          <label for="f-tension">Tensión de línea (kV)</label>
          <input type="number" id="f-tension" min="0" step="0.01" value="34.5" required>
        </div>
        <div class="field">
          <label for="f-potencia">Potencia activa (MW)</label>
          <input type="number" id="f-potencia" min="0" step="0.01" value="19.9" required>
        </div>
      </div>

      <div class="field">
        <label for="f-fp">Factor de potencia</label>
        <input type="number" id="f-fp" min="0" max="1" step="0.01" value="0.9" required>
        <span class="hint">Si solo conoces la potencia aparente (MVA), ingrésala aquí y usa factor de potencia = 1.</span>
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

      <div class="field">
        <label for="f-resistencia">Resistencia AC a 75°C (Ω/km)</label>
        <input type="number" id="f-resistencia" min="0" max="10000" step="0.01" required disabled>
        <label class="checkbox-row"><input type="checkbox" id="chk-resistencia"> Modificar manualmente</label>
      </div>

      <div class="field">
        <label for="f-longitud">Longitud de la línea (km)</label>
        <input type="number" id="f-longitud" min="0" step="0.01" value="10" required>
      </div>

      <div class="field">
        <label for="f-fc">Factor de carga (Fc)</label>
        <input type="number" id="f-fc" min="0" max="1" step="0.0001" value="0.564" required>
        <span class="hint">Circuitos de uso: 1 · Granjas solares: 0.564</span>
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
  const selRed = container.querySelector("#f-red");
  const selMaterial = container.querySelector("#f-material");
  const selCalibre = container.querySelector("#f-calibre");
  const fResistencia = container.querySelector("#f-resistencia");
  const chkResistencia = container.querySelector("#chk-resistencia");
  const fLongitud = container.querySelector("#f-longitud");
  const fFc = container.querySelector("#f-fc");

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

  poblarMaterial();

  form.addEventListener("submit", (e) => {
    e.preventDefault();
    if (!form.reportValidity()) return;

    const p = {
      tensionLineaKv: parseFloat(fTension.value),
      potenciaActivaMw: parseFloat(fPotencia.value),
      factorPotencia: parseFloat(fFp.value),
      resistenciaOhmKm: parseFloat(fResistencia.value),
      longitudKm: parseFloat(fLongitud.value),
      factorCarga: parseFloat(fFc.value),
    };

    const data = calcularPerdidas(p);
    renderResultado(data, p, { red: selRed.value, material: selMaterial.value, calibre: selCalibre.value });
  });

  function renderResultado(data, p, ctx) {
    const wrap = container.querySelector("#resultado-wrap");

    const reporte = [
      `Tensión de línea: ${fmt(p.tensionLineaKv)} kV`,
      `Potencia activa: ${fmt(p.potenciaActivaMw)} MW`,
      `Factor de potencia: ${fmt(p.factorPotencia)}`,
      `Tipo de red: ${ctx.red === "Aerea" ? "Aérea" : "Subterránea"}`,
      `Material/Tipo de conductor: ${ctx.material}`,
      `Calibre: ${ctx.calibre}`,
      `Resistencia AC a 75°C: ${fmt(p.resistenciaOhmKm)} Ω/km`,
      `Longitud de la línea: ${fmt(p.longitudKm)} km`,
      `Factor de carga (Fc): ${fmt(p.factorCarga, 4)}`,
      ``,
      `Factor de pérdidas (Fp = 0.7·Fc + 0.3): ${fmt(data.intermedios.factorPerdidas, 4)}`,
      ``,
      `Corriente: ${fmt(data.corriente)} A`,
      `Potencia aparente: ${fmt(data.potenciaS)} MVA`,
      `Potencia reactiva: ${fmt(data.potenciaQ)} MVAR`,
      `Porcentaje de pérdidas: ${fmtPercent(data.perdidasPct)}`,
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
                <div class="value">${fmtPercent(data.perdidasPct)}</div>
                <div class="label">Porcentaje de pérdidas</div>
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
