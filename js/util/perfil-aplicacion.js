// Perfil > Aplicación: versión instalada, si la app ya funciona sin conexión y «Buscar actualización».
// La versión y el estado de la cache los responde el service worker (mensaje "estado" en sw.js). La vista la
// muestra a TODOS, también sin sesión: actualizar la app le sirve igual a un visitante.

import { icon } from "../icons.js";
import { escapeHtml } from "./format.js";
import { NOVEDADES } from "./novedades.js";
import { resumenOrigen } from "./catalogos-remotos.js";

const ESPERA_MS = 3000;
const fechaCorta = (iso) => new Date(`${iso}T12:00:00`).toLocaleDateString("es-CO", { dateStyle: "medium" });
const version = (v) => `
  <div class="pf-version">
    <p class="pf-version-cab"><strong>${escapeHtml(v.version)}</strong> <span class="text-muted text-sm">· ${escapeHtml(fechaCorta(v.fecha))}</span></p>
    <ul>${v.cambios.map((c) => `<li>${escapeHtml(c)}</li>`).join("")}</ul>
  </div>`;
const ESPERA_INSTALACION_MS = 60000;

/** Pregunta su estado a un service worker; null si no responde a tiempo. Con `completar`, el SW antes descarga los
 *  archivos que le falten (por eso espera más). */
export function consultarEstado(sw, { completar = false } = {}) {
  if (!sw) return Promise.resolve(null);
  return new Promise((resolve) => {
    const canal = new MessageChannel();
    const t = setTimeout(() => resolve(null), completar ? ESPERA_INSTALACION_MS : ESPERA_MS);
    canal.port1.onmessage = (e) => {
      clearTimeout(t);
      resolve(e.data || null);
    };
    sw.postMessage({ tipo: "estado", completar }, [canal.port2]);
  });
}

// Espera a que un service worker recién descargado quede activo (sw.js hace skipWaiting + clients.claim).
function esperarActivo(sw) {
  if (!sw || sw.state === "activated") return Promise.resolve(sw);
  return new Promise((resolve) => {
    const t = setTimeout(() => resolve(null), ESPERA_INSTALACION_MS);
    sw.addEventListener("statechange", () => {
      if (sw.state === "activated") {
        clearTimeout(t);
        resolve(sw);
      } else if (sw.state === "redundant") {
        clearTimeout(t);
        resolve(null);
      }
    });
  });
}

async function registro() {
  if (!("serviceWorker" in navigator)) return null;
  try {
    const tope = new Promise((r) => setTimeout(() => r(null), ESPERA_MS));
    return (await Promise.race([navigator.serviceWorker.getRegistration(), tope])) || null;
  } catch {
    return null;
  }
}

// `novedades`: solo el administrador ve la lista de novedades por versión (pedido del usuario).
export function pintarAplicacion(box, { novedades = false } = {}) {
  box.innerHTML = `
    <div class="form-section-title">${icon("deviceMobileCog")} Aplicación</div>
    <dl class="pf-lista">
      <dt>Versión instalada</dt><dd data-version>Consultando…</dd>
      <dt>Uso sin conexión</dt><dd data-offline>Consultando…</dd>
      <dt>Conexión</dt><dd data-red></dd>
      <dt>Catálogos</dt><dd data-catalogos></dd>
    </dl>
    <div class="btn-row"><button type="button" class="btn btn-primary btn-con-icono" data-buscar>${icon("refresh")} Buscar actualización</button></div>
    <div data-msg></div>
    ${
      novedades
        ? `<h3 class="pf-grupo">Novedades</h3>
    ${version(NOVEDADES[0])}
    <details class="pf-anteriores"><summary>Versiones anteriores</summary>${NOVEDADES.slice(1).map(version).join("")}</details>`
        : ""
    }`;

  const $ = (s) => box.querySelector(s);
  const btn = $("[data-buscar]");
  const msg = $("[data-msg]");
  const aviso = (tipo, html) => {
    msg.innerHTML = `<div class="callout callout-${tipo}" style="margin:var(--space-3) 0 0"><span>${html}</span></div>`;
  };

  const pintarRed = () => {
    $("[data-red]").textContent = navigator.onLine === false ? "Sin conexión a internet" : "En línea";
  };
  pintarRed();
  const o = resumenOrigen();
  $("[data-catalogos]").textContent = !o.deServidor
    ? "Los que trae la app (aún no se ha descargado una versión del servidor)."
    : `${o.deServidor === o.total ? "Del servidor" : `${o.deServidor} de ${o.total} del servidor; el resto, los que trae la app`}${o.ultimaFecha ? ` (actualizados el ${new Date(o.ultimaFecha).toLocaleDateString("es-CO", { dateStyle: "medium" })})` : ""}.`;
  window.addEventListener("online", pintarRed);
  window.addEventListener("offline", pintarRed);

  const pintarEstado = (e) => {
    if (!e) {
      $("[data-version]").textContent = "No disponible";
      $("[data-offline]").textContent = "No disponible en este navegador (la app no está instalada para usarse sin conexión).";
      return;
    }
    $("[data-version]").textContent = e.version;
    const cuales = (e.faltantes || []).slice(0, 5).join(", ") + ((e.faltantes || []).length > 5 ? "…" : "");
    $("[data-offline]").textContent = !e.faltan
      ? "Lista: todos los archivos de la app están guardados en este dispositivo."
      : navigator.onLine === false
        ? `Incompleto: faltan ${e.faltan} de ${e.total} archivos${cuales ? ` (${cuales})` : ""}. Se completa sola la próxima vez que abras esta pestaña con internet.`
        : `Incompleto: ${e.faltan === 1 ? "no se pudo" : "no se pudieron"} descargar ${e.faltan} de ${e.total} archivos${cuales ? ` (${cuales})` : ""}. Vuelve a abrir esta pestaña en un momento para reintentarlo.`;
  };

  let reg = null;
  (async () => {
    reg = await registro();
    // recién abierta la app el service worker puede estar registrándose o instalándose: se espera un poco a que quede activo
    if (!reg?.active && "serviceWorker" in navigator) {
      const listo = await Promise.race([navigator.serviceWorker.ready, new Promise((r) => setTimeout(() => r(null), 8000))]);
      if (listo) reg = listo;
    }
    // con internet, el SW descarga antes lo que le falte (así «Uso sin conexión» se repara solo)
    pintarEstado(await consultarEstado(reg?.active || navigator.serviceWorker?.controller, { completar: navigator.onLine !== false }));
  })();

  btn.addEventListener("click", async () => {
    msg.innerHTML = "";
    if (navigator.onLine === false) return aviso("warning", "Necesitas conexión a internet para buscar actualizaciones.");
    reg = reg || (await registro());
    if (!reg) return aviso("warning", "Este navegador no tiene la app instalada para usarse sin conexión, así que no hay nada que actualizar: siempre carga la versión publicada.");

    const rotulo = btn.innerHTML;
    btn.disabled = true;
    btn.textContent = "Buscando…";
    try {
      const antes = (await consultarEstado(reg.active))?.version;
      await reg.update();
      const nuevo = reg.installing || reg.waiting;
      if (!nuevo) {
        aviso("success", `Ya tienes la versión más reciente${antes ? ` (${escapeHtml(antes)})` : ""}.`);
        return;
      }
      btn.textContent = "Descargando la versión nueva…";
      const activo = await esperarActivo(nuevo);
      if (!activo) return aviso("danger", "No se pudo instalar la versión nueva. Inténtalo de nuevo más tarde.");
      const estado = await consultarEstado(activo);
      pintarEstado(estado);
      aviso("success", `Se instaló la versión ${escapeHtml(estado?.version || "nueva")}. Recarga para empezar a usarla. <button type="button" class="btn btn-sm btn-primary" data-recargar style="margin-left:var(--space-2)">Recargar ahora</button>`);
      msg.querySelector("[data-recargar]").addEventListener("click", () => location.reload());
    } catch (e) {
      aviso("danger", `No se pudo buscar la actualización: ${escapeHtml(e?.message || String(e))}`);
    } finally {
      btn.disabled = false;
      btn.innerHTML = rotulo;
    }
  });

  return () => {
    window.removeEventListener("online", pintarRed);
    window.removeEventListener("offline", pintarRed);
  };
}
