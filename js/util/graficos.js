// Graficos SVG a medida (dibujados por codigo a partir de los datos del calculo). Sin librerias: salen vectoriales al imprimir y
// usan las variables de color del tema (claro, oscuro y la paleta personal). Devuelven una cadena <svg>…</svg>.
//
// - donaOcupacionSvg: dona de porcentaje con degradado, marca del limite y cifra al centro; debajo, «Total de conductores» y el limite.
// - corteDuctoSvg: corte transversal a ESCALA del ducto con sus conductores apoyados en el fondo (uno o varios tipos).
// - barraReferenciaSvg: barra vertical con las zonas Óptimo / Aceptable / Elevado y la marca del resultado (Pérdidas y Regulación).
// - curvaCargaSvg: % de pérdidas frente a la carga, en la unidad del dato de partida (Pérdidas).
// - perfilTensionSvg: tensión a lo largo de la línea, tramo por tramo (Regulación).

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

// ---------------------------------------------------------------- utilidades de ejes (Pérdidas y Regulación, 2026-09-26)

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
  const dec = a === 0 ? 0 : a < 10 ? (Number.isInteger(Math.round(v * 10) / 10) ? 0 : 1) : a < 100 ? (Number.isInteger(v) ? 0 : 1) : 0;
  return v.toLocaleString("en-US", { minimumFractionDigits: 0, maximumFractionDigits: dec });
}
const esc = (t) => String(t).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
const texto = (x, y, t, { tam = 13, color = "var(--text-muted)", ancla = "start", peso = 400 } = {}) =>
  `<text x="${f1(x)}" y="${f1(y)}" font-size="${tam}" font-weight="${peso}" text-anchor="${ancla}" style="fill:${color}">${esc(t)}</text>`;
const linea = (x1, y1, x2, y2, color, ancho = 1, guiones = "") =>
  `<line x1="${f1(x1)}" y1="${f1(y1)}" x2="${f1(x2)}" y2="${f1(y2)}" style="stroke:${color}" stroke-width="${ancho}"${guiones ? ` stroke-dasharray="${guiones}"` : ""}/>`;

// ---------------------------------------------------------------- barra de referencia vertical

/**
 * Barra de referencia vertical (tipo «bullet graph» de Stephen Few, de pie como un termómetro): las zonas Óptimo /
 * Aceptable / Elevado de las referencias de diseño y la marca del resultado. `valor`, `optimo` y `aceptable` en %.
 */
export function barraReferenciaSvg({ valor, optimo, aceptable, etiqueta = "" }) {
  const W = 150, H = 380, x0 = 58, ancho = 44, y0 = 34, y1 = 330;
  const ok = Number.isFinite(valor);
  const max = Math.max(aceptable * 5 / 3, ok ? valor * 1.15 : 0);
  const tope = Math.ceil(max / pasoRedondo(max, 5)) * pasoRedondo(max, 5);
  const Y = (v) => y1 - (Math.min(Math.max(v, 0), tope) / tope) * (y1 - y0);
  const zona = (desde, hasta, color) => `<rect x="${x0}" y="${f1(Y(hasta))}" width="${ancho}" height="${f1(Y(desde) - Y(hasta))}" style="fill:${color}" opacity=".28"/>`;
  let s = zona(0, optimo, "var(--success)") + zona(optimo, aceptable, "var(--warning)") + zona(aceptable, tope, "var(--danger)");
  s += `<rect x="${x0}" y="${y0}" width="${ancho}" height="${y1 - y0}" rx="4" fill="none" style="stroke:var(--border-strong)"/>`;
  for (const v of [0, optimo, aceptable, tope]) s += linea(x0 - 5, Y(v), x0, Y(v), "var(--text-muted)") + texto(x0 - 9, Y(v) + 4.5, `${numEje(v)} %`, { ancla: "end" });
  if (ok) {
    const yv = Y(valor);
    s += `<rect class="oc-aparece" x="${x0 + ancho / 2 - 7}" y="${f1(yv)}" width="14" height="${f1(y1 - yv)}" rx="2" style="fill:var(--text)"/>`;
    s += linea(x0 - 6, yv, x0 + ancho + 6, yv, "var(--accent)", 4);
    s += texto(x0 + ancho / 2, y0 - 12, `${valor.toFixed(2)} %`, { tam: 17, color: "var(--text)", ancla: "middle", peso: 700 });
  }
  if (etiqueta) s += texto(x0 + ancho / 2, H - 14, etiqueta, { ancla: "middle", tam: 12.5 });
  return `<svg viewBox="0 0 ${W} ${H}" role="img" aria-label="${esc(`${etiqueta}: ${ok ? valor.toFixed(2) : "—"} % (óptimo hasta ${optimo} %, aceptable hasta ${aceptable} %)`)}">${s}</svg>`;
}

// ---------------------------------------------------------------- pérdidas frente a la carga

/**
 * El % de pérdidas frente a la carga, de 0 al doble de la actual, en la unidad del dato de partida (MW, MVA o A). A igual
 * tensión y FP el % de pérdidas crece en proporción a la carga (las pérdidas en kW, con su cuadrado): es una recta por el
 * origen que pasa por el punto de hoy. Marca dónde se llega al límite aceptable.
 */
export function curvaCargaSvg({ pct, carga, unidad, nombreEje, optimo, aceptable }) {
  const W = 460, H = 380, m = { l: 52, r: 18, t: 22, b: 58 }, pw = W - m.l - m.r, ph = H - m.t - m.b;
  const xPaso = pasoRedondo(carga * 2, 4), xmax = Math.ceil((carga * 2) / xPaso) * xPaso;
  const yTope = Math.max(aceptable * 4 / 3, (pct * xmax) / carga);
  const yPaso = pasoRedondo(yTope, 4), ymax = Math.ceil(yTope / yPaso) * yPaso;
  const X = (v) => m.l + (v / xmax) * pw, Y = (v) => m.t + ph - (Math.min(v, ymax) / ymax) * ph;
  const zona = (a, b, color) => `<rect x="${m.l}" y="${f1(Y(b))}" width="${pw}" height="${f1(Y(a) - Y(b))}" style="fill:${color}" opacity=".10"/>`;
  let s = zona(0, optimo, "var(--success)") + zona(optimo, aceptable, "var(--warning)") + zona(aceptable, ymax, "var(--danger)");
  for (let v = 0; v <= ymax + 1e-9; v += yPaso) s += linea(m.l, Y(v), m.l + pw, Y(v), "var(--border)") + texto(m.l - 7, Y(v) + 4.5, `${numEje(v)} %`, { ancla: "end", tam: 12 });
  for (let v = 0; v <= xmax + 1e-9; v += xPaso) s += linea(X(v), m.t + ph, X(v), m.t + ph + 5, "var(--text-muted)") + texto(X(v), m.t + ph + 20, numEje(v), { ancla: "middle", tam: 12 });
  s += texto(m.l + pw / 2, H - 12, `${nombreEje} (${unidad})`, { ancla: "middle", tam: 12.5 });
  // nombres de las zonas a la DERECHA (a la izquierda chocan con la etiqueta del punto de hoy)
  const zx = m.l + pw - 6;
  s += texto(zx, Y(ymax) + 15, "Elevado", { color: "var(--danger)", tam: 11.5, ancla: "end" }) + texto(zx, Y(aceptable) + 15, "Aceptable", { color: "var(--warning)", tam: 11.5, ancla: "end" }) + texto(zx, Y(optimo) + 15, "Óptimo", { color: "var(--success)", tam: 11.5, ancla: "end" });
  if (!(pct > 0 && carga > 0)) return `<svg viewBox="0 0 ${W} ${H}" role="img" aria-label="Pérdidas frente a la carga">${s}</svg>`;
  // la recta, recortada donde sale por arriba
  const xFin = Math.min(xmax, (ymax * carga) / pct);
  s += `<path class="oc-trazo" d="M${X(0)},${Y(0)} L${f1(X(xFin))},${f1(Y((pct * xFin) / carga))}" fill="none" style="stroke:var(--accent);--largo:${f1(Math.hypot(X(xFin) - X(0), Y(0) - Y((pct * xFin) / carga)))}" stroke-width="3" stroke-dasharray="${f1(Math.hypot(X(xFin) - X(0), Y(0) - Y((pct * xFin) / carga)))}"/>`;
  // límite aceptable
  const xLim = (aceptable * carga) / pct;
  if (xLim <= xmax) {
    s += linea(X(xLim), Y(0), X(xLim), Y(aceptable), "var(--warning)", 1.4, "5 4");
    s += texto(X(xLim) + (X(xLim) > m.l + pw * 0.62 ? -6 : 6), Y(aceptable) - 8, `${aceptable} % con ${numEje(xLim)} ${unidad}`, { color: "var(--warning)", ancla: X(xLim) > m.l + pw * 0.62 ? "end" : "start", peso: 600, tam: 12 });
  } else {
    s += texto(m.l + pw - 4, m.t + 14, `${aceptable} % con ${numEje(xLim)} ${unidad}`, { color: "var(--warning)", ancla: "end", peso: 600, tam: 12 });
  }
  // punto de hoy
  s += `<circle class="oc-aparece" cx="${f1(X(carga))}" cy="${f1(Y(pct))}" r="6.5" style="fill:var(--accent);stroke:var(--bg-elevated)" stroke-width="2.5"/>`;
  s += texto(X(carga) - 10, Y(pct) - 12, `Hoy: ${numEje(carga)} ${unidad} · ${pct.toFixed(2)} %`, { color: "var(--text)", ancla: "end", peso: 700, tam: 12.5 });
  return `<svg viewBox="0 0 ${W} ${H}" role="img" aria-label="${esc(`Pérdidas frente a la carga: hoy ${numEje(carga)} ${unidad} con ${pct.toFixed(2)} %; ${aceptable} % con ${numEje(xLim)} ${unidad}`)}">${s}</svg>`;
}

// ---------------------------------------------------------------- perfil de tensión

/**
 * Perfil de tensión a lo largo de la línea (el «Voltage Profile» de CYME/ETAP): tensión en % de la nominal contra la
 * distancia desde el inicio, tramo por tramo, con las referencias de diseño. `tramos` = [{ nombre, longitudKm, caidaPct }].
 */
export function perfilTensionSvg({ tramos, optimo, aceptable }) {
  const W = 460, H = 380, m = { l: 56, r: 22, t: 22, b: 58 }, pw = W - m.l - m.r, ph = H - m.t - m.b;
  const L = tramos.reduce((s, t) => s + t.longitudKm, 0);
  const caida = tramos.reduce((s, t) => s + t.caidaPct, 0);
  const bajada = Math.max(aceptable * 1.2, caida * 1.15);
  const yPaso = pasoRedondo(bajada, 4), ymin = 100 - Math.ceil(bajada / yPaso) * yPaso;
  const xPaso = pasoRedondo(L, 4), xmax = Math.ceil(L / xPaso) * xPaso;
  const X = (v) => m.l + (v / xmax) * pw, Y = (v) => m.t + ((100 - Math.max(v, ymin)) / (100 - ymin)) * ph;
  const zona = (a, b, color) => `<rect x="${m.l}" y="${f1(Y(a))}" width="${pw}" height="${f1(Y(b) - Y(a))}" style="fill:${color}" opacity=".10"/>`;
  let s = zona(100, 100 - optimo, "var(--success)") + zona(100 - optimo, 100 - aceptable, "var(--warning)") + zona(100 - aceptable, ymin, "var(--danger)");
  for (let v = 100; v >= ymin - 1e-9; v -= yPaso) s += linea(m.l, Y(v), m.l + pw, Y(v), "var(--border)") + texto(m.l - 7, Y(v) + 4.5, `${numEje(v)} %`, { ancla: "end", tam: 12 });
  for (let v = 0; v <= xmax + 1e-9; v += xPaso) s += linea(X(v), m.t + ph, X(v), m.t + ph + 5, "var(--text-muted)") + texto(X(v), m.t + ph + 20, numEje(v), { ancla: "middle", tam: 12 });
  s += texto(m.l + pw / 2, H - 12, "Distancia desde el inicio de la línea (km)", { ancla: "middle", tam: 12.5 });
  s += linea(m.l, Y(100 - optimo), m.l + pw, Y(100 - optimo), "var(--success)", 1.2, "5 4") + texto(m.l + pw - 4, Y(100 - optimo) - 5, `${optimo} %`, { ancla: "end", color: "var(--success)", tam: 11.5 });
  s += linea(m.l, Y(100 - aceptable), m.l + pw, Y(100 - aceptable), "var(--warning)", 1.2, "5 4") + texto(m.l + pw - 4, Y(100 - aceptable) - 5, `${aceptable} %`, { ancla: "end", color: "var(--warning)", tam: 11.5 });
  if (!(L > 0) || !Number.isFinite(caida)) return `<svg viewBox="0 0 ${W} ${H}" role="img" aria-label="Perfil de tensión">${s}</svg>`;
  let x = 0, v = 100, puntos = "";
  const varios = tramos.length > 1;
  tramos.forEach((t, i) => {
    const x2 = x + t.longitudKm, v2 = v - t.caidaPct, color = i % 2 ? "var(--accent-strong)" : "var(--accent)";
    const largo = Math.hypot(X(x2) - X(x), Y(v2) - Y(v));
    s += `<line class="oc-trazo" x1="${f1(X(x))}" y1="${f1(Y(v))}" x2="${f1(X(x2))}" y2="${f1(Y(v2))}" style="stroke:${color};--largo:${f1(largo)};animation-delay:${i * 0.25}s" stroke-width="4" stroke-linecap="round" stroke-dasharray="${f1(largo)}"/>`;
    if (varios) s += texto((X(x) + X(x2)) / 2, (Y(v) + Y(v2)) / 2 - 12, t.nombre, { ancla: "middle", color, peso: 700, tam: 12 });
    puntos += `<circle class="oc-aparece" cx="${f1(X(x2))}" cy="${f1(Y(v2))}" r="${i === tramos.length - 1 ? 6.5 : 4.5}" style="fill:${color};stroke:var(--bg-elevated)" stroke-width="2"/>`;
    x = x2;
    v = v2;
  });
  s += `<circle cx="${X(0)}" cy="${Y(100)}" r="4.5" style="fill:var(--text)"/>` + puntos;
  s += texto(X(L) - 8, Y(v) + 24, `Al final: ${v.toFixed(2)} % (caída ${caida.toFixed(2)} %)`, { ancla: "end", color: "var(--text)", peso: 700, tam: 12.5 });
  return `<svg viewBox="0 0 ${W} ${H}" role="img" aria-label="${esc(`Perfil de tensión: ${v.toFixed(2)} % al final de ${numEje(L)} km`)}">${s}</svg>`;
}
