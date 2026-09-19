// Calculadora de capacidad de corriente de cortocircuito admisible (limite termico del conductor).
// La pantalla se divide en tarjetas: "Conductor" (red, material, calibre y area) y "Condiciones de la falla" (temperaturas y
// tiempo de despeje). Misma estructura que Perdidas, Regulacion y Ocupacion de ductos. El motor (../calc/cortocircuito.js) no
// se toca.

import { fmt, loadData, distinct, escapeHtml } from "../util/format.js";
import { icon } from "../icons.js";
import { calcularCortocircuito } from "../calc/cortocircuito.js";
import { LINEA_REPORTE, reporteHtml, tarjetaResultadosHtml, activarPestanas } from "../util/resultados-ui.js";
import { activarInfos } from "../util/info-campo.js";

// Ecuaciones (LaTeX) de la pestaña Fórmulas: las del motor, con las mismas unidades (mm², °C, s y kA).
const FORMULAS_TEX = [
  {
    titulo: "Capacidad de cortocircuito",
    ecuaciones: [String.raw`I_{CC} = \dfrac{A \cdot k_1}{1000}\,\sqrt{\dfrac{\log_{10}\!\left(\dfrac{T_2 + \lambda}{T_1 + \lambda}\right)}{t}} \quad [\mathrm{kA}]`],
  },
  {
    titulo: "Constantes del material",
    ecuaciones: [
      String.raw`\lambda = \begin{cases} 234 & \text{Cobre} \\ 228 & \text{Aluminio} \end{cases}`,
      String.raw`k_1 = \begin{cases} 341 & \text{Cobre} \\ 224 & \text{Aluminio} \end{cases}`,
    ],
  },
];

const FORMULAS_ETIQUETAS = [
  { tex: String.raw`I_{CC}`, texto: "Capacidad de corriente de cortocircuito [kA]" },
  { tex: "A", texto: "Área del conductor [mm²]" },
  { tex: "T_1", texto: "Temperatura de operación [°C]" },
  { tex: "T_2", texto: "Temperatura máxima admisible en falla [°C]" },
  { tex: "t", texto: "Tiempo de despeje de la falla [s]" },
  { tex: String.raw`\lambda`, texto: "Constante del material (temperatura de resistencia cero) [°C]" },
  { tex: "k_1", texto: "Constante del material" },
];

const FORMULAS_NOTA = `El logaritmo es en base 10.

En red aérea todos los tipos del catálogo (ACSR, AAAC, ACAR, AAC, ACSS) se calculan con las constantes del aluminio y con el área de aluminio del conductor.

Valores por defecto: temperatura de operación de 75 °C en red aérea y 90 °C en subterránea, y temperatura máxima en falla de 250 °C. Con «Manual» se pueden modificar.`;

// Texto plano de respaldo si KaTeX no se puede cargar.
const FORMULAS_TEXTO = `I_CC = A · k1 · √( log10((T2+λ)/(T1+λ)) / t ) / 1000     [kA]

  A  = área del conductor (mm²)
  T1 = temperatura de operación (°C)
  T2 = temperatura máxima admisible en falla (°C)
  t  = tiempo de despeje de la falla (s)
  λ  = 234 (Cobre) / 228 (Aluminio)
  k1 = 341 (Cobre) / 224 (Aluminio)

${FORMULAS_NOTA}`;

// Lineas del reporte que son etiquetas: van en negrita (el texto que se copia es el mismo).
const ETIQUETAS_REPORTE = ["CÁLCULO DE CORTOCIRCUITO", "PARÁMETROS DE ENTRADA:", "RESULTADOS:"];

export async function render(container) {
  const desnudos = await loadData("conductores-desnudos");
  const xlpe = await loadData("conductores-xlpe");

  container.innerHTML = `
    <div class="breadcrumb"><a href="#/">Inicio</a> <span>/</span> <a href="#/calculos">Cálculos</a> <span>/</span> <span>Cortocircuito</span></div>
    <h1 class="page-title">Capacidad de corriente de cortocircuito</h1>

    <form id="form-calc" novalidate>
      <div class="card tarjeta-borde form-section">
        <div class="form-section-title">${icon("plugConnected")} Conductor</div>
        <div class="grid-2">
          <div class="field">
            <label for="f-red">Tipo de red</label>
            <select id="f-red" required>
              <option value="Aereo">Aéreo</option>
              <option value="Subterraneo">Subterráneo</option>
            </select>
          </div>
          <div class="field">
            <label for="f-material" data-info="En red aérea se calcula con las constantes del aluminio, sea cual sea el tipo.">Material / Tipo de conductor</label>
            <select id="f-material" required></select>
          </div>
        </div>
        <div class="grid-2 ultima">
          <div class="field">
            <label for="f-calibre">Calibre</label>
            <select id="f-calibre" required disabled>
              <option value="">Seleccione un material primero</option>
            </select>
          </div>
          <div class="field">
            <label for="f-area" data-info="En conductores aéreos es el área de aluminio (sin el alma de acero).">Área del conductor (mm²)</label>
            <div class="input-with-toggle">
              <input type="number" id="f-area" min="0" max="10000" step="any" required disabled>
              <label class="checkbox-row"><input type="checkbox" id="chk-area"> Manual</label>
            </div>
          </div>
        </div>
      </div>

      <div class="card tarjeta-borde form-section">
        <div class="form-section-title">${icon("temperature")} Condiciones de la falla</div>
        <div class="grid-2">
          <div class="field">
            <label for="f-top" data-info="Por defecto: 75 °C en red aérea y 90 °C en subterránea.">Temperatura de operación (°C)</label>
            <div class="input-with-toggle">
              <input type="number" id="f-top" min="0" max="500" step="0.1" required disabled>
              <label class="checkbox-row"><input type="checkbox" id="chk-top"> Manual</label>
            </div>
          </div>
          <div class="field">
            <label for="f-tfalla">Temperatura máxima admisible en falla (°C)</label>
            <div class="input-with-toggle">
              <input type="number" id="f-tfalla" min="0" max="500" step="0.1" value="250" required disabled>
              <label class="checkbox-row"><input type="checkbox" id="chk-tfalla"> Manual</label>
            </div>
          </div>
        </div>
        <div class="grid-2 ultima">
          <div class="field">
            <label for="f-tiempo">Tiempo de despeje de la falla (s)</label>
            <input type="number" id="f-tiempo" min="0" max="60" step="0.1" value="0.3" required>
          </div>
        </div>
      </div>

      <div class="btn-row">
        <button type="submit" class="btn btn-primary">Calcular</button>
      </div>
    </form>

    <div id="resultado-wrap"></div>
  `;

  activarInfos(container);
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

  function reporteTexto(data, p, ctx) {
    // El reporte se copia y se pega: tres etiquetas (el calculo, los parametros de entrada y los resultados).
    // Parametros = lo que el usuario dio; resultados = todo lo que sale del calculo (incluidas las constantes del material).
    return [
      `CÁLCULO DE CORTOCIRCUITO`,
      ``,
      `PARÁMETROS DE ENTRADA:`,
      LINEA_REPORTE,
      `Tipo de red: ${ctx.red === "Aereo" ? "Aéreo" : "Subterráneo"}`,
      `Tipo/Material de conductor: ${ctx.tipoMaterial}`,
      `Calibre: ${ctx.calibre}`,
      `Área del conductor: ${fmt(p.areaMm2)} mm²`,
      `Temperatura de operación: ${fmt(p.tempOperacionC)} °C`,
      `Temperatura máxima admisible en falla: ${fmt(p.tempFallaC)} °C`,
      `Tiempo de despeje de la falla: ${fmt(p.tiempoS, 1)} s`,
      ``,
      `RESULTADOS:`,
      LINEA_REPORTE,
      `Material eléctrico usado en el cálculo: ${ctx.materialElectrico}`,
      `λ (constante material): ${fmt(data.intermedios.tempRes0, 0)}`,
      `k1 (constante material): ${fmt(data.intermedios.k1, 0)}`,
      `log10((T2+λ)/(T1+λ)): ${fmt(data.intermedios.logaritmo, 5)}`,
      ``,
      `Capacidad de cortocircuito: ${fmt(data.capacidadCcKa)} kA`,
    ].join("\n");
  }

  function renderResultado(data, p, ctx) {
    const wrap = container.querySelector("#resultado-wrap");

    const resultado = `
          <div class="result-panel">
            <div class="result-metric">
              <div class="value">${fmt(data.capacidadCcKa)}<span class="unit">kA</span></div>
              <div class="label">Capacidad de corriente de cortocircuito</div>
            </div>
          </div>`;

    wrap.innerHTML = tarjetaResultadosHtml({
      resultado,
      reporte: reporteHtml(reporteTexto(data, p, ctx), ETIQUETAS_REPORTE),
      formulasPlano: FORMULAS_TEXTO,
    });
    activarPestanas(wrap, { grupos: FORMULAS_TEX, etiquetas: FORMULAS_ETIQUETAS, nota: FORMULAS_NOTA });

    wrap.scrollIntoView({ behavior: "smooth", block: "nearest" });
  }
}
