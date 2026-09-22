// Service worker: cachea toda la app (shell + datos + imagenes normativas)
// en la instalacion para que funcione 100% offline desde el primer uso, y
// sirve cache-first con relleno en segundo plano (stale-while-revalidate)
// para lo que no estuviera precacheado.

const CACHE_VERSION = "v276";
const CACHE_NAME = `herramientas-ingenieria-${CACHE_VERSION}`;

const SCOPE = self.registration.scope;
const u = (p) => new URL(p, SCOPE).toString();

const APP_SHELL = [
  "./",
  "index.html",
  "manifest.webmanifest",
  "css/tokens.css",
  "css/app.css",
  "js/app.js",
  "js/router.js",
  "js/nav.js",
  "js/icons.js",
  "js/util/format.js",
  "js/util/katex.js",
  "js/util/proj4.js",
  "js/util/proj4-col-urban.js",
  "js/util/resultados-ui.js",
  "js/util/info-campo.js",
  "js/util/portapapeles.js",
  "js/util/zip.js",
  "js/util/graficos.js",
  "js/util/tarjetas-plegables.js",
  "js/util/persistencia-calculo.js",
  "js/calc/ampacidad-aerea.js",
  "js/calc/ampacidad-subterranea.js",
  "js/calc/ampacidad-subterranea-pantalla.js",
  "js/calc/cortocircuito.js",
  "js/calc/perdidas.js",
  "js/calc/circuito.js",
  "js/calc/perdidas-tramos.js",
  "js/calc/conductor-economico.js",
  "js/calc/regulacion-tramos.js",
  "js/calc/ocupacion-grupos.js",
  "js/calc/cortocircuito-calibre.js",
  "js/calc/regulacion.js",
  "js/calc/ocupacion-ductos.js",
  "js/calc/unidades.js",
  "js/calc/unidades-extendido.js",
  "js/calc/coordenadas.js",
  "js/calc/coordenadas-epsg.js",
  "js/ai/config.js",
  "js/ai/gemini.js",
  "js/ai/historial.js",
  "js/ai/markdown.js",
  "js/ai/ui-clave.js",
  "js/ai/agentes.js",
  "js/ai/agentes-analisis.js",
  "js/ai/tools.js",
  "js/ai/analisis.js",
  "js/ai/reporte.js",
  "js/ai/docx.js",
  "js/ai/clave.js",
  "js/ai/voz.js",
  "js/auth/backend.js",
  "js/auth/backend-firebase.js",
  "js/auth/firebase-config.js",
  "js/views/inicio.js",
  "js/views/calculos.js",
  "js/views/catalogos.js",
  "js/views/normatividad.js",
  "js/views/varios.js",
  "js/views/ia.js",
  "js/views/ia-analisis.js",
  "js/views/ia-redaccion.js",
  "js/views/ia-configuracion.js",
  "js/views/ayuda.js",
  "js/views/configuracion-avanzada.js",
  "js/auth/acceso.js",
  "js/auth/permisos.js",
  "js/util/tiles.js",
  "js/util/tema.js",
  "js/views/calc-ampacidad-aerea.js",
  "js/views/calc-ampacidad-subterranea.js",
  "js/views/calc-cortocircuito.js",
  "js/views/calc-perdidas.js",
  "js/views/calc-conductor-economico.js",
  "js/views/calc-regulacion.js",
  "js/views/calc-ocupacion-ductos.js",
  "js/views/catalogo-conductores.js",
  "js/views/detalle-conductor.js",
  "js/views/normativa-imagen.js",
  "js/views/resoluciones.js",
  "js/views/detalle-resolucion.js",
  "js/views/conversion-unidades.js",
  "js/views/conversion-coordenadas.js",
  "js/views/codificacion.js",
  "icons/icon-192.png",
  "icons/icon-512.png",
  "icons/icon-maskable-512.png",
  "data/conductores-desnudos.json",
  "data/conductores-semiaislados.json",
  "data/conductores-xlpe.json",
  "data/tuberias.json",
  "data/sistemas-epsg.json",
  "data/construccion-cable-subterraneo.json",
  "data/codificacion.json",
  "data/resoluciones.json",
  "data/factores-conversion.json",
  "data/unidades.json",
  "assets/normativa/tabla-3-10-1-a.jpg",
  "assets/normativa/tabla-3-10-2-a.jpg",
  "assets/normativa/tabla-3-10-3-a.jpg",
  "assets/normativa/tabla-3-10-4-a.jpg",
  "assets/normativa/tabla-3-10-4-b.jpg",
  "assets/normativa/tabla-3-10-5-b.jpg",
  "assets/normativa/tabla-3-10-5-c.jpg",
  "assets/normativa/tabla-3-19-1-a.jpg",
  "assets/normativa/figura-3-19-1-a.jpg",
  "assets/normativa/tabla-300-5.jpg",
  "assets/normativa/tabla-300-50.jpg",
  "assets/normativa/capacidad-corriente-conductores-ntc.jpg",
  "assets/normativa/tabla-3-22-1-c.jpg",
  "vendor/katex/katex.min.js",
  "vendor/proj4/proj4.js",
  "vendor/katex/katex.min.css",
  "vendor/katex/fonts/KaTeX_AMS-Regular.woff2",
  "vendor/katex/fonts/KaTeX_Caligraphic-Bold.woff2",
  "vendor/katex/fonts/KaTeX_Caligraphic-Regular.woff2",
  "vendor/katex/fonts/KaTeX_Fraktur-Bold.woff2",
  "vendor/katex/fonts/KaTeX_Fraktur-Regular.woff2",
  "vendor/katex/fonts/KaTeX_Main-Bold.woff2",
  "vendor/katex/fonts/KaTeX_Main-BoldItalic.woff2",
  "vendor/katex/fonts/KaTeX_Main-Italic.woff2",
  "vendor/katex/fonts/KaTeX_Main-Regular.woff2",
  "vendor/katex/fonts/KaTeX_Math-BoldItalic.woff2",
  "vendor/katex/fonts/KaTeX_Math-Italic.woff2",
  "vendor/katex/fonts/KaTeX_SansSerif-Bold.woff2",
  "vendor/katex/fonts/KaTeX_SansSerif-Italic.woff2",
  "vendor/katex/fonts/KaTeX_SansSerif-Regular.woff2",
  "vendor/katex/fonts/KaTeX_Script-Regular.woff2",
  "vendor/katex/fonts/KaTeX_Size1-Regular.woff2",
  "vendor/katex/fonts/KaTeX_Size2-Regular.woff2",
  "vendor/katex/fonts/KaTeX_Size3-Regular.woff2",
  "vendor/katex/fonts/KaTeX_Size4-Regular.woff2",
  "vendor/katex/fonts/KaTeX_Typewriter-Regular.woff2",
].map(u);

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(CACHE_NAME)
      .then((cache) => cache.addAll(APP_SHELL))
      .then(() => self.skipWaiting())
      .catch((err) => console.warn("[sw] fallo precacheando el shell completo:", err))
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET" || !req.url.startsWith(self.location.origin)) return;

  event.respondWith(
    caches.open(CACHE_NAME).then(async (cache) => {
      const cached = await cache.match(req);
      const network = fetch(req)
        .then((res) => {
          if (res && res.ok) cache.put(req, res.clone());
          return res;
        })
        .catch(() => cached);
      return cached || network;
    })
  );
});
