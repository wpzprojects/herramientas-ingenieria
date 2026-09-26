// Calculadora de regulacion (caida de tension) en una linea trifasica de uno o varios tramos.
// La pantalla se divide en tarjetas: "Datos de la linea" (con el dato de partida: potencia activa, aparente o
// corriente) y una tarjeta "Conductor" por cada tramo (conductor, longitud, haz de conductores y distancias entre
// fases). La logica de varios tramos vive en ../calc/regulacion-tramos.js; el motor original (../calc/regulacion.js)
// se usa tal cual, tramo por tramo. Es la misma estructura de la pantalla de Perdidas.

import { fmt, fmtPercent, loadData, distinct, escapeHtml } from "../util/format.js";
import { icon } from "../icons.js";
import {
  potenciaActivaMw,
  calcularRegulacionTramos,
  clasificarRegulacion,
  sugerirCalibre,
  UMBRAL_OPTIMO_PCT,
  UMBRAL_ACEPTABLE_PCT,
} from "../calc/regulacion-tramos.js";
import { LINEA_REPORTE, reporteHtml, tarjetaResultadosHtml, activarPestanas, resumenConGraficosHtml } from "../util/resultados-ui.js";
import { activarInfos } from "../util/info-campo.js";
import { activarPlegables } from "../util/tarjetas-plegables.js";
import { perfilTensionSvg } from "../util/graficos.js";
import { activarReportes, numTex } from "../util/reportes.js";
import { revelar } from "../util/revelar.js";
import { guardarEstado, leerEstado } from "../util/persistencia-calculo.js";
import { aplicarDefectos } from "../util/valores-defecto.js";

const RUTA = "/calculos/regulacion";

// Ecuaciones (LaTeX) de la pestaña Fórmulas: replican lo que hace el motor, con las mismas unidades
// (MW, kV, Ω/km, km, mm para el radio medio geométrico y m para las distancias).
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
    titulo: "Conductor y disposición de fases",
    ecuaciones: [
      String.raw`R_{ef} = \dfrac{R_{75}}{N} \quad [\Omega/\mathrm{km}]`,
      String.raw`r = \dfrac{1000\,d}{2\,\sin(\pi/N)} \quad [\mathrm{mm}]`,
      String.raw`RMG_{eq} = \sqrt[N]{N \cdot RMG \cdot r^{\,N-1}} \quad [\mathrm{mm}]`,
      String.raw`X_l = 0.0754\,\ln\!\left(\dfrac{\sqrt[3]{D_{ab}\,D_{ac}\,D_{bc}}}{RMG_{eq}/1000}\right) \quad [\Omega/\mathrm{km}]`,
    ],
  },
  {
    titulo: "Regulación (caída de tensión)",
    ecuaciones: [
      String.raw`Z = R_{ef}\cos\varphi + X_l\sin\varphi \quad [\Omega/\mathrm{km}]`,
      String.raw`F_r = R_{ef} + X_l\tan\varphi \quad [\Omega/\mathrm{km}]`,
      String.raw`K = \dfrac{F_r}{10\,V^{2}}`,
      String.raw`\%\Delta V_i = \dfrac{\sqrt{3}\,I\,Z_i\,L_i \cdot 100}{V \cdot 1000}`,
      String.raw`\%\Delta V_{total} = \sum_{i} \%\Delta V_i`,
    ],
  },
];

// Descripcion de las etiquetas (simbolos) de las ecuaciones, en el orden en que aparecen; el simbolo se dibuja con KaTeX igual que en ellas.
const FORMULAS_ETIQUETAS = [
  { tex: "P", texto: "Potencia activa [MW]" },
  { tex: "S", texto: "Potencia aparente [MVA]" },
  { tex: "Q", texto: "Potencia reactiva [MVAR]" },
  { tex: "V", texto: "Tensión de línea [kV]" },
  { tex: "I", texto: "Corriente [A]" },
  { tex: String.raw`\cos\varphi`, texto: "Factor de potencia" },
  { tex: "R_{75}", texto: "Resistencia AC de un conductor a 75 °C [Ω/km]" },
  { tex: "N", texto: "Conductores por fase" },
  { tex: "R_{ef}", texto: "Resistencia efectiva del tramo [Ω/km]" },
  { tex: "d", texto: "Separación entre subconductores del haz [m]" },
  { tex: "r", texto: "Radio del polígono que forman los subconductores [mm]" },
  { tex: "RMG", texto: "Radio medio geométrico de un conductor [mm]" },
  { tex: "RMG_{eq}", texto: "Radio medio geométrico equivalente del haz [mm]" },
  { tex: String.raw`D_{ab},\,D_{ac},\,D_{bc}`, texto: "Distancias entre fases [m]" },
  { tex: "X_l", texto: "Reactancia inductiva [Ω/km]" },
  { tex: "Z", texto: "Impedancia efectiva [Ω/km]" },
  { tex: "F_r", texto: "Factor de regulación [Ω/km]" },
  { tex: "K", texto: "Constante de regulación" },
  { tex: "L_i", texto: "Longitud del tramo i [km]" },
  { tex: String.raw`\%\Delta V_i`, texto: "Caída de tensión del tramo i [%]" },
  { tex: String.raw`\%\Delta V_{total}`, texto: "Caída de tensión total del circuito [%]" },
];

const FORMULAS_NOTA = `El circuito puede tener varios tramos (cada uno con su conductor, longitud y disposición de fases): la caída de tensión total es la suma de la de cada tramo, válido cuando la corriente es la misma en todo el circuito (sin cargas intermedias).

Con más de un conductor por fase, la resistencia efectiva es R/N y el radio medio geométrico es el equivalente del haz (subconductores idénticos, equiespaciados en un polígono regular).

La caída de tensión de cada tramo también puede calcularse como P·L·K, con P en kW y L en km (es la misma expresión escrita de otra forma).`;

// Texto plano de respaldo si KaTeX no se puede cargar.
const FORMULAS_TEXTO = `I = (P·1000) / (√3·V·cos φ)               [A]
S = P / cos φ                              [MVA]
Q = √(S² − P²)                             [MVAR]

Ref = R75 / N                              [Ω/km]
r = 1000·d / (2·sen(π/N))                  [mm]
RMGeq = (N·RMG·r^(N−1))^(1/N)              [mm]
Xl = 0.0754·ln( ∛(Dab·Dac·Dbc) / (RMGeq/1000) )   [Ω/km]

Z  = Ref·cos φ + Xl·sen φ                  [Ω/km]
Fr = Ref + Xl·tan φ                        [Ω/km]
K  = Fr / (10·V²)
% Caída del tramo = (√3·I·Z·L·100) / (V·1000)
% Caída total = suma del % de cada tramo

Dato de partida: P = S·cos φ   |   P = √3·V·I·cos φ / 1000

${FORMULAS_NOTA}`;

// Lineas del reporte que son etiquetas: van en negrita (el texto que se copia es el mismo).
const ETIQUETAS_REPORTE = ["CÁLCULO DE REGULACIÓN", "PARÁMETROS DE ENTRADA:", "RESULTADOS:"];

const INFO_REFERENCIA =
  "Un mismo calibre puede tener varias construcciones (número de hilos, diámetro) con resistencia y RMG distintos. Solo aplica a conductores aéreos: en subterráneo (XLPE) no hay varias referencias por calibre.";

const MODOS = {
  potencia: "Potencia activa",
  aparente: "Potencia aparente",
  corriente: "Corriente",
};

// Valor por defecto de un desplegable (pedido del usuario, 2026-09-26: poder calcular de una sin elegir nada). Si la opción
// no existe no hace nada; sin valor toma la primera opción real. Dispara «change» para que la cascada se complete.
const porDefecto = (sel, v) => {
  const valor = v ?? [...sel.options].find((o) => o.value)?.value;
  if (valor && [...sel.options].some((o) => o.value === valor)) {
    sel.value = valor;
    sel.dispatchEvent(new Event("change"));
  }
};

export async function render(container) {
  const desnudos = await loadData("conductores-desnudos");
  const xlpe = await loadData("conductores-xlpe");

  container.innerHTML = `
    <div class="breadcrumb"><a href="#/">Inicio</a> <span>/</span> <a href="#/calculos">Cálculos</a> <span>/</span> <span>Regulación</span></div>
    <h1 class="page-title">Regulación (caída de tensión)</h1>

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

        <div class="grid-2 ultima">
          <div class="field" id="wrap-potencia">
            <label for="f-potencia">Potencia activa (MW)</label>
            <input type="number" id="f-potencia" min="0" step="0.01" value="9.9" required>
          </div>
          <div class="field" id="wrap-aparente" hidden>
            <label for="f-aparente">Potencia aparente (MVA)</label>
            <input type="number" id="f-aparente" min="0" step="0.01" value="11">
          </div>
          <div class="field" id="wrap-corriente" hidden>
            <label for="f-corriente">Corriente (A)</label>
            <input type="number" id="f-corriente" min="0" step="0.1" value="184.1">
          </div>
          <div class="field">
            <label for="f-fp">Factor de potencia</label>
            <input type="number" id="f-fp" min="0" max="1" step="0.01" value="0.9" required>
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

  aplicarDefectos(container, "regulacion"); // valores por defecto personales (Perfil > Calculadoras), antes de restaurar lo escrito
  activarInfos(container);

  activarPlegables(container);
  const form = container.querySelector("#form-calc");
  const fTension = container.querySelector("#f-tension");
  const selModo = container.querySelector("#f-modo");
  const fPotencia = container.querySelector("#f-potencia");
  const fAparente = container.querySelector("#f-aparente");
  const fCorriente = container.querySelector("#f-corriente");
  const fFp = container.querySelector("#f-fp");
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
  const campoAreaDe = (red) => (red === "Aerea" ? "area_seccion_aluminio_mm2" : "area_conductor_mm2");

  /** Tarjeta de un tramo: cada tarjeta guarda su propio estado en el DOM, asi agregar o quitar otro tramo no lo pierde. */
  function crearTramo(id) {
    const cont = document.createElement("div");
    cont.innerHTML = `
      <div class="card tarjeta-borde form-section tramo-block">
        <div class="form-section-title">
          ${icon("conductorCableado")} <span class="tramo-titulo">Conductor tramo 1</span>
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
            <label for="f-longitud-${id}">Longitud del tramo (km)</label>
            <input type="number" id="f-longitud-${id}" min="0" step="0.01" value="5.2" required>
          </div>
          <div class="field">
            <label for="f-n-${id}" data-info="Resistencia efectiva: R conductor / # conductores por fase.">Conductores por fase</label>
            <input type="number" id="f-n-${id}" min="1" max="8" step="1" value="1" required>
          </div>
        </div>
        <div class="grid-2">
          <div class="field">
            <label for="f-sephaz-${id}" data-info="Solo aplica con más de un conductor por fase.">Separación entre subconductores del haz (m)</label>
            <input type="number" id="f-sephaz-${id}" min="0.01" max="5" step="0.01" value="0.4" disabled>
          </div>
          <div class="field">
            <label for="f-calibre-${id}">Calibre</label>
            <select id="f-calibre-${id}" required disabled>
              <option value="">Seleccione un material primero</option>
            </select>
          </div>
        </div>
        <div class="grid-2">
          <div class="field">
            <label for="f-referencia-${id}" data-info="${INFO_REFERENCIA}">Referencia</label>
            <select id="f-referencia-${id}" required disabled>
              <option value="">Seleccione un calibre primero</option>
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
            <label for="f-rmg-${id}">Radio medio geométrico (mm)</label>
            <div class="input-with-toggle">
              <input type="number" id="f-rmg-${id}" min="0" step="any" required disabled>
              <label class="checkbox-row"><input type="checkbox" id="chk-rmg-${id}"> Manual</label>
            </div>
          </div>
        </div>
        <div class="grid-3 ultima">
          <div class="field">
            <label for="f-dab-${id}">Distancia entre fases A-B (m)</label>
            <input type="number" id="f-dab-${id}" min="0" step="0.01" value="2" required>
          </div>
          <div class="field">
            <label for="f-dac-${id}">Distancia entre fases A-C (m)</label>
            <input type="number" id="f-dac-${id}" min="0" step="0.01" value="2.84" required>
          </div>
          <div class="field">
            <label for="f-dbc-${id}">Distancia entre fases B-C (m)</label>
            <input type="number" id="f-dbc-${id}" min="0" step="0.01" value="0.84" required>
          </div>
        </div>
      </div>`;
    const card = cont.firstElementChild;
    activarInfos(card);
    activarPlegables(card);
    const q = (s) => card.querySelector(s);
    const selRed = q(`#f-red-${id}`);
    const selMaterial = q(`#f-material-${id}`);
    const selCalibre = q(`#f-calibre-${id}`);
    const selReferencia = q(`#f-referencia-${id}`);
    const fResistencia = q(`#f-resistencia-${id}`);
    const chkResistencia = q(`#chk-resistencia-${id}`);
    const fLongitud = q(`#f-longitud-${id}`);
    const fN = q(`#f-n-${id}`);
    const fRmg = q(`#f-rmg-${id}`);
    const chkRmg = q(`#chk-rmg-${id}`);
    const fSepHaz = q(`#f-sephaz-${id}`);
    const fDab = q(`#f-dab-${id}`);
    const fDac = q(`#f-dac-${id}`);
    const fDbc = q(`#f-dbc-${id}`);

    let fila = null;

    function poblarMaterial() {
      const opciones = distinct(datasetDe(selRed.value), campoMaterialDe(selRed.value));
      selMaterial.innerHTML = opciones.map((o) => `<option value="${escapeHtml(o)}">${escapeHtml(o)}</option>`).join("");
      poblarCalibre();
    }

    function poblarCalibre() {
      const calibres = distinct(datasetDe(selRed.value).filter((c) => c[campoMaterialDe(selRed.value)] === selMaterial.value), "calibre_awg_kcmil", campoAreaDe(selRed.value));
      selCalibre.innerHTML = calibres.length
        ? `<option value="">Seleccione…</option>` + calibres.map((c) => `<option value="${escapeHtml(c)}">${escapeHtml(c)}</option>`).join("")
        : `<option value="">Sin calibres disponibles</option>`;
      selCalibre.disabled = !calibres.length;
      poblarReferencia();
    }

    // La referencia (construccion exacta del conductor) solo existe en el catalogo de conductores desnudos (aereos).
    function poblarReferencia() {
      if (selRed.value !== "Aerea") {
        selReferencia.innerHTML = `<option value="">No aplica (solo conductores aéreos)</option>`;
        selReferencia.disabled = true;
        fila = resolverFila();
        syncCatalogo();
        return;
      }
      const calibre = selCalibre.value;
      const refs = calibre ? datasetDe(selRed.value).filter((c) => c[campoMaterialDe(selRed.value)] === selMaterial.value && c.calibre_awg_kcmil === calibre) : [];
      selReferencia.innerHTML = refs.length
        ? `<option value="">Seleccione…</option>` +
          refs.map((c) => `<option value="${escapeHtml(c.nombre_clave)}">${escapeHtml(c.nombre_clave)}</option>`).join("")
        : `<option value="">Seleccione un calibre primero</option>`;
      selReferencia.disabled = !refs.length;
      fila = null;
      syncCatalogo();
    }

    function resolverFila() {
      if (!selCalibre.value) return null;
      if (selRed.value === "Aerea") {
        if (!selReferencia.value) return null;
        return (
          datasetDe(selRed.value).find(
            (c) => c[campoMaterialDe(selRed.value)] === selMaterial.value && c.calibre_awg_kcmil === selCalibre.value && c.nombre_clave === selReferencia.value
          ) || null
        );
      }
      return datasetDe(selRed.value).find((c) => c[campoMaterialDe(selRed.value)] === selMaterial.value && c.calibre_awg_kcmil === selCalibre.value) || null;
    }

    // Resistencia y radio medio geometrico salen del catalogo (este ultimo ya viene en mm) salvo que se marque «Manual».
    function syncCatalogo() {
      if (!chkResistencia.checked) fResistencia.value = fila ? fila.r_ac_75c_ohm_km : "";
      if (!chkRmg.checked) fRmg.value = fila ? fila.radio_medio_geometrico_mm : "";
    }

    selRed.addEventListener("change", poblarMaterial);
    selMaterial.addEventListener("change", poblarCalibre);
    selCalibre.addEventListener("change", poblarReferencia);
    selReferencia.addEventListener("change", () => {
      fila = resolverFila();
      syncCatalogo();
    });
    chkResistencia.addEventListener("change", () => {
      fResistencia.disabled = !chkResistencia.checked;
      if (!chkResistencia.checked) syncCatalogo();
    });
    chkRmg.addEventListener("change", () => {
      fRmg.disabled = !chkRmg.checked;
      if (!chkRmg.checked) syncCatalogo();
    });
    // La separacion del haz solo se pide (y se exige) con mas de un conductor por fase.
    fN.addEventListener("input", () => {
      const n = parseInt(fN.value, 10) || 1;
      fSepHaz.disabled = n <= 1;
      fSepHaz.required = n > 1;
    });
    poblarMaterial();
    // Conductor por defecto: AAAC 246.9 con su primera referencia (se puede calcular de una)
    if (selRed.value === "Aerea") {
      porDefecto(selMaterial, "AAAC");
      porDefecto(selCalibre, "246.9");
      porDefecto(selReferencia);
    }

    return {
      card,
      titulo: q(".tramo-titulo"),
      quitar: q(".btn-tramo-quitar"),
      /** Lo que el usuario dejo elegido en esta tarjeta. */
      estado: () => ({
        red: selRed.value,
        material: selMaterial.value,
        calibre: selCalibre.value,
        referencia: selReferencia.value,
        longitudKm: parseFloat(fLongitud.value),
        resistenciaOhmKm: parseFloat(fResistencia.value),
        rmgMm: parseFloat(fRmg.value),
        numConductoresPorFase: parseInt(fN.value, 10) || 1,
        separacionHazM: parseFloat(fSepHaz.value) || 0,
        dabM: parseFloat(fDab.value),
        dacM: parseFloat(fDac.value),
        dbcM: parseFloat(fDbc.value),
      }),
      /** Foto cruda para guardarla y restaurarla despues. */
      bruto: () => ({
        red: selRed.value,
        material: selMaterial.value,
        calibre: selCalibre.value,
        referencia: selReferencia.value,
        manualR: chkResistencia.checked,
        resistencia: fResistencia.value,
        manualRmg: chkRmg.checked,
        rmg: fRmg.value,
        longitud: fLongitud.value,
        n: fN.value,
        sephaz: fSepHaz.value,
        dab: fDab.value,
        dac: fDac.value,
        dbc: fDbc.value,
      }),
      /** Aplica una foto de `bruto()`, disparando los "change"/"input" en cascada. */
      aplicarBruto: (d) => {
        if (!d) return;
        selRed.value = d.red;
        selRed.dispatchEvent(new Event("change"));
        selMaterial.value = d.material;
        selMaterial.dispatchEvent(new Event("change"));
        if (d.manualR) {
          chkResistencia.checked = true;
          chkResistencia.dispatchEvent(new Event("change"));
        }
        if (d.manualRmg) {
          chkRmg.checked = true;
          chkRmg.dispatchEvent(new Event("change"));
        }
        selCalibre.value = d.calibre;
        selCalibre.dispatchEvent(new Event("change"));
        selReferencia.value = d.referencia ?? "";
        selReferencia.dispatchEvent(new Event("change"));
        if (d.manualR) fResistencia.value = d.resistencia;
        if (d.manualRmg) fRmg.value = d.rmg;
        fLongitud.value = d.longitud;
        fN.value = d.n;
        fN.dispatchEvent(new Event("input"));
        fSepHaz.value = d.sephaz;
        fDab.value = d.dab;
        fDac.value = d.dac;
        fDbc.value = d.dbc;
      },
    };
  }

  const tramosCont = container.querySelector("#tramos-container");
  const tramos = [];
  let siguienteId = 0;

  // «Agregar» va en la fila de «Calcular», justificado a la derecha (fuera de las tarjetas, siempre a la vista aunque se plieguen)
  const botonAgregar = document.createElement("button");
  botonAgregar.type = "button";
  botonAgregar.className = "btn btn-agregar-tramo";
  botonAgregar.innerHTML = `${icon("plus")} Agregar tramo`;
  botonAgregar.addEventListener("click", () => revelar(agregarTramo().card, { resaltar: true }));
  const filaCalcular = container.querySelector("#form-calc .btn-row");
  filaCalcular.classList.add("btn-row--agregar"); // si no caben en una linea: «Agregar» arriba y «Calcular» abajo, ambos a la izquierda
  filaCalcular.append(botonAgregar);

  /** Numera las tarjetas, muestra "Quitar" solo si hay mas de un tramo. */
  function actualizarTramos() {
    tramos.forEach((t, i) => {
      t.titulo.textContent = `Conductor tramo ${i + 1}`;
      t.quitar.hidden = tramos.length < 2;
    });
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
    return t;
  }
  agregarTramo();

  // ---------- restaurar lo que habia si se volvio de otra seccion (no sobrevive a un recargue) ----------
  const guardado = leerEstado(RUTA);
  if (guardado) {
    fTension.value = guardado.tension;
    selModo.value = guardado.modo;
    aplicarModo();
    fPotencia.value = guardado.potencia;
    fAparente.value = guardado.aparente;
    fCorriente.value = guardado.corriente;
    fFp.value = guardado.fp;
    for (let i = 1; i < guardado.tramos.length; i++) agregarTramo();
    tramos.forEach((t, i) => t.aplicarBruto(guardado.tramos[i]));
  }

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
    };
    const estados = tramos.map((t) => t.estado());
    renderResultado(calcularRegulacionTramos(base, estados), base, estados, { modo, datoPartida });
  });

  // El router llama a esto justo antes de salir de la pantalla (ver js/router.js), para que lo
  // escrito no se pierda al volver de otra sección; una recarga de la app si lo reinicia.
  function antesDeSalir() {
    guardarEstado(RUTA, {
      tension: fTension.value,
      modo: selModo.value,
      potencia: fPotencia.value,
      aparente: fAparente.value,
      corriente: fCorriente.value,
      fp: fFp.value,
      tramos: tramos.map((t) => t.bruto()),
    });
  }

  /** Calibres del mismo material que el tramo, con la caida de tension que tendria cada uno (un calibre = su primera referencia). */
  function candidatosCalibre(base, estado) {
    const campoMaterial = campoMaterialDe(estado.red);
    const campoArea = estado.red === "Aerea" ? "area_seccion_aluminio_mm2" : "area_conductor_mm2";
    const vistos = new Set();
    return datasetDe(estado.red)
      .filter((f) => {
        if (f[campoMaterial] !== estado.material || !f.calibre_awg_kcmil || f.r_ac_75c_ohm_km == null || f.radio_medio_geometrico_mm == null || f[campoArea] == null) return false;
        if (vistos.has(f.calibre_awg_kcmil)) return false;
        vistos.add(f.calibre_awg_kcmil);
        return true;
      })
      .map((f) => ({
        calibre: f.calibre_awg_kcmil,
        area: f[campoArea],
        caidaTensionPct: calcularRegulacionTramos(base, [{ ...estado, resistenciaOhmKm: f.r_ac_75c_ohm_km, rmgMm: f.radio_medio_geometrico_mm }]).caidaTensionPct,
      }))
      .sort((a, b) => a.area - b.area);
  }

  function comparacionCalibresHtml(base, estado) {
    const candidatos = candidatosCalibre(base, estado);
    if (!candidatos.length) return "";
    const { sugerido, menor, ventana } = sugerirCalibre(candidatos, UMBRAL_ACEPTABLE_PCT, 3, estado.calibre, "caidaTensionPct");
    const mensaje = sugerido
      ? `Calibre más pequeño con caída de tensión de ${fmtPercent(UMBRAL_ACEPTABLE_PCT, 0)} o menos: <strong>${escapeHtml(sugerido.calibre)}</strong> (${fmt(sugerido.area)} mm²).`
      : `Ningún calibre del catálogo baja de ${fmtPercent(UMBRAL_ACEPTABLE_PCT, 0)} de caída de tensión con estos datos; el de menor caída es <strong>${escapeHtml(menor.calibre)}</strong>.`;
    const filas = ventana
      .map((c) => {
        const clases = [c.calibre === sugerido?.calibre ? "match-row" : "", c.calibre === estado.calibre ? "current-row" : ""].filter(Boolean).join(" ");
        const actual = c.calibre === estado.calibre ? ' <span class="badge">Actual</span>' : "";
        return `<tr class="${clases}"><td>${escapeHtml(c.calibre)}${actual}</td><td class="num">${fmt(c.area)}</td><td class="num">${fmtPercent(c.caidaTensionPct)}</td></tr>`;
      })
      .join("");
    return `
      <div class="result-subhead">Comparación con otros calibres</div>
      <p class="text-muted text-sm" style="margin: 0 0 var(--space-3);">${mensaje}</p>
      <div class="table-wrap tabla-resultado"><table>
        <thead><tr><th>Calibre</th><th class="num">Área (mm²)</th><th class="num">% caída de tensión</th></tr></thead>
        <tbody>${filas}</tbody>
      </table></div>`;
  }

  const nombreRed = (red) => (red === "Aerea" ? "Aérea" : "Subterránea");
  const conductorTexto = (e) =>
    `${nombreRed(e.red)} · ${e.material} ${e.calibre}${e.referencia ? ` (${e.referencia})` : ""}${e.numConductoresPorFase > 1 ? ` ×${e.numConductoresPorFase}` : ""}`;

  function tablaTramosHtml(r, estados) {
    const filas = r.tramos
      .map((t, i) => {
        const e = estados[i];
        return `<tr><td>Tramo ${t.numero}</td><td class="wrap">${escapeHtml(conductorTexto(e))}</td><td class="num">${fmt(e.longitudKm)}</td><td class="num">${fmt(t.constanteRegulacion, 7)}</td><td class="num">${fmtPercent(t.caidaTensionPct)}</td></tr>`;
      })
      .join("");
    return `
      <div class="result-subhead">Caída de tensión por tramo</div>
      <div class="table-wrap tabla-resultado"><table>
        <thead><tr><th>Tramo</th><th>Conductor</th><th class="num">Longitud (km)</th><th class="num">Constante K</th><th class="num">% caída de tensión</th></tr></thead>
        <tbody>${filas}<tr class="total-row"><td colspan="4">Total</td><td class="num">${fmtPercent(r.caidaTensionPct)}</td></tr></tbody>
      </table></div>`;
  }

  function reporteTexto(r, base, estados, { modo, datoPartida }) {
    // El reporte se copia y se pega: tres etiquetas (el calculo, los parametros de entrada y los resultados).
    // Parametros = lo que el usuario dio; resultados = todo lo que sale del calculo (incluido lo de cada tramo).
    const unidadDato = { potencia: "MW", aparente: "MVA", corriente: "A" }[modo];
    const parametrosTramos = estados.map((e, i) => [
      ``,
      `Tramo ${i + 1}:`,
      `  Tipo de red: ${nombreRed(e.red)}`,
      `  Material/Tipo de conductor: ${e.material}`,
      `  Calibre: ${e.calibre}`,
      ...(e.referencia ? [`  Referencia: ${e.referencia}`] : []),
      `  Resistencia AC a 75°C (por conductor): ${fmt(e.resistenciaOhmKm)} Ω/km`,
      `  Radio medio geométrico (por conductor): ${fmt(e.rmgMm)} mm`,
      `  Conductores por fase: ${e.numConductoresPorFase}`,
      `  Separación entre subconductores del haz: ${e.numConductoresPorFase > 1 ? `${fmt(e.separacionHazM)} m` : "N/A (1 conductor)"}`,
      `  Longitud del tramo: ${fmt(e.longitudKm)} km`,
      `  Distancia entre fases A-B: ${fmt(e.dabM)} m`,
      `  Distancia entre fases A-C: ${fmt(e.dacM)} m`,
      `  Distancia entre fases B-C: ${fmt(e.dbcM)} m`,
    ].join("\n"));
    const resultadosTramos = r.tramos.map((t) => [
      ``,
      `Tramo ${t.numero}:`,
      `  Resistencia efectiva (R/N): ${fmt(t.resistenciaEfectivaOhmKm)} Ω/km`,
      `  RMG equivalente del haz: ${fmt(t.rmgEfectivoMm)} mm`,
      `  Reactancia inductiva: ${fmt(t.reactanciaInductiva, 4)} Ω/km`,
      `  Impedancia efectiva: ${fmt(t.impedanciaEfectiva, 4)} Ω/km`,
      `  Constante de regulación: ${fmt(t.constanteRegulacion, 7)}`,
      `  Caída de tensión del tramo: ${fmtPercent(t.caidaTensionPct)}`,
    ].join("\n"));
    const potenciaActiva = `Potencia activa: ${fmt(base.potenciaActivaMw)} MW`;
    return [
      `CÁLCULO DE REGULACIÓN`,
      ``,
      ``,
      `PARÁMETROS DE ENTRADA:`,
      LINEA_REPORTE,
      `Tensión de línea: ${fmt(base.tensionLineaKv)} kV`,
      `Dato de partida: ${MODOS[modo]} (${fmt(datoPartida)} ${unidadDato})`,
      ...(modo === "potencia" ? [potenciaActiva] : []), // si parte de otro dato, la potencia activa se calcula y va en resultados
      `Factor de potencia: ${fmt(base.factorPotencia)}`,
      ...parametrosTramos,
      ``,
      ``,
      `RESULTADOS:`,
      LINEA_REPORTE,
      ...(modo === "potencia" ? [] : [potenciaActiva]),
      `Corriente: ${fmt(r.corriente)} A`,
      `Potencia aparente: ${fmt(r.potenciaS)} MVA`,
      `Potencia reactiva: ${fmt(r.potenciaQ)} MVAR`,
      ...resultadosTramos,
      ``,
      `Caída de tensión${r.tramos.length > 1 ? " total" : ""}: ${fmtPercent(r.caidaTensionPct)}`,
    ].join("\n");
  }

  /** Parámetros de entrada con su símbolo (memoria en LaTeX). */
  function simbolosRegulacion(base, estados, dato) {
    const n = numTex;
    const s = [];
    if (dato.modo === "aparente") s.push({ tex: "S", nombre: "Potencia aparente", valor: n(dato.datoPartida), unidad: String.raw`\text{MVA}` });
    else if (dato.modo === "corriente") s.push({ tex: "I", nombre: "Corriente", valor: n(dato.datoPartida), unidad: String.raw`\text{A}` });
    else s.push({ tex: "P", nombre: "Potencia activa", valor: n(base.potenciaActivaMw), unidad: String.raw`\text{MW}` });
    s.push({ tex: "V", nombre: "Tensión de línea", valor: n(base.tensionLineaKv), unidad: String.raw`\text{kV}` });
    s.push({ tex: String.raw`\cos\varphi`, nombre: "Factor de potencia", valor: n(base.factorPotencia) });
    const varios = estados.length > 1;
    estados.forEach((e, i) => {
      const sub = varios ? `_{${i + 1}}` : "";
      const de = varios ? ` del tramo ${i + 1}` : "";
      const N = e.numConductoresPorFase ?? 1;
      s.push({ tex: `L${sub}`, nombre: `Longitud${de}`, valor: n(e.longitudKm), unidad: String.raw`\text{km}` });
      s.push({ tex: `R${sub}`, nombre: `Resistencia del conductor a 75 °C${de}`, valor: n(e.resistenciaOhmKm), unidad: String.raw`\Omega/\text{km}` });
      s.push({ tex: `RMG${sub}`, nombre: `Radio medio geométrico del conductor${de}`, valor: n(e.rmgMm), unidad: String.raw`\text{mm}` });
      s.push({ tex: `N${sub}`, nombre: `Conductores por fase${de}`, valor: String(N) });
      if (N > 1) s.push({ tex: `d${sub}`, nombre: `Separación entre subconductores del haz${de}`, valor: n(e.separacionHazM), unidad: String.raw`\text{m}` });
      s.push({ tex: String.raw`D_{ab}${sub},\ D_{ac}${sub},\ D_{bc}${sub}`, nombre: `Distancias entre fases${de}`, valor: `${n(e.dabM)},\\ ${n(e.dacM)},\\ ${n(e.dbcM)}`, unidad: String.raw`\text{m}` });
    });
    return s;
  }

  /** Memoria de cálculo paso a paso con las MISMAS fórmulas del motor (js/calc/regulacion.js, tramo por tramo). */
  function memoriaRegulacion(r, base, estados, dato) {
    const n = numTex;
    const P = base.potenciaActivaMw, V = base.tensionLineaKv, fp = base.factorPotencia, I = r.corriente;
    const sen = Math.sin(Math.acos(fp)), tan = Math.tan(Math.acos(fp));
    const pasos = [];
    if (dato.modo === "aparente") pasos.push({ titulo: "Potencia activa", tex: String.raw`P = S \cos\varphi = ${n(dato.datoPartida)} \cdot ${n(fp)} = ${n(P, 3)}\ \text{MW}`, texto: `P = S·cos φ = ${n(dato.datoPartida)}·${n(fp)} = ${n(P, 3)} MW` });
    else if (dato.modo === "corriente") pasos.push({ titulo: "Potencia activa", tex: String.raw`P = \frac{\sqrt{3}\, V\, I \cos\varphi}{1000} = \frac{\sqrt{3} \cdot ${n(V)} \cdot ${n(dato.datoPartida)} \cdot ${n(fp)}}{1000} = ${n(P, 3)}\ \text{MW}`, texto: `P = √3·V·I·cos φ / 1000 = ${n(P, 3)} MW` });
    pasos.push({ titulo: "Corriente", tex: String.raw`I = \frac{P \cdot 1000}{\sqrt{3}\, V \cos\varphi} = \frac{${n(P)} \cdot 1000}{\sqrt{3} \cdot ${n(V)} \cdot ${n(fp)}} = ${n(I, 2)}\ \text{A}`, texto: `I = P·1000 / (√3·V·cos φ) = ${n(P)}·1000 / (√3·${n(V)}·${n(fp)}) = ${n(I, 2)} A` });
    pasos.push({ titulo: "Potencia aparente y reactiva", tex: String.raw`S = \frac{P}{\cos\varphi} = ${n(r.potenciaS, 3)}\ \text{MVA} \qquad Q = \sqrt{S^2 - P^2} = ${n(r.potenciaQ, 3)}\ \text{MVAR}`, texto: `S = P / cos φ = ${n(r.potenciaS, 3)} MVA;  Q = √(S² − P²) = ${n(r.potenciaQ, 3)} MVAR` });
    const varios = r.tramos.length > 1;
    r.tramos.forEach((t, i) => {
      const e = estados[i];
      const N = e.numConductoresPorFase ?? 1;
      const pre = varios ? `Tramo ${i + 1} · ` : "";
      const sub = varios ? `_{${i + 1}}` : "";
      const dmg = Math.cbrt(e.dabM * e.dacM * e.dbcM);
      if (N > 1) {
        pasos.push({ titulo: `${pre}Resistencia efectiva`, tex: String.raw`R_{ef}${sub} = \frac{R}{N} = \frac{${n(e.resistenciaOhmKm)}}{${N}} = ${n(t.resistenciaEfectivaOhmKm)}\ \Omega/\text{km}`, texto: `Ref = R / N = ${n(e.resistenciaOhmKm)} / ${N} = ${n(t.resistenciaEfectivaOhmKm)} Ω/km` });
        const rr = (e.separacionHazM * 1000) / (2 * Math.sin(Math.PI / N));
        pasos.push({ titulo: `${pre}RMG equivalente del haz`, tex: String.raw`r = \frac{1000\, d}{2 \sin(\pi/N)} = ${n(rr, 2)}\ \text{mm} \qquad RMG_{eq} = \sqrt[N]{N \cdot RMG \cdot r^{N-1}} = ${n(t.rmgEfectivoMm, 3)}\ \text{mm}`, texto: `r = 1000·d / (2·sen(π/N)) = ${n(rr, 2)} mm;  RMGeq = (N·RMG·r^(N−1))^(1/N) = ${n(t.rmgEfectivoMm, 3)} mm` });
      }
      pasos.push({ titulo: `${pre}Distancia media geométrica entre fases`, tex: String.raw`DMG = \sqrt[3]{D_{ab} D_{ac} D_{bc}} = \sqrt[3]{${n(e.dabM)} \cdot ${n(e.dacM)} \cdot ${n(e.dbcM)}} = ${n(dmg)}\ \text{m}`, texto: `DMG = ∛(Dab·Dac·Dbc) = ∛(${n(e.dabM)}·${n(e.dacM)}·${n(e.dbcM)}) = ${n(dmg)} m` });
      pasos.push({ titulo: `${pre}Reactancia inductiva`, tex: String.raw`X_l${sub} = 0.0754 \ln\!\left(\frac{DMG}{RMG_{eq}/1000}\right) = 0.0754 \ln\!\left(\frac{${n(dmg)}}{${n(t.rmgEfectivoMm / 1000, 6)}}\right) = ${n(t.reactanciaInductiva)}\ \Omega/\text{km}`, texto: `Xl = 0.0754·ln(DMG / (RMGeq/1000)) = 0.0754·ln(${n(dmg)} / ${n(t.rmgEfectivoMm / 1000, 6)}) = ${n(t.reactanciaInductiva)} Ω/km` });
      pasos.push({ titulo: `${pre}Impedancia efectiva`, tex: String.raw`Z${sub} = R_{ef} \cos\varphi + X_l \sin\varphi = ${n(t.resistenciaEfectivaOhmKm)} \cdot ${n(fp)} + ${n(t.reactanciaInductiva)} \cdot ${n(sen)} = ${n(t.impedanciaEfectiva)}\ \Omega/\text{km}`, texto: `Z = Ref·cos φ + Xl·sen φ = ${n(t.resistenciaEfectivaOhmKm)}·${n(fp)} + ${n(t.reactanciaInductiva)}·${n(sen)} = ${n(t.impedanciaEfectiva)} Ω/km` });
      pasos.push({ titulo: `${pre}Constante de regulación`, tex: String.raw`K${sub} = \frac{R_{ef} + X_l \tan\varphi}{10\, V^2} = \frac{${n(t.resistenciaEfectivaOhmKm)} + ${n(t.reactanciaInductiva)} \cdot ${n(tan)}}{10 \cdot ${n(V)}^2} = ${n(t.constanteRegulacion, 8)}`, texto: `K = (Ref + Xl·tan φ) / (10·V²) = ${n(t.constanteRegulacion, 8)}` });
      pasos.push({ titulo: `${pre}Caída de tensión`, tex: String.raw`\%\Delta V${sub} = \frac{\sqrt{3}\, I\, Z\, L \cdot 100}{V \cdot 1000} = \frac{\sqrt{3} \cdot ${n(I, 2)} \cdot ${n(t.impedanciaEfectiva)} \cdot ${n(e.longitudKm)} \cdot 100}{${n(V)} \cdot 1000} = ${n(t.caidaTensionPct, 3)}\,\%`, texto: `%ΔV = √3·I·Z·L·100 / (V·1000) = √3·${n(I, 2)}·${n(t.impedanciaEfectiva)}·${n(e.longitudKm)}·100 / (${n(V)}·1000) = ${n(t.caidaTensionPct, 3)} %` });
    });
    if (varios) pasos.push({ titulo: "Caída total del circuito", tex: String.raw`\%\Delta V = ${r.tramos.map((t) => n(t.caidaTensionPct, 3)).join(" + ")} = ${n(r.caidaTensionPct, 3)}\,\%`, texto: `%ΔV = ${r.tramos.map((t) => n(t.caidaTensionPct, 3)).join(" + ")} = ${n(r.caidaTensionPct, 3)} %` });
    return pasos;
  }

  function renderResultado(r, base, estados, dato) {
    const wrap = container.querySelector("#resultado-wrap");
    const clase = Number.isFinite(r.caidaTensionPct) ? clasificarRegulacion(r.caidaTensionPct) : null; // sin etiqueta si los datos no dan un numero
    const varios = r.tramos.length > 1;

    // Gráficos (2026-09-26, elegidos por el usuario: R1 + R3 del mock-up): primero las cifras y después el perfil de tensión
    // a lo largo de la línea, tramo por tramo, y la barra vertical con las referencias de diseño, del mismo alto.
    const conGraficos = Number.isFinite(r.caidaTensionPct) && r.caidaTensionPct > 0 && estados.every((e) => e.longitudKm > 0);
    const graficos = conGraficos
      ? [
          { svg: perfilTensionSvg({ tramos: r.tramos.map((t, i) => ({ nombre: `T${i + 1} · ${estados[i].calibre}`, longitudKm: estados[i].longitudKm, caidaPct: t.caidaTensionPct })), optimo: UMBRAL_OPTIMO_PCT, aceptable: UMBRAL_ACEPTABLE_PCT }), ancho: 460 },
        ]
      : [];
    const cifras = `
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
              ${
                varios
                  ? ""
                  : `<div class="result-metric">
                <div class="value">${fmt(r.tramos[0].constanteRegulacion, 7)}</div>
                <div class="label">Constante de regulación</div>
              </div>`
              }
              <div class="result-metric">
                <div class="value">${fmtPercent(r.caidaTensionPct)}</div>
                <div class="label">Caída de tensión${varios ? " total" : ""}</div>
                ${clase ? `<div class="metric-badge"><span class="badge ${clase.clase}">${clase.etiqueta}</span></div>` : ""}
              </div>
            </div>`;
    const nota = `<p class="text-muted text-sm" style="margin: var(--space-3) 0 0;">Referencias de diseño: hasta ${UMBRAL_OPTIMO_PCT}% óptimo · hasta ${UMBRAL_ACEPTABLE_PCT}% aceptable.</p>`;

    const resultado = `
          <div class="result-panel">
            ${conGraficos ? resumenConGraficosHtml({ cifras, nota, graficos }) : cifras + nota}
            ${varios ? tablaTramosHtml(r, estados) : comparacionCalibresHtml(base, estados[0])}
          </div>`;

    const textoReporte = reporteTexto(r, base, estados, dato);
    wrap.innerHTML = tarjetaResultadosHtml({
      resultado,
      conDocumentos: true,
      reporte: reporteHtml(textoReporte, ETIQUETAS_REPORTE),
      formulasPlano: FORMULAS_TEXTO,
    });
    activarPestanas(wrap, { grupos: FORMULAS_TEX, etiquetas: FORMULAS_ETIQUETAS, nota: FORMULAS_NOTA });
    activarReportes(wrap, {
      titulo: "Cálculo de regulación",
      texto: textoReporte,
      pasos: memoriaRegulacion(r, base, estados, dato),
      simbolos: simbolosRegulacion(base, estados, dato),
      graficos: graficos.map((g) => ({ titulo: "Perfil de tensión a lo largo de la línea", svg: g.svg })),
    });

    wrap.scrollIntoView({ behavior: "smooth", block: "nearest" });
  }

  return antesDeSalir;
}
