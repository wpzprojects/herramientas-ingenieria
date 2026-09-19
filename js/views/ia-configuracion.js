// Configuracion de la conexion con IA: clave de API de Gemini, modelo,
// parametros y gestion de datos locales (historial, agentes).

import { escapeHtml } from "../util/format.js";
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
import { abrirInstructivo, htmlAvisoPrivacidad } from "../ai/ui-clave.js";
import { contar, borrarTodo } from "../ai/historial.js";
import { restaurarPredeterminados } from "../ai/agentes.js";

export async function render(container) {
  const ajustes = obtenerAjustes();

  container.innerHTML = `
    <div class="breadcrumb"><a href="#/">Inicio</a> <span>/</span> <a href="#/ia">Funciones de IA</a> <span>/</span> <span>Configuración</span></div>
    <h1 class="page-title">Configuración de IA</h1>

    <div class="card">
      <h2 class="section-title" style="margin-top:0">Conexión con Gemini</h2>
      <p class="text-muted" id="estado-clave"></p>
      <div class="field">
        <label for="f-clave">Clave de API</label>
        <div class="input-group">
          <input type="password" id="f-clave" autocomplete="off" spellcheck="false" placeholder="Pega aquí tu clave (AIza…)">
          <button type="button" class="btn" id="btn-ver" style="flex: 0 0 auto;">Mostrar</button>
        </div>
        <label class="checkbox-row"><input type="checkbox" id="chk-recordar"> Recordar en este equipo</label>
        <span class="hint">Si no la recuerdas, se borra al cerrar el navegador. La clave solo se envía a Google, nunca a otro servidor.</span>
      </div>
      <div class="btn-row" style="margin-top: 0;">
        <button type="button" class="btn btn-primary" id="btn-guardar">Guardar clave</button>
        <button type="button" class="btn" id="btn-probar">Probar conexión</button>
        <button type="button" class="btn" id="btn-instructivo">¿Cómo obtener mi clave?</button>
        <button type="button" class="btn btn-ghost" id="btn-borrar-clave">Borrar clave</button>
      </div>
      <div id="msg-conexion" style="margin-top: var(--space-4);"></div>
    </div>

    <div class="card">
      <h2 class="section-title" style="margin-top:0">Modelo y parámetros</h2>
      <div class="field">
        <label for="f-modelo">Modelo</label>
        <select id="f-modelo"></select>
        <span class="hint">Pulsa "Probar conexión" para cargar la lista de modelos disponibles con tu clave. Los flash suelen ser los más rápidos y con mayor cupo gratuito.</span>
      </div>
      <div class="grid-3">
        <div class="field">
          <label for="f-temp">Temperatura (análisis)</label>
          <input type="number" id="f-temp" min="0" max="1.5" step="0.1">
          <span class="hint">Menor = más estable. Los agentes de redacción usan la suya.</span>
        </div>
        <div class="field">
          <label for="f-rondas">Rondas máximas por pregunta</label>
          <input type="number" id="f-rondas" min="1" max="15" step="1">
          <span class="hint">Idas y vueltas con las calculadoras.</span>
        </div>
        <div class="field">
          <label for="f-calculos">Cálculos máximos por pregunta</label>
          <input type="number" id="f-calculos" min="1" max="200" step="1">
          <span class="hint">Protege tu cupo gratuito en barridos grandes.</span>
        </div>
      </div>
      <div class="btn-row" style="margin-top: 0;">
        <button type="button" class="btn btn-primary" id="btn-guardar-ajustes">Guardar ajustes</button>
        <button type="button" class="btn btn-ghost" id="btn-restaurar-ajustes">Restablecer valores</button>
      </div>
      <div id="msg-ajustes" style="margin-top: var(--space-4);"></div>
    </div>

    <div class="card">
      <h2 class="section-title" style="margin-top:0">Privacidad</h2>
      ${htmlAvisoPrivacidad()}
    </div>

    <div class="card">
      <h2 class="section-title" style="margin-top:0">Datos en este navegador</h2>
      <p class="text-muted" id="info-datos"></p>
      <div class="btn-row" style="margin-top: 0;">
        <button type="button" class="btn" id="btn-borrar-historial">Borrar historial de conversaciones</button>
        <button type="button" class="btn" id="btn-restaurar-agentes">Restaurar agentes predeterminados</button>
      </div>
      <div id="msg-datos" style="margin-top: var(--space-4);"></div>
    </div>
  `;

  const $ = (id) => container.querySelector(id);
  const estadoClave = $("#estado-clave");
  const fClave = $("#f-clave");
  const chkRecordar = $("#chk-recordar");
  const selModelo = $("#f-modelo");
  const msgConexion = $("#msg-conexion");
  const msgAjustes = $("#msg-ajustes");
  const msgDatos = $("#msg-datos");

  const aviso = (el, tipo, texto) => {
    el.innerHTML = `<div class="callout callout-${tipo}" style="margin-bottom:0"><span>${escapeHtml(texto)}</span></div>`;
  };

  function pintarEstadoClave() {
    const clave = obtenerClave();
    estadoClave.innerHTML = clave
      ? `Clave guardada: <span class="mono">${escapeHtml(enmascarar(clave))}</span> · ${
          clavePersistente() ? "recordada en este equipo" : "solo durante esta sesión"
        }`
      : "Todavía no hay una clave guardada.";
    chkRecordar.checked = clave ? clavePersistente() : true;
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
    fClave.value = "";
    pintarEstadoClave();
    aviso(msgConexion, "success", "Clave guardada. Pulsa \"Probar conexión\" para verificarla y cargar los modelos.");
  });

  $("#btn-borrar-clave").addEventListener("click", () => {
    borrarClave();
    fClave.value = "";
    pintarEstadoClave();
    aviso(msgConexion, "info", "Clave eliminada de este navegador.");
  });

  $("#btn-probar").addEventListener("click", async () => {
    const clave = fClave.value.trim() || obtenerClave();
    if (!clave) return aviso(msgConexion, "warning", "Primero guarda o pega una clave.");
    const btn = $("#btn-probar");
    btn.disabled = true;
    btn.textContent = "Probando…";
    try {
      const modelos = await listarModelos(clave);
      if (!modelos.length) {
        aviso(msgConexion, "warning", "La clave funciona, pero no hay modelos de generación de texto disponibles para ella.");
        return;
      }
      const a = obtenerAjustes();
      const actual = modelos.some((m) => m.id === a.modelo) ? a.modelo : elegirModeloPorDefecto(modelos) || modelos[0].id;
      pintarModelos(modelos, actual);
      guardarAjustes({ modelo: actual });
      aviso(msgConexion, "success", `Conexión correcta. ${modelos.length} modelos disponibles; modelo activo: ${actual}.`);
    } catch (err) {
      aviso(msgConexion, "danger", err instanceof ErrorGemini ? err.message : `Error inesperado: ${err.message || err}`);
    } finally {
      btn.disabled = false;
      btn.textContent = "Probar conexión";
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
