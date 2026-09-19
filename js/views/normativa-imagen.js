// Visor generico de imagenes normativas, parametrizado por :tema en la URL.
// Cubre las 4 rutas "#/normatividad/:tema" (distancias-seguridad,
// zona-servidumbre, enterramiento-ductos, corriente-ntc) definidas en
// js/router.js y js/nav.js (sectionMenus.normatividad).
// Un tema puede llevar una `nota`: texto normativo que se muestra como nota al pie, debajo del visor (ver .nota-pie en app.css).

// Los titulos de «Distancias de seguridad» (numeral + descripcion) son los de la app original de Power Apps (Selector_Tablas).
const TEMAS = {
  "distancias-seguridad": {
    titulo: "Distancias de seguridad",
    selector: true,
    opciones: [
      { label: "Tabla 3.10.1.a — Distancias mínimas de seguridad en zonas con construcciones", img: "assets/normativa/tabla-3-10-1-a.jpg" },
      { label: "Tabla 3.10.2.a — Distancias mínimas de seguridad para diferentes situaciones", img: "assets/normativa/tabla-3-10-2-a.jpg" },
      { label: "Tabla 3.10.3.a — Distancias verticales mínimas en vanos de cruces o recorridos paralelos entre líneas de diferentes tensiones", img: "assets/normativa/tabla-3-10-3-a.jpg" },
      { label: "Tabla 3.10.4.a — Distancia horizontal entre conductores soportados en la misma estructura de apoyo", img: "assets/normativa/tabla-3-10-4-a.jpg" },
      { label: "Tabla 3.10.4.b — Distancia vertical mínima en metros entre conductores sobre la misma estructura", img: "assets/normativa/tabla-3-10-4-b.jpg" },
      { label: "Tabla 3.10.5.b — Distancias mínimas para trabajos en o cerca de partes energizadas en corriente alterna", img: "assets/normativa/tabla-3-10-5-b.jpg" },
      { label: "Tabla 3.10.5.c — Distancias mínimas para trabajos en o cerca de partes energizadas en corriente continua", img: "assets/normativa/tabla-3-10-5-c.jpg" },
      { label: "Tabla 3.22.1.c — Distancias de seguridad en el aire en subestaciones exteriores (Tabla 23.2 en RETIE 2013)", img: "assets/normativa/tabla-3-22-1-c.jpg" },
    ],
  },
  "zona-servidumbre": {
    titulo: "Zona de servidumbre",
    selector: false,
    opciones: [
      { label: "Tabla 3.19.1.a", img: "assets/normativa/tabla-3-19-1-a.jpg" },
      { label: "Figura 3.19.1.a", img: "assets/normativa/figura-3-19-1-a.jpg" },
    ],
  },
  "enterramiento-ductos": {
    titulo: "Enterramiento de ductos",
    selector: true,
    // El numeral 3.20.6.3.g del RETIE 2024 era una imagen de texto que solo remite a estas dos tablas: ahora es la nota al pie.
    nota: {
      titulo: "RETIE 2024, numeral 3.20.6.3.g:",
      texto:
        "La profundidad de enterramiento de ductos para redes de distribución exteriores, internas de un edificio, urbanización cerrada, planta industrial o propiedad privada, deben estar acorde a lo establecido en la Tabla 300.5 de la NTC 2050 segunda actualización para tensiones hasta 1 000 V y la Tabla 300.50 para tensiones mayores a 1 000 V nominales. Excepción: cuando existan conflictos con otras instalaciones subterráneas existentes en áreas peatonales para menos de 150 V a tierra, pueden ser enterradas a una profundidad no menor a 0,45 m.",
    },
    opciones: [
      { label: "NTC 2050, Tabla 300.5 — Enterramiento de conductores de 0 a 1000 V", img: "assets/normativa/tabla-300-5.jpg" },
      { label: "NTC 2050, Tabla 300.50 — Enterramiento de conductores de 1000 V en adelante", img: "assets/normativa/tabla-300-50.jpg" },
    ],
  },
  "corriente-ntc": {
    titulo: "Corriente de conductores NTC 2050",
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
    <div id="imagenes-wrap"></div>
  `;

  const wrap = container.querySelector("#imagenes-wrap");

  if (tema.selector) {
    wrap.innerHTML = `
      <div class="field" style="max-width: 960px;">
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

  // Nota al pie: debajo del visor, siempre visible (no depende de la tabla elegida).
  if (tema.nota) {
    wrap.insertAdjacentHTML("beforeend", `<p class="nota-pie"><strong>${tema.nota.titulo}</strong> ${tema.nota.texto}</p>`);
  }
}
