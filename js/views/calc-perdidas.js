// Calculadora de perdidas de potencia por efecto Joule en una linea trifasica de uno o varios tramos.
// La pantalla se divide en tarjetas: "Datos de la linea" (con el dato de partida: potencia activa, aparente o
// corriente) y una tarjeta "Conductor" por cada tramo. La logica de varios tramos vive en ../calc/perdidas-tramos.js;
// el motor original (../calc/perdidas.js) se usa tal cual, tramo por tramo.

import { fmt, fmtPercent, loadData, distinct, escapeHtml } from "../util/format.js";
import { icon } from "../icons.js";
import { calcularPerdidas } from "../calc/perdidas.js";
import {
  potenciaActivaMw,
  calcularPerdidasTramos,
  clasificarPerdidas,
  sugerirCalibre,
  UMBRAL_OPTIMO_PCT,
  UMBRAL_ADECUADO_PCT,
} from "../calc/perdidas-tramos.js";
import { cargarKatex, ecuacionHtml } from "../util/katex.js";

// Ecuaciones (LaTeX) de la pestaña Fórmulas: replican lo que hace el motor, con las mismas unidades (MW, kV, Ω/km, km).
const FORMULAS_TEX = [
  {
    titulo: "Dato de partida (se convierte a potencia activa)",
    ecuaciones: [String.raw`P = S \cdot \cos\varphi \quad [\mathrm{MW}]`, String.raw`P = \dfrac{\sqrt{3}\,V\,I\,\cos\varphi}{1000} \quad [\mathrm{MW}]`],
  },
  {
    titulo: "Corriente y potencias",
    ecuaciones: [
      String.raw`I = \dfrac{P \cdot 1000}{\sqrt{3}\,V\,\cos\varphi} \quad [\mathrm{A}]`,
      String.raw`S = \dfrac{P}{\cos\varphi} \quad [\mathrm{MVA}]`,
      String.raw`Q = \sqrt{S^{2} - P^{2}} \quad [\mathrm{MVAR}]`,
    ],
  },
  {
    titulo: "Pérdidas",
    ecuaciones: [
      String.raw`F_p = 0.7\,F_c + 0.3`,
      String.raw`R_{ef} = \dfrac{R_{75}}{N} \quad [\Omega/\mathrm{km}]`,
      String.raw`\%P_i = \dfrac{\sqrt{3}\,I\,R_{ef,i}\,L_i\,F_p \cdot 100}{V \cdot 1000 \cdot \cos\varphi}`,
      String.raw`\%P_{total} = \sum_{i} \%P_i`,
      String.raw`P_{perd} = P \cdot \dfrac{\%P_{total}}{100} \quad [\mathrm{MW}]`,
    ],
  },
];

const FORMULAS_VARIABLES =
  "P: potencia activa [MW] · S: potencia aparente [MVA] · Q: potencia reactiva [MVAR] · V: tensión de línea [kV] · I: corriente [A] · " +
  "cos φ: factor de potencia · Fc: factor de carga · Fp: factor de pérdidas · R75: resistencia AC de un conductor a 75 °C [Ω/km] · " +
  "N: conductores por fase · Ref: resistencia efectiva del tramo · L: longitud del tramo [km]";

const FORMULAS_NOTA = `El circuito puede tener varios tramos (cada uno con su conductor y longitud): el % de pérdidas total es la suma del % de cada tramo, válido cuando la corriente es la misma en todo el circuito (sin cargas intermedias).

Nota de fidelidad: esta calculadora usa la forma LINEAL del factor de pérdidas (0.7·Fc + 0.3), replicando el comportamiento real de la aplicación original en producción — no la forma cuadrática clásica de Buller-Woodrow (0.7·Fc² + 0.3·Fc) que aparecía documentada en su panel de fórmulas. Es una decisión de fidelidad confirmada intencionalmente al migrar.`;

// Texto plano de respaldo si KaTeX no se puede cargar.
const FORMULAS_TEXTO = `I = (P·1000) / (√3·V·cos φ)               [A]
S = P / cos φ                              [MVA]
Q = √(S² − P²)                             [MVAR]

Fp = 0.7·Fc + 0.3                          (factor de pérdidas, forma lineal)
Ref = R75 / N                              [Ω/km]
% Pérdidas del tramo = (√3·I·Ref·L·Fp·100) / (V·1000·cos φ)
% Pérdidas total = suma del % de cada tramo
Pérdidas = P · %total / 100                [MW]

Dato de partida: P = S·cos φ   |   P = √3·V·I·cos φ / 1000

${FORMULAS_NOTA}`;

const MODOS = {
  potencia: "Potencia activa",
  aparente: "Potencia aparente",
  corriente: "Corriente",
};

export async function render(container) {
  const desnudos = await loadData("conductores-desnudos");
  const xlpe = await loadData("conductores-xlpe");

  container.innerHTML = `
    <div class="breadcrumb"><a href="#/">Inicio</a> <span>/</span> <a href="#/calculos">Cálculos</a> <span>/</span> <span>Pérdidas</span></div>
    <h1 class="page-title">Pérdidas de potencia</h1>

    <form id="form-calc" novalidate>
      <div class="card tarjeta-borde form-section">
        <div class="form-section-title">${icon("circuitVoltmeter")} Datos de la línea</div>
        <div class="grid-2">
          <div class="field">
            <label for="f-tension">Tensión de línea (kV)</label>
            <input type="number" id="f-tension" min="0" step="0.01" value="34.5" required>
          </div>
          <div class="field">
            <label for="f-modo">Dato de partida</label>
            <select id="f-modo">
              <option value="potencia">${MODOS.potencia}</option>
              <option value="aparente">${MODOS.aparente}</option>
              <option value="corriente">${MODOS.corriente}</option>
            </select>
          </div>
        </div>

        <div class="field" id="wrap-potencia">
          <label for="f-potencia">Potencia activa (MW)</label>
          <input type="number" id="f-potencia" min="0" step="0.01" value="19.9" required>
        </div>
        <div class="field" id="wrap-aparente" hidden>
          <label for="f-aparente">Potencia aparente (MVA)</label>
          <input type="number" id="f-aparente" min="0" step="0.01" value="22.11">
        </div>
        <div class="field" id="wrap-corriente" hidden>
          <label for="f-corriente">Corriente (A)</label>
          <input type="number" id="f-corriente" min="0" step="0.1" value="370">
        </div>

        <div class="grid-2 ultima">
          <div class="field">
            <label for="f-fp">Factor de potencia</label>
            <input type="number" id="f-fp" min="0" max="1" step="0.01" value="0.9" required>
          </div>
          <div class="field">
            <label for="f-fc">Factor de carga (Fc)</label>
            <input type="number" id="f-fc" min="0" max="1" step="0.0001" value="0.564" required>
            <span class="hint">Circuitos de uso: 1 · Granjas solares: 0.564</span>
          </div>
        </div>
      </div>

      <div id="tramos-container"></div>

      <div class="btn-row">
        <button type="submit" class="btn btn-primary">Calcular</button>
      </div>
    </form>

    <div id="resultado-wrap"></div>
  `;

  const form = container.querySelector("#form-calc");
  const fTension = container.querySelector("#f-tension");
  const selModo = container.querySelector("#f-modo");
  const fPotencia = container.querySelector("#f-potencia");
  const fAparente = container.querySelector("#f-aparente");
  const fCorriente = container.querySelector("#f-corriente");
  const fFp = container.querySelector("#f-fp");
  const fFc = container.querySelector("#f-fc");
  const campoPorModo = {
    potencia: { wrap: container.querySelector("#wrap-potencia"), input: fPotencia },
    aparente: { wrap: container.querySelector("#wrap-aparente"), input: fAparente },
    corriente: { wrap: container.querySelector("#wrap-corriente"), input: fCorriente },
  };

  // Solo se muestra (y se exige) el campo del dato de partida elegido.
  function aplicarModo() {
    for (const [modo, { wrap, input }] of Object.entries(campoPorModo)) {
      const activo = modo === selModo.value;
      wrap.hidden = !activo;
      input.required = activo;
    }
  }
  selModo.addEventListener("change", aplicarModo);
  aplicarModo();

  // ---------- tramos ----------
  const datasetDe = (red) => (red === "Aerea" ? desnudos : xlpe);
  const campoMaterialDe = (red) => (red === "Aerea" ? "tipo" : "material_conductor");

  /** Tarjeta de un tramo: cada tarjeta guarda su propio estado en el DOM, asi agregar o quitar otro tramo no lo pierde. */
  function crearTramo(id) {
    const cont = document.createElement("div");
    cont.innerHTML = `
      <div class="card tarjeta-borde form-section tramo-block">
        <div class="form-section-title">
          ${icon("plugConnected")} <span class="tramo-titulo">Conductor — Tramo 1</span>
          <button type="button" class="btn btn-ghost btn-tramo-quitar" hidden>${icon("close")} Quitar</button>
        </div>
        <div class="grid-2">
          <div class="field">
            <label for="f-red-${id}">Tipo de red</label>
            <select id="f-red-${id}" required>
              <option value="Aerea">Aérea</option>
              <option value="Subterranea">Subterránea</option>
            </select>
          </div>
          <div class="field">
            <label for="f-material-${id}">Material / Tipo de conductor</label>
            <select id="f-material-${id}" required></select>
          </div>
        </div>
        <div class="grid-2">
          <div class="field">
            <label for="f-calibre-${id}">Calibre</label>
            <select id="f-calibre-${id}" required disabled>
              <option value="">Seleccione un material primero</option>
            </select>
          </div>
          <div class="field">
            <label for="f-resistencia-${id}">Resistencia AC a 75°C (Ω/km)</label>
            <div class="input-with-toggle">
              <input type="number" id="f-resistencia-${id}" min="0" max="10000" step="0.01" required disabled>
              <label class="checkbox-row"><input type="checkbox" id="chk-resistencia-${id}"> Manual</label>
            </div>
          </div>
        </div>
        <div class="grid-2 ultima">
          <div class="field">
            <label for="f-longitud-${id}">Longitud del tramo (km)</label>
            <input type="number" id="f-longitud-${id}" min="0" step="0.01" value="10" required>
          </div>
          <div class="field">
            <label for="f-n-${id}">Conductores por fase</label>
            <input type="number" id="f-n-${id}" min="1" max="8" step="1" value="1" required>
            <span class="hint">Resistencia efectiva: R conductor / # conductores por fase.</span>
          </div>
        </div>
      </div>`;
    const card = cont.firstElementChild;
    const q = (s) => card.querySelector(s);
    const selRed = q(`#f-red-${id}`);
    const selMaterial = q(`#f-material-${id}`);
    const selCalibre = q(`#f-calibre-${id}`);
    const fResistencia = q(`#f-resistencia-${id}`);
    const chkResistencia = q(`#chk-resistencia-${id}`);
    const fLongitud = q(`#f-longitud-${id}`);
    const fN = q(`#f-n-${id}`);

    let fila = null;

    function poblarMaterial() {
      const opciones = distinct(datasetDe(selRed.value), campoMaterialDe(selRed.value));
      selMaterial.innerHTML = opciones.map((o) => `<option value="${escapeHtml(o)}">${escapeHtml(o)}</option>`).join("");
      poblarCalibre();
    }

    function poblarCalibre() {
      const calibres = distinct(datasetDe(selRed.value).filter((c) => c[campoMaterialDe(selRed.value)] === selMaterial.value), "calibre_awg_kcmil");
      selCalibre.innerHTML = calibres.length
        ? `<option value="">Seleccione…</option>` + calibres.map((c) => `<option value="${escapeHtml(c)}">${escapeHtml(c)}</option>`).join("")
        : `<option value="">Sin calibres disponibles</option>`;
      selCalibre.disabled = !calibres.length;
      fila = null;
      syncResistencia();
    }

    function resolverFila() {
      if (!selCalibre.value) return null;
      return datasetDe(selRed.value).find((c) => c[campoMaterialDe(selRed.value)] === selMaterial.value && c.calibre_awg_kcmil === selCalibre.value) || null;
    }

    function syncResistencia() {
      if (!chkResistencia.checked) fResistencia.value = fila ? fila.r_ac_75c_ohm_km : "";
    }

    selRed.addEventListener("change", poblarMaterial);
    selMaterial.addEventListener("change", poblarCalibre);
    selCalibre.addEventListener("change", () => {
      fila = resolverFila();
      syncResistencia();
    });
    chkResistencia.addEventListener("change", () => {
      fResistencia.disabled = !chkResistencia.checked;
      if (!chkResistencia.checked) syncResistencia();
    });
    poblarMaterial();

    return {
      card,
      titulo: q(".tramo-titulo"),
      quitar: q(".btn-tramo-quitar"),
      /** Lo que el usuario dejo elegido en esta tarjeta. */
      estado: () => ({
        red: selRed.value,
        material: selMaterial.value,
        calibre: selCalibre.value,
        longitudKm: parseFloat(fLongitud.value),
        resistenciaOhmKm: parseFloat(fResistencia.value),
        numConductoresPorFase: parseInt(fN.value, 10) || 1,
      }),
    };
  }

  const tramosCont = container.querySelector("#tramos-container");
  const tramos = [];
  let siguienteId = 0;

  const filaAgregar = document.createElement("div");
  filaAgregar.className = "btn-row fila-agregar";
  filaAgregar.innerHTML = `<button type="button" class="btn btn-agregar-tramo">${icon("plus")} Agregar tramo</button>`;
  filaAgregar.querySelector("button").addEventListener("click", () => agregarTramo());

  /** Numera las tarjetas, muestra "Quitar" solo si hay mas de un tramo y deja "Agregar" en la ultima. */
  function actualizarTramos() {
    tramos.forEach((t, i) => {
      t.titulo.textContent = `Conductor — Tramo ${i + 1}`;
      t.quitar.hidden = tramos.length < 2;
    });
    tramos.at(-1).card.append(filaAgregar);
  }

  function agregarTramo() {
    const t = crearTramo(siguienteId++);
    t.quitar.addEventListener("click", () => {
      tramos.splice(tramos.indexOf(t), 1);
      t.card.remove();
      actualizarTramos();
    });
    tramos.push(t);
    tramosCont.append(t.card);
    actualizarTramos();
  }
  agregarTramo();

  // ---------- calculo ----------
  form.addEventListener("submit", (e) => {
    e.preventDefault();
    if (!form.reportValidity()) return;

    const tensionLineaKv = parseFloat(fTension.value);
    const factorPotencia = parseFloat(fFp.value);
    const modo = selModo.value;
    const datoPartida = parseFloat(campoPorModo[modo].input.value);
    const base = {
      tensionLineaKv,
      potenciaActivaMw: potenciaActivaMw({
        modo,
        potenciaMw: parseFloat(fPotencia.value),
        potenciaMva: parseFloat(fAparente.value),
        corrienteA: parseFloat(fCorriente.value),
        tensionKv: tensionLineaKv,
        factorPotencia,
      }),
      factorPotencia,
      factorCarga: parseFloat(fFc.value),
    };
    const estados = tramos.map((t) => t.estado());
    renderResultado(calcularPerdidasTramos(base, estados), base, estados, { modo, datoPartida });
  });

  /** Calibres del mismo material que el tramo, con las pérdidas que tendria cada uno (un calibre = su primera referencia). */
  function candidatosCalibre(base, estado) {
    const aerea = estado.red === "Aerea";
    const campoMaterial = campoMaterialDe(estado.red);
    const campoArea = aerea ? "area_seccion_aluminio_mm2" : "area_conductor_mm2";
    const vistos = new Set();
    return datasetDe(estado.red)
      .filter((f) => {
        if (f[campoMaterial] !== estado.material || !f.calibre_awg_kcmil || f.r_ac_75c_ohm_km == null || f[campoArea] == null) return false;
        if (vistos.has(f.calibre_awg_kcmil)) return false;
        vistos.add(f.calibre_awg_kcmil);
        return true;
      })
      .map((f) => ({
        calibre: f.calibre_awg_kcmil,
        area: f[campoArea],
        perdidasPct: calcularPerdidas({ ...base, resistenciaOhmKm: f.r_ac_75c_ohm_km / estado.numConductoresPorFase, longitudKm: estado.longitudKm }).perdidasPct,
      }))
      .sort((a, b) => a.area - b.area);
  }

  function comparacionCalibresHtml(base, estado) {
    const candidatos = candidatosCalibre(base, estado);
    if (!candidatos.length) return "";
    const { sugerido, menor, ventana } = sugerirCalibre(candidatos, UMBRAL_ADECUADO_PCT, 3, estado.calibre);
    const mensaje = sugerido
      ? `Calibre más pequeño con pérdidas de ${fmtPercent(UMBRAL_ADECUADO_PCT, 0)} o menos: <strong>${escapeHtml(sugerido.calibre)}</strong> (${fmt(sugerido.area)} mm²).`
      : `Ningún calibre del catálogo baja de ${fmtPercent(UMBRAL_ADECUADO_PCT, 0)} de pérdidas con estos datos; el de menores pérdidas es <strong>${escapeHtml(menor.calibre)}</strong>.`;
    const filas = ventana
      .map((c) => {
        const clases = [c.calibre === sugerido?.calibre ? "match-row" : "", c.calibre === estado.calibre ? "current-row" : ""].filter(Boolean).join(" ");
        const actual = c.calibre === estado.calibre ? ' <span class="badge">Actual</span>' : "";
        return `<tr class="${clases}"><td>${escapeHtml(c.calibre)}${actual}</td><td class="num">${fmt(c.area)}</td><td class="num">${fmtPercent(c.perdidasPct)}</td></tr>`;
      })
      .join("");
    return `
      <div class="result-subhead">Comparación con otros calibres</div>
      <p class="text-muted text-sm" style="margin: 0 0 var(--space-3);">${mensaje}</p>
      <div class="table-wrap tabla-perdidas"><table>
        <thead><tr><th>Calibre</th><th class="num">Área (mm²)</th><th class="num">% pérdidas</th></tr></thead>
        <tbody>${filas}</tbody>
      </table></div>`;
  }

  const nombreRed = (red) => (red === "Aerea" ? "Aérea" : "Subterránea");
  const conductorTexto = (e) => `${nombreRed(e.red)} · ${e.material} ${e.calibre}${e.numConductoresPorFase > 1 ? ` ×${e.numConductoresPorFase}` : ""}`;

  function tablaTramosHtml(r, estados) {
    const filas = r.tramos
      .map((t, i) => {
        const e = estados[i];
        return `<tr><td>Tramo ${t.numero}</td><td class="wrap">${escapeHtml(conductorTexto(e))}</td><td class="num">${fmt(e.longitudKm)}</td><td class="num">${fmtPercent(t.perdidasPct)}</td><td class="num">${fmt(t.perdidasMw, 3)}</td></tr>`;
      })
      .join("");
    return `
      <div class="result-subhead">Pérdidas por tramo</div>
      <div class="table-wrap tabla-perdidas"><table>
        <thead><tr><th>Tramo</th><th>Conductor</th><th class="num">Longitud (km)</th><th class="num">% pérdidas</th><th class="num">Pérdidas (MW)</th></tr></thead>
        <tbody>${filas}<tr class="total-row"><td colspan="3">Total</td><td class="num">${fmtPercent(r.perdidasPct)}</td><td class="num">${fmt(r.perdidasMw, 3)}</td></tr></tbody>
      </table></div>`;
  }

  function reporteTexto(r, base, estados, { modo, datoPartida }) {
    const unidadDato = { potencia: "MW", aparente: "MVA", corriente: "A" }[modo];
    const lineasTramos = r.tramos.map((t, i) => {
      const e = estados[i];
      return [
        ``,
        `Tramo ${t.numero}:`,
        `  Tipo de red: ${nombreRed(e.red)}`,
        `  Material/Tipo de conductor: ${e.material}`,
        `  Calibre: ${e.calibre}`,
        `  Resistencia AC a 75°C (por conductor): ${fmt(e.resistenciaOhmKm)} Ω/km`,
        `  Conductores por fase: ${e.numConductoresPorFase}`,
        `  Resistencia efectiva (R/N): ${fmt(t.resistenciaEfectivaOhmKm)} Ω/km`,
        `  Longitud del tramo: ${fmt(e.longitudKm)} km`,
        `  Porcentaje de pérdidas del tramo: ${fmtPercent(t.perdidasPct)}`,
        `  Pérdidas del tramo: ${fmt(t.perdidasMw, 3)} MW`,
      ].join("\n");
    });
    return [
      `Tensión de línea: ${fmt(base.tensionLineaKv)} kV`,
      `Dato de partida: ${MODOS[modo]} (${fmt(datoPartida)} ${unidadDato})`,
      `Potencia activa: ${fmt(base.potenciaActivaMw)} MW`,
      `Factor de potencia: ${fmt(base.factorPotencia)}`,
      `Factor de carga (Fc): ${fmt(base.factorCarga, 4)}`,
      ``,
      `Factor de pérdidas (Fp = 0.7·Fc + 0.3): ${fmt(r.factorPerdidas, 4)}`,
      ...lineasTramos,
      ``,
      `Corriente: ${fmt(r.corriente)} A`,
      `Potencia aparente: ${fmt(r.potenciaS)} MVA`,
      `Potencia reactiva: ${fmt(r.potenciaQ)} MVAR`,
      `Porcentaje de pérdidas${r.tramos.length > 1 ? " total" : ""}: ${fmtPercent(r.perdidasPct)}`,
      `Pérdidas de potencia: ${fmt(r.perdidasMw, 3)} MW`,
    ].join("\n");
  }

  function renderResultado(r, base, estados, dato) {
    const wrap = container.querySelector("#resultado-wrap");
    const clase = Number.isFinite(r.perdidasPct) ? clasificarPerdidas(r.perdidasPct) : null; // sin etiqueta si los datos no dan un numero
    const varios = r.tramos.length > 1;

    wrap.innerHTML = `
      <div class="card tarjeta-borde">
        <div class="tabs">
          <button type="button" class="tab-btn active" data-tab="resultado">Resultado</button>
          <button type="button" class="tab-btn" data-tab="reporte">Reporte</button>
          <button type="button" class="tab-btn" data-tab="formulas">Fórmulas</button>
        </div>
        <div class="tab-panel" data-panel="resultado">
          <div class="result-panel">
            <div class="grid-2">
              <div class="result-metric">
                <div class="value">${fmt(base.potenciaActivaMw)}<span class="unit">MW</span></div>
                <div class="label">Potencia activa</div>
              </div>
              <div class="result-metric">
                <div class="value">${fmt(r.potenciaS)}<span class="unit">MVA</span></div>
                <div class="label">Potencia aparente</div>
              </div>
              <div class="result-metric">
                <div class="value">${fmt(r.potenciaQ)}<span class="unit">MVAR</span></div>
                <div class="label">Potencia reactiva</div>
              </div>
              <div class="result-metric">
                <div class="value">${fmt(r.corriente)}<span class="unit">A</span></div>
                <div class="label">Corriente</div>
              </div>
              <div class="result-metric">
                <div class="value">${fmtPercent(r.perdidasPct)}</div>
                <div class="label">Porcentaje de pérdidas${varios ? " total" : ""}${clase ? ` <span class="badge ${clase.clase}">${clase.etiqueta}</span>` : ""}</div>
              </div>
              <div class="result-metric">
                <div class="value">${fmt(r.perdidasMw, 3)}<span class="unit">MW</span></div>
                <div class="label">Pérdidas de potencia</div>
              </div>
            </div>
            <p class="text-muted text-sm" style="margin: var(--space-3) 0 0;">Referencias de diseño (no son un límite normativo): hasta ${UMBRAL_OPTIMO_PCT}% óptimo · hasta ${UMBRAL_ADECUADO_PCT}% adecuado.</p>
            ${varios ? tablaTramosHtml(r, estados) : comparacionCalibresHtml(base, estados[0])}
          </div>
        </div>
        <div class="tab-panel" data-panel="reporte" hidden>
          <div class="report-block">${escapeHtml(reporteTexto(r, base, estados, dato))}</div>
        </div>
        <div class="tab-panel" data-panel="formulas" hidden>
          <div id="formulas-katex" class="formula-caja" hidden></div>
          <div class="formula-block" id="formulas-plano">${escapeHtml(FORMULAS_TEXTO)}</div>
        </div>
      </div>
    `;

    let formulasListas = false;
    async function mostrarFormulas() {
      if (formulasListas) return;
      formulasListas = true;
      try {
        const katex = await cargarKatex();
        const caja = wrap.querySelector("#formulas-katex");
        caja.innerHTML =
          FORMULAS_TEX.map(
            (g) => `<div class="result-subhead">${escapeHtml(g.titulo)}</div>` + g.ecuaciones.map((tex) => `<div class="formula-katex">${ecuacionHtml(katex, tex)}</div>`).join("")
          ).join("") +
          `<p class="text-muted text-sm formula-vars">${escapeHtml(FORMULAS_VARIABLES)}</p><p class="text-muted text-sm formula-vars">${escapeHtml(FORMULAS_NOTA)}</p>`;
        caja.hidden = false; // la caja (subtarjeta) solo aparece cuando ya hay fórmulas dibujadas; mientras tanto se ve el texto plano
        wrap.querySelector("#formulas-plano").hidden = true;
      } catch {
        formulasListas = false; // sin KaTeX se queda el texto plano; se reintenta la proxima vez que se abra la pestaña
      }
    }

    wrap.querySelectorAll(".tab-btn").forEach((btn) => {
      btn.addEventListener("click", () => {
        wrap.querySelectorAll(".tab-btn").forEach((b) => b.classList.toggle("active", b === btn));
        wrap.querySelectorAll(".tab-panel").forEach((panel) => {
          panel.hidden = panel.dataset.panel !== btn.dataset.tab;
        });
        if (btn.dataset.tab === "formulas") mostrarFormulas();
      });
    });

    wrap.scrollIntoView({ behavior: "smooth", block: "nearest" });
  }
}
