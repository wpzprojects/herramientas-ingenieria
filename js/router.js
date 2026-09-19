// Router SPA minimalista basado en hash (#/seccion/pantalla/:param).
// Un modulo por pantalla, cada uno exporta render(container, params).

// Representa cualquier path (patron de ruta o hash actual) como su lista de
// segmentos no vacios -- "/", "/calculos/" y "/calculos" quedan todos
// canonicalizados de forma consistente ([] vs ["calculos"]), evitando el
// caso especial roto de tratar "/" como cadena vacia en un extremo y como
// "/" en el otro.
function segmentsOf(path) {
  return path.split("/").filter(Boolean);
}

function compile(pattern) {
  const names = [];
  const regexParts = segmentsOf(pattern).map((seg) => {
    if (seg.startsWith(":")) {
      names.push(seg.slice(1));
      return "([^/]+)";
    }
    return seg.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  });
  return { regex: new RegExp(`^/${regexParts.join("/")}$`), names };
}

const routeTable = [
  ["/", () => import("./views/inicio.js")],
  ["/calculos", () => import("./views/calculos.js")],
  ["/calculos/ampacidad-aerea", () => import("./views/calc-ampacidad-aerea.js")],
  ["/calculos/ampacidad-subterranea", () => import("./views/calc-ampacidad-subterranea.js")],
  ["/calculos/cortocircuito", () => import("./views/calc-cortocircuito.js")],
  ["/calculos/perdidas", () => import("./views/calc-perdidas.js")],
  ["/calculos/regulacion", () => import("./views/calc-regulacion.js")],
  ["/calculos/ocupacion-ductos", () => import("./views/calc-ocupacion-ductos.js")],
  ["/catalogos", () => import("./views/catalogos.js")],
  ["/catalogos/:familia", () => import("./views/catalogo-conductores.js")],
  ["/catalogos/:familia/:id", () => import("./views/detalle-conductor.js")],
  ["/normatividad", () => import("./views/normatividad.js")],
  ["/normatividad/resoluciones", () => import("./views/resoluciones.js")],
  ["/normatividad/resoluciones/:id", () => import("./views/detalle-resolucion.js")],
  // debe ir despues de las rutas literales de arriba (mas especificas) para
  // que no se las "coma" este catch-all generico de visor de imagenes:
  ["/normatividad/:tema", () => import("./views/normativa-imagen.js")],
  ["/varios", () => import("./views/varios.js")],
  ["/varios/codificacion", () => import("./views/codificacion.js")],
  ["/varios/conversion-coordenadas", () => import("./views/conversion-coordenadas.js")],
  ["/varios/conversion-unidades", () => import("./views/conversion-unidades.js")],
  ["/ia", () => import("./views/ia.js")],
  ["/ia/analisis", () => import("./views/ia-analisis.js")],
  ["/ia/redaccion", () => import("./views/ia-redaccion.js")],
  ["/ia/configuracion", () => import("./views/ia-configuracion.js")],
  ["/ayuda", () => import("./views/ayuda.js")],
].map(([pattern, load]) => ({ ...compile(pattern), pattern, load }));

function currentPath() {
  const hash = location.hash || "#/";
  return `/${segmentsOf(hash.slice(1)).join("/")}`;
}

function match(path) {
  for (const route of routeTable) {
    const m = path.match(route.regex);
    if (m) {
      const params = {};
      route.names.forEach((name, i) => (params[name] = decodeURIComponent(m[i + 1])));
      return { route, params };
    }
  }
  return null;
}

export function initRouter({ mount, onNavigate }) {
  let token = 0;

  async function renderCurrent() {
    const path = currentPath();
    const found = match(path);
    const myToken = ++token;

    if (!found) {
      mount.innerHTML = "";
      mount.append(
        Object.assign(document.createElement("div"), {
          className: "empty-state",
          innerHTML: `<h2>Pantalla no encontrada</h2><p class="text-muted">La ruta <code>${path}</code> no existe.</p><p><a class="btn btn-primary" href="#/">Ir al inicio</a></p>`,
        })
      );
      onNavigate?.(path, {});
      return;
    }

    try {
      const mod = await found.route.load();
      if (myToken !== token) return; // navegacion mas reciente ya en curso
      mount.innerHTML = "";
      mount.scrollTop = 0;
      await mod.render(mount, found.params);
      mount.focus({ preventScroll: true });
    } catch (err) {
      console.error("Error cargando la vista:", err);
      mount.innerHTML = `<div class="empty-state"><h2>Ocurrio un error cargando esta pantalla</h2><p class="text-muted mono">${String(err.message || err)}</p></div>`;
    }
    onNavigate?.(path, found.params);
  }

  window.addEventListener("hashchange", renderCurrent);
  renderCurrent();

  return { refresh: renderCurrent, currentPath };
}
