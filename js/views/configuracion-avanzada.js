// Perfil y configuracion avanzada (menu lateral > Perfil, #/perfil): acceso con cuenta de Google.
// Muestra el login y, si el correo esta en la lista de usuarios autorizados (guardada en el
// servidor, no en el repositorio), la cuenta con su nivel de acceso y, solo para administradores, la
// gestion de esa lista. La seguridad real la aplican las reglas de Firestore (firebase/firestore.rules);
// esta pantalla solo decide que mostrar.
// Diseño (2026-09-19): mismas tarjetas de las calculadoras (relleno de 16 px, barra de titulo con icono, ayudas «i»).
// La gestion de la clave de Gemini en el servidor (personal/compartida) se trasladó a Funciones con IA →
// Configuración (2026-09-23, pedido del usuario: toda la config de IA en un solo lugar); ver
// js/views/ia-configuracion.js.

import { el, escapeHtml } from "../util/format.js";
import { icon } from "../icons.js";
import { activarInfos } from "../util/info-campo.js";
import { obtenerBackend, esperarSesion, ROLES, ErrorAcceso, correoValido, normalizarCorreo } from "../auth/backend.js";
import { olvidarClaveServidor } from "../ai/clave.js";
import { estadoAcceso, venceLaCache, leerCache, revalidar } from "../auth/acceso.js";
import { PREDETERMINADO, leerColores, guardarColor, ajustarBase } from "../util/tema.js";

const fecha = (ms) => (ms ? new Date(ms).toLocaleDateString("es-CO", { dateStyle: "medium" }) : "—");
const mensajeDe = (e) => (e instanceof ErrorAcceso ? e.message : `Error inesperado: ${e?.message || e}`);
const ETIQUETA_ROL = { admin: "Administrador", usuario: "Usuario" };
const insigniaRol = (rol) => `<span class="badge ${rol === "admin" ? "badge-success" : ""}">${escapeHtml(ETIQUETA_ROL[rol] || rol)}</span>`;

// Apariencia (Perfil): muestras de color y textos
const MUESTRAS = {
  oscuro: [["#4c9eff", "Azul (predeterminado)"], ["#22d3ee", "Cian"], ["#2dd4bf", "Turquesa"], ["#4ade80", "Verde"], ["#fbbf24", "Ámbar"], ["#fb923c", "Naranja"], ["#f87171", "Rojo"], ["#a78bfa", "Violeta"], ["#94a3b8", "Gris azulado"]],
  claro: [["#0e7c7b", "Verde azulado (predeterminado)"], ["#2563eb", "Azul"], ["#0e7490", "Cian"], ["#15803d", "Verde"], ["#b45309", "Ámbar"], ["#c2410c", "Naranja"], ["#b91c1c", "Rojo"], ["#be185d", "Rosa"], ["#475569", "Gris azulado"]],
};
const NOMBRE_TEMA = { oscuro: "Tema oscuro", claro: "Tema claro" };
const VISTA = { oscuro: "dark", claro: "light" };
const AYUDA_COLOR =
  "Pulsa el cuadro de color para elegir un color personalizado, o usa una de las muestras. Los demás tonos se calculan solos. Si un color dificulta la lectura, se ajusta un poco.";

// #/perfil abre la primera pestaña; #/perfil/usuarios o #/perfil/apariencia abren esa pestaña (si la persona la tiene).
export async function render(container, params = {}) {
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
      <p class="text-muted text-sm">Sin iniciar sesión puedes usar algunas funcionalidades. Con una cuenta autorizada se habilitan todos los módulos.</p>
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
    // el administrador ve Usuarios; todos los autorizados ven la apariencia (color personal, por dispositivo)
    const pestanas = [...(esAdmin ? [["usuarios", "Usuarios"]] : []), ["apariencia", "Apariencia"]];
    const inicial = pestanas.some(([id]) => id === params?.pestana) ? params.pestana : pestanas[0][0];
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
      <div class="tabs ca-tabs" role="tablist">
        ${pestanas.map(([id, rotulo], i) => `<button type="button" class="tab-btn${id === inicial ? " active" : ""}" role="tab" aria-selected="${id === inicial}" data-tab="${id}">${rotulo}</button>`).join("")}
      </div>
      ${pestanas.map(([id]) => `<div class="tab-panel" id="ca-tab-${id}"${id === inicial ? "" : " hidden"}><div class="card tarjeta-borde form-section" id="ca-${id}"></div></div>`).join("")}`;
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
    pintarApariencia();
  }

  // ---------- apariencia: color principal de cada tema (personal, por dispositivo; ver js/util/tema.js) ----------
  function pintarApariencia() {
    const box = cuerpo.querySelector("#ca-apariencia");
    const bloque = (tema) => `
      <div class="ap-tema" data-tema="${tema}">
        <div class="ap-rejilla">
        <div class="ap-cabecera">
          <h3>${NOMBRE_TEMA[tema]}</h3>
          <button type="button" class="btn btn-sm" data-restablecer>Restablecer</button>
        </div>
        <div class="ap-cuerpo">
        <div class="field">
          <label for="ap-color-${tema}" data-info="${escapeHtml(AYUDA_COLOR)}">Color principal</label>
          <div class="ap-selector">
            <input type="color" id="ap-color-${tema}" value="${PREDETERMINADO[tema].base}" aria-label="Color principal del ${NOMBRE_TEMA[tema].toLowerCase()}">
            <code data-hex></code>
            <div class="ap-muestras">${MUESTRAS[tema].map(([hex, nombre]) => `<button type="button" class="ap-muestra" style="background:${hex}" data-color="${hex}" aria-label="${nombre}" title="${nombre}" aria-pressed="false"></button>`).join("")}</div>
          </div>
          <p class="text-muted text-sm" data-ajuste hidden style="margin:var(--space-2) 0 0">Ajustamos un poco el tono para que el texto siga legible.</p>
        </div>
        <div class="vista-tema" data-vista="${VISTA[tema]}" aria-label="Vista previa del ${NOMBRE_TEMA[tema].toLowerCase()}">
          <div class="vt-barra"><span class="vt-logo"></span> Herramientas</div>
          <div class="vt-cuerpo">
            <div class="vt-fila"><span class="vt-activo">Cálculos</span><button type="button" class="btn btn-primary btn-sm" tabindex="-1">Botón</button><a href="#/perfil" tabindex="-1" onclick="return false">Enlace</a><span class="badge badge-success">Estado</span></div>
            <div class="vt-tabla"><span>Encabezado</span><span>Valor</span><span class="vt-sugerida">Sugerida</span><span class="vt-sugerida">12,3</span></div>
          </div>
        </div>
        </div>
        </div>
      </div>`;
    box.innerHTML = `${barra("palette", "Apariencia")}${bloque("oscuro")}${bloque("claro")}`;
    activarInfos(box);

    const refrescar = (tema) => {
      const cont = box.querySelector(`.ap-tema[data-tema="${tema}"]`);
      const actual = leerColores()[tema] || PREDETERMINADO[tema].base;
      cont.querySelector("[data-hex]").textContent = actual.toUpperCase();
      for (const m of cont.querySelectorAll(".ap-muestra")) m.setAttribute("aria-pressed", String(m.dataset.color === actual));
      return { cont, actual };
    };
    for (const tema of ["oscuro", "claro"]) {
      const { cont } = refrescar(tema);
      const entrada = cont.querySelector('input[type="color"]');
      entrada.value = leerColores()[tema] || PREDETERMINADO[tema].base;
      const elegir = (hex) => {
        const pedido = hex.toLowerCase();
        const efectivo = guardarColor(tema, pedido);
        const { cont: c } = refrescar(tema);
        const ajustado = ajustarBase(tema, pedido).ajustado;
        c.querySelector("[data-ajuste]").hidden = !ajustado;
        if (ajustado || hex === efectivo) entrada.value = efectivo; // si se ajusto, el selector muestra el color efectivo
      };
      entrada.addEventListener("input", () => elegir(entrada.value));
      for (const m of cont.querySelectorAll(".ap-muestra")) {
        m.addEventListener("click", () => {
          entrada.value = m.dataset.color;
          elegir(m.dataset.color);
        });
      }
      cont.querySelector("[data-restablecer]").addEventListener("click", () => {
        guardarColor(tema, null);
        refrescar(tema);
        entrada.value = PREDETERMINADO[tema].base;
        cont.querySelector("[data-ajuste]").hidden = true;
      });
    }
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
          <select id="ca-rol-nuevo">${ROLES.map((r) => `<option value="${r}"${r === "usuario" ? " selected" : ""}>${ETIQUETA_ROL[r]}</option>`).join("")}</select>
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
}
