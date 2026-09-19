# Herramientas de Ingeniería

PWA (Progressive Web App) instalable con calculadoras y catálogos de ingeniería para líneas y redes de distribución eléctrica: ampacidad (IEEE Std 738 / IEC 60287-1-1), cortocircuito, pérdidas, regulación, ocupación de ductos, catálogos de conductores, normatividad RETIE/NTC-2050/CREG, conversión de unidades y de coordenadas.

Migración a HTML/CSS/JS (vanilla, sin build step) de la app original de Power Apps "Herramientas (offline)" (el `.msapp` original se retiró del repositorio el 2026-09-19 y sigue en el historial de git). 100% estática y offline: no requiere backend ni conexión a internet salvo un enlace externo opcional en Conversión de coordenadas y la sección **Funciones de IA** (ver más abajo), que se conecta a Google Gemini con la clave de API del propio usuario.

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
js/util/katex.js                           # carga perezosa de KaTeX (solo al abrir una pestaña de formulas)
js/util/resultados-ui.js                   # tarjeta de resultados con pestañas, reporte con negrita y panel de formulas (Perdidas, Regulacion)
js/util/info-campo.js                       # boton «i» junto al nombre de un campo con su cuadro de ayuda (reemplaza los textos .hint)
vendor/katex/                              # copia local de KaTeX 0.16.11 (MIT): js, css y fuentes woff2; precacheada por el service worker
js/calc/*.js                               # motores de calculo PUROS (sin DOM), 1:1 con las formulas originales
js/ai/*.js                                 # capa de IA (Gemini): cliente, herramientas, agentes, reporte (ver "Funciones de IA")
js/auth/*.js, firebase/firestore.rules     # acceso con Google (Firebase): login, lista de usuarios, claves en el servidor
js/views/*.js                              # 1 modulo por pantalla: export async function render(container, params)
data/*.json                                # catalogos (conductores, tuberias, resoluciones, codificacion, factores de conversion)
assets/normativa/*.jpg                     # tablas/figuras normativas escaneadas (RETIE / NTC 2050)
icons/                                     # iconos PWA (placeholder generado, ver mas abajo)
tools/                                     # scripts de extraccion/verificacion (no forman parte de la app en runtime)
```

## Catálogos de datos

Los `data/*.json` son la **fuente de verdad** de los catálogos y se editan directamente. Se generaron una sola vez desde el `.msapp` de la app original de Power Apps; ese archivo (y las capturas de pantalla de `APP_PowerApps/`) se retiró del repositorio el 2026-09-19 porque la app ya no depende de él, pero **sigue en el historial de git**.

`tools/extract_data.py` quedó **obsoleto**: solo se conserva como registro de cómo se sanearon los datos. Si algún día hubiera que regenerar los catálogos desde el original, se restaura `APP_PowerApps/` desde el historial (`git log --diff-filter=D --oneline -- "APP_PowerApps/Herramientas (offline).msapp"` da el commit del borrado; luego `git checkout <commit>^ -- APP_PowerApps`), se descomprime el `.msapp` (es un .zip) en `APP_PowerApps/_extracted/` y se ejecuta `python tools/extract_data.py`. Ese script no regenera `data/factores-conversion.json`, que se transcribió a mano.

## Verificación de los motores de cálculo

`tools/verify_calc.py` y `tools/verify_coordenadas.py` son scripts Python independientes (reimplementan las mismas fórmulas en otro lenguaje) usados para validar numéricamente los módulos de `js/calc/` durante la migración — no son parte de la app, pero conviene conservarlos como referencia/regresión si se vuelve a tocar esa lógica.

`tools/verify_regulacion.html` hace lo mismo con la pantalla de Regulación (varios tramos, haz de conductores, RMG en mm, reporte y fórmulas).

`tools/verify_ocupacion.html` hace lo mismo con la pantalla de Ocupación de ductos (varios tipos de conductor, diámetro del catálogo XLPE, tubería manual o del catálogo, reporte y fórmulas).

`tools/verify_cortocircuito.html` hace lo mismo con la pantalla de Cortocircuito (área y temperaturas del catálogo o manuales, red aérea calculada como aluminio, corriente de falla a soportar con área mínima y calibre sugerido, reporte y fórmulas).

`tools/verify_perdidas.html` (arnés en el navegador, sin internet) prueba la pantalla de Pérdidas: la lógica de varios tramos (`js/calc/perdidas-tramos.js`) contra fórmulas escritas de forma independiente, y la vista real manejada como lo haría una persona (dato de partida, agregar/quitar tramos, resultados, fórmulas con KaTeX, archivos del service worker). Se ejecuta igual que `verify_ia.html` (ver su encabezado).

## Funciones de IA (Gemini)

Sección nueva (no existía en la app original) con tres pantallas: **Análisis con calculadoras**, **Corrector de redacción** y **Configuración de IA**. Es la única parte de la app que necesita internet; sin conexión se muestra un aviso y el resto sigue funcionando.

- **Guía de cómo la IA usa las calculadoras** (recorrido de una pregunta, anatomía de una herramienta, agentes y filtro, cómo agregar una herramienta nueva): [`docs/ia-herramientas.md`](docs/ia-herramientas.md). Las viñetas de abajo son el resumen por archivo.
- **Clave de API**: cada usuario pega la suya (gratuita, de Google AI Studio) en *Configuración*. Se guarda solo en su navegador (`localStorage`, o `sessionStorage` si no elige recordarla) y solo se envía a Google. No hay backend. El modelo no está fijo en el código: se lista con la clave y se elige en Configuración.
- **`js/ai/gemini.js`**: cliente REST por `fetch` (`generateContent`, `models`). El service worker ignora orígenes externos, así que no cachea estas llamadas.
- **`js/ai/tools.js` + `analisis.js`**: la IA **no calcula**. Hay 11 herramientas: las 9 del agente estándar (6 calculadoras + `barrer_parametro`, `buscar_conductor`, `buscar_tuberia`) y 2 opcionales de Varios (`convertir_unidades`, `convertir_coordenadas`) que solo usa un agente que las active; Gemini decide cuál usar (function calling) y la app las ejecuta con los motores de `js/calc/`. Cada herramienta replica lo que hace la vista antes de llamar al motor (búsqueda del conductor en el catálogo, valores por defecto, primera coincidencia del catálogo) y valida rangos; lo que no viene del usuario se registra como *supuesto*. Las de Varios devuelven al modelo 12 cifras significativas (`cifras`), no 6: con 6 un Este de 4 881 143 m quedaría con metros de error. Hay un tope de rondas y de cálculos por pregunta (Configuración).
- **`js/ai/reporte.js`**: las tablas del reporte se dibujan con las corridas reales de las calculadoras, nunca con texto de la IA; la narrativa sí es de la IA. Exportable a portapapeles (HTML+texto), `.md` e impresión/PDF.
- **Agentes de análisis** (`js/ai/agentes-analisis.js`, botón «Agentes» de Análisis con calculadoras): cada agente es el prompt de sistema con el que trabaja Gemini + las instrucciones del reporte + una temperatura opcional + la lista de herramientas que puede usar (casillas por grupo: Calculadoras, Catálogos, Análisis; `catalogoHerramientas()` en `tools.js`; el bloqueo lo aplica el código, no el prompt). El **predeterminado** (`SISTEMA_ANALISIS` y `PROMPT_REPORTE` de `analisis.js`) vive en el código: es de solo lectura, no se guarda ni se puede borrar; se puede ver y duplicar. Los propios (duplicados o nuevos) se editan y se guardan en `localStorage`. A los propios la app les agrega siempre al final `REGLA_FIJA` (la IA no calcula: todo número sale de una herramienta).
- **Agentes de redacción** (`js/ai/agentes.js`): prompt de sistema + tono + temperatura + ejemplos; 4 predeterminados, editables, exportables/importables en JSON. Se guardan en `localStorage`. El historial de conversaciones vive en IndexedDB (`js/ai/historial.js`) y se puede borrar desde Configuración.
- **Privacidad**: con el plan gratuito Google puede usar lo enviado para mejorar sus productos; la app lo advierte en varias pantallas.
- **Dictado por voz** (`js/ai/voz.js`): botón de micrófono junto a los cuadros de Análisis y Corrector de redacción, con la Web Speech API del navegador (`es-CO`, sin clave). Clic para empezar y clic para terminar; el texto se inserta en el cursor del mismo cuadro. Requiere internet y el audio lo procesa el servicio de voz del navegador (Chrome/Edge); en Firefox el botón no aparece. En Android el sistema hace sonar un pitido cada vez que empieza a escuchar (no se puede silenciar desde la web) y Chrome entrega los resultados acumulados, por lo que se fusionan para no duplicar texto.
- **Verificación**: `tools/verify_ia.html` (arnés en el navegador, sin clave ni internet, Gemini simulado: contrasta cada adaptador contra fórmulas independientes y los motores) y `tools/preview_ia.html` (vista previa de las pantallas con Gemini simulado). Ver instrucciones en el encabezado de cada archivo.
- Si se cambia la firma de un motor de `js/calc/*.js`, hay que actualizar también su adaptador en `js/ai/tools.js` y correr `verify_ia.html`.

## Acceso con Google y Firebase (Ayuda → Configuración avanzada)

Pantalla de acceso restringido (`#/ayuda/configuracion`, tarjeta "Configuración avanzada" en Ayuda). Pide iniciar sesión con Google y solo deja entrar a los correos de una **lista guardada en el servidor** (no en este repositorio, que es público). Dentro se gestionan los usuarios y se puede guardar la clave de Gemini en el servidor. Requiere internet; el resto de la app sigue funcionando sin conexión.

**Cómo funciona y por qué así.** La app es estática y su código lo puede leer cualquiera, por lo que un login "solo en pantalla" no protege nada. La seguridad la aplica el servidor: **Firebase** (Authentication con Google + Firestore) con reglas (`firebase/firestore.rules`) que corren en los servidores de Google; no hay servidor propio que mantener. El SDK se carga por CDN (gstatic) solo al entrar a esa pantalla o al usar una clave del servidor, sin build step.

- **Roles**: `admin` (gestiona la lista y la clave compartida) y `usuario` (entra, ve la lista y usa las claves). Un admin no puede quitarse ni bajarse el rol a sí mismo, así siempre queda al menos uno.
- **Claves de Gemini en el servidor**: `ajustes/gemini` (compartida: la leen los autorizados y la cambian los admins) y `usuarios/{correo}/secretos/gemini` (personal: solo su dueño, ni los admins). En Funciones de IA se elige cuál usar (`js/ai/clave.js`): la clave del servidor solo vive en memoria, nunca en `localStorage`. **La clave compartida la puede leer, técnicamente, cualquier usuario autorizado**; compártela solo con gente de confianza. Ocultarla del todo exigiría un intermediario en el servidor (Cloud Functions requiere plan Blaze, o un Cloudflare Worker).
- **Estado actual**: `js/auth/firebase-config.js` ya trae la configuración del proyecto `herramientas-ingenieria` (si estuviera en `null`, la pantalla mostraría "Servicio de acceso no configurado"). El backend simulado (`js/auth/backend-mock.js`) existe solo para pruebas y jamás se elige solo.

**Activarlo (una vez, con tu cuenta de Google):**

1. [Consola de Firebase](https://console.firebase.google.com) → crear proyecto (Google Analytics no hace falta).
2. **Authentication → Método de acceso → Google** → habilitar (correo de soporte).
3. **Authentication → Configuración → Dominios autorizados** → agregar el dominio de GitHub Pages (`wpzprojects.github.io`); `localhost` ya viene.
4. **Firestore Database** → crear en modo producción, en una región cercana (p. ej. São Paulo; no se puede cambiar luego).
5. **Firestore → Reglas** → pegar el contenido de `firebase/firestore.rules` → Publicar.
6. **Configuración del proyecto → Tus apps → Web** → registrar la app y copiar el bloque `firebaseConfig` a `js/auth/firebase-config.js` (son identificadores públicos; la seguridad son las reglas).
7. **Primer administrador (a mano):** Firestore → colección `usuarios` → documento con ID = tu correo **en minúsculas** (p. ej. `nombre@gmail.com`) y un campo `rol` = `admin`. La consola ignora las reglas, por eso sirve para arrancar.
8. Publicar el cambio de `firebase-config.js`, abrir Ayuda → Configuración avanzada e iniciar sesión.

**Probar las reglas antes de fiarse de ellas** (no se pudieron ejecutar en el desarrollo; Firestore → Reglas → *Simulador de reglas*): con el correo del admin debe permitir leer y escribir `usuarios/*` y `ajustes/gemini`; con un correo que NO esté en `usuarios` debe denegar todo salvo `get usuarios/{su propio correo}`; con un `usuario` normal debe permitir leer la lista y la clave compartida pero denegar escribir; un admin no debe poder borrar `usuarios/{su correo}`; nadie debe poder leer `usuarios/{otro}/secretos/*`.

**Cosas a tener presentes:** la lista contiene correos (datos personales; guardar solo correo y rol); el correo se guarda en minúsculas y Google debe entregarlo verificado; la versión del SDK está fijada en `FIREBASE_SDK_VERSION` (`js/auth/firebase-config.js`) y conviene revisarla de vez en cuando; el plan gratuito (Spark) alcanza de sobra para este uso. Con una cuenta de Workspace corporativa el administrador del dominio podría bloquear apps de terceros; por ahora se usa Gmail personal.

**Verificación**: `tools/verify_ia.html` cubre las reglas de acceso sobre el servidor simulado (roles, no quitarse a sí mismo, claves privadas, memoria vs. `localStorage`) y `tools/preview_ia.html?vista=avanzada&paso=admin|usuario|login|extrano|nada|agregar` muestra la pantalla en cada escenario. Lo que solo se puede probar con el Firebase real (login de Google, reglas) queda pendiente de la configuración anterior.

## Decisiones de migración que vale la pena recordar

- **Pérdidas**: se replicó el factor de pérdidas *lineal* (`0.7·Fc + 0.3`) tal como corre en la app original, no la forma cuadrática de Buller-Woodrow que aparece documentada (pero no implementada) en el panel de fórmulas original. Ver `js/calc/perdidas.js`.
- **Ampacidad subterránea**: se corrigió un bug del original donde el desplegable de calibres decía "1000 AWG" pero la tabla de construcción de cable usaba "1000 kcmil" (`data/construccion-cable-subterraneo.json` ya viene con el valor correcto).
- **Conversión de coordenadas**: `Atan2` en Power Fx sigue la convención de Excel (`Atan2(x, y)`), que equivale a `Math.atan2(y, x)` en JavaScript (orden de argumentos invertido). Ya corregido y validado con un caso de ida y vuelta exacto en `js/calc/coordenadas.js`.
- Los paneles "Reporte" y "Fórmulas" de cada calculadora, que en el original estaban condicionados a un nivel de acceso oculto (`vAcceso >= 3`, fijado siempre en 3 al abrir la app), quedan siempre visibles en la PWA.
- Se omitieron del menú las 6 opciones que ya estaban deshabilitadas/sin implementar en la app original (resistencia de puesta a tierra, DPS, catálogo de aisladores, criterios Celsia, bitácora, verificación documental) y la pantalla de desarrollo interno (`Pantalla_Pruebas`).

- **Pérdidas (pantalla en tarjetas)**: «Datos de la línea» (con el *dato de partida*: potencia activa en MW, potencia aparente en MVA o corriente en A, que se convierte a potencia activa) y una tarjeta «Conductor» por tramo (con conductores por fase: la resistencia efectiva es R/N). El % de pérdidas total es la **suma** de los % de cada tramo, válido con la misma corriente en todo el circuito (sin cargas intermedias). `js/calc/perdidas.js` no se modificó: `js/calc/perdidas-tramos.js` lo usa tramo por tramo. Los umbrales de 1 % y 3 % son **referencias de diseño** (etiquetas «Óptimo», «Adecuado» y «Elevado», y calibre sugerido); no se presentan como límite normativo ni como «fuera de norma». La herramienta de la IA (`calcular_perdidas`) sigue con un solo tramo y potencia en MW.
- **Regulación (pantalla en tarjetas)**: misma estructura que Pérdidas, sin factor de carga. Cada tramo lleva su conductor, su longitud, su radio medio geométrico (en mm, del catálogo o «Manual»), sus conductores por fase con la separación del haz (RMG equivalente del haz; la resistencia efectiva es R/N) y sus tres distancias entre fases. La caída de tensión total es la suma de la de cada tramo (misma corriente en todo el circuito). Referencias de diseño: hasta 5 % «Óptimo», hasta 10 % «Adecuado» y por encima «Elevado» (no son un límite normativo). `js/calc/regulacion.js` y la herramienta de la IA no se modificaron; la lógica de tramos está en `js/calc/regulacion-tramos.js` y lo común con Pérdidas en `js/calc/circuito.js`.
- **KaTeX** (`vendor/katex`): única biblioteca de terceros incluida, como copia local (MIT, sin npm ni build) para que las fórmulas se vean bien sin internet. Se carga solo al abrir la pestaña «Fórmulas» de Pérdidas.

## Iconos / logo

`icons/icon-192.png`, `icon-512.png` e `icon-maskable-512.png` se generan a partir del logo definitivo `assets/IconoAPP.png` con `tools/generate_icons_from_source.py`. Vuelve a ejecutar el script si el logo cambia.

## Publicar en GitHub Pages

1. Push a la rama `main` del repositorio remoto.
2. En GitHub → Settings → Pages, selecciona "Deploy from a branch", rama `main`, carpeta `/ (root)`.
3. La PWA queda instalable (Chrome/Edge: ícono de instalación en la barra de direcciones; Android: "Agregar a pantalla de inicio"; iOS/Safari: compartir → "Agregar a pantalla de inicio") una vez servida por HTTPS.
