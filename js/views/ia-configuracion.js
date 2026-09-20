// Configuracion de la conexion con IA: clave de API de Gemini, modelo,
// parametros y gestion de datos locales (historial, agentes).
// Diseño (2026-09-19): mismo estilo de Perfil y de las calculadoras (tarjetas de 16 px con barra de titulo e icono, ayudas «i»).
// Ajustes avanzados plegados; «Actualizar lista» de modelos separado de «Probar conexion».

import { escapeHtml } from "../util/format.js";
import { icon } from "../icons.js";
import { activarInfos } from "../util/info-campo.js";
import {
  obtenerClave,
  guardarClave,
  borrarClave,
  clavePersistente,
  enmascarar,
  obtenerAjustes,
  guardarAjustes,
  borrarAjustes,
  AJUSTES_POR_DEFECTO,
} from "../ai/config.js";
import { listarModelos, elegirModeloPorDefecto, ErrorGemini } from "../ai/gemini.js";
import { abrirInstructivo } from "../ai/ui-clave.js";
import { obtenerFuente } from "../ai/clave.js";
import { contar, borrarTodo } from "../ai/historial.js";
import { restaurarPredeterminados } from "../ai/agentes.js";

// Nombres cortos de la clave en uso (los mismos de Perfil)
const NOMBRE_FUENTE = { local: "Este navegador", personal: "Mi clave personal (servidor)", compartida: "Clave compartida (servidor)" };
const AYUDA_CLAVE =
  "La clave se guarda en este navegador. Si no marcas «Recordar en este equipo», se borra al cerrar el navegador. Solo se envía a Google, nunca a otro servidor.";
const AYUDA_MODELO = "Los modelos «flash» suelen ser los más rápidos y con mayor cupo gratuito. «Actualizar lista» carga los modelos disponibles con tu clave.";
const AYUDA_TEMP = "Menor = respuestas más estables. Los agentes de redacción usan la suya.";
const AYUDA_RONDAS = "Idas y vueltas con las calculadoras en cada pregunta.";
const AYUDA_CALCULOS = "Protege tu cupo gratuito en barridos grandes.";
const PRIVACIDAD = [
  "Lo que envías a la IA se transmite a los servidores de Google (Gemini).",
  "Con el plan gratuito, Google puede usar esas conversaciones para mejorar sus productos.",
  "No pegues información confidencial de la empresa, datos personales ni datos de clientes.",
  "Si usas el dictado por voz, el audio lo transcribe el servicio de reconocimiento de voz de tu navegador.",
];

export async function render(container) {
  const barra = (ico, titulo) => `<div class="form-section-title">${icon(ico)} ${titulo}</div>`;

  container.innerHTML = `
    <div class="breadcrumb"><a href="#/">Inicio</a> <span>/</span> <a href="#/ia">Funciones de IA</a> <span>/</span> <span>Configuración</span></div>
    <h1 class="page-title">Configuración de IA</h1>

    <div class="card tarjeta-borde form-section" id="ia-conexion">
      ${barra("key", "Conexión con Gemini")}
      <p class="text-muted text-sm" id="fuente-clave" style="margin:0 0 var(--space-2)"></p>
      <p class="text-muted text-sm" id="estado-clave" style="margin:0 0 var(--space-4)"></p>
      <div id="aviso-fuente"></div>
      <div class="field">
        <div class="ia-etiqueta-fila">
          <label for="f-clave" data-info="${escapeHtml(AYUDA_CLAVE)}">Clave de API</label>
          <button type="button" class="btn-enlace" id="btn-instructivo">¿Cómo obtener mi clave?</button>
        </div>
        <div class="input-group">
          <input type="password" id="f-clave" autocomplete="off" spellcheck="false" placeholder="Pega aquí tu clave (AIza…)">
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
            <input type="number" id="f-temp" min="0" max="1.5" step="0.1">
          </div>
          <div class="field">
            <label for="f-rondas" data-info="${escapeHtml(AYUDA_RONDAS)}">Rondas máximas por pregunta</label>
            <input type="number" id="f-rondas" min="1" max="15" step="1">
          </div>
          <div class="field">
            <label for="f-calculos" data-info="${escapeHtml(AYUDA_CALCULOS)}">Cálculos máximos por pregunta</label>
            <input type="number" id="f-calculos" min="1" max="200" step="1">
          </div>
        </div>
      </details>
      <div class="btn-row" style="margin-top: var(--space-4);">
        <button type="button" class="btn btn-primary" id="btn-guardar-ajustes">Guardar ajustes</button>
        <button type="button" class="btn" id="btn-restaurar-ajustes">Restablecer valores</button>
      </div>
      <div id="msg-ajustes" style="margin-top: var(--space-4);"></div>
    </div>

    <div class="card tarjeta-borde form-section" id="ia-datos">
      ${barra("lock", "Datos y privacidad")}
      <p class="text-muted text-sm" id="info-datos" style="margin:0 0 var(--space-3)"></p>
      <div class="btn-row" style="margin-top: 0;">
        <button type="button" class="btn btn-con-icono" id="btn-borrar-historial">${icon("trash")} Borrar historial de conversaciones</button>
        <button type="button" class="btn" id="btn-restaurar-agentes">Restaurar agentes predeterminados</button>
      </div>
      <div id="msg-datos" style="margin-top: var(--space-4);"></div>
      <div class="callout callout-warning ca-avisos" id="ia-privacidad"><div><strong>Privacidad</strong><ul>${PRIVACIDAD.map((p) => `<li>${escapeHtml(p)}</li>`).join("")}</ul></div></div>
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

  function pintarEstadoClave() {
    const clave = obtenerClave();
    estadoClave.innerHTML = clave
      ? `Clave guardada en este navegador: <span class="mono">${escapeHtml(enmascarar(clave))}</span> · ${
          clavePersistente() ? "recordada en este equipo" : "solo durante esta sesión"
        }`
      : "Todavía no hay una clave guardada en este navegador.";
    chkRecordar.checked = clave ? clavePersistente() : true;
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
    const a = obtenerAjustes();
    pintarModelos([], a.modelo);
    $("#f-temp").value = a.temperatura;
    $("#f-rondas").value = a.maxRondas;
    $("#f-calculos").value = a.maxCalculos;
  }

  async function pintarDatos() {
    const n = await contar();
    $("#info-datos").textContent = `Conversaciones guardadas: ${n}. Los agentes de redacción y los ajustes también se guardan aquí.`;
  }

  // Origen de la clave que se esta usando (se elige en Perfil). Si no es «Este navegador», el campo de abajo no se usa.
  const fuente = obtenerFuente();
  $("#fuente-clave").innerHTML =
    `Las funciones de IA están usando <span class="badge">${escapeHtml(NOMBRE_FUENTE[fuente])}</span> · ` + `<a href="#/perfil">Cambiar en Perfil</a>`;
  if (fuente !== "local") {
    $("#aviso-fuente").innerHTML = `<div class="callout callout-info" style="margin:0 0 var(--space-4)"><span>Estás usando una clave del servidor: la clave de este navegador solo se usa si eliges «Este navegador» en Perfil.</span></div>`;
  }

  pintarEstadoClave();
  pintarAjustes();
  pintarDatos();

  $("#btn-ver").addEventListener("click", () => {
    const visible = fClave.type === "text";
    fClave.type = visible ? "password" : "text";
    $("#btn-ver").textContent = visible ? "Mostrar" : "Ocultar";
  });

  $("#btn-instructivo").addEventListener("click", abrirInstructivo);

  $("#btn-guardar").addEventListener("click", () => {
    const valor = fClave.value.trim();
    if (!valor) return aviso(msgConexion, "warning", "Escribe o pega la clave antes de guardar.");
    if (!guardarClave(valor, chkRecordar.checked)) {
      return aviso(msgConexion, "danger", "No se pudo guardar la clave en este navegador (¿almacenamiento bloqueado?).");
    }
    pintarEstadoClave();
    aviso(msgConexion, "success", "Clave guardada. Pulsa «Probar conexión» para verificarla y «Actualizar lista» para cargar los modelos.");
  });

  $("#btn-borrar-clave").addEventListener("click", () => {
    if (!obtenerClave()) return aviso(msgConexion, "info", "No hay una clave guardada en este navegador.");
    if (!confirm("¿Borrar la clave guardada en este navegador? Tendrás que volver a pegarla para usarla en las funciones de IA.")) return;
    borrarClave();
    pintarEstadoClave();
    aviso(msgConexion, "info", "Clave eliminada de este navegador.");
  });

  // «Probar conexion» solo VERIFICA la clave; la lista de modelos se carga aparte con «Actualizar lista».
  $("#btn-probar").addEventListener("click", async () => {
    const clave = fClave.value.trim() || obtenerClave();
    if (!clave) return aviso(msgConexion, "warning", "Primero guarda o pega una clave.");
    const btn = $("#btn-probar");
    btn.disabled = true;
    btn.textContent = "Probando…";
    try {
      const modelos = await listarModelos(clave);
      if (!modelos.length) aviso(msgConexion, "warning", "La clave funciona, pero no hay modelos de generación de texto disponibles para ella.");
      else aviso(msgConexion, "success", `Conexión correcta: la clave es válida (${modelos.length} modelos disponibles).`);
    } catch (err) {
      aviso(msgConexion, "danger", err instanceof ErrorGemini ? err.message : `Error inesperado: ${err.message || err}`);
    } finally {
      btn.disabled = false;
      btn.textContent = "Probar conexión";
    }
  });

  $("#btn-actualizar-modelos").addEventListener("click", async () => {
    const clave = fClave.value.trim() || obtenerClave();
    if (!clave) return aviso(msgModelo, "warning", "Primero guarda o pega una clave en «Conexión con Gemini».");
    const btn = $("#btn-actualizar-modelos");
    btn.disabled = true;
    btn.textContent = "Actualizando…";
    try {
      const modelos = await listarModelos(clave);
      if (!modelos.length) {
        aviso(msgModelo, "warning", "No hay modelos de generación de texto disponibles para esta clave.");
        return;
      }
      const a = obtenerAjustes();
      const actual = modelos.some((m) => m.id === a.modelo) ? a.modelo : elegirModeloPorDefecto(modelos) || modelos[0].id;
      pintarModelos(modelos, actual);
      guardarAjustes({ modelo: actual });
      aviso(msgModelo, "success", `${modelos.length} modelos disponibles; modelo activo: ${actual}.`);
    } catch (err) {
      aviso(msgModelo, "danger", err instanceof ErrorGemini ? err.message : `Error inesperado: ${err.message || err}`);
    } finally {
      btn.disabled = false;
      btn.textContent = "Actualizar lista";
    }
  });

  $("#btn-guardar-ajustes").addEventListener("click", () => {
    const num = (id, def, min, max, entero) => {
      let v = parseFloat(String($(id).value).replace(",", "."));
      if (!Number.isFinite(v)) v = def;
      v = Math.min(Math.max(v, min), max);
      return entero ? Math.round(v) : v;
    };
    const nuevos = {
      modelo: selModelo.value || AJUSTES_POR_DEFECTO.modelo,
      temperatura: num("#f-temp", AJUSTES_POR_DEFECTO.temperatura, 0, 1.5, false),
      maxRondas: num("#f-rondas", AJUSTES_POR_DEFECTO.maxRondas, 1, 15, true),
      maxCalculos: num("#f-calculos", AJUSTES_POR_DEFECTO.maxCalculos, 1, 200, true),
    };
    guardarAjustes(nuevos);
    pintarAjustes();
    aviso(msgAjustes, "success", "Ajustes guardados.");
  });

  $("#btn-restaurar-ajustes").addEventListener("click", () => {
    borrarAjustes();
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
