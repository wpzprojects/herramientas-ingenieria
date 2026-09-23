// Piezas de interfaz compartidas por los modulos de IA: instructivo para
// obtener la clave de cada proveedor, aviso de privacidad y "puerta" que
// verifica que haya clave y conexion antes de mostrar una herramienta.
//
// Multi-proveedor (2026-09-23): solo Gemini admite clave "personal"/
// "compartida" en el servidor (js/ai/clave.js); OpenAI y Claude son siempre
// clave local de este navegador (config.js), asi que verificarAcceso() se
// bifurca segun `PROVEEDORES[id].soportaFuenteServidor`.

import { escapeHtml } from "../util/format.js";
import { prepararClave, obtenerFuente, guardarFuente, ETIQUETA_FUENTE } from "./clave.js";
import { hayClave } from "./config.js";
import { PROVEEDORES, obtenerProveedorActivo } from "./proveedores.js";

const PASOS_INSTRUCTIVO = {
  gemini: {
    titulo: "Cómo obtener tu clave de API de Gemini",
    pasos: [
      `Abre <a href="${PROVEEDORES.gemini.urlClave}" target="_blank" rel="noopener noreferrer">Google AI Studio</a> e inicia sesión con una cuenta de Google.
       <span class="hint">Si tu cuenta corporativa no tiene acceso, usa una cuenta personal de Google.</span>`,
      "Pulsa el botón para <strong>crear una clave de API</strong> (Create API key) y elige o crea un proyecto.",
      "Copia la clave generada (suele empezar por <code>AIza…</code>).",
      "Vuelve a esta app: <strong>Funciones con IA → Configuración</strong>, pega la clave y pulsa <strong>Guardar</strong>. Luego <strong>Probar conexión</strong>.",
    ],
    avisoUso: "El plan gratuito tiene límites de uso por minuto y por día; es suficiente para uso personal. Si los superas, la app te avisará y bastará con esperar.",
  },
  openai: {
    titulo: "Cómo obtener tu clave de API de OpenAI",
    pasos: [
      `Abre <a href="${PROVEEDORES.openai.urlClave}" target="_blank" rel="noopener noreferrer">platform.openai.com/api-keys</a> e inicia sesión con tu cuenta de OpenAI.`,
      "Pulsa <strong>Create new secret key</strong> y elige un proyecto (o el que tengas por defecto).",
      "Copia la clave generada (empieza por <code>sk-…</code>): solo se muestra una vez.",
      "Vuelve a esta app: <strong>Funciones con IA → Configuración</strong>, pega la clave y pulsa <strong>Guardar</strong>. Luego <strong>Probar conexión</strong>.",
    ],
    avisoUso: "El uso de la API se cobra según el plan de tu cuenta de OpenAI (no es lo mismo que una suscripción a ChatGPT); revisa tu cupo y límites de gasto en la plataforma.",
  },
  anthropic: {
    titulo: "Cómo obtener tu clave de API de Claude (Anthropic)",
    pasos: [
      `Abre <a href="${PROVEEDORES.anthropic.urlClave}" target="_blank" rel="noopener noreferrer">console.anthropic.com</a> e inicia sesión con tu cuenta de Anthropic.`,
      "Entra a <strong>API Keys</strong> y pulsa <strong>Create Key</strong>.",
      "Copia la clave generada (empieza por <code>sk-ant-…</code>): solo se muestra una vez.",
      "Vuelve a esta app: <strong>Funciones con IA → Configuración</strong>, pega la clave y pulsa <strong>Guardar</strong>. Luego <strong>Probar conexión</strong>.",
    ],
    avisoUso: "El uso de la API se cobra según el plan de tu cuenta de Anthropic (no es lo mismo que una suscripción a Claude.ai); revisa tu cupo y límites de gasto en la consola.",
  },
};

function avisoPrivacidad(nombre) {
  return (
    `Lo que envíes a la IA se transmite a los servidores de ${nombre}. ` +
    "No pegues información confidencial de la empresa, datos personales ni datos de clientes. " +
    "Si usas el dictado por voz, el audio lo transcribe el servicio de reconocimiento de voz de tu navegador."
  );
}

export function htmlAvisoPrivacidad(proveedorId = obtenerProveedorActivo()) {
  return `<div class="callout callout-warning"><span><strong>Privacidad:</strong> ${avisoPrivacidad(PROVEEDORES[proveedorId].nombre)}</span></div>`;
}

/** Abre un <dialog> con el paso a paso para obtener la clave de API del proveedor indicado (por defecto, el activo). */
export function abrirInstructivo(proveedorId = obtenerProveedorActivo()) {
  const info = PASOS_INSTRUCTIVO[proveedorId] || PASOS_INSTRUCTIVO.gemini;
  let dlg = document.getElementById("ia-instructivo");
  if (dlg) dlg.remove(); // se reconstruye siempre: el proveedor puede haber cambiado desde la ultima apertura
  dlg = document.createElement("dialog");
  dlg.id = "ia-instructivo";
  dlg.className = "ia-dialog";
  dlg.innerHTML = `
    <div class="ia-dialog-head">
      <h2>${escapeHtml(info.titulo)}</h2>
      <button type="button" class="btn btn-ghost" data-cerrar aria-label="Cerrar">✕</button>
    </div>
    <ol class="ia-pasos">${info.pasos.map((p) => `<li>${p}</li>`).join("")}</ol>
    <div class="callout callout-info"><span>${escapeHtml(info.avisoUso)}</span></div>
    <div class="callout callout-warning"><span><strong>Cuida tu clave:</strong> es personal, no la compartas. Se guarda solo en este navegador y se envía únicamente a ${escapeHtml(
      PROVEEDORES[proveedorId].nombre
    )}. Puedes revocarla cuando quieras desde su consola.</span></div>
    ${htmlAvisoPrivacidad(proveedorId)}
    <div class="btn-row"><button type="button" class="btn btn-primary" data-cerrar>Entendido</button></div>`;
  dlg.addEventListener("click", (e) => {
    if (e.target === dlg || e.target.closest("[data-cerrar]")) dlg.close();
  });
  document.body.append(dlg);
  if (typeof dlg.showModal === "function") dlg.showModal();
  else dlg.setAttribute("open", "");
}

const TITULO_MOTIVO = {
  "sin-servicio": "Servicio de acceso no configurado",
  "sin-sesion": "Inicia sesión para usar la clave del servidor",
  "sin-acceso": "Sin acceso a la clave del servidor",
  "sin-clave-servidor": "Falta la clave en el servidor",
  error: "No se pudo obtener la clave del servidor",
};

/**
 * Verifica que se pueda usar la IA (hay conexion y una clave utilizable) con el proveedor
 * ACTIVO en Configuracion. Si no, dibuja un aviso en `container` y devuelve false; el llamador
 * debe detener su render. Si si, deja la clave lista (Gemini: `claveEnUso()`; los demas: usa
 * `obtenerClave(proveedor)` de config.js directamente). `reintentar` se invoca desde los
 * botones "Reintentar" y "Usar la clave de este navegador".
 */
export async function verificarAcceso(container, { reintentar } = {}) {
  const tarjeta = (html) => container.insertAdjacentHTML("beforeend", `<div class="card ia-gate">${html}</div>`);

  if (typeof navigator !== "undefined" && navigator.onLine === false) {
    tarjeta(`
        <h2>Sin conexión a internet</h2>
        <p class="text-muted">La IA necesita conexión. El resto de la aplicación sigue funcionando sin internet.</p>
        <div class="btn-row"><button type="button" class="btn btn-primary" data-reintentar>Reintentar</button></div>`);
    container.querySelector("[data-reintentar]").addEventListener("click", () => reintentar?.());
    return false;
  }

  const proveedor = obtenerProveedorActivo();
  const meta = PROVEEDORES[proveedor];

  if (!meta.soportaFuenteServidor) {
    if (hayClave(proveedor)) return true;
    tarjeta(`
        <h2>Falta tu clave de API de ${escapeHtml(meta.nombre)}</h2>
        <p class="text-muted">Para usar la IA con este proveedor necesitas tu propia clave. Se guarda solo en este navegador.</p>
        <div class="btn-row">
          <a class="btn btn-primary" href="#/ia/configuracion">Ir a Configuración</a>
          <button type="button" class="btn" data-instructivo>¿Cómo obtener mi clave?</button>
        </div>`);
    container.querySelector("[data-instructivo]").addEventListener("click", () => abrirInstructivo(proveedor));
    return false;
  }

  const r = await prepararClave();
  if (r.ok) return true;

  if (r.motivo === "sin-clave-local") {
    tarjeta(`
        <h2>Falta tu clave de API</h2>
        <p class="text-muted">Para usar la IA necesitas una clave gratuita de Google Gemini. Se guarda solo en este navegador.</p>
        <div class="btn-row">
          <a class="btn btn-primary" href="#/ia/configuracion">Ir a Configuración</a>
          <button type="button" class="btn" data-instructivo>¿Cómo obtener mi clave?</button>
        </div>`);
    container.querySelector("[data-instructivo]").addEventListener("click", () => abrirInstructivo("gemini"));
    return false;
  }

  tarjeta(`
        <h2>${escapeHtml(TITULO_MOTIVO[r.motivo] || TITULO_MOTIVO.error)}</h2>
        <p class="text-muted">Elegiste usar ${escapeHtml(ETIQUETA_FUENTE[obtenerFuente()])}. ${escapeHtml(r.mensaje)}</p>
        <div class="btn-row">
          <a class="btn btn-primary" href="#/perfil/clave">Ir a Perfil</a>
          <button type="button" class="btn" data-local>Usar la clave de este navegador</button>
          <button type="button" class="btn btn-ghost" data-reintentar>Reintentar</button>
        </div>`);
  container.querySelector("[data-local]").addEventListener("click", () => {
    guardarFuente("local");
    reintentar?.();
  });
  container.querySelector("[data-reintentar]").addEventListener("click", () => reintentar?.());
  return false;
}
