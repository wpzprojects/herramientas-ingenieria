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
  cada tramo). Referencias de diseño 5 % (Óptimo) / 10 % (Aceptable) / «Elevado» por encima; NO son límite normativo, y en pantalla
  el texto es solo «Referencias de diseño: hasta X% óptimo · hasta Y% aceptable.» (el usuario pidió quitar la aclaración entre
  paréntesis; no volver a poner «límite normativo» en la interfaz). Orden de los campos del tramo IGUAL al de la «Calculadora
  Normativa» (red|material, longitud|conductores por fase, calibre|resistencia, separación del haz|RMG, distancias A-B|A-C|B-C);
  Pérdidas conserva su propio orden (calibre|resistencia antes de longitud|conductores), no tocarlo. El motor
  `js/calc/regulacion.js` y la herramienta de la IA NO se tocan. Lógica en `js/calc/regulacion-tramos.js`; pruebas en
  `tools/verify_regulacion.html`. Las dos fórmulas de caída (`√3·I·Z·L·100/(V·1000)` y `P[kW]·L·K`) son equivalentes (verificado).
- Código compartido para las próximas calculadoras: `js/calc/circuito.js` (dato de partida, `clasificarPorUmbrales`,
  `sugerirCalibre` con `campo`) y `js/util/resultados-ui.js` (tarjeta con pestañas, `reporteHtml` con negrita, panel de fórmulas
  y `activarPestanas`, que además alinea la columna de símbolos midiendo el más ancho: `--ancho-simbolo`). Etiquetas: siempre
  «Óptimo» / «Aceptable» / «Elevado» (antes «Mayores pérdidas»). Clase de tablas de resultado: `.tabla-resultado`.
- Ayuda de los campos (2026-09-19, pedido del usuario): en Pérdidas y Regulación NO hay textos `.hint` debajo de los campos; la ayuda
  va en un botón «i» (Tabler `info-circle`) junto al nombre, que abre un cuadro pequeño (popover) sin mover el formulario. El cuadro
  sale ARRIBA de la etiqueta (no tapa la casilla que se va a llenar; decidido con el usuario) y se voltea abajo
  (`.info-popover--abajo`) si arriba no cabe, es decir si quedaría bajo la barra fija (`--topbar-h`) o fuera de la ventana. Se usa
  marcando la etiqueta: `<label data-info="texto">` y llamando `activarInfos(contenedor)` (`js/util/info-campo.js`; también en cada
  tarjeta de tramo creada después). Cierra al tocar fuera, con Esc o al abrir otro; NO usar `title` (no sirve en pantallas
  táctiles). El botón (20px) lleva márgenes verticales NEGATIVOS (`-4px`) para no agrandar la línea de la etiqueta (17px): sin ellos
  el campo con botón quedaba ~3.7px más abajo que su vecino de fila (probado en «el botón de información no altera la altura de
  las etiquetas»). Solo para explicaciones: los errores/validaciones siguen visibles. Las demás pantallas (Ampacidad subterránea, IA…) aún
  usan `.hint`: se migrarán al rediseñarlas, no antes.
- Campos numéricos que vienen del catálogo (resistencia, RMG) llevan `step="any"`: con `step="0.01"` el modo «Manual» fallaba la
  validación con valores de 3 decimales (p. ej. 0.396).

- Ocupación de ductos (2026-09-19) sigue el mismo patrón (tarjetas, iconos, relleno, info «i», reporte y fórmulas KaTeX). Dos tarjetas:
  «Tubería» (icono `cylinder`; tipo, diámetro nominal y diámetro interno del catálogo con «Manual») y una tarjeta «Conductores — Tipo N»
  por cada TIPO de conductor (icono `plugConnected`; «Agregar tipo de conductor» / «Quitar»: p. ej. una terna de un calibre y otra de
  otro). Cada tipo tiene número de conductores (1–9) y diámetro con casilla «Catálogo» a su derecha: al marcarla salen Nivel de
  tensión → Nivel de aislamiento (solo 15/35 kV; en 17.5/36 kV queda «No aplica») → Material → Pantalla → Calibre del catálogo
  `conductores-xlpe.json`, y el diámetro es `diametro_total_conductor_mm` (cable completo con chaqueta), bloqueado. Las listas se
  encadenan y conservan la selección si sigue disponible. El límite NTC-2050 (53/31/40 %) usa el número TOTAL de conductores (línea
  «Total de conductores…» bajo las tarjetas) y el atascamiento (jamming) solo se evalúa con 3 en total y del mismo diámetro. El motor
  `js/calc/ocupacion-ductos.js` y la herramienta de la IA NO se tocan; la suma de tipos vive en `js/calc/ocupacion-grupos.js`. Se
  agrega el RADIO DE CURVATURA = 12D (12 × diámetro exterior del conductor, en mm; factor fijo, sin campos; `radioCurvaturaMm`
  por tipo en `ocupacion-grupos.js`): métrica «Radio de curvatura (12D)» con un solo tipo, columna en la tabla por tipo con varios
  (la celda del Total queda VACÍA, pedido del usuario), línea en el reporte y ecuación en Fórmulas. Se conserva la dona del resultado (ya existía; los «sin gráficos» eran de Pérdidas/Regulación). Pruebas: `tools/verify_ocupacion.html`.
  `#tramos-container, #grupos-container` llevan el margen superior que separa las tarjetas de la primera.
- Cortocircuito (2026-09-19) sigue el mismo patrón. Dos tarjetas: «Conductor» (icono `plugConnected`; red | material, calibre | área con
  «Manual») y «Condiciones de la falla» (icono `temperature`, Tabler; temperatura de operación y de falla, cada una con «Manual», y
  tiempo de despeje). Botones «i» solo donde aportan: material (red aérea se calcula como aluminio), área (en aéreos es el área de
  aluminio) y temperatura de operación (75 °C aérea / 90 °C subterránea). Las constantes intermedias (λ, k1, logaritmo) van en el
  reporte, en RESULTADOS. Campo OPCIONAL «Corriente de falla a soportar (kA)» (idea tomada de la «Calculadora Normativa»; vacío = la
  pantalla se comporta como antes): con él el resultado agrega el veredicto Cumple / No cumple del calibre elegido, el «Área mínima
  requerida» (fórmula despejada), y la comparación de calibres del MISMO tipo y material (sugerido = el de menor área que soporta la
  corriente; reutiliza `sugerirCalibre` con `campo: "faltaKa"` y objetivo 0). El reporte suma la corriente a soportar en PARÁMETROS y
  cumplimiento, área mínima y calibre sugerido en RESULTADOS. Esa lógica vive en `js/calc/cortocircuito-calibre.js`; el motor
  `js/calc/cortocircuito.js` y la herramienta de la IA NO se tocan. De la Calculadora Normativa NO se copió (a propósito): λ y k1
  editables, la forma simplificada I = A·k/√t con la Tabla B1.4 ni el gráfico del margen térmico. Pruebas: `tools/verify_cortocircuito.html`.
- Ampacidad aérea (2026-09-19) sigue el mismo patrón. Tres tarjetas: «Conductor» (icono `plugConnected`; tipo | calibre, referencia |
  diámetro con «Manual», resistencia 25 °C | 75 °C con «Manual»), «Condiciones de operación» (icono Tabler `wind`; temperatura
  ambiente | máxima del conductor, viento | ángulo, elevación) y «Radiación solar y superficie» (icono Tabler `sunTabler`, distinto
  del `sun` viejo; ε | α, Qse | θ con «Manual»). Botones «i» solo en resistencias (interpolación 25→75 °C), viento, ángulo, ε/α (rango
  0.23–0.91), Qse (se ingresa, no se calcula) y θ. Sin funciones nuevas, con UNA mejora: cuando el balance no admite corriente
  (Tc < Ta o sol excesivo) el motor da NaN y antes se mostraba «NaN»; ahora la pantalla avisa con un callout y el reporte lo dice
  (la herramienta de la IA ya hacía lo mismo). Las intermedias (Qc, Qr, Qs, R) van en RESULTADOS del reporte. Fórmulas KaTeX: balance,
  propiedades del aire, convección, radiación y resistencia (15 ecuaciones, 23 etiquetas). El motor `js/calc/ampacidad-aerea.js` y la
  herramienta de la IA NO se tocan. Pruebas: `tools/verify_ampacidad_aerea.html`.
- Ampacidad subterránea (2026-09-19, la ÚLTIMA calculadora rediseñada: ya están las seis) sigue el mismo patrón. Tres tarjetas: «Cable»
  (icono `plugConnected`; tipo | material, calibre | pantalla, nivel kV | % de aislamiento, puesta a tierra | separación entre fases;
  en tripolar se bloquean las dos últimas), «Condiciones de operación» (icono `circuitVoltmeter`; tensión | frecuencia,
  temperatura máxima del conductor | del terreno) e «Instalación» (icono Tabler `gridDots`; resistividad del suelo | resistencia
  térmica del ducto, número de circuitos | profundidad, separación entre ductos que solo se habilita con más de 1 circuito). Los seis
  `.hint` de antes pasaron a botones «i» con el MISMO texto. Función tomada de la «Calculadora Normativa»: en cable MONOPOLAR el
  resultado agrega una segunda métrica, la corriente circulante en la pantalla (A, si las pantallas van a tierra en «Ambos Extremos»)
  o la tensión inducida a circuito abierto (V/km, con «Unipuntual» o «Cross-bonding»); en tripolar no aplica. Se calcula con la
  ampacidad ya obtenida en `js/calc/ampacidad-subterranea-pantalla.js` (recalcula Xm y Rs,op con los mismos datos del cable) y va en
  el reporte DESPUÉS de la ampacidad, dentro de RESULTADOS. Por lo demás sin funciones nuevas: los errores del motor (salto
  térmico insuficiente, combinación de cable inexistente) siguen como callout rojo (ahora con `escapeHtml`). Las intermedias (R, Wd,
  λ1, T1–T4, Δθ) van en RESULTADOS del reporte. Fórmulas KaTeX: 23 ecuaciones y 36 etiquetas (incluye Kennelly, los casos de n y de
  λ1, y la pantalla). El motor `js/calc/ampacidad-subterranea.js` y la herramienta de la IA NO se tocan. Pruebas:
  `tools/verify_ampacidad_subterranea.html` (compara con el método IEC escrito aparte, incluido el banco de ductos).
- Rediseño acordado con el usuario (2026-09-19) tomando de referencia el módulo de pérdidas de otro proyecto («Calculadora
  Normativa»): tarjeta «Datos de la línea» (con *dato de partida*: MW, MVA o A) + una tarjeta «Conductor — Tramo N» por tramo
  (agregar/quitar, conductores por fase). Los COLORES no cambian (solo tokens existentes) y los resultados van en los formatos
  que ya había (métricas + tablas); **sin gráficos** (barras, velocímetro): el usuario los quiere más adelante, no ahora.
  Unidades: se mantienen MW y MVA. El motor `js/calc/perdidas.js` NO se toca; la suma de tramos y el dato de partida viven en
  `js/calc/perdidas-tramos.js`. La IA (`calcular_perdidas`) sigue igual (un tramo). Pruebas: `tools/verify_perdidas.html`.
- Umbrales 1 % / 3 %: solo «referencias de diseño» (Óptimo / Aceptable / Elevado). NUNCA escribir «fuera de norma».
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
  blanco, `PARÁMETROS DE ENTRADA:` y DEBAJO una línea de 30 guiones, línea en blanco, `RESULTADOS:` y DEBAJO otra línea de 30 guiones
  (el usuario probó la línea encima y pidió volver a debajo; dos puntos al final de esas dos etiquetas; las tres etiquetas van en
  negrita con `<strong>`, el texto copiado no cambia).
  Parámetros = lo que el usuario dio; resultados = todo lo que sale del cálculo (en Pérdidas el Fp va primero; detalle por tramo
  con lo calculado y totales). Si el dato de partida no es la potencia activa, esta va en resultados. Cubierto por la sección
  «estructura del reporte» de `verify_perdidas.html` y `verify_regulacion.html`.
- Las tarjetas de Pérdidas llevan `.tarjeta-borde` (borde `--table-border`: en claro más marcado que `--border`, que casi se perdía
  contra el fondo; en oscuro no cambia). Se dejó en 1px; si aún se ve tenue, probar 1.5px antes que un color nuevo.
  Relleno de esas tarjetas y del panel azul de resultados: 16px (`--pad-tarjeta`, pedido por el usuario; antes 24px = `--space-5`),
  así que del borde exterior al contenido hay 17px (1 de borde). La barra de título usa la misma variable para llegar al borde.
  Solo aplica a `.tarjeta-borde`: las demás `.card` y `.result-panel` de la app siguen en 24px.
- Las seis calculadoras ya usan este patrón (Pérdidas, Regulación, Ocupación de ductos, Cortocircuito, Ampacidad aérea y subterránea).
  Sigue pendiente por decisión del usuario: los gráficos de resultado; y las pantallas fuera de las calculadoras (catálogos, Varios,
  IA…) aún usan `.hint` y el estilo anterior. Los refinamientos visuales (iconos, títulos) los irá indicando él.
- `assets/ejemplos/` (o `assets/Ejemplos/`) es una carpeta TEMPORAL de referencia del usuario, con un repo git anidado: NO subirla.
  Está excluida en `.git/info/exclude` (local); aun así, hacer `git add` solo con rutas explícitas, nunca `git add -A`/`.`.

## Conversión de unidades (`js/views/conversion-unidades.js`, `data/unidades.json`)

- Dos modos (2026-09-19, pedido del usuario). Casilla «Habilitar todas las conversiones» DEBAJO de la tarjeta (mismo estilo que la de
  coordenadas). Apagada: mismas categorías/unidades/pares de siempre (`data/factores-conversion.json`, motor `convertirUnidad`), con
  Ángulos al final y nombres con tilde (Área, Presión, Ángulos); las listas de unidades llevan «símbolo — nombre» en ambos modos. Encendida: catálogo `data/unidades.json` (cada unidad con factor a la
  base de su categoría y offset solo en temperatura), motor `js/calc/unidades-extendido.js` (cualquier unidad a cualquier otra), 19
  categorías (alfabético, Ángulos al final; nuevas: Potencia, Energía, Masa, Peso por longitud, Resistencia por longitud,
  Resistividad térmica, Volumen, Tiempo con «ciclos (60 Hz)», Densidad y Calibre de conductor AWG/kcmil ↔ mm²/diámetro/calibre más
  cercano) y unidades escritas «símbolo — nombre».
- `data/unidades.json` y los factores de `factores-conversion.json` se GENERAN con `tools/generar_unidades.py` (editar ahí, no a
  mano): los 71 pares se recalculan con factores exactos (antes tenían ~6 cifras, p. ej. m→ft 3.28084). La herramienta de la IA
  (`convertir_unidades`) usa desde 2026-09-19 el mismo catálogo completo (`unidades.json`), incluido el calibre AWG/kcmil.
- Resultado del modo completo: 6 cifras significativas (`fmtSig`, sin recortar enteros; científica si <1e-4 o ≥1e9); el modo normal
  sigue con 4 decimales. Pruebas: `tools/verify_unidades.html`.

## Sección "Funciones de IA" (`js/ai/*`, `js/views/ia*.js`)

- Rediseño de las pantallas de IA (2026-09-19, el usuario dijo «cualquier cosa nos devolvemos al commit anterior»): en curso, una por una.
  **Configuración de IA** HECHA (commit anterior al rediseño: `c5d9379`): tarjetas `tarjeta-borde` con barra de título e icono («Conexión con
  Gemini», «Modelo», «Datos y privacidad»), ayudas en botones «i» (sin `.hint`), estado de la clave en uso con enlace a Perfil (y aviso si es una
  clave del servidor), «¿Cómo obtener mi clave?» como enlace (`.btn-enlace`), «Probar conexión» SOLO verifica la clave y «Actualizar lista» carga los
  modelos (antes lo hacía «Probar»), ajustes avanzados (temperatura, rondas, cálculos) plegados en `<details>`, privacidad en recuadro con viñetas.
  **Corrector de redacción** HECHO (commit anterior al rediseño: `3c5ed7f`): tarjeta «Agente» con barra de título e icono y «Gestionar agentes» /
  «Historial» DENTRO de la barra (clase `.barra-acciones`); descripción del agente más visible (`.ia-desc-agente`); placeholder según el agente
  (`POR_AGENTE`); la respuesta lleva etiqueta («Correo corregido», «Resumen»…; `.ia-msg-etiqueta`) y el botón «Copiar» se queda DONDE ESTABA (el usuario
  lo pidió); atajos de ajuste «Más corto / Más formal / Más cordial / Explica los cambios» bajo la ÚLTIMA respuesta (`.ia-ajustes`, `AJUSTES_RAPIDOS`);
  panel de agentes con «Nuevo agente» como único botón principal y menú «Más» (`details.menu-mas`: Exportar, Importar, Restaurar); editor sin tarjeta
  anidada (`.ia-editor`) y ayudas «i». Historial con barra de título. **Análisis con calculadoras** HECHO con el mismo patrón (commit anterior: `fa41a71`): tarjeta «Agente» (robot 21 px) con pestañas `Agentes | Gestionar | Historial`
  (`mostrarVista`); los agentes se eligen con píldoras (ya NO hay botón «Usar»), línea «Modelo: … · Cambiar en Configuración»; «Gestionar» = lista primero + «Nuevo agente»
  debajo a la izquierda, editor `.ia-editor` con barra «Viendo/Editando/Nuevo agente», fila marcada y ayudas «i»; tarjeta «Conversación» (burbuja) con los ejemplos y la caja
  (sin `ia-caja--al-borde`); tarjeta «Reporte de escenarios» con barra (no se imprime) y fila de botones `.ia-reporte-acciones` (Generar reporte con IA = principal).
  Los ids del reporte y de la conversación no cambiaron (`#btn-reporte`, `#f-pregunta`, `#btn-enviar`…) y la impresión sigue igual. Todas las pantallas de IA quedan rediseñadas.
  Pruebas: `tools/verify_ia_pantallas.html`.
  AJUSTE POSTERIOR en Corrector y Análisis (commit anterior: `013f1e4`... ver `git log`): el HISTORIAL pasó de la tarjeta «Agente» a la tarjeta «Conversación»: «Agente» = `Agentes | Gestionar`;
  «Conversación» = `Actual | Historial` (`mostrarVistaConv`; `#vista-actual` = chat + caja, `#panel-historial`). En el historial la fila de abajo deja SOLO «Nueva conversación»
  (`.ia-acciones.solo-nueva`, que además vuelve a «Actual»); lo escrito en la caja se conserva; «Abrir» vuelve a «Actual» y arriba queda elegido el agente de esa conversación.
  AJUSTE POSTERIOR (commit anterior: `cca313f`): «Gestionar agentes» e «Historial» YA NO abren tarjetas nuevas ni están en la barra: la tarjeta «Agente» es UNA
  sola con pestañas `Agentes | Gestionar | Historial` (`.ia-pestanas`, `mostrarVista()`); «Abrir» en el historial vuelve solo a «Agentes» con el agente de esa conversación.

- Es la ÚNICA excepción a "100% offline": se conecta a Google Gemini con la clave del propio
  usuario (BYOK, guardada en el navegador; no hay backend). Detalle en el README.
- Análisis con calculadoras tiene agentes (`js/ai/agentes-analisis.js`, botón «Agentes»): el predeterminado («Agente estándar») sale del
  código (`SISTEMA_ANALISIS`/`PROMPT_REPORTE` en `analisis.js`), es de solo lectura y nunca se escribe en `localStorage`; los
  propios se guardan ahí y siempre llevan `REGLA_FIJA` al final. Si cambia el prompt estándar, el predeterminado se actualiza
  solo. Cada agente elige las herramientas que puede usar (campo `herramientas`; en el editor son etiquetas de selección múltiple `.ia-chip--herr` con ✓ al marcarse, agrupadas por categoría, ya no casillas): el filtro real es
  `declaraciones(permitidas)` + `ctx.permitidas` en `tools.js` (no solo el prompt); un agente guardado sin lista usa las del
  estándar (`HERRAMIENTAS_ESTANDAR`; una herramienta con `opcional: true` queda fuera de ellas: hoy `convertir_unidades` y
  `convertir_coordenadas`, grupo «Varios»). Para exponer otro módulo a la IA: ficha nueva en `tools.js` (campos, `calcular`,
  resultados con `res`), marcarla `opcional` con su `grupo` y agregar sus pruebas. Cubierto por
  `tools/verify_ia.html` (secciones «agentes de análisis» y «herramientas permitidas por agente»).
- Herramientas alineadas con las pantallas (2026-09-19; plan y registro de avance en `docs/plan-ajustes-ia.md`, TERMINADO salvo el reporte de la IA, `js/ai/reporte.js`, que el usuario decidió rediseñar él con otras ideas: no tocarlo sin que lo pida). Pérdidas y regulación aceptan `tramos`, dato de partida (MW/MVA/A) y conductores por fase y devuelven la clasificación Óptimo/Aceptable/Elevado; cortocircuito acepta `corriente_falla_ka`; ocupación acepta `grupos` y da el radio 12D; ampacidad subterránea da la corriente circulante/tensión inducida en la pantalla; unidades usa `data/unidades.json`; coordenadas acepta ~500 códigos EPSG y `puntos`. Los campos de nivel superior siguen valiendo para un solo tramo/tipo/punto. Los motores de `js/calc/` no se tocaron. Detalle en `docs/ia-herramientas.md` (sección 4).
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
- Cada cambio en archivos del shell exige subir `CACHE_VERSION` de `sw.js` (hoy v186); en el celular hay que cerrar la app y
  abrirla dos veces para ver la versión nueva.

## Acceso con Google (menú lateral → «Perfil», `js/auth/*`, `firebase/firestore.rules`)

- Ubicación (2026-09-19, pedido del usuario): antes estaba en Ayuda → «Configuración avanzada»; ahora es la sección **Perfil** (`#/perfil`, vista `js/views/configuracion-avanzada.js`, título «Perfil y configuración avanzada»), un ítem con icono `user` al fondo del menú lateral, ENCIMA del botón de contraer (`perfilLink` en `nav.js`, lista `#nav-perfil`), sin tarjeta en Inicio ni en Ayuda (la tarjeta de Ayuda se eliminó). `#/ayuda/configuracion` redirige a `#/perfil`. El router marca el ítem activo ANTES de `render` (la vista espera al servicio y tardaba en resaltarse).

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

## Apariencia: color principal personal de cada tema (Perfil → Apariencia, `js/util/tema.js`, 2026-09-19)

- Pestaña «Apariencia» a la derecha de «Clave de Gemini» para usuario y administrador (los visitantes no ven el panel de Perfil). El color es
  PERSONAL y POR DISPOSITIVO (`localStorage`: `tema.colores` = solo los temas cambiados, y `tema.css` = CSS ya calculado que `index.html` aplica antes
  del primer pintado, sin parpadeo; sin Firebase ni reglas). Por tema: selector de color + 6 muestras + «Restablecer» + vista previa (`.vista-tema`,
  que usa la paleta de OTRO tema gracias a los selectores agregados en `tokens.css`).
- REGLA DE ORO (pedida por el usuario): elegir el color predeterminado (oscuro `#4c9eff`, claro `#0e7c7b`) deja la paleta EXACTAMENTE como estaba, y ningún
  color escrito a mano se rompe. La derivación es RELATIVA a la paleta actual: cada tono derivado se mide contra el base predeterminado en OKLCH
  (`rel` = misma diferencia de luminosidad, `abs` = misma luminosidad; misma proporción de saturación y diferencia de matiz) y se reaplica al color elegido.
  Solo se derivan los tonos del acento (claro: accent, strong, soft, contrast, focus-ring, topbar-bg, thead-bg, thead-fg; oscuro: accent, strong, soft, contrast,
  focus-ring, fila-sugerida). Fondos, grises y estados (éxito/advertencia/error) NO cambian. Si el color queda ilegible (contraste < 4.5:1 contra
  blanco en claro / contra `#2b2b2b` en oscuro) se ajusta solo la luminosidad. Si cambia `tokens.css`, actualizar `PREDETERMINADO` en `tema.js`:
  `tools/verify_tema.html` compara contra los valores reales de tokens.css y falla si no coinciden (con y sin el atajo, o sea, prueba la matemática).
- `app.css` NO debe tener colores del tema escritos a mano (todo por variables; la prueba lo vigila). `manifest.webmanifest` (theme_color) es estático y no cambia.

## Niveles de acceso: visitante / usuario / administrador (FASE 1 implementada 2026-09-19)

- Decidido con el usuario: la app se abre SIN login. Un **visitante** (sin sesión, o con sesión de un correo fuera de la lista) solo tiene 3
  módulos: Ocupación de ductos, Conductores desnudos y Distancias de seguridad (marcados `libre: true` en `sectionMenus`, `nav.js`);
  Varios y Funciones de IA no tienen ninguno (Codificación de entregables se quitó de los libres el 2026-09-19). El **usuario** (en `usuarios` con rol `usuario`) y el
  **administrador** (`admin`, además gestiona la lista y la clave compartida en Perfil) lo tienen todo. Solo se implementó Google; el
  inicio con Microsoft es la FASE 2 (falta que el usuario registre la app en Microsoft Entra y probar `email_verified`/tenant de Celsia;
  ver el análisis: cuidar «nOAuth», y el error de cuenta existente con otro proveedor).
- Pantalla Perfil rediseñada (2026-09-19, el usuario dijo «si no me gusta, revertimos»; commit anterior al rediseño: `8afd35c`): tarjetas
  `tarjeta-borde` (16 px) con barra de título e icono (`user`, `users`, `key`), «Mi cuenta» (insignia de rol + última confirmación del servidor
  y hasta cuándo vale sin conexión), pestañas «Usuarios | Clave de Gemini» solo para el administrador (el usuario normal ve solo la tarjeta de
  la clave), tabla con rol como insignia (lápiz → selector compacto) y papelera para quitar, «Agregar correo» arriba con controles de 44 px
  alineados, clave de Gemini con solo el campo de la fuente elegida y ayudas en botones «i». Avisos de la clave: UN solo recuadro «Ten presente» con viñetas (lo pendiente de la clave elegida; y, solo para el ADMIN con la clave compartida, quién puede leerla y el cupo común). El usuario normal conserva la opción «Clave compartida» (la usa, no la cambia; decidido con el usuario, opción A) y ve «configurada / aún no configurada por el administrador». PRIVACIDAD: `firebase/firestore.rules` ahora
  deja `list` y `get` de OTROS correos solo al admin (`mock.listarUsuarios` también): hay que PUBLICAR las reglas en la consola de Firebase
  (Firestore → Reglas) o un usuario normal seguiría viendo la lista; la pantalla ya no la pide a los no-admin. Pruebas: sección «pantalla de Perfil
  rediseñada» de `verify_acceso.html`.
- Piezas: `js/auth/permisos.js` (reglas por ruta, `permitida`, `itemHabilitado`, `TEXTO_BLOQUEADO`), `js/auth/acceso.js` (nivel, cache y
  validación; `iniciarAcceso` en `app.js`), `js/util/tiles.js` (tarjeta de menú con o sin enlace), guardia en `js/router.js` (pantalla
  «Contenido para usuarios autorizados» + botón a Perfil; también bloquea escribir la dirección a mano) y `alCambiarAcceso` → `router.refresh()`
  (salvo en `/perfil`). Los módulos bloqueados se ven APAGADOS (decidido con el usuario): tarjeta más tenue (55 %), icono y título en gris y un candado
  (Tabler `lock`) arriba a la derecha; en Ayuda el título en gris con candado pequeño (los libres siguen azules y subrayados); sin
  hipervínculo y con la ayuda «Disponible al iniciar sesión» (`TEXTO_BLOQUEADO`); Perfil no se bloquea y muestra «Tu cuenta … no está autorizada. Contacta al administrador…».
- Vigencia sin conexión: 15 días contados desde la ÚLTIMA confirmación del servidor (no desde el login). `localStorage["acceso.cache"]` =
  `{email, rol, validadoEn}`. Con internet se revalida al abrir, al recuperar la conexión y al volver a la app tras 6 h (renueva los 15
  días); si el servidor dice que ya no está en la lista, pierde el acceso al instante; si hay error de red, se conserva la cache; sin
  internet vale la cache si tiene ≤15 días (si el reloj retrocede más de 1 día no se acepta). Sin cache y sin internet: visitante.
  La sesión de Firebase es la persistente por defecto (se inicia sesión una vez por dispositivo). `backend.listo()` distingue «no cargó el
  SDK» de «sin sesión». Es un control de USO (los archivos son públicos); lo protegido de verdad es lo del servidor.
- Pruebas: `tools/verify_acceso.html` (reloj falso + backend simulado). Lo que NO se prueba en el arnés: el login real (se prueba a mano).
- Fase posterior, NO implementada: «Solicitar acceso» (`docs/puerta-de-acceso-general.md`, ya sin la puerta al abrir la app).

## (Histórico) Puerta de acceso general con solicitud de acceso

- Análisis del 2026-09-18 (la puerta al abrir la app NO se hizo: se optó por el modelo visitante/usuario de arriba; queda la idea de «Solicitar acceso»). **Todo el detalle está en
  `docs/puerta-de-acceso-general.md`: léelo entero antes de retomarlo** (flujo, reglas de Firestore
  en borrador, opciones de correo, diseño offline, riesgos, fases y preguntas abiertas).
- Idea: al abrir la app se pide login con Google; si el correo está en `usuarios` entra (admin o
  usuario); si no, "sin acceso" con botón **Solicitar acceso** que crea `solicitudes/{correo}` y el
  admin aprueba/rechaza en Perfil y configuración avanzada. Reutiliza `js/auth/*` y las reglas actuales.
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
- Catálogos (2026-09-19): además de los 3 de conductores hay un 4.º, «Tuberías» (`#/catalogos/tuberias`), con los datos de
  `data/tuberias.json` (los mismos de la calculadora de Ocupación de ductos). Reutiliza las MISMAS vistas genéricas por familia
  (`catalogo-conductores.js` y `detalle-conductor.js`, cada una con su entrada `tuberias` en `CONFIG`): filtro por tipo de tubería,
  buscador por diámetro nominal y ficha de detalle. El archivo no trae `id`: `conIdPorPosicion` (`js/util/format.js`) le pone la
  posición como `id` a una COPIA de las filas (no se modifica el dato cacheado que usa Ocupación de ductos ni el JSON). Su tarjeta usa
  el icono `underground` (el mismo de Ampacidad subterránea; el usuario descartó uno tipo tubo porque se confundiría con los de
  conductores). Al agregar otra familia: entrada en `CONFIG` de las dos vistas + tarjeta en `sectionMenus.catalogos` (`nav.js`).
  Pruebas: `tools/verify_catalogo_tuberias.html`.
- Normatividad → visor de imágenes (`js/views/normativa-imagen.js`): un tema puede llevar una `nota` (texto normativo citado), que se
  pinta como nota al pie DEBAJO del visor (`.nota-pie`: texto pequeño con línea vertical a la izquierda; siempre visible, no depende de
  la tabla elegida). «Enterramiento de ductos» la usa desde 2026-09-19: el numeral 3.20.6.3.g del RETIE 2026 (antes citado como RETIE 2024; el usuario pidió el cambio de año el 2026-09-19) era una imagen de texto
  que solo remite a las Tablas 300.5 y 300.50 de la NTC 2050; se pasó a nota (texto completo, con la excepción de 0,45 m), se quitó
  del selector y se borró `assets/normativa/numeral-3-20-6-3-g.jpg` (y su línea del service worker; sigue en el historial de git).
  Los títulos de las tablas de «Distancias de seguridad» («Tabla 3.10.1.a — Distancias mínimas…», 8 tablas) son los de la app original
  de Power Apps (`Selector_Tablas` en `Src/Distancias de seguridad.pa.yaml` del `.msapp`, que sigue en el historial de git: commit
  `dccdd6a^`); mismo formato «numeral — descripción» que Enterramiento de ductos. El selector llega hasta 960 px de ancho. En pantalla
  angosta el desplegable cerrado corta los títulos largos: se probó repetir el título completo debajo del campo y el usuario lo
  RECHAZÓ (2026-09-19); no volver a ponerlo (el desplegable abierto sí muestra el título completo).
  Al agregar/quitar imágenes de `assets/normativa/` recordar el `APP_SHELL`. Pruebas: `tools/verify_normatividad.html`.
- Conversión de coordenadas (2026-09-19): además del conversor de los 7 sistemas (`js/calc/coordenadas.js`, motor original propio: NO
  tocarlo, lo usa también la IA), la casilla «Habilitar todos los sistemas de coordenadas» reemplaza, EN EL MISMO formulario,
  las dos listas por dos campos de código EPSG (entrada y salida) para convertir entre cualquier par de ~509 códigos EPSG (los de Colombia —MAGNA-SIRGAS, Bogotá 1975, Origen Nacional, las 32 cuadrículas urbanas de las ciudades— y los
  más usados del mundo: WGS84, las 120 zonas UTM, NAD83, ETRS89, SIRGAS, etc.). Reemplazó al enlace a un cuaderno de Google Colab
  (que el usuario consideró demasiado complejo; tampoco quiso una tarjeta/nota aparte: los campos se explican solos).
  Las listas y los campos EPSG ocupan el MISMO lugar (`.campos-sistemas`: la pareja inactiva solo se oculta con
  `visibility`), y bajo cada campo hay una línea de nombre reservada (`.hint-linea`, una sola línea con «…»): así habilitar todos los
  sistemas NO corre nada hacia abajo (pedido del usuario; probado en las pruebas). El botón «Convertir por lotes» (junto a Convertir) cambia su texto a «Convertir un punto» al encenderse (ambos textos ocupan el mismo lugar: `.btn-dos-textos`,
  el botón mide siempre lo mismo; estado en `data-lotes`) y cambia longitud/latitud por un cuadro (la casilla de todos los
  sistemas va DEBAJO de la tarjeta, abajo a la izquierda, con el cuadro a la izquierda del texto: ubicación elegida por el usuario).
  Lectura de datos pegados de Excel/CSV (`parsearPareja` y `numeroFlexible` en `coordenadas-epsg.js`, con pruebas): separadores tabulación,
  «;», espacios o UNA coma (con punto decimal); con tab/«;»/espacio la coma es DECIMAL; se ignoran comillas, BOM, separador final y una
  primera línea sin dígitos (encabezado); se rechazan con mensaje el separador de miles, más de 2 columnas y varias comas. Los campos de
  un solo punto son de texto (`inputmode=decimal`) y aceptan punto o coma en cualquier navegador. Aviso «latitud y longitud invertidas»
  (solo reconoce el caso de Colombia). Para el cuadro por lotes donde cada línea es una pareja separada por
  espacio; la salida es una línea por punto (mismo orden y formato) y los avisos se agrupan con los números de línea. Los AVISOS DE ÁREA
  DE USO (punto fuera del área del sistema de entrada o de salida) también salen con los 7 sistemas de la lista: se calculan con las áreas
  de `data/sistemas-epsg.json` (los 7 ya están ahí) y el cálculo numérico sigue siendo el del motor original. Usa proj4js (`vendor/proj4`, MIT, carga perezosa con `js/util/proj4.js`) y el
  catálogo `data/sistemas-epsg.json` (~70 KB, `{codigo: [nombre, cadena proj4, [N, O, S, E]]}`), generado de la base abierta
  `epsg-index` (npm; bajada con PowerShell, que SÍ tiene internet aquí) filtrando por Colombia + lo más usado y SIN los que necesitan
  archivos de rejilla (NAD27, OSGB36…); para agregar códigos hay que regenerarlo igual. Lógica pura en `js/calc/coordenadas-epsg.js`
  (código escrito por el usuario, ficha con unidad, avisos de datum y de área de uso, `convertirEntreSistemas`).
  Las cuadrículas urbanas usan `+proj=col_urban` (EPSG 1052), que proj4js NO trae: `js/util/proj4-col-urban.js` la agrega
  (formulas de la guía IOGP 7-2, como en PROJ). Verificado: da el mismo resultado que el conversor original en los 7 sistemas
  (diferencia < 1e-6 mm), el origen de cada proyección es exacto, y las distancias de la cuadrícula de Bogotá difieren de las de 3116
  en (1 + h_0/R). Exactitud: entre datums distintos (p. ej. Bogotá 1975 ↔ MAGNA) proj4 usa los parámetros +towgs84 (orden de metros): el
  panel avisa. Orden de coordenadas siempre X (longitud/este) e Y (latitud/norte). Pruebas: `tools/verify_coordenadas_epsg.html`.
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
