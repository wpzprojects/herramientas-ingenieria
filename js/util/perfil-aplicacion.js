// Perfil > Aplicación: versión instalada, si la app ya funciona sin conexión y «Buscar actualización».
// La versión y el estado de la cache los responde el service worker (mensaje "estado" en sw.js). La vista la
// muestra a TODOS, también sin sesión: actualizar la app le sirve igual a un visitante.

import { icon } from "../icons.js";
import { escapeHtml } from "./format.js";

const ESPERA_MS = 3000;
const ESPERA_INSTALACION_MS = 60000;

/** Pregunta su estado a un service worker; null si no responde a tiempo. */
export function consultarEstado(sw) {
  if (!sw) return Promise.resolve(null);
  return new Promise((resolve) => {
    const canal = new MessageChannel();
    const t = setTimeout(() => resolve(null), ESPERA_MS);
    canal.port1.onmessage = (e) => {
      clearTimeout(t);
      resolve(e.data || null);
    };
    sw.postMessage({ tipo: "estado" }, [canal.port2]);
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

export function pintarAplicacion(box) {
  box.innerHTML = `
    <div class="form-section-title">${icon("deviceMobileCog")} Aplicación</div>
    <dl class="pf-lista">
      <dt>Versión instalada</dt><dd data-version>Consultando…</dd>
      <dt>Uso sin conexión</dt><dd data-offline>Consultando…</dd>
      <dt>Conexión</dt><dd data-red></dd>
    </dl>
    <div class="btn-row"><button type="button" class="btn btn-primary btn-con-icono" data-buscar>${icon("refresh")} Buscar actualización</button></div>
    <div data-msg></div>`;

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
  window.addEventListener("online", pintarRed);
  window.addEventListener("offline", pintarRed);

  const pintarEstado = (e) => {
    if (!e) {
      $("[data-version]").textContent = "No disponible";
      $("[data-offline]").textContent = "No disponible en este navegador (la app no está instalada para usarse sin conexión).";
      return;
    }
    $("[data-version]").textContent = e.version;
    $("[data-offline]").textContent = e.faltan
      ? `Incompleto: faltan ${e.faltan} de ${e.total} archivos. Abre la app con internet para completarlo.`
      : `Lista: los ${e.total} archivos de la app están guardados en este dispositivo.`;
  };

  let reg = null;
  (async () => {
    reg = await registro();
    // recién abierta la app el service worker puede estar registrándose o instalándose: se espera un poco a que quede activo
    if (!reg?.active && "serviceWorker" in navigator) {
      const listo = await Promise.race([navigator.serviceWorker.ready, new Promise((r) => setTimeout(() => r(null), 8000))]);
      if (listo) reg = listo;
    }
    pintarEstado(await consultarEstado(reg?.active || navigator.serviceWorker?.controller));
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
