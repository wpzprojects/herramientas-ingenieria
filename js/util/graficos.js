// Graficos SVG a medida (dibujados por codigo a partir de los datos del calculo). Sin librerias: salen vectoriales al imprimir y
// usan las variables de color del tema (claro, oscuro y la paleta personal). Devuelven una cadena <svg>…</svg>.
//
// - donaOcupacionSvg: dona de porcentaje con degradado, marca del limite y cifra al centro; debajo, «Total de conductores» y el limite.
// - corteDuctoSvg: corte transversal a ESCALA del ducto con sus conductores apoyados en el fondo (uno o varios tipos).
// - barraReferenciaSvg: barra vertical con las zonas Óptimo / Aceptable / Elevado y la marca del resultado (Pérdidas y Regulación).
// - curvaCargaSvg: % de pérdidas frente a la carga, en la unidad del dato de partida (Pérdidas).
// - perfilTensionSvg: tensión a lo largo de la línea, tramo por tramo (Regulación).
// - soportabilidadSvg y termometroFallaSvg (Cortocircuito); balanceTermicoSvg, curvasSvg y corteConductorSvg (Ampacidad
//   aérea); corteZanjaSvg y curvasSvg (Ampacidad subterránea). Todos con fondo SÓLIDO en el área del gráfico y el mismo alto
//   (ALTO_GRAFICO) para ir en pareja; las etiquetas de puntos van en recuadros para no tapar las líneas.

const COLORES_TIPO = ["var(--accent)", "var(--warning)", "var(--success)", "var(--text-muted)"];
const f1 = (x) => x.toFixed(1);
const polar = (cx, cy, r, grados) => [cx + r * Math.cos((grados * Math.PI) / 180), cy + r * Math.sin((grados * Math.PI) / 180)];

// ---------------------------------------------------------------- dona

/** Dona de ocupacion: `pct` (0-100+), `limite` (%) y `cumple`. Con pct > 100 el arco se llena y la cifra sigue diciendo el valor real. */
export function donaOcupacionSvg({ pct, limite, cumple, total }) {
  // mismo lienzo (380 x 450) y mismo centro que el corte transversal: las dos columnas miden lo mismo y el aro iguala al ducto
  const r = 150, cx = 190, cy = 190, ancho = 38, L = 2 * Math.PI * r;
  const lleno = (L * Math.min(Math.max(pct, 0), 100)) / 100;
  const col = cumple ? ["var(--accent)", "var(--accent-strong)"] : ["var(--danger)", "var(--danger)"];
  const grados = -90 + Math.min(limite, 100) * 3.6;
  const [tx1, ty1] = polar(cx, cy, r - ancho / 2 - 3, grados);
  const [tx2, ty2] = polar(cx, cy, r + ancho / 2 + 3, grados);
  const [lx, ly] = polar(cx, cy, r + ancho / 2 + 20, grados);
  return `<svg viewBox="0 0 380 450" role="img" aria-label="Ocupación ${f1(pct)} % con límite de ${limite} %${total != null ? ` y ${total} conductores` : ""}: ${cumple ? "cumple" : "no cumple"}">
    <defs>
      <linearGradient id="oc-dona-g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" style="stop-color:${col[0]}"/><stop offset="1" style="stop-color:${col[1]}"/></linearGradient>
      <filter id="oc-dona-sombra" x="-20%" y="-20%" width="140%" height="140%"><feDropShadow dx="0" dy="3" stdDeviation="4" flood-opacity=".25"/></filter>
    </defs>
    <circle cx="${cx}" cy="${cy}" r="${r}" fill="none" style="stroke:var(--border-strong)" stroke-width="${ancho}" opacity=".55"/>
    <circle class="oc-trazo" cx="${cx}" cy="${cy}" r="${r}" fill="none" stroke="url(#oc-dona-g)" stroke-width="${ancho}" stroke-linecap="round" stroke-dasharray="${lleno} ${L}" transform="rotate(-90 ${cx} ${cy})" filter="url(#oc-dona-sombra)" style="--largo:${lleno}"/>
    <line x1="${tx1}" y1="${ty1}" x2="${tx2}" y2="${ty2}" style="stroke:var(--text)" stroke-width="3.5" stroke-linecap="round"/>
    <text x="${lx}" y="${ly + 6}" text-anchor="middle" font-size="19" font-weight="700" style="fill:var(--text)">${limite} %</text>
    <text x="${cx}" y="${cy + 14}" text-anchor="middle" font-size="64" font-weight="800" style="fill:var(--text)">${f1(pct)}<tspan font-size="30" dy="-20">%</tspan></text>
    <text x="${cx}" y="${cy + 50}" text-anchor="middle" font-size="19" style="fill:var(--text-muted)">de ocupación</text>
    ${total != null ? `<text class="oc-total" x="${cx}" y="${cy + 170 + 24 + 27 - 10}" text-anchor="middle" font-size="17" style="fill:var(--text-muted)">Total de conductores: ${total}</text>` : ""}
    <text x="${cx}" y="${cy + 170 + 24 + 27 + (total != null ? 18 : 0)}" text-anchor="middle" font-size="17" style="fill:var(--text-muted)">Límite NTC-2050: ${limite} %</text>
  </svg>`;
}

// ---------------------------------------------------------------- corte transversal

/**
 * Los conductores «se asientan» en el fondo del ducto: relajacion simple con gravedad y choques (posiciones en mm, origen en el
 * centro del ducto, y hacia abajo). Devuelve [{ r, tipo, x, y }]. Si no caben, quedan encimados (se nota en el dibujo).
 * Un conductor MAS GRUESO que el ducto se dibuja con el diametro del ducto (ni mas ni menos): llena el ducto por completo.
 */
export function asentarConductores(diametroTuboMm, tipos) {
  const cs = [];
  tipos.forEach((t, k) => {
    for (let i = 0; i < t.cantidad; i++) cs.push({ r: Math.min(t.diametroMm, diametroTuboMm) / 2, tipo: k, x: 0, y: 0 });
  });
  const R = diametroTuboMm / 2;
  cs.forEach((c, i) => {
    c.x = ((i % 3) - 1) * c.r * 1.6;
    c.y = -R * 0.55 + Math.floor(i / 3) * c.r * 1.7;
  });
  for (let it = 0; it < 1000; it++) {
    const asentando = it < 900; // las ultimas pasadas solo resuelven choques (sin gravedad): dejan los conductores sin encimarse
    if (asentando) for (const c of cs) c.y += R * 0.004; // gravedad
    for (let p = 0; p < 4; p++) {
      for (let i = 0; i < cs.length; i++) {
        for (let j = i + 1; j < cs.length; j++) {
          const a = cs[i], b = cs[j];
          const dx = b.x - a.x, dy = b.y - a.y, dist = Math.hypot(dx, dy) || 0.001;
          const min = a.r + b.r;
          if (dist < min) {
            const s = (min - dist) / 2 / dist;
            a.x -= dx * s; a.y -= dy * s; b.x += dx * s; b.y += dy * s;
          }
        }
      }
      for (const c of cs) {
        const d = Math.hypot(c.x, c.y), max = R - c.r;
        if (d > max) { const f = max > 0 ? max / d : 0; c.x *= f; c.y *= f; } // si llena el ducto (max = 0) queda centrado
      }
    }
  }
  return cs;
}

/** Corte transversal a escala. `tipos`: [{ cantidad, diametroMm }] (uno por tipo de conductor). */
export function corteDuctoSvg({ diametroTuboMm, tipos }) {
  const validos = (tipos || []).filter((t) => t.cantidad > 0 && t.diametroMm > 0);
  if (!(diametroTuboMm > 0) || !validos.length) return "";
  const cx = 190, cy = 190, R = 170, esc = R / (diametroTuboMm / 2);
  const cs = asentarConductores(diametroTuboMm, validos);
  let cables = "";
  cs.forEach((c, i) => {
    const x = cx + c.x * esc, y = cy + c.y * esc, r = c.r * esc;
    cables += `<g class="oc-aparece" style="animation-delay:${i * 70}ms">
      <circle cx="${x}" cy="${y}" r="${r}" style="fill:${COLORES_TIPO[c.tipo % COLORES_TIPO.length]}" opacity=".92"/>
      <circle cx="${x}" cy="${y}" r="${r}" fill="url(#oc-brillo)"/>
      <circle cx="${x}" cy="${y}" r="${r * 0.78}" fill="#fff" opacity=".22"/>
      <circle cx="${x}" cy="${y}" r="${r * 0.5}" fill="url(#oc-metal)" stroke="rgba(0,0,0,.25)" stroke-width=".8"/>
    </g>`;
  });
  const yc = cy + R + 24;
  const total = validos.reduce((s, t) => s + t.cantidad, 0);
  const detalle = validos.map((t) => `${t.cantidad} × Ø${t.diametroMm} mm`).join(" + ");
  return `<svg viewBox="0 0 380 450" role="img" aria-label="Corte transversal del ducto de ${diametroTuboMm} mm con ${total} conductores (${detalle})">
    <defs>
      <radialGradient id="oc-brillo" cx=".32" cy=".28" r=".8"><stop offset="0" stop-color="#fff" stop-opacity=".55"/><stop offset=".45" stop-color="#fff" stop-opacity="0"/><stop offset="1" stop-color="#000" stop-opacity=".28"/></radialGradient>
      <radialGradient id="oc-metal" cx=".35" cy=".3" r=".9"><stop offset="0" stop-color="#f3f5f8"/><stop offset=".55" stop-color="#aab3bf"/><stop offset="1" stop-color="#6f7986"/></radialGradient>
      <radialGradient id="oc-interior" cx=".5" cy=".4" r=".75"><stop offset="0" style="stop-color:var(--bg-sunken)"/><stop offset="1" style="stop-color:var(--bg-sunken)" stop-opacity=".55"/></radialGradient>
    </defs>
    <circle cx="${cx}" cy="${cy}" r="${R + 9}" style="fill:var(--border-strong)" opacity=".55"/>
    <circle cx="${cx}" cy="${cy}" r="${R}" fill="url(#oc-interior)" style="stroke:var(--text-faint)" stroke-width="1.5"/>
    ${cables}
    <line x1="${cx - R}" y1="${yc}" x2="${cx + R}" y2="${yc}" style="stroke:var(--text-muted)" stroke-width="1.2"/>
    <line x1="${cx - R}" y1="${yc - 7}" x2="${cx - R}" y2="${yc + 7}" style="stroke:var(--text-muted)" stroke-width="1.2"/>
    <line x1="${cx + R}" y1="${yc - 7}" x2="${cx + R}" y2="${yc + 7}" style="stroke:var(--text-muted)" stroke-width="1.2"/>
    <text x="${cx}" y="${yc + 27}" text-anchor="middle" font-size="17" style="fill:var(--text-muted)">Ø interno ${f1(diametroTuboMm)} mm</text>
  </svg>`;
}

// ---------------------------------------------------------------- utilidades de ejes (Pérdidas, Regulación, Cortocircuito y Ampacidades)

/** Paso «redondo» (1, 2, 2.5 o 5 × 10ⁿ) para unas `n` divisiones entre 0 y `max`. */
function pasoRedondo(max, n = 4) {
  const bruto = max / n;
  const pot = Math.pow(10, Math.floor(Math.log10(bruto)));
  for (const m of [1, 2, 2.5, 5, 10]) if (m * pot >= bruto) return m * pot;
  return 10 * pot;
}
/** Número corto y legible para los ejes: 9.9 · 18 · 27.5 · 1,200. */
export function numEje(v) {
  const a = Math.abs(v);
  const dec = a === 0 ? 0 : a < 1 ? 2 : a < 10 ? (Number.isInteger(Math.round(v * 10) / 10) ? 0 : 1) : a < 100 ? (Number.isInteger(v) ? 0 : 1) : 0;
  return v.toLocaleString("en-US", { minimumFractionDigits: 0, maximumFractionDigits: dec });
}
const esc = (t) => String(t).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
const texto = (x, y, t, { tam = 13, color = "var(--text-muted)", ancla = "start", peso = 400 } = {}) =>
  `<text x="${f1(x)}" y="${f1(y)}" font-size="${tam}" font-weight="${peso}" text-anchor="${ancla}" style="fill:${color}">${esc(t)}</text>`;
const linea = (x1, y1, x2, y2, color, ancho = 1, guiones = "") =>
  `<line x1="${f1(x1)}" y1="${f1(y1)}" x2="${f1(x2)}" y2="${f1(y2)}" style="stroke:${color}" stroke-width="${ancho}"${guiones ? ` stroke-dasharray="${guiones}"` : ""}/>`;
/** Fondo SÓLIDO del área del gráfico (pedido del usuario): las zonas de color no se mezclan con el fondo del panel. */
const fondo = (x, y, w, h, r = 4) => `<rect x="${f1(x)}" y="${f1(y)}" width="${f1(w)}" height="${f1(h)}" rx="${r}" style="fill:var(--bg)"/>`;
/** Recuadro con texto (etiqueta que no debe tapar las líneas): fondo sólido y borde suave. */
function recuadro(x, y, lineas, { ancla = "start", tam = 12.5 } = {}) {
  const alto = lineas.length * (tam + 5) + 8;
  const ancho = Math.max(...lineas.map((l) => l.t.length)) * tam * 0.56 + 16;
  const x0 = ancla === "end" ? x - ancho : x;
  return (
    `<rect x="${f1(x0)}" y="${f1(y)}" width="${f1(ancho)}" height="${f1(alto)}" rx="5" style="fill:var(--bg-elevated);stroke:var(--border-strong)"/>` +
    lineas.map((l, i) => texto(x0 + 8, y + 6 + (i + 1) * (tam + 5) - 4, l.t, { tam: l.tam || tam, color: l.color || "var(--text)", peso: l.peso || 400 })).join("")
  );
}
/** Color SÓLIDO de una zona: el color del estado al 80 % sobre el fondo (pedido del usuario: solo 20 % de «transparencia»). */
const solido = (color, pct = 80) => `color-mix(in srgb, ${color} ${pct}%, var(--bg))`;
const envolver = (W, H, etiqueta, s) => `<svg viewBox="0 0 ${W} ${H}" role="img" aria-label="${esc(etiqueta)}">${s}</svg>`;
/** Los gráficos que van en pareja miden lo mismo de alto (380) para quedar parejos lado a lado. */
export const ALTO_GRAFICO = 380;

// ---------------------------------------------------------------- barra de referencia vertical

/**
 * Barra de referencia vertical (tipo «bullet graph» de Stephen Few, de pie como un termómetro): las zonas Óptimo /
 * Aceptable / Elevado de las referencias de diseño y la marca del resultado. `valor`, `optimo` y `aceptable` en %.
 */
export function barraReferenciaSvg({ valor, optimo, aceptable, etiqueta = "" }) {
  const W = 150, H = ALTO_GRAFICO, x0 = 58, ancho = 44, y0 = 34, y1 = 330;
  const ok = Number.isFinite(valor);
  const max = Math.max(aceptable * 5 / 3, ok ? valor * 1.15 : 0);
  const tope = Math.ceil(max / pasoRedondo(max, 5)) * pasoRedondo(max, 5);
  const Y = (v) => y1 - (Math.min(Math.max(v, 0), tope) / tope) * (y1 - y0);
  const zona = (desde, hasta, color) => `<rect x="${x0}" y="${f1(Y(hasta))}" width="${ancho}" height="${f1(Y(desde) - Y(hasta))}" style="fill:${color}" opacity=".42"/>`;
  let s = fondo(x0, y0, ancho, y1 - y0, 0) + zona(0, optimo, "var(--success)") + zona(optimo, aceptable, "var(--warning)") + zona(aceptable, tope, "var(--danger)");
  s += `<rect x="${x0}" y="${y0}" width="${ancho}" height="${y1 - y0}" rx="3" fill="none" style="stroke:var(--border-strong)"/>`;
  for (const v of [0, optimo, aceptable, tope]) s += linea(x0 - 5, Y(v), x0, Y(v), "var(--text-muted)") + texto(x0 - 9, Y(v) + 4.5, `${numEje(v)} %`, { ancla: "end" });
  if (ok) {
    const yv = Y(valor);
    s += `<rect class="oc-aparece" x="${x0 + ancho / 2 - 7}" y="${f1(yv)}" width="14" height="${f1(y1 - yv)}" rx="2" style="fill:var(--text)"/>`;
    s += linea(x0 - 6, yv, x0 + ancho + 6, yv, "var(--accent)", 4);
    s += texto(x0 + ancho / 2, y0 - 12, `${valor.toFixed(2)} %`, { tam: 17, color: "var(--text)", ancla: "middle", peso: 700 });
  }
  if (etiqueta) s += texto(x0 + ancho / 2, H - 14, etiqueta, { ancla: "middle", tam: 12.5 });
  return envolver(W, H, `${etiqueta}: ${ok ? valor.toFixed(2) : "—"} % (óptimo hasta ${optimo} %, aceptable hasta ${aceptable} %)`, s);
}

// ---------------------------------------------------------------- pérdidas frente a la carga

/**
 * El % de pérdidas frente a la carga, de 0 al doble de la actual, en la unidad del dato de partida (MW, MVA o A). A igual
 * tensión y FP el % de pérdidas crece en proporción a la carga (las pérdidas en kW, con su cuadrado): es una recta por el
 * origen que pasa por el punto de hoy. Marca dónde se llega al límite aceptable.
 */
export function curvaCargaSvg({ pct, carga, unidad, nombreEje, optimo, aceptable }) {
  const W = 460, H = ALTO_GRAFICO, m = { l: 52, r: 18, t: 22, b: 58 }, pw = W - m.l - m.r, ph = H - m.t - m.b;
  const xPaso = pasoRedondo(carga * 2, 4), xmax = Math.ceil((carga * 2) / xPaso) * xPaso;
  const yTope = Math.max(aceptable * 4 / 3, (pct * xmax) / carga);
  const yPaso = pasoRedondo(yTope, 4), ymax = Math.ceil(yTope / yPaso) * yPaso;
  const X = (v) => m.l + (v / xmax) * pw, Y = (v) => m.t + ph - (Math.min(v, ymax) / ymax) * ph;
  const zona = (a, b, color) => `<rect x="${m.l}" y="${f1(Y(b))}" width="${pw}" height="${f1(Y(a) - Y(b))}" style="fill:${solido(color)}"/>`;
  let s = fondo(m.l, m.t, pw, ph, 0) + zona(0, optimo, "var(--success)") + zona(optimo, aceptable, "var(--warning)") + zona(aceptable, ymax, "var(--danger)");
  for (let v = 0; v <= ymax + 1e-9; v += yPaso) s += linea(m.l, Y(v), m.l + pw, Y(v), "var(--border)") + texto(m.l - 7, Y(v) + 4.5, `${numEje(v)} %`, { ancla: "end", tam: 12 });
  for (let v = 0; v <= xmax + 1e-9; v += xPaso) s += linea(X(v), m.t + ph, X(v), m.t + ph + 5, "var(--text-muted)") + texto(X(v), m.t + ph + 20, numEje(v), { ancla: "middle", tam: 12 });
  s += texto(m.l + pw / 2, H - 12, `${nombreEje} (${unidad})`, { ancla: "middle", tam: 12.5 });
  // nombres de las zonas a la DERECHA (a la izquierda chocan con la etiqueta del punto de hoy)
  const zx = m.l + pw - 6;
  // en el borde INFERIOR de cada franja: así no chocan con la etiqueta del límite, que va bajo la línea del 3 %
  s += texto(zx, Y(aceptable) - 6, "Elevado", { color: "var(--text)", peso: 600, tam: 11.5, ancla: "end" }) + texto(zx, Y(optimo) - 6, "Aceptable", { color: "var(--text)", peso: 600, tam: 11.5, ancla: "end" }) + texto(zx, Y(0) - 6, "Óptimo", { color: "var(--text)", peso: 600, tam: 11.5, ancla: "end" }); // con el color de la zona al 80 % el nombre va en el color del texto
  if (!(pct > 0 && carga > 0)) return envolver(W, H, "Pérdidas frente a la carga", s);
  const xFin = Math.min(xmax, (ymax * carga) / pct);
  const largo = Math.hypot(X(xFin) - X(0), Y(0) - Y((pct * xFin) / carga));
  const d = `M${X(0)},${Y(0)} L${f1(X(xFin))},${f1(Y((pct * xFin) / carga))}`;
  // borde del color del fondo debajo de la recta: resalta sobre las zonas de color fuerte
  s += `<path class="oc-trazo" d="${d}" fill="none" style="stroke:var(--bg);--largo:${f1(largo)}" stroke-width="7" stroke-dasharray="${f1(largo)}"/>`;
  s += `<path class="oc-trazo" d="${d}" fill="none" style="stroke:var(--accent);--largo:${f1(largo)}" stroke-width="3" stroke-dasharray="${f1(largo)}"/>`;
  // líneas guía del punto a los dos ejes (pedido del usuario: la recta ya deja leer hasta dónde se llega a cada nivel)
  s += linea(m.l, Y(pct), X(carga), Y(pct), "var(--text)", 1.3, "4 4") + linea(X(carga), Y(pct), X(carga), Y(0), "var(--text)", 1.3, "4 4");
  s += `<circle class="oc-aparece" cx="${f1(X(carga))}" cy="${f1(Y(pct))}" r="6.5" style="fill:var(--accent);stroke:var(--bg)" stroke-width="2.5"/>`;
  s += texto(X(carga) - 10, Y(pct) - 12, `${pct.toFixed(2)} % · ${numEje(carga)} ${unidad}`, { color: "var(--text)", ancla: "end", peso: 700, tam: 12.5 });
  return envolver(W, H, `Pérdidas frente a la carga: ${numEje(carga)} ${unidad} con ${pct.toFixed(2)} %`, s);
}

// ---------------------------------------------------------------- perfil de tensión

/**
 * Perfil de tensión a lo largo de la línea (el «Voltage Profile» de CYME/ETAP): tensión en % de la nominal contra la
 * distancia desde el inicio, tramo por tramo, con las referencias de diseño. `tramos` = [{ nombre, longitudKm, caidaPct }].
 */
export function perfilTensionSvg({ tramos, optimo, aceptable }) {
  const W = 460, H = ALTO_GRAFICO, m = { l: 56, r: 22, t: 22, b: 58 }, pw = W - m.l - m.r, ph = H - m.t - m.b;
  const L = tramos.reduce((s, t) => s + t.longitudKm, 0);
  const caida = tramos.reduce((s, t) => s + t.caidaPct, 0);
  const bajada = Math.max(aceptable * 1.2, caida * 1.15);
  const yPaso = pasoRedondo(bajada, 4), ymin = 100 - Math.ceil(bajada / yPaso) * yPaso;
  // el eje llega un poco más allá de la línea: deja ver la proyección si la longitud aumentara
  const xPaso = pasoRedondo(L * 1.2, 4), xmax = Math.ceil((L * 1.2) / xPaso) * xPaso;
  const X = (v) => m.l + (v / xmax) * pw, Y = (v) => m.t + ((100 - Math.max(v, ymin)) / (100 - ymin)) * ph;
  const zona = (a, b, color) => `<rect x="${m.l}" y="${f1(Y(a))}" width="${pw}" height="${f1(Y(b) - Y(a))}" style="fill:${solido(color)}"/>`;
  let s = fondo(m.l, m.t, pw, ph, 0) + zona(100, 100 - optimo, "var(--success)") + zona(100 - optimo, 100 - aceptable, "var(--warning)") + zona(100 - aceptable, ymin, "var(--danger)");
  for (let v = 100; v >= ymin - 1e-9; v -= yPaso) s += linea(m.l, Y(v), m.l + pw, Y(v), "var(--border)") + texto(m.l - 7, Y(v) + 4.5, `${numEje(v)} %`, { ancla: "end", tam: 12 });
  for (let v = 0; v <= xmax + 1e-9; v += xPaso) s += linea(X(v), m.t + ph, X(v), m.t + ph + 5, "var(--text-muted)") + texto(X(v), m.t + ph + 20, numEje(v), { ancla: "middle", tam: 12 });
  s += texto(m.l + pw / 2, H - 12, "Distancia desde el inicio de la línea (km)", { ancla: "middle", tam: 12.5 });
  s += linea(m.l, Y(100 - optimo), m.l + pw, Y(100 - optimo), "var(--success)", 1.2, "5 4") + texto(m.l + 6, Y(100 - optimo) + 15, `${optimo} %`, { color: "var(--text)", peso: 600, tam: 11.5 });
  s += linea(m.l, Y(100 - aceptable), m.l + pw, Y(100 - aceptable), "var(--warning)", 1.2, "5 4") + texto(m.l + 6, Y(100 - aceptable) + 15, `${aceptable} %`, { color: "var(--text)", peso: 600, tam: 11.5 });
  if (!(L > 0) || !Number.isFinite(caida)) return envolver(W, H, "Perfil de tensión", s);
  let x = 0, v = 100, puntos = "";
  const varios = tramos.length > 1;
  tramos.forEach((t, i) => {
    const x2 = x + t.longitudKm, v2 = v - t.caidaPct, color = i % 2 ? "var(--accent-strong)" : "var(--accent)";
    const largo = Math.hypot(X(x2) - X(x), Y(v2) - Y(v));
    s += `<line class="oc-trazo" x1="${f1(X(x))}" y1="${f1(Y(v))}" x2="${f1(X(x2))}" y2="${f1(Y(v2))}" style="stroke:var(--bg);--largo:${f1(largo)};animation-delay:${i * 0.25}s" stroke-width="8" stroke-linecap="round" stroke-dasharray="${f1(largo)}"/>`;
    s += `<line class="oc-trazo" x1="${f1(X(x))}" y1="${f1(Y(v))}" x2="${f1(X(x2))}" y2="${f1(Y(v2))}" style="stroke:${color};--largo:${f1(largo)};animation-delay:${i * 0.25}s" stroke-width="4" stroke-linecap="round" stroke-dasharray="${f1(largo)}"/>`;
    if (varios) s += texto((X(x) + X(x2)) / 2, (Y(v) + Y(v2)) / 2 - 12, t.nombre, { ancla: "middle", color, peso: 700, tam: 12 });
    puntos += `<circle class="oc-aparece" cx="${f1(X(x2))}" cy="${f1(Y(v2))}" r="${i === tramos.length - 1 ? 6.5 : 4.5}" style="fill:${color};stroke:var(--bg)" stroke-width="2"/>`;
    x = x2;
    v = v2;
  });
  // proyección: la misma pendiente del último tramo, punteada y suave, hasta el borde del gráfico (pedido del usuario)
  const ultimo = tramos[tramos.length - 1];
  const pendiente = ultimo.longitudKm > 0 ? ultimo.caidaPct / ultimo.longitudKm : 0;
  if (pendiente > 0 && xmax > L) {
    const xFin = Math.min(xmax, L + (v - ymin) / pendiente);
    s += linea(X(L), Y(v), X(xFin), Y(v - pendiente * (xFin - L)), "var(--text)", 1.6, "5 5").replace("/>", ' opacity=".55"/>');
  }
  s += `<circle cx="${X(0)}" cy="${Y(100)}" r="4.5" style="fill:var(--text)"/>` + puntos;
  s += texto(X(L) - 8, Y(v) + 24, `${v.toFixed(2)} % (caída ${caida.toFixed(2)} %)`, { ancla: "end", color: "var(--text)", peso: 700, tam: 12.5 });
  return envolver(W, H, `Perfil de tensión: ${v.toFixed(2)} % al final de ${numEje(L)} km`, s);
}

// ---------------------------------------------------------------- cortocircuito: soportabilidad corriente–tiempo

/**
 * Curvas de soportabilidad (formato de las gráficas de ICEA P-32-382 y de los fabricantes), escalas logarítmicas: corriente
 * admisible frente al tiempo de despeje, una línea por calibre (el elegido resaltado) y, si se indicó, el punto de la falla.
 * `capacidad(area, t)` = kA (la calcula el motor, sin fórmulas nuevas). La etiqueta va en un recuadro en la esquina superior
 * derecha (zona siempre libre: por encima de todas las curvas) con una línea al punto.
 */
export function soportabilidadSvg({ calibres, capacidad, falla, tiempoS }) {
  const W = 460, H = ALTO_GRAFICO, m = { l: 54, r: 58, t: 16, b: 56 }, pw = W - m.l - m.r, ph = H - m.t - m.b;
  const tmin = 0.05, tmax = 5;
  const vals = calibres.flatMap((c) => [capacidad(c.area, tmin), capacidad(c.area, tmax)]).concat(falla ? [falla.ka] : []);
  // rango en pasos 1-2-5 y no en décadas completas (pedido del usuario: las curvas se ven más separadas)
  const abajo125 = (v) => { const d = Math.pow(10, Math.floor(Math.log10(v))); return [5, 2, 1].map((k) => k * d).find((x) => x <= v); };
  const arriba125 = (v) => { const d = Math.pow(10, Math.floor(Math.log10(v))); return [1, 2, 5, 10].map((k) => k * d).find((x) => x >= v); };
  const imin = abajo125(Math.min(...vals) * 0.8);
  const imax = arriba125(Math.max(...vals) * 1.25);
  const X = (t) => m.l + ((Math.log10(t) - Math.log10(tmin)) / (Math.log10(tmax) - Math.log10(tmin))) * pw;
  const Y = (i) => m.t + ph - ((Math.log10(i) - Math.log10(imin)) / (Math.log10(imax) - Math.log10(imin))) * ph;
  let s = fondo(m.l, m.t, pw, ph, 0);
  for (const t of [0.05, 0.1, 0.2, 0.5, 1, 2, 5]) s += linea(X(t), m.t, X(t), m.t + ph, "var(--border)") + texto(X(t), m.t + ph + 18, numEje(t), { ancla: "middle", tam: 12 });
  for (let d = Math.pow(10, Math.floor(Math.log10(imin))); d <= imax * 1.001; d *= 10) for (const k of [1, 2, 5]) { const i = d * k; if (i >= imin * 0.999 && i <= imax * 1.001) s += linea(m.l, Y(i), m.l + pw, Y(i), "var(--border)") + texto(m.l - 7, Y(i) + 4.5, numEje(i), { ancla: "end", tam: 12 }); }
  s += texto(m.l + pw / 2, H - 10, "Tiempo de despeje (s)", { ancla: "middle", tam: 12.5 });
  s += `<text x="14" y="${m.t + ph / 2}" font-size="12.5" text-anchor="middle" transform="rotate(-90 14 ${m.t + ph / 2})" style="fill:var(--text-muted)">Corriente de cortocircuito (kA)</text>`;
  const actual = calibres.find((c) => c.actual) || calibres[0];
  // zona segura del calibre elegido
  let zonaSegura = `M${X(tmin)},${Y(imin)}`;
  for (let t = tmin; t <= tmax * 1.0001; t *= 1.12) zonaSegura += ` L${f1(X(t))},${f1(Y(Math.min(imax, capacidad(actual.area, t))))}`;
  s += `<path d="${zonaSegura} L${X(tmax)},${Y(Math.min(imax, capacidad(actual.area, tmax)))} L${X(tmax)},${Y(imin)} Z" style="fill:var(--success)" opacity=".13"/>`;
  // curvas y nombres a la derecha (separados para que no se encimen)
  const finales = [];
  for (const c of calibres) {
    let d = "";
    for (let t = tmin; t <= tmax * 1.0001; t *= 1.1) d += `${d ? "L" : "M"}${f1(X(t))},${f1(Y(Math.min(imax, capacidad(c.area, t))))}`;
    s += `<path d="${d}" fill="none" style="stroke:${c.actual ? "var(--accent)" : "var(--text-faint)"}" stroke-width="${c.actual ? 3 : 1.3}"/>`;
    finales.push({ y: Y(capacidad(c.area, tmax)), c });
  }
  finales.sort((a, b) => a.y - b.y);
  for (let i = 1; i < finales.length; i++) if (finales[i].y - finales[i - 1].y < 13) finales[i].y = finales[i - 1].y + 13;
  for (const f of finales) s += texto(X(tmax) + 5, f.y + 4, f.c.nombre, { tam: 11.5, color: f.c.actual ? "var(--accent)" : "var(--text-muted)", peso: f.c.actual ? 700 : 400 });
  // título de la columna de nombres (pedido del usuario: sin él no se sabía qué eran)
  if (finales.length) s += texto(X(tmax) + 5, finales[0].y - 12, "Calibre", { tam: 11.5, color: "var(--text)", peso: 700 });
  // punto de la falla y su etiqueta
  if (falla && falla.ka > 0 && tiempoS > 0) {
    const soporta = capacidad(actual.area, tiempoS);
    const ok = soporta >= falla.ka;
    const px = X(Math.min(Math.max(tiempoS, tmin), tmax)), py = Y(Math.min(Math.max(falla.ka, imin), imax));
    const bx = m.l + pw - 6, by = m.t + 6;
    s += linea(px, py, bx - 120, by + 44, "var(--text-muted)", 1, "3 3");
    s += `<circle class="oc-aparece" cx="${f1(px)}" cy="${f1(py)}" r="6.5" style="fill:${ok ? "var(--success)" : "var(--danger)"};stroke:var(--bg)" stroke-width="2.5"/>`;
    s += recuadro(bx, by, [
      { t: `Falla: ${numEje(falla.ka)} kA en ${numEje(tiempoS)} s`, peso: 700 },
      { t: `${ok ? "Soporta" : "No soporta"}: el ${actual.nombre} aguanta ${soporta.toFixed(1)} kA`, color: ok ? "var(--success)" : "var(--danger)", tam: 12 },
    ], { ancla: "end" });
  }
  return envolver(W, H, `Curvas de soportabilidad de cortocircuito; ${actual.nombre} resaltado${falla ? `; falla de ${falla.ka} kA en ${tiempoS} s` : ""}`, s);
}

// ---------------------------------------------------------------- cortocircuito: termómetro de la falla

/**
 * Temperatura del conductor durante la falla: de operación a la que alcanza con la corriente indicada, frente a la máxima
 * admisible (la misma ecuación adiabática despejada). Sin corriente de falla muestra solo operación y máximo.
 */
export function termometroFallaSvg({ tOperacion, tMaxima, tAlcanza = null }) {
  const W = 230, H = ALTO_GRAFICO, x = 48, y0 = 34, y1 = 312, ancho = 30;
  const tope = Math.ceil((Math.max(tMaxima, tAlcanza ?? 0) * 1.12) / 50) * 50;
  const Y = (t) => y1 - (Math.min(Math.max(t, 0), tope) / tope) * (y1 - y0);
  const excede = tAlcanza != null && tAlcanza > tMaxima;
  let s = `<defs><linearGradient id="cc-termo-g" x1="0" y1="1" x2="0" y2="0"><stop offset="0" style="stop-color:var(--warning)"/><stop offset="1" style="stop-color:var(--danger)"/></linearGradient></defs>`;
  s += `<rect x="${x}" y="${y0}" width="${ancho}" height="${y1 - y0}" rx="${ancho / 2}" style="fill:var(--bg);stroke:var(--border-strong)"/>`;
  const nivel = tAlcanza ?? tOperacion;
  s += `<rect class="oc-aparece" x="${x + 6}" y="${f1(Y(nivel))}" width="${ancho - 12}" height="${f1(y1 - Y(nivel) + 6)}" rx="${(ancho - 12) / 2}" style="fill:url(#cc-termo-g)"/>`;
  s += `<circle cx="${x + ancho / 2}" cy="${y1 + 14}" r="20" style="fill:var(--warning);stroke:var(--bg)" stroke-width="2"/>`;
  for (let t = 0; t <= tope; t += tope / 5) s += linea(x - 6, Y(t), x, Y(t), "var(--text-muted)") + texto(x - 9, Y(t) + 4.5, numEje(t), { ancla: "end", tam: 11.5 });
  // las tres marcas, con al menos 34 px entre sus textos (la línea queda en su temperatura y el texto se corre si hace falta)
  const marcas = [[tMaxima, `${numEje(tMaxima)} °C`, "máximo admisible", "var(--danger)", "5 3"], ...(tAlcanza != null ? [[tAlcanza, `${tAlcanza.toFixed(1)} °C`, "alcanza en la falla", excede ? "var(--danger)" : "var(--warning)", ""]] : []), [tOperacion, `${numEje(tOperacion)} °C`, "operación", "var(--text-muted)", ""]]
    .map((mk) => ({ mk, y: Y(mk[0]) }))
    .sort((a, b) => a.y - b.y);
  for (let i = 1; i < marcas.length; i++) if (marcas[i].y - marcas[i - 1].y < 34) marcas[i].y = marcas[i - 1].y + 34;
  for (const { mk: [t, t1, t2, color, guiones], y } of marcas) s += linea(x + ancho + 2, Y(t), x + ancho + 20, Y(t), color, 2.2, guiones) + linea(x + ancho + 20, Y(t), x + ancho + 24, y, color, 1) + texto(x + ancho + 26, y + 1, t1, { color, peso: 700, tam: 14 }) + texto(x + ancho + 26, y + 16, t2, { tam: 11.5 });
  s += texto(W / 2, H - 4, tAlcanza == null ? "Sin corriente de falla indicada" : excede ? `Excede el máximo en ${(tAlcanza - tMaxima).toFixed(1)} °C` : `Margen: ${(tMaxima - tAlcanza).toFixed(1)} °C`, { ancla: "middle", tam: 12.5, peso: 700, color: tAlcanza == null ? "var(--text-muted)" : excede ? "var(--danger)" : "var(--success)" });
  return envolver(W, H, `Temperatura del conductor en la falla: operación ${tOperacion} °C${tAlcanza != null ? `, alcanza ${tAlcanza.toFixed(1)} °C` : ""}, máximo ${tMaxima} °C`, s);
}

// ---------------------------------------------------------------- ampacidad aérea: balance térmico

/**
 * Balance térmico de IEEE 738: lo que calienta (Joule I²R y sol) frente a lo que enfría (convección y radiación), en W/m.
 * En la ampacidad las dos barras miden lo mismo.
 */
export function balanceTermicoSvg({ qj, qs, qc, qr, ampacidad, tc }) {
  const W = 460, H = ALTO_GRAFICO, x0 = 34, x1 = W - 26, alto = 62;
  const total = Math.max(qj + qs, qc + qr);
  const E = (v) => (v / total) * (x1 - x0);
  const fila = (y, titulo, partes) => {
    let x = x0, r = texto(x0, y - 10, titulo, { color: "var(--text)", peso: 700, tam: 13 });
    r += fondo(x0, y, x1 - x0, alto, 5);
    for (const [v, color, nombre] of partes) {
      const w = E(v);
      r += `<rect class="oc-aparece" x="${f1(x)}" y="${y}" width="${f1(w)}" height="${alto}" style="fill:${color}" opacity=".9"/>`;
      if (w > 56) r += texto(x + w / 2, y + 26, nombre, { ancla: "middle", color: "#fff", peso: 700, tam: 12.5 }) + texto(x + w / 2, y + 44, `${v.toFixed(1)} W/m`, { ancla: "middle", color: "#fff", tam: 12 });
      else r += texto(x + w / 2, y + alto + 16, `${nombre} ${v.toFixed(1)}`, { ancla: "middle", tam: 11 });
      x += w;
    }
    return r;
  };
  let s = fila(60, "Calor que ENTRA", [[qj, "var(--danger)", "Joule I²R"], [qs, "var(--warning)", "Sol"]]);
  s += fila(196, "Calor que SALE", [[qc, "var(--accent)", "Convección"], [qr, "var(--accent-strong)", "Radiación"]]);
  s += linea(x0 + E(qj + qs), 40, x0 + E(qj + qs), 280, "var(--text)", 1.3, "4 3");
  s += texto(W / 2, 318, `Equilibrio a ${numEje(tc)} °C → ${Math.round(ampacidad)} A`, { ancla: "middle", color: "var(--text)", peso: 700, tam: 14 });
  s += texto(W / 2, 344, "Más sol o menos viento achican la barra de Joule, y con ella la ampacidad", { ancla: "middle", tam: 11.5 });
  return envolver(W, H, `Balance térmico: Joule ${qj.toFixed(1)} W/m y sol ${qs.toFixed(1)} W/m frente a convección ${qc.toFixed(1)} W/m y radiación ${qr.toFixed(1)} W/m`, s);
}

// ---------------------------------------------------------------- curvas genéricas (ampacidad frente a una variable)

/**
 * Curvas de una magnitud (Y) frente a otra (X), con un punto marcado y etiquetas en recuadro para no tapar las líneas.
 * `series` = [{ nombre, puntos: [[x,y]], resaltada }]; `punto` = { x, y, texto }; `extra` = { x, y, texto } (punto rojo).
 */
export function curvasSvg({ series, ejeX, ejeY, punto = null, extra = null, marcaY = null }) {
  const W = 460, H = ALTO_GRAFICO, m = { l: 58, r: 70, t: 18, b: 58 }, pw = W - m.l - m.r, ph = H - m.t - m.b;
  const xs = series.flatMap((s) => s.puntos.map((p) => p[0])), ys = series.flatMap((s) => s.puntos.map((p) => p[1])).filter(Number.isFinite).concat(marcaY ? [marcaY.y] : []);
  const x0 = Math.min(...xs), x1 = Math.max(...xs);
  const yPaso = pasoRedondo(Math.max(...ys) - Math.min(...ys) || 1, 4);
  const y0 = Math.floor(Math.min(...ys) / yPaso) * yPaso, y1 = Math.ceil(Math.max(...ys) / yPaso) * yPaso;
  const xPaso = pasoRedondo(x1 - x0, 5);
  const X = (v) => m.l + ((v - x0) / (x1 - x0)) * pw, Y = (v) => m.t + ph - ((v - y0) / (y1 - y0)) * ph;
  let s = fondo(m.l, m.t, pw, ph, 0);
  // líneas guía intermedias (pedido del usuario: entre dos divisiones había mucho espacio para leer un valor): punteadas y
  // más suaves; con su valor, en letra pequeña y tenue, solo si es un número entero
  for (let v = y0 + yPaso / 2; v < y1; v += yPaso) {
    s += linea(m.l, Y(v), m.l + pw, Y(v), "var(--border)", 1, "2 4");
    if (Number.isInteger(Math.round(v * 1e6) / 1e6)) s += texto(m.l - 7, Y(v) + 4, numEje(v), { ancla: "end", tam: 10, color: "var(--text-faint)" });
  }
  for (let v = y0; v <= y1 + 1e-9; v += yPaso) s += linea(m.l, Y(v), m.l + pw, Y(v), "var(--border)") + texto(m.l - 7, Y(v) + 4.5, numEje(v), { ancla: "end", tam: 12 });
  for (let v = Math.ceil(x0 / xPaso) * xPaso; v <= x1 + 1e-9; v += xPaso) s += linea(X(v), m.t + ph, X(v), m.t + ph + 5, "var(--text-muted)") + texto(X(v), m.t + ph + 20, numEje(v), { ancla: "middle", tam: 12 });
  s += texto(m.l + pw / 2, H - 12, ejeX, { ancla: "middle", tam: 12.5 });
  s += `<text x="14" y="${m.t + ph / 2}" font-size="12.5" text-anchor="middle" transform="rotate(-90 14 ${m.t + ph / 2})" style="fill:var(--text-muted)">${esc(ejeY)}</text>`;
  if (marcaY) s += linea(m.l, Y(marcaY.y), m.l + pw, Y(marcaY.y), "var(--danger)", 1.3, "5 4") + texto(m.l + 6, Y(marcaY.y) - 6, marcaY.texto, { color: "var(--danger)", tam: 11.5, peso: 600 });
  const finales = [];
  for (const serie of series) {
    const pts = serie.puntos.filter((p) => Number.isFinite(p[1]));
    if (!pts.length) continue;
    const d = pts.map((p, i) => `${i ? "L" : "M"}${f1(X(p[0]))},${f1(Y(p[1]))}`).join("");
    s += `<path d="${d}" fill="none" style="stroke:${serie.resaltada ? "var(--accent)" : serie.color || "var(--text-faint)"}" stroke-width="${serie.resaltada ? 3 : 1.6}"/>`;
    if (serie.nombre) finales.push({ y: Y(pts.at(-1)[1]), serie });
  }
  finales.sort((a, b) => a.y - b.y);
  for (let i = 1; i < finales.length; i++) if (finales[i].y - finales[i - 1].y < 14) finales[i].y = finales[i - 1].y + 14;
  for (const f of finales) s += texto(m.l + pw + 6, f.y + 4, f.serie.nombre, { tam: 11.5, color: f.serie.resaltada ? "var(--accent)" : "var(--text-muted)", peso: f.serie.resaltada ? 700 : 400 });
  // etiquetas en recuadro, por encima de la curva (las curvas bajan hacia la derecha: arriba a la derecha queda libre)
  const etiqueta = (p, color, fila, alto = 58) => {
    const px = X(p.x), py = Y(p.y);
    // con `lado: "izquierda"` (curvas que SUBEN hacia la derecha) el recuadro va arriba a la izquierda del punto
    const izq = p.lado === "izquierda";
    const bx = izq ? Math.max(px - 14, m.l + 175) : Math.min(px + 14, m.l + pw - 170), by = Math.max(m.t + 4, py - alto - fila * 44);
    return linea(px, py, izq ? bx - 8 : bx + 8, by + 32, "var(--text-muted)", 1, "3 3") + `<circle class="oc-aparece" cx="${f1(px)}" cy="${f1(py)}" r="${fila ? 5 : 6.5}" style="fill:${color};stroke:var(--bg)" stroke-width="2.5"/>` + recuadro(bx, by, p.texto.map((t, i) => ({ t, peso: i ? 400 : 700, color: i ? "var(--text-muted)" : color === "var(--accent)" ? "var(--text)" : color, tam: i ? 11.5 : 12.5 })), { ancla: izq ? "end" : "start" });
  };
  if (extra) s += etiqueta(extra, "var(--danger)", 0, 92);
  if (punto) s += etiqueta(punto, "var(--accent)", extra ? 1 : 0);
  return envolver(W, H, `${ejeY} frente a ${ejeX}`, s);
}

// ---------------------------------------------------------------- ampacidad aérea: corte del conductor

/**
 * Corte esquemático del conductor: núcleo (acero o aleación) y capas de aluminio según la construcción de la referencia
 * («26/7» → 26 de aluminio y 7 de núcleo; «7» → 7 de un solo material). Hilos de igual diámetro (esquemático).
 */
export function corteConductorSvg({ nombre, construccion, diametroMm, tipo, ampacidad }) {
  const W = 460, H = ALTO_GRAFICO, cx = 150, cy = 185;
  const mt = String(construccion || "").match(/(\d+)\s*\/\s*(\d+)/), mu = String(construccion || "").match(/^\s*(\d+)\s*$/);
  const exterior = mt ? +mt[1] : mu ? +mu[1] : 0, nucleo = mt ? +mt[2] : 0;
  // capas: 1 (centro), 6, 12, 18… hasta ubicar todos los hilos
  const total = exterior + nucleo;
  const capas = [];
  let restantes = total, k = 0;
  while (restantes > 0 && k < 8) {
    const cap = k === 0 ? 1 : 6 * k;
    capas.push(Math.min(cap, restantes));
    restantes -= cap;
    k++;
  }
  const r = 128 / (2 * capas.length - 1);
  const colorNucleo = /ACAR/i.test(tipo) ? "#b9c3cc" : "#7d858e";
  let s = `<circle cx="${cx}" cy="${cy}" r="${f1(r * (2 * capas.length - 1) + 4)}" style="fill:var(--bg);stroke:var(--border-strong)"/>`;
  let n = 0;
  capas.forEach((cant, i) => {
    for (let j = 0; j < cant; j++) {
      const a = (j / cant) * 2 * Math.PI + i * 0.18;
      const x = cx + 2 * r * i * Math.cos(a), y = cy + 2 * r * i * Math.sin(a);
      const esNucleo = n < nucleo;
      s += `<circle class="oc-aparece" cx="${f1(x)}" cy="${f1(y)}" r="${f1(r - 0.9)}" style="fill:${esNucleo ? colorNucleo : "#dde2e7"};stroke:#1a1a1a" stroke-width="1"/>`;
      n++;
    }
  });
  const flecha = (x1, y1, x2, y2, color) => { const a = Math.atan2(y2 - y1, x2 - x1); return `<line x1="${f1(x1)}" y1="${f1(y1)}" x2="${f1(x2)}" y2="${f1(y2)}" style="stroke:${color}" stroke-width="3"/><path d="M${f1(x2)},${f1(y2)} L${f1(x2 - 10 * Math.cos(a - 0.45))},${f1(y2 - 10 * Math.sin(a - 0.45))} L${f1(x2 - 10 * Math.cos(a + 0.45))},${f1(y2 - 10 * Math.sin(a + 0.45))} Z" style="fill:${color}"/>`; };
  s += flecha(cx - 40, 18, cx - 22, 48, "var(--warning)") + texto(cx - 46, 22, "Sol", { ancla: "end", color: "var(--warning)", peso: 700 });
  s += flecha(cx + 108, cy - 70, cx + 142, cy - 104, "var(--accent)") + texto(cx + 146, cy - 106, "Convección", { color: "var(--accent)", peso: 700 });
  s += flecha(cx + 108, cy + 70, cx + 142, cy + 104, "var(--accent-strong)") + texto(cx + 146, cy + 116, "Radiación", { color: "var(--accent-strong)", peso: 700 });
  const tx = 300;
  s += texto(tx, 150, nombre, { color: "var(--text)", peso: 700, tam: 14 });
  if (total) s += texto(tx, 172, nucleo ? `Aluminio: ${exterior} hilos` : `${total} hilos`, { tam: 12.5 }) + (nucleo ? texto(tx, 190, `Núcleo: ${nucleo} hilos`, { tam: 12.5 }) : "");
  s += texto(tx, nucleo ? 208 : 190, `Diámetro: ${numEje(diametroMm)} mm`, { tam: 12.5 });
  if (ampacidad) s += texto(tx, nucleo ? 236 : 218, `Ampacidad: ${Math.round(ampacidad)} A`, { color: "var(--accent)", peso: 700, tam: 15 });
  s += texto(cx, H - 8, "Dibujo esquemático (hilos de igual diámetro)", { ancla: "middle", tam: 11 });
  return envolver(W, H, `Corte del conductor ${nombre}`, s);
}

// ---------------------------------------------------------------- ampacidad subterránea: corte con isotermas

/**
 * Corte de la zanja: superficie, profundidad, cables de cada circuito y la temperatura del terreno por superposición de
 * fuentes lineales con sus imágenes (Kennelly, el método de IEC 60287 para el calentamiento mutuo; terreno homogéneo, sin
 * el ducto: es una aproximación ilustrativa). `ductos` = [{ x, y }] (m, y = profundidad); `wPorCircuito` = W/m.
 */
export function corteZanjaSvg({ ductos, wPorCircuito, rho, tTerreno, tConductor, monopolar, dCableM, sepFasesM }) {
  // el recuadro del corte mide y se ubica IGUAL que el área de curvasSvg (pedido del usuario: los dos se ven parejos);
  // la nota del método va debajo, como el nombre de un eje
  const W = 460, H = ALTO_GRAFICO, m = { l: 58, r: 70, t: 18, b: 58 }, pw = W - m.l - m.r, ph = H - m.t - m.b;
  const sup = m.t + 22; // franja de la superficie dentro del recuadro
  const cxs = ductos.map((d) => d.x), cys = ductos.map((d) => d.y);
  const xc = (Math.min(...cxs) + Math.max(...cxs)) / 2;
  const semiancho = Math.max(0.85, (Math.max(...cxs) - Math.min(...cxs)) / 2 + 0.6);
  const prof = Math.max(...cys) + 0.6;
  const escala = Math.min(pw / (2 * semiancho), (m.t + ph - sup - 20) / prof);
  const X = (x) => m.l + pw / 2 + (x - xc) * escala, Y = (y) => sup + y * escala;
  const rMin = Math.max(dCableM, 0.03);
  const theta = (x, y) => tTerreno + ductos.reduce((a, d) => a + ((wPorCircuito * rho) / (2 * Math.PI)) * Math.log(Math.hypot(x - d.x, y + d.y) / Math.max(Math.hypot(x - d.x, y - d.y), rMin)), 0);
  const tmax = Math.max(theta(ductos[0].x + rMin, ductos[0].y), tTerreno + 10);
  const paradas = [[0, [45, 36, 28]], [0.12, [92, 58, 33]], [0.3, [168, 86, 35]], [0.5, [222, 120, 40]], [0.75, [240, 170, 60]], [1, [250, 235, 160]]];
  const color = (t) => {
    const u = Math.min(1, Math.max(0, (t - tTerreno) / (tmax - tTerreno)));
    for (let i = 1; i < paradas.length; i++) if (u <= paradas[i][0]) { const [u0, c0] = paradas[i - 1], [u1, c1] = paradas[i], k = (u - u0) / (u1 - u0); return `rgb(${c0.map((v, j) => Math.round(v + k * (c1[j] - v))).join(",")})`; }
    return "rgb(250,235,160)";
  };
  let s = `<defs><clipPath id="zanja-recorte"><rect x="${m.l}" y="${m.t}" width="${pw}" height="${ph}"/></clipPath></defs><g clip-path="url(#zanja-recorte)">`;
  const paso = 6;
  for (let px = m.l; px < m.l + pw; px += paso) for (let py = sup; py < m.t + ph; py += paso) s += `<rect x="${px}" y="${py}" width="${paso + 0.5}" height="${paso + 0.5}" fill="${color(theta((px + paso / 2 - m.l - pw / 2) / escala + xc, (py + paso / 2 - sup) / escala))}" shape-rendering="crispEdges"/>`;
  // isotermas (cada 10 °C desde el terreno), buscadas en rayos desde el centro de los circuitos
  const yc = (Math.min(...cys) + Math.max(...cys)) / 2;
  const niveles = [];
  for (let t = Math.ceil((tTerreno + 5) / 10) * 10; t < tmax - 3 && niveles.length < 4; t += 10) niveles.push(t);
  for (const t of niveles) {
    let dd = "", primero = true;
    for (let a = 0; a <= 2 * Math.PI + 0.01; a += 0.05) {
      let rr = 0.02;
      while (rr < 3 && theta(xc + Math.cos(a) * rr, yc + Math.sin(a) * rr) > t) rr += 0.005;
      const yy = yc + Math.sin(a) * rr;
      if (yy < 0) continue;
      dd += `${primero ? "M" : "L"}${f1(X(xc + Math.cos(a) * rr))},${f1(Y(yy))}`;
      primero = false;
    }
    s += `<path d="${dd}" fill="none" stroke="rgba(255,255,255,.75)" stroke-width="1.1" stroke-dasharray="4 3"/>`;
    let rr = 0.02;
    while (rr < 3 && theta(xc + rr, yc) > t) rr += 0.005;
    s += `<text x="${f1(X(xc + rr) + 4)}" y="${f1(Y(yc) - 3)}" font-size="11" font-weight="700" fill="#fff">${t} °C</text>`;
  }
  // cables: trébol por circuito (monopolar) o uno (tripolar); dibujados un poco más grandes para que se vean
  const rc = Math.max((dCableM / 2) * escala, 5);
  for (const d of ductos) {
    const pos = monopolar
      ? [[-sepFasesM / 2, sepFasesM * 0.29], [sepFasesM / 2, sepFasesM * 0.29], [0, -sepFasesM * 0.58]].map(([a, b]) => [d.x + a * Math.max(1, (2 * rc) / (sepFasesM * escala)), d.y + b * Math.max(1, (2 * rc) / (sepFasesM * escala))])
      : [[d.x, d.y]];
    for (const [a, b] of pos) s += `<circle class="oc-aparece" cx="${f1(X(a))}" cy="${f1(Y(b))}" r="${f1(rc)}" fill="#b87333" stroke="#111" stroke-width="1.4"/>`;
  }
  s += `<rect x="${m.l}" y="${m.t}" width="${pw}" height="${sup - m.t}" style="fill:var(--bg)"/>` + `<line x1="${m.l}" y1="${sup}" x2="${m.l + pw}" y2="${sup}" stroke="#6b8f5a" stroke-width="3"/>` + texto(m.l + 6, m.t + 15, `Superficie · ${numEje(tTerreno)} °C`, { tam: 11.5 });
  const d0 = ductos.reduce((a, d) => (d.y < a.y ? d : a), ductos[0]);
  const xm = m.l + pw - 16;
  s += `<line x1="${xm}" y1="${sup}" x2="${xm}" y2="${f1(Y(d0.y))}" stroke="#fff" stroke-dasharray="3 2"/>` + `<text x="${xm - 6}" y="${f1(sup + (Y(d0.y) - sup) / 2)}" font-size="11.5" font-weight="700" fill="#fff" text-anchor="end">${numEje(d0.y)} m</text></g>`;
  s += texto(m.l + pw / 2, H - 12, `Conductor a ${numEje(tConductor)} °C · temperatura del terreno aproximada (Kennelly)`, { ancla: "middle", tam: 12 });
  return envolver(W, H, `Corte de la instalación: ${ductos.length} circuito(s) a ${numEje(d0.y)} m, isotermas en el terreno`, s);
}
