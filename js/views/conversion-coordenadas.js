// Conversion de coordenadas geograficas/proyectadas. Un solo formulario:
//  - Por defecto, los 7 sistemas de SISTEMAS (WGS84, MAGNA-SIRGAS Bogota Oeste/Bogota/Este, Origen Unico Nacional, UTM 18N/19N) con el
//    motor original convertirCoordenadas (../calc/coordenadas.js).
//  - Con la casilla «Habilitar todos los sistemas de coordenadas», las dos listas se reemplazan por dos campos de codigo
//    EPSG (unos 500 sistemas: los de Colombia y los mas usados del mundo) que usan proj4js (../calc/coordenadas-epsg.js).
//  - El boton «Convertir por lotes» cambia longitud/latitud por un cuadro donde cada linea es una pareja de coordenadas.
// En los dos casos se avisa cuando el punto queda fuera del area de uso de algun sistema (areas de data/sistemas-epsg.json, que ya
// incluye los 7 sistemas).

import { fmt, loadData, escapeHtml } from "../util/format.js";
import { SISTEMAS, convertirCoordenadas } from "../calc/coordenadas.js";
import { cargarProj4 } from "../util/proj4.js";
import { parseCodigoEpsg, infoSistema, convertirEntreSistemas, avisosArea, numeroFlexible, parsearPareja, avisoOrdenInvertido } from "../calc/coordenadas-epsg.js";
import { guardarEstado, leerEstado } from "../util/persistencia-calculo.js";

const RUTA = "/varios/conversion-coordenadas";
const WGS84 = SISTEMAS[0];
const MARGEN = 'style="margin-top: var(--space-4);"';

function opcionesSistemas() {
  return SISTEMAS.map((s) => `<option value="${s.epsg}">${s.label}</option>`).join("");
}

export function render(container) {
  container.innerHTML = `
    <div class="breadcrumb"><a href="#/">Inicio</a> <span>/</span> <a href="#/varios">Varios</a> <span>/</span> <span>Conversión de coordenadas</span></div>
    <h1 class="page-title">Conversión de coordenadas</h1>

    <form class="card tarjeta-borde" id="form-coordenadas" novalidate>
      <div class="campos-sistemas">
      <div class="grid-2" id="campos-lista">
        <div class="field">
          <label for="f-sistema-origen">Sistema de entrada</label>
          <select id="f-sistema-origen" required>${opcionesSistemas()}</select>
          <span class="hint hint-linea" aria-hidden="true"></span>
        </div>
        <div class="field">
          <label for="f-sistema-destino">Sistema de salida</label>
          <select id="f-sistema-destino" required>${opcionesSistemas()}</select>
          <span class="hint hint-linea" aria-hidden="true"></span>
        </div>
      </div>

      <div class="grid-2 inactivo" id="campos-epsg">
        <div class="field">
          <label for="f-epsg-origen">EPSG de entrada</label>
          <input type="text" id="f-epsg-origen" inputmode="numeric" autocomplete="off" list="lista-epsg">
          <span class="hint hint-linea" id="nombre-epsg-origen"></span>
        </div>
        <div class="field">
          <label for="f-epsg-destino">EPSG de salida</label>
          <input type="text" id="f-epsg-destino" inputmode="numeric" autocomplete="off" list="lista-epsg">
          <span class="hint hint-linea" id="nombre-epsg-destino"></span>
        </div>
        <datalist id="lista-epsg"></datalist>
      </div>
      </div>

      <div class="grid-2" id="campos-punto">
        <div class="field">
          <label for="f-x" id="label-x">Longitud (grados, negativo = oeste)</label>
          <input type="text" id="f-x" inputmode="decimal" autocomplete="off" required>
        </div>
        <div class="field">
          <label for="f-y" id="label-y">Latitud (grados)</label>
          <input type="text" id="f-y" inputmode="decimal" autocomplete="off" required>
        </div>
      </div>

      <div class="field" id="campo-lote" hidden>
        <label for="f-lote" id="label-lote">Longitud y latitud</label>
        <textarea id="f-lote" rows="8" spellcheck="false" autocomplete="off" placeholder="Ejemplos válidos:&#10;-74.0817 4.6097&#10;-74,0817;4,6097&#10;-74.0817,4.6097&#10;-74,0817 4,6097"></textarea>
        <span class="hint">Ingresar datos por lotes. Cada línea debe ser una pareja de coordenadas separadas.</span>
      </div>

      <div class="btn-row">
        <button type="submit" class="btn btn-primary">Convertir</button>
        <button type="button" class="btn btn-toggle btn-dos-textos" style="margin-left: auto;" id="btn-lotes" data-lotes="false"><span class="activo">Convertir por lotes</span><span>Convertir un punto</span></button>
      </div>
    </form>

    <label class="checkbox-row" style="margin-top: var(--space-3);">
      <input type="checkbox" id="chk-todos"> Habilitar todos los sistemas de coordenadas
    </label>

    <div id="resultado-wrap"></div>
  `;

  const $ = (s) => container.querySelector(s);
  const form = $("#form-coordenadas");
  const selOrigen = $("#f-sistema-origen");
  const selDestino = $("#f-sistema-destino");
  const chkTodos = $("#chk-todos");
  const camposLista = $("#campos-lista");
  const camposEpsg = $("#campos-epsg");
  const fEpsgOrigen = $("#f-epsg-origen");
  const fEpsgDestino = $("#f-epsg-destino");
  const nombreOrigen = $("#nombre-epsg-origen");
  const nombreDestino = $("#nombre-epsg-destino");
  const camposPunto = $("#campos-punto");
  const campoLote = $("#campo-lote");
  const btnLotes = $("#btn-lotes");
  const fX = $("#f-x");
  const fY = $("#f-y");
  const fLote = $("#f-lote");
  const labelX = $("#label-x");
  const labelY = $("#label-y");
  const labelLote = $("#label-lote");
  const wrap = $("#resultado-wrap");

  // Sistema de salida por defecto distinto del de entrada, para que el primer envio muestre algo mas util que "identidad".
  selDestino.selectedIndex = 1;

  // El catalogo (areas de uso, ~70 KB) se pide de una vez; proj4 solo al habilitar todos los sistemas.
  const catalogoPromesa = loadData("sistemas-epsg").catch(() => null);
  let catalogo = null;
  catalogoPromesa.then((c) => {
    catalogo = c;
  });
  let proj4 = null;

  const modoEpsg = () => chkTodos.checked;
  const modoLote = () => btnLotes.dataset.lotes === "true";

  /** Sistema elegido (entrada o salida) en el modo actual: {etiqueta, esGeo, unidad, epsg, bbox} o null si no es valido. */
  function sistema(lado) {
    if (!modoEpsg()) {
      const s = SISTEMAS.find((x) => String(x.epsg) === (lado === "origen" ? selOrigen : selDestino).value);
      return s ? { etiqueta: s.label, esGeo: !!s.esGeo, unidad: s.esGeo ? "grados" : "metros", epsg: String(s.epsg), bbox: infoSistema(String(s.epsg), catalogo)?.bbox ?? null, s } : null;
    }
    const codigo = parseCodigoEpsg((lado === "origen" ? fEpsgOrigen : fEpsgDestino).value);
    const i = codigo ? infoSistema(codigo, catalogo) : null;
    return i ? { etiqueta: `${i.codigo} · ${i.nombre}`, esGeo: i.esGeo, unidad: i.unidad, epsg: i.codigo, bbox: i.bbox, nombre: i.nombre } : null;
  }

  /** Nombre y unidad bajo cada campo de codigo (o el error si el codigo no esta) y etiquetas de las coordenadas segun la entrada. */
  function actualizar() {
    const describir = (campo, hint) => {
      const texto = campo.value.trim();
      hint.classList.remove("hint-error");
      hint.removeAttribute("title");
      if (!texto || !catalogo) {
        hint.textContent = "";
        return;
      }
      const codigo = parseCodigoEpsg(texto);
      const s = codigo ? infoSistema(codigo, catalogo) : null;
      if (!s) {
        hint.textContent = codigo ? `El código ${codigo} no está incluido.` : "Escriba solo el número (por ejemplo 3116).";
        hint.classList.add("hint-error");
      } else {
        hint.textContent = `${s.nombre} · ${s.unidad}`;
        hint.title = hint.textContent; // en pantallas angostas el nombre se recorta: el texto completo queda como sugerencia
      }
    };
    if (modoEpsg()) {
      describir(fEpsgOrigen, nombreOrigen);
      describir(fEpsgDestino, nombreDestino);
    }
    const o = sistema("origen");
    const proyectado = o && !o.esGeo;
    labelX.textContent = proyectado ? `Este / X (${o.unidad})` : "Longitud (grados, negativo = oeste)";
    labelY.textContent = proyectado ? `Norte / Y (${o.unidad})` : "Latitud (grados)";
    labelLote.textContent = proyectado ? `Este y Norte (${o.unidad})` : "Longitud y latitud (grados)";
  }

  /** Muestra u oculta cada bloque segun los dos modos; los campos ocultos dejan de ser obligatorios. */
  function aplicarModos() {
    // Las dos parejas de campos ocupan el mismo lugar (.campos-sistemas): la inactiva solo se oculta, asi el formulario mide siempre lo mismo
    camposLista.classList.toggle("inactivo", modoEpsg());
    camposEpsg.classList.toggle("inactivo", !modoEpsg());
    camposPunto.hidden = modoLote();
    campoLote.hidden = !modoLote();
    fX.required = fY.required = !modoLote();
    fLote.required = modoLote();
    const [textoLotes, textoUno] = btnLotes.children; // los dos textos ocupan el mismo lugar: el boton mide siempre lo mismo
    textoLotes.classList.toggle("activo", !modoLote());
    textoUno.classList.toggle("activo", modoLote());
    actualizar();
  }

  chkTodos.addEventListener("change", async () => {
    if (modoEpsg()) {
      fEpsgOrigen.value = selOrigen.value; // se parte de lo que ya estaba elegido
      fEpsgDestino.value = selDestino.value;
      try {
        [proj4, catalogo] = await Promise.all([cargarProj4(), catalogoPromesa.then((c) => c ?? loadData("sistemas-epsg"))]);
        $("#lista-epsg").innerHTML = Object.entries(catalogo)
          .map(([codigo, e]) => `<option value="${codigo}" label="${escapeHtml(e[0])}"></option>`)
          .join("");
      } catch {
        chkTodos.checked = false;
        wrap.innerHTML = `<div class="callout callout-danger" ${MARGEN}>No se pudo cargar la herramienta de conversión. Cierre y abra la aplicación e intente de nuevo.</div>`;
      }
    } else {
      // al volver a la lista, si los codigos escritos son de los 7 sistemas se conservan
      for (const [campo, sel] of [[fEpsgOrigen, selOrigen], [fEpsgDestino, selDestino]]) {
        const c = parseCodigoEpsg(campo.value);
        if (c && SISTEMAS.some((s) => String(s.epsg) === c)) sel.value = c;
      }
    }
    aplicarModos();
  });
  btnLotes.addEventListener("click", () => {
    btnLotes.dataset.lotes = String(!modoLote());
    aplicarModos();
  });
  selOrigen.addEventListener("change", actualizar);
  fEpsgOrigen.addEventListener("input", actualizar);
  fEpsgDestino.addEventListener("input", actualizar);
  aplicarModos();

  // ---------- restaurar lo que habia si se volvio de otra seccion (no sobrevive a un recargue) ----------
  const guardado = leerEstado(RUTA);
  if (guardado) {
    fX.value = guardado.x ?? "";
    fY.value = guardado.y ?? "";
    fLote.value = guardado.lote ?? "";
    if (guardado.lotes === "true") btnLotes.dataset.lotes = "true";
    if (guardado.origen) selOrigen.value = guardado.origen;
    if (guardado.destino) selDestino.value = guardado.destino;
    if (guardado.todos) {
      chkTodos.checked = true;
      chkTodos.dispatchEvent(new Event("change")); // dispara la carga async de proj4; lo sincrono de arriba ya corrio al volver aqui
      fEpsgOrigen.value = guardado.epsgOrigen ?? "";
      fEpsgDestino.value = guardado.epsgDestino ?? "";
    }
    aplicarModos();
  }

  /**
   * Convierte un punto en el modo actual. Devuelve {x, y, esGeoDestino, avisos} o lanza Error con un mensaje en español.
   * (En el modo de la lista el calculo es el del motor original; los avisos salen de las areas de uso del catalogo.)
   */
  function convertirPunto(xIn, yIn, o, d) {
    if (!Number.isFinite(xIn) || !Number.isFinite(yIn)) throw new Error("Escriba las dos coordenadas del punto (números, con punto o coma decimal).");
    const invertido = o.esGeo ? avisoOrdenInvertido(xIn, yIn) : null;
    if (modoEpsg()) {
      const r = convertirEntreSistemas(proj4, catalogo, o.epsg, d.epsg, xIn, yIn);
      return { x: r.x, y: r.y, esGeoDestino: r.esGeoDestino, avisos: invertido ? [invertido, ...r.avisos] : r.avisos };
    }
    const { xOut, yOut, esGeoDestino } = convertirCoordenadas(o.s, d.s, xIn, yIn);
    let avisos = [];
    if (catalogo) {
      const ll = o.esGeo ? { xOut: xIn, yOut: yIn } : convertirCoordenadas(o.s, WGS84, xIn, yIn);
      if (Number.isFinite(ll.xOut) && Number.isFinite(ll.yOut)) {
        avisos = avisosArea({ nombre: o.etiqueta, bbox: o.bbox }, { nombre: d.etiqueta, bbox: d.bbox }, ll.xOut, ll.yOut);
      }
    }
    return { x: xOut, y: yOut, esGeoDestino, avisos: invertido ? [invertido, ...avisos] : avisos };
  }

  const formato = (r) => (r.esGeoDestino ? `${fmt(r.x, 6)} ${fmt(r.y, 6)}` : `${fmt(r.x, 4)} ${fmt(r.y, 4)}`);
  const avisosHtml = (avisos) => avisos.map((a) => `<div class="callout callout-warning" style="margin-top: var(--space-3);">${escapeHtml(a.texto)}</div>`).join("");
  const error = (msg) => {
    wrap.innerHTML = `<div class="callout callout-danger" ${MARGEN}>${escapeHtml(msg)}</div>`;
  };

  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    await catalogoPromesa; // los avisos necesitan las areas de uso
    actualizar();
    const o = sistema("origen");
    const d = sistema("destino");
    if (!o || !d) return error("Escriba el código EPSG de entrada y el de salida, que estén entre los sistemas incluidos (solo el número, por ejemplo 3116).");
    if (!form.reportValidity()) return;
    const cabecera = `${escapeHtml(o.etiqueta)} → ${escapeHtml(d.etiqueta)}${d.esGeo ? "" : ` (${d.unidad})`}`;

    if (!modoLote()) {
      try {
        const r = convertirPunto(numeroFlexible(fX.value), numeroFlexible(fY.value), o, d);
        const texto = r.esGeoDestino ? `Longitud: ${fmt(r.x, 6)}   Latitud: ${fmt(r.y, 6)}` : `Este: ${fmt(r.x, 4)}   Norte: ${fmt(r.y, 4)}`;
        wrap.innerHTML = `
          <div class="result-panel compacto" ${MARGEN}>
            <div class="result-metric">
              <div class="value" style="font-size: 1.4rem;">${texto}</div>
              <div class="label">${cabecera}</div>
            </div>
          </div>
          ${avisosHtml(r.avisos)}`;
      } catch (err) {
        error(err.message);
      }
      return;
    }

    // Por lotes: una pareja por linea, pegada de Excel o de un CSV (ver parsearPareja: tabulacion, «;», espacios o una coma; punto o coma
    // decimal). Las lineas en blanco se saltan y una primera linea sin numeros («Longitud;Latitud») se toma como encabezado.
    const salida = [];
    const avisos = new Map(); // texto -> numeros de linea
    let validas = 0;
    let encabezado = false;
    let primera = true;
    fLote.value.split(/\r?\n/).forEach((linea, i) => {
      const p = parsearPareja(linea);
      if (p.vacia) return;
      const esPrimera = primera;
      primera = false;
      if (p.encabezado && esPrimera) {
        encabezado = true;
        return;
      }
      if (p.encabezado || p.error) {
        salida.push(`Línea ${i + 1}: ${p.error ?? "no es una pareja de coordenadas"} («${linea.trim()}»)`);
        return;
      }
      try {
        const r = convertirPunto(p.x, p.y, o, d);
        salida.push(formato(r));
        validas++;
        r.avisos.forEach((a) => avisos.set(a.texto, [...(avisos.get(a.texto) ?? []), i + 1]));
      } catch (err) {
        salida.push(`Línea ${i + 1}: ${err.message}`);
      }
    });
    if (!salida.length) return error("Escriba al menos una pareja de coordenadas, una por línea.");
    const resumen = [...avisos].map(([texto, lineas]) => ({
      texto: lineas.length === validas ? texto : `${texto} Líneas: ${lineas.slice(0, 12).join(", ")}${lineas.length > 12 ? "…" : ""}.`,
    }));
    wrap.innerHTML = `
      <div class="result-panel compacto" ${MARGEN}>
        <div class="result-metric">
          <div class="label" style="margin-bottom: var(--space-3);">${validas} de ${salida.length} puntos convertidos: ${cabecera}${encabezado ? " (se omitió la fila de encabezado)" : ""}</div>
          <div class="report-block">${salida.map(escapeHtml).join("\n")}</div>
        </div>
      </div>
      ${avisosHtml(resumen)}`;
  });

  // El router llama a esto justo antes de salir de la pantalla (ver js/router.js), para que lo
  // escrito no se pierda al volver de otra sección; una recarga de la app si lo reinicia.
  function antesDeSalir() {
    guardarEstado(RUTA, {
      todos: chkTodos.checked,
      origen: selOrigen.value,
      destino: selDestino.value,
      epsgOrigen: fEpsgOrigen.value,
      epsgDestino: fEpsgDestino.value,
      lotes: btnLotes.dataset.lotes,
      x: fX.value,
      y: fY.value,
      lote: fLote.value,
    });
  }

  return antesDeSalir;
}
