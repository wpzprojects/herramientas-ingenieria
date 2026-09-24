// Perfil > Calculadoras: valores con que arranca cada calculadora (ver js/util/valores-defecto.js).
// Campo vacío = la calculadora conserva su propio valor inicial.

import { icon } from "../icons.js";
import { escapeHtml } from "./format.js";
import { activarInfos } from "./info-campo.js";
import { GRUPOS, CAMPOS, leerDefectos, guardarDefectos } from "./valores-defecto.js";

const numero = (s) => (String(s).trim() === "" ? null : Number(String(s).replace(",", ".")));

export function pintarCalculadoras(box) {
  const actuales = leerDefectos();
  const campo = (c) => `
    <div class="field">
      <label for="pf-def-${c.clave}"${c.info ? ` data-info="${escapeHtml(c.info)}"` : ""}>${escapeHtml(c.etiqueta)}</label>
      <input type="number" id="pf-def-${c.clave}" data-clave="${c.clave}" step="${c.step}"${c.min !== undefined ? ` min="${c.min}"` : ""}${c.max !== undefined ? ` max="${c.max}"` : ""}
        value="${c.clave in actuales ? actuales[c.clave] : ""}" placeholder="Predeterminado: ${escapeHtml(c.inicial)}">
    </div>`;

  box.innerHTML = `
    <div class="form-section-title">${icon("adjustmentsHorizontal")} Valores por defecto de las calculadoras</div>
    <p class="text-muted text-sm" style="margin-top:0">Con estos valores arranca cada calculadora al abrirla. Deja un campo vacío para usar el valor que trae la calculadora. Se guardan solo en este dispositivo.</p>
    <form data-form novalidate>
      ${GRUPOS.map(
        (g) => `
        <h3 class="pf-grupo">${escapeHtml(g.titulo)} <span class="text-muted text-sm">· ${escapeHtml(g.donde)}</span></h3>
        <div class="grid-2">${g.campos.map(campo).join("")}</div>`
      ).join("")}
      <div class="btn-row">
        <button type="submit" class="btn btn-primary">Guardar</button>
        <button type="button" class="btn" data-restablecer>Restablecer todo</button>
      </div>
    </form>
    <div data-msg></div>`;
  activarInfos(box);

  const form = box.querySelector("[data-form]");
  const msg = box.querySelector("[data-msg]");
  const aviso = (tipo, texto) => {
    msg.innerHTML = `<div class="callout callout-${tipo}" style="margin:var(--space-3) 0 0"><span>${escapeHtml(texto)}</span></div>`;
  };

  form.addEventListener("submit", (e) => {
    e.preventDefault();
    if (!form.checkValidity()) {
      form.reportValidity();
      return;
    }
    const valores = {};
    for (const c of CAMPOS) {
      const v = numero(form.querySelector(`[data-clave="${c.clave}"]`).value);
      if (v !== null && Number.isFinite(v)) valores[c.clave] = v;
    }
    const n = Object.keys(guardarDefectos(valores)).length;
    aviso(
      "success",
      n
        ? `Guardado. Las calculadoras arrancarán con ${n === 1 ? "este valor" : `estos ${n} valores`} (lo que ya escribiste en una calculadora durante esta sesión se conserva).`
        : "Guardado. Las calculadoras usarán sus valores de siempre."
    );
  });

  box.querySelector("[data-restablecer]").addEventListener("click", () => {
    guardarDefectos({});
    for (const inp of form.querySelectorAll("[data-clave]")) inp.value = "";
    aviso("success", "Listo: las calculadoras vuelven a sus valores de siempre.");
  });
}
