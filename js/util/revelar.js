// Transiciones al aparecer y desaparecer contenido (2026-09-26, pedido del usuario: los paneles y las tarjetas nuevas
// aparecían de golpe y el usuario podía no notarlo). Misma animación de las tarjetas plegables (js/util/tarjetas-plegables.js):
// la altura crece de 0 a la natural con la opacidad, en 220 ms, y lo de abajo se desliza. Con `resaltar`, además, el borde
// se ilumina con el color del tema y se apaga en 1.2 s (para las tarjetas nuevas: alternativa, tramo, opción, tipo).
//
//  - revelar(el, {resaltar})    el elemento ya está en la página y visible: lo anima desde altura 0.
//  - mostrar(el, visible)       cambia `hidden` con animación (al ocultar, `hidden` se pone al terminar).
//  - activarDetallesAnimados()  una sola vez (app.js): los <details> se abren y cierran con la misma animación
//                               (salvo los menús desplegables `.menu-mas`, que flotan sobre la página).
//
// Sin animación con `prefers-reduced-motion`, sin `element.animate`, con el elemento oculto o con `revelado.animar = false`.
// Con `animar = null` (lo normal) anima en la app pero NO en los arneses de tools/ (que fijan window.__BASE_PATH__): Edge
// sin pantalla no avanza las animaciones de forma fiable; tools/verify_tarjetas_plegables.html la prueba con `animar = true`.

export const revelado = { animar: null, duracion: 220, resaltado: 1200 };

const sinMovimiento = () => !!window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
const animacionActiva = () => revelado.animar ?? !window.__BASE_PATH__;
const puedeAnimar = (el) => animacionActiva() && typeof el.animate === "function" && !sinMovimiento() && el.getClientRects().length > 0;

function cortar(el) {
  el._revelar?.forEach((a) => a.cancel());
  el._revelar = null;
  el.style.overflow = el._overflow ?? "";
}

/** Altura, rellenos y márgenes verticales actuales del elemento (para animar desde/hacia ellos). */
function caja(el) {
  const cs = getComputedStyle(el);
  return {
    height: `${el.getBoundingClientRect().height}px`,
    paddingTop: cs.paddingTop,
    paddingBottom: cs.paddingBottom,
    marginTop: cs.marginTop,
    marginBottom: cs.marginBottom,
  };
}
const CERO = { height: "0px", paddingTop: "0px", paddingBottom: "0px", marginTop: "0px", marginBottom: "0px" };

function animarAltura(el, desde, hasta, alTerminar) {
  el._overflow = el._overflow ?? el.style.overflow;
  el.style.overflow = "hidden";
  const a = el.animate([desde, hasta], { duration: revelado.duracion, easing: "ease" });
  el._revelar = [a];
  a.finished.then(
    () => {
      if (el._revelar?.[0] !== a) return;
      cortar(el);
      alTerminar?.();
    },
    () => {}
  );
  return a;
}

/** Resalta el borde de `el` con el color del tema y lo apaga poco a poco. */
export function resaltar(el) {
  if (!puedeAnimar(el)) return;
  const color = getComputedStyle(el).getPropertyValue("--accent").trim() || "#4c9eff";
  el.animate(
    [{ boxShadow: `0 0 0 3px ${color}` }, { boxShadow: `0 0 0 3px ${color}`, offset: 0.3 }, { boxShadow: "0 0 0 3px transparent" }],
    { duration: revelado.resaltado, easing: "ease-out" }
  );
}

/** Anima la aparición de `el` (ya visible en la página). En una fila de tabla solo se desvanece (su altura no se anima bien). */
export function revelar(el, { resaltar: conResaltado = false } = {}) {
  if (!el || !puedeAnimar(el)) return;
  cortar(el);
  if (el.tagName === "TR") {
    el.animate([{ opacity: 0 }, { opacity: 1 }], { duration: revelado.duracion, easing: "ease" });
  } else {
    const final = caja(el);
    animarAltura(el, { ...CERO, opacity: 0 }, { ...final, opacity: 1 });
  }
  if (conResaltado) resaltar(el);
}

/**
 * Muestra u oculta `el` (atributo `hidden`) con la animación. Si no se puede animar, cambia `hidden` al instante.
 * Al ocultar, `hidden` se pone cuando termina la animación (quien lo llame debe deshabilitar antes los campos que no deban
 * validarse). Otra llamada a mitad de camino interrumpe la anterior.
 */
export function mostrar(el, visible) {
  if (!el) return;
  const estabaOculto = el.hidden && !el._ocultando;
  if (visible) {
    const ocultando = el._ocultando;
    el._ocultando = false;
    if (!estabaOculto && !ocultando) return; // ya estaba a la vista
    el.hidden = false;
    if (ocultando) cortar(el);
    revelar(el);
    return;
  }
  if (estabaOculto || el._ocultando) return;
  if (!puedeAnimar(el)) {
    cortar(el);
    el.hidden = true;
    return;
  }
  cortar(el);
  el._ocultando = true;
  animarAltura(el, { ...caja(el), opacity: 1 }, { ...CERO, opacity: 0 }, () => {
    if (el._ocultando) el.hidden = true;
    el._ocultando = false;
  });
}

// ------------------------------------------------------------------ <details>

let detallesActivos = false;

/** Abre o cierra un <details> animando su altura (desde la del resumen hasta la natural, o al revés). */
export function alternarDetalles(d) {
  const resumen = d.querySelector(":scope > summary");
  if (!resumen || !puedeAnimar(d)) {
    d.open = !d.open;
    return;
  }
  const altoResumen = `${resumen.getBoundingClientRect().height}px`;
  const altoActual = `${d.getBoundingClientRect().height}px`;
  if (!d.open || d._cerrando) {
    const aMitad = !!d._revelar; // se estaba cerrando: parte de la altura que tenía en ese momento
    d._cerrando = false;
    cortar(d);
    d.open = true;
    animarAltura(d, { height: aMitad ? altoActual : altoResumen }, { height: `${d.getBoundingClientRect().height}px` });
  } else {
    cortar(d);
    d._cerrando = true;
    animarAltura(d, { height: altoActual }, { height: altoResumen }, () => {
      if (d._cerrando) d.open = false;
      d._cerrando = false;
    });
  }
}

/** Instala (una sola vez) la animación de todos los <details> de la app, salvo los menús desplegables. */
export function activarDetallesAnimados() {
  if (detallesActivos) return;
  detallesActivos = true;
  document.addEventListener("click", (e) => {
    const resumen = e.target.closest?.("details > summary");
    if (!resumen || e.defaultPrevented) return;
    const d = resumen.parentElement;
    if (d.matches(".menu-mas, .sin-animar") || resumen !== d.querySelector(":scope > summary")) return;
    if (!puedeAnimar(d)) return; // el navegador lo abre como siempre
    e.preventDefault();
    alternarDetalles(d);
  });
}
