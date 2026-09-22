// Estado de los formularios de las calculadoras (seccion "Calculos"), en MEMORIA (no en
// localStorage): si el usuario se mueve a otra seccion de la app y vuelve, el formulario se ve
// igual a como lo dejo; si recarga o cierra la app, se pierde (es lo pedido: no es un borrador
// permanente, solo evita perder lo escrito al navegar dentro de la misma sesion).
//
// Quien guarda y restaura el detalle de cada formulario es cada vista (los campos y las tarjetas
// dinamicas de tramos/opciones son distintos en cada una); este modulo solo es el "cajon" comun
// donde se deja la foto, indexado por ruta. El router llama a guardar justo antes de salir de la
// pantalla (ver js/router.js, `antesDeSalir`): por eso una vista de calculadora debe devolver, en su
// `render()`, una funcion que capture su estado y lo guarde aqui.
const estados = new Map();

/** @param {string} ruta - la misma que la tabla de rutas de router.js (p. ej. "/calculos/perdidas") */
export function guardarEstado(ruta, datos) {
  estados.set(ruta, datos);
}

/** @returns {object|null} lo ultimo guardado para esa ruta, o null si nunca se guardo nada */
export function leerEstado(ruta) {
  return estados.get(ruta) ?? null;
}
