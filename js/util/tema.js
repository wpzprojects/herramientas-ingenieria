// Color principal personal de cada tema (Perfil → Apariencia). Sin DOM en la parte de calculo (se prueba aparte).
//
// De UN color por tema (oscuro y claro) se derivan los demas tonos del acento: --accent-strong, --accent-soft, --accent-contrast,
// --focus-ring, y en cada tema los que dependen de el (claro: barra superior y encabezados de tabla; oscuro: fila sugerida).
// Los fondos, grises y colores de estado (exito, advertencia, error) NO cambian.
//
// LA DERIVACION ES RELATIVA A LA PALETA ACTUAL, no una formula independiente: cada tono derivado se mide, respecto al color base
// PREDETERMINADO, en el espacio OKLCH (luminosidad, saturacion, matiz) y se reaplica sobre el color elegido:
//   - tonos «rel» (p. ej. --accent-strong): misma DIFERENCIA de luminosidad que tiene hoy respecto al base;
//   - tonos «abs» (fondos suaves, encabezados de tabla): misma luminosidad absoluta de hoy;
//   - en todos: la misma PROPORCION de saturacion y la misma diferencia de matiz que hoy respecto al base.
// Asi, con el color predeterminado el resultado es EXACTAMENTE la paleta actual (lo comprueba tools/verify_tema.html, incluso con el
// atajo desactivado). Ademas, el color elegido se ajusta si el texto quedaria ilegible (contraste minimo WCAG 4.5:1).

export const CLAVE_COLORES = "tema.colores"; // { claro?: "#rrggbb", oscuro?: "#rrggbb" } (solo los que el usuario cambio)
export const CLAVE_CSS = "tema.css"; // CSS ya calculado: index.html lo aplica antes de dibujar (sin parpadeo)
export const ID_ESTILO = "tema-personal";

// ---------------------------------------------------------------- paleta actual (copia de css/tokens.css, la comprueba verify_tema.html)

export const PREDETERMINADO = {
  claro: {
    base: "#0e7c7b",
    // token: [color actual, modo]. «rel»: diferencia de luminosidad respecto al base; «abs»: luminosidad absoluta
    derivados: { "--accent-strong": ["#0a5f5e", "rel"], "--accent-soft": ["#e0f2f1", "abs"], "--thead-bg": ["#d6ecea", "abs"] },
    // tokens que valen lo mismo que otro (o que el base)
    iguales: { "--focus-ring": "base", "--topbar-bg": "--accent-strong", "--thead-fg": "--accent-strong" },
    fondoTexto: "#ffffff", // sobre el que se lee el acento como texto/enlace: el acento debe contrastar >= 4.5 con el
  },
  oscuro: {
    base: "#4c9eff",
    derivados: { "--accent-strong": ["#7ab6ff", "rel"], "--accent-soft": ["#26313f", "abs"], "--fila-sugerida": ["#344d6a", "abs"] },
    iguales: { "--focus-ring": "base" },
    fondoTexto: "#2b2b2b",
  },
};
export const TEXTO_SOBRE_ACENTO = ["#ffffff", "#06121f"]; // candidatos de --accent-contrast (el de mayor contraste con el acento)
const CONTRASTE_MINIMO = 4.5;

// ---------------------------------------------------------------- color: hex <-> sRGB <-> OKLab/OKLCH

const aLineal = (c) => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
const deLineal = (c) => (c <= 0.0031308 ? 12.92 * c : 1.055 * c ** (1 / 2.4) - 0.055);

export function hexARgb(hex) {
  const h = String(hex).trim().replace(/^#/, "");
  return [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16) / 255);
}
export const esHex = (s) => /^#[0-9a-f]{6}$/i.test(String(s).trim());

export function hexAOklch(hex) {
  const [r, g, b] = hexARgb(hex).map(aLineal);
  const l = Math.cbrt(0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b);
  const m = Math.cbrt(0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b);
  const s = Math.cbrt(0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b);
  const L = 0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s;
  const a = 1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s;
  const bb = 0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s;
  return { L, C: Math.hypot(a, bb), h: ((Math.atan2(bb, a) * 180) / Math.PI + 360) % 360 };
}

/** Componentes sRGB lineales (pueden salirse de 0..1) de un color OKLCH. */
function oklchALineal({ L, C, h }) {
  const a = C * Math.cos((h * Math.PI) / 180);
  const b = C * Math.sin((h * Math.PI) / 180);
  const l = (L + 0.3963377774 * a + 0.2158037573 * b) ** 3;
  const m = (L - 0.1055613458 * a - 0.0638541728 * b) ** 3;
  const s = (L - 0.0894841775 * a - 1.291485548 * b) ** 3;
  return [4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s, -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s, -0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s];
}
const enGama = (rgb) => rgb.every((c) => c >= -0.000001 && c <= 1.000001);

/** OKLCH -> "#rrggbb". Si se sale del gamut sRGB baja la saturacion (manteniendo luminosidad y matiz) hasta que quepa. */
export function oklchAHex({ L, C, h }) {
  const Lc = Math.min(Math.max(L, 0), 1);
  let lin = oklchALineal({ L: Lc, C, h });
  if (!enGama(lin)) {
    let lo = 0;
    let hi = C;
    for (let i = 0; i < 40; i++) {
      const mid = (lo + hi) / 2;
      if (enGama(oklchALineal({ L: Lc, C: mid, h }))) lo = mid;
      else hi = mid;
    }
    lin = oklchALineal({ L: Lc, C: lo, h });
  }
  return "#" + lin.map((c) => Math.round(Math.min(Math.max(deLineal(Math.min(Math.max(c, 0), 1)), 0), 1) * 255).toString(16).padStart(2, "0")).join("");
}

export function luminancia(hex) {
  const [r, g, b] = hexARgb(hex).map(aLineal);
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}
/** Contraste WCAG entre dos colores hex (1..21). */
export function contraste(a, b) {
  const [x, y] = [luminancia(a), luminancia(b)].sort((p, q) => q - p);
  return (x + 0.05) / (y + 0.05);
}

// ---------------------------------------------------------------- derivacion

const giro = (h) => ((h % 360) + 360) % 360;

/** El color elegido, ajustado (solo luminosidad) hasta que contraste >= 4.5 con el fondo sobre el que se lee. */
export function ajustarBase(tema, hex) {
  const cfg = PREDETERMINADO[tema];
  const pedido = String(hex).trim().toLowerCase();
  const { L, C, h } = hexAOklch(pedido);
  const ok = (Lx) => contraste(oklchAHex({ L: Lx, C, h }), cfg.fondoTexto) >= CONTRASTE_MINIMO;
  if (ok(L)) return { hex: pedido, ajustado: false };
  // claro: hay que oscurecer (bajar L); oscuro: hay que aclarar (subir L). Busqueda binaria del limite mas cercano.
  const sentido = tema === "claro" ? -1 : 1;
  let bueno = sentido === -1 ? 0 : 1; // extremo que siempre cumple
  let malo = L;
  for (let i = 0; i < 40; i++) {
    const mid = (bueno + malo) / 2;
    if (ok(mid)) bueno = mid;
    else malo = mid;
  }
  return { hex: oklchAHex({ L: bueno, C, h }), ajustado: true };
}

/**
 * Tonos derivados del color base de un tema.
 * @param {"claro"|"oscuro"} tema
 * @param {string} hex - color elegido
 * @param {{sinAtajo?: boolean}} [o] - sinAtajo: no devuelve la paleta guardada aunque el color sea el predeterminado (para probar la matematica)
 * @returns {{base:string, ajustado:boolean, tokens:Object<string,string>}}
 */
export function derivarTema(tema, hex, { sinAtajo = false } = {}) {
  const cfg = PREDETERMINADO[tema];
  const { hex: base, ajustado } = ajustarBase(tema, hex);
  const tokens = { "--accent": base };
  const esPred = base === cfg.base;
  const b0 = hexAOklch(cfg.base);
  const b1 = hexAOklch(base);

  for (const [nombre, [hex0, modo]] of Object.entries(cfg.derivados)) {
    if (esPred && !sinAtajo) {
      tokens[nombre] = hex0;
      continue;
    }
    const t0 = hexAOklch(hex0);
    tokens[nombre] = oklchAHex({
      L: modo === "rel" ? b1.L + (t0.L - b0.L) : t0.L,
      C: b1.C * (b0.C > 0 ? t0.C / b0.C : 0),
      h: giro(b1.h + (t0.h - b0.h)),
    });
  }
  tokens["--accent-contrast"] = contraste(base, TEXTO_SOBRE_ACENTO[0]) >= contraste(base, TEXTO_SOBRE_ACENTO[1]) ? TEXTO_SOBRE_ACENTO[0] : TEXTO_SOBRE_ACENTO[1];
  for (const [nombre, origen] of Object.entries(cfg.iguales)) tokens[nombre] = origen === "base" ? base : tokens[origen];
  return { base, ajustado, tokens };
}

/** Tonos predeterminados de un tema (la paleta actual, tal cual). */
export const tokensPredeterminados = (tema) => derivarTema(tema, PREDETERMINADO[tema].base).tokens;

// ---------------------------------------------------------------- CSS y almacenamiento

const SELECTORES = {
  // mas especificos que los de tokens.css (asi ganan aunque el <style> se cree antes que la hoja de estilos)
  claro: 'html:root[data-theme="light"], div.vista-tema[data-vista="light"]',
  oscuro: 'html:root[data-theme="dark"], div.vista-tema[data-vista="dark"]',
};

/** CSS con los tonos de los temas personalizados ("" si no hay ninguno). */
export function cssDeColores(colores) {
  const bloques = [];
  for (const tema of ["claro", "oscuro"]) {
    const hex = colores?.[tema];
    if (!esHex(hex)) continue;
    const { tokens } = derivarTema(tema, hex);
    bloques.push(`${SELECTORES[tema]} { ${Object.entries(tokens).map(([k, v]) => `${k}: ${v};`).join(" ")} }`);
  }
  return bloques.join("\n");
}

export function leerColores() {
  try {
    const c = JSON.parse(localStorage.getItem(CLAVE_COLORES) || "{}") || {};
    return { ...(esHex(c.claro) ? { claro: c.claro.toLowerCase() } : {}), ...(esHex(c.oscuro) ? { oscuro: c.oscuro.toLowerCase() } : {}) };
  } catch {
    return {};
  }
}

/** Guarda (o, con null, quita) el color de un tema, recalcula el CSS y lo aplica. Devuelve el color efectivo (tras el ajuste). */
export function guardarColor(tema, hex) {
  const colores = leerColores();
  let efectivo = PREDETERMINADO[tema].base;
  if (hex === null || (esHex(hex) && ajustarBase(tema, hex).hex === PREDETERMINADO[tema].base)) delete colores[tema]; // el predeterminado no se guarda
  else if (esHex(hex)) {
    efectivo = ajustarBase(tema, hex).hex;
    colores[tema] = efectivo;
  }
  try {
    if (Object.keys(colores).length) localStorage.setItem(CLAVE_COLORES, JSON.stringify(colores));
    else localStorage.removeItem(CLAVE_COLORES);
  } catch {
    /* sin storage: el cambio dura solo esta sesion */
  }
  aplicarTema(colores);
  return efectivo;
}

/** Pinta (o quita) el <style> de los colores personales y guarda su CSS para el proximo arranque. */
export function aplicarTema(colores = leerColores()) {
  const css = cssDeColores(colores);
  let estilo = document.getElementById(ID_ESTILO);
  if (css) {
    if (!estilo) {
      estilo = document.createElement("style");
      estilo.id = ID_ESTILO;
      document.head.append(estilo);
    }
    estilo.textContent = css;
  } else estilo?.remove();
  try {
    if (css) localStorage.setItem(CLAVE_CSS, css);
    else localStorage.removeItem(CLAVE_CSS);
  } catch {
    /* nada */
  }
  document.dispatchEvent(new CustomEvent("tema-personal"));
}

/** Color de la barra del navegador para un tema (el de la barra superior en claro, el gris de siempre en oscuro). */
export function colorMeta(tema) {
  if (tema === "dark") return "#1e1e1e";
  const c = leerColores().claro;
  return c ? derivarTema("claro", c).tokens["--topbar-bg"] : PREDETERMINADO.claro.derivados["--accent-strong"][0];
}
