// Perfil y configuracion avanzada (menu lateral > Perfil, #/perfil): acceso con cuenta de Google.
// Muestra el login y, si el correo esta en la lista de usuarios autorizados (guardada en el
// servidor, no en el repositorio), la cuenta con su nivel de acceso, la clave de Gemini en el servidor y, solo para
// administradores, la gestion de esa lista. La seguridad real la aplican las reglas de Firestore
// (firebase/firestore.rules); esta pantalla solo decide que mostrar.
// Diseño (2026-09-19): mismas tarjetas de las calculadoras (relleno de 16 px, barra de titulo con icono, ayudas «i»).

import { el, escapeHtml } from "../util/format.js";
import { icon } from "../icons.js";
import { activarInfos } from "../util/info-campo.js";
import { obtenerBackend, esperarSesion, ROLES, ErrorAcceso, correoValido, normalizarCorreo } from "../auth/backend.js";
import { FUENTES, obtenerFuente, guardarFuente, olvidarClaveServidor } from "../ai/clave.js";
import { estadoAcceso, venceLaCache, leerCache, revalidar } from "../auth/acceso.js";

const fecha = (ms) => (ms ? new Date(ms).toLocaleDateString("es-CO", { dateStyle: "medium" }) : "—");
const mensajeDe = (e) => (e instanceof ErrorAcceso ? e.message : `Error inesperado: ${e?.message || e}`);
const ETIQUETA_ROL = { admin: "Administrador", usuario: "Usuario" };
const insigniaRol = (rol) => `<span class="badge ${rol === "admin" ? "badge-success" : ""}">${escapeHtml(ETIQUETA_ROL[rol] || rol)}</span>`;

// Cada opcion dice DONDE esta guardada la clave que van a usar las funciones de IA
const OPCIONES_FUENTE = {
  local: { titulo: "Este navegador", donde: "mi clave, guardada solo en este equipo" },
  personal: { titulo: "Mi clave personal (servidor)", donde: "mi clave, guardada en el servidor y disponible en cualquier dispositivo" },
  compartida: { titulo: "Clave compartida (servidor)", donde: "la clave del administrador, para todos los usuarios" },
};
const AYUDA_FUENTE = "Las funciones de IA necesitan una clave de Gemini. Elige dónde está guardada la que vas a usar.";

export async function render(container) {
  container.innerHTML = `
    <div class="breadcrumb"><a href="#/">Inicio</a> <span>/</span> <span>Perfil y configuración avanzada</span></div>
    <h1 class="page-title">Perfil y configuración avanzada</h1>
    <div id="ca-cuerpo"></div>
  `;
  const cuerpo = container.querySelector("#ca-cuerpo");
  const reintentar = () => render(container);

  const tarjeta = (html) => {
    cuerpo.innerHTML = `<div class="card tarjeta-borde ia-gate">${html}</div>`;
    return cuerpo.firstElementChild;
  };
  const aviso = (nodo, tipo, texto) => {
    nodo.innerHTML = `<div class="callout callout-${tipo}" style="margin:var(--space-3) 0 0"><span>${escapeHtml(texto)}</span></div>`;
  };
  const barra = (ico, titulo) => `<div class="form-section-title">${icon(ico)} ${titulo}</div>`;

  // ---------- 1. conexion y servicio ----------
  if (typeof navigator !== "undefined" && navigator.onLine === false) {
    const acceso = estadoAcceso();
    tarjeta(`<h2>Sin conexión a internet</h2>
      <p class="text-muted">Esta sección necesita conexión para iniciar sesión y consultar el servidor.</p>
      ${
        acceso.nivel !== "visitante"
          ? `<p class="text-muted">Tu acceso completo (${escapeHtml(acceso.email)}) sigue vigente sin conexión hasta el <strong>${fecha(venceLaCache(leerCache()))}</strong>; se renueva solo cada vez que abres la app con internet.</p>`
          : ""
      }
      <div class="btn-row"><button type="button" class="btn btn-primary" data-r>Reintentar</button></div>`)
      .querySelector("[data-r]")
      .addEventListener("click", reintentar);
    return;
  }

  tarjeta(`<p class="text-muted" style="margin:0">Comprobando el servicio…</p>`);
  let b;
  try {
    b = await obtenerBackend();
  } catch (e) {
    b = null;
  }
  if (!b) {
    tarjeta(`<h2>Servicio de acceso no configurado</h2>
      <p class="text-muted">Esta sección necesita un servicio de acceso (Firebase) que todavía no se ha configurado en esta instalación de la app.</p>
      <p class="text-muted text-sm" style="margin-bottom:0">Pasos para activarlo: sección «Acceso con Google y Firebase» del README.</p>`);
    return;
  }

  // ---------- 2. sesion ----------
  const usuario = await esperarSesion(b);
  if (!usuario) return pintarLogin();
  return evaluarAcceso(usuario);

  function pintarLogin(mensaje) {
    const t = tarjeta(`${barra("user", "Iniciar sesión")}
      <p style="margin:0 0 var(--space-2)">Inicia sesión para habilitar todos los módulos de la aplicación.</p>
      <p class="text-muted text-sm">Sin iniciar sesión puedes usar Ocupación de ductos, Conductores desnudos y Distancias de seguridad. Con una cuenta autorizada por un administrador se habilitan todos los módulos.</p>
      <div class="btn-row"><button type="button" class="btn btn-primary btn-con-icono" data-login>${icon("brandGoogle")} Iniciar sesión con Google</button></div>
      <div data-msg></div>`);
    if (mensaje) aviso(t.querySelector("[data-msg]"), "warning", mensaje);
    const btn = t.querySelector("[data-login]");
    const rotuloBtn = btn.innerHTML;
    btn.addEventListener("click", async () => {
      btn.disabled = true;
      btn.textContent = "Abriendo Google…";
      try {
        const u = await b.iniciarSesion();
        await evaluarAcceso(u);
      } catch (e) {
        btn.disabled = false;
        btn.innerHTML = rotuloBtn;
        aviso(t.querySelector("[data-msg]"), e?.tipo === "cancelado" ? "info" : "danger", mensajeDe(e));
      }
    });
  }

  async function cerrarSesion() {
    olvidarClaveServidor();
    try {
      await b.cerrarSesion();
    } catch (e) {
      /* la sesion se considera cerrada igualmente en la pantalla */
    }
    pintarLogin();
  }

  async function evaluarAcceso(u) {
    tarjeta(`<p class="text-muted" style="margin:0">Verificando tu acceso…</p>`);
    let perfil;
    try {
      perfil = await b.obtenerPerfil();
    } catch (e) {
      const t = tarjeta(`<h2>No se pudo verificar tu acceso</h2><p class="text-muted"></p>
        <div class="btn-row"><button type="button" class="btn btn-primary" data-r>Reintentar</button><button type="button" class="btn" data-salir>Cerrar sesión</button></div>`);
      t.querySelector("p").textContent = mensajeDe(e);
      t.querySelector("[data-r]").addEventListener("click", reintentar);
      t.querySelector("[data-salir]").addEventListener("click", cerrarSesion);
      return;
    }
    if (!perfil) {
      const t = tarjeta(`${barra("user", "Cuenta sin autorización")}
        <p style="margin:0 0 var(--space-2)">Tu cuenta <strong>${escapeHtml(u.email)}</strong> no está autorizada.</p>
        <p class="text-muted text-sm">Contacta al administrador para que agregue tu correo; mientras tanto puedes usar los módulos de libre acceso.</p>
        <div class="btn-row"><button type="button" class="btn btn-primary" data-otra>Usar otra cuenta</button><button type="button" class="btn" data-salir>Cerrar sesión</button></div>`);
      t.querySelector("[data-salir]").addEventListener("click", cerrarSesion);
      t.querySelector("[data-otra]").addEventListener("click", async () => {
        try {
          await b.cerrarSesion();
        } catch (e) {
          /* se continua al login */
        }
        pintarLogin();
      });
      return;
    }
    await revalidar(); // el acceso ya esta confirmado: deja al dia la cache y el nivel de toda la app
    pintarPanel(u, perfil);
  }

  // ---------- 3. panel ----------
  function pintarPanel(u, perfil) {
    const esAdmin = perfil.rol === "admin";
    const cache = leerCache();
    // un solo parrafo: se ajusta al ancho de la tarjeta (no se fuerza a dos lineas)
    const vigencia = cache
      ? `Acceso desde ${fecha(cache.validadoEn)}. Disponible hasta ${fecha(venceLaCache(cache))} y se renueva cada vez que abres la app con internet.`
      : "";
    cuerpo.innerHTML = `
      <div class="card tarjeta-borde form-section">
        ${barra("user", "Mi cuenta")}
        <div class="dev-header ca-cuenta">
          <span class="dev-avatar">${escapeHtml((u.nombre || u.email || "?").trim().charAt(0).toUpperCase())}</span>
          <div class="ca-cuenta-datos">
            <p class="dev-name">${escapeHtml(u.nombre || u.email)}</p>
            <p class="dev-role">${escapeHtml(u.email)} · ${insigniaRol(perfil.rol)}</p>
          </div>
          ${vigencia ? `<p class="text-muted text-sm ca-cuenta-vigencia">${escapeHtml(vigencia)}</p>` : ""}
          <button type="button" class="btn btn-sm ca-cuenta-salir" data-salir>Cerrar sesión</button>
        </div>
      </div>
      ${
        esAdmin
          ? `<div class="tabs ca-tabs" role="tablist">
              <button type="button" class="tab-btn active" role="tab" aria-selected="true" data-tab="usuarios">Usuarios</button>
              <button type="button" class="tab-btn" role="tab" aria-selected="false" data-tab="clave">Clave de Gemini</button>
            </div>
            <div class="tab-panel" id="ca-tab-usuarios"><div class="card tarjeta-borde form-section" id="ca-usuarios"></div></div>
            <div class="tab-panel" id="ca-tab-clave" hidden><div class="card tarjeta-borde form-section" id="ca-clave"></div></div>`
          : `<div class="card tarjeta-borde form-section ca-sola" id="ca-clave"></div>`
      }`;
    cuerpo.querySelector("[data-salir]").addEventListener("click", cerrarSesion);
    for (const btn of cuerpo.querySelectorAll(".ca-tabs .tab-btn")) {
      btn.addEventListener("click", () => {
        for (const otro of cuerpo.querySelectorAll(".ca-tabs .tab-btn")) {
          const activa = otro === btn;
          otro.classList.toggle("active", activa);
          otro.setAttribute("aria-selected", String(activa));
          cuerpo.querySelector(`#ca-tab-${otro.dataset.tab}`).hidden = !activa;
        }
      });
    }
    if (esAdmin) pintarUsuarios(perfil);
    pintarClave(esAdmin);
  }

  async function pintarUsuarios(perfil) {
    const box = cuerpo.querySelector("#ca-usuarios");
    box.innerHTML = `${barra("users", "Usuarios con acceso")}<p class="text-muted" style="margin:0">Cargando…</p>`;
    let lista;
    try {
      lista = await b.listarUsuarios();
    } catch (e) {
      box.innerHTML = `${barra("users", "Usuarios con acceso")}<div class="callout callout-danger" style="margin:0"><span>${escapeHtml(mensajeDe(e))}</span></div>`;
      return;
    }

    box.innerHTML = `
      ${barra("users", "Usuarios con acceso")}
      <p class="text-muted text-sm">Estos correos tienen acceso a todos los módulos. La lista se guarda en el servidor.</p>
      <div class="ca-agregar">
        <div class="field">
          <label for="ca-nuevo" data-info="La persona debe iniciar sesión con esa cuenta de Google.">Agregar correo</label>
          <input type="email" id="ca-nuevo" placeholder="nombre@gmail.com" autocomplete="off">
        </div>
        <div class="field">
          <label for="ca-rol-nuevo" data-info="Administrador: además de todos los módulos, gestiona esta lista y la clave compartida. Usuario: todos los módulos.">Rol</label>
          <select id="ca-rol-nuevo">${ROLES.map((r) => `<option value="${r}">${ETIQUETA_ROL[r]}</option>`).join("")}</select>
        </div>
        <button type="button" class="btn btn-primary" id="ca-agregar">Agregar</button>
      </div>
      <div id="ca-msg-usuarios"></div>
      <div class="table-wrap"><table><thead><tr><th>Correo</th><th>Rol</th><th class="hide-narrow">Agregado por</th><th class="hide-narrow">Fecha</th><th></th></tr></thead><tbody id="ca-filas"></tbody></table></div>`;
    activarInfos(box);

    const msg = box.querySelector("#ca-msg-usuarios");
    const filas = box.querySelector("#ca-filas");
    for (const f of lista) {
      const yo = f.email === perfil.email;
      const tr = el("tr");
      tr.append(el("td", {}, [f.email, yo ? el("span", { class: "badge", style: "margin-left:8px" }, "tú") : null]));

      // rol: insignia y, para otros usuarios, un boton que la cambia por un selector (un admin no puede bajarse el rol a si mismo)
      const celdaRol = el("td");
      const pintarRol = () => {
        celdaRol.innerHTML = `<span class="ca-rol">${insigniaRol(f.rol)}</span>`;
        if (yo) return;
        const cambiar = el("button", { type: "button", class: "btn btn-sm btn-ghost btn-icono", "aria-label": `Cambiar el rol de ${f.email}`, title: "Cambiar rol", html: icon("pencil") });
        cambiar.addEventListener("click", () => {
          const sel = el("select", { class: "select-sm", "aria-label": `Rol de ${f.email}` });
          for (const r of ROLES) sel.append(el("option", { value: r, selected: r === f.rol }, ETIQUETA_ROL[r]));
          celdaRol.replaceChildren(sel);
          sel.focus();
          sel.addEventListener("change", async () => {
            try {
              await b.guardarUsuario(f.email, sel.value);
              await pintarUsuarios(perfil);
            } catch (e) {
              aviso(msg, "danger", mensajeDe(e));
              pintarRol();
            }
          });
          sel.addEventListener("blur", () => celdaRol.contains(sel) && pintarRol());
        });
        celdaRol.querySelector(".ca-rol").append(cambiar);
      };
      pintarRol();
      tr.append(celdaRol, el("td", { class: "hide-narrow" }, f.agregadoPor || "—"), el("td", { class: "hide-narrow" }, fecha(f.fecha)));

      const quitar = el("button", { type: "button", class: "btn btn-sm btn-ghost btn-icono", "aria-label": `Quitar a ${f.email}`, title: yo ? "No puedes quitarte a ti mismo" : "Quitar acceso", html: icon("trash") });
      quitar.disabled = yo;
      quitar.addEventListener("click", async () => {
        if (!confirm(`¿Quitar el acceso a ${f.email}?`)) return;
        try {
          await b.quitarUsuario(f.email);
          await pintarUsuarios(perfil);
        } catch (e) {
          aviso(msg, "danger", mensajeDe(e));
        }
      });
      tr.append(el("td", { style: "text-align:right" }, quitar));
      filas.append(tr);
    }

    const inp = box.querySelector("#ca-nuevo");
    const agregar = async () => {
      const email = normalizarCorreo(inp.value);
      if (!correoValido(email)) return aviso(msg, "warning", "Escribe un correo válido, por ejemplo nombre@gmail.com.");
      if (lista.some((x) => x.email === email)) return aviso(msg, "warning", "Ese correo ya está en la lista.");
      try {
        await b.guardarUsuario(email, box.querySelector("#ca-rol-nuevo").value);
        await pintarUsuarios(perfil);
        aviso(cuerpo.querySelector("#ca-msg-usuarios"), "success", `Se agregó ${email}. Debe iniciar sesión con esa cuenta de Google.`);
      } catch (e) {
        aviso(msg, "danger", mensajeDe(e));
      }
    };
    box.querySelector("#ca-agregar").addEventListener("click", agregar);
    inp.addEventListener("keydown", (e) => e.key === "Enter" && agregar());
  }

  async function pintarClave(esAdmin) {
    const box = cuerpo.querySelector("#ca-clave");
    box.innerHTML = `${barra("key", "Clave de Gemini")}<p class="text-muted" style="margin:0">Cargando…</p>`;
    let hayPersonal = false;
    let hayCompartida = false;
    try {
      hayPersonal = !!(await b.leerClavePersonal());
      hayCompartida = !!(await b.leerClaveCompartida());
    } catch (e) {
      box.innerHTML = `${barra("key", "Clave de Gemini")}<div class="callout callout-danger" style="margin:0"><span>${escapeHtml(mensajeDe(e))}</span></div>`;
      return;
    }
    const estado = (hay) => (hay ? `<span class="badge badge-success">Configurada</span>` : `<span class="badge">Sin configurar</span>`);
    const disponible = { local: true, personal: hayPersonal, compartida: hayCompartida };

    box.innerHTML = `
      ${barra("key", "Clave de Gemini")}
      <div class="field">
        <label data-info="${escapeHtml(AYUDA_FUENTE)}">¿Dónde está la clave de Gemini que se usará?</label>
        <div class="ca-fuentes" id="ca-fuentes"></div>
      </div>
      <div id="ca-detalle"></div>
      <div id="ca-avisos"></div>`;

    const contFuentes = box.querySelector("#ca-fuentes");
    const detalle = box.querySelector("#ca-detalle");
    const avisos = box.querySelector("#ca-avisos");

    for (const f of FUENTES) {
      const id = `ca-f-${f}`;
      const radio = el("input", { type: "radio", name: "ca-fuente", id, value: f, checked: obtenerFuente() === f });
      radio.addEventListener("change", () => {
        guardarFuente(f);
        pintarDetalle();
      });
      contFuentes.append(
        el("label", { for: id, class: "checkbox-row", style: "color:var(--text)" }, [
          radio,
          el("span", { html: `<strong>${OPCIONES_FUENTE[f].titulo}</strong> <span class="text-muted text-sm">— ${OPCIONES_FUENTE[f].donde}</span>${f === "local" ? "" : ` ${estado(disponible[f])}`}` }),
        ])
      );
    }

    const campoClave = (tipo, etiqueta, ayuda, hay) => `
      <div class="field">
        <label for="ca-k-${tipo}" data-info="${escapeHtml(ayuda)}">${etiqueta} ${estado(hay)}</label>
        <div class="input-group">
          <input type="password" id="ca-k-${tipo}" autocomplete="off" spellcheck="false" placeholder="Pega la clave de Gemini (AIza…)">
          <button type="button" class="btn btn-primary" id="ca-g-${tipo}" style="flex:0 0 auto">Guardar</button>
          <button type="button" class="btn" id="ca-b-${tipo}" style="flex:0 0 auto" ${hay ? "" : "disabled"}>Borrar</button>
        </div>
      </div>
      <div id="ca-msg-${tipo}"></div>`;

    function pintarDetalle() {
      const fuente = obtenerFuente();
      if (fuente === "personal") {
        detalle.innerHTML = campoClave("personal", "Mi clave personal", "Solo tú puedes leerla; ni siquiera los administradores.", hayPersonal);
      } else if (fuente === "compartida") {
        detalle.innerHTML = esAdmin
          ? campoClave("compartida", "Clave compartida", "Una sola clave para todos los usuarios autorizados; solo los administradores la cambian.", hayCompartida)
          : `<p class="text-muted text-sm" style="margin:0">${hayCompartida ? "Clave compartida configurada por el administrador" : "Clave compartida aún no configurada por el administrador"} ${estado(hayCompartida)}</p>`;
      } else {
        detalle.innerHTML = `<p class="text-muted text-sm" style="margin:0">Se usa la clave guardada en este navegador. Para cambiarla ve a <a href="#/ia/configuracion">Funciones de IA → Configuración</a>.</p>`;
      }
      pintarAvisos(fuente);
      activarInfos(box);
      const g = (t) => box.querySelector(`#ca-g-${t}`);
      const bo = (t) => box.querySelector(`#ca-b-${t}`);
      if (g("personal")) {
        g("personal").addEventListener("click", guardarClave("personal"));
        bo("personal").addEventListener("click", borrarClave("personal"));
      }
      if (g("compartida")) {
        g("compartida").addEventListener("click", guardarClave("compartida"));
        bo("compartida").addEventListener("click", borrarClave("compartida"));
      }
    }

    // Un solo recuadro de avisos (formal, con viñetas), debajo del detalle: lo pendiente de la clave elegida y, solo para el
    // administrador con la clave compartida, la advertencia sobre quien puede leerla.
    function pintarAvisos(fuente) {
      const puntos = [];
      if (!disponible[fuente]) {
        puntos.push(
          fuente === "compartida" && !esAdmin
            ? "El administrador aún no ha configurado la clave compartida: las funciones de IA te pedirán una clave."
            : `Todavía no has configurado ${fuente === "compartida" ? "la clave compartida" : "esta clave"}: las funciones de IA te la pedirán.`
        );
      }
      if (esAdmin && fuente === "compartida") {
        puntos.push(
          "La clave compartida la puede leer cualquier usuario autorizado (técnicamente, con las herramientas del navegador): compártela solo con personas de confianza.",
          "Si alguien sale de la lista pierde el acceso, pero cambia la clave si sospechas que se filtró.",
          "Todos los usuarios consumen el mismo cupo gratuito."
        );
      }
      avisos.innerHTML = puntos.length
        ? `<div class="callout callout-warning ca-avisos"><div><strong>Ten presente</strong><ul>${puntos.map((p) => `<li>${escapeHtml(p)}</li>`).join("")}</ul></div></div>`
        : "";
    }

    const guardarClave = (tipo) => async () => {
      const inp = box.querySelector(`#ca-k-${tipo}`);
      const msg = box.querySelector(`#ca-msg-${tipo}`);
      const valor = inp.value.trim();
      if (!valor) return aviso(msg, "warning", "Escribe o pega la clave antes de guardar.");
      try {
        await (tipo === "personal" ? b.guardarClavePersonal(valor) : b.guardarClaveCompartida(valor));
        olvidarClaveServidor();
        inp.value = "";
        await pintarClave(esAdmin);
        aviso(cuerpo.querySelector(`#ca-msg-${tipo}`), "success", "Clave guardada en el servidor.");
      } catch (e) {
        aviso(msg, "danger", mensajeDe(e));
      }
    };
    const borrarClave = (tipo) => async () => {
      const msg = box.querySelector(`#ca-msg-${tipo}`);
      if (!confirm(`¿Borrar la clave ${tipo === "personal" ? "personal" : "compartida"} del servidor?`)) return;
      try {
        await (tipo === "personal" ? b.guardarClavePersonal(null) : b.guardarClaveCompartida(null));
        olvidarClaveServidor();
        await pintarClave(esAdmin);
        aviso(cuerpo.querySelector(`#ca-msg-${tipo}`), "info", "Clave borrada del servidor.");
      } catch (e) {
        aviso(msg, "danger", mensajeDe(e));
      }
    };

    pintarDetalle();
    activarInfos(box);
  }
}
