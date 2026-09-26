// Biblioteca técnica (Normatividad; 2026-09-26, pedido del usuario): «Fuente» y «Contenido» arriba y, debajo, el texto
// (si lo hay) en un recuadro y las imágenes (si las hay), cada una con su pie y ampliable al tocarla. Solo usuarios con
// acceso. El administrador agrega, edita y elimina registros; cada cambio se publica de inmediato para todos. Ver
// js/util/biblioteca.js (datos, imágenes y compresión). Reemplaza a «Zona de servidumbre» y «Enterramiento de ductos».
//
// Rutas: #/normatividad/biblioteca y #/normatividad/biblioteca/<id> (abre ese registro).

import { loadData, escapeHtml } from "../util/format.js";
import { icon } from "../icons.js";
import { markdownAHtml } from "../ai/markdown.js";
import { activarInfos } from "../util/info-campo.js";
import { revelar } from "../util/revelar.js";
import { ZOOM_INICIAL, zoomHtml, activarZoom } from "../util/zoom-imagen.js";
import { obtenerBackend } from "../auth/backend.js";
import { esAdministrador, agregarRegistro, reemplazarRegistro, quitarRegistro, guardarCatalogo } from "../util/edicion-catalogo.js";
import { CATALOGO, fuentesDe, urlDeImagen, comprimirImagen, nuevoIdImagen, guardarEnDispositivo, limpiarDispositivo, bytesDe } from "../util/biblioteca.js";

const AYUDA_TEXTO = "Opcional. Aparte de la norma, criterio o nota. Admite **negrilla** entre dos asteriscos dobles, viñetas empezando la línea con «- » y párrafos separados por una línea en blanco.";

export async function render(container, params = {}, { confirmar = (t) => confirm(t) } = {}) {
  let filas = await loadData(CATALOGO);
  const admin = esAdministrador();
  let actualId = params.id ?? null;

  container.innerHTML = `
    <div class="breadcrumb"><a href="#/">Inicio</a> <span>/</span> <a href="#/normatividad">Normatividad</a> <span>/</span> <span>Biblioteca técnica</span></div>
    <h1 class="page-title">Biblioteca técnica</h1>
    <div class="toolbar bib-toolbar">
      <div class="field bib-campo-fuente">
        <label for="bib-fuente">Fuente</label>
        <select id="bib-fuente"></select>
      </div>
      <div class="field bib-campo-contenido">
        <label for="bib-contenido">Contenido</label>
        <select id="bib-contenido"></select>
      </div>
      ${
        admin
          ? `<div class="btn-row ed-acciones">
              <button type="button" class="btn btn-con-icono" data-accion="agregar">${icon("plus")} Agregar</button>
              <button type="button" class="btn btn-con-icono" data-accion="editar">${icon("pencil")} Editar</button>
              <button type="button" class="btn btn-con-icono" data-accion="eliminar">${icon("trash")} Eliminar</button>
            </div>`
          : ""
      }
    </div>
    <div id="bib-msg"></div>
    <div id="bib-visor"></div>
    <div id="bib-editor"></div>
  `;

  const $ = (s) => container.querySelector(s);
  const selFuente = $("#bib-fuente");
  const selContenido = $("#bib-contenido");
  const visor = $("#bib-visor");
  const zonaEditor = $("#bib-editor");
  const toolbar = $(".bib-toolbar");
  const msg = $("#bib-msg");

  const aviso = (tipo, texto) => {
    msg.innerHTML = texto ? `<div class="callout callout-${tipo}" style="margin: 0 0 var(--space-4);"><span>${escapeHtml(texto)}</span></div>` : "";
  };
  const actual = () => filas.find((f) => String(f.id) === String(actualId)) || null;

  function pintarListas() {
    const fuentes = fuentesDe(filas);
    if (!actual()) actualId = filas[0]?.id ?? null;
    const reg = actual();
    selFuente.innerHTML = fuentes.map((f) => `<option value="${escapeHtml(f)}">${escapeHtml(f)}</option>`).join("");
    selFuente.value = reg?.fuente ?? "";
    const deFuente = filas.filter((f) => f.fuente === selFuente.value);
    selContenido.innerHTML = deFuente.map((f) => `<option value="${escapeHtml(String(f.id))}">${escapeHtml(f.titulo)}</option>`).join("");
    selContenido.value = reg ? String(reg.id) : "";
    selFuente.disabled = selContenido.disabled = !filas.length;
    container.querySelectorAll('[data-accion="editar"], [data-accion="eliminar"]').forEach((b) => (b.disabled = !reg));
  }

  let turno = 0; // para ignorar imágenes que llegan tarde de un registro que ya no se está viendo
  function pintarVisor() {
    const reg = actual();
    const miTurno = ++turno;
    if (!reg) {
      visor.innerHTML = `<div class="empty-state"><p>Aún no hay registros en la biblioteca.${admin ? " Usa «Agregar registro»." : ""}</p></div>`;
      return;
    }
    const imagenes = reg.imagenes || [];
    visor.innerHTML =
      (reg.texto ? `<div class="bib-texto">${markdownAHtml(reg.texto)}</div>` : "") +
      imagenes
        .map(
          (img, i) => `
        <figure class="bib-figura" data-i="${i}">
          <div class="zoom-cab">
            <figcaption class="section-title">${escapeHtml(img.pie || "")}</figcaption>
            ${zoomHtml(`la imagen ${i + 1}`)}
          </div>
          <div class="image-frame marco-zoom"><p class="text-muted text-sm bib-cargando">Cargando imagen…</p></div>
        </figure>`
        )
        .join("");
    imagenes.forEach(async (img, i) => {
      const url = await urlDeImagen(img);
      if (miTurno !== turno) return;
      const marco = visor.querySelector(`.bib-figura[data-i="${i}"] .image-frame`);
      if (!marco) return;
      marco.innerHTML = url
        ? `<img src="${escapeHtml(url)}" data-lightbox="${escapeHtml(url)}" alt="${escapeHtml(img.pie || reg.titulo)}" style="width:${ZOOM_INICIAL}%">`
        : `<p class="text-muted text-sm">No se pudo cargar la imagen. Revisa la conexión a internet (una vez vista, queda guardada en este dispositivo).</p>`;
    });
  }

  // Zoom de cada imagen (80 % al abrir; js/util/zoom-imagen.js)
  activarZoom(visor, (grupo, z) => {
    const imagen = grupo.closest(".bib-figura").querySelector(".marco-zoom img");
    if (imagen) imagen.style.width = `${z}%`;
  });

  function seleccionar(id) {
    actualId = id;
    pintarListas();
    pintarVisor();
    if (actualId != null) history.replaceState(null, "", `#/normatividad/biblioteca/${actualId}`);
  }

  selFuente.addEventListener("change", () => seleccionar(filas.find((f) => f.fuente === selFuente.value)?.id ?? null));
  selContenido.addEventListener("change", () => seleccionar(selContenido.value));

  pintarListas();
  pintarVisor();
  if (!admin) return;

  // ---------------------------------------------------------------- administrador
  const verVisor = (visible) => {
    toolbar.hidden = visor.hidden = !visible;
    if (visible) zonaEditor.innerHTML = "";
  };

  container.querySelector('[data-accion="agregar"]').addEventListener("click", () => abrirEditor(null));
  container.querySelector('[data-accion="editar"]').addEventListener("click", () => actual() && abrirEditor(actual()));
  container.querySelector('[data-accion="eliminar"]').addEventListener("click", async (e) => {
    const reg = actual();
    if (!reg || !confirmar(`¿Eliminar «${reg.titulo}» (${reg.fuente}) de la biblioteca? Se publica de inmediato para todos y no se guarda una copia: para recuperarlo habría que volver a cargarlo.`)) return;
    const boton = e.currentTarget;
    boton.disabled = true;
    try {
      await guardarCatalogo(CATALOGO, quitarRegistro(filas, reg.id), `Eliminó «${reg.titulo}»`);
      await borrarImagenesServidor((reg.imagenes || []).map((i) => i.id).filter(Boolean));
      filas = await loadData(CATALOGO);
      limpiarDispositivo(filas);
      aviso("success", `Se eliminó «${reg.titulo}».`);
      seleccionar(filas.find((f) => f.fuente === reg.fuente)?.id ?? filas[0]?.id ?? null);
    } catch (err) {
      aviso("danger", `No se pudo eliminar: ${err?.message || err}`);
    } finally {
      boton.disabled = !actual();
    }
  });

  async function borrarImagenesServidor(ids) {
    if (!ids.length) return;
    const backend = await obtenerBackend();
    for (const id of ids) {
      try {
        await backend?.eliminarImagenBiblioteca(id);
      } catch {
        /* si no se pudo borrar queda huérfana en el servidor: no afecta lo que se ve */
      }
    }
  }

  /**
   * Formulario de un registro (nuevo si `reg` es null). Las imágenes nuevas se reducen al elegirlas (se ve su vista previa
   * y su peso) y se suben al guardar; las que se quitan se borran del servidor después de publicar.
   */
  function abrirEditor(reg) {
    aviso(null, "");
    verVisor(false);
    const fuentes = fuentesDe(filas);
    // cada imagen del formulario: { src | id (existente) | datos, tipo (nueva), pie, url (vista previa) }
    const imagenes = (reg?.imagenes || []).map((i) => ({ ...i }));
    zonaEditor.innerHTML = `
      <form class="card tarjeta-borde form-section ed-form bib-form" novalidate>
        <div class="form-section-title">${icon("pencil")} ${reg ? `Editar «${escapeHtml(reg.titulo)}»` : "Agregar a la Biblioteca técnica"}</div>
        <div class="grid-2">
          <div class="field">
            <label for="bib-f-fuente" data-info="Norma, reglamento o entidad de donde sale el contenido (RETIE 2026, NTC 2050, CREG, criterio interno…). Elige una existente o escribe una nueva.">Fuente</label>
            <input type="text" id="bib-f-fuente" list="bib-lista-fuentes" value="${escapeHtml(reg?.fuente ?? "")}" autocomplete="off" required>
            <datalist id="bib-lista-fuentes">${fuentes.map((f) => `<option value="${escapeHtml(f)}"></option>`).join("")}</datalist>
            <p class="ed-error" data-error="fuente" hidden></p>
          </div>
          <div class="field">
            <label for="bib-f-titulo" data-info="Es el nombre que aparece en la lista «Contenido» (p. ej. «Tabla 3.10.1.a — Distancias mínimas…»).">Título</label>
            <input type="text" id="bib-f-titulo" value="${escapeHtml(reg?.titulo ?? "")}" autocomplete="off" maxlength="200" required>
            <p class="ed-error" data-error="titulo" hidden></p>
          </div>
        </div>
        <div class="field">
          <label for="bib-f-texto" data-info="${escapeHtml(AYUDA_TEXTO)}">Texto</label>
          <textarea id="bib-f-texto" rows="7">${escapeHtml(reg?.texto ?? "")}</textarea>
        </div>
        <div class="field">
          <label data-info="Opcional. Se pueden agregar varias; cada una se reduce al subirla (máx. 1600 px de lado) para que quepa en el servidor. El pie es el nombre que aparece encima de la imagen.">Imágenes</label>
          <ul class="bib-f-imagenes"></ul>
          <label class="btn btn-con-icono bib-f-subir">${icon("upload")} Agregar imágenes<input type="file" accept="image/*" multiple hidden></label>
          <p class="ed-error" data-error="contenido" hidden></p>
        </div>
        <div class="btn-row">
          <button type="submit" class="btn btn-primary">Guardar y publicar</button>
          <button type="button" class="btn" data-cancelar>Cancelar</button>
        </div>
        <div data-msg></div>
      </form>`;
    const form = zonaEditor.querySelector("form");
    const lista = form.querySelector(".bib-f-imagenes");
    const entradaArchivos = form.querySelector('input[type="file"]');
    const msgForm = form.querySelector("[data-msg]");
    activarInfos(form);

    async function pintarImagenesForm() {
      lista.innerHTML = imagenes
        .map(
          (img, i) => `
        <li class="bib-f-imagen" data-i="${i}">
          <div class="bib-f-mini"></div>
          <div class="field bib-f-pie">
            <label for="bib-f-pie-${i}">Pie de la imagen ${i + 1}${img.datos ? ` <span class="text-muted text-sm">· nueva, ${Math.round(bytesDe(img.datos) / 1024)} KB</span>` : ""}</label>
            <input type="text" id="bib-f-pie-${i}" data-pie="${i}" value="${escapeHtml(img.pie ?? "")}" maxlength="200" autocomplete="off">
          </div>
          <div class="bib-f-botones">
            <button type="button" class="btn btn-sm btn-ghost btn-icono" data-subir="${i}" aria-label="Subir la imagen ${i + 1}" title="Subir"${i === 0 ? " disabled" : ""}>${icon("chevronUp")}</button>
            <button type="button" class="btn btn-sm btn-ghost btn-icono" data-bajar="${i}" aria-label="Bajar la imagen ${i + 1}" title="Bajar"${i === imagenes.length - 1 ? " disabled" : ""}>${icon("chevronDown")}</button>
            <button type="button" class="btn btn-sm btn-ghost btn-icono" data-quitar="${i}" aria-label="Quitar la imagen ${i + 1}" title="Quitar">${icon("trash")}</button>
          </div>
        </li>`
        )
        .join("");
      for (const [i, img] of imagenes.entries()) {
        const url = img.datos || (await urlDeImagen(img));
        const mini = lista.querySelector(`.bib-f-imagen[data-i="${i}"] .bib-f-mini`);
        if (mini) mini.innerHTML = url ? `<img src="${escapeHtml(url)}" alt="">` : `<span class="text-muted text-sm">Sin vista previa</span>`;
      }
    }
    pintarImagenesForm();

    lista.addEventListener("input", (e) => {
      const i = e.target.dataset.pie;
      if (i !== undefined) imagenes[Number(i)].pie = e.target.value;
    });
    lista.addEventListener("click", (e) => {
      const b = e.target.closest("[data-subir], [data-bajar], [data-quitar]");
      if (!b) return;
      const i = Number(b.dataset.subir ?? b.dataset.bajar ?? b.dataset.quitar);
      if (b.dataset.quitar !== undefined) imagenes.splice(i, 1);
      else {
        const j = b.dataset.subir !== undefined ? i - 1 : i + 1;
        [imagenes[i], imagenes[j]] = [imagenes[j], imagenes[i]];
      }
      pintarImagenesForm();
    });
    entradaArchivos.addEventListener("change", async () => {
      const archivos = [...entradaArchivos.files];
      entradaArchivos.value = "";
      for (const archivo of archivos) {
        try {
          const r = await comprimirImagen(archivo);
          imagenes.push({ datos: r.datos, tipo: r.tipo, pie: archivo.name.replace(/\.[^.]+$/, "") });
        } catch (err) {
          msgForm.innerHTML = `<div class="callout callout-danger" style="margin:var(--space-3) 0 0"><span>${escapeHtml(`«${archivo.name}»: ${err?.message || err}`)}</span></div>`;
        }
      }
      await pintarImagenesForm();
      revelar(lista.lastElementChild);
    });

    form.querySelector("[data-cancelar]").addEventListener("click", () => {
      verVisor(true);
      pintarListas();
      pintarVisor();
    });

    form.addEventListener("submit", async (e) => {
      e.preventDefault();
      const fuente = form.querySelector("#bib-f-fuente").value.trim();
      const titulo = form.querySelector("#bib-f-titulo").value.trim();
      const texto = form.querySelector("#bib-f-texto").value.trim();
      const errores = {};
      if (!fuente) errores.fuente = "La fuente es obligatoria.";
      if (!titulo) errores.titulo = "El título es obligatorio.";
      else if (filas.some((f) => String(f.id) !== String(reg?.id) && f.fuente.trim().toLowerCase() === fuente.toLowerCase() && f.titulo.trim().toLowerCase() === titulo.toLowerCase())) errores.titulo = "Ya hay un registro con este título en esa fuente.";
      if (!texto && !imagenes.length) errores.contenido = "Escribe un texto o agrega al menos una imagen.";
      for (const p of form.querySelectorAll("[data-error]")) {
        p.hidden = !errores[p.dataset.error];
        p.textContent = errores[p.dataset.error] || "";
      }
      if (Object.keys(errores).length) {
        msgForm.innerHTML = `<div class="callout callout-warning" style="margin:var(--space-3) 0 0"><span>Revisa los datos marcados.</span></div>`;
        return;
      }
      if (!confirmar(reg ? `¿Guardar los cambios de «${titulo}»? Se publican de inmediato para todos los usuarios.` : `¿Agregar «${titulo}» a la biblioteca? Se publica de inmediato para todos los usuarios.`)) return;

      const boton = form.querySelector('[type="submit"]');
      boton.disabled = true;
      boton.textContent = "Publicando…";
      msgForm.innerHTML = "";
      const subidas = [];
      try {
        const backend = await obtenerBackend();
        if (!backend) throw new Error("El servicio de acceso no está disponible.");
        if (navigator.onLine === false) throw new Error("Necesitas conexión a internet para guardar.");
        // 1) las imágenes nuevas (cada una en su documento)
        const finales = [];
        for (const img of imagenes) {
          if (img.datos) {
            const id = nuevoIdImagen();
            await backend.subirImagenBiblioteca(id, { datos: img.datos, tipo: img.tipo });
            subidas.push(id);
            guardarEnDispositivo(id, img.datos);
            finales.push({ id, pie: (img.pie || "").trim() });
          } else finales.push(img.src ? { src: img.src, pie: (img.pie || "").trim() } : { id: img.id, pie: (img.pie || "").trim() });
        }
        // 2) la lista de registros
        const registro = { fuente, titulo, texto, imagenes: finales };
        let nuevoId = reg?.id;
        if (reg) filas = reemplazarRegistro(filas, reg.id, registro);
        else ({ filas, id: nuevoId } = agregarRegistro(filas, registro));
        await guardarCatalogo(CATALOGO, filas, reg ? `Editó «${titulo}»` : `Agregó «${titulo}»`);
        // 3) las imágenes que se quitaron del registro (sin versiones antiguas: se borran)
        const quedan = new Set(finales.map((i) => i.id).filter(Boolean));
        await borrarImagenesServidor((reg?.imagenes || []).map((i) => i.id).filter((id) => id && !quedan.has(id)));
        filas = await loadData(CATALOGO);
        limpiarDispositivo(filas);
        verVisor(true);
        aviso("success", reg ? `Se guardó «${titulo}».` : `Se agregó «${titulo}».`);
        seleccionar(nuevoId);
      } catch (err) {
        filas = await loadData(CATALOGO);
        await borrarImagenesServidor(subidas); // no quedan imágenes sueltas de un guardado que falló
        msgForm.innerHTML = `<div class="callout callout-danger" style="margin:var(--space-3) 0 0"><span>No se pudo guardar: ${escapeHtml(err?.message || String(err))}</span></div>`;
        boton.disabled = false;
        boton.textContent = "Guardar y publicar";
      }
    });
    form.querySelector("#bib-f-fuente").focus();
  }
}
