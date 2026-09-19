// Ayuda de un campo con un boton de informacion junto a su nombre, en vez de un texto fijo debajo del campo.
//
// Uso: en el HTML del campo se marca la etiqueta con el texto de ayuda:
//     <label for="f-n" data-info="Resistencia efectiva: R conductor / # conductores por fase.">Conductores por fase</label>
// y despues de pintar la pantalla se llama activarInfos(contenedor). Cada etiqueta con data-info recibe un boton «i» (icono
// info-circle) y, justo despues de la etiqueta, un cuadro pequeño (popover) con el texto. El cuadro no ocupa espacio en el
// formulario: flota ARRIBA de la etiqueta (asi no tapa el campo que se va a llenar) y, si arriba no cabe (borde de la ventana o
// barra superior fija), se voltea hacia abajo. Se abre al tocar/pulsar el boton y se cierra al tocar fuera, con Esc o al abrir otro.
// El boton es un <button> real (se llega con Tab) con aria-expanded/aria-controls. No usa `title`: no funciona en pantallas tactiles.

import { icon } from "../icons.js";

let contador = 0;
let eventosInstalados = false;

function cerrar(popover, { devolverFoco = false } = {}) {
  popover.hidden = true;
  const boton = document.querySelector(`[aria-controls="${popover.id}"]`);
  boton?.setAttribute("aria-expanded", "false");
  if (devolverFoco) boton?.focus();
}

function cerrarTodos(excepto = null) {
  for (const p of document.querySelectorAll(".info-popover:not([hidden])")) if (p !== excepto) cerrar(p);
}

/** Arriba por defecto; si el cuadro no cabe por encima (queda bajo la barra superior fija o fuera de la ventana) se pone abajo. */
function ubicar(popover) {
  popover.classList.remove("info-popover--abajo");
  const barra = parseFloat(getComputedStyle(document.documentElement).getPropertyValue("--topbar-h")) || 0;
  if (popover.getBoundingClientRect().top < barra + 8) popover.classList.add("info-popover--abajo");
}

// Los eventos van una sola vez en `document` (delegacion): sirven para todas las pantallas y para tarjetas creadas despues.
function instalarEventos() {
  if (eventosInstalados) return;
  eventosInstalados = true;
  const reubicar = () => {
    const abierto = document.querySelector(".info-popover:not([hidden])");
    if (abierto) ubicar(abierto);
  };
  window.addEventListener("scroll", reubicar, { passive: true, capture: true });
  window.addEventListener("resize", reubicar);
  document.addEventListener("click", (e) => {
    const boton = e.target.closest(".info-btn");
    if (boton) {
      const popover = document.getElementById(boton.getAttribute("aria-controls"));
      if (!popover) return;
      const abrir = popover.hidden;
      cerrarTodos(abrir ? popover : null);
      popover.hidden = !abrir;
      boton.setAttribute("aria-expanded", String(abrir));
      if (abrir) ubicar(popover); // hay que medirlo ya visible
      return;
    }
    if (!e.target.closest(".info-popover")) cerrarTodos();
  });
  document.addEventListener("keydown", (e) => {
    if (e.key !== "Escape") return;
    const abierto = document.querySelector(".info-popover:not([hidden])");
    if (abierto) cerrar(abierto, { devolverFoco: true });
  });
}

/** Agrega el boton «i» y su cuadro a cada <label data-info="..."> de `raiz` (es seguro llamarla mas de una vez). */
export function activarInfos(raiz) {
  instalarEventos();
  for (const label of raiz.querySelectorAll("label[data-info]")) {
    if (label.querySelector(".info-btn")) continue;
    const id = `info-${++contador}`;
    const nombre = label.textContent.replace(/\s+/g, " ").trim();
    const boton = document.createElement("button");
    boton.type = "button";
    boton.className = "info-btn";
    boton.setAttribute("aria-label", `Más información sobre ${nombre}`);
    boton.setAttribute("aria-expanded", "false");
    boton.setAttribute("aria-controls", id);
    boton.innerHTML = icon("infoCircle");
    label.append(boton);

    const popover = document.createElement("div");
    popover.id = id;
    popover.className = "info-popover";
    popover.hidden = true;
    popover.textContent = label.dataset.info;
    label.after(popover);
  }
}
