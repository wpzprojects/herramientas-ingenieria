// Conversion de unidades: cascada Categoria -> Unidad origen -> Unidad destino.
//  - Modo normal: los pares de data/factores-conversion.json con el motor convertirUnidad (../calc/unidades.js).
//  - «Habilitar todas las conversiones»: catalogo data/unidades.json (mas unidades y categorias, cualquier unidad a cualquier otra,
//    incluido el calibre AWG/kcmil <-> mm²) con el motor de ../calc/unidades-extendido.js.
// Las categorias van en orden alfabetico y Angulos al final (orden en data/unidades.json).

import { loadData, distinct, escapeHtml } from "../util/format.js";
import { convertirUnidad } from "../calc/unidades.js";
import { convertirBase, CALIBRES, datosCalibre, calibrePorArea } from "../calc/unidades-extendido.js";
import { guardarEstado, leerEstado } from "../util/persistencia-calculo.js";

const RUTA = "/varios/conversion-unidades";
const CALIBRE_AWG = "calibre";
const MM2 = "mm2";

/** Numero con hasta 6 cifras significativas (o todas las enteras si son mas), sin ceros sobrantes; notacion cientifica si es muy grande o muy pequeno. */
function fmtSig(x) {
  if (!Number.isFinite(x)) return "—";
  if (x === 0) return "0";
  const a = Math.abs(x);
  if (a < 1e-4 || a >= 1e9) return x.toExponential(5).replace(/\.?0+e/, "e").replace("e+", "e");
  return String(Number(x.toPrecision(Math.max(6, Math.floor(Math.log10(a)) + 1)))); // nunca recorta cifras enteras
}

const opciones = (lista, marcador) => `<option value="">${marcador}</option>` + lista.map(([v, t]) => `<option value="${escapeHtml(v)}">${escapeHtml(t)}</option>`).join("");

export async function render(container) {
  const tabla = await loadData("factores-conversion");
  const catalogo = await loadData("unidades");
  const catPorClave = Object.fromEntries(catalogo.categorias.map((c) => [c.clave, c]));
  const unidadDe = (clave, codigo) => catPorClave[clave]?.unidades.find((u) => u.codigo === codigo);
  const simbolo = (clave, codigo) => unidadDe(clave, codigo)?.simbolo ?? codigo;
  const rotulo = (clave, codigo) => { const u = unidadDe(clave, codigo); return u ? `${u.simbolo} — ${u.nombre}` : codigo; };

  container.innerHTML = `
    <div class="breadcrumb"><a href="#/">Inicio</a> <span>/</span> <a href="#/varios">Varios</a> <span>/</span> <span>Conversión de unidades</span></div>
    <h1 class="page-title">Conversión de unidades</h1>

    <form class="card tarjeta-borde" id="form-conversion" novalidate>
      <div class="grid-3">
        <div class="field">
          <label for="f-categoria">Categoría</label>
          <select id="f-categoria" required></select>
        </div>
        <div class="field">
          <label for="f-origen">Unidad origen</label>
          <select id="f-origen" required disabled>
            <option value="">Seleccione una categoría primero</option>
          </select>
        </div>
        <div class="field">
          <label for="f-destino">Unidad destino</label>
          <select id="f-destino" required disabled>
            <option value="">Seleccione una unidad origen primero</option>
          </select>
        </div>
      </div>

      <div class="field" id="campo-valor">
        <label for="f-valor">Valor a convertir</label>
        <input type="number" id="f-valor" step="any" required>
      </div>
      <div class="field" id="campo-calibre" hidden>
        <label for="f-calibre">Calibre a convertir</label>
        <select id="f-calibre">${opciones(CALIBRES.map((c) => [c.codigo, c.codigo]), "Seleccione…")}</select>
      </div>

      <div class="btn-row">
        <button type="submit" class="btn btn-primary">Convertir</button>
      </div>
    </form>

    <label class="checkbox-row" style="margin-top: var(--space-3);">
      <input type="checkbox" id="chk-todas"> Habilitar todas las conversiones
    </label>

    <div id="resultado-wrap"></div>
  `;

  const form = container.querySelector("#form-conversion");
  const selCategoria = container.querySelector("#f-categoria");
  const selOrigen = container.querySelector("#f-origen");
  const selDestino = container.querySelector("#f-destino");
  const fValor = container.querySelector("#f-valor");
  const selCalibre = container.querySelector("#f-calibre");
  const campoValor = container.querySelector("#campo-valor");
  const campoCalibre = container.querySelector("#campo-calibre");
  const chk = container.querySelector("#chk-todas");
  const wrap = container.querySelector("#resultado-wrap");

  const completo = () => chk.checked;
  const soloBasicas = () => catalogo.orden_basico;
  const porNombre = (clave) => catPorClave[clave]?.nombre ?? clave;

  // ---- listas de cada paso ----
  const listaCategorias = () => {
    const claves = completo() ? catalogo.orden_completo : soloBasicas();
    return claves.map((c) => [c, porNombre(c)]);
  };
  const listaOrigenes = (cat) => {
    if (!cat) return [];
    if (!completo()) return distinct(tabla.filter((r) => r.categoria === cat), "unidad_origen").map((u) => [u, rotulo(cat, u)]);
    if (cat === "Calibre") return [[CALIBRE_AWG, "Calibre (AWG / kcmil)"], [MM2, "Sección (mm²)"]];
    return catPorClave[cat].unidades.map((u) => [u.codigo, `${u.simbolo} — ${u.nombre}`]);
  };
  const listaDestinos = (cat, origen) => {
    if (!cat || !origen) return [];
    if (!completo()) return distinct(tabla.filter((r) => r.categoria === cat && r.unidad_origen === origen), "unidad_destino").map((u) => [u, rotulo(cat, u)]);
    if (cat === "Calibre") {
      return origen === CALIBRE_AWG ? [["mm2", "Sección (mm²)"], ["kcmil", "Sección (kcmil)"], ["d", "Diámetro (mm)"]] : [["calibre", "Calibre más cercano (AWG / kcmil)"]];
    }
    return catPorClave[cat].unidades.filter((u) => u.codigo !== origen).map((u) => [u.codigo, `${u.simbolo} — ${u.nombre}`]);
  };

  const vaciarResultado = () => { wrap.innerHTML = ""; };
  const llenarCategorias = () => {
    selCategoria.innerHTML = opciones(listaCategorias(), "Seleccione…");
    selCategoria.dispatchEvent(new Event("change"));
  };
  const actualizarCampoValor = () => {
    const porCalibre = completo() && selCategoria.value === "Calibre" && selOrigen.value === CALIBRE_AWG;
    campoValor.hidden = porCalibre;
    campoCalibre.hidden = !porCalibre;
    fValor.required = !porCalibre;
    selCalibre.required = porCalibre;
  };

  chk.addEventListener("change", llenarCategorias);

  selCategoria.addEventListener("change", () => {
    const origenes = listaOrigenes(selCategoria.value);
    selOrigen.innerHTML = origenes.length ? opciones(origenes, "Seleccione…") : `<option value="">Seleccione una categoría primero</option>`;
    selOrigen.disabled = !origenes.length;
    selDestino.innerHTML = `<option value="">Seleccione una unidad origen primero</option>`;
    selDestino.disabled = true;
    actualizarCampoValor();
    vaciarResultado();
  });

  selOrigen.addEventListener("change", () => {
    const destinos = listaDestinos(selCategoria.value, selOrigen.value);
    selDestino.innerHTML = destinos.length ? opciones(destinos, "Seleccione…") : `<option value="">Seleccione una unidad origen primero</option>`;
    selDestino.disabled = !destinos.length;
    actualizarCampoValor();
    vaciarResultado();
  });

  selDestino.addEventListener("change", vaciarResultado);

  const mostrar = (valorTexto, unidad, detalle) => {
    wrap.innerHTML = `
      <div class="result-panel compacto" style="margin-top: var(--space-4);">
        <div class="result-metric">
          <div class="value">${valorTexto}<span class="unit">${escapeHtml(unidad)}</span></div>
          <div class="label">${escapeHtml(detalle)}</div>
        </div>
      </div>
    `;
  };
  const error = (texto) => {
    wrap.innerHTML = `<div class="callout callout-danger" style="margin-top: var(--space-4);">${escapeHtml(texto)}</div>`;
  };

  form.addEventListener("submit", (e) => {
    e.preventDefault();
    if (!form.reportValidity()) return;

    const categoria = selCategoria.value;
    const unidadOrigen = selOrigen.value;
    const unidadDestino = selDestino.value;

    // ---- modo normal: pares de la tabla, tal como siempre ----
    if (!completo()) {
      const valor = Number(fValor.value);
      const resultado = convertirUnidad(tabla, { categoria, unidadOrigen, unidadDestino, valor });
      if (resultado === null) return error("No existe conversión definida para esa combinación.");
      const so = simbolo(categoria, unidadOrigen);
      const sd = simbolo(categoria, unidadDestino);
      return mostrar(resultado.toFixed(4), sd, `${valor} ${so} → ${sd}`);
    }

    // ---- calibre de conductor ----
    if (categoria === "Calibre") {
      if (unidadOrigen === CALIBRE_AWG) {
        const d = datosCalibre(selCalibre.value);
        const dato = { mm2: [d.areaMm2, "mm²"], kcmil: [d.kcmil, "kcmil"], d: [d.diametroMm, "mm"] }[unidadDestino];
        return mostrar(fmtSig(dato[0]), dato[1], `${d.codigo} → ${unidadDestino === "d" ? "diámetro" : "sección"} (${dato[1]})`);
      }
      const area = Number(fValor.value);
      const c = calibrePorArea(area);
      if (!c) return error("La sección debe ser mayor que cero.");
      const nota = c.exacto ? "calibre comercial equivalente" : `calibre comercial más cercano (${c.areaMm2.toFixed(2)} mm², ${c.diferenciaPct > 0 ? "+" : ""}${c.diferenciaPct.toFixed(1)} %)`;
      return mostrar(escapeHtml(c.codigo), "", `${fmtSig(area)} mm² → ${nota}`);
    }

    // ---- unidades de cualquier categoria ----
    const valor = Number(fValor.value);
    const resultado = convertirBase(catalogo, categoria, unidadOrigen, unidadDestino, valor);
    if (resultado === null) return error("No existe conversión definida para esa combinación.");
    const so = simbolo(categoria, unidadOrigen);
    const sd = simbolo(categoria, unidadDestino);
    mostrar(fmtSig(resultado), sd, `${fmtSig(valor)} ${so} → ${sd}`);
  });

  llenarCategorias();

  // ---------- restaurar lo que habia si se volvio de otra seccion (no sobrevive a un recargue) ----------
  const guardado = leerEstado(RUTA);
  if (guardado) {
    if (guardado.completo) {
      chk.checked = true;
      chk.dispatchEvent(new Event("change"));
    }
    if (guardado.categoria) {
      selCategoria.value = guardado.categoria;
      selCategoria.dispatchEvent(new Event("change"));
    }
    if (guardado.origen) {
      selOrigen.value = guardado.origen;
      selOrigen.dispatchEvent(new Event("change"));
    }
    if (guardado.destino) selDestino.value = guardado.destino;
    if (guardado.valor !== undefined) fValor.value = guardado.valor;
    if (guardado.calibre) selCalibre.value = guardado.calibre;
  }

  // El router llama a esto justo antes de salir de la pantalla (ver js/router.js), para que lo
  // escrito no se pierda al volver de otra sección; una recarga de la app si lo reinicia.
  function antesDeSalir() {
    guardarEstado(RUTA, {
      completo: chk.checked,
      categoria: selCategoria.value,
      origen: selOrigen.value,
      destino: selDestino.value,
      valor: fValor.value,
      calibre: selCalibre.value,
    });
  }

  return antesDeSalir;
}
