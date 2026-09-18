// Piezas de interfaz compartidas por los modulos de IA: instructivo para
// obtener la clave de Gemini, aviso de privacidad y "puerta" que verifica
// que haya clave y conexion antes de mostrar una herramienta.

import { hayClave } from "./config.js";

export const URL_AI_STUDIO = "https://aistudio.google.com/apikey";

export const AVISO_PRIVACIDAD =
  "Lo que envíes a la IA se transmite a los servidores de Google (Gemini). Con el plan gratuito, Google puede usar esas " +
  "conversaciones para mejorar sus productos. No pegues información confidencial de la empresa, datos personales ni datos de clientes.";

export function htmlAvisoPrivacidad() {
  return `<div class="callout callout-warning"><span><strong>Privacidad:</strong> ${AVISO_PRIVACIDAD}</span></div>`;
}

/** Abre un <dialog> con el paso a paso para obtener la clave de API. */
export function abrirInstructivo() {
  let dlg = document.getElementById("ia-instructivo");
  if (!dlg) {
    dlg = document.createElement("dialog");
    dlg.id = "ia-instructivo";
    dlg.className = "ia-dialog";
    dlg.innerHTML = `
      <div class="ia-dialog-head">
        <h2>Cómo obtener tu clave de API de Gemini</h2>
        <button type="button" class="btn btn-ghost" data-cerrar aria-label="Cerrar">✕</button>
      </div>
      <ol class="ia-pasos">
        <li>Abre <a href="${URL_AI_STUDIO}" target="_blank" rel="noopener noreferrer">Google AI Studio</a> e inicia sesión con una cuenta de Google.
          <span class="hint">Si tu cuenta corporativa no tiene acceso, usa una cuenta personal de Google.</span></li>
        <li>Pulsa el botón para <strong>crear una clave de API</strong> (Create API key) y elige o crea un proyecto.</li>
        <li>Copia la clave generada (suele empezar por <code>AIza…</code>).</li>
        <li>Vuelve a esta app: <strong>Inteligencia artificial → Configuración</strong>, pega la clave y pulsa <strong>Guardar</strong>. Luego <strong>Probar conexión</strong>.</li>
      </ol>
      <div class="callout callout-info"><span>El plan gratuito tiene límites de uso por minuto y por día; es suficiente para uso personal. Si los superas, la app te avisará y bastará con esperar.</span></div>
      <div class="callout callout-warning"><span><strong>Cuida tu clave:</strong> es personal, no la compartas. Se guarda solo en este navegador y se envía únicamente a Google. Puedes revocarla cuando quieras desde AI Studio.</span></div>
      ${htmlAvisoPrivacidad()}
      <div class="btn-row"><button type="button" class="btn btn-primary" data-cerrar>Entendido</button></div>`;
    dlg.addEventListener("click", (e) => {
      if (e.target === dlg || e.target.closest("[data-cerrar]")) dlg.close();
    });
    document.body.append(dlg);
  }
  if (typeof dlg.showModal === "function") dlg.showModal();
  else dlg.setAttribute("open", "");
}

/**
 * Verifica que se pueda usar la IA (hay clave y hay conexion). Si no, dibuja
 * un aviso en `container` y devuelve false; el llamador debe detener su render.
 * `reintentar` se invoca desde el boton "Reintentar" del aviso de conexion.
 */
export function verificarAcceso(container, { reintentar } = {}) {
  if (!hayClave()) {
    container.insertAdjacentHTML(
      "beforeend",
      `<div class="card ia-gate">
        <h2>Falta tu clave de API</h2>
        <p class="text-muted">Para usar la IA necesitas una clave gratuita de Google Gemini. Se guarda solo en este navegador.</p>
        <div class="btn-row">
          <a class="btn btn-primary" href="#/ia/configuracion">Ir a Configuración</a>
          <button type="button" class="btn" data-instructivo>¿Cómo obtener mi clave?</button>
        </div>
      </div>`
    );
    container.querySelector("[data-instructivo]").addEventListener("click", abrirInstructivo);
    return false;
  }
  if (typeof navigator !== "undefined" && navigator.onLine === false) {
    container.insertAdjacentHTML(
      "beforeend",
      `<div class="card ia-gate">
        <h2>Sin conexión a internet</h2>
        <p class="text-muted">La IA necesita conexión. El resto de la aplicación sigue funcionando sin internet.</p>
        <div class="btn-row"><button type="button" class="btn btn-primary" data-reintentar>Reintentar</button></div>
      </div>`
    );
    container.querySelector("[data-reintentar]").addEventListener("click", () => reintentar?.());
    return false;
  }
  return true;
}
