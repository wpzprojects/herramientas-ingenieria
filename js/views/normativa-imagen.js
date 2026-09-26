// Visor generico de imagenes normativas, parametrizado por :tema en la URL.
// Cubre las rutas "#/normatividad/:tema" (distancias-seguridad y corriente-ntc; zona-servidumbre y
// enterramiento-ductos pasaron a la Biblioteca técnica el 2026-09-26) definidas en
// js/router.js y js/nav.js (sectionMenus.normatividad).
// Un tema puede llevar una `nota`: texto normativo que se muestra como nota al pie, debajo del visor (ver .nota-pie en app.css).

// Los titulos de «Distancias de seguridad» (numeral + descripcion) son los de la app original de Power Apps (Selector_Tablas).
import { ZOOM_INICIAL, zoomHtml, activarZoom, zoomDe } from "../util/zoom-imagen.js";

// Prefijo de ruta (igual que js/util/format.js, katex.js, proj4.js): en la app real (servida desde la raiz) queda vacio; solo
// lo necesitan los arneses de pruebas de tools/, que fijan window.__BASE_PATH__ = "../" para que las imagenes SI se descarguen
// de verdad (algunas pruebas de la tabla partida miden el alto real de la imagen cargada, no solo el atributo src).
const rutaImg = (src) => `${window.__BASE_PATH__ || ""}${src}`;

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
  "corriente-ntc": {
    titulo: "Corriente de conductores NTC 2050",
    selector: false,
    opciones: [
      {
        label: "Capacidad de corriente de conductores",
        img: "assets/normativa/capacidad-corriente-conductores-ntc.jpg",
        // Encabezado (titulo + bancos de conductos + fila de unidades) = ~30% de la altura de la imagen,
        // medido sobre el archivo real (linea que separa la fila "AWG/kcmil..." de la primera fila de datos).
        // filaFraccion = alto de UNA fila de datos, tambien medido sobre el archivo real (promedio de las
        // lineas horizontales de la zona de datos, ~57.8px de 2177px de alto): deja subir el cuerpo hasta que
        // la ULTIMA fila quede pegada al encabezado, sin pasarse a una pantalla completamente en blanco.
        partida: { fraccion: 0.3, filaFraccion: 0.0266, altoCuerpo: 420 },
      },
    ],
  },
};

// Encabezado fijo (recortado con overflow:hidden) + cuerpo con scroll, ambos mostrando la MISMA imagen a la
// misma escala para que las columnas coincidan; ver .tabla-partida en app.css. `data-lightbox` va en el
// contenedor exterior (no en cada <img>), asi que tocar cualquiera de las dos partes abre la imagen COMPLETA
// en la lightbox, nunca un recorte.
function montarTablaPartida(host, op) {
  const { fraccion, filaFraccion = 0, altoCuerpo = 420 } = op.partida;
  host.innerHTML = `
    <div class="tabla-partida" data-lightbox="${rutaImg(op.img)}">
      <div class="tabla-partida__encabezado"><img src="${rutaImg(op.img)}" alt="${op.label} (encabezado)" style="width:${ZOOM_INICIAL}%"></div>
      <div class="tabla-partida__cuerpo" style="max-height:${altoCuerpo}px">
        <div class="tabla-partida__cuerpo-inner"><img src="${rutaImg(op.img)}" alt="${op.label}" style="width:${ZOOM_INICIAL}%"></div>
      </div>
    </div>
  `;

  const encImg = host.querySelector(".tabla-partida__encabezado img");
  const encWrap = host.querySelector(".tabla-partida__encabezado");
  const cuerpo = host.querySelector(".tabla-partida__cuerpo");
  const cuerpoInner = host.querySelector(".tabla-partida__cuerpo-inner");

  // Aplica el recorte del encabezado y dos ajustes mas: espacio en blanco al final (para poder subir la
  // ULTIMA fila hasta que quede pegada al encabezado, no a medio viewport) y compensacion del ancho de la
  // barra de scroll del cuerpo (si la hay: en Windows sin mouse/touch suele medir ~15-17px), para que sus
  // columnas no queden mas angostas que las del encabezado.
  function aplicar(alturaTotal) {
    const alturaEnc = Math.round(alturaTotal * fraccion);
    const alturaFila = Math.round(alturaTotal * filaFraccion);
    encWrap.style.height = `${alturaEnc}px`;
    cuerpoInner.style.marginTop = `-${alturaEnc}px`;
    // Deja subir hasta que la ULTIMA fila quede pegada arriba (una fila de alto visible + el resto en
    // blanco), en vez de quedarse a medio viewport sin poder alinearla con el encabezado.
    cuerpoInner.style.paddingBottom = `${Math.max(altoCuerpo - alturaFila, 0)}px`;
    return alturaEnc;
  }

  function ajustar() {
    let alturaTotal = encImg.getBoundingClientRect().height;
    if (!alturaTotal) return;
    aplicar(alturaTotal);
    // El padding-right que sigue reduce el ancho (y por tanto el alto) de la imagen del encabezado: se
    // vuelve a medir y aplicar una vez mas para que el recorte quede exacto con el ancho final.
    const anchoBarra = cuerpo.offsetWidth - cuerpo.clientWidth;
    encWrap.style.paddingRight = `${anchoBarra}px`;
    alturaTotal = encImg.getBoundingClientRect().height;
    if (alturaTotal) aplicar(alturaTotal);
  }

  if (encImg.complete) ajustar();
  else encImg.addEventListener("load", ajustar, { once: true });

  // Zoom (2026-09-26): las dos copias cambian de ancho juntas y se vuelve a medir el recorte; con zoom mayor a 100 % el
  // cuerpo se desplaza a lo ancho y el encabezado lo sigue, para que las columnas sigan alineadas.
  const cuerpoImg = cuerpoInner.querySelector("img");
  host._zoom = (z) => {
    encImg.style.width = cuerpoImg.style.width = `${z}%`;
    ajustar();
    encWrap.scrollLeft = cuerpo.scrollLeft;
  };
  cuerpo.addEventListener("scroll", () => (encWrap.scrollLeft = cuerpo.scrollLeft));

  let temporizador;
  const alRedimensionar = () => {
    clearTimeout(temporizador);
    temporizador = setTimeout(ajustar, 120);
  };
  window.addEventListener("resize", alRedimensionar);

  return () => {
    clearTimeout(temporizador);
    window.removeEventListener("resize", alRedimensionar);
  };
}

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
      <div class="zoom-barra">${zoomHtml()}</div>
      <div class="image-frame marco-zoom" id="frame-imagen"></div>
    `;
    const grupoZoom = wrap.querySelector(".zoom-imagen");

    const sel = wrap.querySelector("#sel-tabla");
    const frame = wrap.querySelector("#frame-imagen");

    let limpiezaActual = null;
    function pintarImagen(idx) {
      limpiezaActual?.();
      limpiezaActual = null;
      const op = tema.opciones[idx];
      if (op.partida) {
        frame.classList.remove("image-frame"); // .tabla-partida ya trae su propio borde/relleno
        limpiezaActual = montarTablaPartida(frame, op);
      } else {
        frame.classList.add("image-frame");
        frame.innerHTML = `<img src="${rutaImg(op.img)}" data-lightbox="${rutaImg(op.img)}" alt="${op.label}" style="width:${zoomDe(grupoZoom)}%">`; // conserva el zoom elegido
      }
    }

    sel.addEventListener("change", () => pintarImagen(Number(sel.value)));
    pintarImagen(0);
    activarZoom(wrap, (grupo, z) => {
      const imagen = frame.querySelector(":scope > img");
      if (imagen) imagen.style.width = `${z}%`;
      else frame._zoom?.(z);
    });

    // Nota al pie: debajo del visor, siempre visible (no depende de la tabla elegida).
    if (tema.nota) {
      wrap.insertAdjacentHTML("beforeend", `<p class="nota-pie"><strong>${tema.nota.titulo}</strong> ${tema.nota.texto}</p>`);
    }
    return () => limpiezaActual?.();
  } else {
    // Con varias imagenes van lado a lado (2 columnas); con una sola (Corriente NTC 2050) ocupa todo el ancho, como los demas visores.
    wrap.innerHTML = `
      <div${tema.opciones.length > 1 ? ' class="grid-2"' : ""}>
        ${tema.opciones
          .map(
            (op, i) => `
          <div class="visor-con-zoom" data-op="${i}">
            <div class="zoom-cab"><h3 class="section-title">${op.label}</h3>${zoomHtml(op.label)}</div>
            ${
              op.partida
                ? `<div data-partida="${i}"></div>`
                : `<div class="image-frame marco-zoom"><img src="${rutaImg(op.img)}" data-lightbox="${rutaImg(op.img)}" alt="${op.label}" style="width:${ZOOM_INICIAL}%"></div>`
            }
          </div>`
          )
          .join("")}
      </div>
    `;

    const limpiezas = [];
    wrap.querySelectorAll("[data-partida]").forEach((host) => {
      const op = tema.opciones[Number(host.dataset.partida)];
      limpiezas.push(montarTablaPartida(host, op));
    });
    activarZoom(wrap, (grupo, z) => {
      const visor = grupo.closest(".visor-con-zoom");
      const partida = visor.querySelector("[data-partida]");
      if (partida) partida._zoom?.(z);
      else visor.querySelector(".marco-zoom img").style.width = `${z}%`;
    });

    // Nota al pie: debajo del visor, siempre visible (no depende de la tabla elegida).
    if (tema.nota) {
      wrap.insertAdjacentHTML("beforeend", `<p class="nota-pie"><strong>${tema.nota.titulo}</strong> ${tema.nota.texto}</p>`);
    }
    return () => limpiezas.forEach((fn) => fn());
  }
}
