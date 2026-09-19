# Herramientas de Ingeniería — instrucciones para Claude

PWA vanilla (HTML/CSS/JS, sin build step) con calculadoras y catálogos de ingeniería
para líneas y redes de distribución eléctrica. Migración de la app Power Apps
"Herramientas (offline)". Detalle completo de arquitectura en `README.md`.

## Convenciones del proyecto

- Sin build step: no introducir bundlers, transpiladores ni dependencias npm salvo
  que se pida explícitamente.
- `js/calc/*.js`: motores de cálculo puros, sin DOM, 1:1 con las fórmulas del original
  en Power Apps. No mezclar lógica de UI aquí.
- `js/views/*.js`: un módulo por pantalla, exporta `async function render(container, params)`.
- Los datos de catálogos (`data/*.json`) son generados desde el `.msapp` original con
  `tools/extract_data.py` — no editarlos a mano salvo `data/factores-conversion.json`
  (documentado en el README, transcrito manualmente).
- Antes de tocar `js/calc/*.js`, revisar si hay un script en `tools/verify_*.py`
  equivalente para validar numéricamente el cambio.
- Revisar la sección "Decisiones de migración que vale la pena recordar" del README
  antes de "corregir" comportamientos que parezcan bugs (algunos son intencionales,
  replicando el comportamiento original).

## Sección "Funciones de IA" (`js/ai/*`, `js/views/ia*.js`)

- Es la ÚNICA excepción a "100% offline": se conecta a Google Gemini con la clave del propio
  usuario (BYOK, guardada en el navegador; no hay backend). Detalle en el README.
- La IA nunca calcula: las calculadoras se exponen como herramientas (`js/ai/tools.js`) que
  llaman a los motores de `js/calc/*.js`. Si cambia la firma de un motor, actualizar su adaptador
  en `tools.js` y correr `tools/verify_ia.html` (arnés en el navegador, ver su encabezado).
- No fijar nombres de modelo en el código (cambian): se listan desde la API en Configuración.
- En `sw.js`, `cache.addAll` falla completo si un archivo de `APP_SHELL` no existe: al agregar
  o borrar archivos, actualizar la lista y subir `CACHE_VERSION`.
- Si `bash` de Git no encuentra `ls/sed/python`, usar PowerShell (`python` sí está en el PATH ahí).
  Para leer resultados de `verify_ia.html` con Edge headless hace falta `Start-Process
  -RedirectStandardOutput` (la salida de `--dump-dom` no se captura con `&`).

## Convenciones de UI/CSS

- Iconos (`js/icons.js`): SVG inline propios, sin CDN (requisito de offline). El estilo
  visual replica Tabler Icons (outline, stroke-width 2 envuelto en `<g>` para los iconos
  "tablerizados"). Un mismo nombre de icono (`calculator`, `book`, `archive`, `grid`...)
  se reutiliza entre el sidebar (`js/nav.js`) y las tarjetas de Home (`js/views/inicio.js`)
  para que coincidan visualmente sin duplicar definiciones.
- `.content` (`css/app.css`) ya NO tiene `max-width`/centrado: ocupa todo el ancho
  disponible junto al sidebar en todas las vistas (se quitó el `max-width:1100px` el
  2026-09-17 porque dejaba un espacio vacío grande a la derecha en pantallas anchas).
- Todas las tarjetas de menú (Home y los submenús Cálculos/Catálogos/Normatividad/Varios)
  usan el layout horizontal (icono circular a la izquierda, texto a la derecha) vía las
  clases modificadoras `.menu-grid--row` / `.menu-tile--row` (renombradas desde `--home`
  el 2026-09-17 al dejar de ser exclusivas del Home). El título+descripción van envueltos
  en un `<span class="tile-body">`.
- Iconos en `js/icons.js` deben calcarse trazo a trazo del path real de Tabler Icons, no
  aproximarse: un pequeño error en las coordenadas (p.ej. el icono `hash`, corregido el
  2026-09-17) deforma visualmente el símbolo.
- Menú lateral: en pantallas anchas (>880px) se puede contraer con el botón del fondo de la barra
  (queda una barra de 64px solo con iconos; estado en `localStorage.sidebarCollapsed` y clase
  `sb-collapsed` en `<html>`). La barra es `sticky` con el alto de la ventana para que el botón
  quede siempre en el borde inferior visible sin scroll propio. En móvil se ignora y se usa el
  cajón emergente. Medir posiciones/espaciados con un iframe temporal, no a ojo. El orden
  del menú (`sidebarLinks` en `js/nav.js`) es Cálculos, Catálogos, Normatividad, Funciones de IA,
  Varios, Ayuda; el Home y Ayuda siguen el mismo orden.
- PRUEBA (2026-09-18): las descripciones `.page-subtitle` bajo el título de cada pantalla están
  ocultas por CSS (regla en `css/app.css`), pendientes de decidir si se eliminan del todo; el HTML
  sigue en las vistas. `.page-subtitle--dato` (p. ej. el "objeto" en `detalle-resolucion.js`) es un
  dato real y sigue visible. Si se decide borrarlas, quitar los `<p class="page-subtitle">` de las
  vistas y `sectionMeta.*.subtitle` de `nav.js` (Ayuda lo usa) y limpiar la regla.
- Modo oscuro: `--bg` es `#0f0f0f` (antes `#1e1e1e`, se oscureció ~50% el 2026-09-17).

## Verificación visual de cambios de UI

En este entorno (Windows, bash de Git) no hay Node/npx/chromium-cli disponibles para
Playwright. Para verificar visualmente un cambio de UI: levantar `python -m http.server`
en el directorio del proyecto y tomar un screenshot con Edge headless vía PowerShell:

```
& "C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe" --headless --disable-gpu `
  --screenshot="$env:TEMP\out.png" --window-size=960,700 --virtual-time-budget=4000 `
  "http://localhost:PUERTO/index.html#/ruta"
```

Luego leer la imagen con la herramienta de lectura de archivos. Recordar detener el
servidor de prueba al terminar.

## Flujo de trabajo con git

- Después de cada commit, hacer `git push` de inmediato sin pedir confirmación.
- Commits en español, concisos, describiendo el cambio funcional (no el "qué" obvio
  del diff).

## Estilo de comunicación

- Respuestas breves y directas.
- El usuario suele trabajar en español; responder en español salvo que pida lo contrario.

---
_Este archivo se actualiza al final de cada sesión de trabajo con reglas o contexto
nuevo que sea coherente conservar. Si algo aquí queda desactualizado, corregirlo en
lugar de acumular excepciones._
