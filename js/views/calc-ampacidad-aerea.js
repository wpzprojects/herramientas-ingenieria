// Calculadora de ampacidad de conductores aereos (IEEE Std 738, balance termico en regimen permanente).
// La pantalla se divide en tarjetas: "Conductor" (tipo, calibre, referencia, diametro y resistencias), "Condiciones de operacion"
// (temperaturas, viento y elevacion) y "Radiacion solar y superficie" (emisividad, absortividad, Qse y theta). Misma estructura que
// Perdidas, Regulacion, Ocupacion de ductos y Cortocircuito. El motor (../calc/ampacidad-aerea.js) no se toca.

import { fmt, loadData, distinct, escapeHtml } from "../util/format.js";
import { icon } from "../icons.js";
import { calcularAmpacidadAerea } from "../calc/ampacidad-aerea.js";
import { LINEA_REPORTE, reporteHtml, tarjetaResultadosHtml, activarPestanas } from "../util/resultados-ui.js";
import { activarInfos } from "../util/info-campo.js";
import { activarPlegables } from "../util/tarjetas-plegables.js";
import { guardarEstado, leerEstado } from "../util/persistencia-calculo.js";

const RUTA = "/calculos/ampacidad-aerea";

// Ecuaciones (LaTeX) de la pestaña Fórmulas: las del motor, con las mismas unidades (D en m, temperaturas en °C, R en Ω/m).
const FORMULAS_TEX = [
  {
    titulo: "Balance térmico (IEEE Std 738)",
    ecuaciones: [
      String.raw`Q_c + Q_r = Q_s + I^{2}\,R(T_c)`,
      String.raw`I = \sqrt{\dfrac{Q_c + Q_r - Q_s}{R(T_c)}} \quad [\mathrm{A}]`,
    ],
  },
  {
    titulo: "Propiedades del aire",
    ecuaciones: [
      String.raw`T_{film} = \dfrac{T_c + T_a}{2} \quad [^{\circ}\mathrm{C}]`,
      String.raw`\rho_f = \dfrac{1.293 - 1.525\times10^{-4}\,H_e + 6.379\times10^{-9}\,H_e^{2}}{1 + 0.00367\,T_{film}} \quad [\mathrm{kg/m^3}]`,
      String.raw`\mu_f = \dfrac{1.458\times10^{-6}\,(T_{film} + 273)^{1.5}}{T_{film} + 383.4} \quad [\mathrm{Pa\cdot s}]`,
      String.raw`k_f = 0.02424 + 7.477\times10^{-5}\,T_{film} - 4.407\times10^{-9}\,T_{film}^{2} \quad [\mathrm{W/(m\cdot ^{\circ}C)}]`,
      String.raw`Re = \dfrac{D\,\rho_f\,V_w}{\mu_f}`,
    ],
  },
  {
    titulo: "Convección",
    ecuaciones: [
      String.raw`K_{ang} = 1.194 - \cos\varphi + 0.194\cos 2\varphi + 0.368\sin 2\varphi`,
      String.raw`Q_{cn} = 3.645\,\sqrt{\rho_f}\,D^{0.75}\,(T_c - T_a)^{1.25} \quad [\mathrm{W/m}]`,
      String.raw`Q_{c1} = K_{ang}\left(1.01 + 1.35\,Re^{0.52}\right) k_f\,(T_c - T_a) \quad [\mathrm{W/m}]`,
      String.raw`Q_{c2} = 0.754\,K_{ang}\,Re^{0.6}\,k_f\,(T_c - T_a) \quad [\mathrm{W/m}]`,
      String.raw`Q_c = \max\left(Q_{cn},\,Q_{c1},\,Q_{c2}\right) \quad [\mathrm{W/m}]`,
    ],
  },
  {
    titulo: "Radiación",
    ecuaciones: [
      String.raw`Q_r = 17.8\,D\,\varepsilon\left[\left(\dfrac{T_c + 273}{100}\right)^{4} - \left(\dfrac{T_a + 273}{100}\right)^{4}\right] \quad [\mathrm{W/m}]`,
      String.raw`Q_s = \alpha\,Q_{se}\,\sin\theta\,D \quad [\mathrm{W/m}]`,
    ],
  },
  {
    titulo: "Resistencia a la temperatura del conductor",
    ecuaciones: [String.raw`R(T_c) = \dfrac{R_{25} + \dfrac{R_{75} - R_{25}}{75 - 25}\,(T_c - 25)}{1000} \quad [\Omega/\mathrm{m}]`],
  },
];

// Descripcion de las etiquetas (simbolos) de las ecuaciones, en el orden en que aparecen; el simbolo se dibuja con KaTeX igual que en ellas.
const FORMULAS_ETIQUETAS = [
  { tex: "I", texto: "Ampacidad (corriente admisible) [A]" },
  { tex: "Q_c", texto: "Calor perdido por convección [W/m]" },
  { tex: "Q_{cn},\\,Q_{c1},\\,Q_{c2}", texto: "Convección natural y las dos correlaciones de convección forzada [W/m]" },
  { tex: "Q_r", texto: "Calor perdido por radiación emitida [W/m]" },
  { tex: "Q_s", texto: "Calor ganado por radiación solar absorbida [W/m]" },
  { tex: "R(T_c)", texto: "Resistencia AC del conductor a la temperatura Tc [Ω/m]" },
  { tex: "R_{25},\\,R_{75}", texto: "Resistencia AC a 25 °C y a 75 °C [Ω/km]" },
  { tex: "T_c", texto: "Temperatura máxima del conductor [°C]" },
  { tex: "T_a", texto: "Temperatura ambiente [°C]" },
  { tex: "T_{film}", texto: "Temperatura de película (promedio entre conductor y ambiente) [°C]" },
  { tex: "D", texto: "Diámetro del cable [m]" },
  { tex: "H_e", texto: "Elevación sobre el nivel del mar [m]" },
  { tex: "\\rho_f", texto: "Densidad del aire [kg/m³]" },
  { tex: "\\mu_f", texto: "Viscosidad dinámica del aire [Pa·s]" },
  { tex: "k_f", texto: "Conductividad térmica del aire [W/(m·°C)]" },
  { tex: "Re", texto: "Número de Reynolds" },
  { tex: "V_w", texto: "Velocidad del viento [m/s]" },
  { tex: "\\varphi", texto: "Ángulo entre el viento y el conductor [°]" },
  { tex: "K_{ang}", texto: "Factor de dirección del viento" },
  { tex: "\\varepsilon", texto: "Emisividad" },
  { tex: "\\alpha", texto: "Absortividad" },
  { tex: "Q_{se}", texto: "Radiación solar total [W/m²]" },
  { tex: "\\theta", texto: "Ángulo efectivo de incidencia solar [°]" },
];

const FORMULAS_NOTA = `El cálculo es el balance térmico en régimen permanente de la IEEE Std 738: el calor que el conductor pierde por convección y por radiación, menos el que gana del sol, es el que puede generar el calentamiento resistivo I²·R.

Se toma la mayor de las tres convecciones (natural y las dos correlaciones de convección forzada).

La radiación solar total (Qse) y el ángulo efectivo de incidencia solar (θ) se ingresan directamente: el cálculo de la posición del sol a partir de fecha, hora y latitud del estándar completo no está implementado.

Si la ganancia solar supera lo que el conductor disipa, o la temperatura máxima es menor que la ambiente, el balance no admite corriente y no hay ampacidad.`;

// Texto plano de respaldo si KaTeX no se puede cargar.
const FORMULAS_TEXTO = `Metodología IEEE Std 738 (balance térmico en régimen permanente):

  Convección + Radiación emitida = Radiación solar absorbida + Calentamiento resistivo

  I = √((Qc + Qr − Qs) / R)                                     [A]

  Tfilm = (Tc + Ta) / 2
  ρf = (1.293 − 1.525e-4·He + 6.379e-9·He²) / (1 + 0.00367·Tfilm)
  μf = 1.458e-6·(Tfilm + 273)^1.5 / (Tfilm + 383.4)
  kf = 0.02424 + 7.477e-5·Tfilm − 4.407e-9·Tfilm²
  Re = D·ρf·Vw / μf
  Kang = 1.194 − cos φ + 0.194·cos 2φ + 0.368·sen 2φ

  Qcn = 3.645·√ρf·D^0.75·(Tc − Ta)^1.25
  Qc1 = Kang·(1.01 + 1.35·Re^0.52)·kf·(Tc − Ta)
  Qc2 = 0.754·Kang·Re^0.6·kf·(Tc − Ta)
  Qc  = max(Qcn, Qc1, Qc2)

  Qr = 17.8·D·ε·[((Tc+273)/100)⁴ − ((Ta+273)/100)⁴]
  Qs = α·Qse·sen θ·D
  R  = (R25 + (R75 − R25)/(75 − 25)·(Tc − 25)) / 1000           [Ω/m]

${FORMULAS_NOTA}`;

// Lineas del reporte que son etiquetas: van en negrita (el texto que se copia es el mismo).
const ETIQUETAS_REPORTE = ["CÁLCULO DE AMPACIDAD AÉREA", "PARÁMETROS DE ENTRADA:", "RESULTADOS:"];

const INFO_EMISIVIDAD = "Entre 0.23 (conductor nuevo, brillante) y 0.91 (envejecido, oscuro).";

export async function render(container) {
  const conductores = await loadData("conductores-desnudos");
  const tipos = distinct(conductores, "tipo");

  container.innerHTML = `
    <div class="breadcrumb"><a href="#/">Inicio</a> <span>/</span> <a href="#/calculos">Cálculos</a> <span>/</span> <span>Ampacidad aérea</span></div>
    <h1 class="page-title">Ampacidad de conductores aéreos</h1>

    <form id="form-calc" novalidate>
      <div class="card tarjeta-borde form-section">
        <div class="form-section-title">${icon("conductorCableado")} Conductor</div>
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
        <div class="grid-2">
          <div class="field">
            <label for="f-referencia">Referencia</label>
            <select id="f-referencia" required disabled>
              <option value="">Seleccione un calibre primero</option>
            </select>
          </div>
          <div class="field">
            <label for="f-diametro">Diámetro del cable (mm)</label>
            <div class="input-with-toggle">
              <input type="number" id="f-diametro" min="0" max="1000" step="any" required disabled>
              <label class="checkbox-row"><input type="checkbox" id="chk-diametro"> Manual</label>
            </div>
          </div>
        </div>
        <div class="grid-2 ultima">
          <div class="field">
            <label for="f-rbajo" data-info="La resistencia a la temperatura del conductor se interpola entre los valores a 25 °C y a 75 °C.">Resistencia AC a 25°C (Ω/km)</label>
            <div class="input-with-toggle">
              <input type="number" id="f-rbajo" min="0" max="1000" step="any" required disabled>
              <label class="checkbox-row"><input type="checkbox" id="chk-rbajo"> Manual</label>
            </div>
          </div>
          <div class="field">
            <label for="f-ralto" data-info="La resistencia a la temperatura del conductor se interpola entre los valores a 25 °C y a 75 °C.">Resistencia AC a 75°C (Ω/km)</label>
            <div class="input-with-toggle">
              <input type="number" id="f-ralto" min="0" max="1000" step="any" required disabled>
              <label class="checkbox-row"><input type="checkbox" id="chk-ralto"> Manual</label>
            </div>
          </div>
        </div>
      </div>

      <div class="card tarjeta-borde form-section">
        <div class="form-section-title">${icon("wind")} Condiciones de operación</div>
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
            <label for="f-vw" data-info="Por defecto 0.61 m/s (2 ft/s), el valor de referencia de la IEEE 738.">Velocidad del viento (m/s)</label>
            <input type="number" id="f-vw" min="0" max="100" step="0.01" value="0.61" required>
          </div>
          <div class="field">
            <label for="f-angulo" data-info="90° es viento perpendicular al conductor.">Ángulo viento-conductor (°)</label>
            <input type="number" id="f-angulo" min="0" max="360" step="1" value="90" required>
          </div>
        </div>
        <div class="grid-2 ultima">
          <div class="field">
            <label for="f-elevacion">Elevación sobre el nivel del mar (m)</label>
            <input type="number" id="f-elevacion" min="0" max="10000" step="1" value="0" required>
          </div>
        </div>
      </div>

      <div class="card tarjeta-borde form-section">
        <div class="form-section-title">${icon("sunTabler")} Radiación solar y superficie</div>
        <div class="grid-2">
          <div class="field">
            <label for="f-epsilon" data-info="${INFO_EMISIVIDAD}">Emisividad (ε)</label>
            <input type="number" id="f-epsilon" min="0.23" max="0.91" step="0.01" value="0.5" required>
          </div>
          <div class="field">
            <label for="f-alfa" data-info="${INFO_EMISIVIDAD}">Absortividad (α)</label>
            <input type="number" id="f-alfa" min="0.23" max="0.91" step="0.01" value="0.5" required>
          </div>
        </div>
        <div class="grid-2 ultima">
          <div class="field">
            <label for="f-qse" data-info="Se ingresa directamente: no se calcula a partir de fecha, hora y latitud.">Radiación solar total Qse (W/m²)</label>
            <div class="input-with-toggle">
              <input type="number" id="f-qse" min="0" max="3000" step="1" value="1000" required disabled>
              <label class="checkbox-row"><input type="checkbox" id="chk-qse"> Manual</label>
            </div>
          </div>
          <div class="field">
            <label for="f-theta" data-info="90° es el sol perpendicular al conductor (máxima absorción).">Ángulo efectivo de incidencia solar θ (°)</label>
            <div class="input-with-toggle">
              <input type="number" id="f-theta" min="0" max="1000" step="1" value="90" required disabled>
              <label class="checkbox-row"><input type="checkbox" id="chk-theta"> Manual</label>
            </div>
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

  // ---------- restaurar lo que habia si se volvio de otra seccion (no sobrevive a un recargue) ----------
  const guardado = leerEstado(RUTA);
  if (guardado) {
    selTipo.value = guardado.tipo;
    selTipo.dispatchEvent(new Event("change"));
    selCalibre.value = guardado.calibre;
    selCalibre.dispatchEvent(new Event("change"));
    selReferencia.value = guardado.referencia;
    selReferencia.dispatchEvent(new Event("change"));
    if (guardado.manualDiametro) {
      chkDiametro.checked = true;
      chkDiametro.dispatchEvent(new Event("change"));
      fDiametro.value = guardado.diametro;
    }
    if (guardado.manualRbajo) {
      chkRbajo.checked = true;
      chkRbajo.dispatchEvent(new Event("change"));
      fRbajo.value = guardado.rbajo;
    }
    if (guardado.manualRalto) {
      chkRalto.checked = true;
      chkRalto.dispatchEvent(new Event("change"));
      fRalto.value = guardado.ralto;
    }
    fTa.value = guardado.ta;
    fTc.value = guardado.tc;
    fVw.value = guardado.vw;
    fAngulo.value = guardado.angulo;
    fElevacion.value = guardado.elevacion;
    fEpsilon.value = guardado.epsilon;
    fAlfa.value = guardado.alfa;
    if (guardado.manualQse) {
      chkQse.checked = true;
      chkQse.dispatchEvent(new Event("change"));
      fQse.value = guardado.qse;
    }
    if (guardado.manualTheta) {
      chkTheta.checked = true;
      chkTheta.dispatchEvent(new Event("change"));
      fTheta.value = guardado.theta;
    }
  }

  // El router llama a esto justo antes de salir de la pantalla (ver js/router.js), para que lo
  // escrito no se pierda al volver de otra sección; una recarga de la app si lo reinicia.
  function antesDeSalir() {
    guardarEstado(RUTA, {
      tipo: selTipo.value,
      calibre: selCalibre.value,
      referencia: selReferencia.value,
      manualDiametro: chkDiametro.checked,
      diametro: fDiametro.value,
      manualRbajo: chkRbajo.checked,
      rbajo: fRbajo.value,
      manualRalto: chkRalto.checked,
      ralto: fRalto.value,
      ta: fTa.value,
      tc: fTc.value,
      vw: fVw.value,
      angulo: fAngulo.value,
      elevacion: fElevacion.value,
      epsilon: fEpsilon.value,
      alfa: fAlfa.value,
      manualQse: chkQse.checked,
      qse: fQse.value,
      manualTheta: chkTheta.checked,
      theta: fTheta.value,
    });
  }

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

  function reporteTexto(data, p, ctx, hayCorriente) {
    // El reporte se copia y se pega: tres etiquetas (el calculo, los parametros de entrada y los resultados).
    // Parametros = lo que el usuario dio; resultados = todo lo que sale del calculo.
    const i = data.intermedios;
    return [
      `CÁLCULO DE AMPACIDAD AÉREA`,
      ``,
      ``,
      `PARÁMETROS DE ENTRADA:`,
      LINEA_REPORTE,
      `Tipo: ${ctx.tipo}`,
      `Calibre: ${ctx.calibre}`,
      `Referencia: ${ctx.referencia}`,
      `Diámetro: ${fmt(p.diametroMm)} mm`,
      `Resistencia AC 25°C: ${fmt(p.rBajoOhmKm)} Ω/km`,
      `Resistencia AC 75°C: ${fmt(p.rAltoOhmKm)} Ω/km`,
      `Temperatura ambiente: ${fmt(p.taC)} °C`,
      `Temperatura máxima del conductor: ${fmt(p.tcC)} °C`,
      `Velocidad del viento: ${fmt(p.vwMs)} m/s`,
      `Ángulo viento-conductor: ${fmt(p.anguloVientoDeg)} °`,
      `Elevación sobre el nivel del mar: ${fmt(p.elevacionM)} m`,
      `Emisividad (ε): ${fmt(p.epsilon)}`,
      `Absortividad (α): ${fmt(p.alfa)}`,
      `Radiación solar total (Qse): ${fmt(p.qseWm2)} W/m²`,
      `Ángulo efectivo de incidencia solar (θ): ${fmt(p.thetaDeg)} °`,
      ``,
      ``,
      `RESULTADOS:`,
      LINEA_REPORTE,
      `Qc (convección): ${fmt(i.qc)} W/m`,
      `Qr (radiación emitida): ${fmt(i.qr)} W/m`,
      `Qs (radiación solar absorbida): ${fmt(i.qs)} W/m`,
      `R (resistencia efectiva): ${fmt(i.r * 1000, 4)} Ω/km`,
      ``,
      hayCorriente ? `Ampacidad: ${fmt(data.ampacidad)} A` : `Ampacidad: el balance térmico no admite corriente con estos datos`,
    ].join("\n");
  }

  function renderResultado(data, p, ctx) {
    const wrap = container.querySelector("#resultado-wrap");
    const hayCorriente = data.ampacidad > 0 && Number.isFinite(data.ampacidad); // sin corriente si la ganancia solar supera la disipacion

    const resultado = hayCorriente
      ? `
          <div class="result-panel">
            <div class="result-metric">
              <div class="value">${fmt(data.ampacidad)}<span class="unit">A</span></div>
              <div class="label">Ampacidad admisible</div>
            </div>
          </div>`
      : `
          <div class="callout callout-warning">Con estos datos el balance térmico no admite corriente: la ganancia solar supera lo que el conductor disipa, o la temperatura máxima del conductor es menor que la ambiente.</div>`;

    wrap.innerHTML = tarjetaResultadosHtml({
      resultado,
      reporte: reporteHtml(reporteTexto(data, p, ctx, hayCorriente), ETIQUETAS_REPORTE),
      formulasPlano: FORMULAS_TEXTO,
    });
    activarPestanas(wrap, { grupos: FORMULAS_TEX, etiquetas: FORMULAS_ETIQUETAS, nota: FORMULAS_NOTA });

    wrap.scrollIntoView({ behavior: "smooth", block: "nearest" });
  }

  return antesDeSalir;
}
