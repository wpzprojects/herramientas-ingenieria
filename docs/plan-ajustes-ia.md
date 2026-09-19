# Plan: ajustar las herramientas de la IA a las calculadoras rediseñadas

Creado 2026-09-19. **Este archivo es el registro de avance**: si la sesión se corta (cuota), retomar leyendo esta lista, seguir con el primer punto sin marcar y marcarlo al terminar (con commit y push de cada punto). Contexto: `docs/ia-herramientas.md` (cómo se agrega/ajusta una herramienta) y `js/ai/tools.js`.

Decisiones del usuario: implementar prioridad ALTA y MEDIA completas, y de la BAJA solo el punto 8 (documentación y pruebas). El punto 7 (reporte de la IA) NO se toca: el usuario tiene otras ideas. Los motores de `js/calc/*.js` (perdidas, regulacion, cortocircuito, ampacidad-*, ocupacion-ductos, coordenadas, unidades) NO se modifican; se reutilizan los módulos nuevos de las pantallas.

Regla de trabajo: un punto por commit (`git add` con rutas explícitas, push inmediato, subir `CACHE_VERSION` si cambia un archivo del shell), correr `tools/verify_ia.html` antes de cada commit y agregar las pruebas del punto.

## Puntos

- [ ] 1. Pérdidas y Regulación (`calcular_perdidas`, `calcular_regulacion`): varios tramos (`perdidas-tramos.js`, `regulacion-tramos.js`), dato de partida MW/MVA/A, conductores por fase (y separación del haz en regulación), clasificación Óptimo/Aceptable/Elevado en el resultado. Mantener compatibilidad con la llamada de un solo tramo actual.
- [ ] 2. Cortocircuito: campo opcional «corriente de falla a soportar (kA)» → veredicto Cumple/No cumple, área mínima y calibre sugerido (`cortocircuito-calibre.js`).
- [ ] 3. Ocupación de ductos: varios tipos de conductor (`ocupacion-grupos.js`) y radio de curvatura 12D por tipo.
- [ ] 4. Ampacidad subterránea: corriente circulante / tensión inducida en la pantalla (monopolar; `ampacidad-subterranea-pantalla.js`).
- [ ] 5. Umbrales de diseño: las herramientas devuelven las referencias (1 %/3 % pérdidas, 5 %/10 % regulación) y el prompt (`SISTEMA_ANALISIS` en `js/ai/analisis.js`) dice que son referencias de diseño, nunca «límite normativo» / «fuera de norma».
- [ ] 6a. `convertir_unidades`: pasar al catálogo `data/unidades.json` con `unidades-extendido.js` (todas las categorías, cualquier unidad a cualquier otra, calibre AWG/kcmil). Ojo: `verify_ia.html` vigila que la descripción liste las categorías.
- [ ] 6b. `convertir_coordenadas`: códigos EPSG (`coordenadas-epsg.js` + `data/sistemas-epsg.json`, proj4 de `js/util/proj4.js`), avisos de área de uso y varios puntos.
- [ ] 8. Actualizar `docs/ia-herramientas.md`, `README.md` y `CLAUDE.md`; ampliar `tools/verify_ia.html`; comprobar que `barrer_parametro` funciona con los campos nuevos.

## Notas de avance

(Anotar aquí lo que se vaya descubriendo: decisiones, nombres de campos nuevos, pruebas agregadas.)
