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
    <div class="table-wrap"><table class="pf-datos"><thead><tr><th>Catálogo</th><th>En el servidor</th><th>Datos de la app</th><th></th></tr></thead><tbody data-filas><tr><td colspan="4" class="text-muted">Consultando el servidor…</td></tr></tbody></table></div>
    <div class="btn-row"><button type="button" class="btn btn-primary" data-todos disabled>Publicar todos los de la app</button></div>
    <div data-msg></div>`;

  const $ = (s) => box.querySelector(s);
  const msg = $("[data-msg]");
  const aviso = (tipo, texto) => {
    msg.innerHTML = `<div class="callout callout-${tipo}" style="margin:var(--space-3) 0 0"><span>${escapeHtml(texto)}</span></div>`;
  };
  let indice = {};
  const fabrica = {}; // nombre -> { datos, huella }

  async function publicar(lista) {
    for (const c of lista) {
      const f = fabrica[c.nombre];
      await backend.publicarCatalogo(c.nombre, { datos: textoCompacto(f.datos), huellaFabrica: f.huella });
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
      const servidor = m ? `${escapeHtml(fecha(m.fecha) || "Publicado")}${m.actualizadoPor ? ` · ${escapeHtml(m.actualizadoPor)}` : ""}` : `<span class="text-muted">No publicado</span>`;
      const estado = !m ? "—" : m.huellaFabrica === fabrica[c.nombre].huella ? "Iguales a lo publicado" : `<span class="badge badge-warning">Cambiaron desde la última publicación</span>`;
      return `<tr data-cat="${c.nombre}"><td>${escapeHtml(c.titulo)}</td><td>${servidor}</td><td>${estado}</td>
        <td style="text-align:right"><button type="button" class="btn btn-sm" data-publicar="${c.nombre}">${m ? "Publicar de nuevo" : "Publicar"}</button></td></tr>`;
    }).join("");
    $("[data-todos]").disabled = false;
    for (const b of box.querySelectorAll("[data-publicar]")) {
      b.addEventListener("click", () => {
        const c = CATALOGOS_EDITABLES.find((x) => x.nombre === b.dataset.publicar);
        const texto = indice[c.nombre]
          ? `¿Reemplazar el catálogo «${c.titulo}» del servidor por el que trae la app? Todos los usuarios lo recibirán al abrir la app.`
          : `¿Publicar en el servidor el catálogo «${c.titulo}» que trae la app?`;
        if (confirmar(texto)) ejecutar([c], b);
      });
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
      ? "¿Publicar los 5 catálogos que trae la app? Los que ya están en el servidor se reemplazan, y todos los usuarios los recibirán al abrir la app."
      : "¿Publicar en el servidor los 5 catálogos que trae la app?";
    if (confirmar(texto)) ejecutar(CATALOGOS_EDITABLES, e.currentTarget);
  });

  pintar();
}
