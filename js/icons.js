// Iconos SVG minimalistas inline (trazo, sin dependencias externas) para
// que la PWA funcione 100% offline sin cargar fuentes de icono remotas.
const paths = {
  bolt: "M13 2 4 14h6l-1 8 9-12h-6l1-8Z",
  shield: "M12 2 4 5v6c0 5 3.5 9 8 11 4.5-2 8-6 8-11V5l-8-3Z",
  layers: "m12 2 9 5-9 5-9-5 9-5Zm-9 9 9 5 9-5m-18 5 9 5 9-5",
  chevronLeft: "m15 18-6-6 6-6",
  search: "M11 19a8 8 0 1 0 0-16 8 8 0 0 0 0 16Zm10 2-4.9-4.9",
  ruler: "M3 8h18v8H3V8Zm3 0v3m3-3v5m3-5v3m3-3v5m3-5v3",
  compass: "M12 22a10 10 0 1 0 0-20 10 10 0 0 0 0 20Zm3.5-14.5-2.2 5.7-5.7 2.2 2.2-5.7 5.7-2.2Z",
  hash: "M5 9h14M5 15h14M11 4 7 20m10-16-4 16",
  map: "m9 3-6 2v16l6-2 6 2 6-2V3l-6 2-6-2Zm0 0v16m6-14v16",
  code: "m8 5-6 7 6 7m8-14 6 7-6 7",
  home: "m3 11 9-8 9 8v9a1 1 0 0 1-1 1h-5v-6H9v6H4a1 1 0 0 1-1-1v-9Z",
  menu: "M4 6h16M4 12h16M4 18h16",
  close: "m6 6 12 12M18 6 6 18",
  fileText: "M6 2h9l5 5v15H6V2Zm9 0v5h5M8 12h8M8 16h8M8 8h3",
  image: "M4 4h16v16H4V4Zm2 14 4.5-5.5 3 3.5 2.5-3L20 17H6ZM8.5 9a1.5 1.5 0 1 0 0-3 1.5 1.5 0 0 0 0 3Z",
  externalLink: "M14 4h6v6m0-6L10 14M6 6H5a1 1 0 0 0-1 1v12a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1v-1",
  print: "M6 9V3h12v6M6 18H4a1 1 0 0 1-1-1v-5a1 1 0 0 1 1-1h16a1 1 0 0 1 1 1v5a1 1 0 0 1-1 1h-2M6 14h12v7H6v-7Z",
  sun: "M12 17a5 5 0 1 0 0-10 5 5 0 0 0 0 10ZM12 1v2m0 18v2M4.2 4.2l1.4 1.4m12.8 12.8 1.4 1.4M1 12h2m18 0h2M4.2 19.8l1.4-1.4M18.4 5.6l1.4-1.4",
  moon: "M20.8 14.5A9 9 0 1 1 9.5 3.2a7 7 0 0 0 11.3 11.3Z",
  activity: "M2 12h4l3 9 6-18 3 9h4", // (espejo izquierda-derecha del trazo original, pedido del usuario; solo lo usa la tarjeta de Regulacion)
  alertTriangle: "M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0ZM12 9v4M12 17h.01",
};

// Iconos compuestos (varias formas primitivas) para casos que un solo trazo
// de linea no representa bien, p.ej. secciones transversales de conductor.
const shapes = {
  conductorBare: '<circle cx="12" cy="12" r="7"/><circle cx="12" cy="12" r="1.6" fill="currentColor" stroke="none"/>',
  conductorSemi: '<circle cx="12" cy="12" r="8.5"/><circle cx="12" cy="12" r="4.5"/>',
  conductorXlpe: '<circle cx="12" cy="12" r="10"/><circle cx="12" cy="12" r="6.5"/><circle cx="12" cy="12" r="3"/>',
  // Iconos siguientes replican, trazo a trazo, los de Tabler Icons (licencia MIT)
  // para que el estilo visual coincida sin depender de su CDN (ver icon()).
  calculator:
    '<g stroke-width="2"><path d="M4 5a2 2 0 0 1 2 -2h12a2 2 0 0 1 2 2v14a2 2 0 0 1 -2 2h-12a2 2 0 0 1 -2 -2l0 -14"/><path d="M8 8a1 1 0 0 1 1 -1h6a1 1 0 0 1 1 1v1a1 1 0 0 1 -1 1h-6a1 1 0 0 1 -1 -1l0 -1"/><path d="M8 14l0 .01"/><path d="M12 14l0 .01"/><path d="M16 14l0 .01"/><path d="M8 17l0 .01"/><path d="M12 17l0 .01"/><path d="M16 17l0 .01"/></g>',
  book:
    '<g stroke-width="2"><path d="M3 19a9 9 0 0 1 9 0a9 9 0 0 1 9 0"/><path d="M3 6a9 9 0 0 1 9 0a9 9 0 0 1 9 0"/><path d="M3 6l0 13"/><path d="M12 6l0 13"/><path d="M21 6l0 13"/></g>',
  archive:
    '<g stroke-width="2"><path d="M5 4h4l3 3h7a2 2 0 0 1 2 2v8a2 2 0 0 1 -2 2h-14a2 2 0 0 1 -2 -2v-11a2 2 0 0 1 2 -2"/></g>',
  grid:
    '<g stroke-width="2"><path d="M4 5a1 1 0 0 1 1 -1h4a1 1 0 0 1 1 1v4a1 1 0 0 1 -1 1h-4a1 1 0 0 1 -1 -1l0 -4"/><path d="M14 5a1 1 0 0 1 1 -1h4a1 1 0 0 1 1 1v4a1 1 0 0 1 -1 1h-4a1 1 0 0 1 -1 -1l0 -4"/><path d="M4 15a1 1 0 0 1 1 -1h4a1 1 0 0 1 1 1v4a1 1 0 0 1 -1 1h-4a1 1 0 0 1 -1 -1l0 -4"/><path d="M14 15a1 1 0 0 1 1 -1h4a1 1 0 0 1 1 1v4a1 1 0 0 1 -1 1h-4a1 1 0 0 1 -1 -1l0 -4"/></g>',
  // Tabler "help": el signo de interrogacion del trazo anterior quedaba ~1.3 unidades por debajo del centro del circulo.
  help:
    '<g stroke-width="2"><path d="M3 12a9 9 0 1 0 18 0a9 9 0 1 0 -18 0"/><path d="M12 17l0 .01"/><path d="M12 13.5a1.5 1.5 0 0 1 1 -1.5a2.6 2.6 0 1 0 -3 -4"/></g>',
  sparkles:
    '<g stroke-width="2"><path d="M16 18a2 2 0 0 1 2 2a2 2 0 0 1 2 -2a2 2 0 0 1 -2 -2a2 2 0 0 1 -2 2m0 -12a2 2 0 0 1 2 2a2 2 0 0 1 2 -2a2 2 0 0 1 -2 -2a2 2 0 0 1 -2 2m-7 12a6 6 0 0 1 6 -6a6 6 0 0 1 -6 -6a6 6 0 0 1 -6 6a6 6 0 0 1 6 6"/></g>',
  settings:
    '<g stroke-width="2"><path d="M10.325 4.317c.426 -1.756 2.924 -1.756 3.35 0a1.724 1.724 0 0 0 2.573 1.066c1.543 -.94 3.31 .826 2.37 2.37a1.724 1.724 0 0 0 1.065 2.572c1.756 .426 1.756 2.924 0 3.35a1.724 1.724 0 0 0 -1.066 2.573c.94 1.543 -.826 3.31 -2.37 2.37a1.724 1.724 0 0 0 -2.572 1.065c-.426 1.756 -2.924 1.756 -3.35 0a1.724 1.724 0 0 0 -2.573 -1.066c-1.543 .94 -3.31 -.826 -2.37 -2.37a1.724 1.724 0 0 0 -1.065 -2.572c-1.756 -.426 -1.756 -2.924 0 -3.35a1.724 1.724 0 0 0 1.066 -2.573c-.94 -1.543 .826 -3.31 2.37 -2.37c1 .608 2.296 .07 2.572 -1.065"/><path d="M9 12a3 3 0 1 0 6 0a3 3 0 0 0 -6 0"/></g>',
  pencil:
    '<g stroke-width="2"><path d="M4 20h4l10.5 -10.5a2.828 2.828 0 1 0 -4 -4l-10.5 10.5v4"/><path d="M13.5 6.5l4 4"/></g>',
  sidebarCollapse:
    '<g stroke-width="2"><path d="M4 6a2 2 0 0 1 2 -2h12a2 2 0 0 1 2 2v12a2 2 0 0 1 -2 2h-12a2 2 0 0 1 -2 -2l0 -12"/><path d="M9 4v16"/><path d="M15 10l-2 2l2 2"/></g>',
  sidebarExpand:
    '<g stroke-width="2"><path d="M4 6a2 2 0 0 1 2 -2h12a2 2 0 0 1 2 2v12a2 2 0 0 1 -2 2h-12a2 2 0 0 1 -2 -2l0 -12"/><path d="M9 4v16"/><path d="M14 10l2 2l-2 2"/></g>',
  user:
    '<g stroke-width="2"><path d="M3 12a9 9 0 1 0 18 0a9 9 0 1 0 -18 0"/><path d="M9 10a3 3 0 1 0 6 0a3 3 0 1 0 -6 0"/><path d="M6.168 18.849a4 4 0 0 1 3.832 -2.849h4a4 4 0 0 1 3.834 2.855"/></g>',
  microphone:
    '<g stroke-width="2"><path d="M9 2m0 3a3 3 0 0 1 3 -3h0a3 3 0 0 1 3 3v5a3 3 0 0 1 -3 3h0a3 3 0 0 1 -3 -3z"/><path d="M5 10a7 7 0 0 0 14 0"/><path d="M8 21l8 0"/><path d="M12 17l0 4"/></g>',
  copy:
    '<g stroke-width="2"><path d="M7 7m0 2.667a2.667 2.667 0 0 1 2.667 -2.667h8.666a2.667 2.667 0 0 1 2.667 2.667v8.666a2.667 2.667 0 0 1 -2.667 2.667h-8.666a2.667 2.667 0 0 1 -2.667 -2.667z"/><path d="M4.012 16.737a2.005 2.005 0 0 1 -1.012 -1.737v-10c0 -1.1 .9 -2 2 -2h10c.75 0 1.158 .385 1.5 1"/></g>',
  send:
    '<g stroke-width="2"><path d="M10 14l11 -11"/><path d="M21 3l-6.5 18a.55 .55 0 0 1 -1 0l-3.5 -7l-7 -3.5a.55 .55 0 0 1 0 -1l18 -6.5"/></g>',
  plus:
    '<g stroke-width="2"><path d="M12 5l0 14"/><path d="M5 12l14 0"/></g>',
  chartLine:
    '<g stroke-width="2"><path d="M4 19l16 0"/><path d="M4 15l4 -6l4 2l4 -5l4 4"/></g>',
  // Tabler "info-circle" (SVG oficial): boton de informacion junto al nombre de un campo (js/util/info-campo.js).
  infoCircle:
    '<g stroke-width="2"><path d="M3 12a9 9 0 1 0 18 0a9 9 0 0 0 -18 0"/><path d="M12 9h.01"/><path d="M11 12h1v4h1"/></g>',
  // Tabler "circuit-voltmeter" y "plug-connected" (SVG oficial): iconos de las tarjetas Datos de la linea y Conductor (Perdidas).
  circuitVoltmeter:
    '<g stroke-width="2"><path d="M5 12a7 7 0 1 0 14 0a7 7 0 1 0 -14 0"/><path d="M5 12h-3"/><path d="M19 12h3"/><path d="M10 10l2 4l2 -4"/></g>',
  plugConnected:
    '<g stroke-width="2"><path d="M7 12l5 5l-1.5 1.5a3.536 3.536 0 1 1 -5 -5l1.5 -1.5"/><path d="M17 12l-5 -5l1.5 -1.5a3.536 3.536 0 1 1 5 5l-1.5 1.5"/><path d="M3 21l2.5 -2.5"/><path d="M18.5 5.5l2.5 -2.5"/><path d="M10 11l-2 2"/><path d="M13 14l-2 2"/></g>',
  // Tabler "cylinder" (SVG oficial): icono de la tarjeta Tuberia (Ocupacion de ductos).
  cylinder:
    '<g stroke-width="2"><path d="M5 6a7 3 0 1 0 14 0a7 3 0 1 0 -14 0"/><path d="M5 6v12c0 1.657 3.134 3 7 3s7 -1.343 7 -3v-12"/></g>',
  // Tabler "temperature" (SVG oficial): icono de la tarjeta Condiciones de la falla (Cortocircuito).
  temperature:
    '<g stroke-width="2"><path d="M10 13.5a4 4 0 1 0 4 0v-8.5a2 2 0 0 0 -4 0v8.5"/><path d="M10 9l4 0"/></g>',
  // Tabler "wind" y "sun" (SVG oficial): iconos de las tarjetas Condiciones de operacion y Radiacion solar (Ampacidad aerea).
  wind:
    '<g stroke-width="2"><path d="M5 8h8.5a2.5 2.5 0 1 0 -2.34 -3.24"/><path d="M3 12h15.5a2.5 2.5 0 1 1 -2.34 3.24"/><path d="M4 16h5.5a2.5 2.5 0 1 1 -2.34 3.24"/></g>',
  sunTabler:
    '<g stroke-width="2"><path d="M8 12a4 4 0 1 0 8 0a4 4 0 1 0 -8 0"/><path d="M3 12h1m8 -9v1m8 8h1m-9 8v1m-6.4 -15.4l.7 .7m12.1 -.7l-.7 .7m0 11.4l.7 .7m-12.1 -.7l-.7 .7"/></g>',
  // Tabler "grid-dots" (SVG oficial): icono de la tarjeta Instalacion (banco de ductos) de Ampacidad subterranea.
  gridDots:
    '<g stroke-width="2"><path d="M4 5a1 1 0 1 0 2 0a1 1 0 1 0 -2 0"/><path d="M11 5a1 1 0 1 0 2 0a1 1 0 1 0 -2 0"/><path d="M18 5a1 1 0 1 0 2 0a1 1 0 1 0 -2 0"/><path d="M4 12a1 1 0 1 0 2 0a1 1 0 1 0 -2 0"/><path d="M11 12a1 1 0 1 0 2 0a1 1 0 1 0 -2 0"/><path d="M18 12a1 1 0 1 0 2 0a1 1 0 1 0 -2 0"/><path d="M4 19a1 1 0 1 0 2 0a1 1 0 1 0 -2 0"/><path d="M11 19a1 1 0 1 0 2 0a1 1 0 1 0 -2 0"/><path d="M18 19a1 1 0 1 0 2 0a1 1 0 1 0 -2 0"/></g>',
  // Ampacidad aerea (torre de celosia: patas, cruceta y diagonales) y subterranea (banco de ductos en corte: superficie y 4 ductos).
  // Dibujados a mano en el estilo de Tabler (trazo 2); elegidos por el usuario entre varias opciones (2026-09-19).
  powerTower:
    '<g stroke-width="2"><path d="M6 22 12 2l6 20"/><path d="M3 7h18"/><path d="M9.3 11l7.5 7"/><path d="M14.7 11l-7.5 7"/></g>',
  underground:
    '<g stroke-width="2"><path d="M3 5h18"/><path d="M6.5 12.5a2 2 0 1 0 4 0a2 2 0 1 0 -4 0"/><path d="M13.5 12.5a2 2 0 1 0 4 0a2 2 0 1 0 -4 0"/><path d="M6.5 19.5a2 2 0 1 0 4 0a2 2 0 1 0 -4 0"/><path d="M13.5 19.5a2 2 0 1 0 4 0a2 2 0 1 0 -4 0"/></g>',
  // Ocupacion de ductos: el ducto (circulo grande) con una terna de conductores (3 circulos macizos) en el fondo. Esquema del usuario.
  ductoTerna:
    '<g stroke-width="2"><circle cx="12" cy="12" r="9.5"/><g fill="currentColor" stroke="none"><circle cx="9" cy="17" r="2.4"/><circle cx="15" cy="17" r="2.4"/><circle cx="12" cy="11.6" r="2.4"/></g></g>',
  // Letras «Ab» (icono de Codificacion de entregables): una A mayuscula y una b minuscula, con el trazo de Tabler.
  idLetras:
    '<g stroke-width="2"><path d="M3.5 18 8 6l4.5 12M5.2 14h5.6"/><path d="M15.5 6v12M15.5 12h1.5a3 3 0 0 1 0 6h-1.5"/></g>',
};

export function icon(name, cls = "") {
  const inner = shapes[name] || (paths[name] ? `<path d="${paths[name]}"/>` : shapes.help);
  return `<svg class="icon ${cls}" viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${inner}</svg>`;
}
