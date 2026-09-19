// Perfil y configuracion avanzada (menu lateral > Perfil, #/perfil): acceso restringido con cuenta de Google.
// Muestra el login y, si el correo esta en la lista de usuarios autorizados (guardada en el
// servidor, no en el repositorio), permite gestionar esa lista (solo administradores) y guardar
// la clave de Gemini en el servidor. La seguridad real la aplican las reglas de Firestore
// (firebase/firestore.rules); esta pantalla solo decide que mostrar.

import { el, escapeHtml } from "../util/format.js";
import { obtenerBackend, esperarSesion, ROLES, ErrorAcceso, correoValido, normalizarCorreo } from "../auth/backend.js";
import { FUENTES, obtenerFuente, guardarFuente, olvidarClaveServidor } from "../ai/clave.js";
import { estadoAcceso, venceLaCache, leerCache } from "../auth/acceso.js";

const fecha = (ms) => (ms ? new Date(ms).toLocaleDateString("es-CO", { dateStyle: "medium" }) : "—");
const mensajeDe = (e) => (e instanceof ErrorAcceso ? e.message : `Error inesperado: ${e?.message || e}`);
const ETIQUETA_ROL = { admin: "Administrador", usuario: "Usuario" };

const OPCIONES_FUENTE = {
  local: { titulo: "Este navegador", desc: "La clave que pegaste en Funciones de IA → Configuración (se guarda en este equipo)." },
  personal: { titulo: "Mi clave personal (servidor)", desc: "Tu propia clave, guardada en el servidor. Solo tú puedes leerla y la tienes en cualquier dispositivo." },
  compartida: { titulo: "Clave compartida (servidor)", desc: "Una clave común para todos los usuarios autorizados, administrada por los administradores." },
};

export async function render(container) {
  container.innerHTML = `
    <div class="breadcrumb"><a href="#/">Inicio</a> <span>/</span> <span>Perfil y configuración avanzada</span></div>
    <h1 class="page-title">Perfil y configuración avanzada</h1>
    <div id="ca-cuerpo"></div>
  `;
  const cuerpo = container.querySelector("#ca-cuerpo");
  const reintentar = () => render(container);

  const tarjeta = (html) => {
    cuerpo.innerHTML = `<div class="card ia-gate">${html}</div>`;
    return cuerpo.firstElementChild;
  };
  const aviso = (nodo, tipo, texto) => {
    nodo.innerHTML = `<div class="callout callout-${tipo}" style="margin:var(--space-3) 0 0"><span>${escapeHtml(texto)}</span></div>`;
  };

  // ---------- 1. conexion y servicio ----------
  if (typeof navigator !== "undefined" && navigator.onLine === false) {
    tarjeta(`<h2>Sin conexión a internet</h2>
      <p class="text-muted">Esta sección necesita conexión para iniciar sesión y consultar el servidor.</p>
      ${
        estadoAcceso().nivel !== "visitante"
          ? `<p class="text-muted">Tu acceso completo (${escapeHtml(estadoAcceso().email)}) sigue vigente sin conexión hasta el <strong>${fecha(venceLaCache(leerCache()))}</strong>; se renueva solo cada vez que abres la app con internet.</p>`
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
    const t = tarjeta(`<h2>Acceso restringido</h2>
      <p class="text-muted">Inicia sesión con tu cuenta de Google. Solo pueden entrar los correos autorizados por un administrador.</p>
      <div class="btn-row"><button type="button" class="btn btn-primary" data-login>Iniciar sesión con Google</button></div>
      <div data-msg></div>`);
    if (mensaje) aviso(t.querySelector("[data-msg]"), "warning", mensaje);
    const btn = t.querySelector("[data-login]");
    btn.addEventListener("click", async () => {
      btn.disabled = true;
      btn.textContent = "Abriendo Google…";
      try {
        const u = await b.iniciarSesion();
        await evaluarAcceso(u);
      } catch (e) {
        btn.disabled = false;
        btn.textContent = "Iniciar sesión con Google";
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
      const t = tarjeta(`<h2>Sin acceso</h2>
        <p class="text-muted">Tu cuenta <strong>${escapeHtml(u.email)}</strong> no está autorizada. Contacta al administrador para que agregue tu correo; mientras tanto puedes usar los módulos de libre acceso.</p>
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
    pintarPanel(u, perfil);
  }

  // ---------- 3. panel ----------
  function pintarPanel(u, perfil) {
    const esAdmin = perfil.rol === "admin";
    cuerpo.innerHTML = `
      <div class="card">
        <div class="dev-header">
          <span class="dev-avatar">${escapeHtml((u.nombre || u.email || "?").trim().charAt(0).toUpperCase())}</span>
          <div style="flex:1 1 auto;min-width:0">
            <p class="dev-name">${escapeHtml(u.nombre || u.email)}</p>
            <p class="dev-role">${escapeHtml(u.email)} · <span class="badge ${esAdmin ? "badge-success" : ""}">${escapeHtml(ETIQUETA_ROL[perfil.rol] || perfil.rol)}</span></p>
          </div>
          <button type="button" class="btn btn-sm" data-salir>Cerrar sesión</button>
        </div>
      </div>
      <div class="card" id="ca-usuarios"></div>
      <div class="card" id="ca-clave"></div>`;
    cuerpo.querySelector("[data-salir]").addEventListener("click", cerrarSesion);
    pintarUsuarios(perfil, esAdmin);
    pintarClave(esAdmin);
  }

  async function pintarUsuarios(perfil, esAdmin) {
    const box = cuerpo.querySelector("#ca-usuarios");
    box.innerHTML = `<h2 class="section-title" style="margin-top:0">Usuarios con acceso</h2><p class="text-muted" style="margin:0">Cargando…</p>`;
    let lista;
    try {
      lista = await b.listarUsuarios();
    } catch (e) {
      box.innerHTML = `<h2 class="section-title" style="margin-top:0">Usuarios con acceso</h2><div class="callout callout-danger" style="margin:0"><span>${escapeHtml(mensajeDe(e))}</span></div>`;
      return;
    }

    box.innerHTML = `
      <h2 class="section-title" style="margin-top:0">Usuarios con acceso</h2>
      <p class="text-muted text-sm">${esAdmin ? "Solo los correos de esta lista pueden entrar a esta sección. La lista se guarda en el servidor." : "Solo un administrador puede agregar o quitar usuarios."}</p>
      <div class="table-wrap"><table><thead><tr><th>Correo</th><th>Rol</th><th class="hide-narrow">Agregado por</th><th class="hide-narrow">Fecha</th>${esAdmin ? "<th></th>" : ""}</tr></thead><tbody id="ca-filas"></tbody></table></div>
      <div id="ca-msg-usuarios"></div>
      ${
        esAdmin
          ? `<div class="toolbar" style="margin-top:var(--space-4);margin-bottom:0">
              <div class="field search"><label for="ca-nuevo">Agregar correo</label><input type="email" id="ca-nuevo" placeholder="nombre@gmail.com" autocomplete="off"></div>
              <div class="field"><label for="ca-rol-nuevo">Rol</label><select id="ca-rol-nuevo">${ROLES.map((r) => `<option value="${r}">${ETIQUETA_ROL[r]}</option>`).join("")}</select></div>
              <button type="button" class="btn btn-primary" id="ca-agregar">Agregar</button>
            </div>`
          : ""
      }`;

    const msg = box.querySelector("#ca-msg-usuarios");
    const filas = box.querySelector("#ca-filas");
    for (const f of lista) {
      const yo = f.email === perfil.email;
      const tr = el("tr");
      tr.append(el("td", {}, [f.email, yo ? el("span", { class: "badge", style: "margin-left:8px" }, "tú") : null]));
      if (esAdmin) {
        const sel = el("select", { "aria-label": `Rol de ${f.email}`, style: "min-width:140px" });
        for (const r of ROLES) sel.append(el("option", { value: r, selected: r === f.rol }, ETIQUETA_ROL[r]));
        sel.disabled = yo; // un admin no puede bajarse el rol a si mismo (siempre debe quedar uno)
        sel.addEventListener("change", async () => {
          try {
            await b.guardarUsuario(f.email, sel.value);
            await pintarUsuarios(perfil, esAdmin);
          } catch (e) {
            sel.value = f.rol;
            aviso(msg, "danger", mensajeDe(e));
          }
        });
        tr.append(el("td", {}, sel));
      } else {
        tr.append(el("td", {}, ETIQUETA_ROL[f.rol] || f.rol));
      }
      tr.append(el("td", { class: "hide-narrow" }, f.agregadoPor || "—"), el("td", { class: "hide-narrow" }, fecha(f.fecha)));
      if (esAdmin) {
        const quitar = el("button", { type: "button", class: "btn btn-sm btn-ghost" }, "Quitar");
        quitar.disabled = yo;
        quitar.title = yo ? "No puedes quitarte a ti mismo" : "";
        quitar.addEventListener("click", async () => {
          if (!confirm(`¿Quitar el acceso a ${f.email}?`)) return;
          try {
            await b.quitarUsuario(f.email);
            await pintarUsuarios(perfil, esAdmin);
          } catch (e) {
            aviso(msg, "danger", mensajeDe(e));
          }
        });
        tr.append(el("td", {}, quitar));
      }
      filas.append(tr);
    }

    if (esAdmin) {
      const inp = box.querySelector("#ca-nuevo");
      const agregar = async () => {
        const email = normalizarCorreo(inp.value);
        if (!correoValido(email)) return aviso(msg, "warning", "Escribe un correo válido, por ejemplo nombre@gmail.com.");
        if (lista.some((x) => x.email === email)) return aviso(msg, "warning", "Ese correo ya está en la lista.");
        try {
          await b.guardarUsuario(email, box.querySelector("#ca-rol-nuevo").value);
          await pintarUsuarios(perfil, esAdmin);
          aviso(cuerpo.querySelector("#ca-msg-usuarios"), "success", `Se agregó ${email}. Debe iniciar sesión con esa cuenta de Google.`);
        } catch (e) {
          aviso(msg, "danger", mensajeDe(e));
        }
      };
      box.querySelector("#ca-agregar").addEventListener("click", agregar);
      inp.addEventListener("keydown", (e) => e.key === "Enter" && agregar());
    }
  }

  async function pintarClave(esAdmin) {
    const box = cuerpo.querySelector("#ca-clave");
    box.innerHTML = `<h2 class="section-title" style="margin-top:0">Clave de Gemini en el servidor</h2><p class="text-muted" style="margin:0">Cargando…</p>`;
    let hayPersonal = false;
    let hayCompartida = false;
    try {
      hayPersonal = !!(await b.leerClavePersonal());
      hayCompartida = !!(await b.leerClaveCompartida());
    } catch (e) {
      box.innerHTML = `<h2 class="section-title" style="margin-top:0">Clave de Gemini en el servidor</h2><div class="callout callout-danger" style="margin:0"><span>${escapeHtml(mensajeDe(e))}</span></div>`;
      return;
    }
    const estado = (hay) => (hay ? `<span class="badge badge-success">Configurada</span>` : `<span class="badge">Sin configurar</span>`);

    box.innerHTML = `
      <h2 class="section-title" style="margin-top:0">Clave de Gemini en el servidor</h2>
      <p class="text-muted text-sm">Además de guardar la clave en este navegador (Funciones de IA → Configuración), puedes guardarla en el servidor. Al usar las funciones de IA la clave se descarga y se mantiene <strong>solo en memoria</strong> mientras la app está abierta; no se copia a este navegador.</p>

      <div class="field">
        <label>Clave que usarán las funciones de IA</label>
        <div id="ca-fuentes" style="display:flex;flex-direction:column;gap:var(--space-2)"></div>
      </div>
      <div id="ca-msg-fuente"></div>

      <h3 style="margin:var(--space-5) 0 var(--space-2);font-size:.95rem">Mi clave personal ${estado(hayPersonal)}</h3>
      <div class="field">
        <div class="input-group">
          <input type="password" id="ca-k-personal" autocomplete="off" spellcheck="false" placeholder="Pega tu clave de Gemini (AIza…)">
          <button type="button" class="btn btn-primary" id="ca-g-personal" style="flex:0 0 auto">Guardar</button>
          <button type="button" class="btn" id="ca-b-personal" style="flex:0 0 auto" ${hayPersonal ? "" : "disabled"}>Borrar</button>
        </div>
        <span class="hint">Solo tú puedes leerla; ni siquiera los administradores.</span>
      </div>
      <div id="ca-msg-personal"></div>

      <h3 style="margin:var(--space-5) 0 var(--space-2);font-size:.95rem">Clave compartida ${estado(hayCompartida)}</h3>
      ${
        esAdmin
          ? `<div class="field">
              <div class="input-group">
                <input type="password" id="ca-k-compartida" autocomplete="off" spellcheck="false" placeholder="Pega la clave compartida (AIza…)">
                <button type="button" class="btn btn-primary" id="ca-g-compartida" style="flex:0 0 auto">Guardar</button>
                <button type="button" class="btn" id="ca-b-compartida" style="flex:0 0 auto" ${hayCompartida ? "" : "disabled"}>Borrar</button>
              </div>
            </div>`
          : `<p class="text-muted text-sm">Solo los administradores pueden cambiarla.</p>`
      }
      <div id="ca-msg-compartida"></div>
      <div class="callout callout-warning" style="margin:var(--space-4) 0 0"><span><strong>Ten presente:</strong> la clave compartida la puede leer cualquier usuario autorizado (técnicamente, con las herramientas del navegador). Compártela solo con personas de confianza; si alguien sale de la lista pierde el acceso, pero cambia la clave si sospechas que se filtró. Todos consumen el mismo cupo gratuito.</span></div>`;

    // fuente
    const contFuentes = box.querySelector("#ca-fuentes");
    const msgFuente = box.querySelector("#ca-msg-fuente");
    const disponible = { local: true, personal: hayPersonal, compartida: hayCompartida };
    for (const f of FUENTES) {
      const op = OPCIONES_FUENTE[f];
      const id = `ca-f-${f}`;
      const radio = el("input", { type: "radio", name: "ca-fuente", id, value: f, checked: obtenerFuente() === f });
      radio.addEventListener("change", () => {
        guardarFuente(f);
        if (!disponible[f]) aviso(msgFuente, "warning", `Elegiste ${op.titulo.toLowerCase()}, pero todavía no la has configurado: las funciones de IA te la pedirán.`);
        else aviso(msgFuente, "success", "Listo: las funciones de IA usarán esa clave.");
      });
      contFuentes.append(
        el("label", { for: id, class: "checkbox-row", style: "align-items:flex-start;color:var(--text)" }, [
          radio,
          el("span", {}, [el("strong", {}, op.titulo), el("br"), el("span", { class: "text-muted text-sm" }, op.desc)]),
        ])
      );
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

    box.querySelector("#ca-g-personal").addEventListener("click", guardarClave("personal"));
    box.querySelector("#ca-b-personal").addEventListener("click", borrarClave("personal"));
    if (esAdmin) {
      box.querySelector("#ca-g-compartida").addEventListener("click", guardarClave("compartida"));
      box.querySelector("#ca-b-compartida").addEventListener("click", borrarClave("compartida"));
    }
  }
}
