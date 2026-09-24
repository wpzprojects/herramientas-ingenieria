// Novedades por versión (Perfil > Aplicación). Versión x.y.z: x = cambio grande (sección nueva, rediseño general o algo
// que deja de ser compatible), y = funcionalidad nueva o mejora visible, z = correcciones y ajustes menores.
// La PRIMERA entrada debe coincidir con CACHE_VERSION de sw.js (lo comprueba tools/verify_perfil.html).
// El historial anterior a 3.16.0 se reconstruyó a partir de git el 2026-09-24 (antes solo había un contador v1…v296).
export const NOVEDADES = [
  { version: "3.19.1", fecha: "2026-09-24", cambios: ["Regulación: el reporte incluye la reactancia inductiva y la impedancia efectiva de cada tramo.", "Cortocircuito: la constante k₁ ahora explica qué representa.", "Ajustes de texto en las notas de las fórmulas de Ocupación de ductos, Regulación y Cortocircuito."] },
  { version: "3.19.0", fecha: "2026-09-24", cambios: ["El administrador puede agregar, editar y eliminar registros de los catálogos de conductores, tuberías y resoluciones; los cambios se publican de inmediato para todos.", "Perfil > Catálogos guarda las últimas 10 versiones de cada catálogo y permite volver a cualquiera de ellas."] },
  { version: "3.18.0", fecha: "2026-09-24", cambios: ["Los catálogos (conductores, tuberías y resoluciones) se pueden actualizar desde el servidor sin publicar una versión nueva de la app; sin internet se usa la última copia descargada.", "Perfil: el administrador publica los catálogos en la pestaña Catálogos."] },
  { version: "3.17.0", fecha: "2026-09-24", cambios: ["Pérdidas y Regulación quedan disponibles sin iniciar sesión, como Ocupación de ductos."] },
  { version: "3.16.3", fecha: "2026-09-24", cambios: ["Ayuda: la tarjeta del desarrollador muestra la versión real de la aplicación."] },
  { version: "3.16.2", fecha: "2026-09-24", cambios: ["Regulación: el factor de potencia inicial pasa de 0.95 a 0.9, igual que en Pérdidas y Conductor económico.", "Corriente de conductores NTC 2050: se quita la nota debajo de la tabla.", "Conversión de coordenadas: los ejemplos del cuadro por lotes muestran primero los formatos con espacio."] },
  { version: "3.16.1", fecha: "2026-09-24", cambios: ["Uso sin conexión: la app descarga sola los archivos que le falten al abrir Perfil > Aplicación con internet, y si alguno no se puede descargar dice cuál.", "Al actualizar, cada archivo se descarga por separado y siempre la copia recién publicada."] },
  { version: "3.16.0", fecha: "2026-09-24", cambios: ["Perfil: nuevas pestañas Calculadoras (valores con que arranca cada calculadora), Datos (respaldo y borrado de lo guardado en este dispositivo) y Aplicación (versión y «Buscar actualización»).","La aplicación ahora se numera por versiones (x.y.z) con esta lista de novedades."] },
  { version: "3.15.0", fecha: "2026-09-24", cambios: ["Corriente de conductores NTC 2050: el encabezado de la tabla queda fijo y las filas se desplazan debajo."] },
  { version: "3.14.0", fecha: "2026-09-24", cambios: ["Conversión de unidades, conversión de coordenadas y las pantallas de IA recuerdan lo escrito al cambiar de pantalla."] },
  { version: "3.13.0", fecha: "2026-09-23", cambios: ["Pérdidas, Regulación, Cortocircuito y Conductor económico: se elige la referencia (construcción) del conductor aéreo."] },
  { version: "3.12.0", fecha: "2026-09-23", cambios: ["Asistente técnico: Agente riguroso para memorias de cálculo, con ficha de datos del proyecto."] },
  { version: "3.11.0", fecha: "2026-09-23", cambios: ["Funciones con IA: además de Gemini, se puede usar OpenAI (ChatGPT) o Anthropic (Claude)."] },
  { version: "3.10.0", fecha: "2026-09-21", cambios: ["Calculadoras: las tarjetas se pueden plegar y desplegar."] },
  { version: "3.9.0", fecha: "2026-09-21", cambios: ["Calculadora nueva: Conductor económico (costo total actualizado de varias opciones de conductor)."] },
  { version: "3.8.0", fecha: "2026-09-20", cambios: ["Reporte de la IA: descarga en Word (.docx) y Markdown."] },
  { version: "3.7.0", fecha: "2026-09-20", cambios: ["IA: herramientas de diseño (dimensionar y verificar conductores) para agentes propios."] },
  { version: "3.6.0", fecha: "2026-09-20", cambios: ["Ocupación de ductos: corte transversal del ducto y dona de ocupación."] },
  { version: "3.5.0", fecha: "2026-09-19", cambios: ["Catálogo nuevo: Tuberías."] },
  { version: "3.4.0", fecha: "2026-09-19", cambios: ["Conversión de coordenadas entre cualquier par de ~500 sistemas EPSG, también por lotes."] },
  { version: "3.3.0", fecha: "2026-09-19", cambios: ["Conversión de unidades: modo completo con 19 categorías."] },
  { version: "3.2.0", fecha: "2026-09-19", cambios: ["Perfil: color principal personal para cada tema."] },
  { version: "3.1.0", fecha: "2026-09-19", cambios: ["Niveles de acceso: visitante, usuario y administrador."] },
  { version: "3.0.0", fecha: "2026-09-19", cambios: ["Rediseño de las calculadoras: tarjetas, varios tramos, fórmulas y reportes para copiar."] },
  { version: "2.0.0", fecha: "2026-09-18", cambios: ["Sección nueva Funciones con IA (Corrector de redacción y Asistente técnico) e inicio de sesión con Google."] },
  { version: "1.0.0", fecha: "2026-08-22", cambios: ["Primera versión web: calculadoras, catálogos y normatividad, también sin conexión."] },
];
