// Visor generico de imagenes normativas, parametrizado por :tema en la URL.
// Cubre las 4 rutas "#/normatividad/:tema" (distancias-seguridad,
// zona-servidumbre, enterramiento-ductos, corriente-ntc) definidas en
// js/router.js y js/nav.js (sectionMenus.normatividad).

const TEMAS = {
  "distancias-seguridad": {
    titulo: "Distancias de seguridad",
    subtitulo: "Tablas RETIE de distancias mínimas de seguridad (numerales 3.10.x y 3.22.1.c).",
    selector: true,
    opciones: [
      { label: "Tabla 3.10.1.a", img: "assets/normativa/tabla-3-10-1-a.jpg" },
      { label: "Tabla 3.10.2.a", img: "assets/normativa/tabla-3-10-2-a.jpg" },
      { label: "Tabla 3.10.3.a", img: "assets/normativa/tabla-3-10-3-a.jpg" },
      { label: "Tabla 3.10.4.a", img: "assets/normativa/tabla-3-10-4-a.jpg" },
      { label: "Tabla 3.10.4.b", img: "assets/normativa/tabla-3-10-4-b.jpg" },
      { label: "Tabla 3.10.5.b", img: "assets/normativa/tabla-3-10-5-b.jpg" },
      { label: "Tabla 3.10.5.c", img: "assets/normativa/tabla-3-10-5-c.jpg" },
      { label: "Tabla 3.22.1.c (equivalente a Tabla 23.2 RETIE 2013)", img: "assets/normativa/tabla-3-22-1-c.jpg" },
    ],
  },
  "zona-servidumbre": {
    titulo: "Zona de servidumbre",
    subtitulo: "Ancho de zona de servidumbre para líneas de transmisión (RETIE 3.19.1.a).",
    selector: false,
    opciones: [
      { label: "Tabla 3.19.1.a", img: "assets/normativa/tabla-3-19-1-a.jpg" },
      { label: "Figura 3.19.1.a", img: "assets/normativa/figura-3-19-1-a.jpg" },
    ],
  },
  "enterramiento-ductos": {
    titulo: "Enterramiento de ductos",
    subtitulo: "Profundidad de enterramiento de ductos según RETIE y NTC 2050.",
    selector: true,
    opciones: [
      { label: "RETIE 2024, numeral 3.20.6.3.g — Criterio de enterramiento de ductos", img: "assets/normativa/numeral-3-20-6-3-g.jpg" },
      { label: "NTC 2050, Tabla 300.5 — Enterramiento de conductores de 0 a 1000 V", img: "assets/normativa/tabla-300-5.jpg" },
      { label: "NTC 2050, Tabla 300.50 — Enterramiento de conductores de 1000 V en adelante", img: "assets/normativa/tabla-300-50.jpg" },
    ],
  },
  "corriente-ntc": {
    titulo: "Corriente de conductores NTC 2050",
    subtitulo: "Tablas 310-77 a 310-80 de capacidad de corriente de conductores (NTC 2050 / NEC).",
    selector: false,
    opciones: [
      { label: "Capacidad de corriente de conductores", img: "assets/normativa/capacidad-corriente-conductores-ntc.jpg" },
    ],
  },
};

export async function render(container, params) {
  const tema = TEMAS[params?.tema];

  if (!tema) {
    container.innerHTML = `
      <div class="breadcrumb"><a href="#/">Inicio</a> <span>/</span> <a href="#/normatividad">Normatividad</a></div>
      <div class="empty-state">
        <h2>Tema no encontrado</h2>
        <p class="text-muted">No existe contenido normativo para <code>${params?.tema ?? ""}</code>.</p>
        <p><a class="btn btn-primary" href="#/normatividad">Volver a Normatividad</a></p>
      </div>
    `;
    return;
  }

  container.innerHTML = `
    <div class="breadcrumb"><a href="#/">Inicio</a> <span>/</span> <a href="#/normatividad">Normatividad</a> <span>/</span> <span>${tema.titulo}</span></div>
    <h1 class="page-title">${tema.titulo}</h1>
    <p class="page-subtitle">${tema.subtitulo}</p>
    <div id="imagenes-wrap"></div>
  `;

  const wrap = container.querySelector("#imagenes-wrap");

  if (tema.selector) {
    wrap.innerHTML = `
      <div class="field" style="max-width: 480px;">
        <label for="sel-tabla">Tabla / figura</label>
        <select id="sel-tabla">
          ${tema.opciones.map((op, i) => `<option value="${i}">${op.label}</option>`).join("")}
        </select>
      </div>
      <div class="image-frame" id="frame-imagen"></div>
    `;

    const sel = wrap.querySelector("#sel-tabla");
    const frame = wrap.querySelector("#frame-imagen");

    function pintarImagen(idx) {
      const op = tema.opciones[idx];
      frame.innerHTML = `<img src="${op.img}" data-lightbox="${op.img}" alt="${op.label}">`;
    }

    sel.addEventListener("change", () => pintarImagen(Number(sel.value)));
    pintarImagen(0);
  } else {
    wrap.innerHTML = `
      <div class="grid-2">
        ${tema.opciones
          .map(
            (op) => `
          <div>
            <h3 class="section-title">${op.label}</h3>
            <div class="image-frame">
              <img src="${op.img}" data-lightbox="${op.img}" alt="${op.label}">
            </div>
          </div>`
          )
          .join("")}
      </div>
    `;
  }
}
