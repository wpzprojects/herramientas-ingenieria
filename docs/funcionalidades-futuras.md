# Funcionalidades futuras — análisis de viabilidad

Registro de ideas de funcionalidades ya analizadas, para no perderlas. Cada una indica su estado, lo que
implicaría y los riesgos. Antes de retomar una, leer su sección completa.

| # | Funcionalidad | Pantalla | Viabilidad | Esfuerzo | Estado |
|---|---|---|---|---|---|
| A | Qse calculado con la posición del sol | Ampacidad aérea | Alta | Bajo | **Hecho** (3.21.0, 2026-09-24) |
| B1 | Calibre del conductor de continuidad de tierra (GCC) por cortocircuito | Ampacidad subterránea | Alta | Bajo | **Hecho** (3.21.0, 2026-09-24) |
| B2 | Tensión en la pantalla durante una falla, según la posición del GCC | Ampacidad subterránea | Media | Medio-alto | Aplazada |
| B3 | Pérdidas por corriente inducida en el GCC y su transposición | Ampacidad subterránea | Baja | Alto | Aplazada |
| C1 | Cables directamente enterrados (trébol y plano) | Ampacidad subterránea | Alta | Medio | Aplazada |
| C2 | Formación plana y un cable por ducto | Ampacidad subterránea | Alta | Medio-alto | Aplazada |
| C3 | Cables al aire y en bandejas | Ampacidad subterránea | Alta | Medio | Aplazada |
| C4 | Cables en cárcamos (rellenos o vacíos) | Ampacidad subterránea | Media | Bajo, una vez exista C3 | Aplazada |

Análisis hecho el 2026-09-24 con investigación en internet (fuentes al final), sin tocar código.

---

## A. Qse calculado a partir de la fecha y la ubicación (Ampacidad aérea)

**Hoy:** Qse (radiación solar total, W/m²) y θ (ángulo efectivo de incidencia) se escriben a mano. La nota de
Fórmulas dice que el cálculo de la posición del sol «no está implementado».

**Qué dice IEEE 738** (fórmulas cerradas, sin iteraciones):

- Declinación solar: δ = 23.46 · sin[(284 + N) / 365 · 360°], con N el día del año.
- Ángulo horario: ω = (hora solar − 12) · 15°.
- Altura del sol: Hc = asin[cos(Lat) · cos δ · cos ω + sin(Lat) · sin δ].
- Azimut del sol: χ = sin ω / [sin(Lat) · cos ω − cos(Lat) · tan δ]; Zc = C + arctan(χ), donde la constante C
  depende del cuadrante (ω y χ). Es el punto donde más se equivocan las implementaciones.
- Qs (W/m², a nivel del mar) = polinomio de grado 6 en Hc, con coeficientes distintos para atmósfera clara o
  industrial.
- Corrección por elevación: Ksolar = 1 + 1.148·10⁻⁴·He − 1.108·10⁻⁸·He² (He en m); Qse = Ksolar · Qs.
- Ángulo de incidencia: θ = acos[cos Hc · cos(Zc − Zl)], con Zl el azimut de la línea.
- Si Hc ≤ 0 (de noche), Qs = 0.

**Cómo encajaría:** una casilla «Calcular con la posición del sol» en la tarjeta «Radiación solar y
superficie». Pediría latitud, fecha, hora solar, azimut de la línea y tipo de atmósfera. La elevación ya existe
en la pantalla. Con la casilla marcada, Qse y θ se llenan solos y quedan bloqueados, igual que los campos
«Catálogo»/«Manual». La lógica iría en un módulo nuevo (p. ej. `js/calc/posicion-solar.js`) y el motor
`js/calc/ampacidad-aerea.js` no cambiaría: sigue recibiendo Qse y θ.

**Particularidades de Colombia:**

- La latitud va de unos −4° a 12°. A mediodía el sol está casi en el cenit, así que θ ≈ 90° sin importar la
  dirección de la línea.
- La elevación pesa mucho: en Bogotá (≈ 2600 m) Ksolar ≈ 1.22, o sea un 22 % más de radiación que a nivel del mar.
- Para diseñar interesa el peor caso: el máximo al mediodía solar para esa latitud a lo largo del año. Se podría
  ofrecer como opción («día más desfavorable»).

**Riesgos:**

- La hora solar no es la hora legal. La diferencia en Colombia es de ±20 min por la longitud y la ecuación del
  tiempo. Basta con pedir «hora solar» y explicarlo con un botón «i».
- El modelo no considera nubes, así que el resultado queda del lado conservador.
- La constante C del azimut tiene varios casos y hay que probarlos todos.

**Validación:** el ejemplo del anexo de IEEE 738 y dos implementaciones abiertas (repositorio IEEE_738 en GitHub
y la de MATLAB File Exchange).

---

## B. Conductor de continuidad de tierra (Ampacidad subterránea)

IEEE 575 lo llama *ground continuity conductor* (GCC); en la norma británica e IEC se llama *earth continuity
conductor* (ECC). IEEE 575-2014 lo exige en la puesta a tierra **unipuntual**: debe ir en paralelo con el
circuito, aterrizado en ambos extremos y lo bastante cerca de los cables para limitar la tensión de las
pantallas durante una falla monofásica. En «Ambos extremos» las mismas pantallas hacen de retorno y no se
necesita. En cross-bonding las pantallas forman un camino continuo entre las puestas a tierra de las secciones
mayores y el GCC no suele ser obligatorio, aunque a veces se instala.

### B1. Calibre por cortocircuito — hecho (3.21.0)

- Fórmula adiabática, la misma de la calculadora de Cortocircuito: A = I · √t / k (despejada del motor
  `js/calc/cortocircuito.js`, sin tocarlo).
- Datos: corriente de falla que regresa por el GCC (el supuesto conservador es toda la corriente de falla
  monofásica), tiempo de despeje, material, y temperaturas inicial y final.
- Resultado: área mínima y calibre comercial sugerido. No cambia la ampacidad del circuito.

### B2. Tensión en la pantalla durante la falla — aplazada

- Depende de dónde va el GCC respecto a las fases. Sirve para elegir los limitadores de tensión de pantalla (SVL).
- Método: matrices de impedancia propia y mutua (anexos D a F de IEEE 575). Pide la geometría del GCC.

### B3. Pérdidas por corriente inducida en el GCC y su transposición — aplazada

- En formación plana el GCC debe transponerse (a mitad de cada sección) para no llevar corriente circulante.
- Un estudio de 2024 (Aalborg, *Electric Power Systems Research*) encontró que en trébol, con el GCC en el centro
  de los tres cables, la corriente inducida es mínima y no hace falta transponerlo. Eso contradice en parte
  IEEE 575 y CIGRE 531.

---

## C. Ampliar Ampacidad subterránea

### Lo que hace hoy el motor

`js/calc/ampacidad-subterranea.js` es una transcripción literal de Power Apps, con simplificaciones importantes:

- Siempre asume un ducto por circuito con los 3 cables adentro.
- λ1 (pérdidas en la pantalla) vale fijo 0.02 con unipuntual o cross-bonding (IEC tiene fórmulas para las
  pérdidas por corrientes de Foucault).
- Usa la reactancia del trébol (ln(2s/d)) para cualquier formación; el propio encabezado del archivo lo advierte.
- T4 se calcula con el diámetro del cable, no el del ducto, y con una sola resistencia térmica del ducto (U).
- CLAUDE.md dice que ese motor no se toca.

### Recomendación de arquitectura

No se trata de agregar casos al motor actual, sino de hacer un **motor nuevo por posiciones** (p. ej.
`js/calc/ampacidad-subterranea-iec.js`):

- Cada cable tiene su coordenada (x, y).
- Se calculan las pérdidas de cada cable (λ1 propio) y el calentamiento mutuo entre todos (imágenes de Kennelly).
- La ampacidad la fija el cable más caliente.

Con eso, trébol, plano, un cable por ducto, varios circuitos y enterrado directo son el mismo cálculo con
distinta geometría. En pantalla no se pedirían coordenadas: se ofrecerían formaciones predefinidas (trébol,
plana con separación X, banco de ductos con un cable por ducto) y el código generaría las posiciones.

### C1. Enterrado directo (trébol y plano)

- T4 = ρ / 2π · ln(u + √(u² − 1)), con u = 2L / De, más el calentamiento mutuo de los demás cables. No hay
  términos de ducto.
- IEC 60287-2-1 trae además fórmulas cerradas para tres cables tocándose, en trébol y en plano.
- Opcional después: secado del suelo (modelo de dos zonas de IEC 60287-2-1).
- Es la base del motor nuevo.

### C2. Formación plana y un cable por ducto

- λ1 distinto para cada cable en plano (el del centro y los de los extremos). IEC da las fórmulas con P y Q para
  plano sin transponer y la reactancia de plano transpuesto, ln(2·∛2·s/d).
- Pérdidas por corrientes de Foucault (λ1'') distintas para el cable del centro y los de los extremos.
- Efecto de proximidad con s = √(s1·s2) si las separaciones son desiguales.
- T4 del ducto en tres partes: T4' (aire dentro del ducto, con las constantes U, V, Y del material), T4'' (pared
  del ducto) y T4''' (suelo, con Kennelly).

### C3. Cables al aire y en bandejas

- Es otra física: T4 en aire es iterativo (coeficiente h = Z / De^g + E, con constantes por disposición: un cable,
  trébol, plano tocándose, contra la pared, etc.).
- La radiación solar es opcional (IEC sugiere H = 1000 W/m² y una absortividad según la chaqueta).
- Los grupos de cables en bandeja van por IEC 60287-2-2 o por los factores de NTC 2050 (secciones 310.60 y
  392.80, cables de media tensión en bandeja).
- Hay casos de cables al aire en CIGRE TB 880 para validar.

### C4. Cárcamos

- **Relleno de arena:** se calcula como enterrado directo, con la resistividad del relleno.
- **Vacío con tapa a nivel del piso:** IEC 60287-2-1 lo trata como cable al aire, subiendo la temperatura
  ambiente en Δθ = W_total / (3·p), donde W_total es la potencia disipada en el cárcamo por metro y p es el
  perímetro efectivo (paredes y fondo).
- Es un método empírico; hay estudios académicos que cuestionan su exactitud (NYU). Depende de C3.

### Orden sugerido

1. Enterrado directo (trébol y plano), validado contra CIGRE TB 880. La formación plana sale casi gratis aquí.
2. Un cable por ducto.
3. Aire y bandejas.
4. Cárcamos (el vacío depende del modelo de aire).
5. Más adelante: secado del suelo, λ1 completo de IEC y B2.

Bandejas y cárcamos no deberían ir en la primera etapa porque usan el modelo de cable al aire, que es otra física.

### Riesgos y decisiones pendientes

- **Hace falta la norma real.** Las tablas de constantes (Z, E, g del aire; U, V, Y de los ductos; secado del
  suelo) hay que copiarlas de IEC 60287-2-1:2023, no de fuentes secundarias. Conviene que la empresa tenga la norma.
- **Hace falta una validación externa.** Las pruebas de hoy comparan contra un cálculo escrito aparte por
  nosotros mismos. CIGRE TB 880 (2022) trae casos resueltos precisamente para verificar programas de ampacidad;
  hay una réplica pública en GitHub y Cableizer también los publica. Puede que Celsia tenga acceso por ser
  miembro de CIGRE.
- **Formulario más grande.** Habría que agregar un selector de instalación y de formación, y mostrar solo los
  campos que apliquen.
- **Decisión:** si el motor nuevo reemplaza al actual o conviven. Si lo reemplaza, los resultados de ducto en
  trébol cambiarán un poco porque se corrigen las simplificaciones.
- **Decisión:** si la herramienta de la IA (`calcular_ampacidad_subterranea`) se amplía también.

---

## Fuentes

- IEEE 738 (implementaciones abiertas): https://github.com/BenHutchinsWPP/IEEE_738 ·
  https://www.mathworks.com/matlabcentral/fileexchange/96494-ieee-std-738-calculation-of-current-temperature-relationship
- GCC/ECC e IEEE 575: https://www.eng-tips.com/threads/is-it-necessary-to-provide-ecc-earth-continuity-conductor-for-single-point-mid-point-bonding.485037/ ·
  https://elek.com/articles/earthing-fault-current-distribution-for-hv-cables/ ·
  https://www.cableizer.com/blog/post/induced-voltage-on-single-system-ind/
- Ubicación del GCC (2024): https://vbn.aau.dk/en/publications/earth-continuity-conductor-location-in-single-circuit-underground/
- IEC 60287-2-1:2023: https://webstore.iec.ch/en/publication/68134 ·
  https://www.cableizer.com/blog/post/iec-60287-2-calculation-thermal-resistances-electric-cables/ ·
  https://www.cableizer.com/documentation/inst_air/
- Cárcamos vacíos: https://research.engineering.nyu.edu/power/sites/engineering.nyu.edu.power/files/uploads/Thermal%20Analysis%20of%20Cables%20in%20Unfilled%20Troughs%20-%20Investigation%20of%20the%20IEC%20Standard%20and%20a%20Methodical%20Approach%20for%20Cable%20Rating.pdf
- CIGRE TB 880: https://www.e-cigre.org/publications/detail/880-power-cable-rating-examples-for-calculation-tool-verification.html ·
  https://github.com/frdmendoza/cbl_CIGRE_TB880 · https://www.cableizer.com/tb880/
