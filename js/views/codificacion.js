// Catalogo filtrable de codigos de entregables (planos, informes, etc).
// data/codificacion.json: { id, codigo, entregable, especialidad }.
//
// Edicion por el administrador (2026-09-26, pedido del usuario): es un catalogo mas del servidor (js/util/catalogos-remotos.js,
// con historial en Perfil > Catalogos). Como la tabla no abre una ficha, se edita EN LA MISMA FILA: dos columnas al final
// (Editar y Eliminar); al editar, las tres celdas pasan a ser casillas y los botones pasan a Guardar y Cancelar (Enter
// guarda, Esc cancela). «Agregar registro» (en la barra de filtros) pone una fila editable arriba de la tabla. Cada
// cambio se publica de inmediato, con confirmacion; el codigo no puede repetirse.

import { loadData, distinct, debounce, escapeHtml } from "../util/format.js";
import { icon } from "../icons.js";
import { revelar } from "../util/revelar.js";
import { esAdministrador, agregarRegistro, reemplazarRegistro, quitarRegistro, guardarCatalogo } from "../util/edicion-catalogo.js";

const CATALOGO = "codificacion";
const CAMPOS = [
  { key: "codigo", label: "Código" },
  { key: "entregable", label: "Entregable" },
  { key: "especialidad", label: "Especialidad" },
];

/** Valida una fila escrita a mano: los tres campos obligatorios y el código sin repetir (sin distinguir mayúsculas). */
export function validarCodificacion(filas, registro, idPropio = null) {
  const errores = {};
  for (const c of CAMPOS) if (!String(registro[c.key] ?? "").trim()) errores[c.key] = `${c.label}: es obligatorio.`;
  const codigo = String(registro.codigo ?? "").trim().toLowerCase();
  if (codigo && filas.some((f) => String(f.id) !== String(idPropio) && String(f.codigo).trim().toLowerCase() === codigo)) {
    errores.codigo = "Código: ya existe otro registro con este código.";
  }
  return errores;
}

export async function render(container, _params, { confirmar = (t) => confirm(t) } = {}) {
  let rows = await loadData(CATALOGO);
  const admin = esAdministrador();

  container.innerHTML = `
    <div class="breadcrumb"><a href="#/">Inicio</a> <span>/</span> <a href="#/varios">Varios</a> <span>/</span> <span>Codificación de entregables</span></div>
    <h1 class="page-title">Codificación de entregables</h1>

    <div class="toolbar">
      <div class="field search">
        <label for="f-buscar">Buscar</label>
        <input type="search" id="f-buscar" placeholder="Buscar por código o entregable…">
      </div>
      <div class="field">
        <label for="f-especialidad">Especialidad</label>
        <select id="f-especialidad"></select>
      </div>
      <div class="field">
        <label>&nbsp;</label>
        <button type="button" class="btn btn-ghost" id="btn-orden">
          <span id="btn-orden-icon" aria-hidden="true">↑</span>
          <span id="btn-orden-texto">Código A→Z</span>
        </button>
      </div>
      ${admin ? `<div class="btn-row ed-acciones"><button type="button" class="btn btn-con-icono" id="btn-agregar">${icon("plus")} Agregar registro</button></div>` : ""}
    </div>

    <div id="cod-msg"></div>
    <p class="row-count" id="row-count"></p>
    <div class="table-wrap">
      <table class="${admin ? "cod-tabla-admin" : ""}">
        <thead>
          <tr>
            <th>Código</th>
            <th class="wrap">Entregable</th>
            <th>Especialidad</th>
            ${admin ? `<th class="cod-accion">Editar</th><th class="cod-accion">Eliminar</th>` : ""}
          </tr>
        </thead>
        <tbody id="tbody-codificacion"></tbody>
      </table>
    </div>
    ${admin ? `<datalist id="cod-especialidades"></datalist>` : ""}
  `;

  const $ = (s) => container.querySelector(s);
  const fBuscar = $("#f-buscar");
  const fEspecialidad = $("#f-especialidad");
  const btnOrden = $("#btn-orden");
  const tbody = $("#tbody-codificacion");
  const rowCount = $("#row-count");
  const msg = $("#cod-msg");

  let ordenAsc = true;
  let editando = null; // id de la fila en edición, o "nuevo"

  function pintarEspecialidades() {
    const actual = fEspecialidad.value;
    const especialidades = distinct(rows, "especialidad");
    fEspecialidad.innerHTML = `<option value="">Todas las categorías</option>` + especialidades.map((e) => `<option value="${escapeHtml(e)}">${escapeHtml(e)}</option>`).join("");
    fEspecialidad.value = especialidades.includes(actual) ? actual : "";
    const lista = $("#cod-especialidades");
    if (lista) lista.innerHTML = especialidades.map((e) => `<option value="${escapeHtml(e)}"></option>`).join("");
  }

  const aviso = (tipo, texto) => {
    msg.innerHTML = texto ? `<div class="callout callout-${tipo}" style="margin: 0 0 var(--space-3);"><span>${escapeHtml(texto)}</span></div>` : "";
  };

  const botonIcono = (accion, nombre, etiqueta, id) =>
    `<button type="button" class="btn btn-sm btn-ghost btn-icono" data-accion="${accion}" data-id="${escapeHtml(String(id))}" aria-label="${escapeHtml(etiqueta)}" title="${escapeHtml(etiqueta)}">${icon(nombre)}</button>`;

  function filaLectura(r) {
    return `
      <tr data-id="${escapeHtml(String(r.id))}">
        <td class="mono">${escapeHtml(r.codigo)}</td>
        <td class="wrap">${escapeHtml(r.entregable)}</td>
        <td>${escapeHtml(r.especialidad)}</td>
        ${admin ? `<td class="cod-accion">${botonIcono("editar", "pencil", `Editar ${r.codigo}`, r.id)}</td><td class="cod-accion">${botonIcono("eliminar", "trash", `Eliminar ${r.codigo}`, r.id)}</td>` : ""}
      </tr>`;
  }

  function filaEdicion(r, id) {
    const campo = (c, extra = "") =>
      `<input type="text" class="cod-campo" data-campo="${c.key}" aria-label="${c.label}" value="${escapeHtml(r?.[c.key] ?? "")}" autocomplete="off"${extra}>`;
    return `
      <tr class="cod-editando" data-id="${escapeHtml(String(id))}">
        <td>${campo(CAMPOS[0], ' spellcheck="false"')}</td>
        <td class="wrap">${campo(CAMPOS[1])}</td>
        <td>${campo(CAMPOS[2], ' list="cod-especialidades"')}</td>
        <td class="cod-accion">${botonIcono("guardar", "check", "Guardar y publicar", id)}</td>
        <td class="cod-accion">${botonIcono("cancelar", "close", "Cancelar", id)}</td>
      </tr>`;
  }

  function aplicarFiltros() {
    const texto = fBuscar.value.trim().toLowerCase();
    const especialidad = fEspecialidad.value;

    let filtradas = rows.filter((r) => {
      if (String(r.id) === String(editando)) return true; // la fila en edición no desaparece al filtrar
      if (especialidad && r.especialidad !== especialidad) return false;
      if (!texto) return true;
      return String(r.codigo).toLowerCase().includes(texto) || String(r.entregable).toLowerCase().includes(texto);
    });

    filtradas = filtradas.slice().sort((a, b) => {
      const cmp = String(a.codigo).localeCompare(String(b.codigo), "es", { numeric: true });
      return ordenAsc ? cmp : -cmp;
    });

    rowCount.textContent = `${filtradas.length} código(s)`;
    tbody.innerHTML =
      (editando === "nuevo" ? filaEdicion(null, "nuevo") : "") +
      filtradas.map((r) => (String(r.id) === String(editando) ? filaEdicion(r, r.id) : filaLectura(r))).join("");
    const enEdicion = tbody.querySelector(".cod-editando .cod-campo");
    if (enEdicion && !tbody.contains(document.activeElement)) enEdicion.focus();
  }

  fBuscar.addEventListener("input", debounce(aplicarFiltros, 200));
  fEspecialidad.addEventListener("change", aplicarFiltros);
  btnOrden.addEventListener("click", () => {
    ordenAsc = !ordenAsc;
    $("#btn-orden-texto").textContent = ordenAsc ? "Código A→Z" : "Código Z→A";
    $("#btn-orden-icon").textContent = ordenAsc ? "↑" : "↓";
    aplicarFiltros();
  });

  pintarEspecialidades();
  aplicarFiltros();
  if (!admin) return;

  // ---------------------------------------------------------------- administrador
  const editar = (id) => {
    editando = id;
    aviso(null, "");
    aplicarFiltros();
  };

  async function publicar(filas, cambio, boton) {
    const antes = boton.innerHTML;
    boton.disabled = true;
    try {
      await guardarCatalogo(CATALOGO, filas, cambio);
      rows = await loadData(CATALOGO);
      editando = null;
      pintarEspecialidades();
      aplicarFiltros();
      return true;
    } catch (err) {
      aviso("danger", `No se pudo guardar: ${err?.message || err}`);
      boton.disabled = false;
      boton.innerHTML = antes;
      return false;
    }
  }

  async function guardar(tr, boton) {
    const id = tr.dataset.id;
    const registro = Object.fromEntries([...tr.querySelectorAll(".cod-campo")].map((i) => [i.dataset.campo, i.value.trim()]));
    const nuevo = id === "nuevo";
    const errores = validarCodificacion(rows, registro, nuevo ? null : id);
    tr.querySelectorAll(".cod-campo").forEach((i) => i.setAttribute("aria-invalid", errores[i.dataset.campo] ? "true" : "false"));
    if (Object.keys(errores).length) {
      aviso("warning", Object.values(errores).join(" "));
      tr.querySelector('[aria-invalid="true"]')?.focus();
      return;
    }
    const original = nuevo ? null : rows.find((r) => String(r.id) === String(id));
    if (original && CAMPOS.every((c) => String(original[c.key]) === registro[c.key])) return editar(null); // sin cambios
    if (!confirmar(nuevo ? `¿Agregar «${registro.codigo}»? Se publica de inmediato para todos los usuarios.` : `¿Guardar los cambios de «${registro.codigo}»? Se publican de inmediato para todos los usuarios.`)) return;
    const filas = nuevo ? agregarRegistro(rows, registro).filas : reemplazarRegistro(rows, id, registro);
    if (await publicar(filas, nuevo ? `Agregó «${registro.codigo}»` : `Editó «${registro.codigo}»`, boton)) {
      aviso("success", nuevo ? `Se agregó «${registro.codigo}».` : `Se guardó «${registro.codigo}».`);
    }
  }

  async function eliminar(id, boton) {
    const r = rows.find((x) => String(x.id) === String(id));
    if (!r) return;
    if (!confirmar(`¿Eliminar «${r.codigo}» (${r.entregable})? Se publica de inmediato para todos; si fue un error, se recupera desde el historial en Perfil > Catálogos.`)) return;
    if (await publicar(quitarRegistro(rows, id), `Eliminó «${r.codigo}»`, boton)) aviso("success", `Se eliminó «${r.codigo}».`);
  }

  const puedeCambiarFila = () => editando === null || confirmar("Hay una fila en edición; sus cambios sin guardar se pierden. ¿Continuar?");
  $("#btn-agregar").addEventListener("click", () => {
    if (editando === "nuevo" || !puedeCambiarFila()) return;
    editar("nuevo");
    revelar($(".cod-editando"));
    $(".cod-editando .cod-campo")?.focus();
  });

  tbody.addEventListener("click", (e) => {
    const boton = e.target.closest("[data-accion]");
    if (!boton) return;
    const { accion, id } = boton.dataset;
    if (accion === "editar") {
      if (!puedeCambiarFila()) return;
      editar(id);
    } else if (accion === "eliminar") eliminar(id, boton);
    else if (accion === "cancelar") editar(null);
    else if (accion === "guardar") guardar(boton.closest("tr"), boton);
  });

  tbody.addEventListener("keydown", (e) => {
    const tr = e.target.closest(".cod-editando");
    if (!tr) return;
    if (e.key === "Enter") {
      e.preventDefault();
      guardar(tr, tr.querySelector('[data-accion="guardar"]'));
    } else if (e.key === "Escape") {
      e.preventDefault();
      editar(null);
    }
  });
}
