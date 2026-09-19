// Dictado por voz para los cuadros de texto de las funciones de IA.
// Usa la Web Speech API del navegador (sin dependencias ni clave). OJO: en Chrome/Edge el
// reconocimiento lo hace un servicio en la nube del navegador, asi que requiere internet y el
// audio sale del equipo (ver AVISO_PRIVACIDAD). El texto dictado se escribe en el mismo cuadro,
// en la posicion del cursor; se ve mientras se habla y queda editable.

import { icon } from "../icons.js";

const Reconocimiento = window.SpeechRecognition || window.webkitSpeechRecognition;

export const vozDisponible = () => !!Reconocimiento;

const IDIOMA = "es-CO";

const ERRORES = {
  "not-allowed": "El navegador no tiene permiso para usar el micrófono. Habilítalo en el candado de la barra de direcciones.",
  "service-not-allowed": "El navegador no tiene permiso para usar el micrófono. Habilítalo en el candado de la barra de direcciones.",
  "audio-capture": "No se encontró un micrófono disponible.",
  network: "No hay conexión con el servicio de reconocimiento de voz. Revisa tu internet.",
  "no-speech": "No se escuchó nada. Intenta de nuevo.",
  "language-not-supported": "Este navegador no soporta el dictado en español.",
};

/**
 * Agrega un boton "Dictar" antes de `anterior` (normalmente el boton de enviar) que escribe en `campo`.
 * Clic para empezar, clic para terminar. Devuelve el boton, o null si el navegador no soporta voz.
 * Detiene el dictado solo al pulsar `anterior`, al teclear en el campo o al cambiar de pantalla.
 */
export function agregarMicrofono(campo, anterior) {
  if (!Reconocimiento) return null;

  const boton = document.createElement("button");
  boton.type = "button";
  boton.className = "btn ia-mic";
  boton.setAttribute("aria-pressed", "false");
  const pintar = (activo) => {
    boton.setAttribute("aria-pressed", String(activo));
    boton.title = activo ? "Detener el dictado" : "Dictar con la voz: clic para empezar y clic para terminar";
    boton.innerHTML = `${icon("microphone")}<span>${activo ? "Detener" : "Dictar"}</span>`;
  };
  pintar(false);

  const estado = document.createElement("p");
  estado.className = "ia-voz-estado";
  estado.setAttribute("role", "status");
  anterior.parentElement.after(estado);
  const decir = (texto, error = false) => {
    estado.textContent = texto;
    estado.classList.toggle("ia-voz-estado--error", error);
  };

  let rec = null;
  let activo = false; // el usuario quiere seguir dictando
  let antes = ""; // texto del campo antes del punto donde se dicta
  let despues = ""; // texto del campo despues del punto donde se dicta
  let ultimoInicio = 0;

  // Junta lo dictado con el texto existente cuidando los espacios en los bordes.
  const componer = (dictado) => {
    const izq = antes && dictado && !/\s$/.test(antes) ? " " : "";
    const der = despues && dictado && !/^\s/.test(despues) ? " " : "";
    return { texto: antes + izq + dictado + der + despues, cursor: (antes + izq + dictado).length };
  };

  const escribir = (dictado) => {
    const { texto, cursor } = componer(dictado);
    campo.value = texto;
    campo.setSelectionRange(cursor, cursor);
    campo.dispatchEvent(new Event("input", { bubbles: true })); // p.ej. el contador de caracteres
  };

  // Toma el punto de insercion actual: el cursor, o el final si el campo no tiene foco/seleccion.
  const fijarPunto = () => {
    const ini = campo.selectionStart ?? campo.value.length;
    const fin = campo.selectionEnd ?? ini;
    antes = campo.value.slice(0, ini);
    despues = campo.value.slice(fin);
  };

  const limpiar = () => {
    activo = false;
    rec = null;
    pintar(false);
    window.removeEventListener("hashchange", detener);
    campo.removeEventListener("input", alTeclear);
  };

  function detener() {
    activo = false;
    rec?.abort();
    if (rec) limpiar();
    decir("");
  }

  // Un "input" propio (isTrusted=false) es el que dispara escribir(); uno real es el usuario tecleando.
  function alTeclear(e) {
    if (e.isTrusted) detener();
  }

  function iniciar() {
    const esta = new Reconocimiento();
    rec = esta;
    esta.lang = IDIOMA;
    esta.continuous = true;
    esta.interimResults = true;
    ultimoInicio = Date.now();

    let confirmado = "";
    // Los eventos tardios de una sesion ya cerrada (rec cambio o es null) se ignoran.
    esta.onresult = (e) => {
      if (rec !== esta) return;
      if (!campo.isConnected) return detener();
      let fijo = "";
      let provisional = "";
      for (let i = 0; i < e.results.length; i++) {
        const t = e.results[i][0].transcript;
        if (e.results[i].isFinal) fijo += t;
        else provisional += t;
      }
      confirmado = fijo;
      escribir((fijo + provisional).trim());
    };

    esta.onerror = (e) => {
      if (rec !== esta || e.error === "aborted") return;
      activo = false; // no se reintenta tras un error (permiso, red, silencio…)
      decir(ERRORES[e.error] || `Error de reconocimiento de voz (${e.error}).`, true);
    };

    esta.onend = () => {
      if (rec !== esta) return;
      if (!campo.isConnected) return limpiar();
      // El navegador corta la sesion cada cierto tiempo: si el usuario sigue dictando, se reanuda
      // desde donde quedo el texto (salvo que la sesion haya durado <1 s, para no entrar en bucle).
      if (activo && Date.now() - ultimoInicio > 1000) {
        const dictado = confirmado.trim();
        if (dictado) {
          const { texto, cursor } = componer(dictado);
          antes = texto.slice(0, cursor);
          despues = texto.slice(cursor);
        }
        try {
          iniciar();
          return;
        } catch {
          /* cae a limpiar() */
        }
      }
      const huboError = estado.classList.contains("ia-voz-estado--error");
      limpiar();
      if (!huboError) decir("");
    };

    esta.start();
  }

  boton.addEventListener("click", () => {
    if (activo) return detener();
    if (!navigator.onLine) return decir("El dictado por voz necesita conexión a internet.", true);
    fijarPunto();
    activo = true;
    decir("Escuchando… vuelve a presionar el micrófono para terminar.");
    try {
      iniciar();
    } catch (err) {
      activo = false;
      decir(`No se pudo iniciar el dictado: ${err.message || err}`, true);
      return;
    }
    pintar(true);
    window.addEventListener("hashchange", detener);
    campo.addEventListener("input", alTeclear);
  });

  // Al enviar, el texto provisional ya esta en el cuadro: solo se corta la escucha.
  anterior.addEventListener("click", () => activo && detener(), true);

  anterior.before(boton);
  return boton;
}
