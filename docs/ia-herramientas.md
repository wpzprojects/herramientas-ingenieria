# Cómo usa la IA las calculadoras (herramientas, agentes y filtro)

Guía de la pantalla **Funciones de IA → Análisis con calculadoras**. Explica qué pasa desde que el usuario escribe hasta que aparece la respuesta, cómo se "presenta" cada calculadora a la IA, cómo se decide qué puede usar cada agente y qué hacer para agregar una herramienta nueva. Estado a 2026-09-19.

## 1. La idea en una frase

**La IA nunca calcula.** Gemini solo decide *qué herramienta usar y con qué datos*; los números salen de los mismos motores (`js/calc/*.js`) y catálogos (`data/*.json`) que usan las pantallas de Cálculos. La IA después interpreta esos resultados y redacta.

Esto se llama *function calling*: la app le describe a Gemini un conjunto de funciones, Gemini responde "quiero llamar a `calcular_perdidas` con estos datos", la app la ejecuta y le devuelve el resultado.

## 2. Recorrido de una pregunta

```
Usuario escribe            js/views/ia-analisis.js   enviar()
        │
        ▼
ejecutarTurno              js/ai/analisis.js          bucle de rondas (máx. 8 por pregunta)
        │  envía: prompt del agente + historial + herramientas permitidas
        ▼
Gemini                     js/ai/gemini.js            generar()
        │
        ├── responde texto ─────────────────────────► fin: se muestra la respuesta
        │
        └── pide llamar herramientas (una o varias a la vez)
                 │
                 ▼
        ejecutarLlamada    js/ai/tools.js
          1. ¿está habilitada para este agente?  (si no: error)
          2. normalizar(): valida tipos, rangos, obligatorios, valores por defecto
          3. calcular(): traduce los datos y llama al motor de js/calc/
          4. guarda una "corrida" en ctx.log (entradas, supuestos, resultados)
          5. devuelve a Gemini { ok, resultados, supuestos, notas }
                 │
                 └── vuelta al paso de Gemini con los resultados
```

Detalles que importan:

- **Errores que la IA puede corregir.** Si los datos son inválidos, `ejecutarLlamada` **no lanza excepción**: devuelve `{ ok:false, error }` con un mensaje claro (qué falta, qué rango se permite, qué opciones existen) y Gemini reintenta con datos corregidos.
- **Límites por pregunta** (Funciones de IA → Configuración): `maxRondas` (idas y vueltas con Gemini, por defecto 8) y `maxCalculos` (cálculos individuales, por defecto 60). Un barrido de 10 puntos gasta 10. Si se agotan las rondas, se le pide un cierre sin más herramientas.
- **Progreso en pantalla.** `ejecutarTurno` emite eventos (`herramienta` al empezar, `herramienta-fin` con `ok` al terminar) y la vista dibuja las etiquetas `⚙ Regulación…` → `✓ Regulación`. Los títulos salen del campo `titulo` de cada herramienta.
- **Las tablas no las escribe la IA.** La sección "Cálculos ejecutados" y el reporte se dibujan con las *corridas* de `ctx.log` (`js/ai/reporte.js`). La IA solo aporta la narrativa. Por eso la IA no repite las tablas completas (regla 7 del prompt).

## 3. La "ficha" de una herramienta (`js/ai/tools.js`)

No hay archivo de configuración aparte: cada herramienta es un objeto JavaScript en `tools.js`. Tiene cuatro partes:

| Parte | Para qué sirve |
|---|---|
| `nombre`, `titulo`, `descripcion` | Lo que Gemini lee para decidir si la usa (`descripcion`) y la etiqueta que ve el usuario (`titulo`). |
| `campos` | Los parámetros que Gemini puede enviar. De aquí se generan **el esquema que recibe Gemini** (`esquemaDe`) y **la validación de lo que devuelva** (`normalizar`). |
| `calcular(v, extra)` | El puente al motor: traduce los nombres de la IA a los del motor, busca en catálogos, aplica valores por defecto y llama a `js/calc/`. |
| Resultados | Lista de `res(clave, etiqueta, valor, unidad, decimales)` que devuelve `calcular`. Sus etiquetas salen en las tablas y las lee la IA. |

Ejemplo (resumido; la real es `T_OCUPACION`):

```js
const T_OCUPACION = {
  nombre: "calcular_ocupacion_ductos",
  tipo: "calculo",
  titulo: "Ocupación de ductos",
  descripcion: "Calcula el % de ocupación de un ducto … El diámetro interno sale del catálogo o se ingresa con diametro_tubo_mm.",
  campos: [
    I("numero_conductores", "Número de conductores dentro del ducto", { e: "Número de conductores", req: true, min: 1, max: 9 }),
    N("diametro_conductor_mm", "Diámetro exterior de cada conductor", { u: "mm", req: true, min: 0, minExcl: true }),
    S("tipo_tuberia", "Tipo de tubería del catálogo …", { oculto: true }),
  ],
  async calcular(v, extra) {
    // … buscar el ducto en el catálogo, llamar a calcularOcupacionDuctos(...) …
    return [res("ocupacion_pct", "Ocupación", r.porcentaje, "%"), /* … */];
  },
};
```

**Campos.** Se crean con `N` (número), `I` (entero) y `S` (texto). Opciones: `req` (obligatorio), `min`/`max`/`minExcl`, `defecto`, `enum` (lista cerrada de valores), `u` (unidad), `e` (etiqueta corta para tablas; si falta se usa la descripción) y `oculto` (no se muestra como entrada en las tablas; se usa cuando `calcular` registra la entrada por su cuenta). Un valor con coma decimal ("0,5") se acepta; un parámetro desconocido se ignora y queda anotado; un `enum` se compara sin distinguir mayúsculas ni tildes.

**Qué registra `calcular`.** `extra.entradas` (datos usados que no venían tal cual del usuario, p. ej. la resistencia tomada del catálogo), `extra.supuestos` (valores por defecto o decisiones) y `extra.notas` (advertencias, p. ej. "los valores parecen grados"). Todo eso queda en la corrida y se ve en pantalla y en el reporte.

**Tipos de herramienta** (`tipo`):
- `calculo`: ejecuta un motor y registra una corrida (gasta 1 del presupuesto de cálculos).
- `consulta`: lee un catálogo y devuelve filas (no calcula ni gasta presupuesto). `buscar_conductor`, `buscar_tuberia`.
- `barrido`: ejecuta una calculadora varias veces variando UN parámetro (hasta 40 puntos). Solo ofrece las calculadoras de `CALCULADORAS` (las 6 de Cálculos).

**Marcas opcionales de la ficha:** `opcional: true` (no forma parte del agente estándar), `grupo` (dónde aparece la casilla en Agentes; por defecto se deduce del tipo) y, en los resultados, `cifras` (cuántas cifras significativas recibe la IA).

**Precisión hacia la IA.** Los números que recibe Gemini se redondean a **6 cifras significativas** (`redondear`). Para coordenadas y conversiones se usan 12 (`cifras`), porque con 6 un Este de 4 881 143 m quedaría con metros de error. La tabla que ve el usuario usa el valor completo.

**Campos con lista de objetos (2026-09-19).** Un campo puede ser una lista de objetos declarando `itemCampos` (los campos de cada elemento; `esquemaDe` lo convierte en un esquema anidado para Gemini y `normalizar` valida cada elemento, con errores del tipo `tramos[2]: "longitud_km" debe ser…`). Lo usan `tramos` (pérdidas y regulación), `grupos` (ocupación) y `puntos` (coordenadas). Regla común: lo que un tramo no indica se toma del nivel superior (así una línea de 3 tramos con el mismo conductor solo repite las longitudes). Helpers en `tools.js`: `campoTramos`, `listaTramos`, `volcarTramo` (antepone «Tramo N —» a entradas y notas), `datoPartida`. Los campos de nivel superior se conservan para el caso de un solo tramo/tipo/punto, de modo que las llamadas antiguas y `barrer_parametro` siguen funcionando.

## 4. Herramientas actuales (11)

| Herramienta | Tipo | Grupo en Agentes | Agente estándar |
|---|---|---|---|
| `calcular_perdidas`, `calcular_regulacion`, `calcular_cortocircuito`, `calcular_ampacidad_aerea`, `calcular_ampacidad_subterranea`, `calcular_ocupacion_ductos` | calculo | Calculadoras | Sí |
| `buscar_conductor`, `buscar_tuberia` | consulta | Catálogos | Sí |
| `barrer_parametro` | barrido | Análisis | Sí |
| `convertir_unidades`, `convertir_coordenadas` | calculo | Varios | **No** (opcionales) |

Las de Varios no entran en el barrido de parámetros.

**Qué acepta y qué devuelve cada una (además de lo básico).** Todas quedaron alineadas con las pantallas rediseñadas; los motores de `js/calc/` no cambiaron, se reutilizan los módulos de lógica de las pantallas:

| Herramienta | Entradas nuevas | Resultados nuevos |
|---|---|---|
| `calcular_perdidas` | dato de partida `potencia_mw` / `potencia_mva` / `corriente_a` (exactamente uno), `conductores_por_fase`, `tramos` | `perdidas_mw`, `potencia_activa_mw` (si el dato no es MW), `tramoN_*`, `clasificacion` (Óptimo / Aceptable / Elevado) y nota con las referencias 1 % / 3 % |
| `calcular_regulacion` | lo mismo, más `separacion_haz_m`, `rmg_m` y distancias por tramo | `tramoN_*`, `resistencia_efectiva_ohm_km` y `rmg_efectivo_mm` (haz), `clasificacion` (referencias 5 % / 10 %) |
| `calcular_cortocircuito` | `corriente_falla_ka` (opcional) | `cumple_corriente`, `margen_ka`, `area_minima_mm2`, `calibre_sugerido` (+ área y capacidad) |
| `calcular_ampacidad_subterranea` | — | monopolar: `reactancia_mutua_ohm_m`, `resistencia_pantalla_ohm_m` y `corriente_circulante_pantalla_a` (Ambos Extremos) o `tension_inducida_pantalla_v_km` (Unipuntual / Cross-bonding) |
| `calcular_ocupacion_ductos` | `grupos` (varios tipos; diámetro manual o catálogo XLPE con `material` + `calibre` y filtros opcionales) | `radio_curvatura_mm` (12D), `total_conductores`, `area_total_mm2`, `grupoN_*` |
| `convertir_unidades` | catálogo `data/unidades.json` (19 categorías, cualquier unidad a cualquier otra; se reconoce símbolo, código o nombre); categoría `Calibre` (AWG/kcmil ↔ mm²) con el parámetro `calibre` | — |
| `convertir_coordenadas` | cualquiera de los ~509 códigos EPSG (ya no es un enum de 7), `puntos` (hasta 50) | `puntoN_*`; notas de área de uso y de datum |

**Referencias de diseño.** Óptimo / Aceptable / Elevado NO son límites normativos (el prompt estándar lo dice y la nota de cada resultado lo repite): nunca «fuera de norma».

## 5. Agentes y filtro de herramientas (`js/ai/agentes-analisis.js`)

Un **agente** es: nombre, descripción, prompt de sistema (`instrucciones`), instrucciones del reporte, temperatura opcional y **lista de herramientas que puede usar**. Se administra con el botón **Agentes** de la pantalla.

- **Agente estándar:** sale del código (`SISTEMA_ANALISIS` y `PROMPT_REPORTE` en `analisis.js`), es de solo lectura y nunca se escribe en `localStorage`. Si cambia el prompt estándar, se actualiza solo. Se puede ver y duplicar.
- **Agentes propios:** se guardan en `localStorage` (`ia.agentesAnalisis`; el activo en `ia.agenteAnalisisActivo`). A su prompt la app siempre le agrega al final `REGLA_FIJA` (no calcular; todo número sale de una herramienta).
- **Agente guardado sin lista de herramientas** (de antes de existir el campo): usa las del estándar.

**El filtro es de código, no solo de prompt.** Hay tres capas:

1. `declaraciones(permitidas)` (`tools.js`): a Gemini solo se le describen las herramientas del agente. El barrido solo ofrece las calculadoras permitidas y desaparece si no hay ninguna.
2. `ejecutarLlamada` con `ctx.permitidas`: si Gemini pide una herramienta no habilitada, se rechaza con "no está habilitada para este agente" y no se ejecuta nada.
3. Imports: `tools.js` importa únicamente los motores que expone. Lo que no está ahí no es alcanzable.

**Refuerzo por prompt (regla 10 del estándar):** si piden algo para lo que no hay herramienta, la IA no debe escribir ningún valor y debe remitir a Agentes. Es una instrucción al modelo: reduce el riesgo pero no lo elimina. Las tres capas anteriores garantizan que una herramienta no habilitada **nunca se ejecuta**, pero no impiden que el modelo escriba en su texto un número inventado; por eso existe esta regla y por eso conviene revisar la etiqueta `✓` de la herramienta y la sección "Cálculos ejecutados" cuando importe que un número provenga de un cálculo.

Si las instrucciones de un agente nombran una herramienta que desmarcó, la IA dirá que no la tiene (el formulario lo avisa).

## 6. Cómo agregar una herramienta nueva

**No es automático, y es a propósito:** hay que decidir con cuidado qué datos recibe, con qué rangos y cómo se interpreta cada resultado. Si no se registra, la calculadora sigue funcionando en la app; la IA simplemente no la conoce.

1. **Motor:** tiene que existir como módulo puro en `js/calc/` (sin DOM), importable desde `tools.js`.
2. **Ficha:** escribirla en `tools.js` (sección de calculadoras, o de "varios"): `nombre` (`calcular_…` o `convertir_…`), `titulo`, `descripcion` (qué hace, qué datos pide y qué devuelve, pensando en que la lee un modelo), `campos` y `calcular`. Replicar lo que hace la vista antes de llamar al motor (catálogos, valores por defecto). Lo que no venga del usuario, registrarlo como *supuesto*.
3. **Rangos y errores:** lanzar `ErrorHerramienta` con mensajes que digan qué corregir y qué opciones existen.
4. **Dónde registrarla:** en la lista `CALCULADORAS` (entra al barrido) o en `VARIOS`/registro propio (no entra al barrido). Añadirla a `REGISTRO`.
5. **Estándar u opcional:** por defecto márcala `opcional: true` (y `grupo` si no es de cálculo/catálogo). Solo se quita esa marca si se decide que el agente estándar la use. En ese caso revisar también el prompt estándar.
6. **Cifras:** si sus resultados tienen magnitudes grandes con precisión importante (coordenadas, etc.), usar `cifras`.
7. **Pruebas:** agregar casos en `tools/verify_ia.html` contra el motor o una fuente independiente. Actualizar los conteos de herramientas que ya están en las pruebas.
8. **Publicación:** subir `CACHE_VERSION` en `sw.js` y actualizar la documentación (este archivo, README y CLAUDE.md).

Si se cambia la **firma de un motor** existente, hay que actualizar su ficha en `tools.js` y correr `verify_ia.html`.

## 7. Pruebas

`tools/verify_ia.html` es un arnés en el navegador (sin clave ni internet; Gemini simulado). Desde la raíz del proyecto:

```
python -m http.server 8000
# abrir http://localhost:8000/tools/verify_ia.html  → lista PASS/FAIL
```

Secciones relacionadas con este tema: *tools: esquema para Gemini*, *tools: Varios*, *tools: herramientas permitidas por agente*, *analisis: bucle con herramientas* y *agentes de análisis*. `tools/verify_coordenadas.py` valida la conversión de coordenadas con una implementación independiente en Python.

## 8. Límites y cosas a recordar

- **Prompt ≠ garantía.** Las reglas del prompt orientan a la IA, pero no impiden que escriba números sin herramienta. Por eso el filtro y el reporte no dependen de lo que la IA diga: los valores de las tablas salen de las corridas.
- **Coordenadas por EPSG:** entre los 7 sistemas de siempre se usa el motor original; con cualquier otro código se usa proj4 (carga perezosa) y entre datums distintos la exactitud es del orden de metros (la herramienta lo avisa en las notas).
- **Longitud/latitud intercambiadas** dentro de rango (p. ej. 4.7 y −74.07) no se detectan; los nombres de los parámetros (`este_o_longitud`, `norte_o_latitud`) y la descripción reducen el riesgo.
- **Formato numérico en las respuestas de la IA:** no está normalizado; la IA puede escribir miles con coma o con punto. La app muestra los números con punto decimal y sin separador de miles.
- **No fijar nombres de modelo en el código:** se listan desde la API en Configuración.
- **Las fórmulas replican la app original** (Power Apps); algunas decisiones son intencionales (ver la sección "Decisiones de migración" del README).
- **La clave de Gemini** es del propio usuario (guardada en su navegador) o, si el administrador la configuró, viene del servidor y solo vive en memoria. Ver README, "Acceso con Google y Firebase".

## 9. Dónde está cada cosa

| Archivo | Contenido |
|---|---|
| `js/ai/tools.js` | Fichas de las herramientas, esquema para Gemini, validación, ejecución, filtro por agente. |
| `js/ai/analisis.js` | Bucle de conversación con Gemini, prompt estándar (`SISTEMA_ANALISIS`) y del reporte (`PROMPT_REPORTE`). |
| `js/ai/agentes-analisis.js` | Agentes: estándar, propios, herramientas por agente, `REGLA_FIJA`. |
| `js/ai/gemini.js` | Cliente REST de Gemini. |
| `js/ai/reporte.js` | Tablas de "Cálculos ejecutados" y reporte a partir de las corridas. |
| `js/ai/historial.js` | Conversaciones guardadas (IndexedDB), incluidas sus corridas. |
| `js/views/ia-analisis.js` | Pantalla: chat, etiquetas de progreso, formulario de agentes. |
| `js/calc/*.js` | Motores de cálculo (los que ejecutan las herramientas). |
| `tools/verify_ia.html` | Pruebas del módulo de IA. |
