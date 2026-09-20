// Corrector de redaccion con IA: eliges un agente (prompt de sistema con su
// tono y ejemplos), pegas un texto y Gemini lo devuelve corregido; luego se
// puede seguir pidiendo ajustes. Los agentes se gestionan desde esta misma
// pantalla (crear, editar, duplicar, borrar, exportar/importar JSON).

import { el, escapeHtml } from "../util/format.js";
import { activarInfos } from "../util/info-campo.js";
import { obtenerAjustes } from "../ai/config.js";
import { claveEnUso } from "../ai/clave.js";
import { generar, ErrorGemini } from "../ai/gemini.js";
import { verificarAcceso } from "../ai/ui-clave.js";
import * as historial from "../ai/historial.js";
import { agregarMicrofono } from "../ai/voz.js";
import { icon } from "../icons.js";
import {
  TONOS,
  cargarAgentes,
  guardarAgentes,
  restaurarPredeterminados,
  nuevoAgenteVacio,
  construirSistema,
  exportarAgentesJson,
  importarAgentesJson,
} from "../ai/agentes.js";

const K_ACTIVO = "ia.agenteActivo";
const MAX_CARACTERES = 30000;

function leerActivo() {
  try {
    return window.localStorage.getItem(K_ACTIVO);
  } catch {
    return null;
  }
}
function guardarActivo(id) {
  try {
    window.localStorage.setItem(K_ACTIVO, id);
  } catch {
    /* sin storage */
  }
}

async function copiarTexto(texto) {
  try {
    await navigator.clipboard.writeText(texto);
    return true;
  } catch {
    const ta = el("textarea", { style: "position:fixed;opacity:0;" });
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

function descargar(nombre, contenido, tipo) {
  const url = URL.createObjectURL(new Blob([contenido], { type: tipo }));
  const a = el("a", { href: url, download: nombre });
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

const fechaCorta = (ms) => new Date(ms).toLocaleString("es-CO", { dateStyle: "short", timeStyle: "short" });

const PH_TEXTO = "Pega aquí el texto a corregir (correo, descripción, acta…)";
const PH_AJUSTE = "Pide un ajuste: más formal, más corto, agrega un cierre…";
// Agentes predeterminados: ejemplo de lo que se pega y nombre del resultado. Los agentes propios usan los textos generales.
const POR_AGENTE = {
  correos: { ph: "Pega aquí el borrador del correo y lo dejo claro y cordial…", etiqueta: "Correo corregido" },
  "descripciones-tecnicas": { ph: "Pega aquí la descripción técnica y la dejo precisa y ordenada…", etiqueta: "Descripción corregida" },
  "informes-actas": { ph: "Pega aquí el informe o el acta y lo dejo claro y bien estructurado…", etiqueta: "Texto corregido" },
  resumenes: { ph: "Pega aquí el texto largo y te entrego un resumen…", etiqueta: "Resumen" },
};
// Atajos de ajuste que aparecen bajo la respuesta: (nombre visible, lo que se le pide a la IA)
const AJUSTES_RAPIDOS = [
  ["Más corto", "Hazlo más corto, sin perder la información clave."],
  ["Más formal", "Hazlo más formal."],
  ["Más cordial", "Hazlo más cordial y cercano, sin perder claridad."],
  ["Explica los cambios", "Explica brevemente qué cambios hiciste y por qué."],
];

export async function render(container) {
  container.innerHTML = `
    <div class="breadcrumb"><a href="#/">Inicio</a> <span>/</span> <a href="#/ia">Funciones de IA</a> <span>/</span> <span>Corrector de redacción</span></div>
    <h1 class="page-title">Corrector de redacción</h1>
  `;
  if (!(await verificarAcceso(container, { reintentar: () => render(container) }))) return;

  let agentes = cargarAgentes();
  let activoId = agentes.some((a) => a.id === leerActivo()) ? leerActivo() : agentes[0].id;
  let conv = null; // conversacion actual
  let ocupado = false;

  container.insertAdjacentHTML(
    "beforeend",
    `
    <div class="card tarjeta-borde form-section" id="tarjeta-agente">
      <div class="form-section-title">${icon("pencil")} Agente</div>
      <div class="tabs ia-pestanas" role="tablist">
        <button type="button" class="tab-btn active" role="tab" aria-selected="true" data-vista="agentes">Agentes</button>
        <button type="button" class="tab-btn" role="tab" aria-selected="false" data-vista="gestionar">Gestionar</button>
        <button type="button" class="tab-btn" role="tab" aria-selected="false" data-vista="historial">Historial</button>
      </div>
      <div id="vista-agentes">
        <div class="ia-agente-lista" id="lista-agentes" role="group" aria-label="Agentes de redacción"></div>
        <p class="ia-desc-agente" id="desc-agente"></p>
      </div>
      <div id="panel-gestor" hidden></div>
      <div id="panel-historial" hidden></div>
    </div>

    <div class="card ia-conv" id="conv">
      <div class="ia-chat ia-chat--hilo" id="chat" aria-live="polite" hidden></div>
      <div class="ia-caja">
        <textarea id="f-texto" rows="1" placeholder="${PH_TEXTO}"></textarea>
      </div>
    </div>
    <div class="ia-acciones">
      <button type="button" class="ia-accion" id="btn-nueva" title="Empezar una conversación nueva">${icon("plus")}<span>Nueva conversación</span></button>
      <button type="button" class="ia-accion ia-accion--enviar" id="btn-enviar" title="Enviar (Ctrl + Enter)">${icon("send")}<span>Enviar</span></button>
    </div>
  `
  );

  const $ = (s) => container.querySelector(s);
  const chat = $("#chat");
  const fTexto = $("#f-texto");
  const mic = agregarMicrofono(fTexto, $("#btn-enviar"), { clase: "ia-accion" });

  // Estilo chat: una sola caja abajo. Sin conversacion recibe el texto a corregir; con una en curso, los ajustes.
  function mostrarHilo(v) {
    mic?.detener();
    chat.hidden = !v;
    fTexto.placeholder = v ? PH_AJUSTE : phTexto();
    ajustarAlto(); // el texto de ejemplo cambia y puede ocupar mas o menos lineas
  }
  function ajustarAlto() {
    const max = window.innerHeight * 0.4;
    fTexto.style.height = "auto";
    fTexto.style.height = `${Math.min(fTexto.scrollHeight, max)}px`;
    fTexto.style.overflowY = fTexto.scrollHeight > max ? "auto" : "hidden"; // sin flechas mientras quepa
  }
  // La caja vacia debe mostrar completo el texto de ejemplo (en el celular ocupa varias lineas): se reajusta al
  // cambiar el ancho (giro de pantalla, menu lateral). Observar solo el ancho evita un bucle con el cambio de alto.
  let anchoPrevio = 0;
  new ResizeObserver(() => {
    if (fTexto.clientWidth !== anchoPrevio) {
      anchoPrevio = fTexto.clientWidth;
      requestAnimationFrame(ajustarAlto); // fuera del callback: cambiar el alto aqui provoca "ResizeObserver loop"
    }
  }).observe(fTexto);
  // La tarjeta crece con la conversacion y el desplazamiento lo hace la pagina.
  const alFinal = () => window.scrollTo({ top: document.documentElement.scrollHeight, behavior: "smooth" });

  const agenteActivo = () => agentes.find((a) => a.id === activoId) || agentes[0];
  const phTexto = () => POR_AGENTE[agenteActivo().id]?.ph || PH_TEXTO;
  const etiquetaRespuesta = () => POR_AGENTE[(conv?.agenteId && agentes.some((a) => a.id === conv.agenteId) ? conv.agenteId : activoId)]?.etiqueta || "Respuesta";

  // ---------- agentes ----------
  function pintarAgentes() {
    const lista = $("#lista-agentes");
    lista.innerHTML = "";
    for (const a of agentes) {
      lista.append(
        el(
          "button",
          {
            type: "button",
            class: "ia-chip",
            "aria-pressed": String(a.id === activoId),
            onclick: () => {
              if (a.id === activoId) return;
              if (conv && !confirm("Cambiar de agente inicia una conversación nueva. ¿Continuar?")) return;
              activoId = a.id;
              guardarActivo(a.id);
              reiniciarConversacion();
              pintarAgentes();
            },
          },
          a.nombre
        )
      );
    }
    $("#desc-agente").textContent = agenteActivo().descripcion || "";
    $("#desc-agente").hidden = !agenteActivo().descripcion;
    if (!conv) fTexto.placeholder = phTexto(); // sin conversacion, el ejemplo cambia con el agente
    ajustarAlto();
  }

  // ---------- conversacion ----------
  function burbuja(rol, texto) {
    const cls = rol === "user" ? "ia-msg ia-msg--user" : rol === "error" ? "ia-msg ia-msg--error" : "ia-msg ia-msg--model ia-msg--plano";
    const nodo = el("div", { class: cls }, texto);
    if (rol === "model") {
      nodo.prepend(el("div", { class: "ia-msg-etiqueta" }, etiquetaRespuesta())); // «Correo corregido», «Resumen»…
      nodo.append(
        el("div", { class: "ia-msg-acciones" }, [
          el("button", {
            type: "button",
            class: "ia-accion",
            title: "Copiar la respuesta",
            html: `${icon("copy")}<span>Copiar</span>`,
            onclick: async (e) => {
              const etiqueta = e.currentTarget.querySelector("span"); // antes del await: luego currentTarget es null
              const ok = await copiarTexto(texto);
              etiqueta.textContent = ok ? "¡Copiado!" : "No se pudo copiar";
              setTimeout(() => (etiqueta.textContent = "Copiar"), 1500);
            },
          }),
        ])
      );
    }
    chat.append(nodo);
    return nodo;
  }

  // Atajos de ajuste (Mas corto, Mas formal…) bajo la ultima respuesta: piden el ajuste sin tener que escribirlo
  function pintarAjustes() {
    chat.querySelector(".ia-ajustes")?.remove();
    const ultimo = conv?.mensajes?.at(-1);
    if (!ultimo || ultimo.rol !== "model" || ocupado) return;
    const fila = el("div", { class: "ia-ajustes", role: "group", "aria-label": "Ajustes rápidos" });
    for (const [nombre, pedido] of AJUSTES_RAPIDOS) {
      fila.append(el("button", { type: "button", class: "ia-chip", onclick: () => enviar(pedido, nombre) }, nombre));
    }
    chat.append(fila);
  }

  function reiniciarConversacion() {
    conv = null;
    chat.innerHTML = "";
    mostrarHilo(false);
  }

  function pintarConversacion() {
    chat.innerHTML = "";
    for (const m of conv.mensajes) burbuja(m.rol, m.texto);
    mostrarHilo(true);
    pintarAjustes();
  }

  function bloquear(v) {
    ocupado = v;
    $("#btn-enviar").disabled = v;
  }

  async function enviar(textoUsuario, textoVisible) {
    if (ocupado) return;
    const agente = agenteActivo();
    if (!conv) {
      conv = {
        id: historial.nuevoId(),
        tipo: "redaccion",
        titulo: (textoVisible || textoUsuario).replace(/\s+/g, " ").slice(0, 70),
        agenteId: agente.id,
        agenteNombre: agente.nombre,
        creado: Date.now(),
        mensajes: [],
        contenidos: [],
      };
    }
    mostrarHilo(true);
    chat.querySelector(".ia-ajustes")?.remove();
    conv.contenidos.push({ role: "user", parts: [{ text: textoUsuario }] });
    conv.mensajes.push({ rol: "user", texto: textoVisible || textoUsuario });
    burbuja("user", textoVisible || textoUsuario);
    const espera = el("div", { class: "ia-msg ia-msg--model" }, [el("span", { class: "ia-typing", "aria-label": "Generando respuesta" }, [el("span"), el("span"), el("span")])]);
    chat.append(espera);
    alFinal();
    bloquear(true);

    try {
      const aj = obtenerAjustes();
      const r = await generar({
        clave: claveEnUso(),
        modelo: aj.modelo,
        sistema: construirSistema(agente),
        contenidos: conv.contenidos,
        temperatura: agente.temperatura ?? aj.temperatura,
      });
      const texto = r.texto.trim() || `(La IA no devolvió texto${r.finishReason ? `: ${r.finishReason}` : ""}. Reformula o acorta el texto.)`;
      conv.contenidos.push({ role: "model", parts: [{ text: r.texto || texto }] });
      conv.mensajes.push({ rol: "model", texto });
      espera.remove();
      ocupado = false;
      const nodoRespuesta = burbuja("model", texto);
      pintarAjustes();
      nodoRespuesta.scrollIntoView({ behavior: "smooth", block: "start" }); // se lee desde el inicio de la respuesta
      historial.guardar(conv); // en segundo plano: un guardado lento no debe bloquear la interfaz
    } catch (err) {
      // se revierte el turno del usuario para no dejar el historial desbalanceado
      conv.contenidos.pop();
      conv.mensajes.pop();
      espera.remove();
      // la burbuja del usuario queda visible junto al error para que sea claro que no se envio
      burbuja("error", err instanceof ErrorGemini ? err.message : `Error inesperado: ${err.message || err}`);
      alFinal();
      if (!fTexto.value) {
        // se devuelve lo escrito a la caja para poder reintentar sin volver a pegarlo
        fTexto.value = textoVisible || textoUsuario;
        ajustarAlto();
      }
      if (!conv.contenidos.length) {
        // fallo el primer envio: se vuelve al modo "texto"
        conv = null;
        fTexto.placeholder = phTexto();
      }
    } finally {
      bloquear(false);
      if (conv) pintarAjustes(); // tras un error se vuelven a ofrecer los atajos de la respuesta anterior
    }
  }

  // "Enviar" sin conversacion corrige el texto; con una en curso envia el ajuste. La caja se vacia al enviar.
  $("#btn-enviar").addEventListener("click", () => {
    const texto = fTexto.value.trim();
    if (!texto) return fTexto.focus();
    let mensaje = texto;
    if (!conv) {
      if (texto.length > MAX_CARACTERES) {
        alert(`El texto es demasiado largo (${texto.length} caracteres). El máximo es ${MAX_CARACTERES}.`);
        return;
      }
      chat.innerHTML = ""; // por si quedo el error de un intento anterior
      mensaje = `Corrige el siguiente texto siguiendo tus instrucciones.\n\nTEXTO:\n<<<\n${texto}\n>>>`;
    }
    fTexto.value = "";
    ajustarAlto();
    enviar(mensaje, texto);
  });
  fTexto.addEventListener("keydown", (e) => {
    if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) $("#btn-enviar").click();
  });

  $("#btn-nueva").addEventListener("click", () => {
    reiniciarConversacion();
    fTexto.value = "";
    ajustarAlto();
    fTexto.focus();
  });

  fTexto.addEventListener("input", ajustarAlto);

  // ---------- historial ----------
  const panelHistorial = $("#panel-historial");
  async function pintarHistorial() {
    panelHistorial.innerHTML = `<p class="text-muted" style="margin:0">Cargando…</p>`; // la lista llega cuando se lee el almacenamiento
    const lista = await historial.listar("redaccion");
    panelHistorial.innerHTML = "";
    if (!lista.length) {
      panelHistorial.insertAdjacentHTML("beforeend", `<p class="text-muted" style="margin:0">Aún no hay conversaciones guardadas.</p>`);
      return;
    }
    const cont = el("div", { class: "ia-historial" });
    for (const c of lista) {
      cont.append(
        el("div", { class: "ia-historial-item" }, [
          el("span", { class: "titulo", title: c.titulo }, `${c.agenteNombre ? `[${c.agenteNombre}] ` : ""}${c.titulo}`),
          el("span", { class: "fecha" }, fechaCorta(c.actualizado)),
          el(
            "button",
            {
              type: "button",
              class: "btn btn-sm",
              onclick: () => {
                conv = c;
                if (agentes.some((a) => a.id === c.agenteId)) {
                  activoId = c.agenteId;
                  guardarActivo(activoId);
                  pintarAgentes();
                }
                pintarConversacion();
                mostrarVista("agentes"); // al abrir una conversacion se vuelve a los agentes (con el de esa conversacion elegido)
                alFinal();
              },
            },
            "Abrir"
          ),
          el(
            "button",
            {
              type: "button",
              class: "btn btn-sm",
              onclick: async () => {
                if (!confirm("¿Borrar esta conversación del historial? No se puede deshacer.")) return;
                await historial.borrar(c.id);
                if (conv?.id === c.id) reiniciarConversacion();
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

  // ---------- gestor de agentes ----------
  const panelGestor = $("#panel-gestor");
  // Las tres vistas de la tarjeta «Agente»: Agentes | Gestionar | Historial (cambian solo el contenido de la tarjeta)
  function mostrarVista(vista) {
    for (const b of container.querySelectorAll(".ia-pestanas .tab-btn")) {
      const activa = b.dataset.vista === vista;
      b.classList.toggle("active", activa);
      b.setAttribute("aria-selected", String(activa));
    }
    $("#vista-agentes").hidden = vista !== "agentes";
    panelGestor.hidden = vista !== "gestionar";
    panelHistorial.hidden = vista !== "historial";
    if (vista === "gestionar") pintarGestor();
    if (vista === "historial") pintarHistorial();
  }
  for (const b of container.querySelectorAll(".ia-pestanas .tab-btn")) b.addEventListener("click", () => mostrarVista(b.dataset.vista));

  let cerrarMenuMas = () => {};

  function persistir() {
    if (!guardarAgentes(agentes)) alert("No se pudieron guardar los agentes en este navegador (¿almacenamiento bloqueado?).");
    if (!agentes.some((a) => a.id === activoId)) activoId = agentes[0].id;
    guardarActivo(activoId);
    pintarAgentes();
  }

  function pintarGestor() {
    panelGestor.innerHTML = `
      <div class="ia-gestor-cabecera">
        <div class="barra-acciones">
          <button type="button" class="btn btn-sm btn-primary btn-con-icono" data-a="nuevo">${icon("plus")} Nuevo agente</button>
          <details class="menu-mas">
            <summary class="btn btn-sm btn-con-icono" aria-label="Más acciones">${icon("dots")} Más</summary>
            <div class="menu-mas-lista">
              <button type="button" data-a="exportar">Exportar JSON</button>
              <button type="button" data-a="importar">Importar JSON</button>
              <button type="button" data-a="restaurar">Restaurar predeterminados</button>
            </div>
          </details>
          <input type="file" accept="application/json,.json" hidden id="f-importar">
        </div>
      </div>
      <div class="ia-historial" id="gestor-lista"></div>
      <div id="gestor-form"></div>
      <div id="gestor-msg"></div>`;
    const lista = panelGestor.querySelector("#gestor-lista");
    for (const a of agentes) {
      lista.append(
        el("div", { class: "ia-historial-item" }, [
          el("span", { class: "titulo", title: a.descripcion }, [a.nombre, a.predefinido ? el("span", { class: "badge", style: "margin-left:8px" }, "predeterminado") : null]),
          el("button", { type: "button", class: "btn btn-sm", onclick: () => pintarFormulario(structuredClone(a), false) }, "Editar"),
          el(
            "button",
            {
              type: "button",
              class: "btn btn-sm",
              onclick: () => {
                const copia = { ...structuredClone(a), id: `agente-${Date.now().toString(36)}`, nombre: `${a.nombre} (copia)`, predefinido: false };
                agentes.push(copia);
                persistir();
                pintarGestor();
              },
            },
            "Duplicar"
          ),
          el(
            "button",
            {
              type: "button",
              class: "btn btn-sm",
              onclick: () => {
                if (agentes.length <= 1) return alert("Debe quedar al menos un agente.");
                if (!confirm(`¿Eliminar el agente "${a.nombre}"?`)) return;
                agentes = agentes.filter((x) => x.id !== a.id);
                persistir();
                pintarGestor();
              },
            },
            "Eliminar"
          ),
        ])
      );
    }

    const msg = (tipo, texto) => {
      panelGestor.querySelector("#gestor-msg").innerHTML = `<div class="callout callout-${tipo}" style="margin:var(--space-4) 0 0"><span>${escapeHtml(texto)}</span></div>`;
    };

    // el menu «Mas» se cierra al elegir una opcion o al pulsar fuera
    const menuMas = panelGestor.querySelector(".menu-mas");
    menuMas.addEventListener("click", (e) => e.target.closest("button") && (menuMas.open = false));
    document.removeEventListener("click", cerrarMenuMas);
    cerrarMenuMas = (e) => !menuMas.contains(e.target) && (menuMas.open = false);
    document.addEventListener("click", cerrarMenuMas);
    panelGestor.querySelector('[data-a="nuevo"]').addEventListener("click", () => pintarFormulario(nuevoAgenteVacio(), true));
    panelGestor.querySelector('[data-a="exportar"]').addEventListener("click", () => {
      descargar("agentes-redaccion.json", exportarAgentesJson(agentes), "application/json");
    });
    const inputArchivo = panelGestor.querySelector("#f-importar");
    panelGestor.querySelector('[data-a="importar"]').addEventListener("click", () => inputArchivo.click());
    inputArchivo.addEventListener("change", async () => {
      const archivo = inputArchivo.files[0];
      if (!archivo) return;
      try {
        const importados = importarAgentesJson(await archivo.text());
        const ids = new Set(agentes.map((a) => a.id));
        for (const a of importados) {
          if (ids.has(a.id)) {
            a.id = `agente-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 5)}`;
            a.nombre = `${a.nombre} (importado)`;
          }
          ids.add(a.id);
          agentes.push(a);
        }
        persistir();
        pintarGestor();
        panelGestor.querySelector("#gestor-msg").innerHTML = "";
        msg("success", `Se importaron ${importados.length} agente(s).`);
      } catch (err) {
        msg("danger", err.message || "No se pudo importar el archivo.");
      }
    });
    panelGestor.querySelector('[data-a="restaurar"]').addEventListener("click", () => {
      if (!confirm("Se descartarán los cambios y agentes propios, y volverán los 4 predeterminados. ¿Continuar?")) return;
      restaurarPredeterminados();
      agentes = cargarAgentes();
      activoId = agentes[0].id;
      guardarActivo(activoId);
      pintarAgentes();
      pintarGestor();
    });
  }

  function pintarFormulario(a, esNuevo) {
    const cont = panelGestor.querySelector("#gestor-form");
    cont.innerHTML = `
      <div class="ia-editor">
        <h3 style="margin-top:0">${esNuevo ? "Nuevo agente" : `Editar: ${escapeHtml(a.nombre)}`}</h3>
        <div class="grid-2">
          <div class="field"><label for="g-nombre">Nombre</label><input type="text" id="g-nombre" maxlength="80"></div>
          <div class="field"><label for="g-desc">Descripción corta</label><input type="text" id="g-desc" maxlength="300"></div>
        </div>
        <div class="grid-3">
          <div class="field"><label for="g-tono" data-info="«Sin tono» no agrega nada al prompt: solo mandan tus instrucciones.">Tono</label><select id="g-tono"><option value="">Sin tono</option>${TONOS.map((t) => `<option>${t}</option>`).join("")}</select></div>
          <div class="field"><label for="g-temp" data-info="Menor = más fiel al texto. Mayor = más libre.">Temperatura (0–1.5)</label><input type="number" id="g-temp" min="0" max="1.5" step="0.1"></div>
          <div class="field"><label>&nbsp;</label><label class="checkbox-row"><input type="checkbox" id="g-explicar"> Explicar los cambios realizados</label></div>
        </div>
        <div class="field">
          <label for="g-instr" data-info="Se agregan a unas reglas base (español de Colombia, no inventar datos ni cambiar cifras).">Instrucciones del agente</label>
          <textarea id="g-instr" rows="7" placeholder="Describe cómo debe trabajar: rol, estructura del resultado, qué conservar, qué evitar…"></textarea>
        </div>
        <div>
          <label style="font-size:.82rem;font-weight:600;color:var(--text-muted)">Ejemplos "antes / después" (opcional, máx. 5)</label>
          <div id="g-ejemplos" style="margin-top:var(--space-2)"></div>
          <button type="button" class="btn btn-sm" id="g-add-ej">Agregar ejemplo</button>
        </div>
        <div class="btn-row">
          <button type="button" class="btn btn-primary" id="g-guardar">Guardar agente</button>
          <button type="button" class="btn" id="g-cancelar">Cancelar</button>
        </div>
      </div>`;
    activarInfos(cont);
    const g = (s) => cont.querySelector(s);
    g("#g-nombre").value = a.nombre;
    g("#g-desc").value = a.descripcion || "";
    g("#g-tono").value = a.tono === "" || TONOS.includes(a.tono) ? a.tono : TONOS[1];
    g("#g-temp").value = a.temperatura ?? 0.4;
    g("#g-explicar").checked = !!a.explicarCambios;
    g("#g-instr").value = a.instrucciones || "";

    const ejemplos = (a.ejemplos || []).map((e) => ({ ...e }));
    function pintarEjemplos() {
      const box = g("#g-ejemplos");
      box.innerHTML = "";
      ejemplos.forEach((e, i) => {
        const fila = el("div", { class: "ia-ejemplo" }, [
          el("div", { class: "field", style: "margin-bottom:var(--space-2)" }, [el("label", {}, `Antes (${i + 1})`), el("textarea", { rows: "3", "data-k": "antes" })]),
          el("div", { class: "field", style: "margin-bottom:var(--space-2)" }, [el("label", {}, `Después (${i + 1})`), el("textarea", { rows: "3", "data-k": "despues" })]),
          el("button", { type: "button", class: "btn btn-sm btn-ghost", onclick: () => { ejemplos.splice(i, 1); pintarEjemplos(); } }, "Quitar"),
        ]);
        fila.querySelector('[data-k="antes"]').value = e.antes || "";
        fila.querySelector('[data-k="despues"]').value = e.despues || "";
        fila.querySelector('[data-k="antes"]').addEventListener("input", (ev) => (e.antes = ev.target.value));
        fila.querySelector('[data-k="despues"]').addEventListener("input", (ev) => (e.despues = ev.target.value));
        box.append(fila);
      });
      g("#g-add-ej").hidden = ejemplos.length >= 5;
    }
    pintarEjemplos();
    g("#g-add-ej").addEventListener("click", () => {
      ejemplos.push({ antes: "", despues: "" });
      pintarEjemplos();
    });

    g("#g-cancelar").addEventListener("click", () => (cont.innerHTML = ""));
    g("#g-guardar").addEventListener("click", () => {
      const nombre = g("#g-nombre").value.trim();
      if (!nombre) return g("#g-nombre").focus();
      if (!g("#g-instr").value.trim()) {
        alert("Escribe las instrucciones del agente.");
        return g("#g-instr").focus();
      }
      let temp = parseFloat(String(g("#g-temp").value).replace(",", "."));
      temp = Number.isFinite(temp) ? Math.min(Math.max(temp, 0), 1.5) : 0.4;
      const nuevo = {
        ...a,
        nombre,
        descripcion: g("#g-desc").value.trim(),
        tono: g("#g-tono").value,
        temperatura: temp,
        explicarCambios: g("#g-explicar").checked,
        instrucciones: g("#g-instr").value.trim(),
        ejemplos: ejemplos.filter((e) => e.antes?.trim() || e.despues?.trim()),
      };
      const i = agentes.findIndex((x) => x.id === nuevo.id);
      if (i >= 0) agentes[i] = nuevo;
      else agentes.push(nuevo);
      if (esNuevo) activoId = nuevo.id;
      persistir();
      pintarGestor();
    });
    cont.scrollIntoView({ behavior: "smooth", block: "nearest" });
  }

  pintarAgentes();
}
