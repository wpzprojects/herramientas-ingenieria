# Optimización del consumo de tokens de la IA — guía para más adelante

Estado: **analizado el 2026-09-26, NO implementado** (decisión del usuario: por ahora el riesgo de afectar el buen
funcionamiento actual no vale la pena). Esta guía deja el diagnóstico, las opciones, los requisitos y el procedimiento
para hacerlo sin romper nada cuando se decida retomarlo.

## 1. Diagnóstico (medido en la versión 3.36)

Desde la versión 3.36.0 la app muestra los tokens de cada respuesta y el total de la conversación (`js/ai/uso.js`; el
dato viene en la misma respuesta de la IA, sin llamadas adicionales). Una pregunta sencilla («compara las pérdidas de
una línea») consumió unos **29 k tokens**. La causa:

| Qué se envía en CADA llamada a la IA | Tamaño medido | Tokens aprox. |
|---|---|---|
| Instrucciones del agente estándar (`SISTEMA_ANALISIS`) | 4 500 caracteres | ~1 300 |
| Instrucciones del agente riguroso (`SISTEMA_RIGUROSO`) | 5 600 caracteres | ~1 600 |
| Manual de las 11 herramientas del agente estándar (`declaraciones(HERRAMIENTAS_ESTANDAR)`) | 38 300 caracteres | ~10 500 |
| Manual de las 17 herramientas (agente riguroso, `HERRAMIENTAS_TODAS`) | 54 000 caracteres | ~15 000 |
| **Paquete fijo por llamada (agente estándar)** | | **~12 000** |

Herramientas más pesadas del agente estándar (caracteres de su declaración):
`valorar_alternativas` 11 900 (31 % del total) · `calcular_regulacion` 5 100 · `calcular_conductor_economico` 4 300 ·
`calcular_perdidas` 4 000 · `calcular_ocupacion_ductos` 3 300 · `calcular_ampacidad_subterranea` 2 700.

Una pregunta con calculadoras usa **al menos 2 llamadas** (1: la IA pide los cálculos; 2: con los resultados, redacta),
y el paquete fijo va completo en cada una: 2 × 12 000 ≈ 24 000, más la pregunta, los resultados, el historial y la
respuesta ≈ 29 000. **Cerca del 80 % del consumo es el manual de herramientas repetido.** En una conversación larga se
suma además todo el historial, que se reenvía en cada pregunta.

Es un valor normal para un asistente con herramientas (el costo fijo domina), pero del lado pesado: 11 herramientas con
descripciones muy detalladas.

**Límites:** las APIs NO informan el saldo del plan (solo límites por minuto; Gemini avisa al llegar al límite con un
error de cuota). En el plan gratuito de Gemini el límite que más se nota suele ser el de **peticiones por día**, y cada
pregunta gasta 2 o más; los límites exactos cambian y se ven en la consola del proveedor.

## 2. Opciones evaluadas

| # | Opción | Ahorro | Riesgo para el funcionamiento | Veredicto (2026-09-26) |
|---|---|---|---|---|
| 1 | **Caché del paquete fijo** (implícita en Gemini 2.5 y OpenAI; explícita con `cache_control` en Anthropic) | Abarata el costo del paquete repetido; NO baja los tokens contados | Ninguno | Descartada: no sirve en el plan gratuito de Gemini (no se paga). Retomar solo si se usa mucho OpenAI o Claude de pago. |
| 2 | **Compactar el manual de herramientas** | 15–25 % del manual en versión conservadora (~1 500–2 500 tokens por llamada) | Medio: el manual es lo que la IA lee para elegir herramienta y llenar campos | Aplazada. Ver requisitos (§3) y procedimiento (§4). |
| 3 | **Enviar solo las herramientas que la pregunta necesita** | El mayor (la mitad o más) | Alto: si no se envía una herramienta que hacía falta, la IA no puede usarla; reduce el alcance | Descartada por el usuario (le quita alcance a la IA). |
| 4 | **Pedir todos los cálculos independientes en una sola ronda** (una regla en las instrucciones) | ~12 000 tokens y unos segundos por cada ronda que se ahorra; solo en preguntas que hoy usan 3+ llamadas | Muy bajo: no cambia el estilo ni las conclusiones; los cálculos dependientes siguen en orden | Aplazada junto con la 2 (el usuario prefirió no tocar nada por ahora). Es la de menor riesgo si se retoma. |
| 5 | **Resumir el historial en conversaciones largas** | Crece con la longitud de la conversación | Medio: se puede perder un dato dicho al principio | No explorada (el usuario no la quiso por ahora). |

## 3. Requisitos para no afectar el funcionamiento (obligatorios)

1. **Los cálculos no se tocan.** Nada de esto cambia `js/calc/*.js` ni la lógica de `calcular` de cada herramienta:
   solo el TEXTO que lee la IA (descripciones) o las instrucciones de los agentes.
2. **Compactación conservadora (opción 2): quitar lo repetido, nunca lo que informa.**
   - Sí se puede: la unidad escrita dos veces (en el texto y en `u:`), frases de relleno idénticas en muchos campos,
     explicaciones duplicadas entre la descripción de la herramienta y la de sus campos.
   - NO se toca: reglas de uso («indica solo uno», «obligatorio», «para un solo criterio usa…»), rangos (`min`,
     `max`), enumeraciones de valores válidos, criterios de cuándo usar cada herramienta frente a otra, los valores por
     defecto (`conDef`) ni los nombres de los campos.
   - Hacerlo herramienta por herramienta, empezando por `valorar_alternativas` (la más pesada).
3. **Una sola ronda (opción 4):** la regla debe decir «pide en una misma respuesta todos los cálculos que YA sabes que
   necesitas y que no dependan del resultado de otro», para que no pida cálculos de más «por si acaso» (gastaría tokens
   en vez de ahorrarlos) y siga esperando cuando uno depende de otro (p. ej. `buscar_conductor` y luego calcular). Va
   en los dos agentes (estándar y riguroso) sin cambiar su personalidad ni su estilo.
4. **Mismo contrato con las pantallas:** los nombres de las herramientas y de los campos no cambian (el historial de
   conversaciones guardadas y los reportes los usan).
5. **Documentación al día:** si se cambia el manual, actualizar `docs/ia-herramientas.md` y las cifras de este documento.

## 4. Procedimiento recomendado (cuando se retome)

1. **Línea base.** Con la versión actual y la clave de Gemini del usuario, correr las preguntas de referencia (§5) y
   anotar de cada una: herramientas que pidió la IA y con qué datos, número de llamadas, tokens (enviado y respondido,
   del botón «i» de la barra de «Conversación») y si la respuesta fue correcta.
2. **Medir el manual** antes y después (longitud de `JSON.stringify(declaraciones(...))` por herramienta; ver §1).
3. **Aplicar primero la opción 4** (una regla en `SISTEMA_ANALISIS` y `SISTEMA_RIGUROSO`), correr `tools/verify_ia.html`
   y repetir las preguntas de referencia.
4. **Aplicar la opción 2** herramienta por herramienta (una a la vez), con `tools/verify_ia.html` y las preguntas de
   referencia después de cada una.
5. **Criterio de aceptación** (todas las preguntas de referencia): mismas herramientas pedidas con los mismos datos
   (o equivalentes), mismas conclusiones y números, y menos tokens. Si una sola pregunta empeora, se revierte ese
   cambio (git) y se deja como estaba.
6. Publicar como versión `z` (ajuste interno) y anotarlo en `js/util/novedades.js` en lenguaje de usuario.

Las pruebas automáticas (`tools/verify_ia.html`, ~489) verifican que el manual esté bien formado y que cada
herramienta calcule bien, pero **no** que la IA lo siga entendiendo igual: eso solo lo comprueban las preguntas reales
del paso 1.

## 5. Preguntas de referencia (antes y después)

Cubren la elección de herramienta, los campos delicados y los cálculos encadenados:

1. «Compara las pérdidas de una línea de 34.5 kV, 9.9 MW, FP 0.9, 10 km, con ACSR 4/0 y con ACSR 336.4.»
2. «¿Qué caída de tensión tiene una línea de 13.2 kV, 5 MVA, FP 0.95, 8 km en AAAC 246.9?» (dato de partida en MVA)
3. «Valora dos alternativas para 20 MW a 34.5 kV y 15 km: aérea ACSR 477 y subterránea cobre 500 kcmil.»
   (`valorar_alternativas`, la herramienta más pesada)
4. «¿Soporta 10 kA durante 0.3 s un conductor ACSR 2/0?» (cortocircuito con corriente de falla)
5. «¿Qué ampacidad tiene un ACSR 477 a 40 °C de ambiente y 0.61 m/s de viento?» (varias referencias del mismo calibre)
6. «¿Cuál es la ocupación de un ducto de 4" PVC con tres cables de cobre 500 kcmil a 35 kV?»
7. «Barre la longitud de 5 a 30 km para la línea de la pregunta 1 con ACSR 336.4.» (`barrer_parametro`)
8. «¿Qué conductor es más económico a 25 años entre ACSR 336.4 y ACSR 477, con energía a 350 $/kWh?»
   (conductor económico, con precio)

Con el agente riguroso, repetir al menos la 3 y la 8 (usa las 17 herramientas y la ficha del proyecto).
