// Carga perezosa de KaTeX (vendor/katex, copia local: la app funciona sin internet). Solo se descarga al abrir
// una pestaña que muestre formulas; despues queda disponible el global `katex`.

let cargando = null;

/** @returns {Promise<object>} el objeto global katex; rechaza si no se pudo cargar (p. ej. archivo no disponible). */
export function cargarKatex() {
  if (window.katex) return Promise.resolve(window.katex);
  if (cargando) return cargando;
  const base = window.__BASE_PATH__ || "";
  cargando = new Promise((resolve, reject) => {
    const css = document.createElement("link");
    css.rel = "stylesheet";
    css.href = `${base}vendor/katex/katex.min.css`;
    document.head.append(css);
    const js = document.createElement("script");
    js.src = `${base}vendor/katex/katex.min.js`;
    js.onload = () => resolve(window.katex);
    js.onerror = () => {
      cargando = null;
      css.remove();
      js.remove();
      reject(new Error("No se pudo cargar KaTeX"));
    };
    document.head.append(js);
  });
  return cargando;
}

/** Ecuacion en modo "display" como HTML. Una expresion invalida no lanza error: KaTeX la muestra como texto en rojo. */
export function ecuacionHtml(katex, tex) {
  return katex.renderToString(tex, { displayMode: true, throwOnError: false });
}
