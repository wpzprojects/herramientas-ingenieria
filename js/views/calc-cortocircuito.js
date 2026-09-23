// Calculadora de capacidad de corriente de cortocircuito admisible (limite termico del conductor).
// La pantalla se divide en tarjetas: "Conductor" (red, material, calibre y area) y "Condiciones de la falla" (temperaturas y
// tiempo de despeje y, opcional, la corriente de falla a soportar: con ella se indica si el calibre cumple y se sugiere el mas
// pequeño que la soporta, ../calc/cortocircuito-calibre.js). Misma estructura que Perdidas, Regulacion y Ocupacion de ductos. El motor (../calc/cortocircuito.js) no
// se toca.

import { fmt, loadData, distinct, escapeHtml } from "../util/format.js";
import { icon } from "../icons.js";
import { calcularCortocircuito } from "../calc/cortocircuito.js";
import { compararCalibres } from "../calc/cortocircuito-calibre.js";
import { LINEA_REPORTE, reporteHtml, tarjetaResultadosHtml, activarPestanas } from "../util/resultados-ui.js";
import { activarInfos } from "../util/info-campo.js";
import { activarPlegables } from "../util/tarjetas-plegables.js";
import { guardarEstado, leerEstado } from "../util/persistencia-calculo.js";

const RUTA = "/calculos/cortocircuito";

// Ecuaciones (LaTeX) de la pestaña Fórmulas: las del motor, con las mismas unidades (mm², °C, s y kA).
const FORMULAS_TEX = [
  {
    titulo: "Capacidad de cortocircuito",
    ecuaciones: [String.raw`I_{CC} = \dfrac{A \cdot k_1}{1000}\,\sqrt{\dfrac{\log_{10}\!\left(\dfrac{T_2 + \lambda}{T_1 + \lambda}\right)}{t}} \quad [\mathrm{kA}]`],
  },
  {
    titulo: "Área mínima para una corriente a soportar",
    ecuaciones: [String.raw`A_{min} = \dfrac{I_{req} \cdot 1000}{k_1\,\sqrt{\dfrac{\log_{10}\!\left(\dfrac{T_2 + \lambda}{T_1 + \lambda}\right)}{t}}} \quad [\mathrm{mm^2}]`],
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
  { tex: String.raw`I_{req}`, texto: "Corriente de falla a soportar [kA]" },
  { tex: String.raw`A_{min}`, texto: "Área mínima del conductor para soportar esa corriente [mm²]" },
  { tex: "T_1", texto: "Temperatura de operación [°C]" },
  { tex: "T_2", texto: "Temperatura máxima admisible en falla [°C]" },
  { tex: "t", texto: "Tiempo de despeje de la falla [s]" },
  { tex: String.raw`\lambda`, texto: "Constante del material (temperatura de resistencia cero) [°C]" },
  { tex: "k_1", texto: "Constante del material" },
];

const FORMULAS_NOTA = `El logaritmo es en base 10.

En red aérea todos los tipos del catálogo (ACSR, AAAC, ACAR, AAC, ACSS) se calculan con las constantes del aluminio y con el área de aluminio del conductor.

Si se indica la corriente de falla a soportar, el calibre sugerido es el de menor área, del mismo tipo y material elegidos, cuya capacidad de cortocircuito iguala o supera esa corriente (equivale a tener un área mayor o igual a A_min).

Valores por defecto: temperatura de operación de 75 °C en red aérea y 90 °C en subterránea, y temperatura máxima en falla de 250 °C. Con «Manual» se pueden modificar.`;

// Texto plano de respaldo si KaTeX no se puede cargar.
const FORMULAS_TEXTO = `I_CC = A · k1 · √( log10((T2+λ)/(T1+λ)) / t ) / 1000     [kA]

  A  = área del conductor (mm²)
  T1 = temperatura de operación (°C)
  T2 = temperatura máxima admisible en falla (°C)
  t  = tiempo de despeje de la falla (s)
  λ  = 234 (Cobre) / 228 (Aluminio)
  k1 = 341 (Cobre) / 224 (Aluminio)

Área mínima para una corriente a soportar I_req (kA):
  A_min = I_req · 1000 / ( k1 · √( log10((T2+λ)/(T1+λ)) / t ) )     [mm²]

${FORMULAS_NOTA}`;

// Lineas del reporte que son etiquetas: van en negrita (el texto que se copia es el mismo).
const ETIQUETAS_REPORTE = ["CÁLCULO DE CORTOCIRCUITO", "PARÁMETROS DE ENTRADA:", "RESULTADOS:"];

const INFO_REFERENCIA =
  "Un mismo calibre puede tener varias construcciones (número de hilos, diámetro) con área ligeramente distinta. Solo aplica a conductores aéreos: en subterráneo (XLPE) no hay varias referencias por calibre.";

export async function render(container) {
  const desnudos = await loadData("conductores-desnudos");
  const xlpe = await loadData("conductores-xlpe");

  container.innerHTML = `
    <div class="breadcrumb"><a href="#/">Inicio</a> <span>/</span> <a href="#/calculos">Cálculos</a> <span>/</span> <span>Cortocircuito</span></div>
    <h1 class="page-title">Capacidad de corriente de cortocircuito</h1>

    <form id="form-calc" novalidate>
      <div class="card tarjeta-borde form-section">
        <div class="form-section-title">${icon("conductorCableado")} Conductor</div>
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
        <div class="grid-3 ultima">
          <div class="field">
            <label for="f-calibre">Calibre</label>
            <select id="f-calibre" required disabled>
              <option value="">Seleccione un material primero</option>
            </select>
          </div>
          <div class="field">
            <label for="f-referencia" data-info="${INFO_REFERENCIA}">Referencia</label>
            <select id="f-referencia" required disabled>
              <option value="">Seleccione un calibre primero</option>
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
          <div class="field">
            <label for="f-objetivo" data-info="Opcional. Con este dato se indica si el calibre cumple y se sugiere el más pequeño que la soporta.">Corriente de falla a soportar (kA)</label>
            <input type="number" id="f-objetivo" min="0" step="any" placeholder="Opcional">
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
  const selRed = container.querySelector("#f-red");
  const selMaterial = container.querySelector("#f-material");
  const selCalibre = container.querySelector("#f-calibre");
  const selReferencia = container.querySelector("#f-referencia");
  const fArea = container.querySelector("#f-area");
  const fTop = container.querySelector("#f-top");
  const fTfalla = container.querySelector("#f-tfalla");
  const fTiempo = container.querySelector("#f-tiempo");
  const fObjetivo = container.querySelector("#f-objetivo");
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
    poblarReferencia();
  }

  // La referencia (construccion exacta del conductor) solo existe en el catalogo de conductores desnudos (aereos).
  function poblarReferencia() {
    if (selRed.value !== "Aereo") {
      selReferencia.innerHTML = `<option value="">No aplica (solo conductores aéreos)</option>`;
      selReferencia.disabled = true;
      filaSeleccionada = resolverFila();
      syncDefaults();
      return;
    }
    const material = selMaterial.value;
    const calibre = selCalibre.value;
    const refs = calibre ? desnudos.filter((c) => c.tipo === material && c.calibre_awg_kcmil === calibre) : [];
    selReferencia.innerHTML = refs.length
      ? `<option value="">Seleccione…</option>` +
        refs.map((c) => `<option value="${escapeHtml(c.nombre_clave)}">${escapeHtml(c.nombre_clave)}</option>`).join("")
      : `<option value="">Seleccione un calibre primero</option>`;
    selReferencia.disabled = !refs.length;
    filaSeleccionada = null;
    syncDefaults();
  }

  function resolverFila() {
    const red = selRed.value;
    const material = selMaterial.value;
    const calibre = selCalibre.value;
    if (!calibre) return null;
    if (red === "Aereo") {
      if (!selReferencia.value) return null;
      return desnudos.find((c) => c.tipo === material && c.calibre_awg_kcmil === calibre && c.nombre_clave === selReferencia.value) || null;
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
  selCalibre.addEventListener("change", poblarReferencia);
  selReferencia.addEventListener("change", () => {
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

  // ---------- restaurar lo que habia si se volvio de otra seccion (no sobrevive a un recargue) ----------
  const guardado = leerEstado(RUTA);
  if (guardado) {
    selRed.value = guardado.red;
    selRed.dispatchEvent(new Event("change"));
    selMaterial.value = guardado.material;
    selMaterial.dispatchEvent(new Event("change"));
    selCalibre.value = guardado.calibre;
    selCalibre.dispatchEvent(new Event("change"));
    selReferencia.value = guardado.referencia ?? "";
    selReferencia.dispatchEvent(new Event("change"));
    if (guardado.manualArea) {
      chkArea.checked = true;
      chkArea.dispatchEvent(new Event("change"));
      fArea.value = guardado.area;
    }
    if (guardado.manualTop) {
      chkTop.checked = true;
      chkTop.dispatchEvent(new Event("change"));
      fTop.value = guardado.top;
    }
    if (guardado.manualTfalla) {
      chkTfalla.checked = true;
      chkTfalla.dispatchEvent(new Event("change"));
      fTfalla.value = guardado.tfalla;
    }
    fTiempo.value = guardado.tiempo;
    fObjetivo.value = guardado.objetivo;
  }

  // El router llama a esto justo antes de salir de la pantalla (ver js/router.js), para que lo
  // escrito no se pierda al volver de otra sección; una recarga de la app si lo reinicia.
  function antesDeSalir() {
    guardarEstado(RUTA, {
      red: selRed.value,
      material: selMaterial.value,
      calibre: selCalibre.value,
      referencia: selReferencia.value,
      manualArea: chkArea.checked,
      area: fArea.value,
      manualTop: chkTop.checked,
      top: fTop.value,
      manualTfalla: chkTfalla.checked,
      tfalla: fTfalla.value,
      tiempo: fTiempo.value,
      objetivo: fObjetivo.value,
    });
  }

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
    const objetivoKa = fObjetivo.value.trim() === "" ? null : parseFloat(fObjetivo.value);
    const ctx = { red, tipoMaterial: selMaterial.value, calibre: selCalibre.value, referencia: red === "Aereo" ? selReferencia.value : "", materialElectrico: material, objetivoKa };
    ctx.comparacion = objetivoKa === null ? null : compararCalibres(candidatosCalibre(red), { material, tempOperacionC: p.tempOperacionC, tempFallaC: p.tempFallaC, tiempoS: p.tiempoS }, objetivoKa, ctx.calibre);
    renderResultado(data, p, ctx);
  });

  /** Calibres del mismo tipo y material que el elegido, con su area (un calibre = su primera referencia). */
  function candidatosCalibre(red) {
    const aereo = red === "Aereo";
    const campoMaterial = aereo ? "tipo" : "material_conductor";
    const campoArea = aereo ? "area_seccion_aluminio_mm2" : "area_conductor_mm2";
    const vistos = new Set();
    return (aereo ? desnudos : xlpe)
      .filter((f) => {
        if (f[campoMaterial] !== selMaterial.value || !f.calibre_awg_kcmil || f[campoArea] == null || vistos.has(f.calibre_awg_kcmil)) return false;
        vistos.add(f.calibre_awg_kcmil);
        return true;
      })
      .map((f) => ({ calibre: f.calibre_awg_kcmil, area: f[campoArea] }));
  }

  function reporteTexto(data, p, ctx) {
    // El reporte se copia y se pega: tres etiquetas (el calculo, los parametros de entrada y los resultados).
    // Parametros = lo que el usuario dio; resultados = todo lo que sale del calculo (incluidas las constantes del material).
    return [
      `CÁLCULO DE CORTOCIRCUITO`,
      ``,
      ``,
      `PARÁMETROS DE ENTRADA:`,
      LINEA_REPORTE,
      `Tipo de red: ${ctx.red === "Aereo" ? "Aéreo" : "Subterráneo"}`,
      `Tipo/Material de conductor: ${ctx.tipoMaterial}`,
      `Calibre: ${ctx.calibre}`,
      ...(ctx.referencia ? [`Referencia: ${ctx.referencia}`] : []),
      `Área del conductor: ${fmt(p.areaMm2)} mm²`,
      `Temperatura de operación: ${fmt(p.tempOperacionC)} °C`,
      `Temperatura máxima admisible en falla: ${fmt(p.tempFallaC)} °C`,
      `Tiempo de despeje de la falla: ${fmt(p.tiempoS, 1)} s`,
      ...(ctx.objetivoKa === null ? [] : [`Corriente de falla a soportar: ${fmt(ctx.objetivoKa)} kA`]),
      ``,
      ``,
      `RESULTADOS:`,
      LINEA_REPORTE,
      `Material eléctrico usado en el cálculo: ${ctx.materialElectrico}`,
      `λ (constante material): ${fmt(data.intermedios.tempRes0, 0)}`,
      `k1 (constante material): ${fmt(data.intermedios.k1, 0)}`,
      `log10((T2+λ)/(T1+λ)): ${fmt(data.intermedios.logaritmo, 5)}`,
      ``,
      `Capacidad de cortocircuito: ${fmt(data.capacidadCcKa)} kA`,
      ...(ctx.comparacion === null ? [] : reporteObjetivo(data, ctx)),
    ].join("\n");
  }

  /** Lineas del reporte cuando se indico la corriente a soportar. */
  function reporteObjetivo(data, ctx) {
    const c = ctx.comparacion;
    const ok = Number.isFinite(c.areaMinimaMm2);
    return [
      ``,
      `Cumple la corriente a soportar: ${data.capacidadCcKa >= ctx.objetivoKa ? "Sí" : "No"}`,
      `Área mínima requerida: ${ok ? `${fmt(c.areaMinimaMm2)} mm²` : "no se puede calcular con estas temperaturas y tiempo"}`,
      ...(ok ? [c.sugerido ? `Calibre sugerido: ${c.sugerido.calibre} (${fmt(c.sugerido.area)} mm²)` : `Calibre sugerido: ninguno del catálogo alcanza (el de mayor capacidad es ${c.mayor.calibre}, ${fmt(c.mayor.capacidadCcKa)} kA)`] : []),
    ];
  }

  function comparacionHtml(ctx) {
    const c = ctx.comparacion;
    if (!Number.isFinite(c.areaMinimaMm2) || c.areaMinimaMm2 <= 0) {
      return `<div class="callout callout-warning" style="margin-top: var(--space-4);">No se pudo calcular el área requerida con las temperaturas y el tiempo de falla indicados.</div>`;
    }
    if (!c.ventana.length) return "";
    const mensaje = c.sugerido
      ? `Calibre más pequeño que soporta ${fmt(ctx.objetivoKa)} kA: <strong>${escapeHtml(c.sugerido.calibre)}</strong> (${fmt(c.sugerido.area)} mm²).`
      : `Ningún calibre del catálogo soporta ${fmt(ctx.objetivoKa)} kA con estas condiciones; el de mayor capacidad es <strong>${escapeHtml(c.mayor.calibre)}</strong> (${fmt(c.mayor.capacidadCcKa)} kA).`;
    const filas = c.ventana
      .map((f) => {
        const clases = [f.calibre === c.sugerido?.calibre ? "match-row" : "", f.calibre === ctx.calibre ? "current-row" : ""].filter(Boolean).join(" ");
        const actual = f.calibre === ctx.calibre ? ' <span class="badge">Actual</span>' : "";
        return `<tr class="${clases}"><td>${escapeHtml(f.calibre)}${actual}</td><td class="num">${fmt(f.area)}</td><td class="num">${fmt(f.capacidadCcKa)}</td></tr>`;
      })
      .join("");
    return `
            <div class="result-subhead">Comparación con otros calibres</div>
            <p class="text-muted text-sm" style="margin: 0 0 var(--space-3);">${mensaje}</p>
            <div class="table-wrap tabla-resultado"><table>
              <thead><tr><th>Calibre</th><th class="num">Área (mm²)</th><th class="num">Capacidad (kA)</th></tr></thead>
              <tbody>${filas}</tbody>
            </table></div>`;
  }

  function renderResultado(data, p, ctx) {
    const wrap = container.querySelector("#resultado-wrap");

    const conObjetivo = ctx.comparacion !== null;
    const cumple = conObjetivo && data.capacidadCcKa >= ctx.objetivoKa;
    const areaOk = conObjetivo && Number.isFinite(ctx.comparacion.areaMinimaMm2) && ctx.comparacion.areaMinimaMm2 > 0;
    const veredicto = conObjetivo && Number.isFinite(data.capacidadCcKa) ? ` <span class="badge ${cumple ? "badge-success" : "badge-danger"}">${cumple ? "Cumple" : "No cumple"}</span>` : "";
    const resultado = `
          <div class="result-panel">
            <div class="${conObjetivo ? "grid-2" : ""}">
              <div class="result-metric">
                <div class="value">${fmt(data.capacidadCcKa)}<span class="unit">kA</span>${veredicto}</div>
                <div class="label">Capacidad de corriente de cortocircuito${conObjetivo ? ` (a soportar: ${fmt(ctx.objetivoKa)} kA)` : ""}</div>
              </div>
              ${
                areaOk
                  ? `<div class="result-metric">
                <div class="value">${fmt(ctx.comparacion.areaMinimaMm2)}<span class="unit">mm²</span></div>
                <div class="label">Área mínima requerida</div>
              </div>`
                  : ""
              }
            </div>
            ${conObjetivo ? comparacionHtml(ctx) : ""}
          </div>`;

    wrap.innerHTML = tarjetaResultadosHtml({
      resultado,
      reporte: reporteHtml(reporteTexto(data, p, ctx), ETIQUETAS_REPORTE),
      formulasPlano: FORMULAS_TEXTO,
    });
    activarPestanas(wrap, { grupos: FORMULAS_TEX, etiquetas: FORMULAS_ETIQUETAS, nota: FORMULAS_NOTA });

    wrap.scrollIntoView({ behavior: "smooth", block: "nearest" });
  }

  return antesDeSalir;
}
