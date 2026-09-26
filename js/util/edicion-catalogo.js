// Edición de los catálogos por el administrador (fase 2, 2026-09-24). Decisiones del usuario: cada «Guardar» se publica
// de inmediato en el servidor (con confirmación), «Eliminar» quita el registro (se recupera desde el historial de
// versiones, las últimas 10 por catálogo, en Perfil > Catálogos) y solo el administrador ve los botones (la seguridad
// real la ponen las reglas de Firestore: el servidor rechaza a cualquier otro).
//
// El formulario sale de los campos que ya describen cada catálogo en las vistas (CONFIG de detalle-conductor.js) más
// los que traiga el archivo y la ficha no muestre (p. ej. `codigo`), para no perder datos. El tipo (número o texto), si
// es obligatorio y si admite negativos se deducen de los datos existentes.

import { icon } from "../icons.js";
import { escapeHtml, olvidarDato, conIdSiFalta } from "./format.js";
import { estadoAcceso } from "../auth/acceso.js";
import { obtenerBackend } from "../auth/backend.js";
import { lectorActivo, infoCopia, cargarFabrica, huella, textoCompacto, sincronizarCatalogos, CATALOGOS_EDITABLES } from "./catalogos-remotos.js";

export const esAdministrador = () => estadoAcceso().nivel === "admin";

// ------------------------------------------------------------------ esquema y validación (puros)

const vacio = (v) => v === null || v === undefined || v === "";

/**
 * Campos del formulario: los de `campos` ({key, label, largo?, entero?}) en su orden y, después, los demás que tengan
 * las filas (salvo `id`) con su nombre técnico como etiqueta.
 */
export function esquemaDe(filas, campos) {
  const claves = [...campos.map((c) => c.key)];
  for (const f of filas) for (const k of Object.keys(f)) if (k !== "id" && !claves.includes(k)) claves.push(k);
  return claves.map((key) => {
    const c = campos.find((x) => x.key === key) || {};
    const valores = filas.map((f) => f[key]).filter((v) => !vacio(v));
    const numero = valores.some((v) => typeof v === "number");
    return {
      key,
      label: c.label || key,
      tipo: numero ? "numero" : c.largo ? "largo" : "texto",
      requerido: filas.length > 0 && filas.every((f) => !vacio(f[key])),
      min: numero && valores.every((v) => typeof v !== "number" || v >= 0) ? 0 : null,
      entero: !!c.entero,
    };
  });
}

/** Lee lo escrito (texto de cada campo) y lo convierte. Devuelve { registro, errores: {key: mensaje} }. */
export function validarRegistro(esquema, crudo) {
  const registro = {};
  const errores = {};
  for (const c of esquema) {
    const txt = String(crudo[c.key] ?? "").trim();
    if (txt === "") {
      if (c.requerido) errores[c.key] = "Este dato es obligatorio.";
      registro[c.key] = null;
      continue;
    }
    if (c.tipo !== "numero") {
      registro[c.key] = txt;
      continue;
    }
    const n = Number(txt.replace(",", "."));
    if (!Number.isFinite(n) || /[^0-9.,eE+-]/.test(txt)) errores[c.key] = "Debe ser un número.";
    else if (c.min === 0 && n < 0) errores[c.key] = "No puede ser negativo.";
    else if (c.entero && !Number.isInteger(n)) errores[c.key] = "Debe ser un número entero.";
    else registro[c.key] = n;
  }
  return { registro, errores };
}

/** Id para un registro nuevo, con el mismo formato que los existentes: número (1, 2…) o texto con ceros («001»). */
export function nuevoId(filas) {
  const ids = filas.map((f) => f.id);
  const numeros = ids.map((i) => Number(i)).filter(Number.isFinite);
  const siguiente = (numeros.length ? Math.max(...numeros) : 0) + 1;
  const texto = ids.find((i) => typeof i === "string" && /^\d+$/.test(i));
  return texto ? String(siguiente).padStart(texto.length, "0") : siguiente;
}

// El registro con las claves en el mismo orden que las filas existentes (así el JSON exportado se ve igual).
function ordenar(plantilla, registro) {
  const out = {};
  for (const k of Object.keys(plantilla || registro)) if (k in registro) out[k] = registro[k];
  for (const k of Object.keys(registro)) if (!(k in out)) out[k] = registro[k];
  return out;
}

export function agregarRegistro(filas, registro) {
  const id = nuevoId(filas);
  return { filas: [...filas, ordenar(filas[0], { id, ...registro })], id };
}
export function reemplazarRegistro(filas, id, registro) {
  return filas.map((f) => (String(f.id) === String(id) ? ordenar(f, { ...f, ...registro, id: f.id }) : f));
}
export function quitarRegistro(filas, id) {
  return filas.filter((f) => String(f.id) !== String(id));
}

// ------------------------------------------------------------------ guardar en el servidor

/**
 * Publica el catálogo editado. Antes comprueba que el servidor no haya cambiado mientras se editaba (otro administrador,
 * u otra pestaña): si cambió, no guarda y pide volver a abrir la pantalla (sincroniza para que la próxima ya esté al día).
 */
export async function guardarCatalogo(nombre, filas, cambio) {
  const backend = await obtenerBackend();
  if (!backend) throw new Error("El servicio de acceso no está disponible.");
  if (navigator.onLine === false) throw new Error("Necesitas conexión a internet para guardar.");
  const meta = ((await lectorActivo().indice()) || {})[nombre] || null;
  const local = infoCopia(nombre);
  if (meta && local?.version !== meta.version) {
    const { actualizados } = await sincronizarCatalogos();
    actualizados.forEach(olvidarDato);
    throw new Error("El catálogo cambió en el servidor mientras editabas. Vuelve a abrir la pantalla (ya quedó al día) y repite el cambio.");
  }
  const huellaFabrica = meta ? meta.huellaFabrica : await huella((await cargarFabrica(nombre)).datos);
  const sinHistorial = !!CATALOGOS_EDITABLES.find((c) => c.nombre === nombre)?.sinHistorial;
  await backend.publicarCatalogo(nombre, { datos: textoCompacto(filas), huellaFabrica, cambio, sinHistorial });
  const { actualizados } = await sincronizarCatalogos();
  actualizados.forEach(olvidarDato);
  olvidarDato(nombre);
}

/** Filas actuales del catálogo con `id` (las mismas que muestra la pantalla). */
export const filasConId = conIdSiFalta;

// ------------------------------------------------------------------ formulario

/**
 * Pinta el formulario en `contenedor`. `alGuardar(registro)` debe publicar (lanza si falla); `alCancelar()` vuelve atrás.
 * `confirmar` se puede reemplazar en las pruebas.
 */
export function abrirEditor(contenedor, { titulo, esquema, valores = {}, textoConfirmar, alGuardar, alCancelar, confirmar = (t) => confirm(t) }) {
  const valorTexto = (v) => (vacio(v) ? "" : String(v));
  const campo = (c) => {
    const id = `ed-${c.key}`;
    const comun = `id="${id}" name="${escapeHtml(c.key)}"${c.requerido ? " required" : ""}`;
    const control =
      c.tipo === "largo"
        ? `<textarea ${comun} rows="${c.key === "resumen" ? 14 : 3}">${escapeHtml(valorTexto(valores[c.key]))}</textarea>`
        : `<input type="text" ${comun}${c.tipo === "numero" ? ' inputmode="decimal"' : ""} value="${escapeHtml(valorTexto(valores[c.key]))}" autocomplete="off">`;
    return `<div class="field${c.tipo === "largo" ? " ed-ancho" : ""}"><label for="${id}">${escapeHtml(c.label)}${c.requerido ? "" : ' <span class="text-muted text-sm">(opcional)</span>'}</label>${control}<p class="ed-error" data-error="${escapeHtml(c.key)}" hidden></p></div>`;
  };
  contenedor.innerHTML = `
    <form class="card tarjeta-borde form-section ed-form" novalidate>
      <div class="form-section-title">${icon("pencil")} ${escapeHtml(titulo)}</div>
      <div class="grid-2">${esquema.map(campo).join("")}</div>
      <div class="btn-row">
        <button type="submit" class="btn btn-primary">Guardar y publicar</button>
        <button type="button" class="btn" data-cancelar>Cancelar</button>
      </div>
      <div data-msg></div>
    </form>`;
  const form = contenedor.querySelector("form");
  const msg = form.querySelector("[data-msg]");
  form.querySelector("[data-cancelar]").addEventListener("click", () => alCancelar());
  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    const crudo = Object.fromEntries(esquema.map((c) => [c.key, form.elements[c.key].value]));
    const { registro, errores } = validarRegistro(esquema, crudo);
    for (const p of form.querySelectorAll("[data-error]")) {
      const t = errores[p.dataset.error];
      p.hidden = !t;
      p.textContent = t || "";
      form.elements[p.dataset.error].setAttribute("aria-invalid", t ? "true" : "false");
    }
    const primero = Object.keys(errores)[0];
    if (primero) {
      msg.innerHTML = `<div class="callout callout-warning" style="margin:var(--space-3) 0 0"><span>Revisa los datos marcados.</span></div>`;
      form.elements[primero].focus();
      return;
    }
    if (!confirmar(textoConfirmar)) return;
    const boton = form.querySelector('[type="submit"]');
    boton.disabled = true;
    boton.textContent = "Publicando…";
    msg.innerHTML = "";
    try {
      await alGuardar(registro);
    } catch (err) {
      msg.innerHTML = `<div class="callout callout-danger" style="margin:var(--space-3) 0 0"><span>No se pudo guardar: ${escapeHtml(err?.message || String(err))}</span></div>`;
      boton.disabled = false;
      boton.textContent = "Guardar y publicar";
    }
  });
  form.querySelector("input, textarea")?.focus();
  return form;
}

/** Botones de administrador (Editar / Eliminar, o Agregar) en una fila; devuelve el contenedor. */
export function botonesAdmin(botones) {
  const fila = document.createElement("div");
  fila.className = "btn-row ed-acciones";
  for (const b of botones) {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = `btn btn-con-icono${b.clase ? " " + b.clase : ""}`;
    btn.dataset.accion = b.accion;
    btn.innerHTML = `${icon(b.icono)} ${escapeHtml(b.texto)}`;
    btn.addEventListener("click", b.alHacer);
    fila.append(btn);
  }
  return fila;
}
