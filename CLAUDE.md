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
- Los datos de catálogos (`data/*.json`) son los «de fábrica» y se editan directamente (OJO: desde 3.18.0 cinco de ellos se
  publican en el servidor y GANA el servidor; ver «Catálogos desde el servidor»): el `.msapp` original de Power Apps
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
  Reactancia inductiva (Xl) e impedancia efectiva (Z) de cada tramo (2026-09-24, pedido del usuario): SOLO en el reporte,
  en RESULTADOS, justo antes de «Constante de regulación» (4 decimales, Ω/km); NO como métricas en pantalla. Salen del
  motor sin tocarlo (`regulacion-tramos.js` ahora las pasa por tramo). Se quitó la nota de Fórmulas que decía que no se
  mostraban «igual que en la aplicación original».
  Valores iniciales del dato de partida (2026-09-24, pedido del usuario): FP **0.9** (antes 0.95, igual que Pérdidas y
  Conductor económico), y por coherencia 9.9 MW = **11 MVA** = **184.1 A** a 34.5 kV (antes 10.42 MVA y 174.4 A). En
  `verify_regulacion.html` las pruebas de la vista usan `FP_VISTA`/`E1V`; las del motor siguen con su propio FP 0.95.
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
  «Tubería» (icono `cylinder` girado 90° en sentido antihorario con la clase `.icono-tubo`, 2026-09-21; tipo, diámetro nominal y diámetro interno del catálogo con «Manual») y una tarjeta «Conductores tipo N» (2026-09-21: sin guión, en plural; igual en el reporte de texto: «Conductores tipo N:»)
  por cada TIPO de conductor (icono `conductorCableado`; «Agregar tipo de conductor» / «Quitar»: p. ej. una terna de un calibre y otra de
  otro). Cada tipo tiene número de conductores (1–9) y diámetro con casilla «Catálogo» a su derecha: al marcarla salen Nivel de
  tensión → Nivel de aislamiento (solo 15/35 kV; en 17.5/36 kV queda «No aplica») → Material → Pantalla → Calibre del catálogo
  `conductores-xlpe.json`, y el diámetro es `diametro_total_conductor_mm` (cable completo con chaqueta), bloqueado. Las listas se
  encadenan y conservan la selección si sigue disponible. El límite NTC-2050 (53/31/40 %) usa el número TOTAL de conductores (2026-09-21: la línea «Total de conductores: N» ya NO va bajo las tarjetas; va en la DONA del resultado, arriba de «Límite NTC-2050: X %», que baja un poco; `donaOcupacionSvg({…, total})`. Ya no se ve el total mientras se edita, solo tras Calcular) y el atascamiento (jamming) solo se evalúa con 3 en total y del mismo diámetro. El motor
  `js/calc/ocupacion-ductos.js` y la herramienta de la IA NO se tocan; la suma de tipos vive en `js/calc/ocupacion-grupos.js`. Se
  agrega el RADIO DE CURVATURA = 12D (12 × diámetro exterior del conductor, en mm; factor fijo, sin campos; `radioCurvaturaMm`
  por tipo en `ocupacion-grupos.js`): métrica «Radio de curvatura (12D)» con un solo tipo, columna en la tabla por tipo con varios
  (la celda del Total queda VACÍA, pedido del usuario), línea en el reporte y ecuación en Fórmulas. Se conserva la dona del resultado (ya existía; los «sin gráficos» eran de Pérdidas/Regulación). Pruebas: `tools/verify_ocupacion.html`.
  `#tramos-container, #grupos-container` llevan el margen superior que separa las tarjetas de la primera.
- Gráficos de Ocupación de ductos (2026-09-20, elegidos por el usuario entre 5 propuestas): el resultado va en TRES columnas (`.oc-resumen`: corte transversal | dona | cifras grandes, alineadas a la izquierda y con corte y dona del mismo tamaño; una columna bajo 900 px; el usuario probó antes dona | cifras | corte y prefirió esta variante). Un conductor más grueso que el ducto se dibuja con el diámetro del ducto (lo llena por completo; el usuario descartó «− 1 mm» por incoherencias en ductos pequeños, y luego «− 1 %»). Ambos son SVG dibujados por código en `js/util/graficos.js` (`donaOcupacionSvg`, `corteDuctoSvg`, `asentarConductores`; sin librerías, con las variables de color del tema y vectoriales al imprimir). La dona lleva degradado y la marca del límite NTC-2050; el corte es a escala, con los conductores apoyados en el fondo (simulación de gravedad) y un color por tipo. Nombre de la técnica: «gráficos SVG a medida» (pedir así los siguientes). Se descartaron: torta con porciones, medidor semicircular y barra segmentada (el medidor queda como idea para Pérdidas/Regulación). El motor y la herramienta de la IA NO se tocaron.
- Cortocircuito (2026-09-19) sigue el mismo patrón. Dos tarjetas: «Conductor» (icono `conductorCableado`; red | material, calibre | área con
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
  k₁ (2026-09-24, verificado en la literatura a pedido del usuario) = constante térmica del material para cortocircuito de la
  ecuación ADIABÁTICA de ICEA P-32-382 (todo el calor queda en el conductor; depende del calor específico y la
  resistividad), en A·√s/mm² y con log10: ICEA da (I/A)²·t = 0,0297·log10(…) en cobre y 0,0125 en aluminio con A en
  circular mils → √0,0297 × 1973,5 ≈ 340 (la app usa 341) y √0,0125 × 1973,5 ≈ 221 (la app usa 224, heredado del
  original; no se cambió el motor). En las notas de Fórmulas se quitó «Con «Manual» se pueden modificar».
- Ampacidad aérea (2026-09-19) sigue el mismo patrón. Tres tarjetas: «Conductor» (icono `conductorCableado`; tipo | calibre, referencia |
  diámetro con «Manual», resistencia 25 °C | 75 °C con «Manual»), «Condiciones de operación» (icono Tabler `wind`; temperatura
  ambiente | máxima del conductor, viento | ángulo, elevación) y «Radiación solar y superficie» (icono Tabler `sunTabler`, distinto
  del `sun` viejo; ε | α, Qse | θ con «Manual»). Botones «i» solo en resistencias (interpolación 25→75 °C), viento, ángulo, ε/α (rango
  0.23–0.91), Qse (se ingresa, no se calcula) y θ. Sin funciones nuevas, con UNA mejora: cuando el balance no admite corriente
  (Tc < Ta o sol excesivo) el motor da NaN y antes se mostraba «NaN»; ahora la pantalla avisa con un callout y el reporte lo dice
  (la herramienta de la IA ya hacía lo mismo). Las intermedias (Qc, Qr, Qs, R) van en RESULTADOS del reporte. Fórmulas KaTeX: balance,
  propiedades del aire, convección, radiación y resistencia (15 ecuaciones, 23 etiquetas). El motor `js/calc/ampacidad-aerea.js` y la
  herramienta de la IA NO se tocan. Pruebas: `tools/verify_ampacidad_aerea.html`.
  Las dos primeras notas de Fórmulas se reescribieron (2026-09-24, pedido del usuario: no eran claras): la ampacidad es
  la corriente cuyo I²·R iguala lo que el conductor disipa a su temperatura máxima (convección + radiación − ganancia
  solar), y la convección se calcula de tres formas (natural, forzada con viento bajo y con viento alto) y se usa la mayor.
  **Qse con la posición del sol (2026-09-24, 3.21.0, ver `docs/funcionalidades-futuras.md` A)**: casilla «Calcular con la
  posición del sol» al FINAL de la tarjeta, debajo de Qse|θ (3.21.1, pedido del usuario; antes iba entre ε|α y Qse|θ); muestra latitud (4.6, Bogotá) | azimut de la línea (90), fecha (hoy) con el enlace
  «Peor día del año» | hora solar (12), y atmósfera Clara/Industrial. Qse y θ se llenan solos (redondeados a 0.1; «Calcular»
  usa el valor exacto) y sus «Manual» se desactivan; usa la elevación de la pantalla (Ksolar). `js/calc/posicion-solar.js`
  (IEEE 738: declinación, ángulo horario, Hc, Zc, polinomio Qs clara/industrial, Ksolar, θ; `peorDiaDelAnio` = máximo de
  Qse·sen θ en los 365 días a esa hora). El azimut usa `atan2` en vez de la tabla de la constante C: da lo mismo (probado en
  600 casos) salvo a las 12 en punto, donde la tabla no distingue sol al norte/sur (en Colombia pasa medio año); Qse y sen θ
  coinciden igual. Reproduce el ejemplo de la norma (30° N, 10 de junio, 11 h: Hc 74.9°, Zc 114°, θ 76.2°, Qs 1027 W/m²).
  Con la casilla, Qse y θ pasan de PARÁMETROS a RESULTADOS en el reporte (junto con δ, ω, Hc, Zc, Qs y Ksolar). Fórmulas: 21
  ecuaciones y 33 etiquetas. `input[type=date]` se agregó a la regla general de campos de `app.css`. Motor e IA sin cambios.
- Ampacidad subterránea (2026-09-19, la ÚLTIMA calculadora rediseñada: ya están las seis) sigue el mismo patrón. Tres tarjetas: «Cable»
  (icono `conductorCableado`; tipo | material, calibre | pantalla, nivel kV | % de aislamiento, puesta a tierra | separación entre fases;
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
  Nota de Fórmulas sobre V_ind (2026-09-24, a raíz de una consulta del usuario): V_ind es una tensión POR KM (gradiente),
  no la tensión en un punto; unipuntual → máxima en el extremo sin aterrizar ≈ V_ind × longitud del tramo; cross-bonding →
  las pantallas se cruzan en cada tercio de la sección mayor, las tensiones de las tres fases se anulan (no circula
  corriente), casi 0 en los extremos aterrizados y máxima en las cajas de cruce ≈ V_ind × longitud de la sección menor. El
  usuario NO quiso un campo de longitud para calcular esa tensión en voltios (se le ofreció): solo la nota.
  **Conductor de continuidad de tierra (GCC; 2026-09-24, 3.21.0, ver `docs/funcionalidades-futuras.md` B1)**: cuarta tarjeta
  (icono Tabler `circuitGround`) que solo aparece con cable MONOPOLAR y puesta a tierra Unipuntual (casilla «Dimensionar el
  conductor de continuidad de tierra») o Cross-bonding (solo una NOTA: el GCC no suele ser obligatorio; decidido con el
  usuario). Campos: corriente de falla a tierra (kA), tiempo de despeje (0.3 s; es el mismo valor por defecto de Perfil >
  Calculadoras que Cortocircuito), material, temperatura inicial (= la del terreno mientras no se escriba a mano) y final
  admisible (250 °C; la «i» dice desnudo 250 / PVC 160 / XLPE-EPR 250). Ocultos = deshabilitados (no bloquean «Calcular»).
  `js/calc/conductor-continuidad.js` (`dimensionarGcc`, `CALIBRES_GCC` 8 AWG…1000 kcmil) despeja el área con el motor de
  Cortocircuito sin tocarlo. Resultado (pedido del usuario): PRIMERO el área mínima en mm² y luego el calibre comercial
  más cercano por encima; no cambia la ampacidad. Reporte, Fórmulas (2 ecuaciones, 6 etiquetas) y nota. Motor e IA sin cambios.
- Conductor económico (2026-09-21; nombre: primero se llamó «Análisis económico» y el usuario pidió «Conductor económico» (2026-09-21), que es el definitivo): calculadora NUEVA en `#/calculos/conductor-economico` (icono `coin`, Tabler; no es libre: solo usuarios). Se diseñó conversando con el usuario a partir de un prompt ajeno (módulo económico de la «Calculadora Normativa»), y se corrigieron sus errores: faltaba el factor 3 en `3·I²·R·L`, usaba demanda máxima las 8760 h (aquí se reutiliza el factor de pérdidas de Pérdidas), citaba IEC 60287 para pérdidas y una nota de CREG 015/2018 (8 %/5 %) que no se copió. Decisiones del usuario: SOLO línea nueva (sin reconducción), un solo calibre por opción, de 2 a 5 opciones (agregar/quitar), criterio principal = COSTO TOTAL ACTUALIZADO (inversión + valor presente de pérdidas; el VAN/TIR del prompt se descartó: sin línea base no están definidos), precios ESCRITOS por el usuario en cada análisis (los catálogos no traen precios y el repo es público: no agregar precios reales a `data/*.json`), crecimiento de la demanda como campo (0 por defecto), sensibilidad como TABLA (el tornado queda para después) y SIN valor residual ni O&M (explicado: no cambian cuál opción gana; si se quiere, un campo «O&M $/km» igual para todas). Pesos corrientes (tasa nominal). Detalle en el README. Motor `js/calc/conductor-economico.js` (usa `perdidas.js` sin tocarlo); pruebas `tools/verify_conductor_economico.html` (contra un cálculo independiente en kW, 123 comprobaciones). Ajustes del usuario (2026-09-21): el costo de instalación es OPCIONAL (vacío = 0, «solo se considera el conductor»; la nota «i» y el reporte lo dicen); en las tablas comparativas NO se pinta de azul la columna de la mejor opción (el énfasis va solo en su título: color del tema + barra inferior, clase `col-mejor` en el `th`) y hay líneas verticales entre TODAS las columnas (clase `.tabla-matriz`, solo en estas dos tablas). Icono `coin` con el trazo base de la app (1.6, SIN `<g stroke-width="2">`): con 2 se veía más grueso que Pérdidas/Cortocircuito en la tarjeta del menú (los iconos Tabler con `<g stroke-width="2">` se ven así de gruesos a 20 px; por eso en el menú Cálculos `ductoTerna`, `powerTower` y `underground` también se dejaron en el trazo base, 2026-09-21). Tasa de descuento con nota «i» corta y técnica, valores de referencia orientativos (8 %–14 %; no son de Celsia). Herramienta de la IA (2026-09-22): `calcular_conductor_economico` en `js/ai/tools.js`, detalle en `docs/ia-herramientas.md` sección 4. Entró al agente estándar el 2026-09-23 (pedido del usuario, se quitó `opcional: true`); sigue sin entrar al barrido (no está en `CALCULADORAS`: su resultado es una comparación entre opciones, no un valor único que tenga sentido barrer). Pendiente: gráfico de flujo acumulado/tornado con «gráficos SVG a medida», y decidir si los precios se guardan entre sesiones (solo local).
  **Sensibilidad al costo de instalación (2026-09-23, idea del usuario, refinada conversando con él).** El usuario ya había
  intentado estimar el costo de instalación con algún factor cuando no se conoce y lo descartó por «muy difícil e inexacto»
  (no estaba escrito antes en este archivo). Para esos casos (costo de instalación vacío/0 en al menos una de las dos
  opciones comparadas), se agregó `sensibilidadInstalacion(resultado, longitudKm, instalacionIndicada)` en
  `js/calc/conductor-economico.js`: NO es un cálculo nuevo, solo expresa `diferenciaVsMejor` (que ya excluye instalación
  cuando no se indicó) en $/km — la unidad comparable con un costo de instalación. Decisiones de diseño acordadas con el
  usuario: (1) el número es una DIFERENCIA neutral, nunca "la opción X costaría más/menos" — no se sabe cuál instalación
  sería más cara, y afirmar una dirección sería inventar; (2) se calcula GANADORA vs. CADA otra opción (una fila por cada
  una, no solo contra la más cara ni solo contra la más cercana); (3) como referencia de escala, sin inventar una base de
  precios de instalación real, se muestra a cuántas veces equivale el costo del propio conductor de la ganadora por km
  (`vecesConductor`); (4) solo se muestra por par cuando A LA MENOS UNA de las dos opciones (ganadora o la otra) le falta
  el dato — si ambas indicaron un costo real, no se muestra nada para ese par. En la vista
  (`js/views/calc-conductor-economico.js`) aparece como un bloque `result-subhead` + párrafo + tabla `tabla-resultado
  tabla-matriz`, entre la matriz de comparación y la tabla de sensibilidad de escenarios (mismo patrón visual que ya
  existía, sin CSS nuevo); también en el reporte de texto (se omite por completo si no aplica a ninguna opción) y en la
  pestaña Fórmulas (`U_i = Δ_i / L`, ecuación 15, etiqueta 24). En `js/ai/tools.js` agrega `opcionN_umbral_instalacion_km`
  por opción afectada, con una nota que aclara al modelo que es una diferencia neutral, no una estimación de instalación.
  Pruebas: sección nueva en `tools/verify_conductor_economico.html` (incluye el caso de empate, umbral = 0) y ampliación de
  la sección "tools: conductor económico" de `tools/verify_ia.html`.
  **Versión VIGENTE (2026-09-24, 3.20.0; reemplaza el punto (3), el orden y la presentación de arriba)**. Tras varias
  versiones que al usuario no le resultaban claras (tabla «Sobrecosto mínimo…», tabla «Ventaja de la Opción G», recuadros
  con cifra destacada), se investigó el concepto y se rediseñó desde las bases. El número es el VALOR DE CONMUTACIÓN
  (*switching value*, «valor crítico»; HM Treasury Green Book): el valor que tendría que alcanzar el dato desconocido (la
  diferencia de instalación) para que cambie la opción preferida; su utilidad es compararlo con el rango plausible, que el
  ingeniero conoce por experiencia. Principios aplicados: conclusión primero (el título es la pregunta), todo dicho DESDE
  LA GANADORA y en UNA sola dirección (sin «X menos que…» ni negaciones), una cifra por comparación en millones por km,
  la comparación más ajustada primero, y el detalle plegado. Estructura (bloque al FINAL, tras «Sensibilidad a los
  supuestos del análisis»):
  - Título «¿Puede el costo de instalación cambiar la decisión?»; párrafo inicial REDACTADO POR EL USUARIO («El costo de
    instalación no se incluyó en la comparación porque falta en al menos una opción. Para saber si el costo de instalación
    podría cambiar la conclusión del análisis, abajo se compara la Opción G con cada alternativa y se indica a partir de qué
    diferencia en el costo de instalación por km la otra opción pasaría a ser la mejor.»).
  - Tabla `.ce-inst-tabla`: «Frente a» (opción + su conductor) | «La Opción G sigue siendo la mejor mientras instalarla no
    cueste más de…» → «$ 8.9 millones por km por encima de la Opción A». Filas ordenadas de menor a mayor margen.
  - PISTA POR PESO (idea aprobada por el usuario): peso de conductor por km de línea = 3 × conductores por fase ×
    `masa_kg_km` (desnudos) o `masa_total_kg_km` (XLPE), del catálogo (`masaKgKm` en el estado de cada opción). Si la
    ganadora pesa más: insignia «Revisar» + «…pesan X kg más por km de línea…: es probable que su instalación cueste más;
    revisa este margen.»; si pesa menos: «…lo probable es que su instalación no cueste más, así que este margen es aún más
    seguro.». Es una inferencia (más peso suele encarecer estructuras, tensado y mano de obra), no un costo.
  - «Compara cada valor con la diferencia de instalación que esperas según tu experiencia…» y un `<details>` plegado
    «¿De dónde sale este valor?» con un párrafo por alternativa (ventaja total en millones, porqué según los números del
    par, reparto por km, «es lo máximo que puede costar de más su instalación antes de que esa ventaja desaparezca»).
  - Reporte: una línea por alternativa con la misma frase, más la pista de peso.
  - DESCARTADOS por el usuario: un campo para escribir su estimación de la diferencia de instalación (no es precisa y
    variaría entre personas) y una barra visual (sin estimación aporta poco; casi siempre se comparan dos conductores).
    Posible a futuro: un costo de instalación de REFERENCIA fijado por la empresa (no por cada persona).
  - `conductorTexto` separa la referencia con « · » (la referencia ya trae paréntesis) y el aviso verde usa « — »: antes
    quedaba «Opción 2 (ACSR 4/0 (Penguin (6/1)))». En `String.replace`, «$&» significa «lo encontrado»: para unir el «$»
    con un espacio sin corte usar una función de reemplazo o `\u00a0`, nunca «$&nbsp;» como texto.
  - La otra tabla se llama «Sensibilidad a los supuestos del análisis» (precio de la energía, demanda y tasa ±).
  - La pantalla YA NO muestra `vecesConductor` («× lo que cuesta el conductor»: confundía); el motor lo sigue calculando
    y la herramienta de la IA lo usa (`opcionN_umbral_instalacion_km`, sin cambios).
- **Valoración integral (2026-09-25, 3.22.0, pedida por el usuario para no depender de la IA en las validaciones
  integrales)**: calculadora nueva `#/calculos/valoracion-integral` (icono Tabler `clipboardCheck`, última del menú Cálculos,
  SOLO usuarios). Decisiones del usuario: de 1 a 6 escenarios (uno solo sirve para evaluar un conductor), longitud COMÚN,
  límites = las referencias que ya había (pérdidas 3 %, regulación 10 %; ampacidad: corriente ≤ ampacidad) y costos desde
  la fase 1. Tarjetas: «Datos de la conexión» (dato de partida MW o MVA —sin corriente: depende de la tensión de cada
  escenario—, FP, Fc, longitud; `<details class="vi-avanzado">` con ambiente aéreo, terreno y temperatura de falla),
  «Evaluación económica» (precio vacío = sin costos) y «Escenario N» (tensión, red, material, calibre, referencia,
  conductores por fase, corriente de falla OPCIONAL, tiempo de despeje, costos; avanzados: distancias entre fases y haz en
  aérea; pantalla, % aislamiento, puesta a tierra, separación entre fases, otros circuitos y separación entre ductos en
  subterránea). Motor `js/calc/valoracion-integral.js` (combina Pérdidas, Regulación, Ampacidad aérea/subterránea,
  Cortocircuito y Conductor económico SIN tocarlos). Subterránea: cable del catálogo de construcción (9 calibres, nivel
  15/35/46 kV según la tensión, >46 kV no se deja calcular) y R75/RMG/área del catálogo XLPE; N conductores por fase = N
  ternas en paralelo en el mismo banco (máx. 6 circuitos con los ajenos); monopolar en trébol. Recomendado = menor costo
  total entre los que cumplen. Perfil → Calculadoras también la alimenta (tensión y tiempo se aplican a cada escenario
  nuevo con `leerDefectos`). Pruebas: `tools/verify_valoracion_integral.html`; `verify_acceso` cuenta 23 módulos.
  Pendiente posible (no pedido): gráficos. (La herramienta de la IA se hizo en 3.30.0 y los tramos en 3.24.0.)
  Ajustes (2026-09-25, 3.23.0, pedidos del usuario): (1) las etiquetas de la tabla YA NO llevan la unidad entre
  paréntesis («Ampacidad de la fase (A)» se leía como «fase A»): la unidad va junto al número («557.8 A») y la ampacidad
  se separa en «Ampacidad por conductor» y «Ampacidad total» (esta solo si algún escenario tiene N > 1). (2) Los grupos
  (Ampacidad, Pérdidas…) son encabezados de sección, no filas vacías: cada grupo es su propio `<tbody class="vi-grupo">`
  con un `<th colspan>` en color del tema y línea superior. (3) Botón «Exportar» (`details.menu-mas.vi-exportar`) a la
  derecha de la conclusión, con PDF (documento propio `#doc-impresion.vi-doc`, mismo mecanismo de impresión que el
  Asistente técnico; Carta vertical hasta 3 escenarios y horizontal con más, `@page valoracion`/`valoracion-h`) y Excel
  (.xlsx sin librerías: `js/util/xlsx.js` + `zip.js`; hoja «Comparación» con números de verdad y la unidad en su columna,
  y hoja «Reporte» con el texto completo; verificado con openpyxl y con Excel por COM). Pantalla, PDF y Excel salen del
  mismo `modeloMatriz()` de la vista.
  **Tramos por escenario (2026-09-25, 3.24.0, pedido del usuario; decisiones suyas)**: cada escenario es un circuito a UNA
  tensión con 1 a 4 tramos en serie (`MAX_TRAMOS`). La LONGITUD pasó de «Datos de la conexión» a cada tramo; la corriente
  de falla y el tiempo de despeje siguen siendo del ESCENARIO (una sola falla, conservador). Cada tramo: red, longitud,
  material, calibre, referencia, conductores por fase, costos y sus avanzados. Con un solo tramo la tarjeta se ve como
  antes (sin encabezado de tramo); el encabezado «Tramo N · red» + «Quitar tramo» solo aparece con 2 o más. «Agregar
  tramo» es un botón tipo enlace al pie de CADA escenario (`.vi-agregar-tramo`; excepción consciente a la regla de
  tarjetas plegables de sacar «Agregar» a la fila de Calcular: cada escenario tiene los suyos). Ids: escenario
  `f-tension-0`, tramo `f-red-0-1` («escenario-tramo»). Motor: `evaluarTramo` + `evaluarEscenario` (pérdidas, caída y
  costos se SUMAN; en ampacidad manda el tramo de mayor % de uso y en cortocircuito el de menor capacidad, con
  `ampacidad.tramo`/`cortocircuito.tramo`; sin costo en algún tramo = escenario sin costos). La tabla muestra el tramo
  que manda, fila «Longitud» (total), un «Detalle por tramo» plegado y un aviso si los escenarios no suman la misma
  longitud; Excel con hoja «Tramos». También (mismo pedido): la primera fila de cada sección de la tabla vuelve a tener su
  línea delgada (se quitó `.vi-seccion + tr td { border-top: 0 }`), y en el PDF y el Excel los supuestos económicos van en
  la sección «Costos» (fila de nota), no en «Datos de la conexión» (el formulario los sigue teniendo como datos generales).
  El menú «Exportar» va con `margin-left: auto` para que en el celular no se salga por la izquierda (3.23.1).
  **Reorganización (2026-09-25, 3.25.0, pedidos del usuario)**: en pantalla ya NO se dice «escenario» sino **«Alternativa N»**
  (tarjetas, tabla, reporte, PDF, Excel, conclusión «Recomendada»); internamente el código sigue llamándolo escenario.
  Tensión: UNA en «Datos de la conexión» (`#f-tension`, alimentada por Perfil → Calculadoras) con la casilla «Por
  alternativa» (`#chk-tension-alt`, patrón input + casilla como «Manual»); marcada, la general se bloquea y cada
  alternativa muestra su propio campo (`f-tension-N`, primero de la tarjeta, arranca con el valor general). Los
  desplegables dicen solo «Parámetros avanzados». Cada alternativa tiene UN «Parámetros avanzados» (al final de la tarjeta)
  con el grupo «Cortocircuito» (corriente de falla y tiempo de despeje) y la disposición de cada tramo («Tramo N · red:
  disposición del conductor»). La referencia se OCULTA en tramos subterráneos (no queda deshabilitada a la vista). «Agregar
  tramo» justificado a la derecha. «Evaluación económica (opcional)» va DESPUÉS de las alternativas, antes de Calcular, nace
  PLEGADA (`plegarTarjeta`) y reúne los costos de cada tramo («Costos de cada tramo»: un bloque por tramo titulado
  «Alternativa N · Tramo M (red)», o solo «Alternativa N» con un tramo): cada tramo crea sus tres partes (datos, avanzado y
  costo) y `ordenarCostos()` las mantiene en orden. Ampacidad y cortocircuito con varios tramos: la celda muestra el valor de
  cada tramo («T1 663 A · T2 435 A») y se evalúa con el de MENOR capacidad (el motor elige por `totalA` mínimo; es el
  mismo tramo que el de mayor % de uso porque la corriente es igual en todos, pero así se entiende mejor).
  Ajustes 3.25.1 (pedidos del usuario): «Agregar alternativa» en su propia fila (`.vi-fila-agregar`) DEBAJO de las
  alternativas, a la IZQUIERDA y ANTES de la evaluación económica (la fila de Calcular quedó solo con Calcular). La
  separación del haz y la separación entre ductos se OCULTAN (no solo se deshabilitan) cuando no aplican; las tres
  distancias entre fases van en una `grid-3`. Cada bloque de costos lleva debajo del título una línea
  `.vi-costo-detalle`: «red · material calibre · referencia · tensión kV · N conductores/circuitos por fase · longitud km»,
  que se actualiza con cada cambio del tramo o de la tensión.
  **Valoraciones guardadas (2026-09-25, 3.26.0; el usuario eligió las DOS opciones: dispositivo + cuenta)**: botón
  «Guardadas» (icono `history`, discreto) a la derecha del título abre un panel `.vi-historial` (no ventana emergente) con
  la lista (nombre, fecha, resumen, «solo en este dispositivo» si falta subirla) y «Abrir» / papelera (con `confirm`).
  Botón «Guardar» (icono Tabler `deviceFloppy`) junto a «Calcular» abre una caja con el nombre; con una abierta ofrece
  «Actualizar «nombre»» (reemplaza) y «Guardar como nueva». «Abrir» restaura el formulario (`restaurar(foto)`, que primero
  quita las alternativas), pliega TODAS las tarjetas y dispara «Calcular». Bajo el título: «Trabajando en: nombre».
  El punto 6 propuesto (guardar solo lo último escrito) el usuario NO lo quiso. Motor: `js/util/valoraciones-guardadas.js`
  (ninguna función lanza; cada llamada remota con tiempo máximo de 8 s; guarda SIEMPRE primero en `localStorage`
  «valoraciones.guardadas» = {items, eliminadas}; `pendiente` = falta subirla; `eliminadas` = borrados que no llegaron al
  servidor; al sincronizar gana el `actualizado` más reciente y lo borrado desde otro equipo desaparece; cada registro
  lleva su `cuenta` para no mezclar usuarios del mismo equipo; máx. 100 por cuenta). Servidor: Firestore
  `usuarios/{correo}/valoraciones/{id}` = {nombre, resumen, datos (JSON en texto), creado, actualizado}; métodos
  `listarValoraciones`/`guardarValoracion`/`eliminarValoracion` en `backend-firebase.js` y `backend-mock.js` (replica las
  reglas); reglas nuevas en `firebase/firestore.rules` (solo el dueño; forma, nombre ≤ 120 y datos < 500 000 validados):
  HAY QUE PUBLICARLAS en la consola de Firebase. Perfil → Datos tiene la categoría «Valoraciones integrales guardadas en
  este dispositivo» (va en el respaldo). Pruebas: dos secciones de `verify_valoracion_integral.html` (motor con backend
  nulo, simulado, sin conexión, roto y sin permiso; y la pantalla); `usarBackendValoraciones()` fija el backend en pruebas.
  Ajustes 3.26.1: los campos de dinero (precio de la energía, costo del conductor e instalación) son `type="text"
  inputmode="decimal"` con separador de miles al escribir (`js/util/campo-miles.js`: `activarMiles`, `leerMiles`,
  `formatearMiles`, `reformatear`; mismo formato de los resultados: coma de miles, punto decimal; `valor()` de la vista
  usa `leerMiles`, NO `parseFloat`). Al guardar: «Actualizar» sin el nombre y «Cancelar» con borde (`btn`, no
  `btn-ghost`). En «Guardadas» la insignia «Abierta» va junto al nombre (`.vi-historial-nombre`).
  **3.27.0 (2026-09-26, pedidos del usuario)**: la tercera pestaña del resultado YA NO es «Fórmulas» (están en cada
  calculadora; se borraron `FORMULAS_*` de esta vista) sino **«Análisis»** (se reescribe el botón y el panel que arma
  `tarjetaResultadosHtml`): `modeloAnalisis()` usa el MISMO modelo de la tabla comparativa (se dibuja con `matrizHtml`,
  en el PDF con `tablaDoc` y en el Excel con `filasExcel`): «Margen frente a cada límite» (ampacidad Iadm − I con % de
  reserva o de sobrecarga, pérdidas 3 − %, regulación 10 − %, cortocircuito capacidad − falla; en verde/rojo con
  `tono`) + «Criterio que limita» (el de menor margen relativo), y «Capacidad máxima»: potencia máxima por ampacidad
  (P·Iadm/I), por regulación (P·10/%caída), por pérdidas (P·3/%pérdidas) y la menor, y longitud máxima con la potencia
  actual (L·10/%caída y L·3/%pérdidas). Son escalas exactas de lo ya calculado (I ∝ P; caída y % de pérdidas ∝ P y ∝ L),
  sin fórmulas nuevas. Debajo, «Supuestos del cálculo» (`SUPUESTOS`, 5 viñetas) y enlaces a las calculadoras.
  Excel: SIN filas «…: clasificación» ni «…: detalle»; la celda se colorea con los estilos «Bueno»/«Neutral»/«Malo» de
  Excel (`xlsx.js`: estilos `bueno`, `neutral`, `malo`; `tonoDe(c)` = `c.tono` o el de su clasificación) y una fila
  «Convención» al final; hojas «Comparación», «Análisis», «Tramos» y «Reporte». «Nueva» (enlace azul con `plus`) junto a
  «Trabajando en»: con confirmación, `restaurar(fotoInicial)` (foto del formulario en blanco tomada al abrir la pantalla,
  antes de restaurar la sesión), quita la valoración abierta y el resultado. «Recomendada» del encabezado va en
  `.vi-cab-rec`, que en ≤720px baja a una segunda línea. Subtítulos de «Parámetros avanzados» (`.vi-avanzado-grupo`): tipo
  oración, color del texto y barrita `--accent` a la izquierda (NO en mayúsculas ni del color del tema, para no
  confundirse con el desplegable). Descripción del menú: «Evalúa alternativas con ampacidad, pérdidas, regulación,
  cortocircuito y costos.» 3.27.1: «Nuevo» (no «Nueva») con icono Tabler `circlePlus`; «Costos de cada tramo» sin la
  línea superior (se desalineaba con la barrita); Excel: secciones en negrita del color del tema con relleno más marcado,
  filas de criterio sin negrita (estilo `criterio`) y SIN filas de convención (la nota de referencias dice los colores).
  **3.28.0 (2026-09-26, mejoras elegidas por el usuario tras una evaluación del módulo)**: la tarjeta del menú VOLVIÓ a
  «Evalúa escenarios de conductor con ampacidad, pérdidas, regulación, cortocircuito y costos.» (el usuario la prefirió);
  el botón es «Nueva valoración». «Trabajando en» muestra « · cambios sin guardar» (`.vi-sin-guardar`) comparando la
  huella del formulario (`capturar()` sin `avanzado`/`economiaAbierta`) con la guardada (`huellaGuardada`, también en la
  persistencia de navegación); se revisa en cada input/change/click del formulario; «Nueva valoración» solo pide
  confirmación si hay cambios sin guardar. El aviso de guardado se quita solo a los 6 s (los errores no). Sin precios
  también hay «Recomendada»: `compararEscenarios` da `criterioRecomendado` = "costo" (menor costo total entre las que
  cumplen) o "perdidas" (menores pérdidas, si ninguna de las que cumplen tiene costos), y solo con 2 o más alternativas.
  El reporte de texto es CORTO: datos de entrada en una línea por alternativa/tramo y, por alternativa, veredicto, corriente
  y ampacidad (con el tramo), pérdidas, caída, cortocircuito, costo y potencia máxima; sin valores intermedios (Xl, Z,
  R efectiva). En ≤720px la tabla es compacta (letra 0.74rem, rellenos menores, etiqueta 28 %, y la tarjeta
  `.vi-resultado` y el panel `.vi-panel` con 8 px de relleno): caben la columna de criterios y dos alternativas en 380 px.
  El «$» de los montos va unido al número con `\u00a0`. Pendientes que el usuario quiere ver propuestos: dónde mostrar la
  sugerencia de calibre (mejora 7), dónde poner «Duplicar alternativa» (8) y otra forma de marcar los subtítulos de
  «Parámetros avanzados». Descartado por ahora: el acople entre ternas en paralelo (error estimado pequeño).
  **3.29.0 (2026-09-26)**: subtítulos de «Parámetros avanzados» = barrita + texto + línea fina del color del tema hasta el
  borde (`.vi-avanzado-grupo::after`, `color-mix` 55 %; opción «B» elegida por el usuario). «Calibre mínimo que cumple»
  (fila al final de «Capacidad máxima» del Análisis, y una línea en el reporte): `calibreMinimo(comun, esc, cat)` del
  motor cambia SOLO el tramo que limita (el que falla en ampacidad o cortocircuito; si no, el de mayor caída) por cada
  calibre del mismo tipo/material de menor a mayor área (aérea: primera referencia del catálogo, o la del usuario en su
  calibre; subterránea: misma pantalla y aislamiento) y devuelve el primero con el que la alternativa cumple todo
  (`esActual`, `menorQueActual`, o `ninguno`); los tramos del escenario deben traer `eleccion`. «Duplicar» (icono `copy`)
  en la barra de título de la alternativa, junto a «Quitar» (mismo estilo; en ≤480px solo el icono): `agregarEscenario(
  datos, despuesDe)` crea la copia justo después con `bruto()` de la original. Potencia por defecto 9.9 MW (11 MVA); las
  pruebas de la vista fijan 30 MW al arrancar. Asistente técnico (`ia-analisis.js`): «Imprimir / PDF» ya no es un botón
  aparte, es la PRIMERA opción del menú «Descargar» («PDF (imprimir o guardar)», mismo id `#btn-imprimir`).
  **3.30.0 (2026-09-26)**: herramienta de la IA `valorar_alternativas` (`js/ai/tools.js`, `T_VALORAR_ALTERNATIVAS`) en
  los DOS agentes (no opcional; 11 estándar / 17 en total; no entra al barrido), con el mismo motor de la pantalla. Solo
  exige FP, potencia MW o MVA, tensión (común o por alternativa) y red+material+calibre+longitud por alternativa; lo demás
  sale de `DEF_VI` (= valores por defecto de la pantalla; si cambian en la pantalla, cambiarlos también ahí) y solo se
  anotan como supuestos los usados. Detalle en `docs/ia-herramientas.md` §4. Prompts: regla 2 del estándar y 9 del
  riguroso. `analizarAlternativa(x, potenciaMw)` (márgenes y capacidad máxima) pasó de la vista al motor. «Quitar» de la
  alternativa: texto en `<span class="vi-texto-btn">` y en ≤480px solo la X, como «Duplicar» (regla
  `.vi-escenario .form-section-title .vi-texto-btn`; `btn-tramo-quitar` de las otras calculadoras no cambia). PDF de los
  docs: la página temporal debe convertir aparte los bloques ``` (a `<pre>`) y las imágenes (markdownAHtml no los
  soporta), usar un `@page` propio con el título del documento en el pie y limitar la imagen a 125 mm de alto (si no, el
  resumen de una hoja pasa a 4 páginas).
  **3.30.1 (2026-09-26, pedido del usuario)**: «Agregar alternativa» dejó su fila propia (`.vi-fila-agregar`, borrada) y va
  en la fila de Calcular (`.btn-row--agregar`), a la DERECHA, como en las demás calculadoras; Calcular y Guardar van
  juntos en `.vi-acciones-calc` para que la fila tenga solo dos partes y, si no caben, «Agregar» suba a una fila ENCIMA
  (nunca debajo; `wrap-reverse`). «Evaluación económica» queda justo después de las alternativas. Al agregar, la nueva
  alternativa se lleva a la vista (`scrollIntoView`).
- Tarjetas plegables (2026-09-21, pedido del usuario): en las SIETE calculadoras cada barra de título (`.form-section-title`) lleva al extremo derecho un botón con un chevron (`.btn-plegar`, `js/util/tarjetas-plegables.js`, `activarPlegables(contenedor)` junto a cada `activarInfos`) que pliega/despliega SU tarjeta; todas nacen abiertas; el chevron apunta ARRIBA abierta y ABAJO plegada (icono `chevronUp` girado 180°). Decisiones del usuario: solo el icono pliega (la barra NO; el área de toque es de 32 px + 4 px por lado para no exigir puntería), sigue plegada al recalcular (el estado vive en el DOM, clase `.plegada`), SIN botón «Plegar todo». Plegar solo OCULTA: lo escrito se conserva y «Calcular» lo usa. Si falta un dato obligatorio dentro de una tarjeta plegada, se despliega sola (escucha `invalid` en captura). «Agregar tramo/opción/tipo» YA NO vive dentro de la última tarjeta (2026-09-21, pedido del usuario): es un botón `.btn.btn-agregar-tramo` en la fila de «Calcular» (`.btn-row--agregar`), JUSTIFICADO A LA DERECHA de la línea (mismo alto y relleno que «Calcular»; siempre a la vista). Si los dos no caben en una línea, «Agregar» queda ARRIBA y «Calcular» abajo, ambos a la izquierda (`flex-wrap: wrap-reverse` + `justify-content: space-between`; el orden de tabulación sigue siendo Calcular → Agregar), así plegar oculta TODO lo de la tarjeta (sin excepciones en el CSS). Si no convence en esa posición, la alternativa que el usuario dejó lista para probar es ponerlo ARRIBA del botón «Calcular». No aplica a la tarjeta de Resultados ni a las pantallas fuera de las calculadoras (Perfil). En las pantallas de IA (2026-09-21, decidido con el usuario) se pliegan SOLO «Agente» (Corrector y Análisis) y «Reporte de escenarios» (Análisis); «Conversación» queda fija porque sus botones (Nueva, Dictar, Enviar) viven fuera de la tarjeta (por eso se llama `activarPlegables` con la tarjeta concreta, no con el contenedor). El reporte se despliega solo al terminar de generarlo con «Generar reporte con IA» (el aviso del chat remite a él). Pruebas: sección «tarjetas plegables en las pantallas de IA» de `verify_ia_pantallas.html`. Pruebas: `tools/verify_tarjetas_plegables.html`. En ese arnés hay que quitar la transición del chevron (`style.transition = "none"`) para medir el giro: Edge sin pantalla no la avanza de forma fiable. ANIMACIÓN (2026-09-21, pedido del usuario): al pulsar el chevron el cuerpo se recoge hacia arriba / se despliega hacia abajo (220 ms; altura + opacidad del cuerpo, relleno inferior de la tarjeta y margen inferior de la barra) con la Web Animations API, sin librerías. `activarPlegables` ENVUELVE todo lo que va bajo la barra en un `<div class="plegable-cuerpo">` (`display: flow-root`) y plegar oculta ESE cuerpo; durante la animación la tarjeta lleva `.animando` (el cuerpo sigue visible con overflow oculto). Se puede interrumpir con otro clic (parte de la altura actual). NO anima: con `prefers-reduced-motion`, sin `element.animate`, con la tarjeta oculta, ni en el despliegue automático por dato faltante o al terminar el reporte (`plegarTarjeta` sin `animado`). La limpieza usa la promesa `finished` (el evento `finish` solo llega en el siguiente cuadro y en Edge sin pantalla es intermitente). NO usar transiciones CSS para la barra: dejan `getAnimations()` sucio y en Edge sin pantalla no avanzan. En las pruebas `plegado.animar = false` (export de `tarjetas-plegables.js`) para comprobar el estado final al instante; la animación se prueba aparte, avanzando a mano (`pause` + `currentTime`, `finish()`), en la sección «animación al plegar y desplegar» de `verify_tarjetas_plegables.html`. AVISO: los archivos del árbol de trabajo tienen CRLF (Git los normaliza): en scripts de edición usar una función que respete el fin de línea, y escribir los scripts con Write (los heredocs de Bash alteran los `\n`).
- Rediseño acordado con el usuario (2026-09-19) tomando de referencia el módulo de pérdidas de otro proyecto («Calculadora
  Normativa»): tarjeta «Datos de la línea» (con *dato de partida*: MW, MVA o A) + una tarjeta «Conductor tramo N» por tramo (sin guión desde 2026-09-21, también en Regulación; los reportes usan «Tramo N:»)
  (agregar/quitar, conductores por fase). Los COLORES no cambian (solo tokens existentes) y los resultados van en los formatos
  que ya había (métricas + tablas); **sin gráficos** (barras, velocímetro): el usuario los quiere más adelante, no ahora.
  Unidades: se mantienen MW y MVA. El motor `js/calc/perdidas.js` no se toca sin que lo pida el propietario del negocio (ver
  más abajo la excepción del 2026-09-22); la suma de tramos y el dato de partida viven en
  `js/calc/perdidas-tramos.js`. La IA (`calcular_perdidas`) sigue igual (un tramo). Pruebas: `tools/verify_perdidas.html`.
- Umbrales 1 % / 3 %: solo «referencias de diseño» (Óptimo / Aceptable / Elevado). NUNCA escribir «fuera de norma».
- Factor de pérdidas (`js/calc/perdidas.js`, 2026-09-22): usa la forma cuadrática de Buller-Woodrow, `Fp = 0.3·Fc + 0.7·Fc²`.
  Hasta esta fecha usaba la forma LINEAL (`0.7·Fc + 0.3`) para replicar la app original de Power Apps (ya retirada del repo);
  se volvió a la cuadrática porque la lineal puede dar Fp > Fc (matemáticamente imposible: el límite teórico es
  `Fc² ≤ Fp ≤ Fc`) y, validado hora a hora contra una curva real de generación solar, sobreestimaba las pérdidas hasta en un
  74 %. Decisión del propietario del negocio (el mismo que pidió la paridad con Power Apps en su momento). Afecta también a
  Conductor económico (reutiliza este motor sin duplicar la fórmula). El campo Fc de ambas pantallas cambió su valor por
  defecto de 0.564 a **0.4** y su tooltip a «Circuitos de uso: 1 · Granjas solares: 0.28-0.53 según tecnología (lo ideal es
  calcularlo con la curva real de generación a 24 h)». El rango 0.28-0.53 NO es el factor de planta real de una granja solar
  (ese es ~0.20-0.32 según datos de plantas reales, ver historial de esta conversación): es el Fc que hay que meterle a la
  fórmula cuadrática para que el resultado coincida con las pérdidas reales calculadas hora a hora, y varía mucho según la
  forma de la curva (fijo con pico agudo ≈0.39, seguidor de 1 eje ≈0.49, ventana corta u opaca ≈0.30, seguidor de 2 ejes
  ≈0.53) — no hay un solo número que sirva para todas las tecnologías, por eso el tooltip da un rango y remite al cálculo con
  la curva real en vez de prometer precisión con un valor fijo. Pruebas actualizadas: `tools/verify_perdidas.html`,
  `tools/verify_conductor_economico.html`.
- Tarjetas (`.form-section`): título como BARRA de borde a borde (`.form-section-title`: fondo `--accent-soft` como el botón activo del
  menú lateral, línea inferior delgada `--accent`, icono `--accent` pleno, centrado vertical, `min-height` fijo para que no cambie al
  aparecer «Quitar»); espacio inferior compacto (`.grid-2.ultima`, relleno de 12px).
  Iconos de esta pantalla: `circuitVoltmeter` (línea) y `conductorCableado` (conductor: aro con 7 hilos macizos, dibujo propio; desde 2026-09-21 en TODAS las calculadoras, reemplazó al enchufe Tabler `plug-connected`, que se borró de `icons.js`), elegidos por el usuario tras probar otros
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

- Selector de «Referencia» del conductor aéreo (2026-09-23, pedido del usuario tras revisar que solo Ampacidad aérea lo
  pedía: las otras cuatro tomaban en silencio la primera fila del catálogo que coincidía en tipo+calibre, lo que puede
  cambiar la resistencia hasta ~29 % entre construcciones del mismo calibre, p. ej. ACSR 266.8 Waxwing 18/1 vs Owl 6/7 vs
  Partridge 26/7). Se agregó el mismo patrón de Ampacidad aérea (`nombre_clave` del catálogo) a Pérdidas, Regulación,
  Cortocircuito y Conductor económico: campo `<select>` OBLIGATORIO «Referencia» entre Calibre y Resistencia/Área
  (`grid-3`, antes `grid-2`), con ayuda «i» (nueva en estas 4 pantallas), que se repuebla al cambiar el calibre.
  El catálogo XLPE (subterráneo) no tiene `nombre_clave` (su multiplicidad es por nivel de tensión/aislamiento/pantalla,
  un problema distinto y fuera de este alcance): con red Subterránea el campo queda fijo en «No aplica (solo conductores
  aéreos)», deshabilitado (por eso no bloquea el envío aunque siga `required` en el HTML: un campo `disabled` no entra en
  la validación del formulario). `resolverFila()` de cada pantalla ahora filtra también por `nombre_clave` cuando la red
  es aérea. Bug encontrado y corregido durante la implementación: al repoblar el select de Referencia para red
  Subterránea, las 4 pantallas ponían la fila resuelta en `null` en vez de llamar a `resolverFila()` (que para
  Subterránea no depende de la referencia): eso dejaba el área/resistencia en blanco y el cálculo daba `NaN` en
  subterráneo (detectado por `verify_cortocircuito.html`, que sí prueba ese camino; Pérdidas y Regulación no lo probaban
  y seguían en verde con el bug). Fuera de alcance (decidido con el usuario): las herramientas de diseño
  (`dimensionar_conductor`, `verificar_conductor`, `resolver_valor_limite`), que siguen con «primera referencia por
  calibre». `js/ai/tools.js` NO se tocó: `resolverConductor` ya soporta un `referencia` opcional oculto para las 4
  herramientas correspondientes y ya avisaba en el reporte cuál eligió cuando no se especifica. Pruebas actualizadas:
  `tools/verify_perdidas.html`, `verify_regulacion.html` (incluye el orden de campos del tramo, que ahora es
  calibre|referencia|resistencia, igual criterio que antes), `verify_cortocircuito.html` y `verify_conductor_economico.html`
  (su único helper central `llenarOpcion` se actualizó para elegir automáticamente la primera referencia disponible, lo que
  conservó casi todas las aserciones numéricas existentes sin tocarlas una por una).
  Ajuste posterior (mismo día, pedido del usuario): la primera versión dejaba una fila de 3 columnas (Calibre | Referencia |
  Resistencia/Área) en las 4 pantallas — se corrigió a filas de 2 columnas, reacomodando el campo vecino de Calibre en cada
  pantalla (Pérdidas: Longitud pasa a la fila de Calibre, dejando Conductores por fase solo al final, a media fila; Regulación:
  Conductores por fase se queda con Longitud como antes, Resistencia se empareja con RMG —ambas del catálogo, con «Manual»— y
  Separación del haz queda sola a media fila; Cortocircuito: Área queda sola a media fila tras Calibre|Referencia; Conductor
  económico: Conductores por fase pasa a la fila de Calibre, dejando Costo del conductor y Costo de instalación cada uno solo a
  media fila). Un campo `<div class="field">` solo dentro de un `grid-2` ya ocupa media fila por comportamiento normal de CSS
  Grid (no hace falta CSS nuevo). Pruebas y `ordenReferencia`/`filas(...)` actualizados en los 4 arneses.
  Ajuste posterior (mismo día, pedido del usuario): en Regulación, «Separación entre subconductores del haz» pasa justo
  después de «Conductores por fase» (antes iba después de Resistencia/RMG), desplazando lo que sigue: Longitud|Conductores
  por fase → Separación del haz|Calibre → Referencia|Resistencia → RMG solo (media fila) → las 3 distancias. Solo cambia el
  orden visual de los campos en `js/views/calc-regulacion.js` (mismos ids, misma lógica); las pruebas de orden de
  `verify_regulacion.html` (`ordenReferencia`, `filas(...)`, el listado de botones «i») se actualizaron para el nuevo orden.
  Ajuste posterior (mismo día, pedido del usuario): en Conductor económico, «Costo del conductor» y «Costo de instalación»
  vuelven a compartir fila (quedaron cada uno solo a media fila tras el ajuste anterior; el usuario los quiere juntos).

- **Orden del desplegable de Calibre por tamaño real, no alfabético (2026-09-23, reportado por el usuario)**: `distinct()`
  (`js/util/format.js`) ordenaba SIEMPRE como texto (`localeCompare` con `numeric: true`, «orden natural»): para
  `calibre_awg_kcmil` eso da 1, 1/0, 2, 2/0, 3, 3/0, 4, 4/0, 5, 6, 8, 101.8… — ni por tamaño real (en AWG, el número BAJA
  al crecer el calibre: 8 AWG es más delgado que 1 AWG, y 1/0‑2/0‑3/0‑4/0 siguen creciendo después de 1 AWG) ni consistente
  con los códigos no estándar del catálogo (números como 101.8, 110.8, 134.6, que son áreas en kcmil intercaladas entre los
  AWG). `distinct(rows, key, ordenarPor)` ahora acepta un tercer parámetro OPCIONAL: el nombre de un campo numérico de la
  fila (p. ej. un área) por el que ordenar en su lugar; sin ese parámetro seguía igual que antes, así que ninguna otra
  llamada a `distinct()` (tipo, material, nombre_clave, etc.) cambió. Se usa para el `calibre_awg_kcmil` en las 5 pantallas
  que lo listan (Pérdidas, Regulación, Cortocircuito —ambas redes—, Conductor económico y Ampacidad aérea) pasando el campo
  de área correspondiente al dataset (`area_seccion_aluminio_mm2` en desnudos/aéreo, `area_conductor_mm2` en XLPE/subterráneo)
  y también en los 3 mensajes de error «Calibres disponibles: …» de `js/ai/tools.js` (mismo criterio, por prolijidad).
  Si a algún calibre le falta el área (dato incompleto) cae de vuelta al orden de texto para ese valor. No se tocó
  `js/views/calc-ampacidad-subterranea.js` (usa `ORDEN_CALIBRES`, un array fijo con los pocos calibres estándar de XLPE
  subterráneo: no tiene el mismo problema). Pruebas: `tools/verify_perdidas.html`, `verify_regulacion.html` (se corrigió
  además el cálculo de `fila2` en «vista: varios tramos», que ya no podía asumir que el calibre en `selectedIndex = 4`
  coincidiera con el orden crudo del JSON: ahora usa el mismo `distinct()` de producción), `verify_cortocircuito.html`,
  `verify_conductor_economico.html`, `verify_ampacidad_aerea.html` y `verify_ia.html`.

## Catálogos desde el servidor (fase 1 implementada 2026-09-24, versión 3.18.0; fase 2 PENDIENTE)

- Decidido con el usuario: los catálogos editables viven en **Firestore** (no en Railway: la app ya usa Firebase, las reglas
  de «solo admin» ya existían, y Railway sería un servidor más que mantener y un punto de falla más; Railway/Pages solo
  sirven la app). La app trae los de fábrica (`data/*.json`) y **gana SIEMPRE el servidor** (decisión del usuario: lo
  del servidor está más al día). Sin internet o sin servidor: última copia descargada, o los de fábrica.
- Alcance: `conductores-desnudos`, `conductores-semiaislados`, `conductores-xlpe`, `tuberias` y `resoluciones` (el usuario
  agregó resoluciones). Unidades, EPSG, codificación y construcción de cable siguen solo de fábrica.
- Firestore: `catalogos/{nombre}` = `{ datos (JSON en texto), version }`; `catalogos/_indice` = `{ catalogos: { nombre: {
  version, huellaFabrica, actualizadoPor, fecha } }, fecha }`. Cada catálogo es UN documento (el mayor, desnudos, pesa
  ~250 KB compacto; límite 1 MB) para gastar poco del plan gratuito: al abrir la app se lee solo el índice (1 lectura) y
  se descarga un catálogo solo si cambió su versión (`version` = `Date.now()` al publicar). Reglas: lectura pública
  (`allow read: if true`: los visitantes usan Ocupación/Pérdidas/Regulación), escritura solo `esAdmin()` con forma y
  tamaño validados. Hay que PUBLICAR las reglas en la consola de Firebase cuando cambien.
- `js/util/catalogos-remotos.js`: lectura con la API REST de Firestore (sin SDK; `lectorRest`, parseo en
  `parsearIndiceRest`/`parsearCatalogoRest`), copia local en `localStorage["catalogo.servidor.<nombre>"]`,
  `sincronizarCatalogos()` (nunca rechaza; un catálogo dañado en el servidor se ignora), `huella()` = SHA-256 del JSON
  compacto (no cambia con CRLF/sangría) para detectar «los de fábrica cambiaron desde la última publicación» sin tener
  que numerar nada a mano. `app.js` sincroniza al cargar y al volver la conexión y llama `olvidarDato()` de lo que llegó
  (la pantalla abierta no cambia a mitad de uso). `loadData()` (`format.js`) pregunta primero `datosDelServidor()`.
- IMPORTANTE para pruebas: `usarServidor()` = `window.__USAR_CATALOGOS_SERVIDOR__ ?? !window.__BASE_PATH__`, o sea, los
  arneses de `tools/` (que fijan `__BASE_PATH__`) usan SIEMPRE los de fábrica: sus resultados no dependen de lo publicado.
  Solo `tools/verify_catalogos.html` lo activa, con el backend simulado (`backend-mock.js` gana `publicarCatalogo` y
  `servidor`) y `lectorDesdeMock`: nunca toca el Firestore real.
- Escritura: `backend.publicarCatalogo(nombre, {datos, huellaFabrica})` (lote: catálogo + su entrada del índice).
  Pantalla: **Perfil → Catálogos** (solo admin, junto a Usuarios; `js/util/perfil-catalogos.js`): por catálogo, quién lo
  publicó y cuándo, «Iguales a lo publicado» / «Cambiaron desde la última publicación», «Publicar» / «Publicar de nuevo»
  (en la fase 1 hace también de «Restablecer a los de fábrica») y «Publicar todos los de la app». **Consecuencia que el
  usuario aceptó**: una corrección en `data/*.json` NO llega a nadie hasta que el admin la publica; por eso el aviso.
  Perfil → Aplicación dice de dónde vienen los catálogos; Perfil → Datos tiene la categoría «Catálogos descargados del
  servidor» (fuera del respaldo).
- **Fase 2 (hecha 2026-09-24, versión 3.19.0)**. Decisiones del usuario (elegidas entre opciones): cada «Guardar» se
  **publica de inmediato** (con confirmación), **Eliminar borra** el registro (se recupera desde el historial), y se
  guardan las **últimas 10 versiones** por catálogo. Solo el admin ve los botones (`esAdministrador()` =
  `estadoAcceso().nivel === "admin"`); la seguridad real son las reglas.
  - `js/util/edicion-catalogo.js`: `esquemaDe(filas, campos)` arma el formulario con los campos de la ficha (`CONFIG` de
    `detalle-conductor.js`, ahora exportado junto con `tituloDeFila`; `CAMPOS_RESOLUCION` en `detalle-resolucion.js`) MÁS
    los que traiga el archivo y la ficha no muestre (p. ej. `codigo`, con su nombre técnico), para no perder datos; tipo
    número/texto, obligatorio y «no negativo» se DEDUCEN de los datos existentes (`entero`/`largo` se marcan a mano).
    `validarRegistro` (coma decimal aceptada), `nuevoId` (= mayor + 1, en el formato de los demás: «001» o número; OJO:
    si se borra el de mayor id, el siguiente nuevo lo REUTILIZA — limitación aceptada, evitarla exigiría un contador
    en el servidor), `agregarRegistro`/`reemplazarRegistro`/`quitarRegistro` (conservan el orden de las claves),
    `guardarCatalogo` (antes de publicar compara la versión del servidor con la copia local: si otro la cambió mientras
    se editaba, NO sobrescribe, sincroniza y pide repetir), `abrirEditor` (formulario en una tarjeta, errores bajo cada
    campo) y `botonesAdmin`. No hay unicidad de `nombre_clave`: en desnudos y semiaislados ya hay repetidos legítimos.
  - Pantallas: ficha de conductor/tubería y de resolución → Editar / Eliminar; lista de catálogo y de resoluciones →
    «Agregar registro» (arriba de los filtros; el formulario reemplaza la tabla mientras se edita).
  - Historial: `catalogos_historial/{nombre}__{version}` (datos) + la lista (versión, fecha ISO, autor, `cambio`) dentro
    de la entrada del índice (1 lectura para verla). `publicarCatalogo(nombre, {datos, huellaFabrica, cambio})` hace todo
    en un lote: si la versión publicada no estaba en el historial (las de la fase 1), la copia antes; borra las que pasen
    de 10. `leerVersionHistorial` (solo admin). Perfil → Catálogos muestra el último cambio, el historial plegado y
    «Volver a esta versión» (publica esa versión; la actual queda en el historial). «Publicar de nuevo» (los de la app)
    avisa que reemplaza también las ediciones. La huella de fábrica NO cambia al editar (sigue siendo la base publicada).
  - `tuberias.json` ya trae `id` fijo (1…43 = su posición de antes, así los enlaces a las fichas no cambiaron);
    `conIdSiFalta` (format.js) solo pone la posición si una copia del servidor antigua no lo trae.
  - SEGURIDAD: las vistas de Resoluciones metían los textos del JSON en `innerHTML` sin escapar; con datos editables y
    publicados a todos eso era una inyección de código posible: ahora todo pasa por `escapeHtml` (probado con un texto
    `<img onerror>`/`<script>`). Las calculadoras ya escapaban. Al agregar pantallas que muestren datos de catálogos:
    SIEMPRE escapar (o usar `el()`, que usa texto).
  - Pruebas: `tools/verify_catalogos.html` (68: historial y poda, lectura REST del historial, esquema/validación/id,
    pantallas como admin y como usuario, conflicto, eliminar, agregar, resoluciones con código, volver a una versión).
    Truco del arnés: un texto `</script>` dentro del script de una página HTML lo cierra: escribir `<\/script>`.
    Para ver el error real de un arnés que no imprime nada: `msedge --headless --enable-logging=stderr --v=0
    --dump-dom … 2>&1 >/dev/null | grep -i uncaught`.
  - Ajustes de estilo (2026-09-24, pedido del usuario): en la edición de catálogos SOLO «Guardar y publicar» va
    destacado (`btn-primary`); «Agregar registro», «Editar», «Eliminar», «Publicar», «Publicar de nuevo» y «Volver a esta
    versión» van sin acento. Excepción que el usuario QUISO conservar: «Publicar todos» (antes «Publicar todos los de la
    app», nombre acortado a pedido suyo) sigue destacado. Botones de la tabla de Perfil → Catálogos: en una línea si caben
    y a lo sumo dos en pantalla angosta (`min-width: 7.5rem`; la regla `.pf-datos td:last-child { width: 1% }` de la tabla
    de Datos los partía en tres: se anula con `.pf-datos.pf-catalogos`). Historial (el usuario eligió esta opción entre
    tres): botón «Historial ⌄» en la fila de cada catálogo publicado que abre, justo debajo, un panel hundido con sangría y
    línea de color a la izquierda (`.pf-hist-panel`), sin separación con su fila (`tr.abierto`); nace cerrado y se
    conserva abierto al volver a pintar. Descartadas: sacarlo a una tarjeta aparte con selector, o dejar la fila `details`
    de antes (se confundía con una fila de catálogo). En ≤600px la tabla pasa a bloques apilados (cada `td` en su línea,
    con la etiqueta de la columna vía `data-etiqueta`), porque la tabla ancha se salía de la pantalla.
  - «Agregar registro» (2026-09-24, pedido del usuario) va DENTRO de `.toolbar`, como último elemento, empujado a la
    derecha (`.toolbar > .ed-acciones { margin-left: auto }`): queda al final de la línea de filtros y, si no cabe, es
    lo primero que baja de línea (si ni los campos caben, bajan también, eso es inevitable).
  - Perfil → Calculadoras: todos los campos de una sección van en UNA rejilla (`.grid-2`), que sumaba su `row-gap`
    (53 px entre filas contra 37 px en las calculadoras, donde cada fila es su propia rejilla): `.pf-form .grid-2 {
    row-gap: 0 }`; el espacio de más va entre secciones, con una línea suave (`border-top` en `.pf-grupo` salvo la primera).
  - Pendiente (no pedido): exportar el catálogo editado a JSON para llevarlo al repositorio como nuevo «de fábrica».
- Aclarado con el usuario: hacer privado el repo y servir desde Railway oculta el CÓDIGO en GitHub, no la app: quien
  tenga el enlace la abre y su navegador descarga el JS y los catálogos. Ocultarla exigiría pedir sesión antes de cargar.

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

## Multi-proveedor de IA: Gemini, OpenAI y Anthropic (2026-09-23)

- La pestaña de Perfil **«Clave de Gemini»** se renombró a **«Clave en servidor»** (2026-09-23) y, en la
  misma sesión, esa tarjeta se **trasladó por completo a Configuración de IA** (el usuario seguía sin
  convencerse del rename: "tener una configuración de IA en una parte y otra en otra sección no es muy
  coherente"). Perfil se quedó solo con **Usuarios** (admin) y **Apariencia**; la pestaña «clave» y la
  función `pintarClave` de `js/views/configuracion-avanzada.js` se BORRARON (no solo se renombraron). La
  ruta `#/perfil/clave` sigue existiendo a nivel de router (`/perfil/:pestana` es genérico) pero cae en la
  primera pestaña disponible, igual que cualquier pestaña inexistente.
  - Ahora vive en `js/views/ia-configuracion.js`, como tarjeta **«Origen de la clave»** (nombre definitivo;
    se llamó «Clave en servidor» hasta que el usuario notó que una de las tres opciones de la tarjeta —
    «Este navegador»— NO es del servidor, así que ese nombre no cubría los tres orígenes) entre «Modelo» y
    «Datos y privacidad», SOLO si el proveedor activo la admite (`meta.soportaFuenteServidor`; hoy solo
    Gemini) — con OpenAI/Anthropic activos la tarjeta no aparece en absoluto (pedido explícito del
    usuario). Una función nueva, `pintarClaveServidor()` (async, se llama sin esperar tras el render
    síncrono, igual que `pintarDatos()`), resuelve `obtenerBackend()` → `esperarSesion()` →
    `obtenerPerfil()` y, si CUALQUIERA falla (sin servicio, sin sesión, sin perfil), NO inserta nada — sin
    error, sin tarjeta — en vez de romper el resto de la pantalla (en la práctica esto no debería pasar: la
    ruta `/ia/configuracion` ya exige nivel usuario/admin, pero es la misma cautela que ya usaba
    `clave.js:prepararClave()`). Cuando sí se puede mostrar, la tarjeta se inserta con
    `$("#ia-modelo").insertAdjacentHTML("afterend", …)`: hermana REAL de las demás tarjetas, sin ningún
    `<div>` envoltorio — el espaciado entre tarjetas depende de `.card + .card { margin-top: … }` en
    `app.css`, que exige hermanos directos; un envoltorio (probado primero como `<div id="ia-servidor-slot">`
    y descartado) las despega y las deja "pegadas" arriba y abajo (bug reportado por el usuario el mismo
    día, corregido). El contenido (radios de fuente local/personal/compartida, campo de clave personal,
    campo de clave compartida solo para admin o texto de solo lectura, avisos) es el mismo que tenía
    `pintarClave`, con ids nuevos (`ia-f-*`, `ia-serv-k-*`, `ia-serv-g-*`, `ia-serv-b-*`, `ia-serv-msg-*`,
    `ia-fuente-detalle`, `ia-fuente-avisos`) para no chocar con los de la clave LOCAL de la misma pantalla.
    `OPCIONES_FUENTE` y `AYUDA_FUENTE` se movieron de `configuracion-avanzada.js` a `ia-configuracion.js`.
  - La tarjeta «Conexión con Gemini» ya no dice «Cambiar en Perfil» (enlazaba a `#/perfil/clave`): ahora
    dice «Cambiar abajo, en «Origen de la clave»» con un ancla dentro de la misma página (`href="#ia-servidor"`,
    ese `id` en la tarjeta nueva). Los dos «Ir a Perfil» de `js/ai/ui-clave.js` (`verificarAcceso`, cuando
    falla la fuente del servidor) pasaron a «Ir a Configuración» (`#/ia/configuracion`).
  - Pruebas: `tools/verify_acceso.html` tiene una sección nueva, «Configuración de IA: clave de Gemini en
    el servidor (trasladada de Perfil)», que monta `ia-configuracion.js` con el backend simulado y cubre lo
    mismo que antes probaba en Perfil (radios, guardar/borrar personal y compartida, diferencias
    admin/usuario) más los casos nuevos: la tarjeta desaparece sin sesión y desaparece con
    OpenAI/Anthropic activos. `tools/verify_ia_pantallas.html` (no mockea el backend, así que ahí la
    tarjeta nunca aparece) y `tools/verify_tema.html` se ajustaron a las pestañas de Perfil sin «clave».

- Además de Gemini, «Funciones con IA» admite OpenAI (ChatGPT) y Anthropic (Claude). Decisión del usuario:
  OpenAI/Anthropic son SOLO clave local (BYOK en este navegador, `js/ai/config.js`), sin «personal»/
  «compartida» en el servidor (eso sigue siendo exclusivo de Gemini, ver `js/ai/clave.js` y
  `firebase/firestore.rules`, que NO se tocaron). El proveedor se elige de forma GLOBAL en Configuración de
  IA (tarjeta «Proveedor de IA», primera de la pantalla), no por agente: los agentes
  (`js/ai/agentes.js`/`agentes-analisis.js`) siguen siendo solo prompt + temperatura + herramientas.
- **Arquitectura**: el formato de conversación que ya usaba Gemini
  (`contenidos:[{role:"user"|"model", parts:[{text}|{functionCall}|{functionResponse}]}]`) es el formato
  NEUTRO interno; se sigue persistiendo tal cual en IndexedDB (`js/ai/historial.js`), así que las
  conversaciones guardadas antes de este cambio (sin campo `proveedor`) se interpretan como Gemini y
  siguen abriendo igual (cero migración). `js/ai/openai.js` y `js/ai/anthropic.js` exponen el MISMO
  contrato público que `js/ai/gemini.js` (`generar()`, `listarModelos()`, `elegirModeloPorDefecto()`,
  `probarConexion()`, `usarMock()`) y traducen ese formato neutro hacia/desde su wire format puertas
  adentro; los ids de `tool_call`/`tool_use` que exigen (Gemini no los tiene) se sintetizan por posición,
  sin persistir nada nuevo. `js/ai/errores.js` define `ErrorProveedorIA` (tipos: offline/red/clave/cuota/
  modelo/bloqueo/servidor/solicitud/vacio); `ErrorGemini`/`ErrorOpenAI`/`ErrorAnthropic` la extienden. El
  registro central `js/ai/proveedores.js` (`PROVEEDORES`, `obtenerProveedorActivo`/`guardarProveedorActivo`,
  `proveedorDe(conv)`) NO traduce nada: solo resuelve «cuál proveedor» y da los metadatos de UI (nombre
  largo para el selector, `nombreCorto` para títulos de tarjeta, URL para conseguir la clave, si admite
  fuente servidor). Cada conversación fija su proveedor al crearse (`conv.proveedor`) y lo conserva aunque
  el usuario cambie el activo a mitad de camino. `js/ai/analisis.js` (`ejecutarTurno`) y las vistas
  (`ia-analisis.js`, `ia-redaccion.js`) resuelven `PROVEEDORES[proveedor].cliente` en vez de importar
  `generar` fijo de Gemini; `js/ai/tools.js` NO se tocó (su JSON Schema plano ya es compatible con los tres
  formatos de tools, solo cambia el envoltorio dentro de cada cliente).
- **CORS**: verificado que las tres APIs aceptan fetch directo desde el navegador sin backend, igual que
  Gemini. OpenAI no exige nada especial (`Authorization: Bearer`). Anthropic SÍ exige el header
  `anthropic-dangerous-direct-browser-access: true` en cada request (pensado por el propio proveedor para
  apps 100% cliente); sin él, el fetch falla por CORS antes de llegar al servidor. Si Anthropic cambia esa
  política, `js/ai/anthropic.js` es el único archivo a revisar.
- **`config.js`**: la clave/ajustes de Gemini SIGUEN en las llaves de storage de siempre (`ia.apiKey`,
  `ia.ajustes`, sin sufijo) para no perder lo que los usuarios ya tenían guardado; OpenAI/Anthropic usan
  `ia.apiKey.<proveedor>`/`ia.ajustes.<proveedor>`. Todas las funciones reciben `proveedor = "gemini"` como
  parámetro opcional (compatibilidad hacia atrás: cualquier llamada vieja sin ese argumento sigue
  operando sobre Gemini). Anthropic tiene un campo extra `maxTokens` en sus ajustes (exige `max_tokens`
  explícito, sin default implícito).
- **UI**: `js/ai/ui-clave.js` generaliza el instructivo («¿Cómo obtener mi clave?») y `verificarAcceso()`
  por proveedor (`PASOS_INSTRUCTIVO`); si el proveedor activo no admite fuente servidor, `verificarAcceso`
  se salta por completo la rama de `prepararClave()`/backend y solo exige `hayClave(proveedor)` de
  `config.js`. En Configuración, el título de la tarjeta de conexión usa `nombreCorto` («Conexión con
  Gemini/OpenAI/Claude»); el aviso de privacidad usa el nombre largo («Google (Gemini)», etc.) y agrega la
  frase del plan gratuito SOLO para Gemini (las otras dos no tienen ese texto porque no aplica igual). El
  campo «Tokens máximos por respuesta» solo aparece en ajustes avanzados cuando el proveedor es Anthropic.
- Pruebas: `tools/verify_ia.html` tiene secciones nuevas «openai (mock)», «anthropic (mock)», «proveedores:
  registro y activo», «config: namespacing por proveedor», «openai/anthropic: envuelven el mismo esquema de
  tools.js…» y dos «analisis: bucle con herramientas (OpenAI/Anthropic simulado)» que validan la
  correlación posicional de ids de herramientas. `tools/verify_ia_pantallas.html` se actualizó a 4 tarjetas
  y 6 botones «i» en Configuración (antes 3 y 5: la nueva es «Proveedor de IA»).
- Pendiente (no pedido aún): probar con claves reales de OpenAI/Anthropic (el arnés solo mockea fetch); la
  vista de Perfil (`configuracion-avanzada.js`) sigue mostrando únicamente la clave de Gemini, sin cambios.

## Sección "Funciones con IA" (`js/ai/*`, `js/views/ia*.js`)

- La pantalla **«Análisis con calculadoras»** se renombró a **«Asistente técnico»** (2026-09-23, pedido del usuario: el nombre
  anterior sonaba poco profesional). Cambia solo el texto visible (menú, breadcrumb, título de la pantalla, README y
  `docs/ia-herramientas.md`); NO cambian la ruta (`#/ia/analisis`), el archivo (`js/views/ia-analisis.js`) ni ningún
  identificador interno. Las menciones de "Análisis con calculadoras" más abajo en este documento describen decisiones
  tomadas bajo el nombre anterior: no hace falta reescribirlas.

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
  Botones de fila en «Gestionar» de Análisis (2026-09-20, pedido del usuario): Ver/Editar/Duplicar/Eliminar van juntos en `.ia-historial-acciones` y, si en UNA fila
  no caben junto al nombre, bajan los cuatro en TODAS (`alinearAcciones` en `pintarConfig`: mide con un ResizeObserver y pone `.acciones-abajo` en la lista). Edge headless no
  dispara ResizeObserver, por eso la prueba lo fuerza con el evento `alinear-acciones`. El «Gestionar» del Corrector (`ia-redaccion.js`, `pintarGestor`) lo tiene igual (Editar/Duplicar/Eliminar).

- «Imprimir / PDF» del reporte de Análisis (2026-09-19): NO imprime la tarjeta de la pantalla sino un documento propio (`#doc-impresion`, armado en `armarDocumentoImpresion`, `ia-analisis.js`): Carta vertical (`@page reporte`, márgenes 20 mm, pie con «Página X de Y»), SIEMPRE en claro (clase `imprimiendo-reporte` también en `<html>` con `color-scheme: light`), encabezado en la primera página, «Conclusiones» en recuadro gris, tablas con cabecera que se repite y aviso final. Los `#`/`##` de la IA salen como h2/h3 (ver `markdown.js`). Para ver el resultado: `msedge --headless --no-pdf-header-footer --print-to-pdf` sobre una página de prueba con `window.print` anulado y convertir el PDF a PNG con pymupdf (`pip install pymupdf --target <carpeta>`).
- «Descargar» del reporte de Análisis (2026-09-20): es un MENÚ (`details.menu-mas`, `#menu-descargar`) con «Documento de Word (.docx)» y «Markdown (.md)»; el usuario NO quiere un botón aparte por formato. El .docx se genera sin librerías: `js/ai/docx.js` (HTML de la IA + tablas → XML de Word, mismo diseño del PDF: Carta, estilos Title/Heading, «Conclusiones» sombreada, tablas con cabecera repetida, pie «Página X de Y») y `js/util/zip.js` (ZIP sin compresión). Verificado: XML bien formado, `python-docx` lo lee y Word (COM) lo abre con 2 páginas; NO se pudo ver renderizado (la exportación a PDF por COM se cuelga). Pruebas: sección «reporte en Word (.docx)» de `verify_ia.html`.
- Es la ÚNICA excepción a "100% offline": se conecta a Google Gemini con la clave del propio
  usuario (BYOK, guardada en el navegador; no hay backend). Detalle en el README.
- Análisis con calculadoras tiene agentes (`js/ai/agentes-analisis.js`, botón «Agentes»): el predeterminado («Agente estándar») sale del
  código (`SISTEMA_ANALISIS`/`PROMPT_REPORTE` en `analisis.js`), es de solo lectura y nunca se escribe en `localStorage`; los
  propios se guardan ahí y siempre llevan `REGLA_FIJA` al final. Si cambia el prompt estándar, el predeterminado se actualiza
  solo. Cada agente elige las herramientas que puede usar (campo `herramientas`; en el editor son etiquetas de selección múltiple `.ia-chip--herr` con ✓ al marcarse, agrupadas por categoría, ya no casillas, y SIN negrita: basta el azul y la ✓; las cajas de instrucciones del editor usan letra de 0.85rem más tenue; la nota «el agente estándar no se puede modificar…» va en un botón «i» junto a su nombre, no como texto fijo): el filtro real es
  `declaraciones(permitidas)` + `ctx.permitidas` en `tools.js` (no solo el prompt); un agente guardado sin lista usa las del
  estándar (`HERRAMIENTAS_ESTANDAR`; una herramienta con `opcional: true` queda fuera de ellas: hoy `convertir_unidades` y
  `convertir_coordenadas`, grupo «Varios»). Para exponer otro módulo a la IA: ficha nueva en `tools.js` (campos, `calcular`,
  resultados con `res`), marcarla `opcional` con su `grupo` y agregar sus pruebas. Cubierto por
  `tools/verify_ia.html` (secciones «agentes de análisis» y «herramientas permitidas por agente»).
- Herramientas de DISEÑO (2026-09-20, `js/ai/tools.js`): `dimensionar_conductor`, `verificar_conductor` y `resolver_valor_limite` (tipo `diseno`, grupo «Análisis»). Son `opcional: true` POR PEDIDO DEL USUARIO: el agente estándar NO las trae y solo se habilitan en un agente propio (no cambiar eso); combinan las calculadoras existentes, sin fórmulas nuevas, y exigen que el agente tenga habilitadas las calculadoras que usan. Detalle en `docs/ia-herramientas.md` (sección 4); pruebas en `verify_ia.html`.
- Herramientas alineadas con las pantallas (2026-09-19; plan y registro de avance en `docs/plan-ajustes-ia.md`, TERMINADO salvo el reporte de la IA, `js/ai/reporte.js`, que el usuario decidió rediseñar él con otras ideas: no tocarlo sin que lo pida — excepciones puntuales: 2026-09-23 el usuario pidió agregarle la sección «Datos del proyecto» del agente riguroso, ver ese bullet más abajo; y 2026-09-24 la corrección de la nota de referencia obsoleta, ver el bullet correspondiente). Pérdidas y regulación aceptan `tramos`, dato de partida (MW/MVA/A) y conductores por fase y devuelven la clasificación Óptimo/Aceptable/Elevado; cortocircuito acepta `corriente_falla_ka`; ocupación acepta `grupos` y da el radio 12D; ampacidad subterránea da la corriente circulante/tensión inducida en la pantalla; unidades usa `data/unidades.json`; coordenadas acepta ~500 códigos EPSG y `puntos`. Los campos de nivel superior siguen valiendo para un solo tramo/tipo/punto. Los motores de `js/calc/` no se tocaron. Detalle en `docs/ia-herramientas.md` (sección 4).
- **Agente riguroso y ficha del proyecto (2026-09-23, pedido del usuario)**: segundo agente predefinido para el Asistente
  técnico, pensado para una MEMORIA DE CÁLCULO completa y definitiva (no una estimación como el estándar). `js/ai/analisis.js`
  gana `SISTEMA_RIGUROSO`/`PROMPT_REPORTE_RIGUROSO` junto a los del estándar; `js/ai/agentes-analisis.js` pasa de un
  `AGENTE_PREDETERMINADO` único a `AGENTES_PREDETERMINADOS` (array, `[estándar, riguroso]`, ambos `predefinido: true` y
  congelados) — `AGENTE_PREDETERMINADO`/`ID_PREDETERMINADO` quedan como alias del estándar (compatibilidad; son los únicos
  nombres que usan `ia-analisis.js` y las pruebas). El riguroso usa `HERRAMIENTAS_TODAS` (17 desde 3.30.0; nueva exportación de
  `tools.js` junto a `HERRAMIENTAS_ESTANDAR`): antes de calcular pide TODOS los parámetros por categoría (Sistema, Conductor,
  Instalación…), avisa explícitamente cada valor por defecto y pide confirmarlo o cambiarlo (nunca lo asume en silencio,
  a diferencia del estándar), reparte las preguntas en varias respuestas para no saturar, y registra cada categoría
  confirmada con la herramienta nueva `guardar_ficha_proyecto` (idea ya anotada como aplazada, «ficha del caso»).
  - `guardar_ficha_proyecto` (`js/ai/tools.js`) es un TIPO NUEVO, `"ficha"`: no calcula ni gasta presupuesto (como
    `"consulta"`), pero sí debe persistir y verse en el reporte (a diferencia de `"consulta"`, que se descarta a propósito).
    Guarda en `ctx.ficha` (arreglo por categoría, con `parametros: [{clave, etiqueta, valor, unidad, origen}]`, `origen` en
    `"usuario"|"defecto"`); `crearContexto(max, logPrevio, fichaPrevia)` ahora también recibe y devuelve `ficha`, MUTADA EN
    SITIO (nunca reasignada) para que `conv.ficha = ctx.ficha` conserve la referencia entre turnos y al reabrir del
    historial, igual que ya hacía `ctx.log`/`conv.log`. Deja un marcador mínimo en `ctx.log` (`{ficha:true}`, sin
    entradas/resultados) que `armarTablas` ignora igual que a las consultas (`if (r.consulta || r.ficha) continue`).
    Opcional: no entra al agente estándar; sí a `HERRAMIENTAS_TODAS`. NO entra en `CALCULADORAS` (sin barrido, no aplica).
  - Reporte (`js/ai/reporte.js`): `fichaHtml`/`fichaMd` arman la sección «Datos del proyecto» (una tabla por categoría:
    Parámetro/Valor/Origen) y se insertan ANTES de «Cálculos ejecutados» en `reporteMd`/`reporteHtmlExportable` (ambas
    ganaron el parámetro `ficha`); `js/views/ia-analisis.js` (`datosReporte`, `pintarReporte`, `armarDocumentoImpresion`) y
    `js/ai/docx.js` (`crearDocx`) se actualizaron para pasarla. Si `ficha` viene vacía o `undefined` no agregan nada
    (retrocompatible con el reporte del agente estándar, que no la usa).
  - UI (`js/views/ia-analisis.js`): con 2 predefinidos, el id fijo `info-agente-estandar` (botón «i» + popover en
    «Gestionar») quedaba DUPLICADO en el DOM — se corrigió a `info-agente-${a.id}` (uno por agente) y el texto
    (`INFO_PREDEFINIDO`) se generalizó («Este agente viene con la aplicación…», ya no menciona «estándar»). El resto de la
    vista (píldoras, «Gestionar», editor en modo «ver», `duplicar`) ya generalizaba sobre `a.predefinido`/`a.id` y no
    necesitó más cambios.
  - Pruebas: `tools/verify_ia.html` (secciones «herramienta: ficha del proyecto» y «agentes de análisis», actualizada a 2
    predefinidos) y `tools/verify_ia_pantallas.html` («Asistente técnico rediseñado»: 2 píldoras/filas, popovers con id
    propio, catálogo de 16 herramientas). De paso se corrigieron ahí los conteos que habían quedado desactualizados desde
    que `calcular_conductor_economico` pasó a ser estándar (2026-09-23, antes de este bullet) y que `verify_ia_pantallas.html`
    no había recibido esa actualización.
- **Nota de referencia obsoleta en el reporte de escenarios (2026-09-24, reportado por el usuario probando el agente
  riguroso)**: al pedir un calibre con varias referencias sin indicar cuál (p. ej. ACSR 477, que tiene 4 en el catálogo),
  `resolverConductor` (`js/ai/tools.js`) agrega una nota «Hay N referencias…; se usó la primera (X)…»; si LUEGO, en la misma
  conversación, se pide ajustar el resultado con OTRA referencia explícita, esa segunda corrida no genera nota (no es
  ambigua: el usuario la indicó), pero ambas corridas caían en la MISMA tabla de «Cálculos ejecutados» (`armarTablas` en
  `js/ai/reporte.js` agrupa solo por nombre de herramienta) y la nota de la primera corrida se mostraba igual, como si
  aplicara a toda la tabla — quedando desactualizada («se usó la primera» ya no es cierto para las filas con la otra
  referencia). Diagnóstico confirmado con un subagente de investigación: el bug NO estaba en `tools.js` (cada corrida
  genera su nota, o ninguna, de forma independiente y correcta) sino en cómo `armarTablas` fusionaba las notas de todas
  las corridas del grupo por texto (`Set`) sin relacionarlas con qué fila las originó. Se le propusieron al usuario dos
  arreglos (separar en tablas distintas por referencia, o atribuir la nota a filas concretas) y los rechazó los dos por
  complejidad; pidió en su lugar que la nota se «revise y actualice sola» diciendo cuántas y cuáles referencias se usaron
  realmente. Implementado en `js/ai/reporte.js` (`notasDelGrupo`, `PATRON_NOTA_AMBIGUEDAD`, `listaConY`): al armar las
  notas de un grupo, las que calzan con el patrón de ambigüedad de `resolverConductor` («Hay N referencias/construcciones…»)
  se separan de las demás; si la entrada `conductor` (que TODAS las calculadoras que usan `resolverConductor` registran
  con esa misma clave) tomó más de un valor distinto en las corridas del grupo, se descartan esas notas crudas y se
  reemplazan por una sola: «Este calibre tiene varias referencias en el catálogo; en estos escenarios se usaron N: A, B
  (y C…).» — si todas las corridas del grupo terminaron usando la MISMA referencia (aunque alguna fuera ambigua), la nota
  original se deja tal cual porque sigue siendo exacta. Es genérico: aplica a cualquier calculadora que use
  `resolverConductor` (Pérdidas, Regulación, Cortocircuito, Conductor económico, Ampacidad aérea), no solo a Ampacidad
  aérea del ejemplo. Pruebas: sección nueva «reporte: la nota de referencia ambigua se actualiza si el grupo usa varias»
  en `tools/verify_ia.html` (incluye el caso de que NO cambie cuando todas las corridas comparten referencia).
- **Redacción impersonal en la memoria del agente riguroso (2026-09-24, pedido del usuario probando el agente)**: la
  sección «3. Datos de entrada» de la memoria generada decía cosas como «...confirmados previamente por el usuario...»
  — lenguaje de interfaz de software, fuera de lugar en un documento que se presenta como memoria de cálculo de
  ingeniería. `PROMPT_REPORTE_RIGUROSO` (`js/ai/analisis.js`) pedía explícitamente «aclara en general qué vino del
  usuario y qué se dejó en su valor por defecto»; se cambió a pedir la misma distinción (dato específico del proyecto
  vs. valor por defecto) en VOZ IMPERSONAL, sin mencionar «el usuario» ni a ningún actor (el usuario eligió esta opción
  entre tres propuestas; descartó nombrar «el interesado»/«el solicitante» — términos válidos en memorias de cálculo
  tradicionales pero que igual nombran a alguien externo — y descartó también quitar la aclaración por completo).
  Ejemplo del texto que debería salir ahora: «Los parámetros del sistema y del entorno se establecieron para este
  proyecto, adoptando por defecto las condiciones base de la norma IEEE Std 738 para el viento, la radiación solar, la
  absortividad y la emisividad...». Es un ajuste de PROMPT (texto que lee el modelo), no de código determinista: no hay
  forma de verificarlo con una prueba automática (la redacción exacta la decide el modelo); queda pendiente que el
  usuario lo confirme generando otra memoria.
- **Refinamiento de los dos agentes de análisis inspirado en "Ulises" (2026-09-24)**: el usuario compartió un análisis
  propio (con ayuda de IA) de un video demo de "Ulises" (Atera IA/Celsia), un agente de prefactibilidad energética en
  Teams con un patrón similar al nuestro (LLM separado del motor de cálculo). De 10 patrones identificados se
  implementaron 4 (los demás quedaron descartados o pendientes de decisión futura — no están en el código, no
  buscarlos): entradas con procedencia, validación de datos atípicos, confirmación final antes de calcular, y
  sensibilidad proactiva — esta última **solo para el agente ESTÁNDAR**, decisión explícita del usuario: el riguroso
  produce una memoria DEFINITIVA sobre lo ya confirmado, así que reabrirla con un barrido "por si acaso" contradice su
  propósito (`js/ai/analisis.js`, regla 9 de `SISTEMA_RIGUROSO`, lo dice explícitamente: "NO uses barrer_parametro como
  análisis de sensibilidad exploratorio sobre datos ya confirmados").
  - **Origen "estimado" en la ficha del proyecto** (`js/ai/tools.js`, `CAMPOS_PARAMETRO_FICHA`): tercer valor del campo
    `origen` de `guardar_ficha_proyecto`, además de `usuario`/`defecto` — para cuando el riguroso propone un valor con
    su propio criterio de ingeniería (ni lo dio el usuario ni hay un valor por defecto claro en la calculadora, p. ej.
    una resistividad de suelo típica). Exige un campo nuevo `justificacion` (de dónde sale el criterio). `js/ai/reporte.js`
    (`origenTexto`, reemplaza el uso directo de `ORIGEN_TXT`) lo muestra en la tabla «Datos del proyecto» como
    «Estimación (justificación)». `SISTEMA_RIGUROSO` regla 4 instruye usarlo (con la palabra "estimación", nunca en
    silencio ni como si fuera un dato firme) y la regla 6 actualiza el enum que debe pasarle a `guardar_ficha_proyecto`.
    `PROMPT_REPORTE_RIGUROSO` (secciones 3 y 9) también menciona las estimaciones, no solo usuario/defecto.
  - **Revisar datos atípicos antes de calcular** (`SISTEMA_RIGUROSO` regla 7, nueva): si un valor confirmado por el
    usuario es técnicamente válido pero luce raro (temperatura, elevación, tensión o antigüedad fuera de lo usual),
    comentárselo y pedir que lo confirme antes de seguir, en vez de darlo por bueno en silencio.
  - **Confirmación final antes de calcular** (`SISTEMA_RIGUROSO` regla 8, ampliada): además de confirmar por categoría
    (ya existía), justo antes de ejecutar el cálculo definitivo debe resumir en un solo mensaje TODOS los parámetros
    que va a usar (agrupados, con su origen) y pedir el visto bueno final.
  - **Sensibilidad proactiva, solo estándar** (`SISTEMA_ANALISIS` regla 2, ampliada): además de usar `barrer_parametro`
    cuando se lo pidan, debe ofrecerlo/correrlo por iniciativa propia cuando un dato de entrada sea incierto o el
    resultado quede cerca de un umbral/clasificación, identificando qué variable mueve más el resultado y cerrando con
    qué conviene confirmar o medir en campo. `barrer_parametro` ya era una herramienta no-opcional (disponible a ambos
    agentes desde antes): el cambio es de PROMPT (cuándo usarla por decisión propia), no de qué herramientas tiene cada
    uno.
  - Los 6 patrones NO implementados (dominio de validez del modelo, entregable autoverificado, biblioteca de casos
    previos, dato crítico primero, y los dos de "errores a evitar" que ya no aplicaban a nuestra arquitectura) se
    descartaron por no encajar con motores de fórmula cerrada (no regresiones) y exports deterministas (no arriesgan
    nombres de archivo), o quedaron como decisión de producto pendiente (biblioteca de casos, compartida vs. local):
    no hay nada de eso en el código ni hace falta buscarlo.
  - Pruebas: `tools/verify_ia.html`, sección «herramienta: ficha del proyecto» (origen «estimado» con justificación,
    un origen inválido se rechaza) y nuevas aserciones en «agentes de análisis» (reglas nuevas del riguroso y del
    estándar, presentes en los prompts). Como son cambios de PROMPT (texto que interpreta el modelo, no código
    determinista), las pruebas solo verifican que la instrucción está en el texto — no pueden verificar que el modelo
    la siga; eso lo confirma el usuario probando los agentes.
- Explicación completa de cómo la IA usa las herramientas y de cómo agregar una nueva: `docs/ia-herramientas.md` (léelo antes de
  tocar `tools.js` o los agentes; si cambia ese comportamiento, actualízalo).
- **Documentos para explicarle esto a alguien que no ve el código (2026-09-24, pedido del usuario)**: `docs/como-funcionan-los-agentes-ia.md`
  es un resumen de una hoja (flujo, garantías, qué es un agente) y `docs/ia-herramientas.md` es la referencia técnica completa; los dos
  se enlazan entre sí. AMBOS tienen versión en PDF junto al `.md` (`docs/como-funcionan-los-agentes-ia.pdf`, `docs/ia-herramientas.pdf`),
  generada con el mismo método que ya usa el reporte de Análisis: Edge headless (`--print-to-pdf`) sobre una página de prueba que
  reutiliza `markdownAHtml` (`js/ai/markdown.js`) y el CSS `.doc-impresion`/`@page` de `app.css` (ver el bullet de «Imprimir / PDF» más
  arriba). Si se edita cualquiera de los dos `.md`, hay que regenerar su PDF a mano (no hay build step que lo automatice); el script de
  la página de prueba no se guarda (es un `_test_*.html` temporal, se borra después de usarlo). El resumen de una hoja tiene además un
  diagrama SVG propio (`docs/img/flujo-agentes-ia.svg`, cajas con color: azul = el modelo/IA, gris = «código de la aplicación» —nombre
  elegido por el usuario en vez de solo «código»—, con la etiqueta en la flecha 2→3 explicando el mecanismo de function calling); como
  `markdownAHtml` no soporta sintaxis de imagen (`![alt](src)`), la página de prueba de ESE PDF la intercepta aparte (parte el markdown
  en la línea de la imagen e inserta un `<img>` real) — no se le agregó soporte de imágenes al renderizador compartido, porque lo usan
  también las respuestas reales de la IA y no hacía falta ahí.
  **Bug encontrado y corregido de paso (2026-09-24, real, no solo del PDF)**: `inline()` en `markdown.js` sustituía primero los
  `` `código` `` por `<code>` y LUEGO aplicaba las expresiones regulares de negrita/cursiva sobre el HTML ya armado; si un párrafo tenía
  DOS fragmentos de código con un asterisco suelto cada uno (p. ej. `` `js/calc/*.js` `` y `` `data/*.json` `` en la misma frase, un caso
  real de `docs/ia-herramientas.md`), la expresión de cursiva emparejaba esos dos asteriscos sueltos y envolvía TODO lo de en medio en
  `<em>`, comiéndose los asteriscos originales. Esto podía pasarle a cualquier respuesta real de la IA con ese patrón, no solo a este
  documento. Arreglado sacando el contenido de cada `` `código` `` a un arreglo aparte (con un marcador `\u0000N\u0000`) ANTES de negrita/
  cursiva/enlaces, y devolviéndolo al final — así ya no hay asteriscos sueltos de código visibles para esas expresiones. Prueba nueva en
  la sección «markdown» de `tools/verify_ia.html` que reproduce el caso exacto.
  **Ajuste de legibilidad de `docs/ia-herramientas.md` (2026-09-24, pedido del usuario: "no trae diagrama de flujo, revisa
  legibilidad")**: se le agregó el MISMO diagrama SVG del resumen corto al inicio de la sección 2 (antes del detalle técnico en
  ASCII, que se conserva); se actualizaron las menciones de «Gemini» a «el modelo» donde el texto describe el mecanismo genérico
  (válido para los 3 proveedores desde el trabajo multi-proveedor), dejando «Gemini» solo donde es literal (nombre de archivo,
  nombre de sección de prueba); se agregó una fila para `openai.js`/`anthropic.js` en la tabla «Dónde está cada cosa»; y los tres
  párrafos más densos de la sección 4 (agentes predefinidos, `guardar_ficha_proyecto`, `calcular_conductor_economico`) se
  reescribieron como listas — de paso se les agregó la mención del origen `estimado` que había quedado desactualizada. **Trampa
  encontrada al hacerlo**: `markdownAHtml` (`js/ai/markdown.js`) NO soporta continuar un ítem de lista en la siguiente línea (una
  viñeta `- texto` que sigue en la línea de abajo sin otro `-` NO se une: la siguiente línea cae como párrafo aparte, cortando la
  viñeta a la mitad). Cada viñeta debe ir en una sola línea del `.md`, por larga que quede (mismo estilo que las demás viñetas ya
  existentes en el archivo, p. ej. las de «Herramientas de diseño»); los párrafos normales (fuera de listas) sí se pueden partir en
  varias líneas de fuente sin problema. Se regeneró el PDF (14 páginas) y se verificó visualmente tras corregirlo.
- Bug reportado por el usuario (2026-09-22, corregido): el modelo escribía sintaxis LaTeX (`$...$`, `\text{}`) dentro de
  respuestas y reportes de Análisis; `js/ai/markdown.js` no la interpreta (no hay integración con KaTeX ahí, solo en la
  pestaña «Fórmulas» de cada calculadora) y se veía como código crudo. Se agregó la regla 11 al `SISTEMA_ANALISIS`
  (`js/ai/analisis.js`) pidiendo texto/Unicode plano en vez de LaTeX; no se tocó el renderizador.
- La IA nunca calcula: las calculadoras se exponen como herramientas (`js/ai/tools.js`) que
  llaman a los motores de `js/calc/*.js`. Si cambia la firma de un motor, actualizar su adaptador
  en `tools.js` y correr `tools/verify_ia.html` (arnés en el navegador, ver su encabezado).
- No fijar nombres de modelo en el código (cambian): se listan desde la API en Configuración.
- En `sw.js`, al agregar o borrar archivos del shell, actualizar `APP_SHELL` y subir `CACHE_VERSION`. Desde 3.16.1 la
  instalación ya NO usa `cache.addAll` (un solo archivo que fallara dejaba la versión nueva con la cache vacía, y en
  `install` el error se tragaba): descarga cada archivo por separado con `cache: "reload"` (siempre la copia del
  servidor, no la de la cache HTTP del navegador, que en GitHub Pages dura 10 min y podía traer la versión anterior).
  Los que falten se completan cuando Perfil > Aplicación pregunta el estado con `completar: true` (con internet), y la
  respuesta trae `faltantes` (rutas) para mostrar cuáles. Reportado por el usuario: «faltan 1 de 141» estando en línea
  y con la última versión; los 141 archivos respondían bien en GitHub Pages.
- Si `bash` de Git no encuentra `ls/sed/python`, usar PowerShell (`python` sí está en el PATH ahí).
  Para leer resultados de `verify_ia.html`: en Bash sirve `msedge --headless --dump-dom ... | python -c` (con el servidor en
  segundo plano); en PowerShell hace falta `Start-Process -RedirectStandardOutput` (la salida de `--dump-dom` no se captura con `&`).
- Pantallas de chat (Corrector de redacción y Análisis con calculadoras), diseño acordado con el usuario (2026-09-19):
  una tarjeta que crece con la conversación (`.ia-chat--hilo`, SIN barra de scroll propia: desplaza la página); la caja de
  texto es `.ia-caja` con un textarea autoajustable (`ajustarAlto`: debe mostrar completo el placeholder aunque ocupe varias
  líneas y se reajusta con ResizeObserver + rAF; queda a 12px del borde de la tarjeta); Nueva conversación / Dictar / Enviar
  van en una fila `.ia-acciones` DEBAJO de la tarjeta, con botones `.ia-accion` (icono + palabra, sin recuadro hasta pasar el
  cursor). La respuesta de la IA (`.ia-msg--model`) lleva fondo transparente y una línea clara. No poner contador de caracteres
  ni avisos de privacidad en estas pantallas (la privacidad vive en Configuración de IA). SIN desplazamiento automático (2026-09-21, pedido
  del usuario): ni al enviar/pensar (los tres puntitos, cada etiqueta de herramienta) ni al llegar la respuesta ni en un error; antes
  `alFinal` bajaba al final de TODA la página (hasta «Reporte de escenarios») y la respuesta quedaba arriba. No volver a ponerlo. Solo
  se conserva el desplazamiento al «Abrir» una conversación del historial. Análisis es UNA sola tarjeta
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
- **Versión de la app `x.y.z` (desde 2026-09-24, pedido del usuario; antes era un contador `v1`…`v296`)**: `CACHE_VERSION`
  de `sw.js` ES la versión visible (se conservó el nombre para no desactualizar los documentos que lo citan). Cada
  publicación que cambie un archivo del shell la sube: **z** = correcciones y ajustes menores, **y** = funcionalidad nueva
  o mejora visible (z vuelve a 0), **x** = cambio grande: sección nueva, rediseño general o algo que deja de ser compatible
  (y y z vuelven a 0). La decide Claude en cada commit con ese criterio y la dice en el mensaje final; el usuario puede
  corregirla. Al subir la versión, agregar su entrada ARRIBA de todo en `js/util/novedades.js` (versión, fecha y cambios
  en lenguaje de usuario, sin detalles técnicos); si solo se corrige algo, basta subir la `z` y sumar una línea a su
  entrada. `tools/verify_perfil.html` falla si la primera novedad no coincide con `sw.js` o si el orden está mal. Se
  arrancó en **3.16.0**: el historial anterior se reconstruyó desde git (1.0.0 migración web 22-ago, 2.0.0 IA + login
  18-sep, 3.0.0 rediseño de calculadoras 19-sep, y una `y` por cada funcionalidad posterior). Documentos (`docs/*.md`,
  README) solos no suben versión (no están en el shell). En el celular, «Buscar actualización» (Perfil > Aplicación)
  instala la versión nueva; sin él hay que cerrar y abrir la app dos veces.

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

## Perfil: pestañas Calculadoras, Datos y Aplicación (2026-09-24, elegidas por el usuario entre 7 ideas)

- Pestañas de Perfil (en este orden): `Usuarios` (solo admin) · `Apariencia` · `Calculadoras` · `Datos` · `Aplicación`
  (`pintarPanel` en `js/views/configuracion-avanzada.js`; cada pestaña nueva vive en su propio módulo de `js/util/perfil-*.js`).
  Las pestañas bajan de línea en celular (`.tabs` ya tiene `flex-wrap`). Ideas NO elegidas (quedan para después): datos
  para el encabezado de los reportes, más apariencia (claro/oscuro/sistema, tamaño de letra, sin animaciones), favoritos,
  y «Solicitar acceso» para el admin. La configuración de IA NO va en Perfil (se reunió en Configuración de IA).
- **Aplicación** (`perfil-aplicacion.js`): versión instalada, si la app está completa para usarse sin conexión, estado de la
  red y «Buscar actualización» (`registration.update()` → espera a que el SW nuevo quede activo → «Recargar ahora»; con
  eso ya no hace falta cerrar y abrir la app dos veces). La versión y los archivos que faltan los responde el propio SW
  (mensaje `{tipo:"estado"}` por `MessageChannel`, handler `message` en `sw.js`). La ve TODO el mundo, también sin sesión
  (decidido con el usuario): para visitantes es una tarjeta suelta `#ca-aplicacion-libre` dentro de `#ca-libre`, debajo
  de la tarjeta de inicio de sesión; con acceso se oculta (`libre.hidden`) y pasa a ser la pestaña. `render()` de Perfil
  ahora devuelve una función de limpieza (listeners de online/offline). LIMITACIÓN DE PRUEBAS: el Edge sin pantalla de este
  entorno NO completa `navigator.serviceWorker.register()` (ni con `--headless=new`), así que la versión real y el flujo de
  «Buscar actualización» solo se pueden confirmar a mano en el navegador/celular; el arnés solo acepta `vN` o
  «No disponible».
- **Datos** (`perfil-datos.js`): tabla de lo guardado en el navegador por categoría (conversaciones de IA en IndexedDB,
  agentes propios, ajustes de IA, claves de IA, valores de las calculadoras, apariencia) con «Borrar» por fila, «Borrar
  todo», «Descargar respaldo» y «Restaurar respaldo» (archivo `.json`: `{app, tipo:"respaldo", formato:1, creado,
  almacenamiento:{clave: texto}, conversaciones:[…]}`). Las CLAVES de IA nunca van en el respaldo (el archivo podría
  compartirse), ni `acceso.cache` (la da el servidor) ni la cache del SW; al restaurar solo se aceptan las claves de
  `localStorage` de la lista blanca aunque el archivo traiga otras. Restaurar REEMPLAZA ajustes/agentes/valores/apariencia
  y SUMA las conversaciones (mismo id se reemplaza; `historial.importar`, que no toca `actualizado`, y `historial.todas`
  son nuevas). La tabla se pinta de inmediato y cada «Contenido» se llena después, y «Borrar todo» borra primero
  `localStorage` y luego IndexedDB: así, si IndexedDB no responde, lo demás igual funciona.
- **Calculadoras** (`perfil-calculadoras.js` + `valores-defecto.js`): 14 valores con que arrancan las calculadoras,
  agrupados (Sistema: tensión, FP, Fc · Evaluación económica: precio de la energía, aumento anual, tasa, años · Ambiente de
  líneas aéreas: Ta, viento, elevación · Terreno: temperatura, resistividad, profundidad · Falla: tiempo de despeje).
  `localStorage["calc.defectos"]` = solo los llenos; campo vacío = la calculadora conserva su valor propio (el placeholder
  lo muestra). Cada calculadora llama `aplicarDefectos(container, "<ruta>")` justo antes de `activarInfos(container)`, o
  sea ANTES de restaurar lo escrito en la sesión (`persistencia-calculo.js`): lo escrito siempre gana. Un valor que no es
  válido para el campo de ESA calculadora (rango o `step`, p. ej. 115 kV en Ampacidad subterránea, que llega a 46) no se
  aplica: se prueba con `campo.validity.valid` y se deja el valor propio, para que «Calcular» nunca quede bloqueado.
  Ocupación de ductos no tiene ninguno de estos campos. Resuelve de paso el pendiente de Conductor económico «decidir si
  los precios se guardan entre sesiones (solo local)»: el precio de la energía se puede fijar aquí.
- Ajustes posteriores (2026-09-24, pedidos del usuario): la lista de **Novedades** de la pestaña Aplicación solo la ve el
  ADMINISTRADOR (`pintarAplicacion(box, { novedades: esAdmin })`; ni usuarios ni visitantes). «Uso sin conexión» dice
  «Todos los archivos de la app están guardados en este dispositivo.» (sin «Lista:» ni el número; si falta alguno sí se dice
  cuál). En Perfil → Calculadoras el espacio SOBRE cada separador de sección es el doble del inicial (16 px del campo +
  32 px de `margin-top` = 48 px). La tarjeta de inicio de sesión dice «…Con una cuenta autorizada se habilitan todos
  los módulos y la configuración avanzada.».
- Iconos Tabler nuevos (SVG oficial): `deviceMobileCog`, `database`, `adjustmentsHorizontal`, `refresh`, `download`, `upload`.
- Pruebas: `tools/verify_perfil.html` (nuevo, 62) y `tools/verify_acceso.html` (pestañas, tarjeta suelta del visitante,
  `/perfil/aplicacion`); `verify_tema.html` ajustado a las 5 pestañas. El servidor de pruebas (`python -m http.server`)
  a veces da «Failed to fetch» en las secciones que piden los ~150 archivos del APP_SHELL a la vez: repetir el arnés
  antes de buscar un error.

## Niveles de acceso: visitante / usuario / administrador (FASE 1 implementada 2026-09-19)

- Decidido con el usuario: la app se abre SIN login. Un **visitante** (sin sesión, o con sesión de un correo fuera de la lista) solo tiene 3
  módulos: Ocupación de ductos, Conductores desnudos y Distancias de seguridad (marcados `libre: true` en `sectionMenus`, `nav.js`),
  y desde 2026-09-24 (3.17.0, pedido del usuario) también Pérdidas y Regulación: 5 en total;
  Varios y Funciones con IA no tienen ninguno (Codificación de entregables se quitó de los libres el 2026-09-19). El **usuario** (en `usuarios` con rol `usuario`) y el
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

## Ideas APLAZADAS por el usuario (2026-09-20; analizadas, NO implementar sin que las pida)

- **Plantilla de informe por agente** (memoria de cálculo): estructura + fuente de cada dato + formato Word; fases propuestas: Markdown por agente, campos con fuente (calculadora / usuario / IA), plantilla .docx corporativa. Pregunta abierta: ¿hay un formato de memoria de cálculo de Celsia?
- **Adjuntos en los chats de IA** (imágenes y PDF; foto de placa, ficha técnica): viable con Gemini; reducir imágenes, máx. 3, guardar solo el texto en el historial, y regla «transcribe lo que leíste y confirma antes de calcular».
- **Otro proveedor de IA (Claude de pago, con clave propia)**: viable con un traductor de formatos por proveedor; la clave de pago SIEMPRE personal (nunca la compartida del servidor); avisar del costo. Otras herramientas de IA posibles: barrido 2D, comparador, costo de pérdidas, consultar norma (requiere pasar las tablas de imagen a datos), ficha del caso.
- Además siguen pendientes: fase 2 del acceso (login Microsoft), «Solicitar acceso», gráficos de resultado y el «reporte de la IA» (`js/ai/reporte.js`, lo rediseña el usuario).
- **`docs/funcionalidades-futuras.md`** (2026-09-24): análisis de viabilidad (con investigación en internet) de Qse calculado con la posición del sol (Ampacidad aérea), conductor de continuidad de tierra GCC y ampliación de Ampacidad subterránea (enterrado directo, formación plana, un cable por ducto, aire/bandejas, cárcamos) con un motor nuevo por posiciones. El usuario eligió hacer primero A (Qse) y B1 (calibre del GCC por cortocircuito); lo demás queda aplazado. Leerlo antes de retomar cualquiera y actualizar su columna «Estado».

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

## Persistencia de navegación (`js/util/persistencia-calculo.js`)

- Patrón ya usado por las 7 calculadoras (2026-09-24, extendido por pedido del usuario tras preguntarle si convenía):
  un `Map()` en MEMORIA (no `localStorage`), indexado por ruta; el router (`js/router.js`) llama a la función
  `antesDeSalir` que devuelva `render()` justo antes de desmontar la vista. Sobrevive a navegar dentro de la SPA,
  NO a un recargue de página (es lo pedido). Antes de agregarlo a una vista nueva, revisar si el análisis sigue
  vigente: no tiene sentido en pantallas de configuración cuyos campos ya reflejan un ajuste guardado aparte
  (Perfil, Configuración de IA), solo en formularios «de una sola pasada» que el usuario puede llenar a medias.
- **Conversión de unidades y de coordenadas** (`js/views/conversion-unidades.js`, `conversion-coordenadas.js`):
  eran formularios «de cálculo de una vez» iguales en espíritu a las calculadoras pero sin ninguna protección;
  ahora usan el mismo patrón (rutas `/varios/conversion-unidades` y `/varios/conversion-coordenadas`). En
  coordenadas, restaurar el modo EPSG exige cuidado con el orden: el listener de `chk-todos` es async (carga
  proj4 y el catálogo con `await`); al restaurar se dispara su evento `change` y, ya que `dispatchEvent` no
  espera esa promesa, el código que sigue corre igual antes de que resuelva — por eso los valores de
  `f-epsg-origen`/`f-epsg-destino` guardados se escriben DESPUÉS de disparar el evento (si no, el propio
  handler los pisaría con el valor de la lista de 7 sistemas). `conversion-coordenadas.js` no era `async
  function render` y no hacía falta serlo: basta con devolver la función `antesDeSalir` al final.
- **Pantallas de IA (Asistente técnico y Corrector de redacción)**: NO se guarda cada campo como en un
  formulario — la conversación (mensajes, cálculos ejecutados) ya se auto-guarda en IndexedDB
  (`js/ai/historial.js`) tras cada turno completo, sin acción explícita del usuario; lo único que faltaba era
  que, al volver a la pantalla, no se retomaba sola (quedaba en blanco) y el texto sin enviar de la caja se
  perdía siempre. Se guardan solo DOS cosas por ruta (`/ia/analisis`, `/ia/redaccion`): el `id` de la
  conversación activa y el borrador de la caja de texto; al volver, si hay `convId` se reabre con
  `historial.obtener(id)` (la misma función que ya usaba el botón «Abrir» del historial: se extrajo a una
  función compartida `cargarConversacion(c, {desplazar})` para no duplicar la lógica — con `desplazar: true`
  solo en el clic explícito de «Abrir», nunca en la restauración automática, para no reintroducir el
  desplazamiento automático que el usuario ya había pedido quitar en 2026-09-21). Se investigó si hacía falta
  además un mecanismo para no perder la respuesta cuando el usuario navega fuera MIENTRAS la IA está
  generando: no hace falta uno nuevo — `historial.guardar(conv)` ya se llama sobre el objeto `conv` del cierre
  antiguo sin importar si el DOM sigue montado (manipular nodos DOM desprendidos no lanza error, solo no se ve),
  así que el turno igual queda guardado; lo único que faltaba era, justamente, la restauración automática ya
  agregada. **Aviso para quien pruebe esto**: `historial.obtener()`/`historial.guardar()` (IndexedDB) pueden
  QUEDARSE COLGADOS (promesa que nunca resuelve ni rechaza) en el Edge headless de este entorno si se
  `await`an directamente en un arnés de pruebas — es una limitación ya documentada del navegador de pruebas
  (ver `tools/verify_ia_pantallas.html`, «el conteo usa IndexedDB, que el navegador de pruebas no siempre da»):
  no usar eso como señal de un bug real. La restauración del borrador (sin IndexedDB) sí se verificó
  headless con éxito; la reapertura automática de la conversación se verificó por revisión de código (reutiliza
  exactamente la ruta de «Abrir», ya probada) y quedará confirmada a mano por el usuario.

## Convenciones de UI/CSS

- Iconos (`js/icons.js`): SVG inline propios, sin CDN (requisito de offline). El estilo
  visual replica Tabler Icons (outline, stroke-width 2 envuelto en `<g>` para los iconos
  "tablerizados"). Un mismo nombre de icono (`calculator`, `book`, `archive`, `grid`...)
  se reutiliza entre el sidebar (`js/nav.js`) y las tarjetas de Home (`js/views/inicio.js`)
  para que coincidan visualmente sin duplicar definiciones.
- `.content` (`css/app.css`) ya NO tiene `max-width`/centrado: ocupa todo el ancho
  disponible junto al sidebar en todas las vistas (se quitó el `max-width:1100px` el
  2026-09-17 porque dejaba un espacio vacío grande a la derecha en pantallas anchas).
- Todas las tarjetas de menú (Home y los submenús Cálculos/Catálogos/Normatividad/Funciones con IA/Varios)
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
- **Tabla partida: encabezado fijo + cuerpo con scroll (2026-09-24, idea del usuario mirando «Corriente de conductores NTC
  2050»)**: esa imagen es una tabla ancha con muchas filas; al hacer scroll para comparar una fila de abajo, el encabezado
  (calibre/metal/área/resistencia…) ya no se ve. Como es una sola imagen plana (no HTML), no hay forma de "congelar" filas
  de verdad — la solución es mostrar la MISMA imagen dos veces dentro de `.tabla-partida` (`js/views/normativa-imagen.js`,
  `montarTablaPartida`; CSS en `app.css`): arriba, `.tabla-partida__encabezado` con `overflow:hidden` y una altura en px
  calculada por JS (mide la imagen ENTERA renderizada — el `<img>` con `width:100%;height:auto` no se autorrecorta, así que
  su alto siempre es el de la imagen completa a ese ancho — y la recorta a una fracción); abajo, `.tabla-partida__cuerpo`
  con `overflow-y:auto` y alto fijo (420px), con un `<div class="tabla-partida__cuerpo-inner">` que lleva la MISMA imagen
  desplazada hacia arriba (`margin-top` negativo, igual a la altura del encabezado) para que el scroll arranque justo en
  la primera fila de datos. Como ambas copias tienen el mismo ancho, las columnas quedan alineadas sin sincronizar nada.
  Se recalcula en `resize` (debounced 120ms); el `render()` de esta vista ahora devuelve una función de limpieza (patrón
  `antesDeSalir` del router) que quita ese listener al salir de la pantalla. El campo `partida: {fraccion, altoCuerpo}` es
  OPCIONAL por opción en `TEMAS`: hoy solo lo tiene «Corriente de conductores NTC 2050» (`fraccion: 0.3`, medido en el
  archivo real con Python/Pillow: es la línea que separa la fila «AWG/kcmil…» de la primera fila de datos, a 30% de la
  altura total de la imagen — NO hay ninguna línea roja en el archivo, esa la dibujó el usuario a mano sobre una captura
  para explicar la idea); las demás tablas de Normatividad siguen como imagen simple. **El bug de la lightbox que el
  usuario anticipó NO ocurrió**: `data-lightbox` va en el contenedor `.tabla-partida` (no en cada `<img>` interno), y como
  el listener global de `js/app.js` es delegado (`e.target.closest("[data-lightbox]")`), tocar cualquiera de las dos partes
  (encabezado recortado o cuerpo con scroll) abre siempre la imagen COMPLETA en la lightbox. De paso se agregó `rutaImg()`
  en `normativa-imagen.js` (mismo patrón `window.__BASE_PATH__` que `format.js`/`katex.js`/`proj4.js`): antes esta vista
  nunca lo necesitaba porque ninguna prueba dependía de que la imagen cargara de verdad; las pruebas nuevas de la tabla
  partida sí miden el alto real de la imagen renderizada, así que hacía falta que cargara también en los arneses de
  `tools/` (servidos desde una ruta distinta a la raíz). Pruebas: sección nueva «Corriente NTC 2050: tabla partida» en
  `tools/verify_normatividad.html` (fracción recortada ≈30%, cuerpo con scroll y alto fijo, desplazamiento exacto, aviso
  visible, limpieza sin errores) y las secciones existentes de ese arnés se ajustaron a la nueva estructura.
  **Ajuste posterior, mismo día (3 problemas que el usuario encontró probándola)**: (1) el cuerpo con scroll perdía ancho
  frente al encabezado por la barra de scroll nativa (~15-17px en Windows sin touch), corriendo las columnas hacia la
  izquierda — se corrigió midiendo `cuerpo.offsetWidth - cuerpo.clientWidth` y aplicando ese mismo valor como
  `padding-right` al contenedor del encabezado (`encWrap`), que en `montarTablaPartida` ahora hace DOS pasadas: mide y
  aplica el recorte, mide la barra y aplica el padding, y vuelve a medir/aplicar una vez más (el padding-right reduce el
  ancho — y por tanto el alto, `height:auto` — de la imagen del encabezado, así que hay que recalcular con el ancho ya
  final). (2) Había un espacio visible entre encabezado y cuerpo (`margin-top`/`border-top` en `.tabla-partida__cuerpo`,
  CSS) que rompía la ilusión de una sola tabla continua: se quitaron los dos, quedan pegados. (3) Al llegar al final del
  scroll, las últimas filas se quedaban varadas a medio viewport (rodeadas de fondo oscuro abajo) sin poder subir hasta
  quedar pegadas al encabezado — el usuario lo pidió así explícitamente («que también se quiere») y sugirió agregar
  espacio en blanco al final; se agregó un `filaFraccion` nuevo a `partida` (alto de UNA fila de datos como fracción de
  la imagen, medido igual que `fraccion`: se detectaron las líneas horizontales reales de la zona de datos con Python/
  Pillow, promedio ~57.8px de 2177px = 0.0266) y `cuerpoInner` gana `padding-bottom: altoCuerpo - alturaFila` (no
  `altoCuerpo` completo: eso sobrepasaba y dejaba la pantalla TOTALMENTE en blanco al hacer scroll hasta el fondo, un
  primer intento descartado tras verificarlo visualmente) — así el scroll máximo deja la ÚLTIMA fila pegada arriba del
  cuerpo (junto al encabezado) con el resto del viewport en blanco debajo, en vez de cortarse a medio camino o pasarse a
  vacío. Pruebas nuevas en la misma sección de `verify_normatividad.html`: compensación exacta del padding-right, mismo
  ancho/posición horizontal de las dos imágenes, cero separación entre encabezado y cuerpo, y la posición exacta de la
  última fila tras `cuerpo.scrollTop = cuerpo.scrollHeight` (58/58 pruebas en total).
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
  del menú (`sidebarLinks` en `js/nav.js`) es Cálculos, Catálogos, Normatividad, Funciones con IA,
  Varios, Ayuda; el Home y Ayuda siguen el mismo orden.
- Las pantallas NO llevan descripción bajo el título (decidido el 2026-09-18: ya la dicen las
  tarjetas de menú); no volver a agregarla, ni tampoco el texto de bienvenida del Home (también
  retirado). `.page-subtitle` solo se usa en el "objeto" de la resolución
  (`detalle-resolucion.js`, es un dato). `.page-title`
  ya trae el margen inferior de una pantalla sin descripción. `sectionMeta.*.subtitle` (`nav.js`)
  se conserva porque la pantalla Ayuda lo muestra en la tarjeta de cada sección.
- Pantalla Ayuda (2026-09-22, pedido del usuario): cada enlace ya NO repite `item.desc` de `sectionMenus` (frase corta de
  las tarjetas de menú); lleva su propia descripción de 2-3 renglones (qué hace y para qué sirve), en
  `AYUDA_DESCRIPCIONES` (`js/views/ayuda.js`, mapa por `hash`) como párrafo `.ayuda-desc` debajo del enlace. Al agregar un
  ítem nuevo a `sectionMenus` (`nav.js`), agregar también su entrada larga en `AYUDA_DESCRIPCIONES` (si falta, cae de
  vuelta a `item.desc`).
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
