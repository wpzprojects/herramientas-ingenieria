// Tarjetas plegables: cada barra de titulo (.form-section-title) lleva al final un boton con un chevron
// que pliega o despliega SU tarjeta. Todas nacen abiertas. Solo el boton pliega (no la barra entera).
//
// Uso: despues de pintar la pantalla se llama activarPlegables(contenedor) (o con la tarjeta concreta: en las pantallas de IA solo
// se pliegan algunas); tambien con cada tarjeta creada despues (tramos, opciones, tipos de conductor). Es seguro llamarla mas de una vez.
//
// Al activarla, TODO lo que va bajo la barra se envuelve en un <div class="plegable-cuerpo"> (una sola vez). Plegar solo OCULTA ese cuerpo
// (CSS: .form-section.plegada): lo escrito en los campos se conserva y "Calcular" sigue tomando todos los datos. El estado vive en el DOM,
// asi que se mantiene al recalcular. Si al calcular falta un dato obligatorio dentro de una tarjeta plegada, esa tarjeta se despliega sola
// (el navegador no puede avisar de un campo oculto) y SIN animacion. «Agregar tramo/opcion/tipo» ya no vive en la tarjeta: va junto a «Calcular».
//
// Animacion (2026-09-21): al pulsar el boton el cuerpo se recoge hacia arriba / se despliega hacia abajo (altura + opacidad, el relleno
// inferior de la tarjeta y el margen inferior de la barra) con la Web Animations API (todos los navegadores actuales). Mientras dura, la tarjeta lleva la clase `animando`
// (el cuerpo sigue a la vista con overflow oculto); al terminar se quita y el CSS lo oculta. Se puede interrumpir con otro clic (parte de la
// altura actual). No anima con `prefers-reduced-motion`, si el navegador no tiene `element.animate`, ni con la tarjeta oculta.

import { icon } from "../icons.js";

/** Ajustes de la animacion. Las pruebas ponen `animar = false` (Edge sin pantalla no avanza las animaciones de forma fiable). */
export const plegado = { animar: true, duracion: 220 };

let eventosListos = false;

const cuerpoDe = (tarjeta) => tarjeta.querySelector(":scope > .plegable-cuerpo");
const sinMovimiento = () => !!window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;

function tituloDe(barra) {
  const texto = barra.cloneNode(true);
  texto.querySelectorAll("button, svg").forEach((n) => n.remove()); // queda solo el texto del titulo (sin «Quitar» ni iconos)
  return texto.textContent.replace(/\s+/g, " ").trim();
}

/** Corta cualquier animacion en curso y deja la tarjeta en su estado (plegada o no) sin la marca `animando`. */
function cortar(tarjeta) {
  tarjeta._animaciones?.forEach((a) => a.cancel());
  tarjeta._animaciones = null;
  tarjeta.classList.remove("animando");
}

/** Anima el cuerpo de la tarjeta desde su altura actual hasta la del estado destino (`plegar`). */
function animarPliegue(tarjeta, cuerpo, plegar) {
  // lo que se ve AHORA (si habia una animacion en curso, es el punto intermedio: se parte de ahi)
  const alto0 = cuerpo.getBoundingClientRect().height;
  const pad0 = getComputedStyle(tarjeta).paddingBottom;
  const opacidad0 = getComputedStyle(cuerpo).opacity;
  const barra = tarjeta.querySelector(":scope > .form-section-title");
  const margen0 = getComputedStyle(barra).marginBottom;
  cortar(tarjeta);

  tarjeta.classList.toggle("plegada", plegar);
  tarjeta.classList.add("animando"); // el cuerpo sigue a la vista mientras se anima
  const alto1 = plegar ? 0 : cuerpo.getBoundingClientRect().height; // al desplegar: la altura natural del contenido
  const pad1 = getComputedStyle(tarjeta).paddingBottom;
  const margen1 = getComputedStyle(barra).marginBottom;

  const opciones = { duration: plegado.duracion, easing: "ease", fill: "forwards" }; // «forwards»: sin un cuadro con el estado final antes de limpiar
  const aCuerpo = cuerpo.animate(
    [
      { height: `${alto0}px`, opacity: opacidad0 },
      { height: `${alto1}px`, opacity: plegar ? 0 : 1 },
    ],
    opciones
  );
  const aTarjeta = tarjeta.animate([{ paddingBottom: pad0 }, { paddingBottom: pad1 }], opciones);
  const aBarra = barra.animate([{ marginBottom: margen0 }, { marginBottom: margen1 }], opciones); // la barra pierde/recupera su margen inferior
  tarjeta._animaciones = [aCuerpo, aTarjeta, aBarra];
  // Se usa la promesa `finished` (no el evento `finish`, que solo se entrega en el siguiente cuadro de dibujo). Si otro clic la cancela, se ignora.
  aCuerpo.finished.then(
    () => {
      if (tarjeta._animaciones?.[0] === aCuerpo) cortar(tarjeta); // quita `animando` (el CSS oculta el cuerpo si quedo plegada) y suelta los valores retenidos, en el mismo instante
    },
    () => {}
  );
}

/**
 * Pliega (`plegar` = true) o despliega la tarjeta y deja su boton al dia.
 * `animado`: con el clic del boton; el despliegue automatico (dato faltante, aviso del reporte) es instantaneo.
 */
export function plegarTarjeta(tarjeta, plegar, { animado = false } = {}) {
  const boton = tarjeta.querySelector(":scope > .form-section-title > .btn-plegar");
  const cuerpo = cuerpoDe(tarjeta);
  const yaPlegada = tarjeta.classList.contains("plegada");
  const puedeAnimar = animado && plegado.animar && !!cuerpo && typeof cuerpo.animate === "function" && !sinMovimiento() && tarjeta.getClientRects().length > 0;

  if (puedeAnimar) {
    if (plegar !== yaPlegada) animarPliegue(tarjeta, cuerpo, plegar); // (mismo destino que el de la animacion en curso: no se hace nada)
  } else {
    cortar(tarjeta);
    tarjeta.classList.toggle("plegada", plegar);
  }

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

/** Envuelve todo lo que va bajo la barra en un solo cuerpo (para poder animar su altura). */
function envolver(tarjeta, barra) {
  if (cuerpoDe(tarjeta)) return;
  const cuerpo = document.createElement("div");
  cuerpo.className = "plegable-cuerpo";
  while (barra.nextSibling) cuerpo.append(barra.nextSibling);
  tarjeta.append(cuerpo);
}

/** Agrega el boton de plegar a la barra de titulo de cada tarjeta (.form-section) de `raiz` que aun no lo tenga. */
export function activarPlegables(raiz) {
  instalarEventos();
  for (const barra of raiz.querySelectorAll(".form-section > .form-section-title")) {
    if (barra.querySelector(":scope > .btn-plegar")) continue;
    envolver(barra.parentElement, barra);
    const boton = document.createElement("button");
    boton.type = "button";
    boton.className = "btn-plegar";
    boton.innerHTML = icon("chevronUp");
    barra.append(boton);
    plegarTarjeta(barra.parentElement, barra.parentElement.classList.contains("plegada"));
    boton.addEventListener("click", () => {
      const tarjeta = barra.parentElement;
      plegarTarjeta(tarjeta, !tarjeta.classList.contains("plegada"), { animado: true });
    });
  }
}
