# Herramientas de Ingeniería — instrucciones para Claude

PWA vanilla (HTML/CSS/JS, sin build step) con calculadoras y catálogos de ingeniería
para líneas y redes de distribución eléctrica. Migración de la app Power Apps
"Herramientas (offline)". Detalle completo de arquitectura en `README.md`.

## Convenciones del proyecto

- Sin build step: no introducir bundlers, transpiladores ni dependencias npm salvo
  que se pida explícitamente. (Única excepción pedida: KaTeX como copia local en `vendor/katex`.)
- `js/calc/*.js`: motores de cálculo puros, sin DOM, 1:1 con las fórmulas del original
  en Power Apps. No mezclar lógica de UI aquí.
- `js/views/*.js`: un módulo por pantalla, exporta `async function render(container, params)`.
- Los datos de catálogos (`data/*.json`) son la fuente de verdad y se editan directamente: el `.msapp` original de Power Apps
  se retiró del repo el 2026-09-19 (sigue en el historial de git) y `tools/extract_data.py` quedó obsoleto (ver README,
  «Catálogos de datos», por si hubiera que regenerarlos).
- Antes de tocar `js/calc/*.js`, revisar si hay un script en `tools/verify_*.py`
  equivalente para validar numéricamente el cambio.
- Revisar la sección "Decisiones de migración que vale la pena recordar" del README
  antes de "corregir" comportamientos que parezcan bugs (algunos son intencionales,
  replicando el comportamiento original).

## Pantallas de Pérdidas y Regulación (tarjetas, varios tramos) y KaTeX

- Regulación (2026-09-19) replica el rediseño de Pérdidas (mismas tarjetas, iconos, relleno, reporte y fórmulas). Diferencias: sin
  factor de carga; por tramo agrega radio medio geométrico (mm, del catálogo, editable con «Manual»), conductores por fase con
  «Separación entre subconductores del haz» (RMG equivalente del haz, `calcularRmgHaz`) y las 3 distancias entre fases (propias de
  cada tramo). Referencias de diseño 5 % (Óptimo) / 10 % (Adecuado) / «Elevado» por encima; NO son límite normativo. El motor
  `js/calc/regulacion.js` y la herramienta de la IA NO se tocan. Lógica en `js/calc/regulacion-tramos.js`; pruebas en
  `tools/verify_regulacion.html`. Las dos fórmulas de caída (`√3·I·Z·L·100/(V·1000)` y `P[kW]·L·K`) son equivalentes (verificado).
- Código compartido para las próximas calculadoras: `js/calc/circuito.js` (dato de partida, `clasificarPorUmbrales`,
  `sugerirCalibre` con `campo`) y `js/util/resultados-ui.js` (tarjeta con pestañas, `reporteHtml` con negrita, panel de fórmulas
  y `activarPestanas`, que además alinea la columna de símbolos midiendo el más ancho: `--ancho-simbolo`). Etiquetas: siempre
  «Óptimo» / «Adecuado» / «Elevado» (antes «Mayores pérdidas»). Clase de tablas de resultado: `.tabla-resultado`.
- Campos numéricos que vienen del catálogo (resistencia, RMG) llevan `step="any"`: con `step="0.01"` el modo «Manual» fallaba la
  validación con valores de 3 decimales (p. ej. 0.396).

- Rediseño acordado con el usuario (2026-09-19) tomando de referencia el módulo de pérdidas de otro proyecto («Calculadora
  Normativa»): tarjeta «Datos de la línea» (con *dato de partida*: MW, MVA o A) + una tarjeta «Conductor — Tramo N» por tramo
  (agregar/quitar, conductores por fase). Los COLORES no cambian (solo tokens existentes) y los resultados van en los formatos
  que ya había (métricas + tablas); **sin gráficos** (barras, velocímetro): el usuario los quiere más adelante, no ahora.
  Unidades: se mantienen MW y MVA. El motor `js/calc/perdidas.js` NO se toca; la suma de tramos y el dato de partida viven en
  `js/calc/perdidas-tramos.js`. La IA (`calcular_perdidas`) sigue igual (un tramo). Pruebas: `tools/verify_perdidas.html`.
- Umbrales 1 % / 3 %: solo «referencias de diseño» (Óptimo / Adecuado / Elevado). NUNCA escribir «fuera de norma».
- Tarjetas (`.form-section`): título como BARRA de borde a borde (`.form-section-title`: fondo `--accent-soft` como el botón activo del
  menú lateral, línea inferior delgada `--accent`, icono `--accent` pleno, centrado vertical, `min-height` fijo para que no cambie al
  aparecer «Quitar»); espacio inferior compacto (`.grid-2.ultima`, relleno de 12px; botón «Agregar tramo» a 10px del último campo).
  Iconos de esta pantalla: `circuitVoltmeter` (línea) y `plugConnected` (conductor), elegidos por el usuario tras probar otros
  (los descartados se borraron de `icons.js`). Copiados del SVG oficial
  de Tabler. La línea inferior de la barra es 35 % menos intensa que `--accent` (`color-mix`, decidido por el usuario tras probar dos
  alternativas; NO usar bordes de 0.5px: desaparecen en pantallas de densidad normal). La fila del calibre sugerido usa el token
  `--fila-sugerida` (verde suave en claro; en oscuro un azul `#344d6a`, más claro que el fondo del panel de resultados para no
  confundirse con él; el verde no se veía bien en oscuro). Para traer un icono real de Tabler: `curl` a internet NO funciona aquí, pero
  WebFetch sobre `raw.githubusercontent.com/tabler/tabler-icons/main/icons/outline/<nombre>.svg` sí (pedir el SVG literal).
- CSS: `.btn` está definido después de las reglas de esta pantalla, así que sus variantes deben escribirse `.btn.clase` (si no,
  `.btn` gana por orden y el padding no cambia). En pruebas de layout tomar TODAS las medidas antes de llamar a `ok()`: el contenedor
  de `verify_perdidas.html` se desplaza cuando crece el texto de resultados. Las media queries dependen del ancho de la ventana:
  para probarlas se usa un iframe de ancho fijo (ver `cargarMarco` en ese arnés).
- Rejillas de campos en pantalla angosta (≤720px): `.grid-2/.grid-3` pasan a una columna y cada `.field` ya trae `margin-bottom`,
  así que a las rejillas de campos se les quita el `row-gap` (`:has(> .field)`); si no, los campos del mismo par quedaban a 32px y
  los de pares distintos a 16px. No quitar el gap a las rejillas de métricas de resultado (no llevan `.field`).
- KaTeX: copia local en `vendor/katex` (MIT, sin npm), carga perezosa (`js/util/katex.js`) al abrir «Fórmulas» y precacheada en
  `sw.js`. El usuario quiere extenderlo a las pestañas «Fórmulas» de las demás calculadoras, una por una. Las ecuaciones van
  DENTRO de una subtarjeta (`.formula-caja`: mismo fondo hundido, borde y esquinas que la caja de «Reporte», sin letra mono); mientras
  KaTeX carga (o si falla) se ve el texto plano `.formula-block`.
- Pestaña «Reporte» (texto para copiar y pegar), estructura pedida por el usuario: `CÁLCULO DE …` (sin dos puntos), línea en
  blanco, línea de 30 guiones y `PARÁMETROS DE ENTRADA:`, línea en blanco, línea de 30 guiones y `RESULTADOS:` (la línea va ENCIMA
  de esas dos etiquetas, con dos puntos al final; las tres etiquetas van en negrita con `<strong>`, el texto copiado no cambia).
  Parámetros = lo que el usuario dio; resultados = todo lo que sale del cálculo (en Pérdidas el Fp va primero; detalle por tramo
  con lo calculado y totales). Si el dato de partida no es la potencia activa, esta va en resultados. Cubierto por la sección
  «estructura del reporte» de `verify_perdidas.html` y `verify_regulacion.html`.
- Las tarjetas de Pérdidas llevan `.tarjeta-borde` (borde `--table-border`: en claro más marcado que `--border`, que casi se perdía
  contra el fondo; en oscuro no cambia). Se dejó en 1px; si aún se ve tenue, probar 1.5px antes que un color nuevo.
  Relleno de esas tarjetas y del panel azul de resultados: 16px (`--pad-tarjeta`, pedido por el usuario; antes 24px = `--space-5`),
  así que del borde exterior al contenido hay 17px (1 de borde). La barra de título usa la misma variable para llegar al borde.
  Solo aplica a `.tarjeta-borde`: las demás `.card` y `.result-panel` de la app siguen en 24px.
- Siguen pendientes por decisión del usuario: gráficos de resultado y aplicar este mismo patrón (tarjetas, etc.) a otras
  calculadoras; los refinamientos visuales de esta pantalla (iconos, títulos) los irá indicando él.
- `assets/ejemplos/` (o `assets/Ejemplos/`) es una carpeta TEMPORAL de referencia del usuario, con un repo git anidado: NO subirla.
  Está excluida en `.git/info/exclude` (local); aun así, hacer `git add` solo con rutas explícitas, nunca `git add -A`/`.`.

## Sección "Funciones de IA" (`js/ai/*`, `js/views/ia*.js`)

- Es la ÚNICA excepción a "100% offline": se conecta a Google Gemini con la clave del propio
  usuario (BYOK, guardada en el navegador; no hay backend). Detalle en el README.
- Análisis con calculadoras tiene agentes (`js/ai/agentes-analisis.js`, botón «Agentes»): el predeterminado («Agente estándar») sale del
  código (`SISTEMA_ANALISIS`/`PROMPT_REPORTE` en `analisis.js`), es de solo lectura y nunca se escribe en `localStorage`; los
  propios se guardan ahí y siempre llevan `REGLA_FIJA` al final. Si cambia el prompt estándar, el predeterminado se actualiza
  solo. Cada agente elige las herramientas que puede usar (campo `herramientas`, casillas en el formulario): el filtro real es
  `declaraciones(permitidas)` + `ctx.permitidas` en `tools.js` (no solo el prompt); un agente guardado sin lista usa las del
  estándar (`HERRAMIENTAS_ESTANDAR`; una herramienta con `opcional: true` queda fuera de ellas: hoy `convertir_unidades` y
  `convertir_coordenadas`, grupo «Varios»). Para exponer otro módulo a la IA: ficha nueva en `tools.js` (campos, `calcular`,
  resultados con `res`), marcarla `opcional` con su `grupo` y agregar sus pruebas. Cubierto por
  `tools/verify_ia.html` (secciones «agentes de análisis» y «herramientas permitidas por agente»).
- Explicación completa de cómo la IA usa las herramientas y de cómo agregar una nueva: `docs/ia-herramientas.md` (léelo antes de
  tocar `tools.js` o los agentes; si cambia ese comportamiento, actualízalo).
- La IA nunca calcula: las calculadoras se exponen como herramientas (`js/ai/tools.js`) que
  llaman a los motores de `js/calc/*.js`. Si cambia la firma de un motor, actualizar su adaptador
  en `tools.js` y correr `tools/verify_ia.html` (arnés en el navegador, ver su encabezado).
- No fijar nombres de modelo en el código (cambian): se listan desde la API en Configuración.
- En `sw.js`, `cache.addAll` falla completo si un archivo de `APP_SHELL` no existe: al agregar
  o borrar archivos, actualizar la lista y subir `CACHE_VERSION`.
- Si `bash` de Git no encuentra `ls/sed/python`, usar PowerShell (`python` sí está en el PATH ahí).
  Para leer resultados de `verify_ia.html`: en Bash sirve `msedge --headless --dump-dom ... | python -c` (con el servidor en
  segundo plano); en PowerShell hace falta `Start-Process -RedirectStandardOutput` (la salida de `--dump-dom` no se captura con `&`).
- Pantallas de chat (Corrector de redacción y Análisis con calculadoras), diseño acordado con el usuario (2026-09-19):
  una tarjeta que crece con la conversación (`.ia-chat--hilo`, SIN barra de scroll propia: desplaza la página); la caja de
  texto es `.ia-caja` con un textarea autoajustable (`ajustarAlto`: debe mostrar completo el placeholder aunque ocupe varias
  líneas y se reajusta con ResizeObserver + rAF; queda a 12px del borde de la tarjeta); Nueva conversación / Dictar / Enviar
  van en una fila `.ia-acciones` DEBAJO de la tarjeta, con botones `.ia-accion` (icono + palabra, sin recuadro hasta pasar el
  cursor). La respuesta de la IA (`.ia-msg--model`) lleva fondo transparente y una línea clara. No poner contador de caracteres
  ni avisos de privacidad en estas pantallas (la privacidad vive en Configuración de IA). Análisis es UNA sola tarjeta
  «Consulta» cuyas sugerencias desaparecen al iniciar el chat: el usuario rechazó dividirla en dos tarjetas.
- Dictado por voz (`js/ai/voz.js`): el pitido lo pone Android al iniciar el reconocimiento y la web no puede silenciarlo; por eso
  NO se reinicia el reconocimiento en las pausas (cada reinicio pita) y en Android los resultados se fusionan con
  `unirAcumulados` (Chrome los entrega acumulados y duplicaba el texto). El usuario descartó transcribir con Gemini y decidió
  (2026-09-19) dejar el dictado como está (además puede dictar con el micrófono del teclado, Gboard): no modificarlo.
- Iconos `send`, `plus`, `copy` y `microphone` (`js/icons.js`) se escribieron de memoria de Tabler: si alguno se ve raro,
  recalcarlo del path real.
- Pruebas en este entorno: `python -m http.server` solo se mantiene con `run_in_background` (con `&` se cae); Edge headless no
  baja de ~500px de ancho (no sirve para medir celular); el tool de Bash convierte las secuencias de escape con doble barra
  invertida (saltos de línea y unicode) dentro de los heredocs de Python: escribir los scripts de edición con Write a un archivo (o usar Edit). Borrar los `_test_*.html` temporales.
- Cada cambio en archivos del shell exige subir `CACHE_VERSION` de `sw.js` (hoy v78); en el celular hay que cerrar la app y
  abrirla dos veces para ver la versión nueva.

## Acceso con Google (Ayuda → "Configuración avanzada", `js/auth/*`, `firebase/firestore.rules`)

- Control de acceso con Firebase (login Google + lista de correos en Firestore). Un login solo en
  pantalla NO protege nada (el código es público): la seguridad son las reglas de
  `firebase/firestore.rules`, que aplica el servidor. Nada confidencial puede ir en `data/*.json` ni
  en el repo: lo protegido debe vivir en el servidor.
- El backend simulado (`backend-mock.js`) es SOLO para pruebas: nunca se elige solo
  (`obtenerBackend()` devuelve null si `firebase-config.js` no tiene la config). Si se cambia el
  modelo de datos o las reglas, actualizar `firestore.rules`, `backend-firebase.js`,
  `backend-mock.js` (que replica las reglas) y correr `tools/verify_ia.html`.
- La clave de Gemini del servidor va SOLO en memoria (`js/ai/clave.js`), nunca en `localStorage`.
- Proyecto de Firebase: `herramientas-ingenieria` (plan Spark), ya configurado en
  `js/auth/firebase-config.js`. Pasos manuales y reglas: README ("Acceso con Google y Firebase").
  Verificado contra el Firebase real: el SDK carga y las lecturas/escrituras sin sesión son
  denegadas por el servidor; el login de Google con el administrador funciona (confirmado por el
  usuario el 2026-09-18). El arnés no puede iniciar sesión: los cambios en las reglas o el login
  se prueban a mano (y con el Simulador de reglas de la consola).

## PENDIENTE (NO implementado): puerta de acceso general con solicitud de acceso

- Análisis del 2026-09-18; el usuario decidió NO implementarlo todavía. **Todo el detalle está en
  `docs/puerta-de-acceso-general.md`: léelo entero antes de retomarlo** (flujo, reglas de Firestore
  en borrador, opciones de correo, diseño offline, riesgos, fases y preguntas abiertas).
- Idea: al abrir la app se pide login con Google; si el correo está en `usuarios` entra (admin o
  usuario); si no, "sin acceso" con botón **Solicitar acceso** que crea `solicitudes/{correo}` y el
  admin aprueba/rechaza en Configuración avanzada. Reutiliza `js/auth/*` y las reglas actuales.
- Advertencia clave: es un control de USO, no de confidencialidad (el sitio y sus archivos son
  públicos en GitHub Pages). Proteger contenido de verdad exigiría Cloudflare Access u otro hosting.
- Decisiones sin confirmar (preguntar al usuario antes de implementar): propósito, alcance (toda la
  app vs solo módulos sensibles), vigencia del permiso offline (recomendado 14 días) y aviso por
  correo (recomendado: sin correo al inicio).

## Convenciones de UI/CSS

- Iconos (`js/icons.js`): SVG inline propios, sin CDN (requisito de offline). El estilo
  visual replica Tabler Icons (outline, stroke-width 2 envuelto en `<g>` para los iconos
  "tablerizados"). Un mismo nombre de icono (`calculator`, `book`, `archive`, `grid`...)
  se reutiliza entre el sidebar (`js/nav.js`) y las tarjetas de Home (`js/views/inicio.js`)
  para que coincidan visualmente sin duplicar definiciones.
- `.content` (`css/app.css`) ya NO tiene `max-width`/centrado: ocupa todo el ancho
  disponible junto al sidebar en todas las vistas (se quitó el `max-width:1100px` el
  2026-09-17 porque dejaba un espacio vacío grande a la derecha en pantallas anchas).
- Todas las tarjetas de menú (Home y los submenús Cálculos/Catálogos/Normatividad/Funciones de IA/Varios)
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
- Las pantallas NO llevan descripción bajo el título (decidido el 2026-09-18: ya la dicen las
  tarjetas de menú); no volver a agregarla, ni tampoco el texto de bienvenida del Home (también
  retirado). `.page-subtitle` solo se usa en el "objeto" de la resolución
  (`detalle-resolucion.js`, es un dato). `.page-title`
  ya trae el margen inferior de una pantalla sin descripción. `sectionMeta.*.subtitle` (`nav.js`)
  se conserva porque la pantalla Ayuda lo muestra en la tarjeta de cada sección.
- Modo oscuro: `--bg` es `#0f0f0f` (antes `#1e1e1e`, se oscureció ~50% el 2026-09-17).
- Tema claro (2026-09-18): barra de título de color sólido `#0a5f5e` (sin degradado), `--bg` `#e7eaee`
  y `--bg-sunken` `#dce1e8`; encabezados de tabla en verde (`--thead-bg`/`--thead-fg`) y borde
  exterior de tablas más marcado (`--table-border`). El tema oscuro conserva sus valores: al
  cambiar colores usar estas variables, no valores fijos.
- Ficha de detalle de conductor (`detalle-conductor.js`, 3 familias): lista de filas en dos
  columnas (`.detail-list`/`.detail-row`, filas de 50px, valores alineados a la izquierda); en
  <=560px la columna de etiquetas se ajusta a la más larga. `.detail-grid`/`.detail-item` se
  conservan solo para el detalle de resoluciones: no tocarlos al cambiar la ficha de conductor.
- Medir posiciones/tamaños en el navegador (script CDP o iframe) en vez de a ojo; el Edge de
  pruebas reutiliza el service worker: usar un perfil limpio para ver CSS recién cambiado.

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
