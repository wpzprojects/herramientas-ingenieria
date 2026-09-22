// Calculadora de ampacidad de cables subterraneos en banco de ductos (IEC 60287-1-1).
// La pantalla se divide en tarjetas: "Cable" (construccion, pantalla y puesta a tierra), "Condiciones de operacion" (tension,
// frecuencia y temperaturas) e "Instalacion" (suelo, ducto y banco de ductos). Misma estructura que las demas calculadoras.
// El motor (../calc/ampacidad-subterranea.js) no se toca; la corriente circulante / tension inducida en la pantalla se calcula
// aparte (../calc/ampacidad-subterranea-pantalla.js).

import { fmt, loadData, distinct, escapeHtml } from "../util/format.js";
import { icon } from "../icons.js";
import { calcularAmpacidadSubterranea } from "../calc/ampacidad-subterranea.js";
import { calcularPantalla } from "../calc/ampacidad-subterranea-pantalla.js";
import { LINEA_REPORTE, reporteHtml, tarjetaResultadosHtml, activarPestanas } from "../util/resultados-ui.js";
import { activarInfos } from "../util/info-campo.js";
import { activarPlegables } from "../util/tarjetas-plegables.js";

const ORDEN_CALIBRES = ["1/0 AWG", "2/0 AWG", "3/0 AWG", "4/0 AWG", "250 kcmil", "350 kcmil", "500 kcmil", "750 kcmil", "1000 kcmil"];

// Ecuaciones (LaTeX) de la pestaña Fórmulas: las del motor, con las mismas unidades (m, °C, Ω/m, W/m y K·m/W).
const FORMULAS_TEX = [
  {
    titulo: "Ampacidad (IEC 60287-1-1)",
    ecuaciones: [
      String.raw`I = \sqrt{\dfrac{\Delta\theta - W_d\left(0.5\,T_1 + n\,(T_2 + T_3 + T_4)\right)}{R\,T_1 + n\,R\,(1 + \lambda_1)\,(T_2 + T_3 + T_4)}} \quad [\mathrm{A}]`,
      String.raw`\Delta\theta = \theta_c - \theta_s \quad [^{\circ}\mathrm{C}]`,
      String.raw`n = \begin{cases} 3 & \text{cable monopolar} \\ 1 & \text{cable tripolar} \end{cases}`,
    ],
  },
  {
    titulo: "Resistencia AC del conductor (efecto piel y proximidad)",
    ecuaciones: [
      String.raw`R' = R_0\,\left[1 + \alpha_{20}\,(\theta_c - 20)\right] \quad [\Omega/\mathrm{m}]`,
      String.raw`x^{2} = \dfrac{8\pi f}{R'} \times 10^{-7}`,
      String.raw`y_s = \dfrac{x^{4}}{192 + 0.8\,x^{4}}`,
      String.raw`y_p = y_s \left(\dfrac{d_c}{s}\right)^{2}\left[0.312\left(\dfrac{d_c}{s}\right)^{2} + \dfrac{1.18}{y_s + 0.27}\right] \quad (y_p = 0 \text{ en cable tripolar})`,
      String.raw`R = R'\,\left(1 + y_s + y_p\right) \quad [\Omega/\mathrm{m}]`,
    ],
  },
  {
    titulo: "Pérdida dieléctrica",
    ecuaciones: [
      String.raw`C = \dfrac{\varepsilon_r \times 10^{-9}}{18\,\ln\left(D_s / d_c\right)} \quad [\mathrm{F/m}]`,
      String.raw`U_0 = \dfrac{1000\,V}{\sqrt{3}} \quad [\mathrm{V}]`,
      String.raw`W_d = 2\pi f\,C\,U_0^{2}\,\tan\delta \quad [\mathrm{W/m}]`,
    ],
  },
  {
    titulo: "Pérdidas en la pantalla (λ1)",
    ecuaciones: [
      String.raw`R_s = \dfrac{1.7241 \times 10^{-8}}{t_c\,(0.88\,\pi\,D_s)} \quad [\Omega/\mathrm{m}] \quad (\text{pantalla de cinta})`,
      String.raw`R_{s,op} = R_s\,\left[1 + \alpha_{20}\,(\theta_c - 20)\right] \quad [\Omega/\mathrm{m}]`,
      String.raw`X_m = 4\pi f \times 10^{-7}\,\ln\left(\dfrac{2\,s}{D_s}\right) \quad [\Omega/\mathrm{m}]`,
      String.raw`\lambda_1 = \begin{cases} \dfrac{R_{s,op}}{R}\cdot\dfrac{1}{1 + \left(R_{s,op}/X_m\right)^{2}} + 0.01 & \text{monopolar, ambos extremos} \\[2ex] 0.02 & \text{tripolar, unipuntual o cross-bonding} \end{cases}`,
    ],
  },
  {
    titulo: "Resistencias térmicas del cable",
    ecuaciones: [
      String.raw`T_1 = \dfrac{\rho_1}{2\pi}\,\ln\left(1 + \dfrac{2\,t_1}{d_c}\right) \quad [\mathrm{K\cdot m/W}]`,
      String.raw`T_2 = \dfrac{\rho_2}{2\pi}\,\ln\left(1 + \dfrac{2\,t_2}{D_s}\right) \quad [\mathrm{K\cdot m/W}]`,
      String.raw`T_3 = \dfrac{\rho_3}{2\pi}\,\ln\left(1 + \dfrac{2\,t_3}{D_e}\right) \quad [\mathrm{K\cdot m/W}]`,
    ],
  },
  {
    titulo: "Resistencia térmica externa (ducto y suelo, método de imágenes de Kennelly)",
    ecuaciones: [
      String.raw`T_{4p} = T_d + \dfrac{\rho_s}{2\pi}\,\ln\left(\dfrac{4L}{D_e}\right) \quad [\mathrm{K\cdot m/W}]`,
      String.raw`T_{4m} = \sum_{j}\dfrac{\rho_s}{2\pi}\,\ln\left(\dfrac{\sqrt{x_j^{2} + (L_j + L)^{2}}}{\sqrt{x_j^{2} + (L_j - L)^{2}}}\right) \quad [\mathrm{K\cdot m/W}]`,
      String.raw`T_4 = T_{4p} + T_{4m} \quad [\mathrm{K\cdot m/W}]`,
    ],
  },
  {
    titulo: "Pantalla del cable monopolar (con la ampacidad ya calculada)",
    ecuaciones: [
      String.raw`I_{pant} = I\,\dfrac{X_m}{\sqrt{R_{s,op}^{2} + X_m^{2}}} \quad [\mathrm{A}] \quad (\text{pantallas a tierra en ambos extremos})`,
      String.raw`V_{ind} = 1000\,I\,X_m \quad [\mathrm{V/km}] \quad (\text{unipuntual o cross-bonding, circuito abierto})`,
    ],
  },
];

// Descripcion de las etiquetas (simbolos) de las ecuaciones, en el orden en que aparecen; el simbolo se dibuja con KaTeX igual que en ellas.
const FORMULAS_ETIQUETAS = [
  { tex: "I", texto: "Ampacidad (corriente admisible) [A]" },
  { tex: String.raw`\Delta\theta`, texto: "Salto térmico admisible entre el conductor y el terreno [°C]" },
  { tex: String.raw`\theta_c`, texto: "Temperatura máxima del conductor [°C]" },
  { tex: String.raw`\theta_s`, texto: "Temperatura del terreno [°C]" },
  { tex: "n", texto: "Número de conductores del cable (3 monopolar, 1 tripolar)" },
  { tex: "R", texto: "Resistencia AC efectiva del conductor [Ω/m]" },
  { tex: "R'", texto: "Resistencia AC a la temperatura máxima, sin efecto piel ni proximidad [Ω/m]" },
  { tex: "R_0", texto: "Resistencia del conductor a 20 °C [Ω/m]" },
  { tex: String.raw`\alpha_{20}`, texto: "Coeficiente de temperatura del material a 20 °C" },
  { tex: "f", texto: "Frecuencia [Hz]" },
  { tex: "x", texto: "Variable auxiliar de los efectos piel y proximidad" },
  { tex: "y_s,\\,y_p", texto: "Factores de efecto piel y de efecto de proximidad" },
  { tex: "d_c", texto: "Diámetro del conductor [m]" },
  { tex: "s", texto: "Separación entre fases [m]" },
  { tex: String.raw`\varepsilon_r,\,\tan\delta`, texto: "Permitividad relativa y factor de pérdidas del aislamiento" },
  { tex: "D_s", texto: "Diámetro sobre el aislamiento [m]" },
  { tex: "C", texto: "Capacitancia del cable [F/m]" },
  { tex: "V", texto: "Tensión del sistema, línea-línea [kV]" },
  { tex: "U_0", texto: "Tensión fase-tierra [V]" },
  { tex: "W_d", texto: "Pérdida dieléctrica [W/m]" },
  { tex: "t_c", texto: "Espesor de la cinta de la pantalla [m] (0.127 mm en 15 kV; 0.203 mm en los demás niveles)" },
  { tex: "R_s,\\,R_{s,op}", texto: "Resistencia de la pantalla a 20 °C y a la temperatura máxima [Ω/m]" },
  { tex: "X_m", texto: "Reactancia mutua entre conductor y pantalla [Ω/m]" },
  { tex: String.raw`\lambda_1`, texto: "Factor de pérdidas en la pantalla" },
  { tex: String.raw`T_1,\,T_2,\,T_3`, texto: "Resistencias térmicas del aislamiento, del relleno y de la chaqueta [K·m/W]" },
  { tex: String.raw`\rho_1,\,\rho_2,\,\rho_3`, texto: "Resistividades térmicas del aislamiento, del relleno y de la chaqueta [K·m/W]" },
  { tex: String.raw`t_1,\,t_2,\,t_3`, texto: "Espesores del aislamiento, del relleno y de la chaqueta [m]" },
  { tex: "D_e", texto: "Diámetro exterior del cable [m]" },
  { tex: "T_4", texto: "Resistencia térmica externa (ducto y suelo) [K·m/W]" },
  { tex: String.raw`T_{4p},\,T_{4m}`, texto: "Parte propia y parte por el calentamiento mutuo de los demás ductos [K·m/W]" },
  { tex: "T_d", texto: "Resistencia térmica del ducto [K·m/W]" },
  { tex: String.raw`\rho_s`, texto: "Resistividad térmica del suelo [K·m/W]" },
  { tex: "L", texto: "Profundidad del ducto activo [m]" },
  { tex: String.raw`L_j,\,x_j`, texto: "Profundidad del ducto j y su distancia horizontal al ducto activo [m]" },
  { tex: String.raw`I_{pant}`, texto: "Corriente circulante por la pantalla [A]" },
  { tex: String.raw`V_{ind}`, texto: "Tensión inducida en la pantalla a circuito abierto, por kilómetro de cable [V/km]" },
];

const FORMULAS_NOTA = `El cálculo es el de régimen permanente de la IEC 60287-1-1. La resistencia térmica externa se calcula con el método de imágenes de Kennelly: acopla el ducto activo con los demás ductos del banco.

El banco se arma con hasta 3 ductos por fila (separados entre sí por la distancia indicada) y el ducto activo es el más cercano al centro geométrico del banco.

En el cable tripolar el factor de proximidad es cero, λ1 = 0.02 y no se usan la separación entre fases ni la puesta a tierra de pantallas.

En el cable monopolar, con las pantallas a tierra en ambos extremos circula corriente por ellas (I_pant); con puesta a tierra unipuntual o cross-bonding no circula, y queda una tensión inducida a circuito abierto (V_ind). Ambas se calculan con la ampacidad obtenida y sirven para revisar el esquema de puesta a tierra; en el cable tripolar no aplican.

Limitaciones conocidas: no distingue formación en trébol de formación plana (usa la misma fórmula de proximidad para ambas) y solo calcula régimen permanente (no transitorio ni secado del suelo).

Si el salto térmico no alcanza para cubrir la pérdida dieléctrica, el cálculo no es válido y se avisa.`;

// Texto plano de respaldo si KaTeX no se puede cargar.
const FORMULAS_TEXTO = `Metodología IEC 60287-1-1 (régimen permanente):

  I = √( (Δθ − Wd·(0.5·T1 + n·(T2+T3+T4))) / (R·T1 + n·R·(1+λ1)·(T2+T3+T4)) )     [A]

  Δθ = θc − θs        n = 3 (monopolar) / 1 (tripolar)

  R' = R0·(1 + α20·(θc − 20))
  x² = 8π·f / R' · 1e-7
  ys = x⁴ / (192 + 0.8·x⁴)
  yp = ys·(dc/s)²·(0.312·(dc/s)² + 1.18/(ys + 0.27))      (0 en tripolar)
  R  = R'·(1 + ys + yp)

  C  = εr·1e-9 / (18·ln(Ds/dc))
  U0 = 1000·V / √3
  Wd = 2π·f·C·U0²·tan δ

  Rs (cinta) = 1.7241e-8 / (tc·0.88·π·Ds)      Rs,op = Rs·(1 + α20·(θc − 20))
  Xm = 4π·f·1e-7·ln(2s/Ds)
  λ1 = Rs,op/R · 1/(1 + (Rs,op/Xm)²) + 0.01   (monopolar, ambos extremos); 0.02 en los demás casos

  T1 = ρ1/(2π)·ln(1 + 2·t1/dc)
  T2 = ρ2/(2π)·ln(1 + 2·t2/Ds)
  T3 = ρ3/(2π)·ln(1 + 2·t3/De)
  T4 = Td + ρs/(2π)·ln(4L/De) + Σj ρs/(2π)·ln( √(xj² + (Lj+L)²) / √(xj² + (Lj−L)²) )

  Pantalla del cable monopolar:
    Ipant = I·Xm / √(Rs,op² + Xm²)        [A]      (ambos extremos)
    Vind  = 1000·I·Xm                      [V/km]   (unipuntual o cross-bonding)

${FORMULAS_NOTA}`;

// Lineas del reporte que son etiquetas: van en negrita (el texto que se copia es el mismo).
const ETIQUETAS_REPORTE = ["CÁLCULO DE AMPACIDAD SUBTERRÁNEA", "PARÁMETROS DE ENTRADA:", "RESULTADOS:"];

export async function render(container) {
  const cables = await loadData("construccion-cable-subterraneo");
  const materiales = distinct(cables, "material");
  const calibres = ORDEN_CALIBRES.filter((c) => cables.some((row) => row.calibre_awg_kcmil === c));
  const tiposPantalla = distinct(cables, "tipo_pantalla");
  const nivelesKv = distinct(cables, "nivel_aislamiento_kv");

  container.innerHTML = `
    <div class="breadcrumb"><a href="#/">Inicio</a> <span>/</span> <a href="#/calculos">Cálculos</a> <span>/</span> <span>Ampacidad subterránea</span></div>
    <h1 class="page-title">Ampacidad de cables subterráneos</h1>

    <form id="form-calc" novalidate>
      <div class="card tarjeta-borde form-section">
        <div class="form-section-title">${icon("conductorCableado")} Cable</div>
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
        <div class="grid-2 ultima">
          <div class="field">
            <label for="f-tierra" data-info="Unipuntual: en un extremo del cable.">Puesta a tierra de pantallas</label>
            <select id="f-tierra" required>
              <option value="Unipuntual">Unipuntual</option>
              <option value="Ambos Extremos">Ambos Extremos</option>
              <option value="Cross-bonding">Cross-bonding</option>
            </select>
          </div>
          <div class="field">
            <label for="f-sepfases" data-info="Valores típicos entre 0.04 y 0.10 m entre fases.">Separación entre fases (m)</label>
            <input type="number" id="f-sepfases" min="0" max="1" step="0.01" value="0.04" required>
          </div>
        </div>
      </div>

      <div class="card tarjeta-borde form-section">
        <div class="form-section-title">${icon("circuitVoltmeter")} Condiciones de operación</div>
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
        <div class="grid-2 ultima">
          <div class="field">
            <label for="f-tempmax">Temperatura máxima del conductor (°C)</label>
            <input type="number" id="f-tempmax" min="0" max="300" step="0.1" value="90" required>
          </div>
          <div class="field">
            <label for="f-tempterreno" data-info="Valores típicos: 15-20°C en clima frío, 25-30°C en clima cálido/tropical.">Temperatura del terreno (°C)</label>
            <input type="number" id="f-tempterreno" min="-100" max="100" step="0.1" value="25" required>
          </div>
        </div>
      </div>

      <div class="card tarjeta-borde form-section">
        <div class="form-section-title">${icon("gridDots")} Instalación</div>
        <div class="grid-2">
          <div class="field">
            <label for="f-rhosuelo" data-info="Tipos de suelo: Saturado / muy húmedo: 0.5-0.7; Arena o arcilla húmeda: 0.7-1.0; Tierra común compactada: 1.0-1.2; Arena seca: 2.0-3.0; Roca/suelo muy seco: 2.5-3.5">Resistividad térmica del suelo (K·m/W)</label>
            <input type="number" id="f-rhosuelo" min="-100" max="1000" step="0.01" value="1" required>
          </div>
          <div class="field">
            <label for="f-uducto" data-info="Típicos: PVC ≈ 0.3 - 0.4 K·m/W; Fibra de vidrio: 0.2 - 0.3; Metálico: 0.05 - 0.1; Cualquier ducto embebido en concreto: 0.1 - 0.2">Resistencia térmica del ducto (K·m/W)</label>
            <input type="number" id="f-uducto" min="0" max="5" step="0.01" value="0.3" required>
          </div>
        </div>
        <div class="grid-2">
          <div class="field">
            <label for="f-ncircuitos">Número de circuitos en el banco</label>
            <input type="number" id="f-ncircuitos" min="0" max="6" step="1" value="1" required>
          </div>
          <div class="field">
            <label for="f-profundidad">Profundidad de enterramiento del banco (m)</label>
            <input type="number" id="f-profundidad" min="0" max="10" step="0.01" value="1" required>
          </div>
        </div>
        <div class="grid-2 ultima">
          <div class="field">
            <label for="f-sepductos" data-info="Depende de la norma; valores típicos entre 0.15 y 0.30 m">Separación entre ductos (m)</label>
            <input type="number" id="f-sepductos" min="0.05" max="1" step="0.01" value="0.2" required disabled>
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

  activarPlegables(container);
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
      data.pantalla = calcularPantalla(p, data.ampacidad);
      renderResultado(data, p, { material, calibre, tipoPantalla, nivelAislamientoKv, nivelAislamientoPct });
    } catch (err) {
      renderError(err.message);
    }
  });

  function renderError(msg) {
    const wrap = container.querySelector("#resultado-wrap");
    wrap.innerHTML = `<div class="callout callout-danger">${escapeHtml(msg)}</div>`;
    wrap.scrollIntoView({ behavior: "smooth", block: "nearest" });
  }

  function reporteTexto(data, p, ctx) {
    // El reporte se copia y se pega: tres etiquetas (el calculo, los parametros de entrada y los resultados).
    // Parametros = lo que el usuario dio; resultados = todo lo que sale del calculo.
    const i = data.intermedios;
    const pant = data.pantalla;
    return [
      `CÁLCULO DE AMPACIDAD SUBTERRÁNEA`,
      ``,
      `PARÁMETROS DE ENTRADA:`,
      LINEA_REPORTE,
      `Tipo de cable: ${p.tipoCable}`,
      `Material: ${ctx.material}`,
      `Calibre: ${ctx.calibre}`,
      `Tipo de pantalla: ${ctx.tipoPantalla}`,
      `Nivel de aislamiento: ${fmt(ctx.nivelAislamientoKv, 0)} kV — ${fmt(ctx.nivelAislamientoPct, 0)}%`,
      `Puesta a tierra de pantallas: ${p.tipoCable === "Tripolar" ? "N/A (tripolar)" : p.puestaTierra}`,
      `Separación entre fases: ${p.tipoCable === "Tripolar" ? "N/A (tripolar)" : `${fmt(p.separacionFasesM)} m`}`,
      `Tensión del sistema: ${fmt(p.tensionSistemaKv)} kV`,
      `Frecuencia: ${fmt(p.frecuenciaHz, 0)} Hz`,
      `Temperatura máxima del conductor: ${fmt(p.tempMaxC)} °C`,
      `Temperatura del terreno: ${fmt(p.tempTerrenoC)} °C`,
      `Resistividad térmica del suelo: ${fmt(p.rhoSueloKmW)} K·m/W`,
      `Resistencia térmica del ducto: ${fmt(p.uDuctoKmW)} K·m/W`,
      `Número de circuitos en el banco: ${fmt(p.numCircuitos, 0)}`,
      `Profundidad de enterramiento del banco: ${fmt(p.profundidadBancoM)} m`,
      `Separación entre ductos: ${p.numCircuitos > 1 ? `${fmt(p.separacionDuctosM)} m` : "N/A (1 circuito)"}`,
      ``,
      `RESULTADOS:`,
      LINEA_REPORTE,
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
      ...(pant === null ? [] : [``, pant.tipo === "circulante" ? `Corriente circulante en la pantalla: ${fmt(pant.corrienteA)} A` : `Tensión inducida en la pantalla (circuito abierto): ${fmt(pant.tensionVKm)} V/km`]),
    ].join("\n");
  }

  function renderResultado(data, p, ctx) {
    const wrap = container.querySelector("#resultado-wrap");

    const pant = data.pantalla;
    const metricaPantalla =
      pant === null
        ? ""
        : pant.tipo === "circulante"
          ? `<div class="result-metric">
                <div class="value">${fmt(pant.corrienteA)}<span class="unit">A</span></div>
                <div class="label">Corriente circulante en la pantalla</div>
              </div>`
          : `<div class="result-metric">
                <div class="value">${fmt(pant.tensionVKm)}<span class="unit">V/km</span></div>
                <div class="label">Tensión inducida en la pantalla (circuito abierto)</div>
              </div>`;
    const resultado = `
          <div class="result-panel">
            <div class="${pant === null ? "" : "grid-2"}">
              <div class="result-metric">
                <div class="value">${fmt(data.ampacidad)}<span class="unit">A</span></div>
                <div class="label">Ampacidad admisible</div>
              </div>
              ${metricaPantalla}
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
