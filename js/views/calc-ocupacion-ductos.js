// Calculadora de porcentaje de ocupacion de un ducto (NTC-2050 Cap. 9, Tabla 1).
// La pantalla se divide en tarjetas: "Tuberia" (tipo y diametro del ducto) y una tarjeta "Conductores" por cada TIPO de
// conductor que va dentro del ducto (cantidad y diametro exterior, del catalogo XLPE de media tension o ingresado a mano).
// Lo normal es un solo tipo; se pueden agregar mas (p. ej. una terna de un calibre y otra de otro). La suma de tipos vive en
// ../calc/ocupacion-grupos.js; el motor original (../calc/ocupacion-ductos.js) se usa tal cual. Misma estructura que Perdidas y Regulacion.

import { fmt, fmtPercent, loadData, distinct, escapeHtml } from "../util/format.js";
import { icon } from "../icons.js";
import { calcularOcupacionGrupos } from "../calc/ocupacion-grupos.js";
import { LINEA_REPORTE, reporteHtml, tarjetaResultadosHtml, activarPestanas } from "../util/resultados-ui.js";
import { activarInfos } from "../util/info-campo.js";
import { activarPlegables } from "../util/tarjetas-plegables.js";
import { donaOcupacionSvg, corteDuctoSvg } from "../util/graficos.js";

// Ecuaciones (LaTeX) de la pestaña Fórmulas.
const FORMULAS_TEX = [
  {
    titulo: "Áreas",
    ecuaciones: [
      String.raw`A_{c,i} = \dfrac{\pi}{4}\,d_i^{2} \quad [\mathrm{mm^2}]`,
      String.raw`A_c = \sum_{i} n_i \, A_{c,i} \quad [\mathrm{mm^2}]`,
      String.raw`A_t = \dfrac{\pi}{4}\,D_i^{2} \quad [\mathrm{mm^2}]`,
    ],
  },
  {
    titulo: "Ocupación",
    ecuaciones: [String.raw`\%Ocup = \dfrac{A_c}{A_t} \cdot 100`, String.raw`\%Disp = 100 - \%Ocup`],
  },
  {
    titulo: "Límite de ocupación (NTC-2050, Cap. 9, Tabla 1)",
    ecuaciones: [String.raw`L = \begin{cases} 53\,\% & N = 1 \\ 31\,\% & N = 2 \\ 40\,\% & N \geq 3 \end{cases}`],
  },
  {
    titulo: "Radio de curvatura",
    ecuaciones: [String.raw`R_c = 12\,d_i \quad [\mathrm{mm}]`],
  },
  {
    titulo: "Riesgo de atascamiento (jamming ratio)",
    ecuaciones: [String.raw`J = \dfrac{D_i}{d}`, String.raw`\text{riesgo si } N = 3 \text{ y } 2.8 < J < 3.2`],
  },
];

const FORMULAS_ETIQUETAS = [
  { tex: String.raw`d_i`, texto: "Diámetro exterior de un conductor del tipo i [mm]" },
  { tex: String.raw`n_i`, texto: "Cantidad de conductores del tipo i" },
  { tex: String.raw`A_{c,i}`, texto: "Área de un conductor del tipo i [mm²]" },
  { tex: String.raw`A_c`, texto: "Área total ocupada por los conductores [mm²]" },
  { tex: String.raw`D_i`, texto: "Diámetro interno de la tubería [mm]" },
  { tex: String.raw`A_t`, texto: "Área interna del ducto [mm²]" },
  { tex: "N", texto: "Número total de conductores dentro del ducto" },
  { tex: String.raw`\%Ocup`, texto: "Porcentaje de ocupación del ducto" },
  { tex: String.raw`\%Disp`, texto: "Porcentaje disponible" },
  { tex: "L", texto: "Límite de ocupación aplicable (NTC-2050)" },
  { tex: "J", texto: "Razón entre el diámetro interno del ducto y el del conductor" },
  { tex: String.raw`R_c`, texto: "Radio de curvatura (12 veces el diámetro exterior del conductor) [mm]" },
];

const FORMULAS_NOTA = `El ducto puede llevar varios tipos de conductor (por ejemplo, una terna de un calibre y otra de otro): el área ocupada es la suma de las áreas de todos los conductores y el límite depende del número TOTAL de conductores.

El radio de curvatura de cada tipo de conductor es 12 veces su diámetro exterior (12D).

El riesgo de atascamiento durante el halado se evalúa solo cuando en total hay exactamente 3 conductores del mismo diámetro; con diámetros distintos no se calcula.

Con «Catálogo» el diámetro es el exterior total del cable XLPE de media tensión (incluye aislamiento y chaqueta). Como en la aplicación original, el área del círculo usa π ≈ 3.1416.`;

// Texto plano de respaldo si KaTeX no se puede cargar.
const FORMULAS_TEXTO = `Ac,i = (π/4)·di²     — área de un conductor del tipo i
Ac = Σ ni·Ac,i       — área total de conductores
At = (π/4)·Di²       — área interna del ducto

%Ocup = (Ac / At)·100
%Disp = 100 − %Ocup

Límites de ocupación (NTC-2050, Cap. 9, Tabla 1):
  1 conductor  → 53%
  2 conductores → 31%
  3 o más conductores → 40%

Radio de curvatura: Rc = 12·di  [mm]

Jamming ratio: J = Di / d. Riesgo con exactamente 3 conductores si 2.8 < J < 3.2.

${FORMULAS_NOTA}`;

// Lineas del reporte que son etiquetas: van en negrita (el texto que se copia es el mismo).
const ETIQUETAS_REPORTE = ["CÁLCULO DE OCUPACIÓN DE DUCTOS", "PARÁMETROS DE ENTRADA:", "RESULTADOS:"];

function dedupeOrdered(rows, key) {
  const seen = new Set();
  const out = [];
  for (const r of rows) {
    const v = r[key];
    if (v === null || v === undefined || v === "" || seen.has(v)) continue;
    seen.add(v);
    out.push(v);
  }
  return out;
}

const opciones = (valores, etiqueta = (v) => v) => valores.map((v) => `<option value="${escapeHtml(v)}">${escapeHtml(etiqueta(v))}</option>`).join("");

export async function render(container) {
  const tuberias = await loadData("tuberias");
  const xlpe = await loadData("conductores-xlpe");
  const tipos = distinct(tuberias, "tipo");
  const tensiones = distinct(xlpe, "nivel_tension_kv").sort((a, b) => parseFloat(a) - parseFloat(b));

  container.innerHTML = `
    <div class="breadcrumb"><a href="#/">Inicio</a> <span>/</span> <a href="#/calculos">Cálculos</a> <span>/</span> <span>Ocupación de ductos</span></div>
    <h1 class="page-title">Ocupación de ductos</h1>

    <form id="form-calc" novalidate>
      <div class="card tarjeta-borde form-section">
        <div class="form-section-title">${icon("cylinder")} Tubería</div>
        <div class="grid-2">
          <div class="field">
            <label for="f-tipo">Tipo de tubería</label>
            <select id="f-tipo" required>
              <option value="">Seleccione…</option>
              ${opciones(tipos)}
            </select>
          </div>
          <div class="field">
            <label for="f-nominal">Diámetro nominal</label>
            <select id="f-nominal" required disabled>
              <option value="">Seleccione un tipo primero</option>
            </select>
          </div>
        </div>
        <div class="grid-2 ultima">
          <div class="field">
            <label for="f-interno" data-info="Diámetro interno mínimo de la tubería.">Diámetro interno de la tubería (mm)</label>
            <div class="input-with-toggle">
              <input type="number" id="f-interno" min="0" max="10000" step="any" required disabled>
              <label class="checkbox-row"><input type="checkbox" id="chk-manual"> Manual</label>
            </div>
          </div>
        </div>
      </div>

      <div id="grupos-container"></div>

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
  const selNominal = container.querySelector("#f-nominal");
  const fInterno = container.querySelector("#f-interno");
  const chkManual = container.querySelector("#chk-manual");

  // ---------- tuberia ----------
  let filaTubo = null;

  // El diametro interno sale del catalogo (minimo de la tuberia) salvo que se marque «Manual».
  function syncTubo() {
    if (!chkManual.checked) fInterno.value = filaTubo ? filaTubo.diametro_interno_min_mm : "";
  }

  selTipo.addEventListener("change", () => {
    const nominales = selTipo.value ? dedupeOrdered(tuberias.filter((t) => t.tipo === selTipo.value), "diametro_nominal") : [];
    selNominal.innerHTML = nominales.length ? `<option value="">Seleccione…</option>` + opciones(nominales) : `<option value="">Seleccione un tipo primero</option>`;
    selNominal.disabled = !nominales.length;
    filaTubo = null;
    syncTubo();
  });
  selNominal.addEventListener("change", () => {
    filaTubo = tuberias.find((t) => t.tipo === selTipo.value && t.diametro_nominal === selNominal.value) || null;
    syncTubo();
  });
  chkManual.addEventListener("change", () => {
    fInterno.disabled = !chkManual.checked;
    // con ingreso manual no hace falta elegir tipo ni diametro nominal
    selTipo.required = !chkManual.checked;
    selNominal.required = !chkManual.checked;
    if (!chkManual.checked) syncTubo();
  });

  // ---------- conductores ----------
  /** Tarjeta de un tipo de conductor: cada tarjeta guarda su propio estado en el DOM, asi agregar o quitar otra no lo pierde. */
  function crearGrupo(id) {
    const cont = document.createElement("div");
    cont.innerHTML = `
      <div class="card tarjeta-borde form-section grupo-block">
        <div class="form-section-title">
          ${icon("plugConnected")} <span class="grupo-titulo">Conductores tipo 1</span>
          <button type="button" class="btn btn-ghost btn-tramo-quitar" hidden>${icon("close")} Quitar</button>
        </div>
        <div class="grid-2">
          <div class="field">
            <label for="f-n-${id}" data-info="Cuántos conductores de este tipo van dentro del ducto.">Número de conductores</label>
            <select id="f-n-${id}" required>
              ${[1, 2, 3, 4, 5, 6, 7, 8, 9].map((n) => `<option value="${n}" ${n === 3 ? "selected" : ""}>${n}</option>`).join("")}
            </select>
          </div>
          <div class="field">
            <label for="f-diametro-${id}" data-info="Con «Catálogo» se toma el diámetro exterior total del cable XLPE de media tensión (incluye aislamiento y chaqueta).">Diámetro del conductor (mm)</label>
            <div class="input-with-toggle">
              <input type="number" id="f-diametro-${id}" min="0" step="any" value="30" required>
              <label class="checkbox-row"><input type="checkbox" id="chk-catalogo-${id}"> Catálogo</label>
            </div>
          </div>
        </div>
        <div class="catalogo-campos" hidden>
          <div class="grid-2">
            <div class="field">
              <label for="f-tension-${id}">Nivel de tensión</label>
              <select id="f-tension-${id}">${opciones(tensiones)}</select>
            </div>
            <div class="field">
              <label for="f-aislamiento-${id}" data-info="Solo aplica a las series de 15 kV y 35 kV.">Nivel de aislamiento</label>
              <select id="f-aislamiento-${id}"></select>
            </div>
          </div>
          <div class="grid-2">
            <div class="field">
              <label for="f-material-${id}">Material del conductor</label>
              <select id="f-material-${id}"></select>
            </div>
            <div class="field">
              <label for="f-pantalla-${id}">Pantalla</label>
              <select id="f-pantalla-${id}"></select>
            </div>
          </div>
          <div class="grid-2 ultima">
            <div class="field">
              <label for="f-calibre-${id}">Calibre</label>
              <select id="f-calibre-${id}"></select>
            </div>
          </div>
        </div>
      </div>`;
    const card = cont.firstElementChild;
    activarInfos(card);
    activarPlegables(card);
    const q = (s) => card.querySelector(s);
    const fN = q(`#f-n-${id}`);
    const fDiametro = q(`#f-diametro-${id}`);
    const chkCatalogo = q(`#chk-catalogo-${id}`);
    const campos = q(".catalogo-campos");
    const selTension = q(`#f-tension-${id}`);
    const selAislamiento = q(`#f-aislamiento-${id}`);
    const selMaterial = q(`#f-material-${id}`);
    const selPantalla = q(`#f-pantalla-${id}`);
    const selCalibre = q(`#f-calibre-${id}`);

    let fila = null;

    /** Repuebla un selector con `valores` conservando la seleccion anterior si sigue disponible; sin opciones queda deshabilitado. */
    function poblar(sel, valores, { vacio = "No aplica", etiqueta, pedirUno = false } = {}) {
      const previo = sel.value;
      if (!valores.length) {
        sel.innerHTML = `<option value="">${vacio}</option>`;
        sel.disabled = true;
        sel.required = false;
        return;
      }
      sel.innerHTML = (pedirUno ? `<option value="">Seleccione…</option>` : "") + opciones(valores, etiqueta);
      sel.value = valores.map(String).includes(previo) ? previo : pedirUno ? "" : String(valores[0]);
      // con una sola opcion no hay nada que elegir: queda a la vista, sin poder cambiarla
      sel.disabled = !pedirUno && valores.length === 1;
      sel.required = chkCatalogo.checked;
    }

    const filtrar = (hasta) => {
      const f = { nivel_tension_kv: selTension.value, porcentaje_aislamiento_pct: selAislamiento.value === "" ? null : Number(selAislamiento.value), material_conductor: selMaterial.value, pantalla: selPantalla.value };
      const orden = ["nivel_tension_kv", "porcentaje_aislamiento_pct", "material_conductor", "pantalla"];
      return xlpe.filter((c) => orden.slice(0, hasta).every((k) => c[k] === f[k]));
    };

    // Cadena de listas: cada una se calcula con las anteriores (tension → aislamiento → material → pantalla → calibre).
    function cascada() {
      poblar(selAislamiento, dedupeOrdered(filtrar(1), "porcentaje_aislamiento_pct"), { etiqueta: (v) => `${v} %` });
      poblar(selMaterial, dedupeOrdered(filtrar(2), "material_conductor"));
      poblar(selPantalla, dedupeOrdered(filtrar(3), "pantalla"));
      poblar(selCalibre, dedupeOrdered(filtrar(4), "calibre_awg_kcmil"), { pedirUno: true, vacio: "Sin calibres disponibles" });
      syncCatalogo();
    }

    // Con «Catálogo», el diametro es el exterior total del cable del calibre elegido.
    function syncCatalogo() {
      fila = chkCatalogo.checked && selCalibre.value ? filtrar(4).find((c) => c.calibre_awg_kcmil === selCalibre.value) || null : null;
      if (chkCatalogo.checked) fDiametro.value = fila ? fila.diametro_total_conductor_mm : "";
    }

    chkCatalogo.addEventListener("change", () => {
      const cat = chkCatalogo.checked;
      campos.hidden = !cat;
      fDiametro.disabled = cat;
      if (cat) cascada();
      else for (const s of [selAislamiento, selMaterial, selPantalla, selCalibre]) s.required = false;
      syncCatalogo();
    });
    selTension.addEventListener("change", cascada);
    selAislamiento.addEventListener("change", cascada);
    selMaterial.addEventListener("change", cascada);
    selPantalla.addEventListener("change", cascada);
    selCalibre.addEventListener("change", syncCatalogo);

    return {
      card,
      titulo: q(".grupo-titulo"),
      quitar: q(".btn-tramo-quitar"),
      /** Lo que el usuario dejo elegido en esta tarjeta. */
      estado: () => ({
        cantidad: parseInt(fN.value, 10),
        diametroMm: parseFloat(fDiametro.value),
        catalogo: chkCatalogo.checked ? { tension: selTension.value, aislamiento: selAislamiento.value, material: selMaterial.value, pantalla: selPantalla.value, calibre: selCalibre.value } : null,
      }),
    };
  }

  const gruposCont = container.querySelector("#grupos-container");
  const grupos = [];
  let siguienteId = 0;

  // «Agregar» va en la fila de «Calcular», justificado a la derecha (fuera de las tarjetas, siempre a la vista aunque se plieguen)
  const botonAgregar = document.createElement("button");
  botonAgregar.type = "button";
  botonAgregar.className = "btn btn-agregar-tramo";
  botonAgregar.innerHTML = `${icon("plus")} Agregar tipo de conductor`;
  botonAgregar.addEventListener("click", () => agregarGrupo());
  const filaCalcular = container.querySelector("#form-calc .btn-row");
  filaCalcular.classList.add("btn-row--agregar"); // si no caben en una linea: «Agregar» arriba y «Calcular» abajo, ambos a la izquierda
  filaCalcular.append(botonAgregar);

  /** Numera las tarjetas, muestra "Quitar" solo si hay mas de un tipo. */
  function actualizarGrupos() {
    grupos.forEach((g, i) => {
      g.titulo.textContent = `Conductores tipo ${i + 1}`;
      g.quitar.hidden = grupos.length < 2;
    });
  }

  function agregarGrupo() {
    const g = crearGrupo(siguienteId++);
    g.quitar.addEventListener("click", () => {
      grupos.splice(grupos.indexOf(g), 1);
      g.card.remove();
      actualizarGrupos();
    });
    grupos.push(g);
    gruposCont.append(g.card);
    actualizarGrupos();
  }
  agregarGrupo();

  // ---------- calculo ----------
  form.addEventListener("submit", (e) => {
    e.preventDefault();
    if (!form.reportValidity()) return;

    let diametroTuboMm;
    let tubo;
    if (chkManual.checked) {
      diametroTuboMm = parseFloat(fInterno.value);
      tubo = { manual: true };
    } else {
      if (!filaTubo) {
        renderError("No existe una tubería para esa combinación de tipo y diámetro nominal.");
        return;
      }
      diametroTuboMm = filaTubo.diametro_interno_min_mm;
      tubo = { manual: false, tipo: selTipo.value, nominal: selNominal.value };
    }

    const estados = grupos.map((g) => g.estado());
    const data = calcularOcupacionGrupos(diametroTuboMm, estados.map((s) => ({ cantidad: s.cantidad, diametroMm: s.diametroMm })));
    renderResultado(data, { diametroTuboMm, tubo, estados });
  });

  function renderError(msg) {
    const wrap = container.querySelector("#resultado-wrap");
    wrap.innerHTML = `<div class="callout callout-danger">${msg}</div>`;
    wrap.scrollIntoView({ behavior: "smooth", block: "nearest" });
  }

  const origenTexto = (e) => (e.catalogo ? `Catálogo XLPE: ${e.catalogo.tension}${e.catalogo.aislamiento ? ` (${e.catalogo.aislamiento} %)` : ""}, ${e.catalogo.material}, ${e.catalogo.pantalla}, calibre ${e.catalogo.calibre}` : "Ingresado manualmente");

  function tablaGruposHtml(data, ctx) {
    const filas = data.grupos
      .map((g, i) => `<tr><td>Tipo ${g.numero}</td><td class="wrap">${escapeHtml(origenTexto(ctx.estados[i]))}</td><td class="num">${g.cantidad}</td><td class="num">${fmt(g.diametroMm)}</td><td class="num">${fmt(g.areaTotal)}</td><td class="num">${fmtPercent(g.ocupacionPct)}</td><td class="num">${fmt(g.radioCurvaturaMm)}</td></tr>`)
      .join("");
    return `
      <div class="result-subhead">Conductores por tipo</div>
      <div class="table-wrap tabla-resultado"><table>
        <thead><tr><th>Tipo</th><th>Conductor</th><th class="num">Cantidad</th><th class="num">Diámetro (mm)</th><th class="num">Área total (mm²)</th><th class="num">% del ducto</th><th class="num">Radio de curvatura (12D) (mm)</th></tr></thead>
        <tbody>${filas}<tr class="total-row"><td colspan="2">Total</td><td class="num">${data.totalConductores}</td><td class="num"></td><td class="num">${fmt(data.areaCables)}</td><td class="num">${fmtPercent(data.ocupacionPct)}</td><td class="num"></td></tr></tbody>
      </table></div>`;
  }

  function reporteTexto(data, ctx) {
    // El reporte se copia y se pega: tres etiquetas (el calculo, los parametros de entrada y los resultados).
    const tubo = ctx.tubo.manual
      ? [`Tubería: ingresada manualmente`, `Diámetro interno de la tubería: ${fmt(ctx.diametroTuboMm)} mm`]
      : [`Tipo de tubería: ${ctx.tubo.tipo}`, `Diámetro nominal: ${ctx.tubo.nominal}`, `Diámetro interno de la tubería: ${fmt(ctx.diametroTuboMm)} mm`];
    const parametrosGrupos = ctx.estados.map((e, i) => [``, `Conductores tipo ${i + 1}:`, `  Número de conductores: ${e.cantidad}`, `  Diámetro del conductor: ${fmt(e.diametroMm)} mm`, `  Origen del diámetro: ${origenTexto(e)}`].join("\n"));
    const resultadosGrupos = data.grupos.map((g) => [``, `Tipo ${g.numero}:`, `  Área de un conductor: ${fmt(g.areaCable)} mm²`, `  Área total del tipo: ${fmt(g.areaTotal)} mm²`, `  Radio de curvatura (12D): ${fmt(g.radioCurvaturaMm)} mm`].join("\n"));
    return [
      `CÁLCULO DE OCUPACIÓN DE DUCTOS`,
      ``,
      `PARÁMETROS DE ENTRADA:`,
      LINEA_REPORTE,
      ...tubo,
      ...parametrosGrupos,
      ``,
      `RESULTADOS:`,
      LINEA_REPORTE,
      `Número total de conductores: ${data.totalConductores}`,
      ...resultadosGrupos,
      ``,
      `Área total de conductores: ${fmt(data.areaCables)} mm²`,
      `Área interna del ducto: ${fmt(data.areaTubo)} mm²`,
      ``,
      `Porcentaje de ocupación: ${fmtPercent(data.ocupacionPct)}`,
      `Porcentaje disponible: ${fmtPercent(data.disponiblePct)}`,
      `Límite aplicable (NTC-2050): ${fmtPercent(data.limitePct)}`,
      `Cumple: ${data.cumple ? "Sí" : "No"}`,
      ...(data.jammingRatio !== null ? [`Jamming ratio: ${fmt(data.jammingRatio, 2)}`] : []),
    ].join("\n");
  }

  function renderResultado(data, ctx) {
    const wrap = container.querySelector("#resultado-wrap");

    const jammingHtml = data.riesgoAtascamiento
      ? `<div class="callout callout-warning" style="margin-top: var(--space-4);">
            Riesgo de atascamiento ("jamming ratio" = ${fmt(data.jammingRatio, 2)}, entre 2.8 y 3.2) con exactamente
            3 conductores: pueden trabarse entre sí durante el halado del cable. Se recomienda subir al siguiente
            diámetro comercial de tubería.
          </div>`
      : "";

    const resultado = `
          <div class="result-panel">
            <div class="oc-resumen">
              <div class="oc-grafico oc-corte">${corteDuctoSvg({ diametroTuboMm: ctx.diametroTuboMm, tipos: ctx.estados.map((e) => ({ cantidad: e.cantidad, diametroMm: e.diametroMm })) })}</div>
              <div class="oc-grafico oc-dona">${donaOcupacionSvg({ pct: data.ocupacionPct, limite: data.limitePct, cumple: data.cumple, total: data.totalConductores })}</div>
              <div class="oc-metricas">
                <div class="result-metric">
                  <div class="value">${fmtPercent(data.ocupacionPct)} <span class="badge ${data.cumple ? "badge-success" : "badge-danger"}">${data.cumple ? "Cumple" : "No cumple"}</span></div>
                  <div class="label">Porcentaje de ocupación (límite ${fmtPercent(data.limitePct)})</div>
                </div>
                <div class="result-metric">
                  <div class="value">${fmtPercent(data.disponiblePct)}</div>
                  <div class="label">Porcentaje disponible</div>
                </div>
                ${
                  data.grupos.length === 1
                    ? `<div class="result-metric">
                  <div class="value">${fmt(data.grupos[0].radioCurvaturaMm)}<span class="unit">mm</span></div>
                  <div class="label">Radio de curvatura (12D)</div>
                </div>`
                    : ""
                }
              </div>
            </div>
            ${data.grupos.length > 1 ? tablaGruposHtml(data, ctx) : ""}
            ${jammingHtml}
          </div>`;

    wrap.innerHTML = tarjetaResultadosHtml({
      resultado,
      reporte: reporteHtml(reporteTexto(data, ctx), ETIQUETAS_REPORTE),
      formulasPlano: FORMULAS_TEXTO,
    });
    activarPestanas(wrap, { grupos: FORMULAS_TEX, etiquetas: FORMULAS_ETIQUETAS, nota: FORMULAS_NOTA });

    wrap.scrollIntoView({ behavior: "smooth", block: "nearest" });
  }
}
