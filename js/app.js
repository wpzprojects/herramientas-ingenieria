import { icon } from "./icons.js";
import { sidebarLinks, perfilLink } from "./nav.js";
import { iniciarAcceso, alCambiarAcceso } from "./auth/acceso.js";
import { aplicarTema, colorMeta } from "./util/tema.js";
import { initRouter } from "./router.js";

const shell = document.getElementById("app-shell");
const sidebar = document.getElementById("sidebar");
const navList = document.getElementById("nav-list");
const navToggle = document.getElementById("nav-toggle");
const backdrop = document.getElementById("sidebar-backdrop");
const mount = document.getElementById("app");

document.getElementById("brand-mark").innerHTML = icon("bolt");
navToggle.innerHTML = icon("menu");

// --- Tema claro/oscuro ---
const THEME_KEY = "theme";
const themeToggle = document.getElementById("theme-toggle");
const prefersDark = window.matchMedia("(prefers-color-scheme: dark)");

function systemTheme() {
  return prefersDark.matches ? "dark" : "light";
}

function applyTheme(theme) {
  document.documentElement.setAttribute("data-theme", theme);
  themeToggle.innerHTML = icon(theme === "dark" ? "sun" : "moon");
  themeToggle.setAttribute(
    "aria-label",
    theme === "dark" ? "Cambiar a tema claro" : "Cambiar a tema oscuro"
  );
  document.getElementById("theme-color-meta").setAttribute("content", colorMeta(theme));
}

aplicarTema(); // colores personales de Perfil > Apariencia (si los hay)
applyTheme(localStorage.getItem(THEME_KEY) || systemTheme());
document.addEventListener("tema-personal", () => applyTheme(document.documentElement.getAttribute("data-theme") || "light"));

themeToggle.addEventListener("click", () => {
  const next = document.documentElement.getAttribute("data-theme") === "dark" ? "light" : "dark";
  localStorage.setItem(THEME_KEY, next);
  applyTheme(next);
});

prefersDark.addEventListener("change", () => {
  if (!localStorage.getItem(THEME_KEY)) applyTheme(systemTheme());
});

// title: con el menu contraido (solo iconos) sirve de tooltip
navList.innerHTML = sidebarLinks
  .map(
    (link) => `
    <li>
      <a class="nav-link" data-key="${link.key}" href="${link.hash}" title="${link.title}">
        <span class="nav-icon">${icon(link.icon)}</span>
        <span class="nav-label">${link.title}</span>
      </a>
    </li>`
  )
  .join("");

// Perfil: ultimo elemento del menu, encima del boton de contraer (en el cajon del celular queda al final de la lista)
const navPerfil = document.getElementById("nav-perfil");
navPerfil.innerHTML = `
    <li>
      <a class="nav-link" data-key="${perfilLink.key}" href="${perfilLink.hash}" title="${perfilLink.title}">
        <span class="nav-icon">${icon(perfilLink.icon)}</span>
        <span class="nav-label">${perfilLink.title}</span>
      </a>
    </li>`;

// --- Menu lateral contraible (solo pantallas anchas; en movil se mantiene el cajon emergente) ---
const SIDEBAR_KEY = "sidebarCollapsed";
const collapseBtn = document.getElementById("sidebar-collapse");

// Clase aparte para el "salto" de layout no animable (justify-content/padding, que centran el
// icono contraido): al contraer se agrega recien cuando termina de angostarse el ancho (evento
// transitionend, con un respaldo por si no hubo transicion), para que el icono no salte al
// centro mientras la barra todavia se ve ancha; al expandir se quita de inmediato.
const SNAP_CLASS = "sb-collapsed-snap";

function applySidebarCollapsed(collapsed, { animar = true } = {}) {
  const html = document.documentElement;
  html.classList.toggle("sb-collapsed", collapsed);
  if (!collapsed) {
    html.classList.remove(SNAP_CLASS);
  } else if (!animar) {
    html.classList.add(SNAP_CLASS);
  } else {
    let hecho = false;
    const marcar = () => {
      if (hecho) return;
      hecho = true;
      html.classList.add(SNAP_CLASS);
    };
    const onTransitionEnd = (e) => {
      if (e.target === sidebarEl && e.propertyName === "width") marcar();
    };
    const sidebarEl = document.querySelector(".sidebar");
    sidebarEl?.addEventListener("transitionend", onTransitionEnd, { once: true });
    setTimeout(marcar, 200); // respaldo: pantalla angosta o prefers-reduced-motion (sin transicion)
  }
  const label = collapsed ? "Expandir menú" : "Contraer menú";
  // con el menú abierto se lee «Contraer menú» junto al icono; contraído solo queda el icono (.nav-label se oculta)
  collapseBtn.innerHTML = `<span class="nav-icon">${icon(collapsed ? "sidebarExpand" : "sidebarCollapse")}</span><span class="nav-label">${label}</span>`;
  collapseBtn.setAttribute("aria-label", label);
  collapseBtn.setAttribute("title", label);
  collapseBtn.setAttribute("aria-expanded", String(!collapsed));
}

applySidebarCollapsed(document.documentElement.classList.contains("sb-collapsed"), { animar: false });

collapseBtn.addEventListener("click", () => {
  const next = !document.documentElement.classList.contains("sb-collapsed");
  try {
    localStorage.setItem(SIDEBAR_KEY, next ? "1" : "0");
  } catch (e) {
    /* sin storage: el estado solo dura la sesion */
  }
  applySidebarCollapsed(next);
});

function setActiveLink(path) {
  const section = path.split("/").filter(Boolean)[0] || "";
  document.querySelectorAll("#nav-list .nav-link, #nav-perfil .nav-link").forEach((a) => {
    a.classList.toggle("active", a.dataset.key === section);
  });
}

function closeMobileNav() {
  shell.classList.remove("nav-open");
  navToggle.setAttribute("aria-expanded", "false");
}

navToggle.addEventListener("click", () => {
  const open = shell.classList.toggle("nav-open");
  navToggle.setAttribute("aria-expanded", String(open));
});
backdrop.addEventListener("click", closeMobileNav);
[navList, navPerfil].forEach((lista) =>
  lista.addEventListener("click", (e) => {
    if (e.target.closest("a")) closeMobileNav();
  })
);

// Nivel de acceso: se aplica de inmediato lo guardado en el dispositivo y se valida en segundo plano (js/auth/acceso.js)
iniciarAcceso();

const router = initRouter({
  mount,
  onNavigate: (path) => {
    setActiveLink(path);
    closeMobileNav();
  },
});

// Si el nivel cambia (termina la validacion, inicio o cierre de sesion) se vuelve a pintar la pantalla actual, salvo el
// Perfil, que maneja su propio estado y no debe reiniciarse mientras se usa.
alCambiarAcceso(() => {
  if (!router.currentPath().startsWith("/perfil")) router.refresh();
});

// --- lightbox global para imagenes normativas (delegado en <body>) ---
const lightbox = document.getElementById("lightbox");
const lightboxImg = document.getElementById("lightbox-img");
document.getElementById("lightbox-close").addEventListener("click", () => (lightbox.hidden = true));
lightbox.addEventListener("click", (e) => {
  if (e.target === lightbox) lightbox.hidden = true;
});
document.addEventListener("keydown", (e) => {
  if (e.key === "Escape" && !lightbox.hidden) lightbox.hidden = true;
});
document.addEventListener("click", (e) => {
  const trigger = e.target.closest("[data-lightbox]");
  if (!trigger) return;
  lightboxImg.src = trigger.getAttribute("data-lightbox");
  lightboxImg.alt = trigger.alt || "";
  lightbox.hidden = false;
});

// --- Service worker (offline / instalable) ---
if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("sw.js").catch((err) => console.warn("SW no registrado:", err));
  });
}
