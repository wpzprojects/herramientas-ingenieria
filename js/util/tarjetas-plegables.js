// Tarjetas plegables de las calculadoras: cada barra de titulo (.form-section-title) lleva al final un boton con un chevron
// que pliega o despliega SU tarjeta. Todas nacen abiertas. Solo el boton pliega (no la barra entera).
//
// Uso: despues de pintar la pantalla se llama activarPlegables(contenedor); tambien con cada tarjeta creada despues (tramos,
// opciones, tipos de conductor). Es seguro llamarla mas de una vez.
//
// Plegar solo OCULTA el contenido (CSS: .form-section.plegada): lo escrito en los campos se conserva y "Calcular" sigue
// tomando todos los datos. El estado vive en el DOM, asi que se mantiene al recalcular. Si al calcular falta un dato
// obligatorio dentro de una tarjeta plegada, esa tarjeta se despliega sola (el navegador no puede avisar de un campo oculto).
// «Agregar tramo/opcion» vive DENTRO de la ultima tarjeta y sigue a la vista aunque esta se pliegue (ver app.css).

import { icon } from "../icons.js";

let eventosListos = false;

function tituloDe(barra) {
  const texto = barra.cloneNode(true);
  texto.querySelectorAll("button, svg").forEach((n) => n.remove()); // queda solo el texto del titulo (sin «Quitar» ni iconos)
  return texto.textContent.replace(/\s+/g, " ").trim();
}

/** Pliega (`plegar` = true) o despliega la tarjeta y deja su boton al dia. */
export function plegarTarjeta(tarjeta, plegar) {
  const boton = tarjeta.querySelector(":scope > .form-section-title > .btn-plegar");
  tarjeta.classList.toggle("plegada", plegar);
  if (!boton) return;
  boton.setAttribute("aria-expanded", String(!plegar));
  const nombre = tituloDe(boton.parentElement);
  boton.setAttribute("aria-label", `${plegar ? "Desplegar" : "Plegar"} la tarjeta ${nombre}`);
}

function instalarEventos() {
  if (eventosListos) return;
  eventosListos = true;
  // Un campo obligatorio vacio dentro de una tarjeta plegada: se despliega para que el aviso del navegador pueda mostrarse.
  // «invalid» no burbujea: se escucha en captura y, como salta ANTES de que el navegador enfoque el campo, alcanza a mostrarlo.
  document.addEventListener(
    "invalid",
    (e) => {
      const tarjeta = e.target.closest?.(".form-section.plegada");
      if (tarjeta) plegarTarjeta(tarjeta, false);
    },
    true
  );
}

/** Agrega el boton de plegar a la barra de titulo de cada tarjeta (.form-section) de `raiz` que aun no lo tenga. */
export function activarPlegables(raiz) {
  instalarEventos();
  for (const barra of raiz.querySelectorAll(".form-section > .form-section-title")) {
    if (barra.querySelector(":scope > .btn-plegar")) continue;
    const boton = document.createElement("button");
    boton.type = "button";
    boton.className = "btn-plegar";
    boton.innerHTML = icon("chevronUp");
    barra.append(boton);
    plegarTarjeta(barra.parentElement, barra.parentElement.classList.contains("plegada"));
    boton.addEventListener("click", () => {
      const tarjeta = barra.parentElement;
      plegarTarjeta(tarjeta, !tarjeta.classList.contains("plegada"));
    });
  }
}
