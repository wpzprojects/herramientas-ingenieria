import { icon } from "./icons.js";
import { sidebarLinks } from "./nav.js";
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
  document
    .getElementById("theme-color-meta")
    .setAttribute("content", theme === "dark" ? "#0c1420" : "#0a66c2");
}

applyTheme(localStorage.getItem(THEME_KEY) || systemTheme());

themeToggle.addEventListener("click", () => {
  const next = document.documentElement.getAttribute("data-theme") === "dark" ? "light" : "dark";
  localStorage.setItem(THEME_KEY, next);
  applyTheme(next);
});

prefersDark.addEventListener("change", () => {
  if (!localStorage.getItem(THEME_KEY)) applyTheme(systemTheme());
});

navList.innerHTML = sidebarLinks
  .map(
    (link) => `
    <li>
      <a class="nav-link" data-key="${link.key}" href="${link.hash}">
        <span class="nav-icon">${icon(link.icon)}</span>
        <span>${link.title}</span>
      </a>
    </li>`
  )
  .join("");

function setActiveLink(path) {
  const section = path.split("/").filter(Boolean)[0] || "";
  navList.querySelectorAll(".nav-link").forEach((a) => {
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
navList.addEventListener("click", (e) => {
  if (e.target.closest("a")) closeMobileNav();
});

initRouter({
  mount,
  onNavigate: (path) => {
    setActiveLink(path);
    closeMobileNav();
  },
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
