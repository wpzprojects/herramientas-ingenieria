// Valoración integral: evalúa de 1 a 6 alternativas para una misma conexión (misma potencia) con todos los criterios a la vez
// (ampacidad, pérdidas, regulación, cortocircuito y costo total actualizado). Pedida por el usuario (2026-09-25) para no
// depender de la IA en las validaciones integrales. Cada alternativa es un circuito a una tensión con 1 a 4 tramos en serie
// (cada tramo con su red, conductor, conductores por fase y longitud). Tarjetas: «Datos de la conexión» (con la tensión
// general o, con la casilla «Por alternativa», una tensión en cada alternativa), una tarjeta por alternativa y, al final y
// plegada, «Evaluación económica (opcional)» con los supuestos y los costos de cada tramo (lo que no es técnico va aparte).
// Lo que casi nunca cambia va plegado en «Parámetros avanzados». La lógica vive en ../calc/valoracion-integral.js, que
// combina los motores de las demás calculadoras sin tocarlos. (Internamente cada alternativa se sigue llamando «escenario».)

import { fmt, fmtPercent, loadData, distinct, escapeHtml } from "../util/format.js";
import { icon } from "../icons.js";
import { potenciaActivaMw } from "../calc/circuito.js";
import {
  compararEscenarios,
  calibreMinimo,
  analizarAlternativa,
  sensibilidadInstalacion,
  pesoConductoresKgKm,
  datosConductor,
  nivelAislamientoPara,
  CALIBRES_SUBTERRANEOS,
  MIN_ESCENARIOS,
  MAX_ESCENARIOS,
  MAX_TRAMOS,
  MAX_CIRCUITOS_BANCO,
  LIMITE_PERDIDAS,
  LIMITE_REGULACION,
} from "../calc/valoracion-integral.js";
import { UMBRAL_OPTIMO_PCT as OPTIMO_PERDIDAS } from "../calc/perdidas-tramos.js";
import { UMBRAL_OPTIMO_PCT as OPTIMO_REGULACION } from "../calc/regulacion-tramos.js";
import { LINEA_REPORTE, reporteHtml, tarjetaResultadosHtml, activarPestanas } from "../util/resultados-ui.js";
import { activarInfos } from "../util/info-campo.js";
import { activarPlegables, plegarTarjeta } from "../util/tarjetas-plegables.js";
import { guardarEstado, leerEstado } from "../util/persistencia-calculo.js";
import { aplicarDefectos, leerDefectos } from "../util/valores-defecto.js";
import { crearXlsx, columna, MIME_XLSX } from "../util/xlsx.js";
import { crearDocxDocumento, MIME_DOCX } from "../ai/docx.js";
import { activarMiles, leerMiles, reformatear, PATRON_MILES } from "../util/campo-miles.js";
import { guardar as guardarValoracion, eliminar as eliminarValoracion, sincronizar, listarLocales, leerDatos, MAX_NOMBRE } from "../util/valoraciones-guardadas.js";

const RUTA = "/calculos/valoracion-integral";

const ETIQUETAS_REPORTE = ["CÁLCULO DE VALORACIÓN INTEGRAL", "PARÁMETROS DE ENTRADA:", "RESULTADOS:"];

const MODOS = { potencia: "Potencia activa", aparente: "Potencia aparente" };

const INFO_REFERENCIA = "Un mismo calibre puede tener varias construcciones (número de hilos, diámetro) con resistencia distinta.";
const INFO_N_AEREA = "Con más de uno forman un haz: resistencia R/N, radio medio geométrico del haz y N veces la ampacidad de un conductor.";
const INFO_N_SUBT = "En subterránea son circuitos (ternas) en paralelo, cada uno en su ducto del mismo banco de ductos.";

// Números con coma de miles para el dinero (el resto de la app usa punto decimal, en-US).
const num = (v, min = 0, max = 0) => (Number.isFinite(v) ? v.toLocaleString("en-US", { minimumFractionDigits: min, maximumFractionDigits: max }) : "—");
const fmtPesos = (v) => (Number.isFinite(v) ? `$ ${num(v)}` : "—");
const valor = (input) => leerMiles(input.value); // acepta comas de miles (campos de dinero)

export async function render(container) {
  const desnudos = await loadData("conductores-desnudos");
  const xlpe = await loadData("conductores-xlpe");
  const cables = await loadData("construccion-cable-subterraneo");
  const catalogos = { desnudos, xlpe, cables };
  const tiposAereos = distinct(desnudos, "tipo");
  const materialesSubt = distinct(cables, "material");

  container.innerHTML = `
    <div class="breadcrumb"><a href="#/">Inicio</a> <span>/</span> <a href="#/calculos">Cálculos</a> <span>/</span> <span>Valoración integral</span></div>
    <div class="vi-titulo">
      <h1 class="page-title">Valoración integral</h1>
      <button type="button" class="btn btn-ghost btn-sm vi-btn-historial" aria-expanded="false" aria-controls="vi-historial">${icon("history")} Guardadas</button>
    </div>
    <p class="vi-trabajando" hidden></p>
    <div class="card tarjeta-borde vi-historial" id="vi-historial" hidden>
      <div class="form-section-title">${icon("history")} Valoraciones guardadas
        <button type="button" class="btn btn-ghost btn-sm vi-historial-cerrar">${icon("close")} Cerrar</button>
      </div>
      <p class="vi-historial-estado text-muted text-sm"></p>
      <ul class="vi-historial-lista"></ul>
    </div>

    <form id="form-calc" novalidate>
      <div class="card tarjeta-borde form-section">
        <div class="form-section-title">${icon("circuitVoltmeter")} Datos de la conexión</div>
        <div class="grid-2">
          <div class="field">
            <label for="f-modo" data-info="La corriente no se ofrece como dato de partida porque depende de la tensión, y cada alternativa puede tener la suya.">Dato de partida</label>
            <select id="f-modo">
              <option value="potencia">${MODOS.potencia}</option>
              <option value="aparente">${MODOS.aparente}</option>
            </select>
          </div>
          <div class="field" id="wrap-potencia">
            <label for="f-potencia">Potencia activa (MW)</label>
            <input type="number" id="f-potencia" min="0" step="any" value="9.9" required>
          </div>
          <div class="field" id="wrap-aparente" hidden>
            <label for="f-aparente">Potencia aparente (MVA)</label>
            <input type="number" id="f-aparente" min="0" step="any" value="11">
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
            <label for="f-tension" data-info="La misma para todas las alternativas. Marca «Por alternativa» para comparar tensiones distintas (p. ej. 34.5 kV frente a 13.2 kV): entonces cada alternativa pide la suya.">Tensión de línea (kV)</label>
            <div class="input-with-toggle">
              <input type="number" id="f-tension" min="0.1" step="any" value="34.5" required>
              <label class="checkbox-row"><input type="checkbox" id="chk-tension-alt"> Por alternativa</label>
            </div>
          </div>
        </div>

        <details class="vi-avanzado">
          <summary>Parámetros avanzados</summary>
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
          <div class="grid-2 vi-cc-general">
            <div class="field">
              <label for="f-falla" data-info="Opcional. Corriente de cortocircuito en el punto de conexión; se verifica en todos los tramos de todas las alternativas. Vacío = solo se informa la capacidad de los conductores. Con «Por alternativa» marcada en la tensión, cada alternativa pide la suya.">Corriente de falla (kA)</label>
              <input type="number" id="f-falla" min="0" step="any">
            </div>
            <div class="field">
              <label for="f-tiempo">Tiempo de despeje de la falla (s)</label>
              <input type="number" id="f-tiempo" min="0.01" max="60" step="any" value="0.3" required>
            </div>
          </div>
          <div class="grid-2">
            <div class="field"><label for="f-tfalla">Temperatura máxima admisible en falla (°C)</label><input type="number" id="f-tfalla" min="0" max="500" step="0.1" value="250" required></div>
          </div>
        </details>
      </div>

      <div id="tramos-container"></div>

      <div class="card tarjeta-borde form-section vi-economia" style="margin-top: var(--space-4);">
        <div class="form-section-title">${icon("coin")} Evaluación económica (opcional)</div>
        <div class="grid-2">
          <div class="field">
            <label for="f-precio" data-info="Lo que cuesta la energía que se pierde en la línea (compra o costo reconocido), valor del año 1. Si se deja vacío no se comparan costos; también hace falta el costo del conductor de cada tramo.">Precio de la energía perdida ($/kWh)</label>
            <input type="text" inputmode="decimal" id="f-precio" pattern="${PATRON_MILES}" autocomplete="off">
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
        <div class="grid-2">
          <div class="field">
            <label for="f-crecimiento" data-info="Aumento anual de la demanda a partir del año 1. Con 0 % la demanda se mantiene (p. ej. una planta de generación). Solo afecta los costos: los criterios técnicos se evalúan con la demanda indicada.">Crecimiento anual de la demanda (%)</label>
            <input type="number" id="f-crecimiento" min="0" max="100" step="any" value="0" required>
          </div>
        </div>
        <div class="vi-avanzado-grupo vi-costos-titulo">Costos de conductor e instalación</div>
        <div class="vi-costos"></div>
      </div>

      <div class="btn-row btn-row--agregar">
        <span class="vi-acciones-calc">
          <button type="submit" class="btn btn-primary">Calcular</button>
          <button type="button" class="btn vi-btn-guardar">${icon("deviceFloppy")} Guardar</button>
        </span>
      </div>
      <div class="card tarjeta-borde vi-guardar" hidden>
        <div class="field">
          <label for="f-nombre-guardado">Nombre de la valoración</label>
          <input type="text" id="f-nombre-guardado" maxlength="${MAX_NOMBRE}" placeholder="p. ej. Solar Mesa Mamonal — alternativas de conexión">
        </div>
        <div class="vi-guardar-acciones"></div>
      </div>
      <p class="vi-guardar-msg text-sm" hidden></p>
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
  const fTension = q("#f-tension");
  const chkTensionAlt = q("#chk-tension-alt");
  const tarjetaEconomia = q(".vi-economia");
  const costosCont = q(".vi-costos");
  activarMiles(q("#f-precio"));
  reformatear(q("#f-precio")); // por si Perfil > Calculadoras puso un precio por defecto
  plegarTarjeta(tarjetaEconomia, true); // opcional: nace plegada para pasar rápido por ella
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
  const COMUNES = ["modo", "potencia", "aparente", "fp", "fc", "tension", "ta", "tc", "vw", "angulo", "elevacion", "epsilon", "alfa", "qse", "theta", "tempmax", "tempterreno", "rhosuelo", "uducto", "profundidad", "frecuencia", "falla", "tiempo", "tfalla", "precio", "escalada", "tasa", "anios", "crecimiento"];
  const campo = (id) => q(`#f-${id}`);
  const n = (id) => parseFloat(campo(id).value);

  // Si falta un dato obligatorio dentro de un «Parámetros avanzados» plegado, se abre solo (como las tarjetas plegables).
  form.addEventListener("invalid", (e) => {
    const det = e.target.closest("details");
    if (det) det.open = true;
  }, true);

  const nombreRed = (red) => (red === "Aerea" ? "Aérea" : "Subterránea");
  const porAlternativa = () => chkTensionAlt.checked;

  // ---------- tramos ----------
  /**
   * Un tramo dentro de una alternativa (id = «alternativa-tramo», p. ej. «0-1»). Tiene tres partes que viven en sitios
   * distintos: sus datos principales (en la tarjeta de la alternativa), su disposición (dentro del «Parámetros avanzados»
   * de la alternativa) y sus costos (en la tarjeta «Evaluación económica»). `tensionKv()` da la tensión de la alternativa.
   */
  function crearTramo(id, tensionKv, longitudInicial) {
    const cont = document.createElement("div");
    cont.innerHTML = `
      <div class="vi-tramo">
        <div class="vi-tramo-cab" hidden>
          <span class="vi-tramo-titulo">Tramo 1</span>
          <button type="button" class="btn btn-ghost btn-sm vi-quitar-tramo">${icon("close")} Quitar tramo</button>
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
            <label for="f-longitud-${id}">Longitud (km)</label>
            <input type="number" id="f-longitud-${id}" min="0.001" step="any" value="${longitudInicial}" required>
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
        <div class="grid-2 ultima">
          <div class="field vi-campo-referencia">
            <label for="f-referencia-${id}" data-info="${INFO_REFERENCIA}">Referencia</label>
            <select id="f-referencia-${id}" required></select>
          </div>
          <div class="field">
            <label for="f-n-${id}" class="vi-label-n" data-info="${INFO_N_AEREA}">Conductores por fase</label>
            <input type="number" id="f-n-${id}" min="1" max="8" step="1" value="1" required>
          </div>
        </div>
      </div>
      <div class="vi-tramo-avanzado">
        <div class="vi-avanzado-grupo vi-tramo-avz-titulo">Disposición del conductor</div>
        <div class="vi-solo-aerea">
          <div class="grid-2">
            <div class="field" hidden>
              <label for="f-sephaz-${id}" data-info="Distancia entre los conductores de una misma fase (haz). Aparece solo con más de un conductor por fase.">Separación entre subconductores del haz (m)</label>
              <input type="number" id="f-sephaz-${id}" min="0.01" max="5" step="0.01" value="0.4" disabled>
            </div>
          </div>
          <div class="grid-3">
            <div class="field">
              <label for="f-dab-${id}" data-info="Las tres distancias vienen con los valores iniciales de la calculadora de Regulación; ajústalas a la estructura del tramo.">Distancia entre fases A-B (m)</label>
              <input type="number" id="f-dab-${id}" min="0.01" step="0.01" value="2" required>
            </div>
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
              <label for="f-pct-${id}" data-info="El nivel de aislamiento (15, 35 o 46 kV) se elige solo según la tensión de la alternativa.">Nivel de aislamiento (%)</label>
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
      </div>
      <div class="vi-costo-tramo">
        <div class="vi-costo-titulo">Alternativa 1</div>
        <div class="vi-costo-detalle"></div>
        <div class="grid-2">
          <div class="field">
            <label for="f-costo-cond-${id}" data-info="Precio de un solo conductor por km; se multiplica por las 3 fases, los conductores por fase y la longitud del tramo. Si falta en algún tramo, la alternativa no entra en la comparación de costos.">Costo del conductor ($/km)</label>
            <input type="text" inputmode="decimal" id="f-costo-cond-${id}" pattern="${PATRON_MILES}" autocomplete="off">
          </div>
          <div class="field">
            <label for="f-costo-inst-${id}" data-info="Costos por km de suministro e instalación de postes, aisladores, herrajes, crucetería, estructura metálica, obra civil, etc. (sin suministro del conductor). Si el campo se deja vacío o en cero, solo se considera el costo del conductor en el análisis.">Costo de instalación ($/km)</label>
            <input type="text" inputmode="decimal" id="f-costo-inst-${id}" pattern="${PATRON_MILES}" autocomplete="off">
          </div>
        </div>
      </div>`;
    const [bloque, avanzado, filaCosto] = cont.children;
    filaCosto.querySelectorAll("input").forEach(activarMiles);
    [bloque, avanzado, filaCosto].forEach((el) => activarInfos(el));
    const buscar = (s) => bloque.querySelector(s) ?? avanzado.querySelector(s) ?? filaCosto.querySelector(s);
    const f = Object.fromEntries(
      [["red", "red"], ["longitud", "longitud"], ["material", "material"], ["calibre", "calibre"], ["referencia", "referencia"], ["n", "n"], ["costoCond", "costo-cond"], ["costoInst", "costo-inst"], ["sephaz", "sephaz"], ["dab", "dab"], ["dac", "dac"], ["dbc", "dbc"], ["pantalla", "pantalla"], ["pct", "pct"], ["tierra", "tierra"], ["sepfases", "sepfases"], ["otros", "otros"], ["sepductos", "sepductos"]].map(([k, s]) => [k, buscar(`#f-${s}-${id}`)])
    );
    const grupoAerea = avanzado.querySelector(".vi-solo-aerea");
    const grupoSubt = avanzado.querySelector(".vi-solo-subt");
    const campoReferencia = bloque.querySelector(".vi-campo-referencia");
    const titulo = bloque.querySelector(".vi-tramo-titulo");
    const tituloAvz = avanzado.querySelector(".vi-tramo-avz-titulo");
    const tituloCosto = filaCosto.querySelector(".vi-costo-titulo");
    const detalleCosto = filaCosto.querySelector(".vi-costo-detalle");
    let numero = 1;
    let alternativa = 1;
    let variosTramos = false;
    const esAerea = () => f.red.value === "Aerea";
    const opciones = (lista, vacio) =>
      lista.length ? `<option value="">Seleccione…</option>` + lista.map((v) => `<option value="${escapeHtml(v)}">${escapeHtml(v)}</option>`).join("") : `<option value="">${vacio}</option>`;

    // Grupo oculto = campos deshabilitados, para que no bloqueen «Calcular».
    function mostrarGrupo(grupo, visible) {
      grupo.hidden = !visible;
      grupo.querySelectorAll("input, select").forEach((el) => (el.disabled = !visible));
    }
    function ponerTitulos() {
      const red = nombreRed(f.red.value);
      titulo.textContent = `Tramo ${numero} · ${red}`;
      tituloAvz.textContent = variosTramos ? `Tramo ${numero} · ${red}: disposición del conductor` : `Disposición del conductor (${red.toLowerCase()})`;
      tituloCosto.textContent = variosTramos ? `Alternativa ${alternativa} · Tramo ${numero}` : `Alternativa ${alternativa}`;
      // Qué conductor es, para no tener que subir a buscarlo: red · conductor · tensión · conductores por fase · longitud
      const nn = parseInt(f.n.value, 10) || 1;
      const conductor = f.calibre.value ? `${f.material.value} ${f.calibre.value}${esAerea() && f.referencia.value ? ` · ${f.referencia.value}` : ""}` : "conductor sin elegir";
      const porFase = `${nn} ${esAerea() ? (nn > 1 ? "conductores" : "conductor") : nn > 1 ? "circuitos" : "circuito"} por fase`;
      const kv = tensionKv();
      const longitud = parseFloat(f.longitud.value);
      detalleCosto.textContent = [red, conductor, kv > 0 ? `${fmt(kv, 1)} kV` : null, porFase, longitud > 0 ? `${fmt(longitud)} km` : null].filter(Boolean).join(" · ");
    }

    function poblarMaterial() {
      const lista = esAerea() ? tiposAereos : materialesSubt;
      f.material.innerHTML = lista.map((m) => `<option value="${escapeHtml(m)}">${escapeHtml(m)}</option>`).join("");
      mostrarGrupo(grupoAerea, esAerea());
      mostrarGrupo(grupoSubt, !esAerea());
      const infoN = bloque.querySelector(".vi-label-n + .info-popover"); // el cuadro «i» copia el texto al crearse: se actualiza aparte
      if (infoN) infoN.textContent = esAerea() ? INFO_N_AEREA : INFO_N_SUBT;
      f.n.max = esAerea() ? 8 : MAX_CIRCUITOS_BANCO;
      ponerTitulos();
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

    // La referencia (construcción exacta) solo existe en los conductores aéreos: en subterránea el campo ni se muestra.
    function poblarReferencia() {
      campoReferencia.hidden = !esAerea();
      if (!esAerea()) {
        f.referencia.innerHTML = "";
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
      if (esAerea()) return;
      const nivel = nivelAislamientoPara(tensionKv());
      const previo = f.pct.value;
      const pcts = [...new Set(cables.filter((r) => r.material === f.material.value && (!f.calibre.value || r.calibre_awg_kcmil === f.calibre.value) && r.tipo_pantalla === f.pantalla.value && r.nivel_aislamiento_kv === nivel).map((r) => r.nivel_aislamiento_pct))].sort((a, b) => a - b);
      f.pct.innerHTML = pcts.length ? pcts.map((p) => `<option value="${p}">${p} %</option>`).join("") : `<option value="">No disponible</option>`;
      if (pcts.includes(Number(previo))) f.pct.value = previo;
    }

    // Separación del haz (aérea) solo con N > 1; separación entre ductos (subterránea) solo con más de un circuito en el banco.
    function syncDependientes() {
      const nn = parseInt(f.n.value, 10) || 1;
      if (esAerea()) {
        f.sephaz.disabled = nn <= 1;
        f.sephaz.required = nn > 1;
        f.sephaz.closest(".field").hidden = nn <= 1;
        f.sephaz.closest(".grid-2").hidden = nn <= 1;
        f.n.setCustomValidity("");
      } else {
        const total = nn + (parseInt(f.otros.value, 10) || 0);
        f.sepductos.disabled = total <= 1;
        f.sepductos.required = total > 1;
        f.sepductos.closest(".field").hidden = total <= 1;
        f.n.setCustomValidity(total > MAX_CIRCUITOS_BANCO ? `El banco de ductos admite hasta ${MAX_CIRCUITOS_BANCO} circuitos en total (conductores por fase + otros circuitos).` : "");
      }
    }

    f.material.addEventListener("change", poblarCalibre);
    // el título de los costos se actualiza con cada dato del conductor
    f.calibre.addEventListener("change", () => {
      poblarReferencia();
      poblarPct();
    });
    for (const k of ["material", "calibre", "referencia", "n", "longitud"]) f[k].addEventListener(k === "n" || k === "longitud" ? "input" : "change", () => ponerTitulos());
    f.pantalla.addEventListener("change", poblarPct);
    f.n.addEventListener("input", syncDependientes);
    f.otros.addEventListener("input", syncDependientes);
    poblarMaterial();

    const CAMPOS_BRUTO = ["longitud", "n", "costoCond", "costoInst", "sephaz", "dab", "dac", "dbc", "tierra", "sepfases", "otros", "sepductos"];

    return {
      bloque,
      avanzado,
      filaCosto,
      red: f.red,
      quitar: bloque.querySelector(".vi-quitar-tramo"),
      /** Numera el tramo; el encabezado «Tramo N» solo se muestra si la alternativa tiene más de uno. */
      numerar(alt, i, varios) {
        alternativa = alt;
        numero = i + 1;
        variosTramos = varios;
        ponerTitulos();
        bloque.querySelector(".vi-tramo-cab").hidden = !varios;
      },
      alCambiarRed: poblarMaterial,
      alCambiarTension: () => {
        poblarPct();
        ponerTitulos();
      },
      esSubterraneo: () => !esAerea(),
      /** Datos del tramo para el motor (con `error` si el conductor no se pudo resolver en los catálogos). */
      estado() {
        const aerea = esAerea();
        const eleccion = {
          red: f.red.value,
          material: f.material.value,
          calibre: f.calibre.value,
          referencia: f.referencia.value,
          tipoPantalla: f.pantalla.value,
          nivelAislamientoPct: parseInt(f.pct.value, 10),
          tensionKv: tensionKv(),
        };
        const conductor = datosConductor(eleccion, catalogos);
        const costoCond = valor(f.costoCond);
        const costoInst = valor(f.costoInst);
        const nn = parseInt(f.n.value, 10) || 1;
        return {
          eleccion,
          error: conductor.ok ? null : conductor.error,
          red: f.red.value,
          n: nn,
          longitudKm: parseFloat(f.longitud.value),
          conductor,
          ...(aerea
            ? { dabM: parseFloat(f.dab.value), dacM: parseFloat(f.dac.value), dbcM: parseFloat(f.dbc.value), separacionHazM: nn > 1 ? parseFloat(f.sephaz.value) : 0 }
            : {
                puestaTierra: f.tierra.value,
                separacionFasesM: parseFloat(f.sepfases.value),
                otrosCircuitos: parseInt(f.otros.value, 10) || 0,
                separacionDuctosM: parseFloat(f.sepductos.value) || 0.2, // con un solo circuito el motor no la usa
              }),
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
        ...Object.fromEntries(CAMPOS_BRUTO.map((k) => [k, f[k].value])),
      }),
      aplicarBruto(d) {
        if (!d) return;
        f.red.value = d.red;
        f.red.dispatchEvent(new Event("change", { bubbles: true }));
        f.material.value = d.material;
        f.material.dispatchEvent(new Event("change"));
        f.pantalla.value = d.pantalla;
        f.calibre.value = d.calibre;
        f.calibre.dispatchEvent(new Event("change"));
        if (d.referencia) f.referencia.value = d.referencia;
        for (const k of CAMPOS_BRUTO) f[k].value = d[k];
        reformatear(f.costoCond);
        reformatear(f.costoInst);
        poblarPct();
        f.pct.value = d.pct;
        syncDependientes();
        ponerTitulos();
      },
    };
  }

  // ---------- alternativas ----------
  function crearAlternativa(sid) {
    const cont = document.createElement("div");
    cont.innerHTML = `
      <div class="card tarjeta-borde form-section tramo-block vi-escenario">
        <div class="form-section-title">
          ${icon("conductorCableado")} <span class="tramo-titulo">Alternativa 1</span>
          <button type="button" class="btn btn-ghost btn-tramo-duplicar">${icon("copy")} <span class="vi-texto-btn">Duplicar</span></button>
          <button type="button" class="btn btn-ghost btn-tramo-quitar" hidden aria-label="Quitar la alternativa">${icon("close")} <span class="vi-texto-btn">Quitar</span></button>
        </div>
        <div class="grid-2 vi-tension-alt" hidden>
          <div class="field">
            <label for="f-tension-${sid}">Tensión de línea (kV)</label>
            <input type="number" id="f-tension-${sid}" min="0.1" step="any" value="34.5" required disabled>
          </div>
        </div>
        <div class="vi-tramos"></div>
        <details class="vi-avanzado">
          <summary>Parámetros avanzados</summary>
          <div class="vi-cc-alt" hidden>
          <div class="vi-avanzado-grupo">Cortocircuito</div>
          <div class="grid-2">
            <div class="field">
              <label for="f-falla-${sid}" data-info="Opcional. Corriente de cortocircuito en el punto de conexión; se verifica en todos los tramos de la alternativa. Vacío = solo se informa la capacidad de los conductores.">Corriente de falla (kA)</label>
              <input type="number" id="f-falla-${sid}" min="0" step="any" disabled>
            </div>
            <div class="field">
              <label for="f-tiempo-${sid}">Tiempo de despeje de la falla (s)</label>
              <input type="number" id="f-tiempo-${sid}" min="0.01" max="60" step="any" value="0.3" required disabled>
            </div>
          </div>
          </div>
          <div class="vi-avanzado-tramos"></div>
        </details>
        <div class="vi-tramo-pie">
          <button type="button" class="btn-enlace vi-agregar-tramo">${icon("plus")} Agregar tramo</button>
        </div>
      </div>`;
    const card = cont.firstElementChild;
    // Tiempo de despeje: valor por defecto personal (Perfil > Calculadoras); su id lleva el número de la alternativa.
    const defectos = leerDefectos();
    if (defectos.tiempo >= 0.01) card.querySelector(`#f-tiempo-${sid}`).value = defectos.tiempo;
    activarInfos(card);
    activarPlegables(card);
    const c = (s) => card.querySelector(s);
    const filaTension = c(".vi-tension-alt");
    const fTensionAlt = c(`#f-tension-${sid}`);
    const fFalla = c(`#f-falla-${sid}`);
    const fTiempo = c(`#f-tiempo-${sid}`);
    const grupoCc = c(".vi-cc-alt");
    // Corriente de falla y tiempo de despeje: los generales, o los de la alternativa con «Por alternativa» (2026-09-26)
    const fallaActual = () => (porAlternativa() ? fFalla : campo("falla"));
    const tiempoActual = () => (porAlternativa() ? fTiempo : campo("tiempo"));
    const tramosCont = c(".vi-tramos");
    const avanzadoCont = c(".vi-avanzado-tramos");
    const botonTramo = c(".vi-agregar-tramo");
    const detalles = c("details.vi-avanzado");
    const tramos = [];
    let siguienteTramo = 0;
    let numero = 1;
    const tensionKv = () => parseFloat(porAlternativa() ? fTensionAlt.value : fTension.value);

    function numerar() {
      tramos.forEach((t, i) => t.numerar(numero, i, tramos.length > 1));
      botonTramo.hidden = tramos.length >= MAX_TRAMOS;
    }

    function agregarTramo() {
      if (tramos.length >= MAX_TRAMOS) return null;
      const t = crearTramo(`${sid}-${siguienteTramo++}`, tensionKv, tramos.length ? 1 : 5);
      t.red.addEventListener("change", () => {
        t.alCambiarRed();
        validarTensiones();
      });
      t.quitar.addEventListener("click", () => {
        tramos.splice(tramos.indexOf(t), 1);
        t.bloque.remove();
        t.avanzado.remove();
        t.filaCosto.remove();
        numerar();
        validarTensiones();
      });
      tramos.push(t);
      tramosCont.append(t.bloque);
      avanzadoCont.append(t.avanzado);
      numerar();
      ordenarCostos();
      return t;
    }
    botonTramo.addEventListener("click", () => agregarTramo());
    fTensionAlt.addEventListener("input", () => {
      tramos.forEach((t) => t.alCambiarTension());
      validarTensiones();
    });

    return {
      card,
      titulo: c(".tramo-titulo"),
      quitar: c(".btn-tramo-quitar"),
      duplicar: c(".btn-tramo-duplicar"),
      tramos,
      campoTension: () => (porAlternativa() ? fTensionAlt : fTension),
      tensionKv,
      agregarTramo,
      /** Muestra u oculta la tensión propia de la alternativa (casilla «Por alternativa» de los datos de la conexión). */
      mostrarTension(visible) {
        if (visible && filaTension.hidden && !fTensionAlt.dataset.tocado) fTensionAlt.value = fTension.value; // al aparecer, arranca con la general
        if (visible && grupoCc.hidden && !fFalla.dataset.tocado) {
          fFalla.value = campo("falla").value; // la falla y el tiempo también arrancan con los generales
          fTiempo.value = campo("tiempo").value;
        }
        filaTension.hidden = !visible;
        fTensionAlt.disabled = !visible;
        grupoCc.hidden = !visible;
        fFalla.disabled = fTiempo.disabled = !visible;
        tramos.forEach((t) => t.alCambiarTension());
      },
      renumerar(i) {
        numero = i + 1;
        numerar();
      },
      estado() {
        const t = tramos.map((x) => x.estado());
        const varios = t.length > 1;
        const error = t.map((x, i) => (x.error ? `${varios ? `tramo ${i + 1}: ` : ""}${x.error}` : null)).filter(Boolean).join(" ");
        return { tensionKv: tensionKv(), corrienteFallaKa: valor(fallaActual()), tiempoDespejeS: parseFloat(tiempoActual().value), tramos: t, error: error || null };
      },
      bruto: () => ({ tension: fTensionAlt.value, falla: fFalla.value, tiempo: fTiempo.value, avanzado: detalles.open, tramos: tramos.map((t) => t.bruto()) }),
      aplicarBruto(d) {
        if (!d) return;
        fTensionAlt.value = d.tension;
        fTensionAlt.dataset.tocado = "1";
        fFalla.value = d.falla;
        fTiempo.value = d.tiempo;
        fFalla.dataset.tocado = "1";
        detalles.open = !!d.avanzado;
        for (let i = tramos.length; i < d.tramos.length; i++) agregarTramo();
        tramos.forEach((t, i) => t.aplicarBruto(d.tramos[i]));
      },
      marcarTensionTocada: () => (fTensionAlt.dataset.tocado = "1"),
      marcarFallaTocada: () => (fFalla.dataset.tocado = "1"),
    };
  }

  const escCont = q("#tramos-container");
  const escenarios = [];
  let siguienteId = 0;

  // Los cables subterráneos solo llegan a 46 kV: la tensión (general o de la alternativa) no es válida si alguna
  // alternativa que la usa tiene un tramo subterráneo y la supera.
  function validarTensiones() {
    const MENSAJE = "El catálogo de cables subterráneos llega hasta 46 kV.";
    const malo = (e) => e.tramos.some((t) => t.esSubterraneo()) && e.tensionKv() > 0 && nivelAislamientoPara(e.tensionKv()) === null;
    fTension.setCustomValidity(!porAlternativa() && escenarios.some(malo) ? MENSAJE : "");
    for (const e of escenarios) {
      const propio = e.card.querySelector("[id^=f-tension-]");
      propio.setCustomValidity(porAlternativa() && malo(e) ? MENSAJE : "");
    }
  }

  // Los costos de todos los tramos viven en la tarjeta «Evaluación económica», en el orden de las alternativas y sus tramos.
  function ordenarCostos() {
    for (const e of escenarios) for (const t of e.tramos) costosCont.append(t.filaCosto);
  }

  // «Agregar alternativa» va en la fila de Calcular, a la derecha (como en las demás calculadoras); si no cabe en la
  // línea, sube a una fila propia ENCIMA de Calcular y Guardar (`wrap-reverse`). La nueva queda después de la última
  // alternativa y se lleva a la vista.
  const botonAgregar = document.createElement("button");
  botonAgregar.type = "button";
  botonAgregar.className = "btn btn-agregar-tramo";
  botonAgregar.innerHTML = `${icon("plus")} Agregar alternativa`;
  botonAgregar.addEventListener("click", () => {
    agregarEscenario();
    escenarios.at(-1).card.scrollIntoView({ behavior: "smooth", block: "nearest" });
  });
  q(".btn-row--agregar").append(botonAgregar);

  function actualizarEscenarios() {
    escenarios.forEach((e, i) => {
      e.titulo.textContent = `Alternativa ${i + 1}`;
      e.quitar.hidden = escenarios.length <= MIN_ESCENARIOS;
      e.duplicar.hidden = escenarios.length >= MAX_ESCENARIOS;
      e.renumerar(i);
    });
    botonAgregar.hidden = escenarios.length >= MAX_ESCENARIOS;
    ordenarCostos();
  }

  /** Agrega una alternativa al final o, con `despuesDe`, justo después de esa (con los datos `datos`, al duplicar). */
  function agregarEscenario(datos = null, despuesDe = null) {
    if (escenarios.length >= MAX_ESCENARIOS) return;
    const e = crearAlternativa(siguienteId++);
    e.quitar.addEventListener("click", () => {
      escenarios.splice(escenarios.indexOf(e), 1);
      e.card.remove();
      e.tramos.forEach((t) => t.filaCosto.remove());
      actualizarEscenarios();
      validarTensiones();
    });
    e.duplicar.addEventListener("click", () => agregarEscenario(e.bruto(), e));
    e.card.querySelector("[id^=f-tension-]").addEventListener("input", e.marcarTensionTocada);
    e.card.querySelectorAll("[id^=f-falla-], [id^=f-tiempo-]").forEach((x) => x.addEventListener("input", e.marcarFallaTocada));
    if (despuesDe) {
      escenarios.splice(escenarios.indexOf(despuesDe) + 1, 0, e);
      despuesDe.card.after(e.card);
    } else {
      escenarios.push(e);
      escCont.append(e.card);
    }
    e.agregarTramo();
    e.mostrarTension(porAlternativa());
    if (datos) {
      e.aplicarBruto(datos);
      e.mostrarTension(porAlternativa());
    }
    actualizarEscenarios();
    validarTensiones();
  }

  // Tensión general o una por alternativa
  function aplicarTensionAlt() {
    fTension.disabled = porAlternativa();
    // con «Por alternativa», la falla y el tiempo de despeje generales se ocultan: cada alternativa pide los suyos
    const ccGeneral = q(".vi-cc-general");
    ccGeneral.hidden = porAlternativa();
    ccGeneral.querySelectorAll("input").forEach((i) => (i.disabled = porAlternativa()));
    escenarios.forEach((e) => e.mostrarTension(porAlternativa()));
    validarTensiones();
  }
  chkTensionAlt.addEventListener("change", aplicarTensionAlt);
  fTension.addEventListener("input", () => {
    escenarios.forEach((e) => e.tramos.forEach((t) => t.alCambiarTension()));
    validarTensiones();
  });

  agregarEscenario();

  // ---------- foto del formulario: la usan la persistencia al navegar y las valoraciones guardadas ----------
  function capturar() {
    return {
      ...Object.fromEntries(COMUNES.map((k) => [k, campo(k).value])),
      tensionPorAlternativa: porAlternativa(),
      avanzado: q("details.vi-avanzado").open,
      economiaAbierta: !tarjetaEconomia.classList.contains("plegada"),
      escenarios: escenarios.map((e) => e.bruto()),
    };
  }
  const fotoValida = (g) => Array.isArray(g?.escenarios) && g.escenarios.length > 0 && g.escenarios.every((e) => Array.isArray(e?.tramos) && e.tramos.length > 0);

  /** Deja el formulario como en la foto `g` (quita primero las alternativas que haya). */
  function restaurar(g) {
    for (const e of escenarios.splice(0)) {
      e.card.remove();
      e.tramos.forEach((t) => t.filaCosto.remove());
    }
    for (const k of COMUNES) if (k in g && campo(k)) campo(k).value = g[k];
    if (!("falla" in g) && g.escenarios[0]) {
      // foto anterior a 3.32.0: la falla y el tiempo vivían solo en cada alternativa; los generales toman los de la primera
      campo("falla").value = g.escenarios[0].falla ?? "";
      if (g.escenarios[0].tiempo) campo("tiempo").value = g.escenarios[0].tiempo;
    }
    reformatear(campo("precio"));
    aplicarModo();
    chkTensionAlt.checked = !!g.tensionPorAlternativa;
    q("details.vi-avanzado").open = !!g.avanzado;
    for (let i = 0; i < Math.min(g.escenarios.length, MAX_ESCENARIOS); i++) agregarEscenario();
    escenarios.forEach((e, i) => e.aplicarBruto(g.escenarios[i]));
    aplicarTensionAlt();
    actualizarEscenarios();
    plegarTarjeta(tarjetaEconomia, !g.economiaAbierta);
  }

  // ---------- valoración guardada con la que se está trabajando ----------
  let guardada = null; // { id, nombre }
  const lineaTrabajando = q(".vi-trabajando");
  // Huella del formulario para saber si hay cambios sin guardar (sin contar qué desplegables están abiertos)
  let huellaGuardada = null;
  const huella = () => JSON.stringify(capturar(), (k, v) => (k === "avanzado" || k === "economiaAbierta" ? undefined : v));
  const hayCambiosSinGuardar = () => !!guardada && huellaGuardada !== null && huella() !== huellaGuardada;
  function marcarGuardado() {
    huellaGuardada = guardada ? huella() : null;
    mostrarTrabajando();
  }
  function mostrarTrabajando() {
    lineaTrabajando.hidden = !guardada;
    lineaTrabajando.innerHTML = guardada
      ? `<span>Trabajando en: <strong>${escapeHtml(guardada.nombre)}</strong><span class="vi-sin-guardar"${hayCambiosSinGuardar() ? "" : " hidden"}> · cambios sin guardar</span></span><button type="button" class="btn-enlace vi-nueva">${icon("circlePlus")} Nueva valoración</button>`
      : "";
  }
  // Se revisa después de cada cambio en el formulario (escribir, elegir, agregar o quitar alternativas y tramos)
  let revisionPendiente = false;
  const revisarCambios = () => {
    if (!guardada || revisionPendiente) return;
    revisionPendiente = true;
    setTimeout(() => {
      revisionPendiente = false;
      const marca = lineaTrabajando.querySelector(".vi-sin-guardar");
      if (marca) marca.hidden = !hayCambiosSinGuardar();
    }, 0);
  };
  for (const ev of ["input", "change", "click"]) form.addEventListener(ev, revisarCambios);
  lineaTrabajando.addEventListener("click", (e) => {
    if (!e.target.closest(".vi-nueva")) return;
    if (hayCambiosSinGuardar() && !window.confirm("Hay cambios sin guardar en esta valoración. ¿Empezar una nueva de todos modos?")) return;
    restaurar(fotoInicial);
    guardada = null;
    marcarGuardado();
    form.querySelectorAll(".card.form-section").forEach((c) => plegarTarjeta(c, c === tarjetaEconomia));
    q("#resultado-wrap").innerHTML = "";
    cajaGuardar.hidden = true;
    avisoGuardado("");
  });

  // ---------- restaurar lo que había si se volvió de otra sección (no sobrevive a un recargue) ----------
  const fotoInicial = capturar(); // el formulario en blanco, para «Nueva»
  const guardado = leerEstado(RUTA);
  if (fotoValida(guardado)) {
    try {
      restaurar(guardado);
      guardada = guardado.guardada ?? null;
      huellaGuardada = guardado.huellaGuardada ?? null;
      mostrarTrabajando();
    } catch {
      /* una foto dañada no puede dejar la pantalla sin alternativas */
      if (!escenarios.length) agregarEscenario();
    }
  }

  function antesDeSalir() {
    guardarEstado(RUTA, { ...capturar(), guardada, huellaGuardada });
  }

  // ---------- guardar ----------
  const cajaGuardar = q(".vi-guardar");
  const campoNombre = q("#f-nombre-guardado");
  const accionesGuardar = q(".vi-guardar-acciones");
  const mensajeGuardar = q(".vi-guardar-msg");

  let temporizadorAviso = null;
  function avisoGuardado(texto, tipo = "") {
    clearTimeout(temporizadorAviso);
    if (texto && tipo !== "error") temporizadorAviso = setTimeout(() => mensajeGuardar.isConnected && avisoGuardado(""), 6000);
    mensajeGuardar.hidden = !texto;
    mensajeGuardar.textContent = texto || "";
    mensajeGuardar.className = `vi-guardar-msg text-sm${tipo ? ` ${tipo}` : ""}`;
  }

  /** Resumen corto para la lista: «2 alternativas · 30 MW · 34.5 kV». */
  function resumenActual() {
    const nAlt = escenarios.length;
    const dato = selModo.value === "potencia" ? `${fPotencia.value} MW` : `${fAparente.value} MVA`;
    const kv = porAlternativa() ? [...new Set(escenarios.map((e) => e.tensionKv()))].map((v) => `${v} kV`).join(" / ") : `${fTension.value} kV`;
    return `${nAlt} ${nAlt === 1 ? "alternativa" : "alternativas"} · ${dato} · ${kv}`;
  }

  function abrirCajaGuardar() {
    cajaGuardar.hidden = false;
    avisoGuardado("");
    campoNombre.value = guardada?.nombre ?? "";
    accionesGuardar.innerHTML = guardada
      ? `<button type="button" class="btn btn-primary" data-guardar="actualizar">Actualizar</button>
         <button type="button" class="btn" data-guardar="nueva">Guardar como nueva</button>
         <button type="button" class="btn" data-guardar="cancelar">Cancelar</button>`
      : `<button type="button" class="btn btn-primary" data-guardar="nueva">Guardar</button>
         <button type="button" class="btn" data-guardar="cancelar">Cancelar</button>`;
    campoNombre.focus();
  }

  q(".vi-btn-guardar").addEventListener("click", () => (cajaGuardar.hidden ? abrirCajaGuardar() : (cajaGuardar.hidden = true)));
  campoNombre.addEventListener("keydown", (e) => {
    if (e.key === "Enter") {
      e.preventDefault(); // no enviar el formulario (Calcular)
      accionesGuardar.querySelector("[data-guardar]")?.click();
    }
  });
  accionesGuardar.addEventListener("click", async (e) => {
    const boton = e.target.closest("[data-guardar]");
    if (!boton) return;
    const accion = boton.dataset.guardar;
    if (accion === "cancelar") {
      cajaGuardar.hidden = true;
      return;
    }
    const nombre = campoNombre.value.trim();
    if (!nombre) {
      avisoGuardado("Escribe un nombre para la valoración.", "error");
      campoNombre.focus();
      return;
    }
    accionesGuardar.querySelectorAll("button").forEach((b) => (b.disabled = true));
    let r;
    try {
      r = await guardarValoracion({ id: accion === "actualizar" ? guardada?.id : null, nombre, datos: JSON.stringify(capturar()), resumen: resumenActual() });
    } catch {
      r = { ok: false, mensaje: "No se pudo guardar." };
    }
    accionesGuardar.querySelectorAll("button").forEach((b) => (b.disabled = false));
    if (!r.ok) {
      avisoGuardado(r.mensaje, "error");
      return;
    }
    guardada = { id: r.registro.id, nombre: r.registro.nombre };
    marcarGuardado();
    cajaGuardar.hidden = true;
    avisoGuardado(r.mensaje, r.remoto ? "ok" : "");
    if (!panelHistorial.hidden) pintarHistorial(listarLocales(), null);
  });

  // ---------- historial de valoraciones guardadas ----------
  const panelHistorial = q(".vi-historial");
  const botonHistorial = q(".vi-btn-historial");
  const listaHistorial = q(".vi-historial-lista");
  const estadoHistorial = q(".vi-historial-estado");
  const fecha = (ms) => {
    try {
      return new Date(ms).toLocaleString("es-CO", { dateStyle: "medium", timeStyle: "short" });
    } catch {
      return "";
    }
  };
  let registrosHistorial = [];

  function pintarHistorial(items, mensaje) {
    registrosHistorial = items;
    if (mensaje !== null) estadoHistorial.textContent = mensaje;
    listaHistorial.innerHTML = items.length
      ? items
          .map(
            (r) => `
        <li class="vi-historial-fila${guardada?.id === r.id ? " actual" : ""}">
          <div class="vi-historial-texto">
            <span class="vi-historial-nombre"><strong>${escapeHtml(r.nombre)}</strong>${guardada?.id === r.id ? '<span class="badge">Abierta</span>' : ""}</span>
            <span class="text-muted text-sm">${escapeHtml([fecha(r.actualizado), r.resumen].filter(Boolean).join(" · "))}${r.pendiente ? " · solo en este dispositivo" : ""}</span>
          </div>
          <div class="vi-historial-botones">
            <button type="button" class="btn btn-sm" data-abrir="${escapeHtml(r.id)}">Abrir</button>
            <button type="button" class="btn btn-ghost btn-sm" data-eliminar="${escapeHtml(r.id)}" aria-label="Eliminar ${escapeHtml(r.nombre)}">${icon("trash")}</button>
          </div>
        </li>`
          )
          .join("")
      : `<li class="vi-historial-vacio text-muted text-sm">Aún no hay valoraciones guardadas. Usa «Guardar», junto a «Calcular».</li>`;
  }

  async function abrirHistorial() {
    panelHistorial.hidden = false;
    botonHistorial.setAttribute("aria-expanded", "true");
    pintarHistorial(listarLocales(), "Sincronizando con tu cuenta…"); // lo del dispositivo se ve al instante
    let r;
    try {
      r = await sincronizar();
    } catch {
      r = { items: listarLocales(), mensaje: "No se pudo sincronizar con tu cuenta; se muestran las guardadas en este dispositivo." };
    }
    if (!panelHistorial.hidden && panelHistorial.isConnected) pintarHistorial(r.items, r.mensaje);
  }
  function cerrarHistorial() {
    panelHistorial.hidden = true;
    botonHistorial.setAttribute("aria-expanded", "false");
  }
  botonHistorial.addEventListener("click", () => (panelHistorial.hidden ? abrirHistorial() : cerrarHistorial()));
  q(".vi-historial-cerrar").addEventListener("click", cerrarHistorial);

  listaHistorial.addEventListener("click", async (e) => {
    const abrir = e.target.closest("[data-abrir]");
    const quitar = e.target.closest("[data-eliminar]");
    if (abrir) {
      const r = registrosHistorial.find((x) => x.id === abrir.dataset.abrir);
      const foto = r ? leerDatos(r) : null;
      if (!fotoValida(foto)) {
        estadoHistorial.textContent = "No se pudo abrir: los datos de esa valoración están dañados.";
        return;
      }
      try {
        restaurar(foto);
      } catch {
        estadoHistorial.textContent = "No se pudo abrir esa valoración.";
        if (!escenarios.length) agregarEscenario();
        return;
      }
      guardada = { id: r.id, nombre: r.nombre };
      marcarGuardado();
      cerrarHistorial();
      cajaGuardar.hidden = true;
      avisoGuardado("");
      // todas las tarjetas plegadas y el resultado a la vista
      form.querySelectorAll(".card.form-section").forEach((c) => plegarTarjeta(c, true));
      form.requestSubmit();
    } else if (quitar) {
      const r = registrosHistorial.find((x) => x.id === quitar.dataset.eliminar);
      if (!r || !window.confirm(`¿Eliminar la valoración «${r.nombre}»? No se puede deshacer.`)) return;
      await eliminarValoracion(r.id);
      if (guardada?.id === r.id) {
        guardada = null;
        mostrarTrabajando();
      }
      pintarHistorial(listarLocales(), null);
    }
  });

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
      tensionPorAlternativa: porAlternativa(),
      aerea: { taC: n("ta"), tcC: n("tc"), vwMs: n("vw"), anguloVientoDeg: n("angulo"), elevacionM: n("elevacion"), epsilon: n("epsilon"), alfa: n("alfa"), qseWm2: n("qse"), thetaDeg: n("theta") },
      subterranea: { tempMaxC: n("tempmax"), tempTerrenoC: n("tempterreno"), rhoSueloKmW: n("rhosuelo"), uDuctoKmW: n("uducto"), profundidadBancoM: n("profundidad"), frecuenciaHz: n("frecuencia") },
      tempFallaC: n("tfalla"),
      economia:
        precio === null
          ? null
          : { anios: parseInt(campo("anios").value, 10), tasaDescuentoPct: n("tasa"), precioKwh: precio, escaladaEnergiaPct: n("escalada"), crecimientoDemandaPct: n("crecimiento") },
    };
    const estados = escenarios.map((s) => s.estado());
    const errores = estados.map((s, i) => (s.error ? `Alternativa ${i + 1}, ${s.error}` : null)).filter(Boolean);
    if (errores.length) {
      renderError(errores);
      return;
    }
    renderResultado(compararEscenarios(comun, estados), comun, estados, { modo, datoPartida });
  });

  // ---------- presentación ----------
  // La referencia ya trae sus propios paréntesis (p. ej. «Penguin (6/1)»): se separa con « · ».
  function conductorTexto(t) {
    const e = t.eleccion;
    const detalle = t.red === "Aerea" ? (e.referencia ? ` · ${e.referencia}` : "") : ` · ${e.tipoPantalla}, ${t.conductor.nivelAislamientoKv} kV ${e.nivelAislamientoPct} %`;
    return `${e.material} ${e.calibre}${detalle}${t.n > 1 ? ` ×${t.n}` : ""}`;
  }
  const tramoTexto = (t) => `${nombreRed(t.red)} · ${conductorTexto(t)}`;
  const varios = (s) => s.tramos.length > 1;
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
      return { ok: false, titulo: `${total === 1 ? "La alternativa no cumple" : "Ninguna alternativa cumple"} todos los criterios.`, detalle: "Revisa en la tabla qué criterio falla en cada una." };
    }
    return {
      ok: true,
      titulo: total === 1 ? "La alternativa cumple todos los criterios." : `Cumplen todos los criterios: ${r.cumplen.map((i) => `Alternativa ${i + 1}`).join(", ")}.`,
      detalle:
        r.recomendado === null
          ? ""
          : r.criterioRecomendado === "costo"
            ? `Recomendada: Alternativa ${r.recomendado + 1}, la de menor costo total entre las que cumplen.`
            : `Recomendada: Alternativa ${r.recomendado + 1}, la de menores pérdidas entre las que cumplen (sin precios no se comparan costos).`,
    };
  }

  /** Supuestos económicos en una línea (van en la sección de costos del PDF y del Excel, no en los datos de la conexión). */
  function supuestosEconomicos(ec) {
    return `Precio de la energía perdida: ${fmtPesos(ec.precioKwh)}/kWh en el año 1 (sube ${fmtPercent(ec.escaladaEnergiaPct)} al año) · tasa de descuento ${fmtPercent(ec.tasaDescuentoPct)} · crecimiento de la demanda ${fmtPercent(ec.crecimientoDemandaPct)} al año · ${ec.anios} años.`;
  }

  /**
   * Modelo de la tabla comparativa: secciones con filas, y en cada fila una celda por alternativa. La pantalla, el PDF y el
   * Excel se arman con él. La unidad va aparte (en pantalla, junto al número: «557.8 A»; en PDF y Excel, en su columna):
   * así «(A)» no se confunde con la fase A. Con varios tramos, la ampacidad y el cortocircuito muestran el valor de cada
   * tramo (T1, T2…) y se evalúan con el de menor capacidad, que es el valor principal de la celda.
   * celda = { v: número | texto | null, dec, texto?, pesos?, signo?, estado?: {texto, clase}, sub?: texto }
   */
  function modeloMatriz(r, comun, estados) {
    const X = r.escenarios;
    const fila = (etiqueta, unidad, celda, extra = {}) => ({ etiqueta, unidad, celdas: X.map((x, i) => celda(x, estados[i], i)), ...extra });
    const conN = (t) => (t.n > 1 ? `${t.n} ${t.red === "Aerea" ? "conductores" : "circuitos"} por fase` : null);
    const unir = (...partes) => partes.filter(Boolean).join(" · ") || null;
    const porTramo = (x, texto) => x.tramos.map((t, j) => `T${j + 1} ${texto(t)}`).join(" · ");
    const conElMenor = (s, j) => (varios(s) ? `Con T${j + 1}, el de menor capacidad` : null);
    const hayVarios = estados.some(varios);
    const hayN = estados.some((s) => s.tramos.some((t) => t.n > 1));
    const hayFalla = estados.some((s) => s.corrienteFallaKa !== null);
    const secciones = [
      {
        titulo: null,
        filas: [
          fila("Conductor", "", (x, s) => ({ v: varios(s) ? s.tramos.map((t, j) => `T${j + 1} · ${tramoTexto(t)} · ${fmt(t.longitudKm)} km`).join("\n") : tramoTexto(s.tramos[0]), texto: true })),
          fila("Tensión de línea", "kV", (x, s) => ({ v: s.tensionKv, dec: 1 })),
          fila("Longitud", "km", (x, s) => ({ v: x.longitudKm, dec: 2, sub: varios(s) ? `${s.tramos.length} tramos` : null })),
          fila("Corriente de operación", "A", (x) => ({ v: x.corrienteA, dec: 1 })),
        ],
      },
      {
        titulo: "Ampacidad",
        filas: [
          fila("Ampacidad por conductor", "A", (x, s) =>
            x.ampacidad.error
              ? { v: null, estado: { texto: "No calculable", clase: "badge-danger" }, sub: varios(s) ? `T${x.ampacidad.tramo + 1}` : null }
              : { v: x.ampacidad.porConductorA, dec: 0, sub: varios(s) ? porTramo(x, (t) => (t.ampacidad.error ? "no calculable" : `${num(t.ampacidad.porConductorA, 0, 0)} A`)) : null }
          ),
          ...(hayN
            ? [
                fila("Ampacidad total", "A", (x, s) =>
                  x.ampacidad.error ? { v: null } : { v: x.ampacidad.totalA, dec: 0, sub: varios(s) ? porTramo(x, (t) => (t.ampacidad.error ? "no calculable" : `${num(t.ampacidad.totalA, 0, 0)} A`)) : conN(s.tramos[0]) }
                ),
              ]
            : []),
          fila("Uso de la ampacidad", "%", (x, s) => (x.ampacidad.error ? { v: null } : { v: x.ampacidad.usoPct, dec: 1, estado: estadoCumple(x.ampacidad.cumple, "Cumple", "Sobrecarga"), sub: conElMenor(s, x.ampacidad.tramo) }), { etiquetaEstado: "Ampacidad: cumplimiento" }),
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
          fila("Capacidad de cortocircuito", "kA", (x, s) => ({ v: x.cortocircuito.totalKa, dec: 2, sub: unir(varios(s) ? porTramo(x, (t) => `${num(t.cortocircuito.totalKa, 2, 2)} kA`) : conN(s.tramos[0]), `en ${fmt(s.tiempoDespejeS)} s`) })),
          ...(hayFalla
            ? [
                fila(
                  "Corriente de falla",
                  "kA",
                  (x, s) => (x.cortocircuito.corrienteFallaKa === null ? { v: "Sin dato", texto: true } : { v: x.cortocircuito.corrienteFallaKa, dec: 2, estado: estadoCumple(x.cortocircuito.cumple, "Soporta", "No soporta"), sub: conElMenor(s, x.cortocircuito.tramo) }),
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
        nota: supuestosEconomicos(comun.economia), // solo en el PDF y el Excel
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
    return { secciones, hayVarios, recomendado: r.recomendado, columnas: X.map((x, i) => `Alternativa ${i + 1}`) };
  }

  /** Detalle por tramo (una fila por tramo de cada alternativa), para la pantalla, el PDF y la hoja «Tramos» del Excel. */
  function filasTramos(r, estados) {
    return r.escenarios.flatMap((x, i) =>
      x.tramos.map((t, j) => {
        const e = estados[i].tramos[j];
        return {
          alternativa: `Alternativa ${i + 1}`,
          tramo: j + 1,
          conductor: tramoTexto(e),
          longitudKm: e.longitudKm,
          ampacidadA: t.ampacidad.error ? null : t.ampacidad.totalA,
          usoPct: t.ampacidad.error ? null : t.ampacidad.usoPct,
          perdidasPct: t.perdidas.pct,
          caidaPct: t.regulacion.pct,
          capacidadKa: t.cortocircuito.totalKa,
          costoTotal: t.economia ? t.economia.costoTotal : null,
          ampacidadCumple: t.ampacidad.cumple,
        };
      })
    );
  }

  /** Texto de una celda numérica con su unidad («557.8 A», «1.15 %», «$ 105,000,000»). */
  function textoCelda(c, unidad) {
    if (c.v === null || c.v === undefined) return "—";
    if (c.texto) return String(c.v);
    const n2 = `${c.signoNum && c.v > 0 ? "+" : ""}${num(c.v, c.dec, c.dec)}`;
    if (c.pesos) return `${c.signo ? "+" : ""}$ ${n2}`; // el «$» no se separa del número al partir la línea
    return unidad ? `${n2} ${unidad}` : n2;
  }
  const conSaltos = (s) => escapeHtml(s).replace(/\n/g, "<br>");

  function matrizHtml(modelo) {
    const cab = modelo.columnas
      .map((t, i) => `<th class="num${i === modelo.recomendado ? " col-mejor" : ""}">${t}${i === modelo.recomendado ? ` <span class="vi-cab-rec">${insignia("Recomendada", "badge-success")}</span>` : ""}</th>`)
      .join("");
    const ncol = modelo.columnas.length + 1;
    const celdaHtml = (c, f) => {
      const menor = c.estado?.texto === "Menor costo";
      const oculto = f.etiqueta === "Resultado" || menor || (c.estado && c.v === null);
      const valorHtml = oculto ? "" : conSaltos(textoCelda(c, f.unidad));
      const badge = c.estado ? insignia(c.estado.texto, c.estado.clase) : "";
      const texto = [valorHtml, badge].filter(Boolean).join(" ");
      const clase = `num${f.etiqueta === "Conductor" ? " vi-conductor-celda" : ""}${c.tono ? ` vi-tono-${c.tono}` : ""}`;
      return `<td class="${clase}">${texto}${c.sub ? `<div class="vi-sub">${escapeHtml(c.sub)}</div>` : ""}</td>`;
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

  function detalleTramosHtml(filas) {
    const celda = (v, dec, unidad) => (v === null ? "—" : `${num(v, dec, dec)}${unidad ? ` ${unidad}` : ""}`);
    const cuerpo = filas
      .map(
        (f) =>
          `<tr><td>${escapeHtml(f.alternativa)}</td><td class="num">${f.tramo}</td><td class="wrap">${escapeHtml(f.conductor)}</td><td class="num">${celda(f.longitudKm, 2, "km")}</td>` +
          `<td class="num">${celda(f.ampacidadA, 0, "A")}</td><td class="num">${f.usoPct === null ? insignia("No calculable", "badge-danger") : `${celda(f.usoPct, 1, "%")}${f.ampacidadCumple ? "" : ` ${insignia("Sobrecarga", "badge-danger")}`}`}</td>` +
          `<td class="num">${celda(f.perdidasPct, 2, "%")}</td><td class="num">${celda(f.caidaPct, 2, "%")}</td><td class="num">${celda(f.capacidadKa, 2, "kA")}</td></tr>`
      )
      .join("");
    return `
      <details class="vi-detalle-tramos">
        <summary>Detalle por tramo</summary>
        <div class="table-wrap tabla-resultado tabla-matriz"><table>
          <thead><tr><th>Alternativa</th><th class="num">Tramo</th><th>Conductor</th><th class="num">Longitud</th><th class="num">Ampacidad total</th><th class="num">Uso de la ampacidad</th><th class="num">Pérdidas</th><th class="num">Caída de tensión</th><th class="num">Capacidad de cortocircuito</th></tr></thead>
          <tbody>${cuerpo}</tbody>
        </table></div>
      </details>`;
  }

  function avisosHtml(r, comun, estados) {
    const avisos = [];
    r.escenarios.forEach((x, i) => {
      x.tramos.forEach((t, j) => {
        if (t.ampacidad.error) avisos.push(`Alternativa ${i + 1}${varios(estados[i]) ? `, tramo ${j + 1}` : ""}: ${t.ampacidad.error}`);
      });
    });
    const sinCosto = estados.map((s, i) => (s.tramos.every((t) => t.costos) ? -1 : i)).filter((i) => i >= 0);
    if (comun.economia && sinCosto.length && sinCosto.length < estados.length) {
      avisos.push(`Falta el costo del conductor en algún tramo, así que no entra en la comparación de costos: ${sinCosto.map((i) => `Alternativa ${i + 1}`).join(", ")}.`);
    }
    if (!comun.economia && estados.some((s) => s.tramos.some((t) => t.costos))) avisos.push("Para comparar costos falta el precio de la energía perdida (tarjeta «Evaluación económica»).");
    const longitudes = r.escenarios.map((x) => x.longitudKm);
    if (longitudes.length > 1 && Math.max(...longitudes) - Math.min(...longitudes) > 1e-6 * Math.max(...longitudes)) {
      avisos.push(`Las alternativas no tienen la misma longitud total (${longitudes.map((l, i) => `Alternativa ${i + 1}: ${fmt(l)} km`).join(", ")}): revisa que comparen la misma conexión.`);
    }
    return avisos.length ? `<div class="callout callout-warning" style="margin-top: var(--space-4);"><div>${avisos.map(escapeHtml).join("<br>")}</div></div>` : "";
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

  /** Datos de la conexión en pares [etiqueta, valor] (PDF y Excel). Los supuestos económicos van en la sección de costos. */
  function datosEntrada(comun, estados, { modo, datoPartida }) {
    return [
      ["Dato de partida", `${MODOS[modo]}: ${fmt(datoPartida)} ${modo === "potencia" ? "MW" : "MVA"}`],
      ["Factor de potencia", fmt(comun.factorPotencia)],
      ["Factor de carga (Fc)", num(comun.factorCarga, 2, 4)],
      ["Tensión de línea", comun.tensionPorAlternativa ? "Una por alternativa (ver la tabla)" : `${fmt(estados[0].tensionKv)} kV`],
    ];
  }

  const REFERENCIAS = `Referencias de diseño: pérdidas hasta ${OPTIMO_PERDIDAS} % óptimo · hasta ${LIMITE_PERDIDAS} % aceptable; regulación hasta ${OPTIMO_REGULACION} % óptimo · hasta ${LIMITE_REGULACION} % aceptable. La corriente de operación no debe superar la ampacidad.`;

  /** Tabla de un modelo (comparación o análisis) para el documento PDF: criterio, unidad y una columna por alternativa. */
  function tablaDoc(modelo) {
    const cab = modelo.columnas.map((t, i) => `<th class="num">${t}${i === modelo.recomendado ? "<br><small>Recomendada</small>" : ""}</th>`).join("");
    const ncol = modelo.columnas.length + 2;
    const cuerpo = modelo.secciones
      .map(
        (s) =>
          (s.titulo ? `<tr class="vi-doc-seccion"><td colspan="${ncol}">${escapeHtml(s.titulo)}</td></tr>` : "") +
          (s.nota ? `<tr class="vi-doc-nota-fila"><td colspan="${ncol}">${escapeHtml(s.nota)}</td></tr>` : "") +
          s.filas
            .map((f) => {
              const celdas = f.celdas
                .map((c) => {
                  const oculto = f.etiqueta === "Resultado" || (c.estado && (c.v === null || c.estado.texto === "Menor costo"));
                  const valorHtml = oculto ? "" : conSaltos(c.pesos ? textoCelda(c, "").replace("$ ", "") : textoCelda(c, ""));
                  const estado = c.estado ? `<span class="vi-doc-estado${c.estado.clase === "badge-danger" ? " malo" : c.estado.clase === "badge-warning" ? " alerta" : ""}">${escapeHtml(c.estado.texto)}</span>` : "";
                  return `<td class="num${c.tono ? ` vi-doc-${c.tono}` : ""}">${[valorHtml, estado].filter(Boolean).join(" ")}${c.sub ? `<div class="vi-doc-sub">${escapeHtml(c.sub)}</div>` : ""}</td>`;
                })
                .join("");
              return `<tr${f.total ? ' class="vi-doc-total"' : ""}><td>${escapeHtml(f.etiqueta)}</td><td class="vi-doc-unidad">${escapeHtml(f.unidad)}</td>${celdas}</tr>`;
            })
            .join("")
      )
      .join("");
    return `<div class="table-wrap"><table class="vi-doc-matriz"><thead><tr><th>Criterio</th><th>Unidad</th>${cab}</tr></thead><tbody>${cuerpo}</tbody></table></div>`;
  }

  /** Documento de impresión (PDF): Carta, vertical hasta 3 alternativas y horizontal con más; siempre en claro. */
  function documentoPdf(modelo, modeloA, conc, entrada, tramos, inst) {
    const doc = document.createElement("div");
    doc.id = "doc-impresion";
    doc.className = `doc-impresion vi-doc${modelo.columnas.length > 3 ? " vi-doc-apaisado" : ""}`;
    const celda = (v, dec) => (v === null ? "—" : num(v, dec, dec));
    const detalle = modelo.hayVarios
      ? `<h3>Detalle por tramo</h3><div class="table-wrap"><table class="vi-doc-tramos"><thead><tr><th>Alternativa</th><th class="num">Tramo</th><th>Conductor</th><th class="num">Longitud (km)</th><th class="num">Ampacidad total (A)</th><th class="num">Uso (%)</th><th class="num">Pérdidas (%)</th><th class="num">Caída (%)</th><th class="num">Cortocircuito (kA)</th></tr></thead><tbody>` +
        tramos
          .map(
            (f) =>
              `<tr><td>${escapeHtml(f.alternativa)}</td><td class="num">${f.tramo}</td><td>${escapeHtml(f.conductor)}</td><td class="num">${celda(f.longitudKm, 2)}</td><td class="num">${celda(f.ampacidadA, 0)}</td><td class="num">${celda(f.usoPct, 1)}</td><td class="num">${celda(f.perdidasPct, 2)}</td><td class="num">${celda(f.caidaPct, 2)}</td><td class="num">${celda(f.capacidadKa, 2)}</td></tr>`
          )
          .join("") +
        `</tbody></table></div>`
      : "";
    doc.innerHTML =
      `<header class="doc-cab"><div class="doc-app">Herramientas de Ingeniería</div><h1>Valoración integral de conductores</h1><p class="doc-meta">${escapeHtml(fechaLarga())}</p></header>` +
      `<div class="vi-doc-conclusion${conc.ok ? "" : " malo"}"><strong>${escapeHtml(conc.titulo)}</strong> ${escapeHtml(conc.detalle)}</div>` +
      `<h3>Datos de la conexión</h3><table class="vi-doc-datos"><tbody>${entrada.map(([k, v]) => `<tr><td>${escapeHtml(k)}</td><td>${escapeHtml(v)}</td></tr>`).join("")}</tbody></table>` +
      `<h3>Comparación de alternativas</h3>${tablaDoc(modelo)}` +
      detalle +
      `<h3>Análisis: margen y capacidad máxima</h3>${tablaDoc(modeloA)}` +
      instalacionHtml(inst, { doc: true }) +
      `<h3>Supuestos del cálculo</h3><ul class="vi-doc-supuestos">${SUPUESTOS.map((s) => `<li>${escapeHtml(s)}</li>`).join("")}</ul>` +
      `<p class="vi-doc-nota">${escapeHtml(REFERENCIAS)} Los datos de entrada de cada alternativa están en la pestaña «Reporte» de la calculadora.</p>`;
    return doc;
  }

  function exportarPdf(modelo, modeloA, conc, entrada, tramos, inst) {
    document.getElementById("doc-impresion")?.remove();
    document.body.append(documentoPdf(modelo, modeloA, conc, entrada, tramos, inst));
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

  /**
   * Filas de una hoja de Excel a partir de un modelo (comparación o análisis). La clasificación ya no ocupa filas
   * aparte (pedido del usuario: la tabla limpia): la celda se colorea con los estilos de Excel «Bueno» (verde),
   * «Neutral» (amarillo) y «Malo» (rojo), explicados en una convención al final. El valor de cada tramo va en la hoja
   * «Tramos».
   */
  function filasExcel(modelo, combinar, desde) {
    const n2 = modelo.columnas.length;
    const ultima = columna(n2 + 1);
    const vacias = (estilo) => Array.from({ length: n2 + 2 }, () => ({ v: "", estilo }));
    const filas = [[{ v: "Criterio", estilo: "cabecera" }, { v: "Unidad", estilo: "cabecera" }, ...modelo.columnas.map((t, i) => ({ v: i === modelo.recomendado ? `${t} (recomendada)` : t, estilo: "cabecera" }))]];
    for (const s of modelo.secciones) {
      if (s.titulo) {
        const fila = vacias("seccion");
        fila[0] = { v: s.titulo, estilo: "seccion" };
        filas.push(fila);
      }
      if (s.nota) {
        const fila = vacias("celda");
        fila[0] = { v: s.nota, estilo: "celda" };
        filas.push(fila);
        combinar.push(`A${desde + filas.length}:${ultima}${desde + filas.length}`);
      }
      for (const f of s.filas) {
        const base = f.total ? "total" : "celda";
        const esVeredicto = f.etiqueta === "Resultado";
        filas.push([
          { v: f.etiqueta, estilo: f.total ? "total" : "criterio" },
          { v: f.unidad, estilo: base },
          ...f.celdas.map((c) => {
            const estilo = tonoDe(c) ?? base;
            if (esVeredicto) return { v: c.sub ? `${c.v} (${c.sub.replace(/^Falla: /, "")})` : c.v, estilo };
            if (c.v === null || c.v === undefined) return { v: c.estado?.texto ?? "—", estilo };
            if (c.estado?.texto === "Menor costo") return { v: "Menor costo", estilo };
            return c.texto ? { v: c.v, estilo } : { v: c.v, dec: c.dec, estilo };
          }),
        ]);
      }
    }
    return filas;
  }

  /**
   * Libro de Excel: «Comparación» (la tabla, con números de verdad y la unidad en su columna), «Análisis» (márgenes y
   * capacidad máxima), «Tramos» (una fila por tramo) y «Reporte» (el texto completo).
   */
  function libroExcel(modelo, modeloA, conc, entrada, tramos, reporte, inst) {
    const n2 = modelo.columnas.length;
    const ultima = columna(n2 + 1);
    const encabezado = [
      [{ v: "Valoración integral de conductores", estilo: "titulo" }],
      [{ v: `Herramientas de Ingeniería · ${fechaLarga()}`, estilo: "nota" }],
      [],
      [{ v: `${conc.titulo} ${conc.detalle}`.trim(), estilo: "etiqueta" }, ...Array.from({ length: n2 + 1 }, () => ({ v: "", estilo: "etiqueta" }))],
      [],
      [{ v: "Datos de la conexión", estilo: "seccion" }, { v: "", estilo: "seccion" }],
      ...entrada.map(([k, v]) => [{ v: k, estilo: "etiqueta" }, { v, estilo: "celda" }]),
      [],
    ];
    const combinar = [`A1:${ultima}1`, `A4:${ultima}4`];
    const filas = [...encabezado, ...filasExcel(modelo, combinar, encabezado.length)];
    filas.push([], [{ v: `${REFERENCIAS} Verde: óptimo o cumple · amarillo: aceptable · rojo: elevado o no cumple. El valor de cada tramo está en la hoja «Tramos» y el margen y la capacidad máxima, en la hoja «Análisis».`, estilo: "nota" }]);
    combinar.push(`A${filas.length}:${ultima}${filas.length}`);

    const combinarA = [`A1:${ultima}1`];
    const filasA = [[{ v: "Análisis: margen frente a cada límite y capacidad máxima", estilo: "titulo" }], [], ...filasExcel(modeloA, combinarA, 2)];
    filasA.push([], [{ v: "Supuestos del cálculo", estilo: "seccion" }], ...SUPUESTOS.map((s) => [{ v: `• ${s}`, estilo: "nota" }]));
    for (let i = filasA.length - SUPUESTOS.length + 1; i <= filasA.length; i++) combinarA.push(`A${i}:${ultima}${i}`);
    if (inst) {
      const lineas = [instIntro(inst), ...instLineas(inst).map((l) => `• ${l}`), instCierre(inst)];
      filasA.push([], [{ v: INST_TITULO, estilo: "seccion" }], ...lineas.map((l) => [{ v: l.replace(/\u00a0/g, " "), estilo: "nota" }]));
      for (let i = filasA.length - lineas.length + 1; i <= filasA.length; i++) combinarA.push(`A${i}:${ultima}${i}`);
    }

    const numero = (v, dec) => (v === null ? { v: "—", estilo: "celda" } : { v, dec, estilo: "celda" });
    const hojaTramos = [
      ["Alternativa", "Tramo", "Conductor", "Longitud (km)", "Ampacidad total (A)", "Uso de la ampacidad (%)", "Pérdidas (%)", "Caída de tensión (%)", "Capacidad de cortocircuito (kA)", "Costo total actualizado ($)"].map((v) => ({ v, estilo: "cabecera" })),
      ...tramos.map((f) => [
        { v: f.alternativa, estilo: "celda" },
        { v: f.tramo, dec: 0, estilo: "celda" },
        { v: f.conductor, estilo: "celda" },
        numero(f.longitudKm, 2),
        numero(f.ampacidadA, 0),
        f.usoPct === null ? { v: "No calculable", estilo: "malo" } : { v: f.usoPct, dec: 1, estilo: f.ampacidadCumple ? "bueno" : "malo" },
        numero(f.perdidasPct, 2),
        numero(f.caidaPct, 2),
        numero(f.capacidadKa, 2),
        numero(f.costoTotal, 0),
      ]),
    ];
    return crearXlsx([
      { nombre: "Comparación", anchos: [38, 9, ...modelo.columnas.map(() => 34)], combinar, filas },
      { nombre: "Análisis", anchos: [38, 9, ...modelo.columnas.map(() => 30)], combinar: combinarA, filas: filasA },
      { nombre: "Tramos", anchos: [14, 8, 44, 13, 15, 15, 12, 14, 18, 20], filas: hojaTramos },
      { nombre: "Reporte", anchos: [120], filas: reporte.split("\n").map((l) => [l]) },
    ]);
  }

  function exportarHtml() {
    return `
      <details class="menu-mas vi-exportar no-print">
        <summary class="btn btn-sm btn-con-icono" aria-label="Exportar la comparación">${icon("download")} Exportar ${icon("chevronDown")}</summary>
        <div class="menu-mas-lista">
          <button type="button" data-exportar="pdf">PDF (imprimir o guardar)</button>
          <button type="button" data-exportar="docx">Documento de Word (.docx)</button>
          <button type="button" data-exportar="xlsx">Excel (.xlsx)</button>
        </div>
      </details>`;
  }

  // ---------- reporte de texto (corto, para copiar y pegar) ----------
  // Pedido del usuario (2026-09-26): la tabla, el análisis, el PDF y el Excel ya traen el detalle; el reporte de texto
  // queda en lo esencial: los datos de entrada de cada alternativa y, por alternativa, el veredicto con los valores que
  // deciden (sin valores intermedios como la reactancia o la resistencia efectiva).
  function reporteTexto(r, comun, estados, { modo, datoPartida }, inst) {
    comunActual = comun;
    const todos = estados.flatMap((s) => s.tramos);
    const a = comun.aerea;
    const s2 = comun.subterranea;
    const ec = comun.economia;
    const porFase = (t) => `${t.n} ${t.red === "Aerea" ? (t.n > 1 ? "conductores" : "conductor") : t.n > 1 ? "circuitos" : "circuito"} por fase`;
    const lineaTramo = (t) => `${tramoTexto(t).replace(/ ×\d+$/, "")} · ${porFase(t)} · ${fmt(t.longitudKm)} km`;
    const costoTramo = (t) => (!t.costos ? "sin costo" : `conductor ${fmtPesos(t.costos.costoConductorKm)}/km${t.costos.instalacionIndicada ? ` · instalación ${fmtPesos(t.costos.costoInstalacionKm)}/km` : ""}`);

    const parametros = estados.flatMap((e, i) => [
      `Alternativa ${i + 1}: ${fmt(e.tensionKv)} kV · falla ${e.corrienteFallaKa === null ? "no indicada" : `${fmt(e.corrienteFallaKa)} kA`} en ${fmt(e.tiempoDespejeS)} s`,
      ...e.tramos.map((t, j) => `  ${varios(e) ? `Tramo ${j + 1}: ` : ""}${lineaTramo(t)}${ec ? ` · ${costoTramo(t)}` : ""}`),
    ]);

    const resultados = r.escenarios.flatMap((x, i) => {
      const e = estados[i];
      const an = analisisAlternativa(x, comun);
      const deTramo = (j) => (varios(e) ? ` (tramo ${j + 1})` : "");
      const cc = x.cortocircuito;
      return [
        ``,
        `Alternativa ${i + 1}: ${x.cumpleTodo ? "cumple todos los criterios" : `no cumple (${x.incumple.join(", ")})`}`,
        x.ampacidad.error
          ? `  Ampacidad: no calculable${deTramo(x.ampacidad.tramo)}`
          : `  Corriente ${fmt(x.corrienteA, 1)} A · ampacidad ${fmt(x.ampacidad.totalA, 0)} A${deTramo(x.ampacidad.tramo)} · uso ${fmtPercent(x.ampacidad.usoPct, 1)}`,
        `  Pérdidas ${fmtPercent(x.perdidas.pct)} (${x.perdidas.clase.etiqueta}) · ${fmt(x.perdidas.kw, 1)} kW · ${num(x.perdidas.energiaMwhAnio, 1, 1)} MWh al año`,
        `  Caída de tensión ${fmtPercent(x.regulacion.pct)} (${x.regulacion.clase.etiqueta})`,
        `  Cortocircuito ${fmt(cc.totalKa)} kA en ${fmt(e.tiempoDespejeS)} s${deTramo(cc.tramo)}${cc.corrienteFallaKa === null ? "" : ` · ${cc.cumple ? "soporta" : "no soporta"} ${fmt(cc.corrienteFallaKa)} kA`}`,
        ...(x.economia ? [`  Costo total actualizado ${fmtPesos(x.economia.costoTotal)} (inversión ${fmtPesos(x.economia.inversion)})`] : []),
        ...(an.pMax ? [`  Potencia máxima ${num(an.pMax[1], 1, 1)} MW (la limita ${TEXTO_CRITERIO[an.pMax[0]].toLowerCase()})`] : []),
        ...(() => {
          const m = calibreMinimoDe(e);
          if (!m) return [];
          if (m.ninguno) return [`  Calibre mínimo que cumple: ninguno del mismo tipo${deTramo(m.tramo)}`];
          return [`  Calibre mínimo que cumple: ${textoCalibreMinimo(e, m)}${deTramo(m.tramo)}${m.esActual ? " (el actual)" : ""}`];
        })(),
      ];
    });

    const conc = conclusion(r);
    return [
      `CÁLCULO DE VALORACIÓN INTEGRAL`,
      ``,
      ``,
      `PARÁMETROS DE ENTRADA:`,
      LINEA_REPORTE,
      `${MODOS[modo]}: ${fmt(datoPartida)} ${modo === "potencia" ? "MW" : "MVA"} · FP ${fmt(comun.factorPotencia)} · Fc ${num(comun.factorCarga, 2, 4)}`,
      ...(todos.some((t) => t.red === "Aerea") ? [`Líneas aéreas: ${fmt(a.taC)} °C ambiente, ${fmt(a.tcC)} °C máx. del conductor, viento ${fmt(a.vwMs)} m/s, ${fmt(a.elevacionM, 0)} m s. n. m.`] : []),
      ...(todos.some((t) => t.red !== "Aerea") ? [`Cables subterráneos: ${fmt(s2.tempMaxC)} °C máx. del conductor, terreno ${fmt(s2.tempTerrenoC)} °C, suelo ${fmt(s2.rhoSueloKmW)} K·m/W, profundidad ${fmt(s2.profundidadBancoM)} m`] : []),
      ...(ec ? [`Evaluación económica: energía ${fmtPesos(ec.precioKwh)}/kWh (+${fmtPercent(ec.escaladaEnergiaPct)} al año) · tasa ${fmtPercent(ec.tasaDescuentoPct)} · ${ec.anios} años`] : []),
      ...parametros,
      ``,
      ``,
      `RESULTADOS:`,
      LINEA_REPORTE,
      `Corriente de operación: ${fmt(r.escenarios[0].corrienteA, 1)} A${estados.some((e) => e.tensionKv !== estados[0].tensionKv) ? " (alternativa 1; depende de la tensión)" : ""}`,
      ...resultados.slice(1),
      ``,
      `Conclusión: ${conc.titulo}${conc.detalle ? ` ${conc.detalle}` : ""}`,
      ...(inst ? [``, `${INST_TITULO} (instalación no incluida en el costo total):`, ...instLineas(inst)] : []),
    ].join("\n");
  }

  // ---------- análisis: márgenes frente a los límites y capacidad máxima ----------
  const TEXTO_CRITERIO = { ampacidad: "Ampacidad", perdidas: "Pérdidas", regulacion: "Regulación", cortocircuito: "Cortocircuito" };

  /**
   * Márgenes de cada alternativa frente a cada límite y su capacidad máxima (potencia y longitud) antes de incumplir.
   * Sin fórmulas nuevas: la corriente crece en proporción a la potencia (misma tensión y FP), la caída de tensión y el %
   * de pérdidas crecen en proporción a la potencia y a la longitud, y la ampacidad fija la corriente máxima; así que los
   * máximos salen de escalar lo ya calculado. `rel` = margen relativo (1 = sin uso, 0 = justo en el límite, < 0 = incumple).
   */
  const analisisAlternativa = (x, comun) => analizarAlternativa(x, comun.potenciaActivaMw); // en el motor: la usa también la IA

  /**
   * «Calibre mínimo que cumple»: el calibre más pequeño del mismo tipo que hace cumplir todo, cambiando solo el tramo que
   * limita (ver calibreMinimo en el motor). Si falla la búsqueda, la celda lo dice y la pantalla sigue.
   */
  function calibreMinimoDe(s) {
    try {
      return calibreMinimo(comunActual, s, catalogos);
    } catch {
      return null;
    }
  }
  function textoCalibreMinimo(s, m) {
    if (!m || m.ninguno) return null;
    return `${s.tramos[m.tramo].eleccion.material} ${m.calibre}${m.referencia ? ` · ${m.referencia}` : ""}`;
  }
  function celdaCalibreMinimo(s) {
    const m = calibreMinimoDe(s);
    if (!m) return { v: "—", texto: true };
    if (m.ninguno) return { v: "Ninguno del mismo tipo", texto: true, tono: "malo", sub: varios(s) ? `cambiando el tramo ${m.tramo + 1}` : null };
    const n = s.tramos[m.tramo].n;
    const que = m.esActual ? "es el actual" : m.menorQueActual ? "menor que el actual" : "mayor que el actual";
    return {
      v: textoCalibreMinimo(s, m),
      texto: true,
      tono: m.esActual || m.menorQueActual ? "bueno" : null,
      sub: [que, varios(s) ? `en el tramo ${m.tramo + 1}` : null, n > 1 ? `con ${n} por fase` : null].filter(Boolean).join(" · "),
    };
  }
  let comunActual = null; // los datos comunes del último cálculo (los usa la búsqueda del calibre mínimo)

  /** Tabla del análisis con el mismo modelo de la tabla comparativa (así se dibuja igual en pantalla, PDF y Excel). */
  function modeloAnalisis(r, comun, estados) {
    const A = r.escenarios.map((x) => analisisAlternativa(x, comun));
    const fila = (etiqueta, unidad, celda, extra = {}) => ({ etiqueta, unidad, celdas: A.map((a, i) => celda(a, r.escenarios[i], estados[i])), ...extra });
    const tono = (ok) => (ok ? "bueno" : "malo");
    const finito = (v) => Number.isFinite(v);
    const conTramo = (s, j) => (varios(s) ? `con T${j + 1}, el de menor capacidad` : null);
    return {
      columnas: r.escenarios.map((x, i) => `Alternativa ${i + 1}`),
      recomendado: r.recomendado,
      secciones: [
        {
          titulo: "Margen frente a cada límite",
          filas: [
            fila("Ampacidad", "A", (a, x, s) =>
              !a.amp
                ? { v: "No calculable", texto: true, tono: "malo" }
                : { v: a.amp.margen, dec: 0, signoNum: true, tono: tono(a.amp.rel >= 0), sub: [a.amp.rel >= 0 ? `${num(a.amp.rel * 100, 0, 0)} % de reserva` : `sobrecarga de ${num(-a.amp.rel * 100, 0, 0)} %`, conTramo(s, x.ampacidad.tramo)].filter(Boolean).join(" · ") }
            ),
            fila("Pérdidas", "%", (a) => ({ v: a.perd.margen, dec: 2, signoNum: true, tono: tono(a.perd.rel >= 0), sub: `límite ${LIMITE_PERDIDAS} %` })),
            fila("Regulación", "%", (a) => ({ v: a.reg.margen, dec: 2, signoNum: true, tono: tono(a.reg.rel >= 0), sub: `límite ${LIMITE_REGULACION} %` })),
            fila("Cortocircuito", "kA", (a, x, s) =>
              !a.cc ? { v: "Sin corriente de falla", texto: true } : { v: a.cc.margen, dec: 2, signoNum: true, tono: tono(a.cc.rel >= 0), sub: conTramo(s, x.cortocircuito.tramo) }
            ),
            fila("Criterio que limita", "", (a) => ({ v: TEXTO_CRITERIO[a.limita], texto: true, sub: "el de menor margen" }), { total: true }),
          ],
        },
        {
          titulo: "Capacidad máxima (con esta alternativa)",
          filas: [
            fila("Potencia máxima por ampacidad", "MW", (a) => (a.potencias.ampacidad === null ? { v: "No calculable", texto: true } : { v: a.potencias.ampacidad, dec: 1 })),
            fila(`Potencia máxima por regulación (${LIMITE_REGULACION} %)`, "MW", (a) => (finito(a.potencias.regulacion) ? { v: a.potencias.regulacion, dec: 1 } : { v: "—", texto: true })),
            fila(`Potencia máxima por pérdidas (${LIMITE_PERDIDAS} %)`, "MW", (a) => (finito(a.potencias.perdidas) ? { v: a.potencias.perdidas, dec: 1 } : { v: "—", texto: true })),
            fila("Potencia máxima", "MW", (a) => (!a.pMax ? { v: "No calculable", texto: true, tono: "malo" } : { v: a.pMax[1], dec: 1, tono: tono(a.pMax[1] >= a.P), sub: `la limita ${TEXTO_CRITERIO[a.pMax[0]].toLowerCase()} · hoy ${num(a.P, 1, 1)} MW` }), { total: true }),
            fila("Longitud máxima con esta potencia", "km", (a) => (finito(a.lMax[1]) ? { v: a.lMax[1], dec: 1, tono: tono(a.lMax[1] >= a.L), sub: `la limita ${TEXTO_CRITERIO[a.lMax[0]].toLowerCase()} · hoy ${num(a.L, 2, 2)} km` } : { v: "—", texto: true }), { total: true }),
            fila("Calibre mínimo que cumple", "", (a, x, s) => celdaCalibreMinimo(s)),
          ],
        },
      ],
    };
  }

  const SUPUESTOS = [
    "Cada alternativa es un circuito a una sola tensión con uno o más tramos en serie, por los que pasa la misma corriente: las pérdidas, la caída de tensión y los costos se suman.",
    "La ampacidad y el cortocircuito se evalúan con el tramo de menor capacidad, que es el más exigido.",
    "La corriente de falla es una sola por alternativa y se aplica a todos los tramos (conservador: en realidad baja a lo largo de la línea).",
    "Varios conductores por fase: en aérea forman un haz (R/N y N veces la ampacidad); en subterránea son ternas en paralelo en el mismo banco (con su calentamiento mutuo), en trébol.",
    "Los criterios técnicos se evalúan con la demanda del año 1; el crecimiento de la demanda solo entra en los costos. La capacidad máxima escala lo calculado: la corriente, la caída y el % de pérdidas crecen en proporción a la potencia, y la caída y las pérdidas, también a la longitud.",
  ];

  // ---------- sensibilidad al costo de instalación (la de Conductor económico, 2026-09-26) ----------
  // «$ 8.9 millones» (o el valor exacto si es menos de un millón); el «$» va unido a la cifra
  const millonesTexto = (v) => (Math.abs(v) >= 1e6 ? `$ ${num(v / 1e6, 1, 1)} millones` : fmtPesos(v).replace("$ ", () => "$ "));

  /**
   * «¿Puede el costo de instalación cambiar la decisión?»: solo si la recomendada se eligió por costo y a ella o a otra
   * alternativa que también cumple le falta el costo de instalación. Mismo diseño acordado para Conductor económico:
   * todo dicho desde la recomendada, la comparación más ajustada primero, cifras en millones por km, pista por el peso
   * de los conductores y el detalle plegado. `null` si no aplica.
   */
  function instalacionModelo(r, comun, estados) {
    const casos = sensibilidadInstalacion(r, estados);
    if (!casos.length) return null;
    const G = r.recomendado + 1;
    const pg = pesoConductoresKgKm(estados[r.recomendado]);
    return {
      G,
      anios: comun.economia.anios,
      longitudKm: r.escenarios[r.recomendado].longitudKm,
      casos: casos.map((c) => {
        const pa = pesoConductoresKgKm(estados[c.alternativa]);
        const difPeso = pg != null && pa != null ? pg - pa : null;
        const A = c.alternativa + 1;
        const porque = c.menosConductor && c.menosPerdidas
          ? "su conductor es más barato y además pierde menos energía"
          : c.menosPerdidas
            ? "lo que ahorra en pérdidas es mayor que lo que cuesta de más su conductor"
            : "su conductor es más barato, aunque pierda algo más de energía";
        const pista =
          difPeso == null || Math.abs(difPeso) < 1
            ? null
            : difPeso > 0
              ? { alerta: true, texto: `Los conductores de la Alternativa ${G} pesan ${num(difPeso, 0, 0)} kg más por km de línea que los de la Alternativa ${A}: es probable que su instalación cueste más; revisa este margen.` }
              : { alerta: false, texto: `Los conductores de la Alternativa ${G} pesan ${num(-difPeso, 0, 0)} kg menos por km de línea que los de la Alternativa ${A}: lo probable es que su instalación no cueste más, así que este margen es aún más seguro.` };
        return { A, empate: !(c.umbralKm > 0), diferencia: c.diferencia, umbralKm: c.umbralKm, porque, pista, conductor: estados[c.alternativa].tramos.map(tramoTexto).join(" + ") };
      }),
    };
  }
  const INST_TITULO = "¿Puede el costo de instalación cambiar la decisión?";
  const instIntro = (m) => `El costo de instalación no se incluyó en la comparación porque falta en al menos una alternativa. Para saber si el costo de instalación podría cambiar la conclusión del análisis, abajo se compara la Alternativa ${m.G} con cada alternativa que también cumple y se indica a partir de qué diferencia en el costo de instalación por km la otra alternativa pasaría a ser la mejor.`;
  const instValor = (c) => (c.empate ? "Empatan: cualquier diferencia en el costo de instalación decide." : `${millonesTexto(c.umbralKm)} por km por encima de la Alternativa ${c.A}`);
  const instCierre = (m) => `Compara cada valor con la diferencia de instalación que esperas según tu experiencia: si es menor, la Alternativa ${m.G} sigue siendo la mejor.`;
  const instDetalle = (m, c) => `con los costos que se conocen, la Alternativa ${m.G} cuesta ${millonesTexto(c.diferencia)} menos en ${m.anios} años, porque ${c.porque}. Repartido en los ${num(m.longitudKm, 0, 2)} km de línea son ${millonesTexto(c.umbralKm)} por km: es lo máximo que puede costar de más su instalación antes de que esa ventaja desaparezca.`;

  /** Bloque para la pestaña Análisis y para el PDF/Word (`doc`: sin clases de pantalla). */
  function instalacionHtml(m, { doc = false } = {}) {
    if (!m) return "";
    const filas = m.casos
      .map((c) => {
        const valor = c.empate ? escapeHtml(instValor(c)) : `<strong>${millonesTexto(c.umbralKm)} por km</strong> por encima de la Alternativa ${c.A}`;
        const insignia = c.pista && c.pista.alerta ? (doc ? "<strong>Revisar:</strong> " : '<span class="badge badge-warning">Revisar</span> ') : "";
        const nota = c.pista ? `<div class="${doc ? "vi-doc-sub" : "ce-inst-pista"}">${insignia}${escapeHtml(c.pista.texto)}</div>` : "";
        return `<tr><td><strong>Alternativa ${c.A}</strong><br><span class="${doc ? "vi-doc-sub" : "text-muted text-sm"}">${escapeHtml(c.conductor)}</span></td><td>${valor}${nota}</td></tr>`;
      })
      .join("");
    const detalle = m.casos
      .filter((c) => !c.empate)
      .map((c) => `<p><strong>Frente a la Alternativa ${c.A}:</strong> ${escapeHtml(instDetalle(m, c))}</p>`)
      .join("");
    const tabla = `<table${doc ? ' class="vi-doc-inst"' : ""}><thead><tr><th>Frente a</th><th>La Alternativa ${m.G} sigue siendo la mejor mientras instalarla no cueste más de…</th></tr></thead><tbody>${filas}</tbody></table>`;
    if (doc) {
      return `<h3>${INST_TITULO}</h3><p>${escapeHtml(instIntro(m))}</p><div class="table-wrap">${tabla}</div><p>${escapeHtml(instCierre(m))}</p>${detalle}`;
    }
    return `
        <div class="result-subhead">${INST_TITULO}</div>
        <p class="text-muted text-sm" style="margin: 0 0 var(--space-3);">${escapeHtml(instIntro(m))}</p>
        <div class="table-wrap tabla-resultado tabla-matriz ce-inst-tabla">${tabla}</div>
        <p class="text-muted text-sm" style="margin: var(--space-2) 0 0;">${escapeHtml(instCierre(m))}</p>
        ${detalle ? `<details class="ce-inst-detalle"><summary>¿De dónde sale este valor?</summary>${detalle}</details>` : ""}`;
  }

  /** Líneas de texto (reporte y Excel): una por alternativa, con la pista de peso. */
  const instLineas = (m) =>
    m.casos.map(
      (c) =>
        `Frente a la Alternativa ${c.A}: ${c.empate ? "empatan; cualquier diferencia en el costo de instalación decide." : `la Alternativa ${m.G} sigue siendo la mejor mientras instalarla no cueste más de ${instValor(c).replace(/ /g, " ")}.`}${c.pista ? ` ${c.pista.texto}` : ""}`
    );

  function analisisHtml(modeloA, inst) {
    return `
      <div class="result-panel vi-panel">
        <p class="text-muted text-sm" style="margin: 0 0 var(--space-3);">Cuánto le queda a cada alternativa antes de incumplir y hasta dónde podría crecer (más potencia o más longitud) sin salirse de las referencias de diseño.</p>
        ${matrizHtml(modeloA)}
        <div class="result-subhead">Supuestos del cálculo</div>
        <ul class="vi-supuestos">${SUPUESTOS.map((s) => `<li>${escapeHtml(s)}</li>`).join("")}</ul>
        <p class="text-muted text-sm" style="margin: var(--space-3) 0 0;">Las fórmulas están en cada calculadora: <a href="#/calculos/perdidas">Pérdidas</a> · <a href="#/calculos/regulacion">Regulación</a> · <a href="#/calculos/ampacidad-aerea">Ampacidad aérea</a> · <a href="#/calculos/ampacidad-subterranea">Ampacidad subterránea</a> · <a href="#/calculos/cortocircuito">Cortocircuito</a> · <a href="#/calculos/conductor-economico">Conductor económico</a>.</p>
        ${instalacionHtml(inst)}
      </div>`;
  }

  /** Tono (verde / amarillo / rojo) de una celda para el Excel: el propio de la celda o el de su clasificación. */
  const tonoDe = (c) => c.tono ?? (c.estado ? { "badge-success": "bueno", "": "neutral", "badge-warning": "malo", "badge-danger": "malo" }[c.estado.clase] ?? null : null);

  function renderResultado(r, comun, estados, dato) {
    const wrap = q("#resultado-wrap");
    comunActual = comun;
    const modelo = modeloMatriz(r, comun, estados);
    const modeloA = modeloAnalisis(r, comun, estados);
    const tramos = filasTramos(r, estados);
    const conc = conclusion(r);
    const inst = instalacionModelo(r, comun, estados);
    const reporte = reporteTexto(r, comun, estados, dato, inst);
    const resultado = `
      <div class="result-panel vi-panel">
        <div class="vi-cabecera">
          <div class="callout ${conc.ok ? "callout-success" : "callout-warning"}"><div><strong>${escapeHtml(conc.titulo)}</strong>${conc.detalle ? ` ${escapeHtml(conc.detalle)}` : ""}</div></div>
          ${exportarHtml()}
        </div>
        ${matrizHtml(modelo)}
        ${modelo.hayVarios ? detalleTramosHtml(tramos) : ""}
        <p class="text-muted text-sm" style="margin: var(--space-3) 0 0;">${escapeHtml(REFERENCIAS)}</p>
        ${avisosHtml(r, comun, estados)}
      </div>`;
    wrap.innerHTML = tarjetaResultadosHtml({ resultado, reporte: reporteHtml(reporte, ETIQUETAS_REPORTE), formulasPlano: "" });
    // La pestaña de fórmulas (ya están en cada calculadora) pasa a ser el «Análisis»: margen, capacidad máxima y
    // sensibilidad al costo de instalación. Va SEGUNDA, entre Resultado y Reporte (pedido del usuario, 2026-09-26).
    wrap.firstElementChild.classList.add("vi-resultado"); // para compactar sus márgenes en el celular
    const botonAnalisis = wrap.querySelector('.tab-btn[data-tab="formulas"]');
    const panelAnalisis = wrap.querySelector('.tab-panel[data-panel="formulas"]');
    botonAnalisis.textContent = "Análisis";
    botonAnalisis.dataset.tab = "analisis";
    panelAnalisis.dataset.panel = "analisis";
    panelAnalisis.innerHTML = analisisHtml(modeloA, inst);
    wrap.querySelector('.tab-btn[data-tab="reporte"]').before(botonAnalisis);
    wrap.querySelector('.tab-panel[data-panel="reporte"]').before(panelAnalisis);
    activarPestanas(wrap, { grupos: [], etiquetas: [], nota: "" });

    // «Exportar» abre un menú con tres formatos; se cierra al elegir uno o al pulsar fuera
    const menu = wrap.querySelector(".vi-exportar");
    const entrada = datosEntrada(comun, estados, dato);
    menu.addEventListener("click", (e) => {
      const boton = e.target.closest("[data-exportar]");
      if (!boton) return;
      menu.open = false;
      if (boton.dataset.exportar === "pdf") exportarPdf(modelo, modeloA, conc, entrada, tramos, inst);
      else if (boton.dataset.exportar === "docx") descargar(`valoracion-integral-${fechaArchivo()}.docx`, crearDocxDocumento(documentoPdf(modelo, modeloA, conc, entrada, tramos, inst), { titulo: "Valoración integral de conductores", apaisado: modelo.columnas.length > 3 }), MIME_DOCX);
      else descargar(`valoracion-integral-${fechaArchivo()}.xlsx`, libroExcel(modelo, modeloA, conc, entrada, tramos, reporte, inst), MIME_XLSX);
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
