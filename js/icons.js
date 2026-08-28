// Iconos SVG minimalistas inline (trazo, sin dependencias externas) para
// que la PWA funcione 100% offline sin cargar fuentes de icono remotas.
const paths = {
  bolt: "M13 2 4 14h6l-1 8 9-12h-6l1-8Z",
  calculator: "M5 3h14a1 1 0 0 1 1 1v16a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1Zm2 3v4h10V6H7Zm0 6.5v2h2v-2H7Zm4 0v2h2v-2h-2Zm4 0v2h2v-2h-2ZM7 16v2h2v-2H7Zm4 0v2h2v-2h-2Zm4 0v5h2v-5h-2Z",
  book: "M5 4.5A2.5 2.5 0 0 1 7.5 2H19a1 1 0 0 1 1 1v16a1 1 0 0 1-1 1H7.5A2.5 2.5 0 0 0 5 22V4.5Zm2 0V19a2.48 2.48 0 0 1 .5-.05H18V4H7.5a.5.5 0 0 0-.5.5Z",
  grid: "M4 4h7v7H4V4Zm9 0h7v7h-7V4ZM4 13h7v7H4v-7Zm9 0h7v7h-7v-7Z",
  layers: "m12 2 9 5-9 5-9-5 9-5Zm-9 9 9 5 9-5m-18 5 9 5 9-5",
  help: "M12 22a10 10 0 1 0 0-20 10 10 0 0 0 0 20Zm0-6.2v-.3c0-1 .6-1.6 1.4-2.2.9-.7 1.5-1.3 1.5-2.4 0-1.5-1.2-2.4-2.8-2.4-1.4 0-2.5.7-2.9 2m2.8 7.7h.01",
  chevronLeft: "m15 18-6-6 6-6",
  search: "M11 19a8 8 0 1 0 0-16 8 8 0 0 0 0 16Zm10 2-4.9-4.9",
  ruler: "m3 16 5-5 3 3 8-8m0 0h-4m4 0v4M4 20h16",
  compass: "M12 22a10 10 0 1 0 0-20 10 10 0 0 0 0 20Zm3.5-14.5-2.2 5.7-5.7 2.2 2.2-5.7 5.7-2.2Z",
  hash: "M5 9h14M5 15h14M9 4 7 20m8-16-2 16",
  archive: "M3 5h18v4H3V5Zm1 4h16v10H4V9Zm5 3h6",
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
};

export function icon(name, cls = "") {
  const d = paths[name] || paths.help;
  return `<svg class="icon ${cls}" viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="${d}"/></svg>`;
}
