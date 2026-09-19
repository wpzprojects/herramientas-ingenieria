# Plan: ajustar las herramientas de la IA a las calculadoras rediseñadas

Creado 2026-09-19. **Este archivo es el registro de avance**: si la sesión se corta (cuota), retomar leyendo esta lista, seguir con el primer punto sin marcar y marcarlo al terminar (con commit y push de cada punto). Contexto: `docs/ia-herramientas.md` (cómo se agrega/ajusta una herramienta) y `js/ai/tools.js`.

Decisiones del usuario: implementar prioridad ALTA y MEDIA completas, y de la BAJA solo el punto 8 (documentación y pruebas). El punto 7 (reporte de la IA) NO se toca: el usuario tiene otras ideas. Los motores de `js/calc/*.js` (perdidas, regulacion, cortocircuito, ampacidad-*, ocupacion-ductos, coordenadas, unidades) NO se modifican; se reutilizan los módulos nuevos de las pantallas.

Regla de trabajo: un punto por commit (`git add` con rutas explícitas, push inmediato, subir `CACHE_VERSION` si cambia un archivo del shell), correr `tools/verify_ia.html` antes de cada commit y agregar las pruebas del punto.

## Puntos

- [x] 1. (HECHO, commit «IA: pérdidas y regulación…») Pérdidas y Regulación (`calcular_perdidas`, `calcular_regulacion`): varios tramos (`perdidas-tramos.js`, `regulacion-tramos.js`), dato de partida MW/MVA/A, conductores por fase (y separación del haz en regulación), clasificación Óptimo/Aceptable/Elevado en el resultado. Mantener compatibilidad con la llamada de un solo tramo actual.
- [x] 2. (HECHO) Cortocircuito: campo opcional «corriente de falla a soportar (kA)» → veredicto Cumple/No cumple, área mínima y calibre sugerido (`cortocircuito-calibre.js`).
- [ ] 3. Ocupación de ductos: varios tipos de conductor (`ocupacion-grupos.js`) y radio de curvatura 12D por tipo.
- [ ] 4. Ampacidad subterránea: corriente circulante / tensión inducida en la pantalla (monopolar; `ampacidad-subterranea-pantalla.js`).
- [ ] 5. Umbrales de diseño: las herramientas devuelven las referencias (1 %/3 % pérdidas, 5 %/10 % regulación) y el prompt (`SISTEMA_ANALISIS` en `js/ai/analisis.js`) dice que son referencias de diseño, nunca «límite normativo» / «fuera de norma».
- [ ] 6a. `convertir_unidades`: pasar al catálogo `data/unidades.json` con `unidades-extendido.js` (todas las categorías, cualquier unidad a cualquier otra, calibre AWG/kcmil). Ojo: `verify_ia.html` vigila que la descripción liste las categorías.
- [ ] 6b. `convertir_coordenadas`: códigos EPSG (`coordenadas-epsg.js` + `data/sistemas-epsg.json`, proj4 de `js/util/proj4.js`), avisos de área de uso y varios puntos.
- [ ] 8. Actualizar `docs/ia-herramientas.md`, `README.md` y `CLAUDE.md`; ampliar `tools/verify_ia.html`; comprobar que `barrer_parametro` funciona con los campos nuevos.

## Notas de avance

- Punto 1: en `tools.js` `esquemaDe`/`normalizar` ahora admiten listas de objetos (`itemCampos`). Campos nuevos en pérdidas/regulación: `potencia_mva`, `corriente_a` (dato de partida: exactamente uno de los tres; `potencia_mw` y `longitud_km` ya no son obligatorios a nivel superior), `conductores_por_fase`, `separacion_haz_m` y `tramos` (lista; cada tramo hereda del nivel superior lo que no traiga). Resultados nuevos: `perdidas_mw`, `potencia_activa_mw` (si el dato no es MW), `tramoN_*` (con varios tramos), `clasificacion` (Óptimo/Aceptable/Elevado) y una nota con las referencias de diseño (ya cubre parte del punto 5: falta la regla en el prompt). Helpers reutilizables en `tools.js`: `datoPartida`, `listaTramos`, `volcarTramo`, `campoTramos`. Pruebas: sección «pérdidas y regulación con varios tramos…» de `verify_ia.html` (221 en total). Script para insertar secciones de prueba: ver el patrón de `insertar.py` (inserta antes de la sección «tools: validación y errores orientadores»).
- Punto 2: `calcular_cortocircuito` acepta `corriente_falla_ka` (opcional, máx. 1000): agrega `cumple_corriente`, `margen_ka`, `area_minima_mm2` y, con conductor del catálogo, `calibre_sugerido` (+ área y capacidad; o «Ningún calibre… el de mayor capacidad es»). Con área manual solo veredicto y área mínima (nota). Usa `compararCalibres` de `cortocircuito-calibre.js`. Pruebas: sección «cortocircuito con corriente de falla a soportar» (238 en total).
