// Graficos SVG a medida (dibujados por codigo a partir de los datos del calculo). Sin librerias: salen vectoriales al imprimir y
// usan las variables de color del tema (claro, oscuro y la paleta personal). Devuelven una cadena <svg>…</svg>.
//
// - donaOcupacionSvg: dona de porcentaje con degradado, marca del limite y cifra al centro.
// - corteDuctoSvg: corte transversal a ESCALA del ducto con sus conductores apoyados en el fondo (uno o varios tipos).

const COLORES_TIPO = ["var(--accent)", "var(--warning)", "var(--success)", "var(--text-muted)"];
const f1 = (x) => x.toFixed(1);
const polar = (cx, cy, r, grados) => [cx + r * Math.cos((grados * Math.PI) / 180), cy + r * Math.sin((grados * Math.PI) / 180)];

// ---------------------------------------------------------------- dona

/** Dona de ocupacion: `pct` (0-100+), `limite` (%) y `cumple`. Con pct > 100 el arco se llena y la cifra sigue diciendo el valor real. */
export function donaOcupacionSvg({ pct, limite, cumple }) {
  // mismo lienzo (380 x 450) y mismo centro que el corte transversal: las dos columnas miden lo mismo y el aro iguala al ducto
  const r = 150, cx = 190, cy = 190, ancho = 38, L = 2 * Math.PI * r;
  const lleno = (L * Math.min(Math.max(pct, 0), 100)) / 100;
  const col = cumple ? ["var(--accent)", "var(--accent-strong)"] : ["var(--danger)", "var(--danger)"];
  const grados = -90 + Math.min(limite, 100) * 3.6;
  const [tx1, ty1] = polar(cx, cy, r - ancho / 2 - 3, grados);
  const [tx2, ty2] = polar(cx, cy, r + ancho / 2 + 3, grados);
  const [lx, ly] = polar(cx, cy, r + ancho / 2 + 20, grados);
  return `<svg viewBox="0 0 380 450" role="img" aria-label="Ocupación ${f1(pct)} % con límite de ${limite} %: ${cumple ? "cumple" : "no cumple"}">
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
    <text x="${cx}" y="${cy + 170 + 24 + 27}" text-anchor="middle" font-size="17" style="fill:var(--text-muted)">Límite NTC-2050: ${limite} %</text>
  </svg>`;
}

// ---------------------------------------------------------------- corte transversal

/**
 * Los conductores «se asientan» en el fondo del ducto: relajacion simple con gravedad y choques (posiciones en mm, origen en el
 * centro del ducto, y hacia abajo). Devuelve [{ r, tipo, x, y }]. Si no caben, quedan encimados (se nota en el dibujo).
 */
export function asentarConductores(diametroTuboMm, tipos) {
  const cs = [];
  tipos.forEach((t, k) => {
    for (let i = 0; i < t.cantidad; i++) cs.push({ r: t.diametroMm / 2, tipo: k, x: 0, y: 0 });
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
        if (d > max && max > 0) { c.x *= max / d; c.y *= max / d; }
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
