// Configuracion de la conexion con IA: proveedor (Gemini/OpenAI/Claude),
// clave de API, modelo, parametros y gestion de datos locales (historial,
// agentes).
// Diseño (2026-09-19): mismo estilo de Perfil y de las calculadoras (tarjetas de 16 px con barra de titulo e icono, ayudas «i»).
// Ajustes avanzados plegados; «Actualizar lista» de modelos separado de «Probar conexion».
// Multi-proveedor (2026-09-23): el proveedor se elige aqui de forma GLOBAL (no por agente); OpenAI y
// Claude solo admiten clave LOCAL (BYOK), sin fuente «personal»/«compartida» en el servidor (eso sigue
// siendo exclusivo de Gemini, ver js/ai/clave.js). La gestion de esa clave en el servidor (antes en
// Perfil) se trasladó aquí (2026-09-23, pedido del usuario: toda la config de IA en un solo lugar):
// tarjeta «Clave en servidor», solo si el proveedor activo la admite (soportaFuenteServidor), entre
// «Modelo» y «Datos y privacidad». Se resuelve sola (backend/sesion/perfil) y si algo falta (sin
// servicio, sin sesion) simplemente no aparece, en vez de mostrar un error: el resto de la pantalla debe
// seguir siendo utilizable.

import { escapeHtml } from "../util/format.js";
import { icon } from "../icons.js";
import { activarInfos } from "../util/info-campo.js";
import { obtenerClave, guardarClave, borrarClave, clavePersistente, enmascarar, obtenerAjustes, guardarAjustes, borrarAjustes } from "../ai/config.js";
import { PROVEEDORES, ORDEN_PROVEEDORES, obtenerProveedorActivo, guardarProveedorActivo, ErrorProveedorIA } from "../ai/proveedores.js";
import { abrirInstructivo } from "../ai/ui-clave.js";
import { FUENTES, obtenerFuente, guardarFuente, olvidarClaveServidor } from "../ai/clave.js";
import { obtenerBackend, esperarSesion, ErrorAcceso } from "../auth/backend.js";
import { contar, borrarTodo } from "../ai/historial.js";
import { restaurarPredeterminados } from "../ai/agentes.js";

// Nombres cortos de la clave en uso (los mismos de antes, en Perfil)
const NOMBRE_FUENTE = { local: "Este navegador", personal: "Mi clave personal (servidor)", compartida: "Clave compartida (servidor)" };
// Cada opcion dice DONDE esta guardada la clave que van a usar las funciones con IA
const OPCIONES_FUENTE = {
  local: { titulo: "Este navegador", donde: "mi clave, guardada solo en este equipo" },
  personal: { titulo: "Mi clave personal (servidor)", donde: "mi clave, guardada en el servidor y disponible en cualquier dispositivo" },
  compartida: { titulo: "Clave compartida (servidor)", donde: "la clave del administrador, para todos los usuarios" },
};
const AYUDA_FUENTE = "Las funciones con IA necesitan una clave de Gemini. Elige dónde está guardada la que vas a usar.";
const AYUDA_MODELO = "«Actualizar lista» carga los modelos disponibles con tu clave.";
const AYUDA_TEMP = "Menor = respuestas más estables. Los agentes de redacción usan la suya.";
const AYUDA_RONDAS = "Idas y vueltas con las calculadoras en cada pregunta.";
const AYUDA_CALCULOS = "Protege tu cupo gratuito en barridos grandes.";
const AYUDA_MAX_TOKENS = "Tamaño máximo de cada respuesta de Claude; una respuesta larga (reporte, tablas) puede necesitar más.";

function privacidad(proveedor, nombre) {
  const base = [
    `Lo que envías a la IA se transmite a los servidores de ${nombre}.`,
    "No pegues información confidencial de la empresa, datos personales ni datos de clientes.",
    "Si usas el dictado por voz, el audio lo transcribe el servicio de reconocimiento de voz de tu navegador.",
  ];
  if (proveedor === "gemini") base.splice(1, 0, "Con el plan gratuito, Google puede usar esas conversaciones para mejorar sus productos.");
  return base;
}

export async function render(container) {
  const barra = (ico, titulo) => `<div class="form-section-title">${icon(ico)} ${titulo}</div>`;
  const proveedor = obtenerProveedorActivo();
  const meta = PROVEEDORES[proveedor];
  const { listarModelos, elegirModeloPorDefecto } = meta.cliente;
  const tempMax = proveedor === "anthropic" ? 1 : 1.5;
  const ayudaClave = `La clave se guarda en este navegador. Si no marcas «Recordar en este equipo», se borra al cerrar el navegador. Solo se envía a ${meta.nombre}, nunca a otro servidor.`;

  container.innerHTML = `
    <div class="breadcrumb"><a href="#/">Inicio</a> <span>/</span> <a href="#/ia">Funciones con IA</a> <span>/</span> <span>Configuración</span></div>
    <h1 class="page-title">Configuración de IA</h1>

    <div class="card tarjeta-borde form-section" id="ia-proveedor">
      ${barra("robot", "Proveedor de IA")}
      <div class="field">
        <label for="f-proveedor" data-info="Cada proveedor usa su propia clave, modelo y ajustes; cambiarlo aquí afecta a Análisis y al Corrector de redacción.">Proveedor</label>
        <select id="f-proveedor">
          ${ORDEN_PROVEEDORES.map((id) => `<option value="${id}"${id === proveedor ? " selected" : ""}>${escapeHtml(PROVEEDORES[id].nombre)}</option>`).join("")}
        </select>
      </div>
    </div>

    <div class="card tarjeta-borde form-section" id="ia-conexion">
      ${barra("key", `Conexión con ${meta.nombreCorto}`)}
      ${
        meta.soportaFuenteServidor
          ? `<p class="text-muted text-sm" id="fuente-clave" style="margin:0 0 var(--space-2)"></p>
             <p class="text-muted text-sm" id="estado-clave" style="margin:0 0 var(--space-4)"></p>
             <div id="aviso-fuente"></div>`
          : `<p class="text-muted text-sm" id="estado-clave" style="margin:0 0 var(--space-4)"></p>`
      }
      <div class="field">
        <div class="ia-etiqueta-fila">
          <label for="f-clave" data-info="${escapeHtml(ayudaClave)}">Clave de API</label>
          <button type="button" class="btn-enlace" id="btn-instructivo">¿Cómo obtener mi clave?</button>
        </div>
        <div class="input-group">
          <input type="password" id="f-clave" autocomplete="off" spellcheck="false" placeholder="${escapeHtml(meta.placeholderClave)}">
          <button type="button" class="btn" id="btn-ver" style="flex: 0 0 auto;">Mostrar</button>
        </div>
        <label class="checkbox-row" style="margin-top:var(--space-2)"><input type="checkbox" id="chk-recordar"> Recordar en este equipo</label>
      </div>
      <div class="btn-row" style="margin-top: 0;">
        <button type="button" class="btn btn-primary" id="btn-guardar">Guardar clave</button>
        <button type="button" class="btn" id="btn-probar">Probar conexión</button>
        <button type="button" class="btn btn-con-icono" id="btn-borrar-clave">${icon("trash")} Borrar clave</button>
      </div>
      <div id="msg-conexion" style="margin-top: var(--space-4);"></div>
    </div>

    <div class="card tarjeta-borde form-section" id="ia-modelo">
      ${barra("sparkles", "Modelo")}
      <div class="field">
        <label for="f-modelo" data-info="${escapeHtml(AYUDA_MODELO)}">Modelo</label>
        <div class="ia-modelo-fila">
          <select id="f-modelo"></select>
          <button type="button" class="btn" id="btn-actualizar-modelos">Actualizar lista</button>
        </div>
        <div id="msg-modelo"></div>
      </div>
      <details class="ia-avanzado" id="ia-avanzado">
        <summary>Ajustes avanzados</summary>
        <div class="grid-3" style="margin-top: var(--space-3);">
          <div class="field">
            <label for="f-temp" data-info="${escapeHtml(AYUDA_TEMP)}">Temperatura (análisis)</label>
            <input type="number" id="f-temp" min="0" max="${tempMax}" step="0.1">
          </div>
          <div class="field">
            <label for="f-rondas" data-info="${escapeHtml(AYUDA_RONDAS)}">Rondas máximas por pregunta</label>
            <input type="number" id="f-rondas" min="1" max="30" step="1">
          </div>
          <div class="field">
            <label for="f-calculos" data-info="${escapeHtml(AYUDA_CALCULOS)}">Cálculos máximos por pregunta</label>
            <input type="number" id="f-calculos" min="1" max="400" step="1">
          </div>
          ${
            proveedor === "anthropic"
              ? `<div class="field">
                   <label for="f-max-tokens" data-info="${escapeHtml(AYUDA_MAX_TOKENS)}">Tokens máximos por respuesta</label>
                   <input type="number" id="f-max-tokens" min="256" max="32000" step="256">
                 </div>`
              : ""
          }
        </div>
      </details>
      <div class="btn-row" style="margin-top: var(--space-4);">
        <button type="button" class="btn btn-primary" id="btn-guardar-ajustes">Guardar ajustes</button>
        <button type="button" class="btn" id="btn-restaurar-ajustes">Restablecer valores</button>
      </div>
      <div id="msg-ajustes" style="margin-top: var(--space-4);"></div>
    </div>

    ${meta.soportaFuenteServidor ? `<div id="ia-servidor-slot"></div>` : ""}

    <div class="card tarjeta-borde form-section" id="ia-datos">
      ${barra("lock", "Datos y privacidad")}
      <p class="text-muted text-sm" id="info-datos" style="margin:0 0 var(--space-3)"></p>
      <div class="btn-row" style="margin-top: 0;">
        <button type="button" class="btn btn-con-icono" id="btn-borrar-historial">${icon("trash")} Borrar historial de conversaciones</button>
        <button type="button" class="btn" id="btn-restaurar-agentes">Restaurar agentes predeterminados</button>
      </div>
      <div id="msg-datos" style="margin-top: var(--space-4);"></div>
      <div class="callout callout-warning ca-avisos" id="ia-privacidad"><div><strong>Privacidad</strong><ul>${privacidad(proveedor, meta.nombre)
        .map((p) => `<li>${escapeHtml(p)}</li>`)
        .join("")}</ul></div></div>
    </div>
  `;
  activarInfos(container);

  const $ = (id) => container.querySelector(id);
  const estadoClave = $("#estado-clave");
  const fClave = $("#f-clave");
  const chkRecordar = $("#chk-recordar");
  const selModelo = $("#f-modelo");
  const msgConexion = $("#msg-conexion");
  const msgModelo = $("#msg-modelo");
  const msgAjustes = $("#msg-ajustes");
  const msgDatos = $("#msg-datos");

  const aviso = (el, tipo, texto) => {
    el.innerHTML = `<div class="callout callout-${tipo}" style="margin:var(--space-3) 0 0"><span>${escapeHtml(texto)}</span></div>`;
  };
  const mensajeError = (err) => (err instanceof ErrorProveedorIA ? err.message : `Error inesperado: ${err?.message || err}`);

  function pintarEstadoClave() {
    const clave = obtenerClave(proveedor);
    estadoClave.innerHTML = clave
      ? `Clave guardada en este navegador: <span class="mono">${escapeHtml(enmascarar(clave))}</span> · ${
          clavePersistente(proveedor) ? "recordada en este equipo" : "solo durante esta sesión"
        }`
      : "Todavía no hay una clave guardada en este navegador.";
    chkRecordar.checked = clave ? clavePersistente(proveedor) : true;
    fClave.value = clave || ""; // la clave guardada aparece en el campo (oculta con puntos; «Mostrar» la revela)
  }

  function pintarModelos(lista, seleccionado) {
    const opciones = [...lista];
    if (seleccionado && !opciones.some((m) => m.id === seleccionado)) opciones.unshift({ id: seleccionado, nombre: seleccionado });
    selModelo.innerHTML = opciones
      .map((m) => `<option value="${escapeHtml(m.id)}"${m.id === seleccionado ? " selected" : ""}>${escapeHtml(m.id)}</option>`)
      .join("");
  }

  function pintarAjustes() {
    const a = obtenerAjustes(proveedor);
    pintarModelos(a.modelo ? [{ id: a.modelo, nombre: a.modelo }] : [], a.modelo);
    $("#f-temp").value = a.temperatura;
    $("#f-rondas").value = a.maxRondas;
    $("#f-calculos").value = a.maxCalculos;
    if (proveedor === "anthropic") $("#f-max-tokens").value = a.maxTokens;
  }

  async function pintarDatos() {
    const n = await contar();
    $("#info-datos").textContent = `Conversaciones guardadas: ${n}. Los agentes de redacción y los ajustes también se guardan aquí.`;
  }

  // Clave de Gemini en el servidor (personal/compartida): antes vivía en Perfil, ahora aquí (solo con
  // Gemini activo). Se resuelve sola; si falta el servicio, la sesión o el perfil, no muestra nada (el
  // resto de la pantalla se usa igual sin necesidad de tener eso resuelto).
  async function pintarClaveServidor() {
    const slot = $("#ia-servidor-slot");
    if (!slot) return;
    let b;
    try {
      b = await obtenerBackend();
    } catch {
      b = null;
    }
    if (!b) return;
    let u;
    try {
      u = await esperarSesion(b);
    } catch {
      u = null;
    }
    if (!u) return;
    let perfil;
    try {
      perfil = await b.obtenerPerfil();
    } catch {
      perfil = null;
    }
    if (!perfil) return;
    const esAdmin = perfil.rol === "admin";

    const mensajeAcceso = (e) => (e instanceof ErrorAcceso ? e.message : `Error inesperado: ${e?.message || e}`);
    const avisoLocal = (nodo, tipo, texto) => {
      nodo.innerHTML = `<div class="callout callout-${tipo}" style="margin:var(--space-3) 0 0"><span>${escapeHtml(texto)}</span></div>`;
    };

    slot.innerHTML = `<div class="card tarjeta-borde form-section" id="ia-servidor">${barra("key", "Clave en servidor")}<p class="text-muted" style="margin:0">Cargando…</p></div>`;
    const box = slot.querySelector("#ia-servidor");

    let hayPersonal = false;
    let hayCompartida = false;
    try {
      hayPersonal = !!(await b.leerClavePersonal());
      hayCompartida = !!(await b.leerClaveCompartida());
    } catch (e) {
      box.innerHTML = `${barra("key", "Clave en servidor")}<div class="callout callout-danger" style="margin:0"><span>${escapeHtml(mensajeAcceso(e))}</span></div>`;
      return;
    }
    const estado = (hay) => (hay ? `<span class="badge badge-success">Configurada</span>` : `<span class="badge">Sin configurar</span>`);
    const disponible = { local: true, personal: hayPersonal, compartida: hayCompartida };

    box.innerHTML = `
      ${barra("key", "Clave en servidor")}
      <div class="field">
        <label data-info="${escapeHtml(AYUDA_FUENTE)}">¿Dónde está la clave de Gemini que se usará?</label>
        <div class="ca-fuentes" id="ia-fuentes"></div>
      </div>
      <div id="ia-fuente-detalle"></div>
      <div id="ia-fuente-avisos"></div>`;

    const contFuentes = box.querySelector("#ia-fuentes");
    const detalle = box.querySelector("#ia-fuente-detalle");
    const avisosFuente = box.querySelector("#ia-fuente-avisos");

    contFuentes.innerHTML = FUENTES.map((f) => {
      const extra = f === "local" ? "" : ` ${estado(disponible[f])}`;
      return `<label for="ia-f-${f}" class="checkbox-row" style="color:var(--text)">
        <input type="radio" name="ia-fuente" id="ia-f-${f}" value="${f}"${obtenerFuente() === f ? " checked" : ""}>
        <span><strong>${escapeHtml(OPCIONES_FUENTE[f].titulo)}</strong> <span class="text-muted text-sm">— ${escapeHtml(OPCIONES_FUENTE[f].donde)}</span>${extra}</span>
      </label>`;
    }).join("");
    for (const f of FUENTES) {
      box.querySelector(`#ia-f-${f}`).addEventListener("change", () => {
        guardarFuente(f);
        pintarDetalleFuente();
      });
    }

    const campoClave = (tipo, etiqueta, ayuda, hay) => `
      <div class="field">
        <label for="ia-serv-k-${tipo}" data-info="${escapeHtml(ayuda)}">${etiqueta} ${estado(hay)}</label>
        <div class="input-group">
          <input type="password" id="ia-serv-k-${tipo}" autocomplete="off" spellcheck="false" placeholder="Pega la clave de Gemini (AIza…)">
          <button type="button" class="btn btn-primary" id="ia-serv-g-${tipo}" style="flex:0 0 auto">Guardar</button>
          <button type="button" class="btn" id="ia-serv-b-${tipo}" style="flex:0 0 auto" ${hay ? "" : "disabled"}>Borrar</button>
        </div>
      </div>
      <div id="ia-serv-msg-${tipo}"></div>`;

    function pintarDetalleFuente() {
      const fuente = obtenerFuente();
      if (fuente === "personal") {
        detalle.innerHTML = campoClave("personal", "Mi clave personal", "Solo tú puedes leerla; ni siquiera los administradores.", hayPersonal);
      } else if (fuente === "compartida") {
        detalle.innerHTML = esAdmin
          ? campoClave("compartida", "Clave compartida", "Una sola clave para todos los usuarios autorizados; solo los administradores la cambian.", hayCompartida)
          : `<p class="text-muted text-sm" style="margin:0">${hayCompartida ? "Clave compartida configurada por el administrador" : "Clave compartida aún no configurada por el administrador"} ${estado(hayCompartida)}</p>`;
      } else {
        detalle.innerHTML = `<p class="text-muted text-sm" style="margin:0">Se usa la clave guardada en este navegador, en la tarjeta «Conexión con ${escapeHtml(meta.nombreCorto)}» de arriba.</p>`;
      }
      pintarAvisosFuente(fuente);
      activarInfos(box);
      const g = (t) => box.querySelector(`#ia-serv-g-${t}`);
      const bo = (t) => box.querySelector(`#ia-serv-b-${t}`);
      if (g("personal")) {
        g("personal").addEventListener("click", guardarClaveServidor("personal"));
        bo("personal").addEventListener("click", borrarClaveServidor("personal"));
      }
      if (g("compartida")) {
        g("compartida").addEventListener("click", guardarClaveServidor("compartida"));
        bo("compartida").addEventListener("click", borrarClaveServidor("compartida"));
      }
    }

    function pintarAvisosFuente(fuente) {
      const puntos = [];
      if (!disponible[fuente]) {
        puntos.push(
          fuente === "compartida" && !esAdmin
            ? "El administrador aún no ha configurado la clave compartida: las funciones con IA te pedirán una clave."
            : `Todavía no has configurado ${fuente === "compartida" ? "la clave compartida" : "esta clave"}: las funciones con IA te la pedirán.`
        );
      }
      if (esAdmin && fuente === "compartida") {
        puntos.push(
          "La clave compartida la puede leer cualquier usuario autorizado (técnicamente, con las herramientas del navegador): compártela solo con personas de confianza.",
          "Si alguien sale de la lista pierde el acceso, pero cambia la clave si sospechas que se filtró.",
          "Todos los usuarios consumen el mismo cupo gratuito."
        );
      }
      avisosFuente.innerHTML = puntos.length
        ? `<div class="callout callout-warning ca-avisos"><div><strong>Ten presente</strong><ul>${puntos.map((p) => `<li>${escapeHtml(p)}</li>`).join("")}</ul></div></div>`
        : "";
    }

    const guardarClaveServidor = (tipo) => async () => {
      const inp = box.querySelector(`#ia-serv-k-${tipo}`);
      const msg = box.querySelector(`#ia-serv-msg-${tipo}`);
      const valor = inp.value.trim();
      if (!valor) return avisoLocal(msg, "warning", "Escribe o pega la clave antes de guardar.");
      try {
        await (tipo === "personal" ? b.guardarClavePersonal(valor) : b.guardarClaveCompartida(valor));
        olvidarClaveServidor();
        inp.value = "";
        await pintarClaveServidor();
        avisoLocal(slot.querySelector(`#ia-serv-msg-${tipo}`), "success", "Clave guardada en el servidor.");
      } catch (e) {
        avisoLocal(msg, "danger", mensajeAcceso(e));
      }
    };
    const borrarClaveServidor = (tipo) => async () => {
      const msg = box.querySelector(`#ia-serv-msg-${tipo}`);
      if (!confirm(`¿Borrar la clave ${tipo === "personal" ? "personal" : "compartida"} del servidor?`)) return;
      try {
        await (tipo === "personal" ? b.guardarClavePersonal(null) : b.guardarClaveCompartida(null));
        olvidarClaveServidor();
        await pintarClaveServidor();
        avisoLocal(slot.querySelector(`#ia-serv-msg-${tipo}`), "info", "Clave borrada del servidor.");
      } catch (e) {
        avisoLocal(msg, "danger", mensajeAcceso(e));
      }
    };

    pintarDetalleFuente();
    activarInfos(box);
  }

  if (meta.soportaFuenteServidor) {
    // Origen de la clave que se esta usando (se elige mas abajo, en «Clave en servidor»). Si no es
    // «Este navegador», el campo de esta tarjeta no se usa.
    const fuente = obtenerFuente();
    $("#fuente-clave").innerHTML =
      `Las funciones con IA están usando <span class="badge">${escapeHtml(NOMBRE_FUENTE[fuente])}</span> · ` + `<a href="#ia-servidor">Cambiar abajo, en «Clave en servidor»</a>`;
    if (fuente !== "local") {
      $("#aviso-fuente").innerHTML = `<div class="callout callout-info" style="margin:0 0 var(--space-4)"><span>Estás usando una clave del servidor: la clave de este navegador solo se usa si eliges «Este navegador» abajo, en «Clave en servidor».</span></div>`;
    }
  }

  pintarEstadoClave();
  pintarAjustes();
  pintarDatos();
  if (meta.soportaFuenteServidor) pintarClaveServidor();

  $("#f-proveedor").addEventListener("change", (e) => {
    guardarProveedorActivo(e.target.value);
    render(container);
  });

  $("#btn-ver").addEventListener("click", () => {
    const visible = fClave.type === "text";
    fClave.type = visible ? "password" : "text";
    $("#btn-ver").textContent = visible ? "Mostrar" : "Ocultar";
  });

  $("#btn-instructivo").addEventListener("click", () => abrirInstructivo(proveedor));

  $("#btn-guardar").addEventListener("click", () => {
    const valor = fClave.value.trim();
    if (!valor) return aviso(msgConexion, "warning", "Escribe o pega la clave antes de guardar.");
    if (!guardarClave(valor, chkRecordar.checked, proveedor)) {
      return aviso(msgConexion, "danger", "No se pudo guardar la clave en este navegador (¿almacenamiento bloqueado?).");
    }
    pintarEstadoClave();
    aviso(msgConexion, "success", "Clave guardada. Pulsa «Probar conexión» para verificarla y «Actualizar lista» para cargar los modelos.");
  });

  $("#btn-borrar-clave").addEventListener("click", () => {
    if (!obtenerClave(proveedor)) return aviso(msgConexion, "info", "No hay una clave guardada en este navegador.");
    if (!confirm("¿Borrar la clave guardada en este navegador? Tendrás que volver a pegarla para usarla en las funciones con IA.")) return;
    borrarClave(proveedor);
    pintarEstadoClave();
    aviso(msgConexion, "info", "Clave eliminada de este navegador.");
  });

  // «Probar conexion» solo VERIFICA la clave; la lista de modelos se carga aparte con «Actualizar lista».
  $("#btn-probar").addEventListener("click", async () => {
    const clave = fClave.value.trim() || obtenerClave(proveedor);
    if (!clave) return aviso(msgConexion, "warning", "Primero guarda o pega una clave.");
    const btn = $("#btn-probar");
    btn.disabled = true;
    btn.textContent = "Probando…";
    try {
      const modelos = await listarModelos(clave);
      if (!modelos.length) aviso(msgConexion, "warning", "La clave funciona, pero no hay modelos disponibles para ella.");
      else aviso(msgConexion, "success", `Conexión correcta: la clave es válida (${modelos.length} modelos disponibles).`);
    } catch (err) {
      aviso(msgConexion, "danger", mensajeError(err));
    } finally {
      btn.disabled = false;
      btn.textContent = "Probar conexión";
    }
  });

  $("#btn-actualizar-modelos").addEventListener("click", async () => {
    const clave = fClave.value.trim() || obtenerClave(proveedor);
    if (!clave) return aviso(msgModelo, "warning", `Primero guarda o pega una clave en «Conexión con ${meta.nombreCorto}».`);
    const btn = $("#btn-actualizar-modelos");
    btn.disabled = true;
    btn.textContent = "Actualizando…";
    try {
      const modelos = await listarModelos(clave);
      if (!modelos.length) {
        aviso(msgModelo, "warning", "No hay modelos disponibles para esta clave.");
        return;
      }
      const a = obtenerAjustes(proveedor);
      const actual = modelos.some((m) => m.id === a.modelo) ? a.modelo : elegirModeloPorDefecto(modelos) || modelos[0].id;
      pintarModelos(modelos, actual);
      guardarAjustes({ modelo: actual }, proveedor);
      aviso(msgModelo, "success", `${modelos.length} modelos disponibles; modelo activo: ${actual}.`);
    } catch (err) {
      aviso(msgModelo, "danger", mensajeError(err));
    } finally {
      btn.disabled = false;
      btn.textContent = "Actualizar lista";
    }
  });

  $("#btn-guardar-ajustes").addEventListener("click", () => {
    const def = obtenerAjustes(proveedor);
    const num = (id, valDefecto, min, max, entero) => {
      const campo = $(id);
      if (!campo) return valDefecto;
      let v = parseFloat(String(campo.value).replace(",", "."));
      if (!Number.isFinite(v)) v = valDefecto;
      v = Math.min(Math.max(v, min), max);
      return entero ? Math.round(v) : v;
    };
    const nuevos = {
      modelo: selModelo.value || def.modelo,
      temperatura: num("#f-temp", def.temperatura, 0, tempMax, false),
      maxRondas: num("#f-rondas", def.maxRondas, 1, 30, true),
      maxCalculos: num("#f-calculos", def.maxCalculos, 1, 400, true),
      ...(proveedor === "anthropic" ? { maxTokens: num("#f-max-tokens", def.maxTokens, 256, 32000, true) } : {}),
    };
    guardarAjustes(nuevos, proveedor);
    pintarAjustes();
    aviso(msgAjustes, "success", "Ajustes guardados.");
  });

  $("#btn-restaurar-ajustes").addEventListener("click", () => {
    borrarAjustes(proveedor);
    pintarAjustes();
    aviso(msgAjustes, "info", "Ajustes restablecidos a sus valores por defecto.");
  });

  $("#btn-borrar-historial").addEventListener("click", async () => {
    if (!confirm("¿Borrar todo el historial de conversaciones guardado en este navegador?")) return;
    const ok = await borrarTodo();
    await pintarDatos();
    aviso(msgDatos, ok ? "success" : "danger", ok ? "Historial borrado." : "No se pudo borrar el historial.");
  });

  $("#btn-restaurar-agentes").addEventListener("click", () => {
    if (!confirm("Se descartarán los cambios y agentes propios, y volverán los 4 predeterminados. ¿Continuar?")) return;
    restaurarPredeterminados();
    aviso(msgDatos, "success", "Agentes restaurados.");
  });
}
