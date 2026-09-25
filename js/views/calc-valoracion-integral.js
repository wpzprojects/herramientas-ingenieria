// Valoración integral: evalúa de 1 a 6 escenarios de conductor para una misma conexión (misma potencia y longitud) con
// todos los criterios a la vez (ampacidad, pérdidas, regulación, cortocircuito y costo total actualizado). Pedida por el
// usuario (2026-09-25) para no depender de la IA en las validaciones integrales. Sigue el patrón de Conductor económico:
// tarjeta «Datos de la conexión», tarjeta «Evaluación económica» y una tarjeta por escenario (agregar/quitar). Lo que
// casi nunca cambia va plegado en «Parámetros avanzados» dentro de cada tarjeta. La lógica vive en
// ../calc/valoracion-integral.js, que combina los motores de las demás calculadoras sin tocarlos.

import { fmt, fmtPercent, loadData, distinct, escapeHtml } from "../util/format.js";
import { icon } from "../icons.js";
import { potenciaActivaMw } from "../calc/circuito.js";
import {
  compararEscenarios,
  datosConductor,
  nivelAislamientoPara,
  CALIBRES_SUBTERRANEOS,
  MIN_ESCENARIOS,
  MAX_ESCENARIOS,
  MAX_CIRCUITOS_BANCO,
  LIMITE_PERDIDAS,
  LIMITE_REGULACION,
} from "../calc/valoracion-integral.js";
import { UMBRAL_OPTIMO_PCT as OPTIMO_PERDIDAS } from "../calc/perdidas-tramos.js";
import { UMBRAL_OPTIMO_PCT as OPTIMO_REGULACION } from "../calc/regulacion-tramos.js";
import { LINEA_REPORTE, reporteHtml, tarjetaResultadosHtml, activarPestanas } from "../util/resultados-ui.js";
import { activarInfos } from "../util/info-campo.js";
import { activarPlegables } from "../util/tarjetas-plegables.js";
import { guardarEstado, leerEstado } from "../util/persistencia-calculo.js";
import { aplicarDefectos, leerDefectos } from "../util/valores-defecto.js";
import { crearXlsx, columna, MIME_XLSX } from "../util/xlsx.js";

const RUTA = "/calculos/valoracion-integral";

const FORMULAS_TEX = [
  {
    titulo: "Corriente de operación",
    ecuaciones: [String.raw`I = \dfrac{P \cdot 1000}{\sqrt{3}\,V\,\cos\varphi} \quad [\mathrm{A}]`, String.raw`P = S \cdot \cos\varphi \quad [\mathrm{MW}]`],
  },
  {
    titulo: "Ampacidad (calculadoras de Ampacidad aérea y subterránea)",
    ecuaciones: [
      String.raw`I_{adm,1} = \sqrt{\dfrac{Q_c + Q_r - Q_s}{R(T_c)}} \quad \text{(aérea, IEEE Std 738)}`,
      String.raw`I_{adm,1} = \sqrt{\dfrac{\Delta\theta - W_d\left[0.5\,T_1 + n\,(T_2 + T_3 + T_4)\right]}{R\,T_1 + n\,R\,(1+\lambda_1)\,T_2 + n\,R\,(1+\lambda_1)(T_3 + T_4)}} \quad \text{(subterránea, IEC 60287)}`,
      String.raw`I_{adm} = N \cdot I_{adm,1} \qquad \%\,uso = \dfrac{I}{I_{adm}} \cdot 100`,
    ],
  },
  {
    titulo: "Pérdidas (calculadora de Pérdidas)",
    ecuaciones: [
      String.raw`F_p = 0.3\,F_c + 0.7\,F_c^{2} \qquad R_{ef} = \dfrac{R_{75}}{N}`,
      String.raw`\%P = \dfrac{\sqrt{3}\,I\,R_{ef}\,L\,F_p \cdot 100}{V \cdot 1000 \cdot \cos\varphi}`,
    ],
  },
  {
    titulo: "Regulación (calculadora de Regulación)",
    ecuaciones: [
      String.raw`X_l = 0.0754\,\ln\!\left(\dfrac{\sqrt[3]{D_{ab}\,D_{ac}\,D_{bc}}}{RMG_{eq}/1000}\right) \qquad Z = R_{ef}\cos\varphi + X_l\sin\varphi`,
      String.raw`\%\Delta V = \dfrac{\sqrt{3}\,I\,Z\,L \cdot 100}{V \cdot 1000}`,
    ],
  },
  {
    titulo: "Cortocircuito (calculadora de Cortocircuito)",
    ecuaciones: [String.raw`I_{cc} = N \cdot \dfrac{A\,k_1}{1000}\sqrt{\dfrac{\log_{10}\!\left(\dfrac{T_2 + \lambda}{T_1 + \lambda}\right)}{t}} \quad [\mathrm{kA}]`],
  },
  {
    titulo: "Costo total actualizado (calculadora de Conductor económico)",
    ecuaciones: [
      String.raw`C_0 = L\,\left(3\,N\,c_{cond} + c_{inst}\right) \qquad VP_{perd} = \sum_{t=1}^{n} \dfrac{E_t \cdot p_t}{(1+r)^{t}}`,
      String.raw`C_{total} = C_0 + VP_{perd}`,
    ],
  },
];

const FORMULAS_ETIQUETAS = [
  { tex: "P,\\,S", texto: "Potencia activa [MW] y aparente [MVA] de la conexión" },
  { tex: "V", texto: "Tensión de línea del escenario [kV]" },
  { tex: "I", texto: "Corriente de operación [A]" },
  { tex: "N", texto: "Conductores por fase (en subterránea: circuitos en paralelo)" },
  { tex: "I_{adm,1},\\,I_{adm}", texto: "Ampacidad de un conductor y del conjunto de la fase [A]" },
  { tex: "F_c,\\,F_p", texto: "Factor de carga y factor de pérdidas" },
  { tex: "R_{75},\\,R_{ef}", texto: "Resistencia AC de un conductor a 75 °C y efectiva de la fase [Ω/km]" },
  { tex: "L", texto: "Longitud de la línea [km]" },
  { tex: "X_l,\\,Z", texto: "Reactancia inductiva e impedancia efectiva [Ω/km]" },
  { tex: String.raw`D_{ab},\,D_{ac},\,D_{bc}`, texto: "Distancias entre fases [m] (en subterránea, la separación entre fases del trébol)" },
  { tex: "RMG_{eq}", texto: "Radio medio geométrico del conductor o del haz [mm]" },
  { tex: "A", texto: "Área de un conductor [mm²] (en aérea, la de aluminio)" },
  { tex: "T_1,\\,T_2,\\,t", texto: "En cortocircuito: temperatura de operación y admisible en falla [°C] y tiempo de despeje [s]" },
  { tex: String.raw`k_1,\,\lambda`, texto: "Constantes del material (cobre 341 y 234; aluminio 224 y 228)" },
  { tex: "c_{cond},\\,c_{inst}", texto: "Costo de un conductor y de la instalación por km [$/km]" },
  { tex: "E_t,\\,p_t,\\,r", texto: "Energía perdida y precio de la energía del año t, y tasa de descuento" },
];

const FORMULAS_NOTA = `Cada escenario usa las mismas fórmulas de las calculadoras de Pérdidas, Regulación, Ampacidad aérea, Ampacidad subterránea, Cortocircuito y Conductor económico, con los datos comunes de la conexión (potencia, factor de potencia, factor de carga y longitud) y los de su propio conductor.

Criterios: la corriente de operación no debe superar la ampacidad; las pérdidas hasta ${LIMITE_PERDIDAS} % y la regulación hasta ${LIMITE_REGULACION} % son las referencias de diseño de «aceptable» (óptimo hasta ${OPTIMO_PERDIDAS} % y ${OPTIMO_REGULACION} %); el cortocircuito se evalúa solo si se indica la corriente de falla. Gana, entre los escenarios que cumplen todo, el de menor costo total actualizado.

Varios conductores por fase en red aérea forman un haz: la resistencia es R/N, el radio medio geométrico es el del haz y la ampacidad y la capacidad de cortocircuito son N veces las de un conductor.

Varios conductores por fase en red subterránea son N circuitos (ternas) en paralelo, cada uno en su ducto del mismo banco: la ampacidad de un circuito se calcula con el calentamiento mutuo de todos los circuitos del banco y se multiplica por N, y la impedancia es la de un circuito dividida entre N (sin el acople entre ternas). Los cables son monopolares en trébol, y la resistencia AC a 75 °C y el radio medio geométrico salen del catálogo XLPE.

La temperatura de operación del cortocircuito es la máxima del conductor en servicio (la de los parámetros avanzados: 75 °C en aérea y 90 °C en subterránea por defecto). Los criterios técnicos se evalúan con la demanda indicada (año 1); el crecimiento de la demanda solo entra en los costos.`;

const FORMULAS_TEXTO = `I = P·1000 / (√3·V·cos φ)   [A]
Iadm = N · Iadm,1 (IEEE Std 738 en aérea, IEC 60287 en subterránea)   %uso = I / Iadm · 100
Fp = 0.3·Fc + 0.7·Fc²   Ref = R75 / N
%P = √3·I·Ref·L·Fp·100 / (V·1000·cos φ)
Xl = 0.0754·ln(∛(Dab·Dac·Dbc) / (RMGeq/1000))   Z = Ref·cos φ + Xl·sen φ
%ΔV = √3·I·Z·L·100 / (V·1000)
Icc = N · A·k1·√(log10((T2+λ)/(T1+λ)) / t) / 1000   [kA]
C0 = L·(3·N·c_cond + c_inst)   VPperd = Σ Et·pt / (1+r)^t   Ctotal = C0 + VPperd

${FORMULAS_NOTA}`;

const ETIQUETAS_REPORTE = ["CÁLCULO DE VALORACIÓN INTEGRAL", "PARÁMETROS DE ENTRADA:", "RESULTADOS:"];

const MODOS = { potencia: "Potencia activa", aparente: "Potencia aparente" };

const INFO_REFERENCIA =
  "Un mismo calibre puede tener varias construcciones (número de hilos, diámetro) con resistencia distinta. Solo aplica a conductores aéreos.";
const INFO_N_AEREA = "Con más de uno forman un haz: resistencia R/N, radio medio geométrico del haz y N veces la ampacidad de un conductor.";
const INFO_N_SUBT = "En subterránea son circuitos (ternas) en paralelo, cada uno en su ducto del mismo banco de ductos.";

// Números con coma de miles para el dinero (el resto de la app usa punto decimal, en-US).
const num = (v, min = 0, max = 0) => (Number.isFinite(v) ? v.toLocaleString("en-US", { minimumFractionDigits: min, maximumFractionDigits: max }) : "—");
const fmtPesos = (v) => (Number.isFinite(v) ? `$ ${num(v)}` : "—");
const valor = (input) => (input.value.trim() === "" ? null : parseFloat(input.value));

export async function render(container) {
  const desnudos = await loadData("conductores-desnudos");
  const xlpe = await loadData("conductores-xlpe");
  const cables = await loadData("construccion-cable-subterraneo");
  const catalogos = { desnudos, xlpe, cables };
  const tiposAereos = distinct(desnudos, "tipo");
  const materialesSubt = distinct(cables, "material");

  container.innerHTML = `
    <div class="breadcrumb"><a href="#/">Inicio</a> <span>/</span> <a href="#/calculos">Cálculos</a> <span>/</span> <span>Valoración integral</span></div>
    <h1 class="page-title">Valoración integral</h1>

    <form id="form-calc" novalidate>
      <div class="card tarjeta-borde form-section">
        <div class="form-section-title">${icon("circuitVoltmeter")} Datos de la conexión</div>
        <div class="grid-2">
          <div class="field">
            <label for="f-modo" data-info="La corriente no se ofrece como dato de partida porque depende de la tensión, y cada escenario puede tener la suya.">Dato de partida</label>
            <select id="f-modo">
              <option value="potencia">${MODOS.potencia}</option>
              <option value="aparente">${MODOS.aparente}</option>
            </select>
          </div>
          <div class="field" id="wrap-potencia">
            <label for="f-potencia">Potencia activa (MW)</label>
            <input type="number" id="f-potencia" min="0" step="any" value="30" required>
          </div>
          <div class="field" id="wrap-aparente" hidden>
            <label for="f-aparente">Potencia aparente (MVA)</label>
            <input type="number" id="f-aparente" min="0" step="any" value="33.33">
          </div>
        </div>
        <div class="grid-2">
          <div class="field">
            <label for="f-fp">Factor de potencia</label>
            <input type="number" id="f-fp" min="0.01" max="1" step="0.01" value="0.9" required>
          </div>
          <div class="field">
            <label for="f-fc" data-info="Circuitos de uso: 1 · Granjas solares: 0.28-0.53 según tecnología y ubicación (lo ideal es calcularlo con la curva real de generación a 24 h)">Factor de carga (Fc)</label>
            <input type="number" id="f-fc" min="0" max="1" step="0.0001" value="0.4" required>
          </div>
        </div>
        <div class="grid-2 ultima">
          <div class="field">
            <label for="f-longitud">Longitud de la línea (km)</label>
            <input type="number" id="f-longitud" min="0.001" step="any" value="5" required>
          </div>
        </div>

        <details class="vi-avanzado">
          <summary>Parámetros avanzados (ambiente, terreno y falla)</summary>
          <div class="vi-avanzado-grupo">Líneas aéreas</div>
          <div class="grid-2">
            <div class="field"><label for="f-ta">Temperatura ambiente (°C)</label><input type="number" id="f-ta" min="-50" max="60" step="0.1" value="25" required></div>
            <div class="field"><label for="f-tc" data-info="También es la temperatura de operación con que se calcula el cortocircuito en red aérea.">Temperatura máxima del conductor (°C)</label><input type="number" id="f-tc" min="0" max="300" step="0.1" value="75" required></div>
          </div>
          <div class="grid-2">
            <div class="field"><label for="f-vw">Velocidad del viento (m/s)</label><input type="number" id="f-vw" min="0" max="100" step="0.01" value="0.61" required></div>
            <div class="field"><label for="f-angulo" data-info="Ángulo entre el viento y el eje del conductor: 90° es viento perpendicular.">Ángulo del viento (°)</label><input type="number" id="f-angulo" min="0" max="360" step="1" value="90" required></div>
          </div>
          <div class="grid-2">
            <div class="field"><label for="f-elevacion">Elevación sobre el nivel del mar (m)</label><input type="number" id="f-elevacion" min="0" max="10000" step="1" value="0" required></div>
            <div class="field"><label for="f-epsilon" data-info="Rango 0.23 (conductor nuevo) a 0.91 (envejecido).">Emisividad ε</label><input type="number" id="f-epsilon" min="0.23" max="0.91" step="0.01" value="0.5" required></div>
          </div>
          <div class="grid-2">
            <div class="field"><label for="f-alfa" data-info="Rango 0.23 (conductor nuevo) a 0.91 (envejecido).">Absortividad α</label><input type="number" id="f-alfa" min="0.23" max="0.91" step="0.01" value="0.5" required></div>
            <div class="field"><label for="f-qse" data-info="Radiación solar total. Para calcularla con la posición del sol, usa la calculadora de Ampacidad aérea.">Radiación solar Qse (W/m²)</label><input type="number" id="f-qse" min="0" max="3000" step="1" value="1000" required></div>
          </div>
          <div class="grid-2">
            <div class="field"><label for="f-theta">Ángulo de incidencia solar θ (°)</label><input type="number" id="f-theta" min="0" max="90" step="1" value="90" required></div>
          </div>
          <div class="vi-avanzado-grupo">Cables subterráneos</div>
          <div class="grid-2">
            <div class="field"><label for="f-tempmax" data-info="También es la temperatura de operación con que se calcula el cortocircuito en red subterránea.">Temperatura máxima del conductor (°C)</label><input type="number" id="f-tempmax" min="0" max="300" step="0.1" value="90" required></div>
            <div class="field"><label for="f-tempterreno">Temperatura del terreno (°C)</label><input type="number" id="f-tempterreno" min="-50" max="100" step="0.1" value="25" required></div>
          </div>
          <div class="grid-2">
            <div class="field"><label for="f-rhosuelo">Resistividad térmica del suelo (K·m/W)</label><input type="number" id="f-rhosuelo" min="0" max="1000" step="0.01" value="1" required></div>
            <div class="field"><label for="f-uducto">Resistencia térmica del ducto (K·m/W)</label><input type="number" id="f-uducto" min="0" max="5" step="0.01" value="0.3" required></div>
          </div>
          <div class="grid-2">
            <div class="field"><label for="f-profundidad">Profundidad del banco de ductos (m)</label><input type="number" id="f-profundidad" min="0.1" max="10" step="0.01" value="1" required></div>
            <div class="field"><label for="f-frecuencia">Frecuencia (Hz)</label><input type="number" id="f-frecuencia" min="1" max="300" step="1" value="60" required></div>
          </div>
          <div class="vi-avanzado-grupo">Cortocircuito</div>
          <div class="grid-2">
            <div class="field"><label for="f-tfalla">Temperatura máxima admisible en falla (°C)</label><input type="number" id="f-tfalla" min="0" max="500" step="0.1" value="250" required></div>
          </div>
        </details>
      </div>

      <div class="card tarjeta-borde form-section" style="margin-top: var(--space-4);">
        <div class="form-section-title">${icon("coin")} Evaluación económica</div>
        <div class="grid-2">
          <div class="field">
            <label for="f-precio" data-info="Lo que cuesta la energía que se pierde en la línea (compra o costo reconocido), valor del año 1. Si se deja vacío no se comparan costos; también hace falta el costo del conductor de cada escenario.">Precio de la energía perdida ($/kWh)</label>
            <input type="number" id="f-precio" min="0" step="any">
          </div>
          <div class="field">
            <label for="f-escalada" data-info="Porcentaje que sube cada año el precio de la energía. Referencia orientativa: 2-5 % anual.">Aumento anual del precio (%)</label>
            <input type="number" id="f-escalada" min="0" max="100" step="any" value="2.5" required>
          </div>
        </div>
        <div class="grid-2">
          <div class="field">
            <label for="f-tasa" data-info="Interés con que se traen a valor presente los costos de las pérdidas de cada año. Referencia orientativa: 8-14 % anual.">Tasa de descuento (%)</label>
            <input type="number" id="f-tasa" min="0" max="100" step="any" value="10" required>
          </div>
          <div class="field">
            <label for="f-anios">Años de análisis</label>
            <input type="number" id="f-anios" min="1" max="60" step="1" value="25" required>
          </div>
        </div>
        <div class="grid-2 ultima">
          <div class="field">
            <label for="f-crecimiento" data-info="Aumento anual de la demanda a partir del año 1. Con 0 % la demanda se mantiene (p. ej. una planta de generación). Solo afecta los costos: los criterios técnicos se evalúan con la demanda indicada.">Crecimiento anual de la demanda (%)</label>
            <input type="number" id="f-crecimiento" min="0" max="100" step="any" value="0" required>
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

  aplicarDefectos(container, "valoracion-integral"); // valores por defecto personales (Perfil > Calculadoras), antes de restaurar lo escrito
  activarInfos(container);
  activarPlegables(container);

  const form = container.querySelector("#form-calc");
  const q = (s) => container.querySelector(s);
  const selModo = q("#f-modo");
  const fPotencia = q("#f-potencia");
  const fAparente = q("#f-aparente");
  const campoPorModo = {
    potencia: { wrap: q("#wrap-potencia"), input: fPotencia },
    aparente: { wrap: q("#wrap-aparente"), input: fAparente },
  };
  function aplicarModo() {
    for (const [modo, { wrap, input }] of Object.entries(campoPorModo)) {
      const activo = modo === selModo.value;
      wrap.hidden = !activo;
      input.required = activo;
    }
  }
  selModo.addEventListener("change", aplicarModo);
  aplicarModo();

  // Campos comunes que se guardan tal cual (ids sin el «f-»)
  const COMUNES = ["modo", "potencia", "aparente", "fp", "fc", "longitud", "ta", "tc", "vw", "angulo", "elevacion", "epsilon", "alfa", "qse", "theta", "tempmax", "tempterreno", "rhosuelo", "uducto", "profundidad", "frecuencia", "tfalla", "precio", "escalada", "tasa", "anios", "crecimiento"];
  const campo = (id) => q(`#f-${id}`);
  const n = (id) => parseFloat(campo(id).value);

  // Si falta un dato obligatorio dentro de «Parámetros avanzados» plegado, se abre solo (como las tarjetas plegables).
  form.addEventListener("invalid", (e) => {
    const det = e.target.closest("details");
    if (det) det.open = true;
  }, true);

  // ---------- escenarios ----------
  function crearEscenario(id) {
    const cont = document.createElement("div");
    cont.innerHTML = `
      <div class="card tarjeta-borde form-section tramo-block">
        <div class="form-section-title">
          ${icon("conductorCableado")} <span class="tramo-titulo">Escenario 1</span>
          <button type="button" class="btn btn-ghost btn-tramo-quitar" hidden>${icon("close")} Quitar</button>
        </div>
        <div class="grid-2">
          <div class="field">
            <label for="f-tension-${id}">Tensión de línea (kV)</label>
            <input type="number" id="f-tension-${id}" min="0.1" step="any" value="34.5" required>
          </div>
          <div class="field">
            <label for="f-red-${id}">Tipo de red</label>
            <select id="f-red-${id}" required>
              <option value="Aerea">Aérea</option>
              <option value="Subterranea">Subterránea</option>
            </select>
          </div>
        </div>
        <div class="grid-2">
          <div class="field">
            <label for="f-material-${id}">Material / Tipo de conductor</label>
            <select id="f-material-${id}" required></select>
          </div>
          <div class="field">
            <label for="f-calibre-${id}">Calibre</label>
            <select id="f-calibre-${id}" required></select>
          </div>
        </div>
        <div class="grid-2">
          <div class="field">
            <label for="f-referencia-${id}" data-info="${INFO_REFERENCIA}">Referencia</label>
            <select id="f-referencia-${id}" required></select>
          </div>
          <div class="field">
            <label for="f-n-${id}" class="vi-label-n" data-info="${INFO_N_AEREA}">Conductores por fase</label>
            <input type="number" id="f-n-${id}" min="1" max="8" step="1" value="1" required>
          </div>
        </div>
        <div class="grid-2">
          <div class="field">
            <label for="f-falla-${id}" data-info="Opcional. Corriente de cortocircuito en el punto de conexión, para verificar que el conductor la soporte. Vacío = solo se informa la capacidad del conductor.">Corriente de falla (kA)</label>
            <input type="number" id="f-falla-${id}" min="0" step="any">
          </div>
          <div class="field">
            <label for="f-tiempo-${id}">Tiempo de despeje de la falla (s)</label>
            <input type="number" id="f-tiempo-${id}" min="0.01" max="60" step="any" value="0.3" required>
          </div>
        </div>
        <div class="grid-2 ultima">
          <div class="field">
            <label for="f-costo-cond-${id}" data-info="Precio de un solo conductor por km; se multiplica por las 3 fases, los conductores por fase y la longitud. Si se deja vacío, este escenario no entra en la comparación de costos.">Costo del conductor ($/km)</label>
            <input type="number" id="f-costo-cond-${id}" min="0" step="any">
          </div>
          <div class="field">
            <label for="f-costo-inst-${id}" data-info="Opcional: postes, herrajes, obra civil, mano de obra… por km de línea (sin el suministro del conductor). Vacío = 0 (solo se considera el conductor).">Costo de instalación ($/km)</label>
            <input type="number" id="f-costo-inst-${id}" min="0" step="any">
          </div>
        </div>

        <details class="vi-avanzado">
          <summary>Parámetros avanzados (disposición del conductor)</summary>
          <div class="vi-solo-aerea">
            <div class="grid-2">
              <div class="field">
                <label for="f-sephaz-${id}" data-info="Solo aplica con más de un conductor por fase.">Separación entre subconductores del haz (m)</label>
                <input type="number" id="f-sephaz-${id}" min="0.01" max="5" step="0.01" value="0.4" disabled>
              </div>
              <div class="field">
                <label for="f-dab-${id}" data-info="Las tres distancias vienen con los valores iniciales de la calculadora de Regulación; ajústalas a la estructura del escenario.">Distancia entre fases A-B (m)</label>
                <input type="number" id="f-dab-${id}" min="0.01" step="0.01" value="2" required>
              </div>
            </div>
            <div class="grid-2">
              <div class="field">
                <label for="f-dac-${id}">Distancia entre fases A-C (m)</label>
                <input type="number" id="f-dac-${id}" min="0.01" step="0.01" value="2.84" required>
              </div>
              <div class="field">
                <label for="f-dbc-${id}">Distancia entre fases B-C (m)</label>
                <input type="number" id="f-dbc-${id}" min="0.01" step="0.01" value="0.84" required>
              </div>
            </div>
          </div>
          <div class="vi-solo-subt" hidden>
            <div class="grid-2">
              <div class="field">
                <label for="f-pantalla-${id}">Tipo de pantalla</label>
                <select id="f-pantalla-${id}" required>
                  <option value="Hilos">Hilos</option>
                  <option value="Cinta">Cinta</option>
                </select>
              </div>
              <div class="field">
                <label for="f-pct-${id}" data-info="El nivel de aislamiento (15, 35 o 46 kV) se elige solo según la tensión del escenario.">Nivel de aislamiento (%)</label>
                <select id="f-pct-${id}" required></select>
              </div>
            </div>
            <div class="grid-2">
              <div class="field">
                <label for="f-tierra-${id}">Puesta a tierra de las pantallas</label>
                <select id="f-tierra-${id}" required>
                  <option value="Unipuntual">Unipuntual</option>
                  <option value="Ambos Extremos">Ambos Extremos</option>
                  <option value="Cross-bonding">Cross-bonding</option>
                </select>
              </div>
              <div class="field">
                <label for="f-sepfases-${id}" data-info="Distancia entre centros de los cables de un circuito (trébol). Se usa en la ampacidad y en la regulación.">Separación entre fases (m)</label>
                <input type="number" id="f-sepfases-${id}" min="0.01" max="1" step="0.001" value="0.04" required>
              </div>
            </div>
            <div class="grid-2">
              <div class="field">
                <label for="f-otros-${id}" data-info="Circuitos ajenos a esta línea que comparten el banco de ductos y la calientan. El banco admite hasta ${MAX_CIRCUITOS_BANCO} circuitos en total.">Otros circuitos en el banco</label>
                <input type="number" id="f-otros-${id}" min="0" max="${MAX_CIRCUITOS_BANCO - 1}" step="1" value="0" required>
              </div>
              <div class="field">
                <label for="f-sepductos-${id}" data-info="Solo aplica con más de un circuito en el banco.">Separación entre ductos (m)</label>
                <input type="number" id="f-sepductos-${id}" min="0.05" max="1" step="0.01" value="0.2" disabled>
              </div>
            </div>
          </div>
        </details>
      </div>`;
    const card = cont.firstElementChild;
    // Tensión y tiempo de despeje: valores por defecto personales (Perfil > Calculadoras); sus ids llevan el número del escenario.
    const defectos = leerDefectos();
    if (defectos.tension > 0) card.querySelector(`#f-tension-${id}`).value = defectos.tension;
    if (defectos.tiempo >= 0.01) card.querySelector(`#f-tiempo-${id}`).value = defectos.tiempo;
    activarInfos(card);
    activarPlegables(card);
    const c = (s) => card.querySelector(s);
    const f = {
      tension: c(`#f-tension-${id}`),
      red: c(`#f-red-${id}`),
      material: c(`#f-material-${id}`),
      calibre: c(`#f-calibre-${id}`),
      referencia: c(`#f-referencia-${id}`),
      n: c(`#f-n-${id}`),
      falla: c(`#f-falla-${id}`),
      tiempo: c(`#f-tiempo-${id}`),
      costoCond: c(`#f-costo-cond-${id}`),
      costoInst: c(`#f-costo-inst-${id}`),
      sephaz: c(`#f-sephaz-${id}`),
      dab: c(`#f-dab-${id}`),
      dac: c(`#f-dac-${id}`),
      dbc: c(`#f-dbc-${id}`),
      pantalla: c(`#f-pantalla-${id}`),
      pct: c(`#f-pct-${id}`),
      tierra: c(`#f-tierra-${id}`),
      sepfases: c(`#f-sepfases-${id}`),
      otros: c(`#f-otros-${id}`),
      sepductos: c(`#f-sepductos-${id}`),
    };
    const grupoAerea = c(".vi-solo-aerea");
    const grupoSubt = c(".vi-solo-subt");
    const esAerea = () => f.red.value === "Aerea";
    const opciones = (lista, vacio) =>
      lista.length ? `<option value="">Seleccione…</option>` + lista.map((v) => `<option value="${escapeHtml(v)}">${escapeHtml(v)}</option>`).join("") : `<option value="">${vacio}</option>`;

    // Grupo oculto = campos deshabilitados, para que no bloqueen «Calcular».
    function mostrarGrupo(grupo, visible) {
      grupo.hidden = !visible;
      grupo.querySelectorAll("input, select").forEach((el) => (el.disabled = !visible));
    }

    function poblarMaterial() {
      const lista = esAerea() ? tiposAereos : materialesSubt;
      f.material.innerHTML = lista.map((m) => `<option value="${escapeHtml(m)}">${escapeHtml(m)}</option>`).join("");
      mostrarGrupo(grupoAerea, esAerea());
      mostrarGrupo(grupoSubt, !esAerea());
      const infoN = c(".vi-label-n + .info-popover"); // el cuadro «i» copia el texto al crearse: se actualiza aparte
      if (infoN) infoN.textContent = esAerea() ? INFO_N_AEREA : INFO_N_SUBT;
      f.n.max = esAerea() ? 8 : MAX_CIRCUITOS_BANCO;
      poblarCalibre();
      syncDependientes();
    }

    function poblarCalibre() {
      const calibres = esAerea()
        ? distinct(desnudos.filter((d) => d.tipo === f.material.value), "calibre_awg_kcmil", "area_seccion_aluminio_mm2")
        : CALIBRES_SUBTERRANEOS.filter((k) => cables.some((r) => r.material === f.material.value && r.calibre_awg_kcmil === k));
      f.calibre.innerHTML = opciones(calibres, "Sin calibres disponibles");
      poblarReferencia();
      poblarPct();
    }

    function poblarReferencia() {
      if (!esAerea()) {
        f.referencia.innerHTML = `<option value="">No aplica (solo conductores aéreos)</option>`;
        f.referencia.disabled = true;
        return;
      }
      const refs = f.calibre.value ? desnudos.filter((d) => d.tipo === f.material.value && d.calibre_awg_kcmil === f.calibre.value).map((d) => d.nombre_clave) : [];
      f.referencia.innerHTML = refs.length ? opciones(refs) : `<option value="">Seleccione un calibre primero</option>`;
      f.referencia.disabled = !refs.length;
      if (refs.length === 1) f.referencia.value = refs[0]; // una sola construcción: se elige sola
    }

    // % de aislamiento disponible para el cable (según material, calibre, pantalla y el nivel que da la tensión)
    function poblarPct() {
      if (esAerea()) {
        validarTension();
        return;
      }
      const nivel = nivelAislamientoPara(parseFloat(f.tension.value));
      const previo = f.pct.value;
      const pcts = [...new Set(cables.filter((r) => r.material === f.material.value && (!f.calibre.value || r.calibre_awg_kcmil === f.calibre.value) && r.tipo_pantalla === f.pantalla.value && r.nivel_aislamiento_kv === nivel).map((r) => r.nivel_aislamiento_pct))].sort((a, b) => a - b);
      f.pct.innerHTML = pcts.length ? pcts.map((p) => `<option value="${p}">${p} %</option>`).join("") : `<option value="">No disponible</option>`;
      if (pcts.includes(Number(previo))) f.pct.value = previo;
      validarTension();
    }

    function validarTension() {
      const kv = parseFloat(f.tension.value);
      f.tension.setCustomValidity(!esAerea() && kv > 0 && nivelAislamientoPara(kv) === null ? "El catálogo de cables subterráneos llega hasta 46 kV." : "");
    }

    // Separación del haz (aérea) solo con N > 1; separación entre ductos (subterránea) solo con más de un circuito en el banco.
    function syncDependientes() {
      const nn = parseInt(f.n.value, 10) || 1;
      if (esAerea()) {
        f.sephaz.disabled = nn <= 1;
        f.sephaz.required = nn > 1;
        f.n.setCustomValidity("");
      } else {
        const total = nn + (parseInt(f.otros.value, 10) || 0);
        f.sepductos.disabled = total <= 1;
        f.sepductos.required = total > 1;
        f.n.setCustomValidity(total > MAX_CIRCUITOS_BANCO ? `El banco de ductos admite hasta ${MAX_CIRCUITOS_BANCO} circuitos en total (conductores por fase + otros circuitos).` : "");
      }
    }

    f.red.addEventListener("change", poblarMaterial);
    f.material.addEventListener("change", poblarCalibre);
    f.calibre.addEventListener("change", () => {
      poblarReferencia();
      poblarPct();
    });
    f.pantalla.addEventListener("change", poblarPct);
    f.tension.addEventListener("input", poblarPct);
    f.n.addEventListener("input", syncDependientes);
    f.otros.addEventListener("input", syncDependientes);
    poblarMaterial();

    const CAMPOS_BRUTO = ["tension", "n", "falla", "tiempo", "costoCond", "costoInst", "sephaz", "dab", "dac", "dbc", "tierra", "sepfases", "otros", "sepductos"];

    return {
      card,
      titulo: c(".tramo-titulo"),
      quitar: c(".btn-tramo-quitar"),
      /** Datos del escenario para el motor, o {error} si el conductor no se pudo resolver en los catálogos. */
      estado() {
        const aerea = esAerea();
        const eleccion = {
          red: f.red.value,
          material: f.material.value,
          calibre: f.calibre.value,
          referencia: f.referencia.value,
          tipoPantalla: f.pantalla.value,
          nivelAislamientoPct: parseInt(f.pct.value, 10),
          tensionKv: parseFloat(f.tension.value),
        };
        const conductor = datosConductor(eleccion, catalogos);
        const costoCond = valor(f.costoCond);
        const costoInst = valor(f.costoInst);
        const nn = parseInt(f.n.value, 10) || 1;
        return {
          eleccion,
          error: conductor.ok ? null : conductor.error,
          red: f.red.value,
          tensionKv: eleccion.tensionKv,
          n: nn,
          conductor,
          ...(aerea
            ? { dabM: parseFloat(f.dab.value), dacM: parseFloat(f.dac.value), dbcM: parseFloat(f.dbc.value), separacionHazM: nn > 1 ? parseFloat(f.sephaz.value) : 0 }
            : {
                puestaTierra: f.tierra.value,
                separacionFasesM: parseFloat(f.sepfases.value),
                otrosCircuitos: parseInt(f.otros.value, 10) || 0,
                separacionDuctosM: parseFloat(f.sepductos.value) || 0.2, // con un solo circuito el motor no la usa
              }),
          corrienteFallaKa: valor(f.falla),
          tiempoDespejeS: parseFloat(f.tiempo.value),
          costos: costoCond === null ? null : { costoConductorKm: costoCond, costoInstalacionKm: costoInst ?? 0, instalacionIndicada: costoInst !== null },
        };
      },
      /** Foto cruda para guardarla y restaurarla después. */
      bruto: () => ({
        red: f.red.value,
        material: f.material.value,
        calibre: f.calibre.value,
        referencia: f.referencia.value,
        pantalla: f.pantalla.value,
        pct: f.pct.value,
        avanzado: c("details").open,
        ...Object.fromEntries(CAMPOS_BRUTO.map((k) => [k, f[k].value])),
      }),
      aplicarBruto(d) {
        if (!d) return;
        f.tension.value = d.tension;
        f.red.value = d.red;
        f.red.dispatchEvent(new Event("change"));
        f.material.value = d.material;
        f.material.dispatchEvent(new Event("change"));
        f.pantalla.value = d.pantalla;
        f.calibre.value = d.calibre;
        f.calibre.dispatchEvent(new Event("change"));
        f.referencia.value = d.referencia ?? "";
        f.pct.value = d.pct;
        for (const k of CAMPOS_BRUTO) if (k !== "tension") f[k].value = d[k];
        poblarPct();
        syncDependientes();
        c("details").open = !!d.avanzado;
      },
    };
  }

  const escCont = q("#tramos-container");
  const escenarios = [];
  let siguienteId = 0;

  // «Agregar» va en la fila de «Calcular», justificado a la derecha (fuera de las tarjetas, siempre a la vista)
  const botonAgregar = document.createElement("button");
  botonAgregar.type = "button";
  botonAgregar.className = "btn btn-agregar-tramo";
  botonAgregar.innerHTML = `${icon("plus")} Agregar escenario`;
  botonAgregar.addEventListener("click", () => agregarEscenario());
  const filaCalcular = q("#form-calc .btn-row");
  filaCalcular.classList.add("btn-row--agregar");
  filaCalcular.append(botonAgregar);

  function actualizarEscenarios() {
    escenarios.forEach((e, i) => {
      e.titulo.textContent = `Escenario ${i + 1}`;
      e.quitar.hidden = escenarios.length <= MIN_ESCENARIOS;
    });
    botonAgregar.hidden = escenarios.length >= MAX_ESCENARIOS;
  }

  function agregarEscenario() {
    if (escenarios.length >= MAX_ESCENARIOS) return;
    const e = crearEscenario(siguienteId++);
    e.quitar.addEventListener("click", () => {
      escenarios.splice(escenarios.indexOf(e), 1);
      e.card.remove();
      actualizarEscenarios();
    });
    escenarios.push(e);
    escCont.append(e.card);
    actualizarEscenarios();
  }
  agregarEscenario();

  // ---------- restaurar lo que había si se volvió de otra sección (no sobrevive a un recargue) ----------
  const guardado = leerEstado(RUTA);
  if (guardado) {
    for (const k of COMUNES) if (k in guardado) campo(k).value = guardado[k];
    aplicarModo();
    q("details.vi-avanzado").open = !!guardado.avanzado;
    for (let i = escenarios.length; i < guardado.escenarios.length; i++) agregarEscenario();
    escenarios.forEach((e, i) => e.aplicarBruto(guardado.escenarios[i]));
  }

  function antesDeSalir() {
    guardarEstado(RUTA, {
      ...Object.fromEntries(COMUNES.map((k) => [k, campo(k).value])),
      avanzado: q("details.vi-avanzado").open,
      escenarios: escenarios.map((e) => e.bruto()),
    });
  }

  // ---------- cálculo ----------
  form.addEventListener("submit", (e) => {
    e.preventDefault();
    if (!form.reportValidity()) return;

    const modo = selModo.value;
    const factorPotencia = n("fp");
    const datoPartida = parseFloat(campoPorModo[modo].input.value);
    const precio = valor(campo("precio"));
    const comun = {
      potenciaActivaMw: potenciaActivaMw({ modo, potenciaMw: n("potencia"), potenciaMva: n("aparente"), factorPotencia }),
      factorPotencia,
      factorCarga: n("fc"),
      longitudKm: n("longitud"),
      aerea: { taC: n("ta"), tcC: n("tc"), vwMs: n("vw"), anguloVientoDeg: n("angulo"), elevacionM: n("elevacion"), epsilon: n("epsilon"), alfa: n("alfa"), qseWm2: n("qse"), thetaDeg: n("theta") },
      subterranea: { tempMaxC: n("tempmax"), tempTerrenoC: n("tempterreno"), rhoSueloKmW: n("rhosuelo"), uDuctoKmW: n("uducto"), profundidadBancoM: n("profundidad"), frecuenciaHz: n("frecuencia") },
      tempFallaC: n("tfalla"),
      economia:
        precio === null
          ? null
          : { anios: parseInt(campo("anios").value, 10), tasaDescuentoPct: n("tasa"), precioKwh: precio, escaladaEnergiaPct: n("escalada"), crecimientoDemandaPct: n("crecimiento") },
    };
    const estados = escenarios.map((s) => s.estado());
    const errores = estados.map((s, i) => (s.error ? `Escenario ${i + 1}: ${s.error}` : null)).filter(Boolean);
    if (errores.length) {
      renderError(errores);
      return;
    }
    renderResultado(compararEscenarios(comun, estados), comun, estados, { modo, datoPartida });
  });

  // ---------- presentación ----------
  const nombreRed = (red) => (red === "Aerea" ? "Aérea" : "Subterránea");
  // La referencia ya trae sus propios paréntesis (p. ej. «Penguin (6/1)»): se separa con « · ».
  function conductorTexto(s) {
    const e = s.eleccion;
    const detalle = s.red === "Aerea" ? (e.referencia ? ` · ${e.referencia}` : "") : ` · ${e.tipoPantalla}, ${s.conductor.nivelAislamientoKv} kV ${e.nivelAislamientoPct} %`;
    return `${e.material} ${e.calibre}${detalle}${s.n > 1 ? ` ×${s.n}` : ""}`;
  }
  const insignia = (texto, clase) => `<span class="badge ${clase}">${escapeHtml(texto)}</span>`;
  const estadoCumple = (ok, si = "Cumple", no = "No cumple") => (ok ? { texto: si, clase: "badge-success" } : { texto: no, clase: "badge-danger" });

  function renderError(errores) {
    const wrap = q("#resultado-wrap");
    wrap.innerHTML = `<div class="card tarjeta-borde"><div class="result-panel"><div class="callout callout-danger"><div>${errores.map(escapeHtml).join("<br>")}</div></div></div></div>`;
    wrap.scrollIntoView({ behavior: "smooth", block: "nearest" });
  }

  /** Conclusión en una línea: {ok, titulo, detalle} (la pantalla, el PDF y el Excel la dicen igual). */
  function conclusion(r) {
    const total = r.escenarios.length;
    if (!r.cumplen.length) {
      return { ok: false, titulo: `${total === 1 ? "El escenario no cumple" : "Ningún escenario cumple"} todos los criterios.`, detalle: "Revisa en la tabla qué criterio falla en cada uno." };
    }
    return {
      ok: true,
      titulo: total === 1 ? "El escenario cumple todos los criterios." : `Cumplen todos los criterios: ${r.cumplen.map((i) => `Escenario ${i + 1}`).join(", ")}.`,
      detalle: r.recomendado !== null ? `Recomendado: Escenario ${r.recomendado + 1}, el de menor costo total entre los que cumplen.` : "",
    };
  }

  /**
   * Modelo de la tabla comparativa: secciones con filas, y en cada fila una celda por escenario. La pantalla, el PDF y el
   * Excel se arman con él. La unidad va aparte (en pantalla, junto al número: «557.8 A»; en PDF y Excel, en su columna):
   * así «(A)» no se confunde con la fase A.
   * celda = { v: número | texto | null, dec, estado?: {texto, clase}, sub?: texto }
   */
  function modeloMatriz(r, comun, estados) {
    const X = r.escenarios;
    const fila = (etiqueta, unidad, celda, extra = {}) => ({ etiqueta, unidad, celdas: X.map((x, i) => celda(x, estados[i], i)), ...extra });
    const conN = (s, texto) => (s.n > 1 ? `${s.n} ${s.red === "Aerea" ? "conductores" : "circuitos"} por fase${texto ? ` · ${texto}` : ""}` : texto || null);
    const hayN = estados.some((s) => s.n > 1);
    const hayFalla = estados.some((s) => s.corrienteFallaKa !== null);
    const secciones = [
      {
        titulo: null,
        filas: [
          fila("Conductor", "", (x, s) => ({ v: `${nombreRed(s.red)} · ${conductorTexto(s)}`, texto: true })),
          fila("Tensión de línea", "kV", (x, s) => ({ v: s.tensionKv, dec: 1 })),
          fila("Corriente de operación", "A", (x) => ({ v: x.corrienteA, dec: 1 })),
        ],
      },
      {
        titulo: "Ampacidad",
        filas: [
          fila("Ampacidad por conductor", "A", (x) => (x.ampacidad.error ? { v: null, estado: { texto: "No calculable", clase: "badge-danger" } } : { v: x.ampacidad.porConductorA, dec: 0 })),
          ...(hayN ? [fila("Ampacidad total", "A", (x, s) => (x.ampacidad.error ? { v: null } : { v: x.ampacidad.totalA, dec: 0, sub: conN(s) }))] : []),
          fila("Uso de la ampacidad", "%", (x) => (x.ampacidad.error ? { v: null } : { v: x.ampacidad.usoPct, dec: 1, estado: estadoCumple(x.ampacidad.cumple, "Cumple", "Sobrecarga") }), { etiquetaEstado: "Ampacidad: cumplimiento" }),
        ],
      },
      {
        titulo: "Pérdidas",
        filas: [
          fila("Pérdidas", "%", (x) => ({ v: x.perdidas.pct, dec: 2, estado: { texto: x.perdidas.clase.etiqueta, clase: x.perdidas.clase.clase } }), { etiquetaEstado: "Pérdidas: clasificación" }),
          fila("Pérdidas de potencia", "kW", (x) => ({ v: x.perdidas.kw, dec: 1 })),
          fila("Energía perdida al año", "MWh", (x) => ({ v: x.perdidas.energiaMwhAnio, dec: 1 })),
        ],
      },
      {
        titulo: "Regulación",
        filas: [fila("Caída de tensión", "%", (x) => ({ v: x.regulacion.pct, dec: 2, estado: { texto: x.regulacion.clase.etiqueta, clase: x.regulacion.clase.clase } }), { etiquetaEstado: "Regulación: clasificación" })],
      },
      {
        titulo: "Cortocircuito",
        filas: [
          fila("Capacidad de cortocircuito", "kA", (x, s) => ({ v: x.cortocircuito.totalKa, dec: 2, sub: conN(s, `en ${fmt(s.tiempoDespejeS)} s`) })),
          ...(hayFalla
            ? [
                fila(
                  "Corriente de falla",
                  "kA",
                  (x) => (x.cortocircuito.corrienteFallaKa === null ? { v: "Sin dato", texto: true } : { v: x.cortocircuito.corrienteFallaKa, dec: 2, estado: estadoCumple(x.cortocircuito.cumple, "Soporta", "No soporta") }),
                  { etiquetaEstado: "Cortocircuito: cumplimiento" }
                ),
              ]
            : []),
        ],
      },
    ];
    if (X.some((x) => x.economia)) {
      const e = (fn) => (x) => (x.economia ? { v: fn(x.economia), dec: 0, pesos: true } : { v: "Sin costo", texto: true });
      secciones.push({
        titulo: `Costos a ${comun.economia.anios} años`,
        filas: [
          fila("Inversión inicial", "$", e((c) => c.inversion)),
          fila("Costo de las pérdidas (valor presente)", "$", e((c) => c.costoPerdidasVp)),
          fila("Costo total actualizado", "$", e((c) => c.costoTotal), { total: true }),
          fila("Diferencia frente al menor costo", "$", (x) =>
            !x.economia ? { v: "—", texto: true } : x.economia.diferenciaVsMejor === 0 ? { v: 0, dec: 0, pesos: true, estado: { texto: "Menor costo", clase: "badge-success" } } : { v: x.economia.diferenciaVsMejor, dec: 0, pesos: true, signo: true }
          ),
        ],
      });
    }
    secciones.push({
      titulo: "Veredicto",
      filas: [
        fila("Resultado", "", (x) => ({ v: x.cumpleTodo ? "Cumple todo" : "No cumple", texto: true, estado: estadoCumple(x.cumpleTodo, "Cumple todo", "No cumple"), sub: x.cumpleTodo ? null : `Falla: ${x.incumple.join(", ")}` }), { total: true }),
      ],
    });
    return { secciones, recomendado: r.recomendado, columnas: X.map((x, i) => `Escenario ${i + 1}`) };
  }

  /** Texto de una celda numérica con su unidad («557.8 A», «1.15 %», «$ 105,000,000»). */
  function textoCelda(c, unidad) {
    if (c.v === null || c.v === undefined) return "—";
    if (c.texto) return String(c.v);
    const n = num(c.v, c.dec, c.dec);
    if (c.pesos) return `${c.signo ? "+" : ""}$ ${n}`;
    return unidad ? `${n} ${unidad}` : n;
  }

  function matrizHtml(modelo) {
    const cab = modelo.columnas
      .map((t, i) => `<th class="num${i === modelo.recomendado ? " col-mejor" : ""}">${t}${i === modelo.recomendado ? ` ${insignia("Recomendado", "badge-success")}` : ""}</th>`)
      .join("");
    const ncol = modelo.columnas.length + 1;
    const celdaHtml = (c, f) => {
      const esVeredicto = f.etiqueta === "Resultado";
      const valor = esVeredicto ? "" : c.estado && c.v === null ? "" : escapeHtml(textoCelda(c, f.unidad));
      const badge = c.estado && !(c.estado.texto === "Menor costo") ? ` ${insignia(c.estado.texto, c.estado.clase)}` : "";
      const menor = c.estado?.texto === "Menor costo" ? insignia("Menor costo", c.estado.clase) : "";
      const texto = menor || `${valor}${badge}`.trim();
      const conductor = f.etiqueta === "Conductor" ? ' class="num vi-conductor-celda"' : ' class="num"';
      return `<td${conductor}>${texto}${c.sub ? `<div class="vi-sub">${escapeHtml(c.sub)}</div>` : ""}</td>`;
    };
    const cuerpo = modelo.secciones
      .map(
        (s) =>
          `<tbody${s.titulo ? ' class="vi-grupo"' : ""}>` +
          (s.titulo ? `<tr class="vi-seccion"><th colspan="${ncol}" scope="colgroup">${escapeHtml(s.titulo)}</th></tr>` : "") +
          s.filas.map((f) => `<tr${f.total ? ' class="total-row"' : ""}><td class="etiqueta-fila">${escapeHtml(f.etiqueta)}</td>${f.celdas.map((c) => celdaHtml(c, f)).join("")}</tr>`).join("") +
          `</tbody>`
      )
      .join("");
    return `<div class="table-wrap tabla-resultado tabla-matriz vi-matriz"><table><thead><tr><th></th>${cab}</tr></thead>${cuerpo}</table></div>`;
  }

  // ---------- exportar ----------
  const fechaArchivo = () => new Date().toISOString().slice(0, 10);
  const fechaLarga = () => new Date().toLocaleString("es-CO", { dateStyle: "long", timeStyle: "short" });

  function descargar(nombre, contenido, tipo) {
    const url = URL.createObjectURL(new Blob([contenido], { type: tipo }));
    const a = document.createElement("a");
    a.href = url;
    a.download = nombre;
    document.body.append(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  /** Datos de entrada comunes, en pares [etiqueta, valor] (para el PDF y el Excel). */
  function datosEntrada(comun, estados, { modo, datoPartida }) {
    const ec = comun.economia;
    return [
      ["Dato de partida", `${MODOS[modo]}: ${fmt(datoPartida)} ${modo === "potencia" ? "MW" : "MVA"}`],
      ["Factor de potencia", fmt(comun.factorPotencia)],
      ["Factor de carga (Fc)", fmt(comun.factorCarga, 4)],
      ["Longitud de la línea", `${fmt(comun.longitudKm)} km`],
      ...(ec ? [["Precio de la energía perdida", `${fmtPesos(ec.precioKwh)}/kWh (sube ${fmtPercent(ec.escaladaEnergiaPct)} al año)`], ["Tasa de descuento · años", `${fmtPercent(ec.tasaDescuentoPct)} · ${ec.anios} años`]] : [["Evaluación económica", "No incluida (sin precio de la energía)"]]),
    ];
  }

  const REFERENCIAS = `Referencias de diseño: pérdidas hasta ${OPTIMO_PERDIDAS} % óptimo · hasta ${LIMITE_PERDIDAS} % aceptable; regulación hasta ${OPTIMO_REGULACION} % óptimo · hasta ${LIMITE_REGULACION} % aceptable. La corriente de operación no debe superar la ampacidad.`;

  /** Documento de impresión (PDF): Carta, vertical hasta 3 escenarios y horizontal con más; siempre en claro. */
  function documentoPdf(modelo, conc, entrada) {
    const doc = document.createElement("div");
    doc.id = "doc-impresion";
    doc.className = `doc-impresion vi-doc${modelo.columnas.length > 3 ? " vi-doc-apaisado" : ""}`;
    const cab = modelo.columnas.map((t, i) => `<th class="num">${t}${i === modelo.recomendado ? "<br><small>Recomendado</small>" : ""}</th>`).join("");
    const ncol = modelo.columnas.length + 2;
    const cuerpo = modelo.secciones
      .map(
        (s) =>
          (s.titulo ? `<tr class="vi-doc-seccion"><td colspan="${ncol}">${escapeHtml(s.titulo)}</td></tr>` : "") +
          s.filas
            .map((f) => {
              const celdas = f.celdas
                .map((c) => {
                  const oculto = f.etiqueta === "Resultado" || (c.estado && (c.v === null || c.estado.texto === "Menor costo"));
                  const valor = oculto ? "" : escapeHtml(c.pesos ? textoCelda(c, "").replace("$ ", "") : textoCelda(c, ""));
                  const estado = c.estado ? `<span class="vi-doc-estado${c.estado.clase === "badge-danger" ? " malo" : c.estado.clase === "badge-warning" ? " alerta" : ""}">${escapeHtml(c.estado.texto)}</span>` : "";
                  return `<td class="num">${[valor, estado].filter(Boolean).join(" ")}${c.sub ? `<div class="vi-doc-sub">${escapeHtml(c.sub)}</div>` : ""}</td>`;
                })
                .join("");
              return `<tr${f.total ? ' class="vi-doc-total"' : ""}><td>${escapeHtml(f.etiqueta)}</td><td class="vi-doc-unidad">${escapeHtml(f.unidad)}</td>${celdas}</tr>`;
            })
            .join("")
      )
      .join("");
    doc.innerHTML =
      `<header class="doc-cab"><div class="doc-app">Herramientas de Ingeniería</div><h1>Valoración integral de conductores</h1><p class="doc-meta">${escapeHtml(fechaLarga())}</p></header>` +
      `<div class="vi-doc-conclusion${conc.ok ? "" : " malo"}"><strong>${escapeHtml(conc.titulo)}</strong> ${escapeHtml(conc.detalle)}</div>` +
      `<h3>Datos de la conexión</h3><table class="vi-doc-datos"><tbody>${entrada.map(([k, v]) => `<tr><td>${escapeHtml(k)}</td><td>${escapeHtml(v)}</td></tr>`).join("")}</tbody></table>` +
      `<h3>Comparación de escenarios</h3><div class="table-wrap"><table class="vi-doc-matriz"><thead><tr><th>Criterio</th><th>Unidad</th>${cab}</tr></thead><tbody>${cuerpo}</tbody></table></div>` +
      `<p class="vi-doc-nota">${escapeHtml(REFERENCIAS)} El detalle de cada escenario (datos de entrada y valores intermedios) está en la pestaña «Reporte» de la calculadora.</p>`;
    return doc;
  }

  function exportarPdf(modelo, conc, entrada) {
    document.getElementById("doc-impresion")?.remove();
    document.body.append(documentoPdf(modelo, conc, entrada));
    document.body.classList.add("imprimiendo-reporte");
    document.documentElement.classList.add("imprimiendo-reporte");
    window.addEventListener(
      "afterprint",
      () => {
        document.body.classList.remove("imprimiendo-reporte");
        document.documentElement.classList.remove("imprimiendo-reporte");
        document.getElementById("doc-impresion")?.remove();
      },
      { once: true }
    );
    window.print();
  }

  /** Libro de Excel: hoja «Comparación» (la tabla, con números de verdad y la unidad en su columna) y hoja «Reporte» (el texto completo). */
  function libroExcel(modelo, conc, entrada, reporte) {
    const n = modelo.columnas.length;
    const vacias = (estilo) => Array.from({ length: n + 2 }, () => ({ v: "", estilo }));
    const filas = [
      [{ v: "Valoración integral de conductores", estilo: "titulo" }],
      [{ v: `Herramientas de Ingeniería · ${fechaLarga()}`, estilo: "nota" }],
      [],
      [{ v: `${conc.titulo} ${conc.detalle}`.trim(), estilo: "etiqueta" }, ...Array.from({ length: n + 1 }, () => ({ v: "", estilo: "etiqueta" }))],
      [],
      [{ v: "Datos de la conexión", estilo: "seccion" }, { v: "", estilo: "seccion" }],
      ...entrada.map(([k, v]) => [{ v: k, estilo: "etiqueta" }, { v, estilo: "celda" }]),
      [],
      [{ v: "Criterio", estilo: "cabecera" }, { v: "Unidad", estilo: "cabecera" }, ...modelo.columnas.map((t, i) => ({ v: i === modelo.recomendado ? `${t} (recomendado)` : t, estilo: "cabecera" }))],
    ];
    const combinar = [`A1:${columna(n + 1)}1`, `A4:${columna(n + 1)}4`];
    for (const s of modelo.secciones) {
      if (s.titulo) {
        const fila = vacias("seccion");
        fila[0] = { v: s.titulo, estilo: "seccion" };
        filas.push(fila);
      }
      for (const f of s.filas) {
        const estilo = f.total ? "total" : "celda";
        const esVeredicto = f.etiqueta === "Resultado";
        filas.push([
          { v: f.etiqueta, estilo: f.total ? "total" : "etiqueta" },
          { v: f.unidad, estilo },
          ...f.celdas.map((c) => {
            if (esVeredicto) return { v: c.sub ? `${c.v} (${c.sub.replace(/^Falla: /, "")})` : c.v, estilo };
            if (c.v === null || c.v === undefined) return { v: c.estado?.texto ?? "—", estilo };
            return c.texto ? { v: c.v, estilo } : { v: c.v, dec: c.dec, estilo };
          }),
        ]);
        // la clasificación (Óptimo / Cumple / Soporta…) va en su propia fila: la celda del número queda numérica
        if (f.etiquetaEstado && f.celdas.some((c) => c.estado)) {
          filas.push([{ v: f.etiquetaEstado, estilo: "etiqueta" }, { v: "", estilo }, ...f.celdas.map((c) => ({ v: c.estado?.texto ?? "—", estilo }))]);
        }
        // lo que en pantalla va debajo del número (p. ej. «2 conductores por fase») también se conserva
        if (!esVeredicto && f.celdas.some((c) => c.sub)) {
          filas.push([{ v: `${f.etiqueta}: detalle`, estilo: "etiqueta" }, { v: "", estilo }, ...f.celdas.map((c) => ({ v: c.sub ?? "", estilo }))]);
        }
      }
    }
    filas.push([], [{ v: REFERENCIAS, estilo: "nota" }]);
    combinar.push(`A${filas.length}:${columna(n + 1)}${filas.length}`);
    return crearXlsx([
      { nombre: "Comparación", anchos: [38, 9, ...modelo.columnas.map(() => 30)], combinar, filas },
      { nombre: "Reporte", anchos: [120], filas: reporte.split("\n").map((l) => [l]) },
    ]);
  }

  function exportarHtml() {
    return `
      <details class="menu-mas vi-exportar no-print">
        <summary class="btn btn-sm btn-con-icono" aria-label="Exportar la comparación">${icon("download")} Exportar ${icon("chevronDown")}</summary>
        <div class="menu-mas-lista">
          <button type="button" data-exportar="pdf">PDF (imprimir o guardar)</button>
          <button type="button" data-exportar="xlsx">Excel (.xlsx)</button>
        </div>
      </details>`;
  }

  function avisosHtml(r, comun, estados) {
    const avisos = [];
    r.escenarios.forEach((x, i) => {
      if (x.ampacidad.error) avisos.push(`Escenario ${i + 1}: ${x.ampacidad.error}`);
    });
    const sinCosto = estados.map((s, i) => (s.costos ? -1 : i)).filter((i) => i >= 0);
    if (comun.economia && sinCosto.length && sinCosto.length < estados.length) {
      avisos.push(`Sin costo del conductor, no entra en la comparación de costos: ${sinCosto.map((i) => `Escenario ${i + 1}`).join(", ")}.`);
    }
    if (!comun.economia && estados.some((s) => s.costos)) avisos.push("Para comparar costos falta el precio de la energía perdida (tarjeta «Evaluación económica»).");
    return avisos.length ? `<div class="callout callout-warning" style="margin-top: var(--space-4);"><div>${avisos.map(escapeHtml).join("<br>")}</div></div>` : "";
  }

  function reporteTexto(r, comun, estados, { modo, datoPartida }) {
    const hayAerea = estados.some((s) => s.red === "Aerea");
    const haySubt = estados.some((s) => s.red !== "Aerea");
    const a = comun.aerea;
    const s = comun.subterranea;
    const ec = comun.economia;
    const potenciaActiva = `Potencia activa: ${fmt(comun.potenciaActivaMw)} MW`;
    const parametros = estados.map((e, i) =>
      [
        ``,
        `Escenario ${i + 1}:`,
        `  Tensión de línea: ${fmt(e.tensionKv)} kV`,
        `  Tipo de red: ${nombreRed(e.red)}`,
        `  Material/Tipo de conductor: ${e.eleccion.material}`,
        `  Calibre: ${e.eleccion.calibre}`,
        ...(e.red === "Aerea"
          ? [
              `  Referencia: ${e.eleccion.referencia}`,
              `  Conductores por fase: ${e.n}`,
              ...(e.n > 1 ? [`  Separación entre subconductores del haz: ${fmt(e.separacionHazM)} m`] : []),
              `  Distancias entre fases A-B / A-C / B-C: ${fmt(e.dabM)} / ${fmt(e.dacM)} / ${fmt(e.dbcM)} m`,
            ]
          : [
              `  Cable: monopolar, pantalla de ${e.eleccion.tipoPantalla.toLowerCase()}, aislamiento ${e.conductor.nivelAislamientoKv} kV al ${e.eleccion.nivelAislamientoPct} %`,
              `  Circuitos en paralelo por fase: ${e.n}`,
              `  Otros circuitos en el banco: ${e.otrosCircuitos}`,
              `  Puesta a tierra de las pantallas: ${e.puestaTierra}`,
              `  Separación entre fases (trébol): ${fmt(e.separacionFasesM, 3)} m`,
              ...(e.n + e.otrosCircuitos > 1 ? [`  Separación entre ductos: ${fmt(e.separacionDuctosM)} m`] : []),
            ]),
        `  Resistencia AC a 75°C (por conductor, catálogo): ${fmt(e.conductor.resistenciaOhmKm, 4)} Ω/km`,
        `  Corriente de falla: ${e.corrienteFallaKa === null ? "no indicada" : `${fmt(e.corrienteFallaKa)} kA`}`,
        `  Tiempo de despeje de la falla: ${fmt(e.tiempoDespejeS)} s`,
        `  Costo del conductor: ${e.costos ? `${fmtPesos(e.costos.costoConductorKm)}/km` : "no indicado"}`,
        ...(e.costos ? [`  Costo de instalación: ${e.costos.instalacionIndicada ? `${fmtPesos(e.costos.costoInstalacionKm)}/km` : "no indicado (solo se considera el conductor)"}`] : []),
      ].join("\n")
    );
    const resultados = r.escenarios.map((x, i) => {
      const e = estados[i];
      const cc = x.cortocircuito;
      return [
        ``,
        `Escenario ${i + 1} — ${nombreRed(e.red)} · ${conductorTexto(e)} a ${fmt(e.tensionKv)} kV:`,
        `  Corriente de operación: ${fmt(x.corrienteA)} A`,
        ...(x.ampacidad.error
          ? [`  Ampacidad: no calculable (${x.ampacidad.error})`]
          : [
              `  Ampacidad por conductor: ${fmt(x.ampacidad.porConductorA, 1)} A${e.red !== "Aerea" ? ` (${x.ampacidad.circuitosBanco} circuito${x.ampacidad.circuitosBanco > 1 ? "s" : ""} en el banco)` : ""}`,
              `  Ampacidad total${e.n > 1 ? ` (${e.n} ${e.red === "Aerea" ? "conductores" : "circuitos"} por fase)` : ""}: ${fmt(x.ampacidad.totalA, 1)} A`,
              `  Uso de la ampacidad: ${fmtPercent(x.ampacidad.usoPct, 1)} (${x.ampacidad.cumple ? "cumple" : "sobrecarga"})`,
            ]),
        `  Resistencia efectiva (R/N): ${fmt(x.perdidas.resistenciaEfectivaOhmKm, 4)} Ω/km`,
        `  Pérdidas: ${fmtPercent(x.perdidas.pct)} (${x.perdidas.clase.etiqueta}) · ${fmt(x.perdidas.kw, 1)} kW · ${num(x.perdidas.energiaMwhAnio, 1, 1)} MWh al año`,
        `  Reactancia inductiva: ${fmt(x.regulacion.reactanciaOhmKm, 4)} Ω/km`,
        `  Impedancia efectiva: ${fmt(x.regulacion.impedanciaOhmKm, 4)} Ω/km`,
        `  Caída de tensión: ${fmtPercent(x.regulacion.pct)} (${x.regulacion.clase.etiqueta})`,
        `  Capacidad de cortocircuito: ${fmt(cc.totalKa)} kA en ${fmt(e.tiempoDespejeS)} s${e.n > 1 ? ` (${e.n} × ${fmt(cc.porConductorKa)} kA)` : ""}, desde ${fmt(cc.tempOperacionC)} °C`,
        ...(cc.corrienteFallaKa === null
          ? []
          : [`  Corriente de falla: ${fmt(cc.corrienteFallaKa)} kA (${cc.cumple ? "la soporta" : "no la soporta"}); área mínima por conductor: ${fmt(cc.areaMinimaMm2)} mm²`]),
        ...(x.economia
          ? [
              `  Inversión inicial: ${fmtPesos(x.economia.inversion)}`,
              `  Costo de las pérdidas (valor presente): ${fmtPesos(x.economia.costoPerdidasVp)}`,
              `  Costo total actualizado: ${fmtPesos(x.economia.costoTotal)}`,
            ]
          : []),
        `  Veredicto: ${x.cumpleTodo ? "cumple todos los criterios" : `no cumple (${x.incumple.join(", ")})`}`,
      ].join("\n");
    });
    const conclusion = !r.cumplen.length
      ? "Ningún escenario cumple todos los criterios."
      : `Cumplen todos los criterios: ${r.cumplen.map((i) => `Escenario ${i + 1}`).join(", ")}.${r.recomendado !== null ? ` Recomendado (menor costo total entre los que cumplen): Escenario ${r.recomendado + 1}.` : ""}`;
    return [
      `CÁLCULO DE VALORACIÓN INTEGRAL`,
      ``,
      ``,
      `PARÁMETROS DE ENTRADA:`,
      LINEA_REPORTE,
      `Dato de partida: ${MODOS[modo]} (${fmt(datoPartida)} ${modo === "potencia" ? "MW" : "MVA"})`,
      `Factor de potencia: ${fmt(comun.factorPotencia)}`,
      `Factor de carga (Fc): ${fmt(comun.factorCarga, 4)}`,
      `Longitud de la línea: ${fmt(comun.longitudKm)} km`,
      ...(hayAerea
        ? [
            `Líneas aéreas: temperatura ambiente ${fmt(a.taC)} °C, máxima del conductor ${fmt(a.tcC)} °C, viento ${fmt(a.vwMs)} m/s a ${fmt(a.anguloVientoDeg, 0)}°, elevación ${fmt(a.elevacionM, 0)} m`,
            `  ε ${fmt(a.epsilon)}, α ${fmt(a.alfa)}, Qse ${fmt(a.qseWm2, 0)} W/m², θ ${fmt(a.thetaDeg, 0)}°`,
          ]
        : []),
      ...(haySubt
        ? [
            `Cables subterráneos: temperatura máxima del conductor ${fmt(s.tempMaxC)} °C, terreno ${fmt(s.tempTerrenoC)} °C, resistividad del suelo ${fmt(s.rhoSueloKmW)} K·m/W`,
            `  ducto ${fmt(s.uDuctoKmW)} K·m/W, profundidad ${fmt(s.profundidadBancoM)} m, ${fmt(s.frecuenciaHz, 0)} Hz`,
          ]
        : []),
      `Temperatura máxima admisible en falla: ${fmt(comun.tempFallaC)} °C`,
      ...(ec
        ? [
            `Precio de la energía perdida (año 1): ${fmtPesos(ec.precioKwh)}/kWh`,
            `Aumento anual del precio: ${fmtPercent(ec.escaladaEnergiaPct)}`,
            `Tasa de descuento: ${fmtPercent(ec.tasaDescuentoPct)}`,
            `Años de análisis: ${ec.anios}`,
            `Crecimiento anual de la demanda: ${fmtPercent(ec.crecimientoDemandaPct)}`,
          ]
        : [`Evaluación económica: no incluida (sin precio de la energía)`]),
      ...parametros,
      ``,
      ``,
      `RESULTADOS:`,
      LINEA_REPORTE,
      ...(modo === "potencia" ? [`Potencia aparente: ${fmt(r.escenarios[0].potenciaS)} MVA`] : [potenciaActiva]),
      ...resultados,
      ``,
      `Conclusión: ${conclusion}`,
    ].join("\n");
  }

  function renderResultado(r, comun, estados, dato) {
    const wrap = q("#resultado-wrap");
    const modelo = modeloMatriz(r, comun, estados);
    const conc = conclusion(r);
    const reporte = reporteTexto(r, comun, estados, dato);
    const resultado = `
      <div class="result-panel">
        <div class="vi-cabecera">
          <div class="callout ${conc.ok ? "callout-success" : "callout-warning"}"><div><strong>${escapeHtml(conc.titulo)}</strong>${conc.detalle ? ` ${escapeHtml(conc.detalle)}` : ""}</div></div>
          ${exportarHtml()}
        </div>
        ${matrizHtml(modelo)}
        <p class="text-muted text-sm" style="margin: var(--space-3) 0 0;">${escapeHtml(REFERENCIAS)}</p>
        ${avisosHtml(r, comun, estados)}
      </div>`;
    wrap.innerHTML = tarjetaResultadosHtml({
      resultado,
      reporte: reporteHtml(reporte, ETIQUETAS_REPORTE),
      formulasPlano: FORMULAS_TEXTO,
    });
    activarPestanas(wrap, { grupos: FORMULAS_TEX, etiquetas: FORMULAS_ETIQUETAS, nota: FORMULAS_NOTA });

    // «Exportar» abre un menú con dos formatos; se cierra al elegir uno o al pulsar fuera
    const menu = wrap.querySelector(".vi-exportar");
    const entrada = datosEntrada(comun, estados, dato);
    menu.addEventListener("click", (e) => {
      const boton = e.target.closest("[data-exportar]");
      if (!boton) return;
      menu.open = false;
      if (boton.dataset.exportar === "pdf") exportarPdf(modelo, conc, entrada);
      else descargar(`valoracion-integral-${fechaArchivo()}.xlsx`, libroExcel(modelo, conc, entrada, reporte), MIME_XLSX);
    });
    const cerrarFuera = (e) => {
      if (!menu.isConnected) return document.removeEventListener("click", cerrarFuera);
      if (!menu.contains(e.target)) menu.open = false;
    };
    document.addEventListener("click", cerrarFuera);

    wrap.scrollIntoView({ behavior: "smooth", block: "nearest" });
  }

  return antesDeSalir;
}
