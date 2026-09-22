// Conductor economico de una linea nueva: compara de 2 a 5 opciones de conductor por su costo total actualizado
// (inversion + valor presente del costo de las perdidas en N años). Sigue el patron de Pérdidas: una tarjeta «Datos de la
// línea», una de «Supuestos económicos» y una tarjeta por opcion (agregar/quitar). Los precios los escribe el usuario: los
// catalogos no traen precios ni deben traerlos (el repositorio es publico). La logica vive en ../calc/conductor-economico.js.

import { fmt, fmtPercent, loadData, distinct, escapeHtml } from "../util/format.js";
import { icon } from "../icons.js";
import { potenciaActivaMw } from "../calc/circuito.js";
import { compararOpciones, sensibilidad } from "../calc/conductor-economico.js";
import { LINEA_REPORTE, reporteHtml, tarjetaResultadosHtml, activarPestanas } from "../util/resultados-ui.js";
import { activarInfos } from "../util/info-campo.js";
import { activarPlegables } from "../util/tarjetas-plegables.js";

const MIN_OPCIONES = 2;
const MAX_OPCIONES = 5;

// Ecuaciones (LaTeX) de la pestaña Fórmulas.
const FORMULAS_TEX = [
  {
    titulo: "Corriente y pérdidas del año 1 (mismas fórmulas de la calculadora de Pérdidas)",
    ecuaciones: [
      String.raw`I_1 = \dfrac{P_1 \cdot 1000}{\sqrt{3}\,V\,\cos\varphi} \quad [\mathrm{A}]`,
      String.raw`F_p = 0.3\,F_c + 0.7\,F_c^{2}`,
      String.raw`R_{ef} = \dfrac{R_{75}}{N} \quad [\Omega/\mathrm{km}]`,
      String.raw`\%P_1 = \dfrac{\sqrt{3}\,I_1\,R_{ef}\,L\,F_p \cdot 100}{V \cdot 1000 \cdot \cos\varphi}`,
      String.raw`P_{perd,1} = P_1 \cdot \dfrac{\%P_1}{100} \quad [\mathrm{MW}]`,
    ],
  },
  {
    titulo: "Evolución año a año (t = 1 … n)",
    ecuaciones: [
      String.raw`I_t = I_1\,(1+g)^{t-1} \quad [\mathrm{A}]`,
      String.raw`P_{perd,t} = P_{perd,1}\,(1+g)^{2(t-1)} \quad [\mathrm{MW}]`,
      String.raw`E_t = P_{perd,t} \cdot 1000 \cdot 8760 \quad [\mathrm{kWh}]`,
      String.raw`p_t = p_1\,(1+e)^{t-1} \quad [\$/\mathrm{kWh}]`,
    ],
  },
  {
    titulo: "Costos",
    ecuaciones: [
      String.raw`C_0 = L\,\left(3\,N\,c_{cond} + c_{inst}\right) \quad [\$]`,
      String.raw`VP_{perd} = \sum_{t=1}^{n} \dfrac{E_t \cdot p_t}{(1+r)^{t}} \quad [\$]`,
      String.raw`C_{total} = C_0 + VP_{perd} \quad [\$]`,
    ],
  },
  {
    titulo: "Comparación",
    ecuaciones: [
      String.raw`\Delta_i = C_{total,i} - \min_j C_{total,j}`,
      String.raw`t_{eq} = \min\left\{\, t : C_{acum,i}(t) \le C_{acum,base}(t) \,\right\}, \qquad C_{acum}(t) = C_0 + \sum_{k=1}^{t} \dfrac{E_k \cdot p_k}{(1+r)^{k}}`,
    ],
  },
];

const FORMULAS_ETIQUETAS = [
  { tex: "P_1", texto: "Demanda (potencia activa) del año 1 [MW]" },
  { tex: "V", texto: "Tensión de línea [kV]" },
  { tex: String.raw`\cos\varphi`, texto: "Factor de potencia" },
  { tex: "F_c", texto: "Factor de carga" },
  { tex: "F_p", texto: "Factor de pérdidas" },
  { tex: "R_{75}", texto: "Resistencia AC de un conductor a 75 °C [Ω/km]" },
  { tex: "N", texto: "Conductores por fase" },
  { tex: "L", texto: "Longitud de la línea [km]" },
  { tex: "g", texto: "Crecimiento anual de la demanda (en fracción, 2 % = 0.02)" },
  { tex: "e", texto: "Aumento anual del precio de la energía (en fracción)" },
  { tex: "r", texto: "Tasa de descuento nominal (en fracción)" },
  { tex: "n", texto: "Años de análisis" },
  { tex: "I_t", texto: "Corriente del año t [A]" },
  { tex: "P_{perd,t}", texto: "Potencia media perdida en el año t [MW] (ya incluye Fp)" },
  { tex: "E_t", texto: "Energía perdida en el año t [kWh]" },
  { tex: "p_t", texto: "Precio de la energía perdida en el año t [$/kWh]" },
  { tex: "c_{cond}", texto: "Precio de UN conductor por km [$/km]" },
  { tex: "c_{inst}", texto: "Costo de instalación por km de línea [$/km]" },
  { tex: "C_0", texto: "Inversión inicial (año 0) [$]" },
  { tex: "VP_{perd}", texto: "Valor presente del costo de las pérdidas [$]" },
  { tex: "C_{total}", texto: "Costo total actualizado [$]" },
  { tex: String.raw`\Delta_i`, texto: "Diferencia de la opción i frente a la de menor costo total [$]" },
  { tex: "t_{eq}", texto: "Año en que la opción compensa su mayor inversión frente a la de menor inversión" },
];

const FORMULAS_NOTA = `La inversión se paga en el año 0. Las pérdidas de cada año se pagan al final de ese año y se traen a valor de hoy con la tasa de descuento. Todo va en pesos corrientes: la tasa es nominal y el precio de la energía sube el porcentaje indicado cada año.

La demanda indicada es la del año 1. Si crece, la corriente crece igual y las pérdidas crecen con su cuadrado. La potencia perdida que entrega la calculadora de Pérdidas ya incluye el factor de pérdidas (Fp = 0.3·Fc + 0.7·Fc², forma cuadrática, igual que en esa pantalla), por eso la energía anual es esa potencia por 8760 h.

Gana la opción de menor costo total actualizado. El «año de equilibrio» compara cada opción con la de menor inversión y dice cuándo su costo acumulado (descontado) deja de ser mayor.

No se incluyen valor residual, costos de operación y mantenimiento, impuestos ni otras condiciones técnicas (regulación, cortocircuito): son decisiones de alcance de esta calculadora. La tabla de sensibilidad cambia un supuesto a la vez (energía ±10 %, demanda ±10 %, tasa ±2 puntos) y muestra si la opción ganadora cambia.

Para granjas solares, el factor de carga que determina bien las pérdidas varía mucho según la tecnología (fijo, seguidor de uno o dos ejes) y la zona (nubosidad, ubicación geográfica):
- Ventana corta o día nublado: ≈0.30
- Pico agudo (paneles fijos): ≈0.39
- Seguidor de un eje (curva más plana): ≈0.49
- Seguidor de dos ejes (curva muy plana): ≈0.53
Por eso se sugiere un rango de 0.28-0.53 (más alto = más conservador) y no un valor fijo. Recomendación: si la decisión es importante (inversión, comparación de conductores), calcula el Fc con la curva real de generación a 24 h del proyecto, o mejor, haz el cálculo de pérdidas hora a hora en vez de depender del atajo Fc→Fp. Para circuitos que no son de generación solar, el caso más riguroso y conservador es Fc=1: asume que la potencia se transporta siempre a carga plena, sin variación.`;

const FORMULAS_TEXTO = `I1 = (P1·1000) / (√3·V·cos φ)                          [A]
Fp = 0.3·Fc + 0.7·Fc²
Ref = R75 / N                                          [Ω/km]
%P1 = (√3·I1·Ref·L·Fp·100) / (V·1000·cos φ)
Pperd1 = P1 · %P1 / 100                                [MW]

It = I1·(1+g)^(t−1)
Pperd_t = Pperd1·(1+g)^(2(t−1))                        [MW]
Et = Pperd_t·1000·8760                                 [kWh]
pt = p1·(1+e)^(t−1)                                    [$/kWh]

C0 = L·(3·N·c_cond + c_inst)                           [$]
VPperd = Σ (t=1…n) Et·pt / (1+r)^t                     [$]
Ctotal = C0 + VPperd                                   [$]

Δi = Ctotal_i − mín(Ctotal)
t_eq = primer t con Cacum_i(t) ≤ Cacum_base(t)

${FORMULAS_NOTA}`;

const ETIQUETAS_REPORTE = ["CÁLCULO DE CONDUCTOR ECONÓMICO", "PARÁMETROS DE ENTRADA:", "RESULTADOS:"];

// Ayuda de la tasa de descuento (cuadro «i»). Los valores de referencia son ORIENTATIVOS: no son una tasa de Celsia ni un dato normativo.
const INFO_TASA = [
  "Sirve para comparar dinero de hoy con dinero futuro: un peso que se gasta dentro de varios años vale menos que un peso de hoy. Con esta tasa se traen a valor de hoy las pérdidas de cada año; la inversión inicial no se descuenta.",
  "• Tasa alta: los ahorros futuros valen poco y se favorece el conductor más delgado y barato.",
  "• Tasa baja: los ahorros futuros valen más y se favorece el conductor más grueso.",
  "• 0 %: se suman todos los años sin descontar.",
  "Debe ser nominal (en pesos corrientes), igual que los precios y costos que escribas.",
  "Referencia orientativa: entre 8 % y 14 % anual (el 10 % es solo un valor de partida). Usa la tasa oficial de evaluación de proyectos de tu empresa. Para ver si la decisión depende de ella, mira la tabla de sensibilidad (±2 puntos).",
].join("\n");

const MODOS = { potencia: "Potencia activa", aparente: "Potencia aparente", corriente: "Corriente" };

// Los numeros del resto de la app usan punto decimal (en-US): las cifras de dinero llevan coma de miles para leerse bien.
const num = (v, min = 0, max = 0) => (Number.isFinite(v) ? v.toLocaleString("en-US", { minimumFractionDigits: min, maximumFractionDigits: max }) : "—");
const fmtPesos = (v) => (Number.isFinite(v) ? `$ ${num(v)}` : "—");
const fmtMillones = (v) => num(v / 1e6, 2, 2);

export async function render(container) {
  const desnudos = await loadData("conductores-desnudos");
  const xlpe = await loadData("conductores-xlpe");

  container.innerHTML = `
    <div class="breadcrumb"><a href="#/">Inicio</a> <span>/</span> <a href="#/calculos">Cálculos</a> <span>/</span> <span>Conductor económico</span></div>
    <h1 class="page-title">Conductor económico</h1>

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
          <label for="f-potencia" data-info="Demanda del año 1 de operación.">Potencia activa (MW)</label>
          <input type="number" id="f-potencia" min="0" step="0.01" value="19.9" required>
        </div>
        <div class="field" id="wrap-aparente" hidden>
          <label for="f-aparente" data-info="Demanda del año 1 de operación.">Potencia aparente (MVA)</label>
          <input type="number" id="f-aparente" min="0" step="0.01" value="22.11">
        </div>
        <div class="field" id="wrap-corriente" hidden>
          <label for="f-corriente" data-info="Corriente del año 1 de operación.">Corriente (A)</label>
          <input type="number" id="f-corriente" min="0" step="0.1" value="370">
        </div>

        <div class="grid-2">
          <div class="field">
            <label for="f-fp">Factor de potencia</label>
            <input type="number" id="f-fp" min="0" max="1" step="0.01" value="0.9" required>
          </div>
          <div class="field">
            <label for="f-fc" data-info="Circuitos de uso: 1 · Granjas solares: 0.28-0.53 según tecnología y ubicación (lo ideal es calcularlo con la curva real de generación a 24 h)">Factor de carga (Fc)</label>
            <input type="number" id="f-fc" min="0" max="1" step="0.0001" value="0.4" required>
          </div>
        </div>
        <div class="grid-2 ultima">
          <div class="field">
            <label for="f-longitud">Longitud de la línea (km)</label>
            <input type="number" id="f-longitud" min="0" step="0.01" value="10" required>
          </div>
          <div class="field">
            <label for="f-crecimiento" data-info="Cuánto aumenta la demanda cada año, a partir del año 1. Con 0 % la demanda se mantiene igual todos los años.">Crecimiento anual de la demanda (%)</label>
            <input type="number" id="f-crecimiento" min="0" max="100" step="any" value="0" required>
          </div>
        </div>
      </div>

      <div class="card tarjeta-borde form-section" style="margin-top: var(--space-4);">
        <div class="form-section-title">${icon("coin")} Supuestos económicos</div>
        <div class="grid-2">
          <div class="field">
            <label for="f-anios" data-info="Horizonte de tiempo del análisis, o vida útil esperada del proyecto. La inversión se paga de una sola vez al iniciar (año 0); las pérdidas se calculan año por año durante todo este período.">Años de análisis</label>
            <input type="number" id="f-anios" min="1" max="60" step="1" value="25" required>
          </div>
          <div class="field">
            <label for="f-tasa" data-info="${escapeHtml(INFO_TASA)}">Tasa de descuento (%)</label>
            <input type="number" id="f-tasa" min="0" max="100" step="any" value="10" required>
          </div>
        </div>
        <div class="grid-2 ultima">
          <div class="field">
            <label for="f-precio" data-info="Lo que cuesta la energía que se pierde en la línea (compra o costo reconocido), no la tarifa de venta. Es el valor del año 1.">Precio de la energía perdida ($/kWh)</label>
            <input type="number" id="f-precio" min="0" step="any" required>
          </div>
          <div class="field">
            <label for="f-escalada" data-info="Cuánto sube cada año el precio de la energía, en pesos corrientes. Con 0 el precio no cambia.">Aumento anual del precio (%)</label>
            <input type="number" id="f-escalada" min="0" max="100" step="any" value="2.5" required>
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

  activarInfos(container);

  activarPlegables(container);
  const form = container.querySelector("#form-calc");
  const q = (s) => container.querySelector(s);
  const fTension = q("#f-tension");
  const selModo = q("#f-modo");
  const fPotencia = q("#f-potencia");
  const fAparente = q("#f-aparente");
  const fCorriente = q("#f-corriente");
  const fFp = q("#f-fp");
  const fFc = q("#f-fc");
  const fLongitud = q("#f-longitud");
  const fCrecimiento = q("#f-crecimiento");
  const fAnios = q("#f-anios");
  const fTasa = q("#f-tasa");
  const fPrecio = q("#f-precio");
  const fEscalada = q("#f-escalada");
  const campoPorModo = {
    potencia: { wrap: q("#wrap-potencia"), input: fPotencia },
    aparente: { wrap: q("#wrap-aparente"), input: fAparente },
    corriente: { wrap: q("#wrap-corriente"), input: fCorriente },
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

  // ---------- opciones ----------
  const datasetDe = (red) => (red === "Aerea" ? desnudos : xlpe);
  const campoMaterialDe = (red) => (red === "Aerea" ? "tipo" : "material_conductor");

  /** Tarjeta de una opcion: cada una guarda su propio estado en el DOM, asi agregar o quitar otra no lo pierde. */
  function crearOpcion(id) {
    const cont = document.createElement("div");
    cont.innerHTML = `
      <div class="card tarjeta-borde form-section tramo-block">
        <div class="form-section-title">
          ${icon("conductorCableado")} <span class="tramo-titulo">Opción 1</span>
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
              <input type="number" id="f-resistencia-${id}" min="0" max="10000" step="any" required disabled>
              <label class="checkbox-row"><input type="checkbox" id="chk-resistencia-${id}"> Manual</label>
            </div>
          </div>
        </div>
        <div class="grid-2">
          <div class="field">
            <label for="f-n-${id}">Conductores por fase</label>
            <input type="number" id="f-n-${id}" min="1" max="8" step="1" value="1" required>
          </div>
          <div class="field">
            <label for="f-costo-cond-${id}" data-info="Precio de un solo conductor (un hilo). El cálculo lo multiplica por las 3 fases, por el número de conductores por fase (si hay haz) y por la longitud de la línea para obtener la inversión total.">Costo del conductor ($/km)</label>
            <input type="number" id="f-costo-cond-${id}" min="0" step="any" required>
          </div>
        </div>
        <div class="grid-2 ultima">
          <div class="field">
            <label for="f-costo-inst-${id}" data-info="Costo de la instalación (sin el suministro del conductor que ya se cuenta por separado): postes, aisladores, herrajes, mano de obra, transporte y demás. Suele ser similar entre calibres cercanos, salvo que el proyecto exija elementos de mayor capacidad o el salto de calibre sea grande, en ese caso escríbelo distinto por opción. Si se deja vacío el cálculo considerará únicamente el costo del conductor.">Costo de instalación ($/km)</label>
            <input type="number" id="f-costo-inst-${id}" min="0" step="any">
          </div>
        </div>
      </div>`;
    const card = cont.firstElementChild;
    activarInfos(card);
    activarPlegables(card);
    const c = (s) => card.querySelector(s);
    const selRed = c(`#f-red-${id}`);
    const selMaterial = c(`#f-material-${id}`);
    const selCalibre = c(`#f-calibre-${id}`);
    const fResistencia = c(`#f-resistencia-${id}`);
    const chkResistencia = c(`#chk-resistencia-${id}`);
    const fN = c(`#f-n-${id}`);
    const fCostoCond = c(`#f-costo-cond-${id}`);
    const fCostoInst = c(`#f-costo-inst-${id}`);

    let fila = null;

    function poblarMaterial() {
      const opciones = distinct(datasetDe(selRed.value), campoMaterialDe(selRed.value));
      selMaterial.innerHTML = opciones.map((o) => `<option value="${escapeHtml(o)}">${escapeHtml(o)}</option>`).join("");
      poblarCalibre();
    }

    function poblarCalibre() {
      const calibres = distinct(datasetDe(selRed.value).filter((f) => f[campoMaterialDe(selRed.value)] === selMaterial.value), "calibre_awg_kcmil");
      selCalibre.innerHTML = calibres.length
        ? `<option value="">Seleccione…</option>` + calibres.map((k) => `<option value="${escapeHtml(k)}">${escapeHtml(k)}</option>`).join("")
        : `<option value="">Sin calibres disponibles</option>`;
      selCalibre.disabled = !calibres.length;
      fila = null;
      syncResistencia();
    }

    function resolverFila() {
      if (!selCalibre.value) return null;
      return datasetDe(selRed.value).find((f) => f[campoMaterialDe(selRed.value)] === selMaterial.value && f.calibre_awg_kcmil === selCalibre.value) || null;
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
      titulo: c(".tramo-titulo"),
      quitar: c(".btn-tramo-quitar"),
      /** Lo que el usuario dejo elegido en esta tarjeta. `ampacidadA` solo existe en aereos (corriente a 75 °C del catalogo). */
      estado: () => ({
        red: selRed.value,
        material: selMaterial.value,
        calibre: selCalibre.value,
        resistenciaOhmKm: parseFloat(fResistencia.value),
        numConductoresPorFase: parseInt(fN.value, 10) || 1,
        costoConductorKm: parseFloat(fCostoCond.value),
        costoInstalacionKm: parseFloat(fCostoInst.value) || 0,
        instalacionIndicada: fCostoInst.value.trim() !== "",
        ampacidadA: selRed.value === "Aerea" && fila ? fila.corriente_75c_a ?? null : null,
      }),
    };
  }

  const opcionesCont = q("#tramos-container");
  const opciones = [];
  let siguienteId = 0;

  // «Agregar» va en la fila de «Calcular», justificado a la derecha (fuera de las tarjetas, siempre a la vista aunque se plieguen)
  const botonAgregar = document.createElement("button");
  botonAgregar.type = "button";
  botonAgregar.className = "btn btn-agregar-tramo";
  botonAgregar.innerHTML = `${icon("plus")} Agregar opción`;
  botonAgregar.addEventListener("click", () => agregarOpcion());
  const filaCalcular = container.querySelector("#form-calc .btn-row");
  filaCalcular.classList.add("btn-row--agregar"); // si no caben en una linea: «Agregar» arriba y «Calcular» abajo, ambos a la izquierda
  filaCalcular.append(botonAgregar);

  /** Numera las tarjetas, muestra "Quitar" solo si hay mas del minimo (y oculta «Agregar» al llegar al maximo). */
  function actualizarOpciones() {
    opciones.forEach((o, i) => {
      o.titulo.textContent = `Opción ${i + 1}`;
      o.quitar.hidden = opciones.length <= MIN_OPCIONES;
    });
    botonAgregar.hidden = opciones.length >= MAX_OPCIONES;
  }

  function agregarOpcion() {
    if (opciones.length >= MAX_OPCIONES) return;
    const o = crearOpcion(siguienteId++);
    o.quitar.addEventListener("click", () => {
      opciones.splice(opciones.indexOf(o), 1);
      o.card.remove();
      actualizarOpciones();
    });
    opciones.push(o);
    opcionesCont.append(o.card);
    actualizarOpciones();
  }
  for (let i = 0; i < MIN_OPCIONES; i++) agregarOpcion();

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
      longitudKm: parseFloat(fLongitud.value),
      crecimientoDemandaPct: parseFloat(fCrecimiento.value),
      anios: parseInt(fAnios.value, 10),
      tasaDescuentoPct: parseFloat(fTasa.value),
      precioKwh: parseFloat(fPrecio.value),
      escaladaEnergiaPct: parseFloat(fEscalada.value),
    };
    const estados = opciones.map((o) => o.estado());
    const r = compararOpciones(base, estados);
    const s = sensibilidad(base, estados);
    renderResultado(r, s, base, estados, { modo, datoPartida });
  });

  const nombreRed = (red) => (red === "Aerea" ? "Aérea" : "Subterránea");
  const conductorTexto = (e) => `${e.material} ${e.calibre}${e.numConductoresPorFase > 1 ? ` ×${e.numConductoresPorFase}` : ""}`;

  /** Avisos tecnicos: solo hay referencia de ampacidad en los aereos (corriente a 75 °C del catalogo, por conductor). */
  function avisosAmpacidad(r, estados, base) {
    const avisos = [];
    r.opciones.forEach((o, i) => {
      const e = estados[i];
      if (e.ampacidadA == null) return;
      const porConductor = o.corrienteUltimoAnio / e.numConductoresPorFase;
      if (porConductor > e.ampacidadA) {
        avisos.push(`Opción ${i + 1} (${conductorTexto(e)}): la corriente del año ${base.anios} (${fmt(porConductor, 1)} A por conductor) supera los ${fmt(e.ampacidadA, 0)} A que da el catálogo a 75 °C.`);
      }
    });
    return avisos;
  }

  function matrizHtml(r, estados, base) {
    const cab = r.opciones
      .map((o, i) => `<th class="num${i === r.mejor ? " col-mejor" : ""}">Opción ${i + 1}${i === r.mejor ? ' <span class="badge badge-success">Menor costo</span>' : ""}</th>`)
      .join("");
    const fila = (etiqueta, valor, { total = false } = {}) =>
      `<tr${total ? ' class="total-row"' : ""}><td class="etiqueta-fila">${etiqueta}</td>${r.opciones
        .map((o, i) => `<td class="num">${valor(o, i)}</td>`)
        .join("")}</tr>`;
    const equilibrio = (o, i) => {
      if (i === r.indiceBase) return "Base";
      if (o.inversion <= r.opciones[r.indiceBase].inversion) return "—";
      return o.puntoEquilibrio == null ? `No en ${base.anios} años` : `Año ${o.puntoEquilibrio}`;
    };
    return `
      <div class="result-subhead">Comparación de costos</div>
      <div class="table-wrap tabla-resultado tabla-matriz"><table>
        <thead><tr><th></th>${cab}</tr></thead>
        <tbody>
          ${fila("Conductor", (o, i) => escapeHtml(conductorTexto(estados[i])))}
          ${fila("Conductores ($)", (o) => num(o.costoConductores))}
          ${fila("Instalación ($)", (o) => num(o.costoInstalacion))}
          ${fila("Inversión inicial ($)", (o) => num(o.inversion))}
          ${fila("Pérdidas del año 1 (%)", (o) => fmtPercent(o.perdidasPctAnio1))}
          ${fila("Pérdidas del año 1 (MWh)", (o) => num(o.energiaKwhAnio1 / 1000, 1, 1))}
          ${fila(`Costo de las pérdidas, valor presente ($)`, (o) => num(o.costoPerdidasVp))}
          ${fila("Costo total actualizado ($)", (o) => num(o.costoTotal), { total: true })}
          ${fila("Diferencia frente al menor costo ($)", (o) => (o.diferenciaVsMejor === 0 ? "—" : `+${num(o.diferenciaVsMejor)}`))}
          ${fila("Compensa su mayor inversión", equilibrio)}
        </tbody>
      </table></div>
      <p class="text-muted text-sm" style="margin: var(--space-2) 0 0;">«Compensa su mayor inversión» compara cada opción con la de menor inversión (Opción ${r.indiceBase + 1}, «Base»): el año en que su costo acumulado, a valor presente, deja de ser mayor.</p>`;
  }

  function sensibilidadHtml(s, r) {
    const cab = r.opciones.map((o, i) => `<th class="num">Opción ${i + 1}</th>`).join("");
    const filas = s.filas
      .map((f) => {
        const celdas = f.totales.map((t) => `<td class="num">${fmtMillones(t)}</td>`).join("");
        return `<tr><td class="etiqueta-fila">${escapeHtml(f.etiqueta)}</td>${celdas}<td>Opción ${f.ganador + 1}</td></tr>`;
      })
      .join("");
    const cambian = s.filas.filter((f) => f.ganador !== s.filas[0].ganador).length;
    const mensaje = s.cambia
      ? `La opción de menor costo cambia en ${cambian} de ${s.filas.length - 1} escenarios: conviene asegurar bien esos supuestos antes de decidir.`
      : `La opción de menor costo es la misma en todos los escenarios: la decisión es robusta frente a estos cambios.`;
    return `
      <div class="result-subhead">Sensibilidad (costo total actualizado, millones de $)</div>
      <p class="text-muted text-sm" style="margin: 0 0 var(--space-3);">${mensaje}</p>
      <div class="table-wrap tabla-resultado tabla-matriz"><table>
        <thead><tr><th>Escenario</th>${cab}<th>Menor costo</th></tr></thead>
        <tbody>${filas}</tbody>
      </table></div>`;
  }

  function reporteTexto(r, s, base, estados, { modo, datoPartida }) {
    // Parametros = lo que el usuario dio; resultados = todo lo que sale del calculo (la potencia activa va en resultados si se parte de otro dato).
    const unidadDato = { potencia: "MW", aparente: "MVA", corriente: "A" }[modo];
    const potenciaActiva = `Potencia activa (año 1): ${fmt(base.potenciaActivaMw)} MW`;
    const parametrosOpciones = estados.map((e, i) =>
      [
        ``,
        `Opción ${i + 1}:`,
        `  Tipo de red: ${nombreRed(e.red)}`,
        `  Material/Tipo de conductor: ${e.material}`,
        `  Calibre: ${e.calibre}`,
        `  Resistencia AC a 75°C (por conductor): ${fmt(e.resistenciaOhmKm)} Ω/km`,
        `  Conductores por fase: ${e.numConductoresPorFase}`,
        `  Costo del conductor: ${fmtPesos(e.costoConductorKm)}/km`,
        `  Costo de instalación: ${e.instalacionIndicada ? `${fmtPesos(e.costoInstalacionKm)}/km` : "no indicado (solo se considera el conductor)"}`,
      ].join("\n")
    );
    const resultadosOpciones = r.opciones.map((o, i) => {
      const eq = i === r.indiceBase ? "Base (menor inversión)" : o.inversion <= r.opciones[r.indiceBase].inversion ? "—" : o.puntoEquilibrio == null ? `no en ${base.anios} años` : `año ${o.puntoEquilibrio}`;
      return [
        ``,
        `Opción ${i + 1} — ${conductorTexto(estados[i])}:`,
        `  Resistencia efectiva (R/N): ${fmt(o.resistenciaEfectivaOhmKm)} Ω/km`,
        `  Inversión inicial: ${fmtPesos(o.inversion)} (conductores ${fmtPesos(o.costoConductores)} + instalación ${fmtPesos(o.costoInstalacion)})`,
        `  Pérdidas del año 1: ${fmtPercent(o.perdidasPctAnio1)} (${num(o.energiaKwhAnio1 / 1000, 1, 1)} MWh)`,
        `  Costo de las pérdidas (valor presente): ${fmtPesos(o.costoPerdidasVp)}`,
        `  Costo total actualizado: ${fmtPesos(o.costoTotal)}`,
        `  Diferencia frente al menor costo: ${o.diferenciaVsMejor === 0 ? "—" : `+${fmtPesos(o.diferenciaVsMejor)}`}`,
        `  Compensa su mayor inversión: ${eq}`,
      ].join("\n");
    });
    const sens = s.filas.map((f) => `  ${f.etiqueta}: Opción ${f.ganador + 1}`);
    return [
      `CÁLCULO DE CONDUCTOR ECONÓMICO`,
      ``,
      ``,
      `PARÁMETROS DE ENTRADA:`,
      LINEA_REPORTE,
      `Tensión de línea: ${fmt(base.tensionLineaKv)} kV`,
      `Dato de partida: ${MODOS[modo]} (${fmt(datoPartida)} ${unidadDato})`,
      ...(modo === "potencia" ? [potenciaActiva] : []),
      `Factor de potencia: ${fmt(base.factorPotencia)}`,
      `Factor de carga (Fc): ${fmt(base.factorCarga, 4)}`,
      `Longitud de la línea: ${fmt(base.longitudKm)} km`,
      `Crecimiento anual de la demanda: ${fmtPercent(base.crecimientoDemandaPct)}`,
      `Años de análisis: ${base.anios}`,
      `Tasa de descuento: ${fmtPercent(base.tasaDescuentoPct)}`,
      `Precio de la energía perdida (año 1): ${fmtPesos(base.precioKwh)}/kWh`,
      `Aumento anual del precio de la energía: ${fmtPercent(base.escaladaEnergiaPct)}`,
      ...parametrosOpciones,
      ``,
      ``,
      `RESULTADOS:`,
      LINEA_REPORTE,
      ...(modo === "potencia" ? [] : [potenciaActiva]),
      `Corriente (año 1): ${fmt(r.opciones[0].corrienteAnio1)} A`,
      ...resultadosOpciones,
      ``,
      `Opción de menor costo total: Opción ${r.mejor + 1} — ${conductorTexto(estados[r.mejor])} (${fmtPesos(r.opciones[r.mejor].costoTotal)})`,
      ``,
      `Sensibilidad (opción de menor costo en cada escenario):`,
      ...sens,
    ].join("\n");
  }

  function renderResultado(r, s, base, estados, dato) {
    const wrap = q("#resultado-wrap");
    const calculable = r.opciones.every((o) => Number.isFinite(o.costoTotal));

    let resultado;
    if (!calculable) {
      resultado = `<div class="result-panel"><div class="callout callout-danger">No se pudo calcular con estos datos: revisa que la tensión, el factor de potencia y las resistencias sean válidos.</div></div>`;
    } else {
      const metricas = r.opciones
        .map(
          (o, i) => `
              <div class="result-metric">
                <div class="value">${fmtMillones(o.costoTotal)}<span class="unit">millones $</span></div>
                <div class="label">Opción ${i + 1} · ${escapeHtml(conductorTexto(estados[i]))}${i === r.mejor ? ' <span class="badge badge-success">Menor costo</span>' : ""}</div>
              </div>`
        )
        .join("");
      const mejor = r.opciones[r.mejor];
      const avisos = avisosAmpacidad(r, estados, base);
      resultado = `
          <div class="result-panel">
            <div class="callout callout-success" style="margin: 0 0 var(--space-4);"><strong>Menor costo total en ${base.anios} años: Opción ${r.mejor + 1}</strong> (${escapeHtml(conductorTexto(estados[r.mejor]))}), con ${fmtPesos(mejor.costoTotal)}.</div>
            <div class="grid-2">${metricas}</div>
            <p class="text-muted text-sm" style="margin: var(--space-3) 0 0;">Costo total actualizado = inversión inicial + valor presente del costo de las pérdidas.</p>
            ${avisos.length ? `<div class="callout callout-warning" style="margin-top: var(--space-4);">${avisos.map(escapeHtml).join("<br>")}</div>` : ""}
            ${matrizHtml(r, estados, base)}
            ${sensibilidadHtml(s, r)}
          </div>`;
    }

    wrap.innerHTML = tarjetaResultadosHtml({
      resultado,
      reporte: calculable ? reporteHtml(reporteTexto(r, s, base, estados, dato), ETIQUETAS_REPORTE) : "No hay reporte: los datos no permiten calcular.",
      formulasPlano: FORMULAS_TEXTO,
    });
    activarPestanas(wrap, { grupos: FORMULAS_TEX, etiquetas: FORMULAS_ETIQUETAS, nota: FORMULAS_NOTA });
    wrap.scrollIntoView({ behavior: "smooth", block: "nearest" });
  }
}

