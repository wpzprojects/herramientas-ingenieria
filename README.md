# Herramientas de Ingeniería

PWA (Progressive Web App) instalable con calculadoras y catálogos de ingeniería para líneas y redes de distribución eléctrica: ampacidad (IEEE Std 738 / IEC 60287-1-1), cortocircuito, pérdidas, regulación, ocupación de ductos, catálogos de conductores, normatividad RETIE/NTC-2050/CREG, conversión de unidades y de coordenadas.

Migración a HTML/CSS/JS (vanilla, sin build step) de la app original de Power Apps "Herramientas (offline)" (`APP_PowerApps/Herramientas (offline).msapp`). 100% estática y offline: no requiere backend ni conexión a internet salvo un enlace externo opcional en Conversión de coordenadas.

## Ejecutar localmente

No hay build step. Basta con servir la carpeta con cualquier servidor estático (el `fetch()` de los módulos y de los datos requiere `http://`, no funciona abriendo `index.html` directamente con `file://`):

```
npx serve .
# o
python -m http.server 8080
```

Y abrir `http://localhost:PUERTO/`.

## Estructura

```
index.html, manifest.webmanifest, sw.js   # shell PWA
css/                                       # tokens.css (paleta clara/oscura) + app.css (componentes)
js/app.js, router.js, nav.js, icons.js     # bootstrap, router SPA por hash, navegacion, iconos SVG inline
js/util/format.js                          # formato de numeros, fetch de datos con cache, helpers DOM
js/calc/*.js                               # motores de calculo PUROS (sin DOM), 1:1 con las formulas originales
js/views/*.js                              # 1 modulo por pantalla: export async function render(container, params)
data/*.json                                # catalogos (conductores, tuberias, resoluciones, codificacion, factores de conversion)
assets/normativa/*.jpg                     # tablas/figuras normativas escaneadas (RETIE / NTC 2050)
icons/                                     # iconos PWA (placeholder generado, ver mas abajo)
tools/                                     # scripts de extraccion/verificacion (no forman parte de la app en runtime)
APP_PowerApps/                             # app original de Power Apps (fuente de verdad de datos y formulas)
```

## Actualizar los catálogos desde una nueva exportación del .msapp

1. Reemplaza `APP_PowerApps/Herramientas (offline).msapp` por la nueva exportación.
2. Descomprímelo (es un .zip) a `APP_PowerApps/_extracted/` — esa carpeta está en `.gitignore` porque es 100% regenerable:
   ```
   unzip "APP_PowerApps/Herramientas (offline).msapp" -d "APP_PowerApps/_extracted"
   ```
3. Ejecuta `python tools/extract_data.py` — regenera `data/*.json` (excepto `data/factores-conversion.json`, que se transcribió a mano porque esa tabla vive embebida en un `.pa.yaml` y no en `DataSources.json`; revisa `Src/Pantalla_Conversion_Unidadades.pa.yaml` si esa tabla cambia).
4. Si cambiaron las imágenes normativas, vuelve a copiarlas a `assets/normativa/` (ver el mapeo de nombres en `References/Resources.json` dentro de `_extracted`).

## Verificación de los motores de cálculo

`tools/verify_calc.py` y `tools/verify_coordenadas.py` son scripts Python independientes (reimplementan las mismas fórmulas en otro lenguaje) usados para validar numéricamente los módulos de `js/calc/` durante la migración — no son parte de la app, pero conviene conservarlos como referencia/regresión si se vuelve a tocar esa lógica.

## Decisiones de migración que vale la pena recordar

- **Pérdidas**: se replicó el factor de pérdidas *lineal* (`0.7·Fc + 0.3`) tal como corre en la app original, no la forma cuadrática de Buller-Woodrow que aparece documentada (pero no implementada) en el panel de fórmulas original. Ver `js/calc/perdidas.js`.
- **Ampacidad subterránea**: se corrigió un bug del original donde el desplegable de calibres decía "1000 AWG" pero la tabla de construcción de cable usaba "1000 kcmil" (`data/construccion-cable-subterraneo.json` ya viene con el valor correcto).
- **Conversión de coordenadas**: `Atan2` en Power Fx sigue la convención de Excel (`Atan2(x, y)`), que equivale a `Math.atan2(y, x)` en JavaScript (orden de argumentos invertido). Ya corregido y validado con un caso de ida y vuelta exacto en `js/calc/coordenadas.js`.
- Los paneles "Reporte" y "Fórmulas" de cada calculadora, que en el original estaban condicionados a un nivel de acceso oculto (`vAcceso >= 3`, fijado siempre en 3 al abrir la app), quedan siempre visibles en la PWA.
- Se omitieron del menú las 6 opciones que ya estaban deshabilitadas/sin implementar en la app original (resistencia de puesta a tierra, DPS, catálogo de aisladores, criterios Celsia, bitácora, verificación documental) y la pantalla de desarrollo interno (`Pantalla_Pruebas`).

## Iconos / logo

`icons/icon-192.png`, `icon-512.png`, `icon-maskable-512.png` e `icons/icon.svg` son un placeholder generado con `tools/generate_icons.py` (sin dependencias externas). Reemplázalos cuando haya un logo definitivo y vuelve a ejecutar el script si quieres regenerar variantes, o simplemente sobrescribe los PNG/SVG manualmente manteniendo los mismos nombres de archivo.

## Publicar en GitHub Pages

1. Push a la rama `main` del repositorio remoto.
2. En GitHub → Settings → Pages, selecciona "Deploy from a branch", rama `main`, carpeta `/ (root)`.
3. La PWA queda instalable (Chrome/Edge: ícono de instalación en la barra de direcciones; Android: "Agregar a pantalla de inicio"; iOS/Safari: compartir → "Agregar a pantalla de inicio") una vez servida por HTTPS.
