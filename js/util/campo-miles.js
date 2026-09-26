// Campos de dinero con separador de miles mientras se escribe (1400000000 → 1,400,000,000), con el mismo formato de
// los resultados de la app (coma para miles, punto para decimales). El campo es de texto (inputmode="decimal"): un
// <input type="number"> no puede mostrar separadores. Se lee con leerMiles(), no con parseFloat (que se detendría en
// la primera coma). Pedido del usuario (2026-09-25) para los costos de Valoración integral.

/** Patrón válido del campo (para la validación del formulario): dígitos con comas de miles y un punto decimal opcional. */
export const PATRON_MILES = "[0-9,]*\\.?[0-9]*";

/** Texto con comas de miles; conserva un solo punto decimal y descarta lo demás. */
export function formatearMiles(texto) {
  const limpio = String(texto ?? "").replace(/[^\d.]/g, "");
  if (!limpio) return "";
  const punto = limpio.indexOf(".");
  const entero = (punto === -1 ? limpio : limpio.slice(0, punto)).replace(/^0+(?=\d)/, "");
  const decimales = punto === -1 ? null : limpio.slice(punto + 1).replace(/\./g, "");
  const conMiles = entero.replace(/\B(?=(\d{3})+(?!\d))/g, ",");
  return decimales === null ? conMiles : `${conMiles || "0"}.${decimales}`;
}

/** Número del campo (null si está vacío, NaN si no es un número). */
export function leerMiles(texto) {
  const v = String(texto ?? "").replace(/,/g, "").trim();
  return v === "" ? null : Number(v);
}

/** Da formato al escribir, dejando el cursor en su sitio (cuenta las cifras que había antes de él). */
export function activarMiles(input) {
  input.addEventListener("input", () => {
    const pos = input.selectionStart ?? input.value.length;
    const cifrasAntes = input.value.slice(0, pos).replace(/[^\d.]/g, "").length;
    const nuevo = formatearMiles(input.value);
    if (nuevo === input.value) return;
    input.value = nuevo;
    let i = 0;
    for (let c = 0; i < nuevo.length && c < cifrasAntes; i++) if (/[\d.]/.test(nuevo[i])) c++;
    try {
      input.setSelectionRange(i, i);
    } catch {
      /* campo sin foco o sin selección: no importa */
    }
  });
}

/** Vuelve a dar formato a un valor puesto por código (al restaurar o al aplicar un valor por defecto). */
export function reformatear(input) {
  if (input) input.value = formatearMiles(input.value);
}
