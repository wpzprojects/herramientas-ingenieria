// Analisis con calculadoras: chat con Gemini que ejecuta las calculadoras de
// la app (via function calling) para comparar escenarios. Abajo se arma el
// "Reporte de escenarios": narrativa de la IA + tablas deterministas con los
// calculos realmente ejecutados (auditables), exportable a Markdown/PDF.

import { el, escapeHtml } from "../util/format.js";
import { obtenerAjustes } from "../ai/config.js";
import { claveEnUso } from "../ai/clave.js";
import { ErrorGemini } from "../ai/gemini.js";
import { verificarAcceso } from "../ai/ui-clave.js";
import { markdownAHtml } from "../ai/markdown.js";
import { crearContexto } from "../ai/tools.js";
import { ejecutarTurno, PROMPT_REPORTE } from "../ai/analisis.js";
import { escenariosHtml, reporteMd, reporteHtmlExportable, armarTablas, AVISO_REPORTE } from "../ai/reporte.js";
import * as historial from "../ai/historial.js";
import { agregarMicrofono } from "../ai/voz.js";
import { icon } from "../icons.js";

const EJEMPLOS = [
  "Compara las pérdidas de una línea de 34.5 kV, 9.9 MW, factor de potencia 0.95 y 5.2 km con ACSR 4/0, 266.8 y 477, con factor de carga 0.56.",
  "¿Cómo varía la caída de tensión de esa misma línea si la longitud va de 2 a 12 km con ACSR 4/0?",
  "Calcula la ampacidad aérea de un ACSR 477 con temperatura ambiente de 25, 35 y 45 °C.",
  "¿Cumple la ocupación de un ducto PVC de 4 pulgadas con 3 conductores XLPE de 35 mm de diámetro?",
];

const fechaCorta = (ms) => new Date(ms).toLocaleString("es-CO", { dateStyle: "short", timeStyle: "short" });
const fechaLarga = () => new Date().toLocaleString("es-CO", { dateStyle: "long", timeStyle: "short" });

function descargar(nombre, contenido, tipo) {
  const url = URL.createObjectURL(new Blob([contenido], { type: tipo }));
  const a = el("a", { href: url, download: nombre });
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export async function render(container) {
  container.innerHTML = `
    <div class="breadcrumb"><a href="#/">Inicio</a> <span>/</span> <a href="#/ia">Funciones de IA</a> <span>/</span> <span>Análisis con calculadoras</span></div>
    <h1 class="page-title">Análisis con calculadoras</h1>
  `;
  if (!(await verificarAcceso(container, { reintentar: () => render(container) }))) return;

  const ajustes0 = obtenerAjustes();
  let conv = null;
  let ctx = crearContexto(ajustes0.maxCalculos);
  let ocupado = false;

  container.insertAdjacentHTML(
    "beforeend",
    `
    <div class="card">
      <div class="ia-toolbar">
        <h2 class="section-title" style="margin:0">Consulta</h2>
        <div class="grupo">
          <span class="badge" title="Modelo activo (cámbialo en Configuración)">${escapeHtml(ajustes0.modelo)}</span>
          <button type="button" class="btn btn-sm" id="btn-historial">Historial</button>
        </div>
      </div>
      <div id="panel-historial" hidden style="margin-bottom:var(--space-4)"></div>
      <div class="ia-chat ia-chat--hilo" id="chat" aria-live="polite"></div>
      <div class="ia-chips" id="ejemplos" aria-label="Ejemplos de preguntas"></div>
      <div class="ia-caja ia-caja--al-borde" style="margin-top:var(--space-4)">
        <textarea id="f-pregunta" rows="1" placeholder="Ej.: analiza pérdidas y regulación de una línea de 34.5 kV, 9.9 MW, fp 0.95, 5.2 km con ACSR 4/0 y compara con 336.4…"></textarea>
      </div>
    </div>
    <div class="ia-acciones">
      <button type="button" class="ia-accion" id="btn-nueva" title="Empezar una conversación nueva">${icon("plus")}<span>Nueva conversación</span></button>
      <button type="button" class="ia-accion ia-accion--enviar" id="btn-enviar" title="Enviar (Ctrl + Enter)">${icon("send")}<span>Enviar</span></button>
    </div>

    <div class="card ia-reporte-card" id="card-reporte" hidden>
      <div class="ia-toolbar no-print">
        <h2 class="section-title" style="margin:0">Reporte de escenarios</h2>
        <div class="grupo">
          <button type="button" class="btn btn-sm btn-primary" id="btn-reporte">Generar reporte con IA</button>
          <button type="button" class="btn btn-sm" id="btn-copiar">Copiar</button>
          <button type="button" class="btn btn-sm" id="btn-md">Descargar .md</button>
          <button type="button" class="btn btn-sm" id="btn-imprimir">Imprimir / PDF</button>
        </div>
      </div>
      <p class="text-muted text-sm" id="reporte-meta" style="margin-top:0"></p>
      <div id="reporte-cuerpo"></div>
    </div>
  `
  );

  const $ = (s) => container.querySelector(s);
  const chat = $("#chat");
  const fPregunta = $("#f-pregunta");
  agregarMicrofono(fPregunta, $("#btn-enviar"), { clase: "ia-accion" });

  // Caja de texto como la del corrector de redaccion: una linea que crece al escribir (hasta el 40 % de la pantalla).
  function ajustarAlto() {
    const max = window.innerHeight * 0.4;
    fPregunta.style.height = "auto";
    fPregunta.style.height = `${Math.min(fPregunta.scrollHeight, max)}px`;
    fPregunta.style.overflowY = fPregunta.scrollHeight > max ? "auto" : "hidden"; // sin flechas mientras quepa
  }
  fPregunta.addEventListener("input", ajustarAlto);
  // La caja vacia debe mostrar completo el texto de ejemplo (en el celular ocupa varias lineas): se reajusta al
  // cambiar el ancho (giro de pantalla, menu lateral). Observar solo el ancho evita un bucle con el cambio de alto.
  let anchoPrevio = 0;
  new ResizeObserver(() => {
    if (fPregunta.clientWidth !== anchoPrevio) {
      anchoPrevio = fPregunta.clientWidth;
      requestAnimationFrame(ajustarAlto); // fuera del callback: cambiar el alto aqui provoca "ResizeObserver loop"
    }
  }).observe(fPregunta);
  // El chat crece con la conversacion (sin barra propia) y el desplazamiento lo hace la pagina.
  const alFinal = () => window.scrollTo({ top: document.documentElement.scrollHeight, behavior: "smooth" });

  // ---------- chat ----------
  function chipsHerramientas(lista) {
    if (!lista?.length) return null;
    const conteo = new Map();
    for (const h of lista) {
      const k = `${h.titulo}|${h.ok}`;
      conteo.set(k, (conteo.get(k) || 0) + 1);
    }
    return el(
      "div",
      { class: "ia-tools" },
      [...conteo].map(([k, n]) => {
        const [titulo, ok] = k.split("|");
        return el("span", { class: `ia-toolchip${ok === "true" ? "" : " ia-toolchip--error"}` }, `${ok === "true" ? "✓" : "✕"} ${titulo}${n > 1 ? ` ×${n}` : ""}`);
      })
    );
  }

  function pintarMensaje(m) {
    if (m.rol === "user") chat.append(el("div", { class: "ia-msg ia-msg--user" }, m.texto));
    else if (m.rol === "error") chat.append(el("div", { class: "ia-msg ia-msg--error" }, m.texto));
    else {
      const chips = chipsHerramientas(m.herramientas);
      if (chips) chat.append(chips);
      chat.append(el("div", { class: "ia-msg ia-msg--model md", html: markdownAHtml(m.texto) }));
    }
    return chat.lastElementChild;
  }

  function pintarChat() {
    chat.innerHTML = "";
    for (const m of conv?.mensajes || []) pintarMensaje(m);
    $("#ejemplos").hidden = !!conv?.mensajes?.length;
  }

  function pintarEjemplos() {
    const box = $("#ejemplos");
    box.innerHTML = "";
    for (const e of EJEMPLOS) {
      box.append(
        el(
          "button",
          {
            type: "button",
            class: "ia-chip",
            onclick: () => {
              fPregunta.value = e;
              ajustarAlto();
              fPregunta.focus();
            },
          },
          e
        )
      );
    }
  }

  function bloquear(v) {
    ocupado = v;
    $("#btn-enviar").disabled = v;
    $("#btn-reporte").disabled = v;
  }

  function nuevaConversacion(texto) {
    ctx = crearContexto(obtenerAjustes().maxCalculos);
    conv = {
      id: historial.nuevoId(),
      tipo: "analisis",
      titulo: texto.replace(/\s+/g, " ").slice(0, 70),
      creado: Date.now(),
      contenidos: [],
      mensajes: [],
      log: ctx.log,
      reporte: "",
    };
  }

  async function enviar(texto, { visible = texto, esReporte = false } = {}) {
    if (ocupado) return;
    if (!conv) nuevaConversacion(visible);
    conv.mensajes.push({ rol: "user", texto: visible });
    $("#ejemplos").hidden = true;
    pintarMensaje({ rol: "user", texto: visible });

    const chipsVivos = el("div", { class: "ia-tools", style: "margin-top:8px" });
    const espera = el("div", { class: "ia-msg ia-msg--model" }, [
      el("span", { class: "ia-typing", "aria-label": "Generando respuesta" }, [el("span"), el("span"), el("span")]),
      chipsVivos,
    ]);
    chat.append(espera);
    alFinal();
    bloquear(true);

    const activos = new Map();
    try {
      const r = await ejecutarTurno({
        conv,
        texto,
        clave: claveEnUso(),
        ajustes: obtenerAjustes(),
        ctx,
        onEvento: (e) => {
          if (e.tipo === "herramienta") {
            const chip = el("span", { class: "ia-toolchip" }, `⚙ ${e.titulo}…`);
            activos.set(e.nombre + activos.size, chip);
            chipsVivos.append(chip);
          } else {
            for (const [k, chip] of activos) {
              if (chip.textContent.startsWith("⚙") && chip.textContent.includes(e.titulo)) {
                chip.textContent = `${e.ok ? "✓" : "✕"} ${e.titulo}`;
                chip.classList.toggle("ia-toolchip--error", !e.ok);
                activos.delete(k);
                break;
              }
            }
          }
          alFinal();
        },
      });
      espera.remove();
      let textoVisible = r.texto;
      if (esReporte) {
        conv.reporte = r.texto;
        textoVisible = "Reporte generado. Consúltalo en **Reporte de escenarios**, más abajo: puedes copiarlo, descargarlo o imprimirlo.";
      } else if (r.truncado) {
        textoVisible += "\n\n> Se alcanzó el límite de rondas de cálculo; puedes continuar con una nueva pregunta.";
      }
      const msg = { rol: "model", texto: textoVisible, herramientas: r.herramientas };
      conv.mensajes.push(msg);
      pintarMensaje(msg).scrollIntoView({ behavior: "smooth", block: "start" }); // se lee desde el inicio de la respuesta
      historial.guardar(conv); // en segundo plano
    } catch (err) {
      espera.remove();
      conv.mensajes.pop(); // el turno del usuario se revirtio en el motor
      const texto = err instanceof ErrorGemini ? err.message : `Error inesperado: ${err?.message || err}`;
      pintarMensaje({ rol: "error", texto });
      alFinal();
    } finally {
      bloquear(false);
      pintarReporte();
    }
  }

  $("#btn-enviar").addEventListener("click", () => {
    const t = fPregunta.value.trim();
    if (!t) return fPregunta.focus();
    fPregunta.value = "";
    ajustarAlto();
    enviar(t);
  });
  fPregunta.addEventListener("keydown", (e) => {
    if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) $("#btn-enviar").click();
  });

  $("#btn-nueva").addEventListener("click", () => {
    conv = null;
    ctx = crearContexto(obtenerAjustes().maxCalculos);
    pintarChat();
    pintarReporte();
    fPregunta.focus();
  });

  // ---------- reporte ----------
  const datosReporte = () => ({ narrativa: conv?.reporte || "", log: ctx.log, fecha: fechaLarga(), modelo: obtenerAjustes().modelo });

  function pintarReporte() {
    const { tablas, errores } = armarTablas(ctx.log);
    const hay = tablas.length > 0 || errores.length > 0 || !!conv?.reporte;
    $("#card-reporte").hidden = !hay;
    if (!hay) return;
    const total = tablas.reduce((s, t) => s + t.total, 0);
    $("#reporte-meta").textContent = `${fechaLarga()} · Modelo: ${obtenerAjustes().modelo} · ${total} cálculo${total === 1 ? "" : "s"} ejecutado${total === 1 ? "" : "s"}`;
    const narrativa = conv?.reporte
      ? `<div class="md">${markdownAHtml(conv.reporte)}</div>`
      : `<div class="callout callout-info no-print"><span>Aún no hay texto de reporte. Pulsa «Generar reporte con IA» para que la IA redacte el análisis a partir de los cálculos ejecutados. Las tablas de abajo ya están completas.</span></div>`;
    $("#reporte-cuerpo").innerHTML = `
      ${narrativa}
      <div class="ia-escenarios" style="margin-top:var(--space-5)">${escenariosHtml(ctx.log)}</div>
      <p class="text-muted text-sm" style="margin:var(--space-4) 0 0"><em>${escapeHtml(AVISO_REPORTE)}</em></p>`;
  }

  $("#btn-reporte").addEventListener("click", () => {
    if (!conv || !armarTablas(ctx.log).tablas.length) return alert("Primero haz una consulta que ejecute cálculos.");
    enviar(PROMPT_REPORTE, { visible: "Generar el reporte de escenarios.", esReporte: true });
  });

  $("#btn-copiar").addEventListener("click", async (e) => {
    const d = datosReporte();
    const md = reporteMd(d);
    let ok = true;
    try {
      await navigator.clipboard.write([
        new ClipboardItem({
          "text/html": new Blob([reporteHtmlExportable(d)], { type: "text/html" }),
          "text/plain": new Blob([md], { type: "text/plain" }),
        }),
      ]);
    } catch {
      try {
        await navigator.clipboard.writeText(md);
      } catch {
        ok = false;
      }
    }
    e.target.textContent = ok ? "¡Copiado!" : "No se pudo copiar";
    setTimeout(() => (e.target.textContent = "Copiar"), 1600);
  });

  $("#btn-md").addEventListener("click", () => {
    descargar(`reporte-escenarios-${new Date().toISOString().slice(0, 10)}.md`, reporteMd(datosReporte()), "text/markdown;charset=utf-8");
  });

  $("#btn-imprimir").addEventListener("click", () => {
    document.body.classList.add("imprimiendo-reporte");
    window.addEventListener("afterprint", () => document.body.classList.remove("imprimiendo-reporte"), { once: true });
    window.print();
  });

  // ---------- historial ----------
  const panelHistorial = $("#panel-historial");
  async function pintarHistorial() {
    const lista = await historial.listar("analisis");
    panelHistorial.innerHTML = "";
    if (!lista.length) {
      panelHistorial.innerHTML = `<p class="text-muted" style="margin:0">Aún no hay conversaciones guardadas.</p>`;
      return;
    }
    const cont = el("div", { class: "ia-historial", style: "margin-top:0" });
    for (const c of lista) {
      cont.append(
        el("div", { class: "ia-historial-item" }, [
          el("span", { class: "titulo", title: c.titulo }, c.titulo),
          el("span", { class: "fecha" }, fechaCorta(c.actualizado)),
          el(
            "button",
            {
              type: "button",
              class: "btn btn-sm",
              onclick: () => {
                conv = c;
                ctx = crearContexto(obtenerAjustes().maxCalculos, c.log || []);
                conv.log = ctx.log;
                pintarChat();
                pintarReporte();
                panelHistorial.hidden = true;
                chat.scrollIntoView({ behavior: "smooth", block: "start" });
              },
            },
            "Abrir"
          ),
          el(
            "button",
            {
              type: "button",
              class: "btn btn-sm btn-ghost",
              onclick: async () => {
                await historial.borrar(c.id);
                if (conv?.id === c.id) $("#btn-nueva").click();
                pintarHistorial();
              },
            },
            "Borrar"
          ),
        ])
      );
    }
    panelHistorial.append(cont);
  }
  $("#btn-historial").addEventListener("click", async () => {
    panelHistorial.hidden = !panelHistorial.hidden;
    if (!panelHistorial.hidden) await pintarHistorial();
  });

  pintarEjemplos();
  pintarChat();
}
