// Vista GENERICA de listado/filtro del catalogo, reutilizada por las 3 familias de conductores del catalogo original
// (desnudos, semiaislados, XLPE) y por el catalogo de tuberias, parametrizada
// por :familia en la URL (#/catalogos/:familia). Cada familia solo difiere en
// el archivo de datos, los filtros disponibles y las columnas de la tabla -
// toda esa diferencia vive en CONFIG, la logica de filtrado/render es unica.

import { el, loadData, distinct, debounce, conIdSiFalta } from "../util/format.js";
import { CONFIG as FICHA, tituloDeFila } from "./detalle-conductor.js";
import { esAdministrador, esquemaDe, agregarRegistro, guardarCatalogo, abrirEditor, botonesAdmin } from "../util/edicion-catalogo.js";

const CONFIG = {
  desnudos: {
    dataFile: "conductores-desnudos",
    titulo: "Conductores desnudos",
    filtros: [{ key: "tipo", label: "Tipo" }],
    busqueda: ["nombre_clave", "calibre_awg_kcmil"],
    columnas: [
      { key: "tipo", label: "Tipo" },
      { key: "calibre_awg_kcmil", label: "Calibre" },
      { key: "nombre_clave", label: "Nombre" },
      { key: "masa_kg_km", label: "Masa (kg/km)", hideNarrow: true, render: (r) => fmtOrDash(r.masa_kg_km, 1) },
      { key: "carga_rotura_kgf", label: "Rotura (kgf)", hideNarrow: true, render: (r) => fmtOrDash(r.carga_rotura_kgf, 0) },
      { key: "corriente", label: "Corriente (A)", render: (r) => r.corriente_75c_a ?? r.corriente_sol_viento_a ?? "—" },
    ],
  },
  semiaislados: {
    dataFile: "conductores-semiaislados",
    titulo: "Conductores semiaislados",
    filtros: [
      { key: "tension_operacion_kv", label: "Tensión" },
      { key: "capas", label: "Capas" },
      { key: "material_conductor", label: "Material" },
    ],
    busqueda: null,
    columnas: [
      { key: "tension_operacion_kv", label: "Tensión" },
      { key: "capas", label: "Capas", hideNarrow: true },
      { key: "material_conductor", label: "Material", hideNarrow: true },
      { key: "calibre_awg_kcmil", label: "Calibre" },
      { key: "nombre_clave", label: "Referencia" },
      { key: "masa_total_kg_km", label: "Masa (kg/km)", render: (r) => fmtOrDash(r.masa_total_kg_km, 0) },
    ],
  },
  xlpe: {
    dataFile: "conductores-xlpe",
    titulo: "Conductores XLPE (MT)",
    filtros: [
      { key: "nivel_tension_kv", label: "Tensión" },
      { key: "material_conductor", label: "Material" },
      { key: "calibre_awg_kcmil", label: "Calibre" },
    ],
    busqueda: null,
    columnas: [
      { key: "calibre_awg_kcmil", label: "Calibre" },
      { key: "nivel_tension_kv", label: "Tensión" },
      { key: "material_conductor", label: "Material" },
      { key: "porcentaje_aislamiento_pct", label: "Aislamiento (%)", hideNarrow: true },
      { key: "pantalla", label: "Pantalla", hideNarrow: true },
      { key: "diametro_total_conductor_mm", label: "Diámetro (mm)", render: (r) => fmtOrDash(r.diametro_total_conductor_mm, 1) },
    ],
  },
  // Tuberias (data/tuberias.json, el mismo catalogo de la calculadora de Ocupacion de ductos). El archivo no trae `id`:
  // se usa la posicion (prepararFilas) para poder abrir la ficha.
  tuberias: {
    dataFile: "tuberias",
    titulo: "Tuberías",
    textoVacio: "No se encontraron tuberías con los filtros seleccionados.",
    prepararFilas: conIdSiFalta,
    filtros: [{ key: "tipo", label: "Tipo de tubería" }],
    busqueda: ["diametro_nominal"],
    columnas: [
      { key: "tipo", label: "Tipo" },
      { key: "diametro_nominal", label: "Nominal" },
      { key: "diametro_interno_min_mm", label: "Interno mín. (mm)", render: (r) => fmtOrDash(r.diametro_interno_min_mm, 2) },
      { key: "diametro_exterior_min_pulg", label: "Exterior mín. (pulg)", hideNarrow: true, render: (r) => fmtOrDash(r.diametro_exterior_min_pulg, 3) },
      { key: "peso_min_kg", label: "Peso mín. (kg)", hideNarrow: true, render: (r) => fmtOrDash(r.peso_min_kg, 3) },
    ],
  },
};

function fmtOrDash(value, decimals) {
  if (value === null || value === undefined || Number.isNaN(value)) return "—";
  return Number(value).toFixed(decimals);
}

function cellValue(col, row) {
  if (col.render) return col.render(row);
  const v = row[col.key];
  if (v === null || v === undefined || v === "") return "—";
  return typeof v === "number" ? fmtOrDash(v, 2) : String(v);
}

// El CSS del shell (css/app.css) no trae una regla para ocultar columnas
// "hideNarrow" en pantallas angostas — se inyecta una sola vez aqui.
function ensureHideNarrowStyle() {
  if (document.getElementById("catalogo-hide-narrow-style")) return;
  const style = document.createElement("style");
  style.id = "catalogo-hide-narrow-style";
  style.textContent = "@media (max-width: 720px) { .hide-narrow { display: none; } }";
  document.head.appendChild(style);
}

export async function render(container, params) {
  const cfg = CONFIG[params.familia];

  if (!cfg) {
    container.append(
      el("div", { class: "empty-state" }, [
        el("h2", {}, "Catálogo no reconocido"),
        el("p", { class: "text-muted" }, `La familia "${params.familia}" no existe.`),
        el("p", {}, el("a", { class: "btn btn-ghost", href: "#/catalogos" }, "← Volver a catálogos")),
      ])
    );
    return;
  }

  ensureHideNarrowStyle();

  const rows = (cfg.prepararFilas ?? ((r) => r))(await loadData(cfg.dataFile));

  container.append(
    el("nav", { class: "breadcrumb" }, [
      el("a", { href: "#/" }, "Inicio"),
      el("span", {}, "/"),
      el("a", { href: "#/catalogos" }, "Catálogos"),
      el("span", {}, "/"),
      el("span", {}, cfg.titulo),
    ]),
    el("h1", { class: "page-title" }, cfg.titulo)
  );

  const toolbar = el("div", { class: "toolbar" });
  const selects = {};

  cfg.filtros.forEach((f) => {
    const selectId = `filtro-${params.familia}-${f.key}`;
    const options = distinct(rows, f.key);
    const select = el("select", { id: selectId }, [
      el("option", { value: "" }, "Todos"),
      ...options.map((opt) => el("option", { value: opt }, String(opt))),
    ]);
    selects[f.key] = select;
    toolbar.append(el("div", { class: "field" }, [el("label", { for: selectId }, f.label), select]));
  });

  let searchInput = null;
  if (cfg.busqueda) {
    const searchId = `busqueda-${params.familia}`;
    searchInput = el("input", { type: "search", id: searchId, placeholder: "Buscar..." });
    toolbar.append(el("div", { class: "field search" }, [el("label", { for: searchId }, "Buscar"), searchInput]));
  }

  container.append(toolbar);

  const resultsWrap = el("div", {});
  container.append(resultsWrap);

  // Administrador: «Agregar registro» (se publica de inmediato; ver js/util/edicion-catalogo.js)
  if (esAdministrador()) {
    const ficha = FICHA[params.familia];
    const editorZona = el("div", {});
    const acciones = botonesAdmin([
      {
        accion: "agregar",
        icono: "plus",
        texto: "Agregar registro",
        alHacer: () => {
          toolbar.hidden = resultsWrap.hidden = acciones.hidden = true;
          abrirEditor(editorZona, {
            titulo: `Agregar a ${cfg.titulo}`,
            esquema: esquemaDe(rows, ficha.campos),
            textoConfirmar: `¿Agregar este registro a ${cfg.titulo}? Se publica de inmediato para todos los usuarios.`,
            alCancelar: () => {
              editorZona.innerHTML = "";
              toolbar.hidden = resultsWrap.hidden = acciones.hidden = false;
            },
            alGuardar: async (registro) => {
              const { filas, id } = agregarRegistro(rows, registro);
              await guardarCatalogo(cfg.dataFile, filas, `Agregó «${tituloDeFila(ficha, registro)}»`);
              location.hash = `#/catalogos/${params.familia}/${id}`;
            },
          });
        },
      },
    ]);
    toolbar.append(acciones);
    container.append(editorZona);
  }

  function renderResults(filtered) {
    resultsWrap.innerHTML = "";
    resultsWrap.append(el("p", { class: "row-count" }, `Filas: ${filtered.length}`));

    if (filtered.length === 0) {
      resultsWrap.append(
        el("div", { class: "empty-state" }, [el("p", {}, cfg.textoVacio ?? "No se encontraron conductores con los filtros seleccionados.")])
      );
      return;
    }

    const thead = el("thead", {}, [
      el(
        "tr",
        {},
        cfg.columnas.map((c) => el("th", { class: c.hideNarrow ? "hide-narrow" : null }, c.label))
      ),
    ]);
    const tbody = el("tbody", {});
    filtered.forEach((row) => {
      const tr = el(
        "tr",
        { class: "clickable" },
        cfg.columnas.map((c) => el("td", { class: c.hideNarrow ? "hide-narrow" : null }, cellValue(c, row)))
      );
      tr.addEventListener("click", () => {
        location.hash = `#/catalogos/${params.familia}/${row.id}`;
      });
      tbody.append(tr);
    });

    const table = el("table", {}, [thead, tbody]);
    resultsWrap.append(el("div", { class: "table-wrap" }, table));
  }

  function applyFilters() {
    let filtered = rows;
    for (const f of cfg.filtros) {
      const val = selects[f.key].value;
      if (val) filtered = filtered.filter((r) => String(r[f.key]) === val);
    }
    if (cfg.busqueda && searchInput && searchInput.value.trim()) {
      const q = searchInput.value.trim().toLowerCase();
      filtered = filtered.filter((r) => cfg.busqueda.some((k) => String(r[k] ?? "").toLowerCase().includes(q)));
    }
    renderResults(filtered);
  }

  Object.values(selects).forEach((s) => s.addEventListener("change", applyFilters));
  if (searchInput) searchInput.addEventListener("input", debounce(applyFilters, 200));

  applyFilters();
}
