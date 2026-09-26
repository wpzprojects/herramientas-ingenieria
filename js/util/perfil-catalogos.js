// Perfil > Catálogos (solo administrador): qué catálogos están publicados en el servidor, si los de fábrica cambiaron
// desde la última publicación, y «Publicar» (sube el de fábrica y reemplaza el del servidor; en la fase 1 hace también
// de «Restablecer a los de fábrica»). Ver js/util/catalogos-remotos.js.

import { icon } from "../icons.js";
import { escapeHtml, olvidarDato } from "./format.js";
import { CATALOGOS_EDITABLES, cargarFabrica, huella, textoCompacto, lectorActivo, lectorDesdeMock, sincronizarCatalogos } from "./catalogos-remotos.js";

const fecha = (iso) => (iso ? new Date(iso).toLocaleString("es-CO", { dateStyle: "medium", timeStyle: "short" }) : "");

export function pintarCatalogosAdmin(box, backend, { confirmar = (t) => confirm(t) } = {}) {
  box.innerHTML = `
    <div class="form-section-title">${icon("book")} Catálogos en el servidor</div>
    <p class="text-muted text-sm" style="margin-top:0">Todos los usuarios (también los visitantes) reciben los catálogos publicados aquí la próxima vez que abren la app con internet. Si un catálogo no está publicado, se usa el que trae la app.</p>
    <div class="table-wrap"><table class="pf-datos pf-catalogos"><thead><tr><th>Catálogo</th><th>En el servidor</th><th>Datos de la app</th><th></th></tr></thead><tbody data-filas><tr><td colspan="4" class="text-muted">Consultando el servidor…</td></tr></tbody></table></div>
    <div class="btn-row"><button type="button" class="btn btn-primary" data-todos disabled>Publicar todos</button></div>
    <div data-msg></div>`;

  const $ = (s) => box.querySelector(s);
  const msg = $("[data-msg]");
  const aviso = (tipo, texto) => {
    msg.innerHTML = `<div class="callout callout-${tipo}" style="margin:var(--space-3) 0 0"><span>${escapeHtml(texto)}</span></div>`;
  };
  let indice = {};
  const abiertos = new Set(); // historiales desplegados (se conservan al volver a pintar)
  const fabrica = {}; // nombre -> { datos, huella }

  async function publicar(lista) {
    for (const c of lista) {
      const f = fabrica[c.nombre];
      await backend.publicarCatalogo(c.nombre, { datos: textoCompacto(f.datos), huellaFabrica: f.huella, cambio: "Publicó los datos que trae la app" });
    }
    const { actualizados } = await sincronizarCatalogos(); // la copia de este dispositivo también queda al día
    actualizados.forEach(olvidarDato);
  }

  async function pintar() {
    try {
      // con el backend simulado de las pruebas se lee lo publicado en él (nunca el servidor real)
      indice = (await (backend.esMock ? lectorDesdeMock(backend) : lectorActivo()).indice()) || {};
    } catch (e) {
      $("[data-filas]").innerHTML = `<tr><td colspan="4">No se pudo consultar el servidor: ${escapeHtml(e?.message || String(e))}</td></tr>`;
      return;
    }
    for (const c of CATALOGOS_EDITABLES) {
      if (!fabrica[c.nombre]) {
        const { datos } = await cargarFabrica(c.nombre);
        fabrica[c.nombre] = { datos, huella: await huella(datos) };
      }
    }
    $("[data-filas]").innerHTML = CATALOGOS_EDITABLES.map((c) => {
      const m = indice[c.nombre];
      const servidor = m
        ? `${escapeHtml(fecha(m.fecha) || "Publicado")}${m.actualizadoPor ? ` · ${escapeHtml(m.actualizadoPor)}` : ""}${m.cambio ? `<br><span class="text-muted text-sm">${escapeHtml(m.cambio)}</span>` : ""}`
        : `<span class="text-muted">No publicado</span>`;
      const estado = !m ? "—" : m.huellaFabrica === fabrica[c.nombre].huella ? "Sin cambios desde que se publicaron" : `<span class="badge badge-warning">Cambiaron desde la última publicación</span>`;
      // Historial: panel pegado a SU fila (sangría + línea de color), que se abre con el botón «Historial» de la fila
      const abierto = abiertos.has(c.nombre);
      const hist = m?.historial?.length
        ? `<tr class="pf-cat-historial" data-historial="${c.nombre}"${abierto ? "" : " hidden"}><td colspan="4"><div class="pf-hist-panel">
            <p class="pf-hist-titulo">${icon("history")} Historial de ${escapeHtml(c.titulo)} · ${m.historial.length} ${m.historial.length === 1 ? "versión" : "versiones"}</p>
            <ul class="pf-historial">${m.historial
              .map(
                (h) => `<li><span>${escapeHtml(fecha(h.fecha))}</span><span class="text-muted">${escapeHtml(h.actualizadoPor)}</span><span>${escapeHtml(h.cambio || "")}</span>${
                  h.version === m.version ? '<span class="badge">Actual</span>' : `<button type="button" class="btn btn-sm" data-restaurar="${c.nombre}" data-version="${h.version}" data-fecha="${escapeHtml(fecha(h.fecha))}">Volver a esta versión</button>`
                }</li>`
              )
              .join("")}</ul></div></td></tr>`
        : "";
      const botonHist = hist
        ? `<button type="button" class="btn btn-sm btn-con-icono" data-ver-historial="${c.nombre}" aria-expanded="${abierto}">Historial ${icon("chevronDown")}</button>`
        : "";
      return `<tr data-cat="${c.nombre}"${abierto ? ' class="abierto"' : ""}><td>${escapeHtml(c.titulo)}</td><td data-etiqueta="En el servidor">${servidor}</td><td data-etiqueta="Datos de la app">${estado}</td>
        <td><div class="pf-cat-acciones">${botonHist}<button type="button" class="btn btn-sm" data-publicar="${c.nombre}">${m ? "Publicar de nuevo" : "Publicar"}</button></div></td></tr>${hist}`;
    }).join("");
    for (const b of box.querySelectorAll("[data-ver-historial]")) {
      b.addEventListener("click", () => {
        const n = b.dataset.verHistorial;
        const abrir = !abiertos.has(n);
        abrir ? abiertos.add(n) : abiertos.delete(n);
        b.setAttribute("aria-expanded", String(abrir));
        box.querySelector(`[data-historial="${n}"]`).hidden = !abrir;
        box.querySelector(`[data-cat="${n}"]`).classList.toggle("abierto", abrir);
      });
    }
    for (const b of box.querySelectorAll("[data-restaurar]")) {
      b.addEventListener("click", () => {
        const c = CATALOGOS_EDITABLES.find((x) => x.nombre === b.dataset.restaurar);
        if (!confirmar(`¿Volver «${c.titulo}» a la versión del ${b.dataset.fecha}? Se publica de inmediato para todos; la versión actual queda en el historial.`)) return;
        restaurar(c, Number(b.dataset.version), b.dataset.fecha, b);
      });
    }
    $("[data-todos]").disabled = false;
    for (const b of box.querySelectorAll("[data-publicar]")) {
      b.addEventListener("click", () => {
        const c = CATALOGOS_EDITABLES.find((x) => x.nombre === b.dataset.publicar);
        const texto = indice[c.nombre]
          ? `¿Reemplazar el catálogo «${c.titulo}» del servidor por el que trae la app? Si se editó desde la app, esas ediciones se reemplazan (quedan en el historial). Todos los usuarios lo recibirán al abrir la app.`
          : `¿Publicar en el servidor el catálogo «${c.titulo}» que trae la app?`;
        if (confirmar(texto)) ejecutar([c], b);
      });
    }
  }

  async function restaurar(c, version, cuando, boton) {
    const botones = [...box.querySelectorAll("button")];
    botones.forEach((x) => (x.disabled = true));
    boton.textContent = "Restaurando…";
    try {
      const datos = await backend.leerVersionHistorial(c.nombre, version);
      if (typeof datos !== "string") throw new Error("esa versión ya no está en el historial.");
      await backend.publicarCatalogo(c.nombre, { datos, huellaFabrica: indice[c.nombre].huellaFabrica, cambio: `Volvió a la versión del ${cuando}` });
      const { actualizados } = await sincronizarCatalogos();
      actualizados.forEach(olvidarDato);
      aviso("success", `«${c.titulo}» volvió a la versión del ${cuando}.`);
    } catch (e) {
      aviso("danger", `No se pudo restaurar: ${e?.message || e}`);
    } finally {
      botones.forEach((x) => (x.disabled = false));
      await pintar();
    }
  }

  async function ejecutar(lista, boton) {
    if (navigator.onLine === false) return aviso("warning", "Necesitas conexión a internet para publicar.");
    const botones = [...box.querySelectorAll("button")];
    botones.forEach((x) => (x.disabled = true));
    const rotulo = boton.textContent;
    boton.textContent = "Publicando…";
    try {
      await publicar(lista);
      aviso("success", lista.length === 1 ? `Se publicó «${lista[0].titulo}».` : `Se publicaron los ${lista.length} catálogos.`);
    } catch (e) {
      aviso("danger", `No se pudo publicar: ${e?.message || e}`);
    } finally {
      boton.textContent = rotulo;
      botones.forEach((x) => (x.disabled = false));
      await pintar();
    }
  }

  $("[data-todos]").addEventListener("click", (e) => {
    const hay = CATALOGOS_EDITABLES.some((c) => indice[c.nombre]);
    const texto = hay
      ? `¿Publicar los ${CATALOGOS_EDITABLES.length} catálogos que trae la app? Los que ya están en el servidor se reemplazan (también las ediciones hechas desde la app, que quedan en el historial), y todos los usuarios los recibirán al abrir la app.`
      : `¿Publicar en el servidor los ${CATALOGOS_EDITABLES.length} catálogos que trae la app?`;
    if (confirmar(texto)) ejecutar(CATALOGOS_EDITABLES, e.currentTarget);
  });

  pintar();
}
