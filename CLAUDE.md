# Herramientas de IngenierÃ­a â€” instrucciones para Claude

PWA vanilla (HTML/CSS/JS, sin build step) con calculadoras y catÃ¡logos de ingenierÃ­a
para lÃ­neas y redes de distribuciÃ³n elÃ©ctrica. MigraciÃ³n de la app Power Apps
"Herramientas (offline)". Detalle completo de arquitectura en `README.md`.

## Convenciones del proyecto

- Sin build step: no introducir bundlers, transpiladores ni dependencias npm salvo
  que se pida explÃ­citamente. (Ãšnica excepciÃ³n pedida: KaTeX como copia local en `vendor/katex`.)
- `js/calc/*.js`: motores de cÃ¡lculo puros, sin DOM, 1:1 con las fÃ³rmulas del original
  en Power Apps. No mezclar lÃ³gica de UI aquÃ­.
- `js/views/*.js`: un mÃ³dulo por pantalla, exporta `async function render(container, params)`.
- Los datos de catÃ¡logos (`data/*.json`) son la fuente de verdad y se editan directamente: el `.msapp` original de Power Apps
  se retirÃ³ del repo el 2026-09-19 (sigue en el historial de git) y `tools/extract_data.py` quedÃ³ obsoleto (ver README,
  Â«CatÃ¡logos de datosÂ», por si hubiera que regenerarlos).
- Antes de tocar `js/calc/*.js`, revisar si hay un script en `tools/verify_*.py`
  equivalente para validar numÃ©ricamente el cambio.
- Revisar la secciÃ³n "Decisiones de migraciÃ³n que vale la pena recordar" del README
  antes de "corregir" comportamientos que parezcan bugs (algunos son intencionales,
  replicando el comportamiento original).

## Pantallas de PÃ©rdidas y RegulaciÃ³n (tarjetas, varios tramos) y KaTeX

- RegulaciÃ³n (2026-09-19) replica el rediseÃ±o de PÃ©rdidas (mismas tarjetas, iconos, relleno, reporte y fÃ³rmulas). Diferencias: sin
  factor de carga; por tramo agrega radio medio geomÃ©trico (mm, del catÃ¡logo, editable con Â«ManualÂ»), conductores por fase con
  Â«SeparaciÃ³n entre subconductores del hazÂ» (RMG equivalente del haz, `calcularRmgHaz`) y las 3 distancias entre fases (propias de
  cada tramo). Referencias de diseÃ±o 5 % (Ã“ptimo) / 10 % (Aceptable) / Â«ElevadoÂ» por encima; NO son lÃ­mite normativo, y en pantalla
  el texto es solo Â«Referencias de diseÃ±o: hasta X% Ã³ptimo Â· hasta Y% aceptable.Â» (el usuario pidiÃ³ quitar la aclaraciÃ³n entre
  parÃ©ntesis; no volver a poner Â«lÃ­mite normativoÂ» en la interfaz). Orden de los campos del tramo IGUAL al de la Â«Calculadora
  NormativaÂ» (red|material, longitud|conductores por fase, calibre|resistencia, separaciÃ³n del haz|RMG, distancias A-B|A-C|B-C);
  PÃ©rdidas conserva su propio orden (calibre|resistencia antes de longitud|conductores), no tocarlo. El motor
  `js/calc/regulacion.js` y la herramienta de la IA NO se tocan. LÃ³gica en `js/calc/regulacion-tramos.js`; pruebas en
  `tools/verify_regulacion.html`. Las dos fÃ³rmulas de caÃ­da (`âˆš3Â·IÂ·ZÂ·LÂ·100/(VÂ·1000)` y `P[kW]Â·LÂ·K`) son equivalentes (verificado).
- CÃ³digo compartido para las prÃ³ximas calculadoras: `js/calc/circuito.js` (dato de partida, `clasificarPorUmbrales`,
  `sugerirCalibre` con `campo`) y `js/util/resultados-ui.js` (tarjeta con pestaÃ±as, `reporteHtml` con negrita, panel de fÃ³rmulas
  y `activarPestanas`, que ademÃ¡s alinea la columna de sÃ­mbolos midiendo el mÃ¡s ancho: `--ancho-simbolo`). Etiquetas: siempre
  Â«Ã“ptimoÂ» / Â«AceptableÂ» / Â«ElevadoÂ» (antes Â«Mayores pÃ©rdidasÂ»). Clase de tablas de resultado: `.tabla-resultado`.
- Ayuda de los campos (2026-09-19, pedido del usuario): en PÃ©rdidas y RegulaciÃ³n NO hay textos `.hint` debajo de los campos; la ayuda
  va en un botÃ³n Â«iÂ» (Tabler `info-circle`) junto al nombre, que abre un cuadro pequeÃ±o (popover) sin mover el formulario. El cuadro
  sale ARRIBA de la etiqueta (no tapa la casilla que se va a llenar; decidido con el usuario) y se voltea abajo
  (`.info-popover--abajo`) si arriba no cabe, es decir si quedarÃ­a bajo la barra fija (`--topbar-h`) o fuera de la ventana. Se usa
  marcando la etiqueta: `<label data-info="texto">` y llamando `activarInfos(contenedor)` (`js/util/info-campo.js`; tambiÃ©n en cada
  tarjeta de tramo creada despuÃ©s). Cierra al tocar fuera, con Esc o al abrir otro; NO usar `title` (no sirve en pantallas
  tÃ¡ctiles). El botÃ³n (20px) lleva mÃ¡rgenes verticales NEGATIVOS (`-4px`) para no agrandar la lÃ­nea de la etiqueta (17px): sin ellos
  el campo con botÃ³n quedaba ~3.7px mÃ¡s abajo que su vecino de fila (probado en Â«el botÃ³n de informaciÃ³n no altera la altura de
  las etiquetasÂ»). Solo para explicaciones: los errores/validaciones siguen visibles. Las demÃ¡s pantallas (Ampacidad subterrÃ¡nea, IAâ€¦) aÃºn
  usan `.hint`: se migrarÃ¡n al rediseÃ±arlas, no antes.
- Campos numÃ©ricos que vienen del catÃ¡logo (resistencia, RMG) llevan `step="any"`: con `step="0.01"` el modo Â«ManualÂ» fallaba la
  validaciÃ³n con valores de 3 decimales (p. ej. 0.396).

- OcupaciÃ³n de ductos (2026-09-19) sigue el mismo patrÃ³n (tarjetas, iconos, relleno, info Â«iÂ», reporte y fÃ³rmulas KaTeX). Dos tarjetas:
  Â«TuberÃ­aÂ» (icono `cylinder`; tipo, diÃ¡metro nominal y diÃ¡metro interno del catÃ¡logo con Â«ManualÂ») y una tarjeta Â«Conductores â€” Tipo NÂ»
  por cada TIPO de conductor (icono `plugConnected`; Â«Agregar tipo de conductorÂ» / Â«QuitarÂ»: p. ej. una terna de un calibre y otra de
  otro). Cada tipo tiene nÃºmero de conductores (1â€“9) y diÃ¡metro con casilla Â«CatÃ¡logoÂ» a su derecha: al marcarla salen Nivel de
  tensiÃ³n â†’ Nivel de aislamiento (solo 15/35 kV; en 17.5/36 kV queda Â«No aplicaÂ») â†’ Material â†’ Pantalla â†’ Calibre del catÃ¡logo
  `conductores-xlpe.json`, y el diÃ¡metro es `diametro_total_conductor_mm` (cable completo con chaqueta), bloqueado. Las listas se
  encadenan y conservan la selecciÃ³n si sigue disponible. El lÃ­mite NTC-2050 (53/31/40 %) usa el nÃºmero TOTAL de conductores (lÃ­nea
  Â«Total de conductoresâ€¦Â» bajo las tarjetas) y el atascamiento (jamming) solo se evalÃºa con 3 en total y del mismo diÃ¡metro. El motor
  `js/calc/ocupacion-ductos.js` y la herramienta de la IA NO se tocan; la suma de tipos vive en `js/calc/ocupacion-grupos.js`. Se
  agrega el RADIO DE CURVATURA = 12D (12 Ã— diÃ¡metro exterior del conductor, en mm; factor fijo, sin campos; `radioCurvaturaMm`
  por tipo en `ocupacion-grupos.js`): mÃ©trica Â«Radio de curvatura (12D)Â» con un solo tipo, columna en la tabla por tipo con varios
  (la celda del Total queda VACÃA, pedido del usuario), lÃ­nea en el reporte y ecuaciÃ³n en FÃ³rmulas. Se conserva la dona del resultado (ya existÃ­a; los Â«sin grÃ¡ficosÂ» eran de PÃ©rdidas/RegulaciÃ³n). Pruebas: `tools/verify_ocupacion.html`.
  `#tramos-container, #grupos-container` llevan el margen superior que separa las tarjetas de la primera.
- GrÃ¡ficos de OcupaciÃ³n de ductos (2026-09-20, elegidos por el usuario entre 5 propuestas): el resultado va en TRES columnas (`.oc-resumen`: corte transversal | dona | cifras grandes, alineadas a la izquierda y con corte y dona del mismo tamaÃ±o; una columna bajo 900 px; el usuario probÃ³ antes dona | cifras | corte y prefiriÃ³ esta variante). Un conductor mÃ¡s grueso que el ducto se dibuja con el diÃ¡metro del ducto (lo llena por completo; el usuario descartÃ³ Â«âˆ’ 1 mmÂ» por incoherencias en ductos pequeÃ±os, y luego Â«âˆ’ 1 %Â»). Ambos son SVG dibujados por cÃ³digo en `js/util/graficos.js` (`donaOcupacionSvg`, `corteDuctoSvg`, `asentarConductores`; sin librerÃ­as, con las variables de color del tema y vectoriales al imprimir). La dona lleva degradado y la marca del lÃ­mite NTC-2050; el corte es a escala, con los conductores apoyados en el fondo (simulaciÃ³n de gravedad) y un color por tipo. Nombre de la tÃ©cnica: Â«grÃ¡ficos SVG a medidaÂ» (pedir asÃ­ los siguientes). Se descartaron: torta con porciones, medidor semicircular y barra segmentada (el medidor queda como idea para PÃ©rdidas/RegulaciÃ³n). El motor y la herramienta de la IA NO se tocaron.
- Cortocircuito (2026-09-19) sigue el mismo patrÃ³n. Dos tarjetas: Â«ConductorÂ» (icono `plugConnected`; red | material, calibre | Ã¡rea con
  Â«ManualÂ») y Â«Condiciones de la fallaÂ» (icono `temperature`, Tabler; temperatura de operaciÃ³n y de falla, cada una con Â«ManualÂ», y
  tiempo de despeje). Botones Â«iÂ» solo donde aportan: material (red aÃ©rea se calcula como aluminio), Ã¡rea (en aÃ©reos es el Ã¡rea de
  aluminio) y temperatura de operaciÃ³n (75 Â°C aÃ©rea / 90 Â°C subterrÃ¡nea). Las constantes intermedias (Î», k1, logaritmo) van en el
  reporte, en RESULTADOS. Campo OPCIONAL Â«Corriente de falla a soportar (kA)Â» (idea tomada de la Â«Calculadora NormativaÂ»; vacÃ­o = la
  pantalla se comporta como antes): con Ã©l el resultado agrega el veredicto Cumple / No cumple del calibre elegido, el Â«Ãrea mÃ­nima
  requeridaÂ» (fÃ³rmula despejada), y la comparaciÃ³n de calibres del MISMO tipo y material (sugerido = el de menor Ã¡rea que soporta la
  corriente; reutiliza `sugerirCalibre` con `campo: "faltaKa"` y objetivo 0). El reporte suma la corriente a soportar en PARÃMETROS y
  cumplimiento, Ã¡rea mÃ­nima y calibre sugerido en RESULTADOS. Esa lÃ³gica vive en `js/calc/cortocircuito-calibre.js`; el motor
  `js/calc/cortocircuito.js` y la herramienta de la IA NO se tocan. De la Calculadora Normativa NO se copiÃ³ (a propÃ³sito): Î» y k1
  editables, la forma simplificada I = AÂ·k/âˆšt con la Tabla B1.4 ni el grÃ¡fico del margen tÃ©rmico. Pruebas: `tools/verify_cortocircuito.html`.
- Ampacidad aÃ©rea (2026-09-19) sigue el mismo patrÃ³n. Tres tarjetas: Â«ConductorÂ» (icono `plugConnected`; tipo | calibre, referencia |
  diÃ¡metro con Â«ManualÂ», resistencia 25 Â°C | 75 Â°C con Â«ManualÂ»), Â«Condiciones de operaciÃ³nÂ» (icono Tabler `wind`; temperatura
  ambiente | mÃ¡xima del conductor, viento | Ã¡ngulo, elevaciÃ³n) y Â«RadiaciÃ³n solar y superficieÂ» (icono Tabler `sunTabler`, distinto
  del `sun` viejo; Îµ | Î±, Qse | Î¸ con Â«ManualÂ»). Botones Â«iÂ» solo en resistencias (interpolaciÃ³n 25â†’75 Â°C), viento, Ã¡ngulo, Îµ/Î± (rango
  0.23â€“0.91), Qse (se ingresa, no se calcula) y Î¸. Sin funciones nuevas, con UNA mejora: cuando el balance no admite corriente
  (Tc < Ta o sol excesivo) el motor da NaN y antes se mostraba Â«NaNÂ»; ahora la pantalla avisa con un callout y el reporte lo dice
  (la herramienta de la IA ya hacÃ­a lo mismo). Las intermedias (Qc, Qr, Qs, R) van en RESULTADOS del reporte. FÃ³rmulas KaTeX: balance,
  propiedades del aire, convecciÃ³n, radiaciÃ³n y resistencia (15 ecuaciones, 23 etiquetas). El motor `js/calc/ampacidad-aerea.js` y la
  herramienta de la IA NO se tocan. Pruebas: `tools/verify_ampacidad_aerea.html`.
- Ampacidad subterrÃ¡nea (2026-09-19, la ÃšLTIMA calculadora rediseÃ±ada: ya estÃ¡n las seis) sigue el mismo patrÃ³n. Tres tarjetas: Â«CableÂ»
  (icono `plugConnected`; tipo | material, calibre | pantalla, nivel kV | % de aislamiento, puesta a tierra | separaciÃ³n entre fases;
  en tripolar se bloquean las dos Ãºltimas), Â«Condiciones de operaciÃ³nÂ» (icono `circuitVoltmeter`; tensiÃ³n | frecuencia,
  temperatura mÃ¡xima del conductor | del terreno) e Â«InstalaciÃ³nÂ» (icono Tabler `gridDots`; resistividad del suelo | resistencia
  tÃ©rmica del ducto, nÃºmero de circuitos | profundidad, separaciÃ³n entre ductos que solo se habilita con mÃ¡s de 1 circuito). Los seis
  `.hint` de antes pasaron a botones Â«iÂ» con el MISMO texto. FunciÃ³n tomada de la Â«Calculadora NormativaÂ»: en cable MONOPOLAR el
  resultado agrega una segunda mÃ©trica, la corriente circulante en la pantalla (A, si las pantallas van a tierra en Â«Ambos ExtremosÂ»)
  o la tensiÃ³n inducida a circuito abierto (V/km, con Â«UnipuntualÂ» o Â«Cross-bondingÂ»); en tripolar no aplica. Se calcula con la
  ampacidad ya obtenida en `js/calc/ampacidad-subterranea-pantalla.js` (recalcula Xm y Rs,op con los mismos datos del cable) y va en
  el reporte DESPUÃ‰S de la ampacidad, dentro de RESULTADOS. Por lo demÃ¡s sin funciones nuevas: los errores del motor (salto
  tÃ©rmico insuficiente, combinaciÃ³n de cable inexistente) siguen como callout rojo (ahora con `escapeHtml`). Las intermedias (R, Wd,
  Î»1, T1â€“T4, Î”Î¸) van en RESULTADOS del reporte. FÃ³rmulas KaTeX: 23 ecuaciones y 36 etiquetas (incluye Kennelly, los casos de n y de
  Î»1, y la pantalla). El motor `js/calc/ampacidad-subterranea.js` y la herramienta de la IA NO se tocan. Pruebas:
  `tools/verify_ampacidad_subterranea.html` (compara con el mÃ©todo IEC escrito aparte, incluido el banco de ductos).
- Conductor econÃ³mico (2026-09-21; nombre: primero se llamÃ³ Â«AnÃ¡lisis econÃ³micoÂ» y el usuario pidiÃ³ Â«Conductor econÃ³micoÂ» (2026-09-21), que es el definitivo): calculadora NUEVA en `#/calculos/conductor-economico` (icono `coin`, Tabler; no es libre: solo usuarios). Se diseÃ±Ã³ conversando con el usuario a partir de un prompt ajeno (mÃ³dulo econÃ³mico de la Â«Calculadora NormativaÂ»), y se corrigieron sus errores: faltaba el factor 3 en `3Â·IÂ²Â·RÂ·L`, usaba demanda mÃ¡xima las 8760 h (aquÃ­ se reutiliza el factor de pÃ©rdidas de PÃ©rdidas), citaba IEC 60287 para pÃ©rdidas y una nota de CREG 015/2018 (8 %/5 %) que no se copiÃ³. Decisiones del usuario: SOLO lÃ­nea nueva (sin reconducciÃ³n), un solo calibre por opciÃ³n, de 2 a 5 opciones (agregar/quitar), criterio principal = COSTO TOTAL ACTUALIZADO (inversiÃ³n + valor presente de pÃ©rdidas; el VAN/TIR del prompt se descartÃ³: sin lÃ­nea base no estÃ¡n definidos), precios ESCRITOS por el usuario en cada anÃ¡lisis (los catÃ¡logos no traen precios y el repo es pÃºblico: no agregar precios reales a `data/*.json`), crecimiento de la demanda como campo (0 por defecto), sensibilidad como TABLA (el tornado queda para despuÃ©s) y SIN valor residual ni O&M (explicado: no cambian cuÃ¡l opciÃ³n gana; si se quiere, un campo Â«O&M $/kmÂ» igual para todas). Pesos corrientes (tasa nominal). Detalle en el README. Motor `js/calc/conductor-economico.js` (usa `perdidas.js` sin tocarlo); pruebas `tools/verify_conductor_economico.html` (contra un cÃ¡lculo independiente en kW, 123 comprobaciones). Pendiente: herramienta de la IA (`opcional: true`), grÃ¡fico de flujo acumulado/tornado con Â«grÃ¡ficos SVG a medidaÂ», y decidir si los precios se guardan entre sesiones (solo local).
- RediseÃ±o acordado con el usuario (2026-09-19) tomando de referencia el mÃ³dulo de pÃ©rdidas de otro proyecto (Â«Calculadora
  NormativaÂ»): tarjeta Â«Datos de la lÃ­neaÂ» (con *dato de partida*: MW, MVA o A) + una tarjeta Â«Conductor â€” Tramo NÂ» por tramo
  (agregar/quitar, conductores por fase). Los COLORES no cambian (solo tokens existentes) y los resultados van en los formatos
  que ya habÃ­a (mÃ©tricas + tablas); **sin grÃ¡ficos** (barras, velocÃ­metro): el usuario los quiere mÃ¡s adelante, no ahora.
  Unidades: se mantienen MW y MVA. El motor `js/calc/perdidas.js` NO se toca; la suma de tramos y el dato de partida viven en
  `js/calc/perdidas-tramos.js`. La IA (`calcular_perdidas`) sigue igual (un tramo). Pruebas: `tools/verify_perdidas.html`.
- Umbrales 1 % / 3 %: solo Â«referencias de diseÃ±oÂ» (Ã“ptimo / Aceptable / Elevado). NUNCA escribir Â«fuera de normaÂ».
- Tarjetas (`.form-section`): tÃ­tulo como BARRA de borde a borde (`.form-section-title`: fondo `--accent-soft` como el botÃ³n activo del
  menÃº lateral, lÃ­nea inferior delgada `--accent`, icono `--accent` pleno, centrado vertical, `min-height` fijo para que no cambie al
  aparecer Â«QuitarÂ»); espacio inferior compacto (`.grid-2.ultima`, relleno de 12px; botÃ³n Â«Agregar tramoÂ» a 10px del Ãºltimo campo).
  Iconos de esta pantalla: `circuitVoltmeter` (lÃ­nea) y `plugConnected` (conductor), elegidos por el usuario tras probar otros
  (los descartados se borraron de `icons.js`). Copiados del SVG oficial
  de Tabler. La lÃ­nea inferior de la barra es 35 % menos intensa que `--accent` (`color-mix`, decidido por el usuario tras probar dos
  alternativas; NO usar bordes de 0.5px: desaparecen en pantallas de densidad normal). La fila del calibre sugerido usa el token
  `--fila-sugerida` (verde suave en claro; en oscuro un azul `#344d6a`, mÃ¡s claro que el fondo del panel de resultados para no
  confundirse con Ã©l; el verde no se veÃ­a bien en oscuro). Para traer un icono real de Tabler: `curl` a internet NO funciona aquÃ­, pero
  WebFetch sobre `raw.githubusercontent.com/tabler/tabler-icons/main/icons/outline/<nombre>.svg` sÃ­ (pedir el SVG literal).
- CSS: `.btn` estÃ¡ definido despuÃ©s de las reglas de esta pantalla, asÃ­ que sus variantes deben escribirse `.btn.clase` (si no,
  `.btn` gana por orden y el padding no cambia). En pruebas de layout tomar TODAS las medidas antes de llamar a `ok()`: el contenedor
  de `verify_perdidas.html` se desplaza cuando crece el texto de resultados. Las media queries dependen del ancho de la ventana:
  para probarlas se usa un iframe de ancho fijo (ver `cargarMarco` en ese arnÃ©s).
- Rejillas de campos en pantalla angosta (â‰¤720px): `.grid-2/.grid-3` pasan a una columna y cada `.field` ya trae `margin-bottom`,
  asÃ­ que a las rejillas de campos se les quita el `row-gap` (`:has(> .field)`); si no, los campos del mismo par quedaban a 32px y
  los de pares distintos a 16px. No quitar el gap a las rejillas de mÃ©tricas de resultado (no llevan `.field`).
- KaTeX: copia local en `vendor/katex` (MIT, sin npm), carga perezosa (`js/util/katex.js`) al abrir Â«FÃ³rmulasÂ» y precacheada en
  `sw.js`. El usuario quiere extenderlo a las pestaÃ±as Â«FÃ³rmulasÂ» de las demÃ¡s calculadoras, una por una. Las ecuaciones van
  DENTRO de una subtarjeta (`.formula-caja`: mismo fondo hundido, borde y esquinas que la caja de Â«ReporteÂ», sin letra mono); mientras
  KaTeX carga (o si falla) se ve el texto plano `.formula-block`.
- PestaÃ±a Â«ReporteÂ» (texto para copiar y pegar), estructura pedida por el usuario: `CÃLCULO DE â€¦` (sin dos puntos), lÃ­nea en
  blanco, `PARÃMETROS DE ENTRADA:` y DEBAJO una lÃ­nea de 30 guiones, lÃ­nea en blanco, `RESULTADOS:` y DEBAJO otra lÃ­nea de 30 guiones
  (el usuario probÃ³ la lÃ­nea encima y pidiÃ³ volver a debajo; dos puntos al final de esas dos etiquetas; las tres etiquetas van en
  negrita con `<strong>`, el texto copiado no cambia).
  ParÃ¡metros = lo que el usuario dio; resultados = todo lo que sale del cÃ¡lculo (en PÃ©rdidas el Fp va primero; detalle por tramo
  con lo calculado y totales). Si el dato de partida no es la potencia activa, esta va en resultados. Cubierto por la secciÃ³n
  Â«estructura del reporteÂ» de `verify_perdidas.html` y `verify_regulacion.html`.
- Las tarjetas de PÃ©rdidas llevan `.tarjeta-borde` (borde `--table-border`: en claro mÃ¡s marcado que `--border`, que casi se perdÃ­a
  contra el fondo; en oscuro no cambia). Se dejÃ³ en 1px; si aÃºn se ve tenue, probar 1.5px antes que un color nuevo.
  Relleno de esas tarjetas y del panel azul de resultados: 16px (`--pad-tarjeta`, pedido por el usuario; antes 24px = `--space-5`),
  asÃ­ que del borde exterior al contenido hay 17px (1 de borde). La barra de tÃ­tulo usa la misma variable para llegar al borde.
  Solo aplica a `.tarjeta-borde`: las demÃ¡s `.card` y `.result-panel` de la app siguen en 24px.
- Las seis calculadoras ya usan este patrÃ³n (PÃ©rdidas, RegulaciÃ³n, OcupaciÃ³n de ductos, Cortocircuito, Ampacidad aÃ©rea y subterrÃ¡nea).
  Sigue pendiente por decisiÃ³n del usuario: los grÃ¡ficos de resultado; y las pantallas fuera de las calculadoras (catÃ¡logos, Varios,
  IAâ€¦) aÃºn usan `.hint` y el estilo anterior. Los refinamientos visuales (iconos, tÃ­tulos) los irÃ¡ indicando Ã©l.
- `assets/ejemplos/` (o `assets/Ejemplos/`) es una carpeta TEMPORAL de referencia del usuario, con un repo git anidado: NO subirla.
  EstÃ¡ excluida en `.git/info/exclude` (local); aun asÃ­, hacer `git add` solo con rutas explÃ­citas, nunca `git add -A`/`.`.

## ConversiÃ³n de unidades (`js/views/conversion-unidades.js`, `data/unidades.json`)

- Dos modos (2026-09-19, pedido del usuario). Casilla Â«Habilitar todas las conversionesÂ» DEBAJO de la tarjeta (mismo estilo que la de
  coordenadas). Apagada: mismas categorÃ­as/unidades/pares de siempre (`data/factores-conversion.json`, motor `convertirUnidad`), con
  Ãngulos al final y nombres con tilde (Ãrea, PresiÃ³n, Ãngulos); las listas de unidades llevan Â«sÃ­mbolo â€” nombreÂ» en ambos modos. Encendida: catÃ¡logo `data/unidades.json` (cada unidad con factor a la
  base de su categorÃ­a y offset solo en temperatura), motor `js/calc/unidades-extendido.js` (cualquier unidad a cualquier otra), 19
  categorÃ­as (alfabÃ©tico, Ãngulos al final; nuevas: Potencia, EnergÃ­a, Masa, Peso por longitud, Resistencia por longitud,
  Resistividad tÃ©rmica, Volumen, Tiempo con Â«ciclos (60 Hz)Â», Densidad y Calibre de conductor AWG/kcmil â†” mmÂ²/diÃ¡metro/calibre mÃ¡s
  cercano) y unidades escritas Â«sÃ­mbolo â€” nombreÂ».
- `data/unidades.json` y los factores de `factores-conversion.json` se GENERAN con `tools/generar_unidades.py` (editar ahÃ­, no a
  mano): los 71 pares se recalculan con factores exactos (antes tenÃ­an ~6 cifras, p. ej. mâ†’ft 3.28084). La herramienta de la IA
  (`convertir_unidades`) usa desde 2026-09-19 el mismo catÃ¡logo completo (`unidades.json`), incluido el calibre AWG/kcmil.
- Resultado del modo completo: 6 cifras significativas (`fmtSig`, sin recortar enteros; cientÃ­fica si <1e-4 o â‰¥1e9); el modo normal
  sigue con 4 decimales. Pruebas: `tools/verify_unidades.html`.

## SecciÃ³n "Funciones con IA" (`js/ai/*`, `js/views/ia*.js`)

- RediseÃ±o de las pantallas de IA (2026-09-19, el usuario dijo Â«cualquier cosa nos devolvemos al commit anteriorÂ»): en curso, una por una.
  **ConfiguraciÃ³n de IA** HECHA (commit anterior al rediseÃ±o: `c5d9379`): tarjetas `tarjeta-borde` con barra de tÃ­tulo e icono (Â«ConexiÃ³n con
  GeminiÂ», Â«ModeloÂ», Â«Datos y privacidadÂ»), ayudas en botones Â«iÂ» (sin `.hint`), estado de la clave en uso con enlace a Perfil (y aviso si es una
  clave del servidor), Â«Â¿CÃ³mo obtener mi clave?Â» como enlace (`.btn-enlace`), Â«Probar conexiÃ³nÂ» SOLO verifica la clave y Â«Actualizar listaÂ» carga los
  modelos (antes lo hacÃ­a Â«ProbarÂ»), ajustes avanzados (temperatura, rondas, cÃ¡lculos) plegados en `<details>`, privacidad en recuadro con viÃ±etas.
  **Corrector de redacciÃ³n** HECHO (commit anterior al rediseÃ±o: `3c5ed7f`): tarjeta Â«AgenteÂ» con barra de tÃ­tulo e icono y Â«Gestionar agentesÂ» /
  Â«HistorialÂ» DENTRO de la barra (clase `.barra-acciones`); descripciÃ³n del agente mÃ¡s visible (`.ia-desc-agente`); placeholder segÃºn el agente
  (`POR_AGENTE`); la respuesta lleva etiqueta (Â«Correo corregidoÂ», Â«ResumenÂ»â€¦; `.ia-msg-etiqueta`) y el botÃ³n Â«CopiarÂ» se queda DONDE ESTABA (el usuario
  lo pidiÃ³); atajos de ajuste Â«MÃ¡s corto / MÃ¡s formal / MÃ¡s cordial / Explica los cambiosÂ» bajo la ÃšLTIMA respuesta (`.ia-ajustes`, `AJUSTES_RAPIDOS`);
  panel de agentes con Â«Nuevo agenteÂ» como Ãºnico botÃ³n principal y menÃº Â«MÃ¡sÂ» (`details.menu-mas`: Exportar, Importar, Restaurar); editor sin tarjeta
  anidada (`.ia-editor`) y ayudas Â«iÂ». Historial con barra de tÃ­tulo. **AnÃ¡lisis con calculadoras** HECHO con el mismo patrÃ³n (commit anterior: `fa41a71`): tarjeta Â«AgenteÂ» (robot 21 px) con pestaÃ±as `Agentes | Gestionar | Historial`
  (`mostrarVista`); los agentes se eligen con pÃ­ldoras (ya NO hay botÃ³n Â«UsarÂ»), lÃ­nea Â«Modelo: â€¦ Â· Cambiar en ConfiguraciÃ³nÂ»; Â«GestionarÂ» = lista primero + Â«Nuevo agenteÂ»
  debajo a la izquierda, editor `.ia-editor` con barra Â«Viendo/Editando/Nuevo agenteÂ», fila marcada y ayudas Â«iÂ»; tarjeta Â«ConversaciÃ³nÂ» (burbuja) con los ejemplos y la caja
  (sin `ia-caja--al-borde`); tarjeta Â«Reporte de escenariosÂ» con barra (no se imprime) y fila de botones `.ia-reporte-acciones` (Generar reporte con IA = principal).
  Los ids del reporte y de la conversaciÃ³n no cambiaron (`#btn-reporte`, `#f-pregunta`, `#btn-enviar`â€¦) y la impresiÃ³n sigue igual. Todas las pantallas de IA quedan rediseÃ±adas.
  Pruebas: `tools/verify_ia_pantallas.html`.
  AJUSTE POSTERIOR en Corrector y AnÃ¡lisis (commit anterior: `013f1e4`... ver `git log`): el HISTORIAL pasÃ³ de la tarjeta Â«AgenteÂ» a la tarjeta Â«ConversaciÃ³nÂ»: Â«AgenteÂ» = `Agentes | Gestionar`;
  Â«ConversaciÃ³nÂ» = `Actual | Historial` (`mostrarVistaConv`; `#vista-actual` = chat + caja, `#panel-historial`). En el historial la fila de abajo deja SOLO Â«Nueva conversaciÃ³nÂ»
  (`.ia-acciones.solo-nueva`, que ademÃ¡s vuelve a Â«ActualÂ»); lo escrito en la caja se conserva; Â«AbrirÂ» vuelve a Â«ActualÂ» y arriba queda elegido el agente de esa conversaciÃ³n.
  AJUSTE POSTERIOR (commit anterior: `cca313f`): Â«Gestionar agentesÂ» e Â«HistorialÂ» YA NO abren tarjetas nuevas ni estÃ¡n en la barra: la tarjeta Â«AgenteÂ» es UNA
  sola con pestaÃ±as `Agentes | Gestionar | Historial` (`.ia-pestanas`, `mostrarVista()`); Â«AbrirÂ» en el historial vuelve solo a Â«AgentesÂ» con el agente de esa conversaciÃ³n.
  Botones de fila en Â«GestionarÂ» de AnÃ¡lisis (2026-09-20, pedido del usuario): Ver/Editar/Duplicar/Eliminar van juntos en `.ia-historial-acciones` y, si en UNA fila
  no caben junto al nombre, bajan los cuatro en TODAS (`alinearAcciones` en `pintarConfig`: mide con un ResizeObserver y pone `.acciones-abajo` en la lista). Edge headless no
  dispara ResizeObserver, por eso la prueba lo fuerza con el evento `alinear-acciones`. El Â«GestionarÂ» del Corrector (`ia-redaccion.js`, `pintarGestor`) lo tiene igual (Editar/Duplicar/Eliminar).

- Â«Imprimir / PDFÂ» del reporte de AnÃ¡lisis (2026-09-19): NO imprime la tarjeta de la pantalla sino un documento propio (`#doc-impresion`, armado en `armarDocumentoImpresion`, `ia-analisis.js`): Carta vertical (`@page reporte`, mÃ¡rgenes 20 mm, pie con Â«PÃ¡gina X de YÂ»), SIEMPRE en claro (clase `imprimiendo-reporte` tambiÃ©n en `<html>` con `color-scheme: light`), encabezado en la primera pÃ¡gina, Â«ConclusionesÂ» en recuadro gris, tablas con cabecera que se repite y aviso final. Los `#`/`##` de la IA salen como h2/h3 (ver `markdown.js`). Para ver el resultado: `msedge --headless --no-pdf-header-footer --print-to-pdf` sobre una pÃ¡gina de prueba con `window.print` anulado y convertir el PDF a PNG con pymupdf (`pip install pymupdf --target <carpeta>`).
- Â«DescargarÂ» del reporte de AnÃ¡lisis (2026-09-20): es un MENÃš (`details.menu-mas`, `#menu-descargar`) con Â«Documento de Word (.docx)Â» y Â«Markdown (.md)Â»; el usuario NO quiere un botÃ³n aparte por formato. El .docx se genera sin librerÃ­as: `js/ai/docx.js` (HTML de la IA + tablas â†’ XML de Word, mismo diseÃ±o del PDF: Carta, estilos Title/Heading, Â«ConclusionesÂ» sombreada, tablas con cabecera repetida, pie Â«PÃ¡gina X de YÂ») y `js/util/zip.js` (ZIP sin compresiÃ³n). Verificado: XML bien formado, `python-docx` lo lee y Word (COM) lo abre con 2 pÃ¡ginas; NO se pudo ver renderizado (la exportaciÃ³n a PDF por COM se cuelga). Pruebas: secciÃ³n Â«reporte en Word (.docx)Â» de `verify_ia.html`.
- Es la ÃšNICA excepciÃ³n a "100% offline": se conecta a Google Gemini con la clave del propio
  usuario (BYOK, guardada en el navegador; no hay backend). Detalle en el README.
- AnÃ¡lisis con calculadoras tiene agentes (`js/ai/agentes-analisis.js`, botÃ³n Â«AgentesÂ»): el predeterminado (Â«Agente estÃ¡ndarÂ») sale del
  cÃ³digo (`SISTEMA_ANALISIS`/`PROMPT_REPORTE` en `analisis.js`), es de solo lectura y nunca se escribe en `localStorage`; los
  propios se guardan ahÃ­ y siempre llevan `REGLA_FIJA` al final. Si cambia el prompt estÃ¡ndar, el predeterminado se actualiza
  solo. Cada agente elige las herramientas que puede usar (campo `herramientas`; en el editor son etiquetas de selecciÃ³n mÃºltiple `.ia-chip--herr` con âœ“ al marcarse, agrupadas por categorÃ­a, ya no casillas, y SIN negrita: basta el azul y la âœ“; las cajas de instrucciones del editor usan letra de 0.85rem mÃ¡s tenue; la nota Â«el agente estÃ¡ndar no se puede modificarâ€¦Â» va en un botÃ³n Â«iÂ» junto a su nombre, no como texto fijo): el filtro real es
  `declaraciones(permitidas)` + `ctx.permitidas` en `tools.js` (no solo el prompt); un agente guardado sin lista usa las del
  estÃ¡ndar (`HERRAMIENTAS_ESTANDAR`; una herramienta con `opcional: true` queda fuera de ellas: hoy `convertir_unidades` y
  `convertir_coordenadas`, grupo Â«VariosÂ»). Para exponer otro mÃ³dulo a la IA: ficha nueva en `tools.js` (campos, `calcular`,
  resultados con `res`), marcarla `opcional` con su `grupo` y agregar sus pruebas. Cubierto por
  `tools/verify_ia.html` (secciones Â«agentes de anÃ¡lisisÂ» y Â«herramientas permitidas por agenteÂ»).
- Herramientas de DISEÃ‘O (2026-09-20, `js/ai/tools.js`): `dimensionar_conductor`, `verificar_conductor` y `resolver_valor_limite` (tipo `diseno`, grupo Â«AnÃ¡lisisÂ»). Son `opcional: true` POR PEDIDO DEL USUARIO: el agente estÃ¡ndar NO las trae y solo se habilitan en un agente propio (no cambiar eso); combinan las calculadoras existentes, sin fÃ³rmulas nuevas, y exigen que el agente tenga habilitadas las calculadoras que usan. Detalle en `docs/ia-herramientas.md` (secciÃ³n 4); pruebas en `verify_ia.html`.
- Herramientas alineadas con las pantallas (2026-09-19; plan y registro de avance en `docs/plan-ajustes-ia.md`, TERMINADO salvo el reporte de la IA, `js/ai/reporte.js`, que el usuario decidiÃ³ rediseÃ±ar Ã©l con otras ideas: no tocarlo sin que lo pida). PÃ©rdidas y regulaciÃ³n aceptan `tramos`, dato de partida (MW/MVA/A) y conductores por fase y devuelven la clasificaciÃ³n Ã“ptimo/Aceptable/Elevado; cortocircuito acepta `corriente_falla_ka`; ocupaciÃ³n acepta `grupos` y da el radio 12D; ampacidad subterrÃ¡nea da la corriente circulante/tensiÃ³n inducida en la pantalla; unidades usa `data/unidades.json`; coordenadas acepta ~500 cÃ³digos EPSG y `puntos`. Los campos de nivel superior siguen valiendo para un solo tramo/tipo/punto. Los motores de `js/calc/` no se tocaron. Detalle en `docs/ia-herramientas.md` (secciÃ³n 4).
- ExplicaciÃ³n completa de cÃ³mo la IA usa las herramientas y de cÃ³mo agregar una nueva: `docs/ia-herramientas.md` (lÃ©elo antes de
  tocar `tools.js` o los agentes; si cambia ese comportamiento, actualÃ­zalo).
- La IA nunca calcula: las calculadoras se exponen como herramientas (`js/ai/tools.js`) que
  llaman a los motores de `js/calc/*.js`. Si cambia la firma de un motor, actualizar su adaptador
  en `tools.js` y correr `tools/verify_ia.html` (arnÃ©s en el navegador, ver su encabezado).
- No fijar nombres de modelo en el cÃ³digo (cambian): se listan desde la API en ConfiguraciÃ³n.
- En `sw.js`, `cache.addAll` falla completo si un archivo de `APP_SHELL` no existe: al agregar
  o borrar archivos, actualizar la lista y subir `CACHE_VERSION`.
- Si `bash` de Git no encuentra `ls/sed/python`, usar PowerShell (`python` sÃ­ estÃ¡ en el PATH ahÃ­).
  Para leer resultados de `verify_ia.html`: en Bash sirve `msedge --headless --dump-dom ... | python -c` (con el servidor en
  segundo plano); en PowerShell hace falta `Start-Process -RedirectStandardOutput` (la salida de `--dump-dom` no se captura con `&`).
- Pantallas de chat (Corrector de redacciÃ³n y AnÃ¡lisis con calculadoras), diseÃ±o acordado con el usuario (2026-09-19):
  una tarjeta que crece con la conversaciÃ³n (`.ia-chat--hilo`, SIN barra de scroll propia: desplaza la pÃ¡gina); la caja de
  texto es `.ia-caja` con un textarea autoajustable (`ajustarAlto`: debe mostrar completo el placeholder aunque ocupe varias
  lÃ­neas y se reajusta con ResizeObserver + rAF; queda a 12px del borde de la tarjeta); Nueva conversaciÃ³n / Dictar / Enviar
  van en una fila `.ia-acciones` DEBAJO de la tarjeta, con botones `.ia-accion` (icono + palabra, sin recuadro hasta pasar el
  cursor). La respuesta de la IA (`.ia-msg--model`) lleva fondo transparente y una lÃ­nea clara. No poner contador de caracteres
  ni avisos de privacidad en estas pantallas (la privacidad vive en ConfiguraciÃ³n de IA). AnÃ¡lisis es UNA sola tarjeta
  Â«ConsultaÂ» cuyas sugerencias desaparecen al iniciar el chat: el usuario rechazÃ³ dividirla en dos tarjetas.
- Dictado por voz (`js/ai/voz.js`): el pitido lo pone Android al iniciar el reconocimiento y la web no puede silenciarlo; por eso
  NO se reinicia el reconocimiento en las pausas (cada reinicio pita) y en Android los resultados se fusionan con
  `unirAcumulados` (Chrome los entrega acumulados y duplicaba el texto). El usuario descartÃ³ transcribir con Gemini y decidiÃ³
  (2026-09-19) dejar el dictado como estÃ¡ (ademÃ¡s puede dictar con el micrÃ³fono del teclado, Gboard): no modificarlo.
- Iconos `send`, `plus`, `copy` y `microphone` (`js/icons.js`) se escribieron de memoria de Tabler: si alguno se ve raro,
  recalcarlo del path real.
- Pruebas en este entorno: `python -m http.server` solo se mantiene con `run_in_background` (con `&` se cae); Edge headless no
  baja de ~500px de ancho (no sirve para medir celular); el tool de Bash convierte las secuencias de escape con doble barra
  invertida (saltos de lÃ­nea y unicode) dentro de los heredocs de Python: escribir los scripts de ediciÃ³n con Write a un archivo (o usar Edit). Borrar los `_test_*.html` temporales.
- Cada cambio en archivos del shell exige subir `CACHE_VERSION` de `sw.js` (hoy v221); en el celular hay que cerrar la app y
  abrirla dos veces para ver la versiÃ³n nueva.

## Acceso con Google (menÃº lateral â†’ Â«PerfilÂ», `js/auth/*`, `firebase/firestore.rules`)

- UbicaciÃ³n (2026-09-19, pedido del usuario): antes estaba en Ayuda â†’ Â«ConfiguraciÃ³n avanzadaÂ»; ahora es la secciÃ³n **Perfil** (`#/perfil`, vista `js/views/configuracion-avanzada.js`, tÃ­tulo Â«Perfil y configuraciÃ³n avanzadaÂ»), un Ã­tem con icono `user` al fondo del menÃº lateral, ENCIMA del botÃ³n de contraer (`perfilLink` en `nav.js`, lista `#nav-perfil`), sin tarjeta en Inicio ni en Ayuda (la tarjeta de Ayuda se eliminÃ³). `#/ayuda/configuracion` redirige a `#/perfil`. El router marca el Ã­tem activo ANTES de `render` (la vista espera al servicio y tardaba en resaltarse).

- Control de acceso con Firebase (login Google + lista de correos en Firestore). Un login solo en
  pantalla NO protege nada (el cÃ³digo es pÃºblico): la seguridad son las reglas de
  `firebase/firestore.rules`, que aplica el servidor. Nada confidencial puede ir en `data/*.json` ni
  en el repo: lo protegido debe vivir en el servidor.
- El backend simulado (`backend-mock.js`) es SOLO para pruebas: nunca se elige solo
  (`obtenerBackend()` devuelve null si `firebase-config.js` no tiene la config). Si se cambia el
  modelo de datos o las reglas, actualizar `firestore.rules`, `backend-firebase.js`,
  `backend-mock.js` (que replica las reglas) y correr `tools/verify_ia.html`.
- La clave de Gemini del servidor va SOLO en memoria (`js/ai/clave.js`), nunca en `localStorage`.
- Proyecto de Firebase: `herramientas-ingenieria` (plan Spark), ya configurado en
  `js/auth/firebase-config.js`. Pasos manuales y reglas: README ("Acceso con Google y Firebase").
  Verificado contra el Firebase real: el SDK carga y las lecturas/escrituras sin sesiÃ³n son
  denegadas por el servidor; el login de Google con el administrador funciona (confirmado por el
  usuario el 2026-09-18). El arnÃ©s no puede iniciar sesiÃ³n: los cambios en las reglas o el login
  se prueban a mano (y con el Simulador de reglas de la consola).

## Apariencia: color principal personal de cada tema (Perfil â†’ Apariencia, `js/util/tema.js`, 2026-09-19)

- PestaÃ±a Â«AparienciaÂ» a la derecha de Â«Clave de GeminiÂ» para usuario y administrador (los visitantes no ven el panel de Perfil). El color es
  PERSONAL y POR DISPOSITIVO (`localStorage`: `tema.colores` = solo los temas cambiados, y `tema.css` = CSS ya calculado que `index.html` aplica antes
  del primer pintado, sin parpadeo; sin Firebase ni reglas). Por tema: selector de color + 6 muestras + Â«RestablecerÂ» + vista previa (`.vista-tema`,
  que usa la paleta de OTRO tema gracias a los selectores agregados en `tokens.css`).
- REGLA DE ORO (pedida por el usuario): elegir el color predeterminado (oscuro `#4c9eff`, claro `#0e7c7b`) deja la paleta EXACTAMENTE como estaba, y ningÃºn
  color escrito a mano se rompe. La derivaciÃ³n es RELATIVA a la paleta actual: cada tono derivado se mide contra el base predeterminado en OKLCH
  (`rel` = misma diferencia de luminosidad, `abs` = misma luminosidad; misma proporciÃ³n de saturaciÃ³n y diferencia de matiz) y se reaplica al color elegido.
  Solo se derivan los tonos del acento (claro: accent, strong, soft, contrast, focus-ring, topbar-bg, thead-bg, thead-fg; oscuro: accent, strong, soft, contrast,
  focus-ring, fila-sugerida). Fondos, grises y estados (Ã©xito/advertencia/error) NO cambian. Si el color queda ilegible (contraste < 4.5:1 contra
  blanco en claro / contra `#2b2b2b` en oscuro) se ajusta solo la luminosidad. Si cambia `tokens.css`, actualizar `PREDETERMINADO` en `tema.js`:
  `tools/verify_tema.html` compara contra los valores reales de tokens.css y falla si no coinciden (con y sin el atajo, o sea, prueba la matemÃ¡tica).
- `app.css` NO debe tener colores del tema escritos a mano (todo por variables; la prueba lo vigila). `manifest.webmanifest` (theme_color) es estÃ¡tico y no cambia.

## Niveles de acceso: visitante / usuario / administrador (FASE 1 implementada 2026-09-19)

- Decidido con el usuario: la app se abre SIN login. Un **visitante** (sin sesiÃ³n, o con sesiÃ³n de un correo fuera de la lista) solo tiene 3
  mÃ³dulos: OcupaciÃ³n de ductos, Conductores desnudos y Distancias de seguridad (marcados `libre: true` en `sectionMenus`, `nav.js`);
  Varios y Funciones con IA no tienen ninguno (CodificaciÃ³n de entregables se quitÃ³ de los libres el 2026-09-19). El **usuario** (en `usuarios` con rol `usuario`) y el
  **administrador** (`admin`, ademÃ¡s gestiona la lista y la clave compartida en Perfil) lo tienen todo. Solo se implementÃ³ Google; el
  inicio con Microsoft es la FASE 2 (falta que el usuario registre la app en Microsoft Entra y probar `email_verified`/tenant de Celsia;
  ver el anÃ¡lisis: cuidar Â«nOAuthÂ», y el error de cuenta existente con otro proveedor).
- Pantalla Perfil rediseÃ±ada (2026-09-19, el usuario dijo Â«si no me gusta, revertimosÂ»; commit anterior al rediseÃ±o: `8afd35c`): tarjetas
  `tarjeta-borde` (16 px) con barra de tÃ­tulo e icono (`user`, `users`, `key`), Â«Mi cuentaÂ» (insignia de rol + Ãºltima confirmaciÃ³n del servidor
  y hasta cuÃ¡ndo vale sin conexiÃ³n), pestaÃ±as Â«Usuarios | Clave de GeminiÂ» solo para el administrador (el usuario normal ve solo la tarjeta de
  la clave), tabla con rol como insignia (lÃ¡piz â†’ selector compacto) y papelera para quitar, Â«Agregar correoÂ» arriba con controles de 44 px
  alineados, clave de Gemini con solo el campo de la fuente elegida y ayudas en botones Â«iÂ». Avisos de la clave: UN solo recuadro Â«Ten presenteÂ» con viÃ±etas (lo pendiente de la clave elegida; y, solo para el ADMIN con la clave compartida, quiÃ©n puede leerla y el cupo comÃºn). El usuario normal conserva la opciÃ³n Â«Clave compartidaÂ» (la usa, no la cambia; decidido con el usuario, opciÃ³n A) y ve Â«configurada / aÃºn no configurada por el administradorÂ». PRIVACIDAD: `firebase/firestore.rules` ahora
  deja `list` y `get` de OTROS correos solo al admin (`mock.listarUsuarios` tambiÃ©n): hay que PUBLICAR las reglas en la consola de Firebase
  (Firestore â†’ Reglas) o un usuario normal seguirÃ­a viendo la lista; la pantalla ya no la pide a los no-admin. Pruebas: secciÃ³n Â«pantalla de Perfil
  rediseÃ±adaÂ» de `verify_acceso.html`.
- Piezas: `js/auth/permisos.js` (reglas por ruta, `permitida`, `itemHabilitado`, `TEXTO_BLOQUEADO`), `js/auth/acceso.js` (nivel, cache y
  validaciÃ³n; `iniciarAcceso` en `app.js`), `js/util/tiles.js` (tarjeta de menÃº con o sin enlace), guardia en `js/router.js` (pantalla
  Â«Contenido para usuarios autorizadosÂ» + botÃ³n a Perfil; tambiÃ©n bloquea escribir la direcciÃ³n a mano) y `alCambiarAcceso` â†’ `router.refresh()`
  (salvo en `/perfil`). Los mÃ³dulos bloqueados se ven APAGADOS (decidido con el usuario): tarjeta mÃ¡s tenue (55 %), icono y tÃ­tulo en gris y un candado
  (Tabler `lock`) arriba a la derecha; en Ayuda el tÃ­tulo en gris con candado pequeÃ±o (los libres siguen azules y subrayados); sin
  hipervÃ­nculo y con la ayuda Â«Disponible al iniciar sesiÃ³nÂ» (`TEXTO_BLOQUEADO`); Perfil no se bloquea y muestra Â«Tu cuenta â€¦ no estÃ¡ autorizada. Contacta al administradorâ€¦Â».
- Vigencia sin conexiÃ³n: 15 dÃ­as contados desde la ÃšLTIMA confirmaciÃ³n del servidor (no desde el login). `localStorage["acceso.cache"]` =
  `{email, rol, validadoEn}`. Con internet se revalida al abrir, al recuperar la conexiÃ³n y al volver a la app tras 6 h (renueva los 15
  dÃ­as); si el servidor dice que ya no estÃ¡ en la lista, pierde el acceso al instante; si hay error de red, se conserva la cache; sin
  internet vale la cache si tiene â‰¤15 dÃ­as (si el reloj retrocede mÃ¡s de 1 dÃ­a no se acepta). Sin cache y sin internet: visitante.
  La sesiÃ³n de Firebase es la persistente por defecto (se inicia sesiÃ³n una vez por dispositivo). `backend.listo()` distingue Â«no cargÃ³ el
  SDKÂ» de Â«sin sesiÃ³nÂ». Es un control de USO (los archivos son pÃºblicos); lo protegido de verdad es lo del servidor.
- Pruebas: `tools/verify_acceso.html` (reloj falso + backend simulado). Lo que NO se prueba en el arnÃ©s: el login real (se prueba a mano).
- Fase posterior, NO implementada: Â«Solicitar accesoÂ» (`docs/puerta-de-acceso-general.md`, ya sin la puerta al abrir la app).

## Ideas APLAZADAS por el usuario (2026-09-20; analizadas, NO implementar sin que las pida)

- **Plantilla de informe por agente** (memoria de cÃ¡lculo): estructura + fuente de cada dato + formato Word; fases propuestas: Markdown por agente, campos con fuente (calculadora / usuario / IA), plantilla .docx corporativa. Pregunta abierta: Â¿hay un formato de memoria de cÃ¡lculo de Celsia?
- **Adjuntos en los chats de IA** (imÃ¡genes y PDF; foto de placa, ficha tÃ©cnica): viable con Gemini; reducir imÃ¡genes, mÃ¡x. 3, guardar solo el texto en el historial, y regla Â«transcribe lo que leÃ­ste y confirma antes de calcularÂ».
- **Otro proveedor de IA (Claude de pago, con clave propia)**: viable con un traductor de formatos por proveedor; la clave de pago SIEMPRE personal (nunca la compartida del servidor); avisar del costo. Otras herramientas de IA posibles: barrido 2D, comparador, costo de pÃ©rdidas, consultar norma (requiere pasar las tablas de imagen a datos), ficha del caso.
- AdemÃ¡s siguen pendientes: fase 2 del acceso (login Microsoft), Â«Solicitar accesoÂ», grÃ¡ficos de resultado y el Â«reporte de la IAÂ» (`js/ai/reporte.js`, lo rediseÃ±a el usuario).

## (HistÃ³rico) Puerta de acceso general con solicitud de acceso

- AnÃ¡lisis del 2026-09-18 (la puerta al abrir la app NO se hizo: se optÃ³ por el modelo visitante/usuario de arriba; queda la idea de Â«Solicitar accesoÂ»). **Todo el detalle estÃ¡ en
  `docs/puerta-de-acceso-general.md`: lÃ©elo entero antes de retomarlo** (flujo, reglas de Firestore
  en borrador, opciones de correo, diseÃ±o offline, riesgos, fases y preguntas abiertas).
- Idea: al abrir la app se pide login con Google; si el correo estÃ¡ en `usuarios` entra (admin o
  usuario); si no, "sin acceso" con botÃ³n **Solicitar acceso** que crea `solicitudes/{correo}` y el
  admin aprueba/rechaza en Perfil y configuraciÃ³n avanzada. Reutiliza `js/auth/*` y las reglas actuales.
- Advertencia clave: es un control de USO, no de confidencialidad (el sitio y sus archivos son
  pÃºblicos en GitHub Pages). Proteger contenido de verdad exigirÃ­a Cloudflare Access u otro hosting.
- Decisiones sin confirmar (preguntar al usuario antes de implementar): propÃ³sito, alcance (toda la
  app vs solo mÃ³dulos sensibles), vigencia del permiso offline (recomendado 14 dÃ­as) y aviso por
  correo (recomendado: sin correo al inicio).

## Convenciones de UI/CSS

- Iconos (`js/icons.js`): SVG inline propios, sin CDN (requisito de offline). El estilo
  visual replica Tabler Icons (outline, stroke-width 2 envuelto en `<g>` para los iconos
  "tablerizados"). Un mismo nombre de icono (`calculator`, `book`, `archive`, `grid`...)
  se reutiliza entre el sidebar (`js/nav.js`) y las tarjetas de Home (`js/views/inicio.js`)
  para que coincidan visualmente sin duplicar definiciones.
- `.content` (`css/app.css`) ya NO tiene `max-width`/centrado: ocupa todo el ancho
  disponible junto al sidebar en todas las vistas (se quitÃ³ el `max-width:1100px` el
  2026-09-17 porque dejaba un espacio vacÃ­o grande a la derecha en pantallas anchas).
- Todas las tarjetas de menÃº (Home y los submenÃºs CÃ¡lculos/CatÃ¡logos/Normatividad/Funciones con IA/Varios)
  usan el layout horizontal (icono circular a la izquierda, texto a la derecha) vÃ­a las
  clases modificadoras `.menu-grid--row` / `.menu-tile--row` (renombradas desde `--home`
  el 2026-09-17 al dejar de ser exclusivas del Home). El tÃ­tulo+descripciÃ³n van envueltos
  en un `<span class="tile-body">`.
- Iconos en `js/icons.js` deben calcarse trazo a trazo del path real de Tabler Icons, no
  aproximarse: un pequeÃ±o error en las coordenadas (p.ej. el icono `hash`, corregido el
  2026-09-17) deforma visualmente el sÃ­mbolo.
- CatÃ¡logos (2026-09-19): ademÃ¡s de los 3 de conductores hay un 4.Âº, Â«TuberÃ­asÂ» (`#/catalogos/tuberias`), con los datos de
  `data/tuberias.json` (los mismos de la calculadora de OcupaciÃ³n de ductos). Reutiliza las MISMAS vistas genÃ©ricas por familia
  (`catalogo-conductores.js` y `detalle-conductor.js`, cada una con su entrada `tuberias` en `CONFIG`): filtro por tipo de tuberÃ­a,
  buscador por diÃ¡metro nominal y ficha de detalle. El archivo no trae `id`: `conIdPorPosicion` (`js/util/format.js`) le pone la
  posiciÃ³n como `id` a una COPIA de las filas (no se modifica el dato cacheado que usa OcupaciÃ³n de ductos ni el JSON). Su tarjeta usa
  el icono `underground` (el mismo de Ampacidad subterrÃ¡nea; el usuario descartÃ³ uno tipo tubo porque se confundirÃ­a con los de
  conductores). Al agregar otra familia: entrada en `CONFIG` de las dos vistas + tarjeta en `sectionMenus.catalogos` (`nav.js`).
  Pruebas: `tools/verify_catalogo_tuberias.html`.
- Normatividad â†’ visor de imÃ¡genes (`js/views/normativa-imagen.js`): un tema puede llevar una `nota` (texto normativo citado), que se
  pinta como nota al pie DEBAJO del visor (`.nota-pie`: texto pequeÃ±o con lÃ­nea vertical a la izquierda; siempre visible, no depende de
  la tabla elegida). Â«Enterramiento de ductosÂ» la usa desde 2026-09-19: el numeral 3.20.6.3.g del RETIE 2026 (antes citado como RETIE 2024; el usuario pidiÃ³ el cambio de aÃ±o el 2026-09-19) era una imagen de texto
  que solo remite a las Tablas 300.5 y 300.50 de la NTC 2050; se pasÃ³ a nota (texto completo, con la excepciÃ³n de 0,45 m), se quitÃ³
  del selector y se borrÃ³ `assets/normativa/numeral-3-20-6-3-g.jpg` (y su lÃ­nea del service worker; sigue en el historial de git).
  Los tÃ­tulos de las tablas de Â«Distancias de seguridadÂ» (Â«Tabla 3.10.1.a â€” Distancias mÃ­nimasâ€¦Â», 8 tablas) son los de la app original
  de Power Apps (`Selector_Tablas` en `Src/Distancias de seguridad.pa.yaml` del `.msapp`, que sigue en el historial de git: commit
  `dccdd6a^`); mismo formato Â«numeral â€” descripciÃ³nÂ» que Enterramiento de ductos. El selector llega hasta 960 px de ancho. En pantalla
  angosta el desplegable cerrado corta los tÃ­tulos largos: se probÃ³ repetir el tÃ­tulo completo debajo del campo y el usuario lo
  RECHAZÃ“ (2026-09-19); no volver a ponerlo (el desplegable abierto sÃ­ muestra el tÃ­tulo completo).
  Al agregar/quitar imÃ¡genes de `assets/normativa/` recordar el `APP_SHELL`. Pruebas: `tools/verify_normatividad.html`.
- ConversiÃ³n de coordenadas (2026-09-19): ademÃ¡s del conversor de los 7 sistemas (`js/calc/coordenadas.js`, motor original propio: NO
  tocarlo, lo usa tambiÃ©n la IA), la casilla Â«Habilitar todos los sistemas de coordenadasÂ» reemplaza, EN EL MISMO formulario,
  las dos listas por dos campos de cÃ³digo EPSG (entrada y salida) para convertir entre cualquier par de ~509 cÃ³digos EPSG (los de Colombia â€”MAGNA-SIRGAS, BogotÃ¡ 1975, Origen Nacional, las 32 cuadrÃ­culas urbanas de las ciudadesâ€” y los
  mÃ¡s usados del mundo: WGS84, las 120 zonas UTM, NAD83, ETRS89, SIRGAS, etc.). ReemplazÃ³ al enlace a un cuaderno de Google Colab
  (que el usuario considerÃ³ demasiado complejo; tampoco quiso una tarjeta/nota aparte: los campos se explican solos).
  Las listas y los campos EPSG ocupan el MISMO lugar (`.campos-sistemas`: la pareja inactiva solo se oculta con
  `visibility`), y bajo cada campo hay una lÃ­nea de nombre reservada (`.hint-linea`, una sola lÃ­nea con Â«â€¦Â»): asÃ­ habilitar todos los
  sistemas NO corre nada hacia abajo (pedido del usuario; probado en las pruebas). El botÃ³n Â«Convertir por lotesÂ» (junto a Convertir) cambia su texto a Â«Convertir un puntoÂ» al encenderse (ambos textos ocupan el mismo lugar: `.btn-dos-textos`,
  el botÃ³n mide siempre lo mismo; estado en `data-lotes`) y cambia longitud/latitud por un cuadro (la casilla de todos los
  sistemas va DEBAJO de la tarjeta, abajo a la izquierda, con el cuadro a la izquierda del texto: ubicaciÃ³n elegida por el usuario).
  Lectura de datos pegados de Excel/CSV (`parsearPareja` y `numeroFlexible` en `coordenadas-epsg.js`, con pruebas): separadores tabulaciÃ³n,
  Â«;Â», espacios o UNA coma (con punto decimal); con tab/Â«;Â»/espacio la coma es DECIMAL; se ignoran comillas, BOM, separador final y una
  primera lÃ­nea sin dÃ­gitos (encabezado); se rechazan con mensaje el separador de miles, mÃ¡s de 2 columnas y varias comas. Los campos de
  un solo punto son de texto (`inputmode=decimal`) y aceptan punto o coma en cualquier navegador. Aviso Â«latitud y longitud invertidasÂ»
  (solo reconoce el caso de Colombia). Para el cuadro por lotes donde cada lÃ­nea es una pareja separada por
  espacio; la salida es una lÃ­nea por punto (mismo orden y formato) y los avisos se agrupan con los nÃºmeros de lÃ­nea. Los AVISOS DE ÃREA
  DE USO (punto fuera del Ã¡rea del sistema de entrada o de salida) tambiÃ©n salen con los 7 sistemas de la lista: se calculan con las Ã¡reas
  de `data/sistemas-epsg.json` (los 7 ya estÃ¡n ahÃ­) y el cÃ¡lculo numÃ©rico sigue siendo el del motor original. Usa proj4js (`vendor/proj4`, MIT, carga perezosa con `js/util/proj4.js`) y el
  catÃ¡logo `data/sistemas-epsg.json` (~70 KB, `{codigo: [nombre, cadena proj4, [N, O, S, E]]}`), generado de la base abierta
  `epsg-index` (npm; bajada con PowerShell, que SÃ tiene internet aquÃ­) filtrando por Colombia + lo mÃ¡s usado y SIN los que necesitan
  archivos de rejilla (NAD27, OSGB36â€¦); para agregar cÃ³digos hay que regenerarlo igual. LÃ³gica pura en `js/calc/coordenadas-epsg.js`
  (cÃ³digo escrito por el usuario, ficha con unidad, avisos de datum y de Ã¡rea de uso, `convertirEntreSistemas`).
  Las cuadrÃ­culas urbanas usan `+proj=col_urban` (EPSG 1052), que proj4js NO trae: `js/util/proj4-col-urban.js` la agrega
  (formulas de la guÃ­a IOGP 7-2, como en PROJ). Verificado: da el mismo resultado que el conversor original en los 7 sistemas
  (diferencia < 1e-6 mm), el origen de cada proyecciÃ³n es exacto, y las distancias de la cuadrÃ­cula de BogotÃ¡ difieren de las de 3116
  en (1 + h_0/R). Exactitud: entre datums distintos (p. ej. BogotÃ¡ 1975 â†” MAGNA) proj4 usa los parÃ¡metros +towgs84 (orden de metros): el
  panel avisa. Orden de coordenadas siempre X (longitud/este) e Y (latitud/norte). Pruebas: `tools/verify_coordenadas_epsg.html`.
- MenÃº lateral: en pantallas anchas (>880px) se puede contraer con el botÃ³n del fondo de la barra
  (queda una barra de 64px solo con iconos; estado en `localStorage.sidebarCollapsed` y clase
  `sb-collapsed` en `<html>`). La barra es `sticky` con el alto de la ventana para que el botÃ³n
  quede siempre en el borde inferior visible sin scroll propio. En mÃ³vil se ignora y se usa el
  cajÃ³n emergente. Medir posiciones/espaciados con un iframe temporal, no a ojo. El orden
  del menÃº (`sidebarLinks` en `js/nav.js`) es CÃ¡lculos, CatÃ¡logos, Normatividad, Funciones con IA,
  Varios, Ayuda; el Home y Ayuda siguen el mismo orden.
- Las pantallas NO llevan descripciÃ³n bajo el tÃ­tulo (decidido el 2026-09-18: ya la dicen las
  tarjetas de menÃº); no volver a agregarla, ni tampoco el texto de bienvenida del Home (tambiÃ©n
  retirado). `.page-subtitle` solo se usa en el "objeto" de la resoluciÃ³n
  (`detalle-resolucion.js`, es un dato). `.page-title`
  ya trae el margen inferior de una pantalla sin descripciÃ³n. `sectionMeta.*.subtitle` (`nav.js`)
  se conserva porque la pantalla Ayuda lo muestra en la tarjeta de cada secciÃ³n.
- Modo oscuro: `--bg` es `#0f0f0f` (antes `#1e1e1e`, se oscureciÃ³ ~50% el 2026-09-17).
- Tema claro (2026-09-18): barra de tÃ­tulo de color sÃ³lido `#0a5f5e` (sin degradado), `--bg` `#e7eaee`
  y `--bg-sunken` `#dce1e8`; encabezados de tabla en verde (`--thead-bg`/`--thead-fg`) y borde
  exterior de tablas mÃ¡s marcado (`--table-border`). El tema oscuro conserva sus valores: al
  cambiar colores usar estas variables, no valores fijos.
- Ficha de detalle de conductor (`detalle-conductor.js`, 3 familias): lista de filas en dos
  columnas (`.detail-list`/`.detail-row`, filas de 50px, valores alineados a la izquierda); en
  <=560px la columna de etiquetas se ajusta a la mÃ¡s larga. `.detail-grid`/`.detail-item` se
  conservan solo para el detalle de resoluciones: no tocarlos al cambiar la ficha de conductor.
- Medir posiciones/tamaÃ±os en el navegador (script CDP o iframe) en vez de a ojo; el Edge de
  pruebas reutiliza el service worker: usar un perfil limpio para ver CSS reciÃ©n cambiado.

## VerificaciÃ³n visual de cambios de UI

En este entorno (Windows, bash de Git) no hay Node/npx/chromium-cli disponibles para
Playwright. Para verificar visualmente un cambio de UI: levantar `python -m http.server`
en el directorio del proyecto y tomar un screenshot con Edge headless vÃ­a PowerShell:

```
& "C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe" --headless --disable-gpu `
  --screenshot="$env:TEMP\out.png" --window-size=960,700 --virtual-time-budget=4000 `
  "http://localhost:PUERTO/index.html#/ruta"
```

Luego leer la imagen con la herramienta de lectura de archivos. Recordar detener el
servidor de prueba al terminar.

## Flujo de trabajo con git

- DespuÃ©s de cada commit, hacer `git push` de inmediato sin pedir confirmaciÃ³n.
- Commits en espaÃ±ol, concisos, describiendo el cambio funcional (no el "quÃ©" obvio
  del diff).

## Estilo de comunicaciÃ³n

- Respuestas breves y directas.
- El usuario suele trabajar en espaÃ±ol; responder en espaÃ±ol salvo que pida lo contrario.

---
_Este archivo se actualiza al final de cada sesiÃ³n de trabajo con reglas o contexto
nuevo que sea coherente conservar. Si algo aquÃ­ queda desactualizado, corregirlo en
lugar de acumular excepciones._
