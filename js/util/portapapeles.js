// Copiar al portapapeles con respaldo para navegadores sin la API moderna. Devuelve true si se pudo copiar.
// `html` es opcional: si se da, se copia tambien como texto con formato (pegar en Word/Outlook conserva negritas y tablas);
// el texto plano (`texto`) va siempre.

export async function copiarTexto(texto, html = null) {
  try {
    if (html && typeof ClipboardItem !== "undefined" && navigator.clipboard?.write) {
      await navigator.clipboard.write([
        new ClipboardItem({
          "text/html": new Blob([html], { type: "text/html" }),
          "text/plain": new Blob([texto], { type: "text/plain" }),
        }),
      ]);
    } else {
      await navigator.clipboard.writeText(texto);
    }
    return true;
  } catch {
    const ta = document.createElement("textarea");
    ta.style.cssText = "position:fixed;opacity:0;";
    ta.value = texto;
    document.body.append(ta);
    ta.select();
    let ok = false;
    try {
      ok = document.execCommand("copy");
    } catch {
      ok = false;
    }
    ta.remove();
    return ok;
  }
}
