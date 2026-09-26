// Perfil > Datos: lo que la app guarda en este navegador, con «Borrar» por categoría, «Borrar todo», y respaldo en un
// archivo .json (descargar / restaurar) para pasar agentes, conversaciones y ajustes a otro equipo.
// Las CLAVES de IA nunca van en el respaldo (el archivo podría compartirse); tampoco la cache de acceso sin conexión
// (acceso.cache: la da el servidor) ni los archivos de la app (cache del service worker).

import { icon } from "../icons.js";
import { escapeHtml } from "./format.js";
import { todas, importar, borrarTodo, contar } from "../ai/historial.js";
import { AJUSTES_POR_DEFECTO } from "../ai/config.js";
import { aplicarTema } from "./tema.js";
import { CLAVE_DEFECTOS } from "./valores-defecto.js";
import { NOMBRES_EDITABLES, PREFIJO_COPIA } from "./catalogos-remotos.js";
import { olvidarDato } from "./format.js";

const PROVEEDORES = Object.keys(AJUSTES_POR_DEFECTO);
const claveApi = (p) => (p === "gemini" ? "ia.apiKey" : `ia.apiKey.${p}`);
const ajustesIa = (p) => (p === "gemini" ? "ia.ajustes" : `ia.ajustes.${p}`);
const NOMBRE_PROVEEDOR = { gemini: "Gemini", openai: "OpenAI", anthropic: "Claude" };

export const FORMATO_RESPALDO = 1;
const APP = "herramientas-ingenieria";

function leer(clave, almacen = "local") {
  try {
    return (almacen === "session" ? sessionStorage : localStorage).getItem(clave);
  } catch {
    return null;
  }
}
function quitar(clave) {
  for (const a of ["localStorage", "sessionStorage"]) {
    try {
      window[a].removeItem(clave);
    } catch {
      /* sin storage */
    }
  }
}
function escribir(clave, valor) {
  try {
    localStorage.setItem(clave, valor);
    return true;
  } catch {
    return false;
  }
}
const cuantosEn = (clave) => {
  try {
    const v = JSON.parse(leer(clave) || "[]");
    return Array.isArray(v) ? v.length : 0;
  } catch {
    return 0;
  }
};
const plural = (n, uno, varios) => `${n} ${n === 1 ? uno : varios}`;

// Categorías: `claves` (localStorage) que borra y, si `respaldo`, que copia al archivo.
export const CATEGORIAS = [
  {
    id: "conversaciones",
    nombre: "Conversaciones de IA",
    respaldo: true,
    claves: [],
    detalle: async () => plural(await contar(), "conversación", "conversaciones"),
    borrarExtra: borrarTodo,
  },
  {
    id: "agentes",
    nombre: "Agentes propios de IA",
    respaldo: true,
    claves: ["ia.agentesAnalisis", "ia.agentes", "ia.agenteAnalisisActivo", "ia.agenteActivo"],
    detalle: async () => {
      const n = cuantosEn("ia.agentesAnalisis") + (leer("ia.agentes") ? cuantosEn("ia.agentes") : 0);
      return n ? plural(n, "agente", "agentes") : "Ninguno";
    },
  },
  {
    id: "ajustesIa",
    nombre: "Ajustes de IA (proveedor, modelo, temperatura)",
    respaldo: true,
    claves: ["ia.proveedor", "ia.fuenteClave", ...PROVEEDORES.map(ajustesIa)],
  },
  {
    id: "clavesIa",
    nombre: "Claves de IA",
    respaldo: false,
    claves: PROVEEDORES.map(claveApi),
    detalle: async () => {
      const con = PROVEEDORES.filter((p) => leer(claveApi(p)) || leer(claveApi(p), "session"));
      return con.length ? con.map((p) => NOMBRE_PROVEEDOR[p] || p).join(", ") : "Ninguna";
    },
  },
  {
    id: "valoraciones",
    nombre: "Valoraciones integrales guardadas en este dispositivo",
    respaldo: true,
    claves: ["valoraciones.guardadas"],
    detalle: async () => {
      try {
        const n = (JSON.parse(leer("valoraciones.guardadas") || "null")?.items || []).length;
        return n ? plural(n, "valoración", "valoraciones") : "Ninguna";
      } catch {
        return "Ninguna";
      }
    },
  },
  {
    id: "calculadoras",
    nombre: "Valores por defecto de las calculadoras",
    respaldo: true,
    claves: [CLAVE_DEFECTOS],
  },
  {
    id: "catalogos",
    nombre: "Catálogos descargados del servidor",
    respaldo: false, // son del servidor: se vuelven a descargar solos
    claves: NOMBRES_EDITABLES.map((n) => PREFIJO_COPIA + n),
    detalle: async () => {
      const n = NOMBRES_EDITABLES.filter((x) => leer(PREFIJO_COPIA + x) !== null).length;
      return n ? `${n} de ${NOMBRES_EDITABLES.length}` : "Ninguno (se usan los que trae la app)";
    },
    despues: () => NOMBRES_EDITABLES.forEach(olvidarDato),
  },
  {
    id: "apariencia",
    nombre: "Apariencia (tema, colores, menú contraído)",
    respaldo: true,
    claves: ["theme", "tema.colores", "tema.css", "sidebarCollapsed"],
    despues: () => aplicarTema(),
  },
];

const CLAVES_RESPALDO = new Set(CATEGORIAS.filter((c) => c.respaldo).flatMap((c) => c.claves));

async function detalleDe(cat) {
  if (cat.detalle) return cat.detalle();
  return cat.claves.some((k) => leer(k) !== null) ? "Guardado" : "Sin datos";
}

async function borrarCategoria(cat) {
  cat.claves.forEach(quitar);
  if (cat.borrarExtra) await cat.borrarExtra();
  cat.despues?.();
}

/** Arma el objeto del respaldo (sin claves de IA). */
export async function armarRespaldo(version = "") {
  const almacenamiento = {};
  for (const k of CLAVES_RESPALDO) {
    const v = leer(k);
    if (v !== null) almacenamiento[k] = v;
  }
  return { app: APP, tipo: "respaldo", formato: FORMATO_RESPALDO, creado: new Date().toISOString(), version, almacenamiento, conversaciones: await todas() };
}

/** Valida un respaldo leído de un archivo. Devuelve un mensaje de error o null si sirve. */
export function validarRespaldo(r) {
  if (!r || typeof r !== "object" || r.app !== APP || r.tipo !== "respaldo") return "El archivo no es un respaldo de esta aplicación.";
  if (typeof r.formato !== "number" || r.formato > FORMATO_RESPALDO) return "El respaldo es de una versión más nueva de la aplicación: actualízala e inténtalo de nuevo.";
  if (r.almacenamiento && (typeof r.almacenamiento !== "object" || Array.isArray(r.almacenamiento))) return "El respaldo está dañado.";
  if (r.conversaciones && !Array.isArray(r.conversaciones)) return "El respaldo está dañado.";
  return null;
}

/** Restaura: reemplaza ajustes, agentes y apariencia; SUMA las conversaciones (las de mismo id se reemplazan). */
export async function restaurarRespaldo(r) {
  for (const k of CLAVES_RESPALDO) quitar(k);
  let ajustes = 0;
  for (const [k, v] of Object.entries(r.almacenamiento || {})) {
    if (CLAVES_RESPALDO.has(k) && typeof v === "string" && escribir(k, v)) ajustes++;
  }
  const convs = (r.conversaciones || []).filter((c) => c && typeof c.id === "string" && (c.tipo === "analisis" || c.tipo === "redaccion"));
  const ok = convs.length ? await importar(convs) : true;
  aplicarTema();
  return { ajustes, conversaciones: ok ? convs.length : 0 };
}

function descargar(nombre, texto) {
  const url = URL.createObjectURL(new Blob([texto], { type: "application/json" }));
  const a = document.createElement("a");
  a.href = url;
  a.download = nombre;
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

const megas = (b) => (b >= 1048576 ? `${(b / 1048576).toFixed(1).replace(".", ",")} MB` : `${Math.max(1, Math.round(b / 1024))} KB`);

export function pintarDatos(box, { recargar = () => location.reload(), confirmar = (t) => confirm(t) } = {}) {
  box.innerHTML = `
    <div class="form-section-title">${icon("database")} Datos en este dispositivo</div>
    <p class="text-muted text-sm" style="margin-top:0">La app guarda estos datos solo en este navegador; no se suben a ningún servidor. <span data-espacio></span></p>
    <div class="table-wrap"><table class="pf-datos"><thead><tr><th>Dato</th><th>Contenido</th><th></th></tr></thead><tbody data-filas></tbody></table></div>
    <div class="btn-row pf-datos-acciones">
      <button type="button" class="btn btn-primary btn-con-icono" data-respaldar>${icon("download")} Descargar respaldo</button>
      <button type="button" class="btn btn-con-icono" data-restaurar>${icon("upload")} Restaurar respaldo</button>
      <button type="button" class="btn btn-con-icono" data-todo>${icon("trash")} Borrar todo</button>
      <input type="file" accept=".json,application/json" data-archivo hidden>
    </div>
    <p class="text-muted text-sm" style="margin:var(--space-2) 0 0">El respaldo incluye conversaciones, agentes, ajustes y apariencia, pero NO las claves de IA: tendrás que volver a pegarlas en el otro equipo.</p>
    <div data-msg></div>`;

  const $ = (s) => box.querySelector(s);
  const msg = $("[data-msg]");
  const aviso = (tipo, texto) => {
    msg.innerHTML = `<div class="callout callout-${tipo}" style="margin:var(--space-3) 0 0"><span>${escapeHtml(texto)}</span></div>`;
  };

  function pintarFilas() {
    const filas = $("[data-filas]");
    // la tabla se pinta de inmediato; cada «Contenido» se llena cuando esté listo (contar conversaciones usa IndexedDB)
    filas.innerHTML = CATEGORIAS.map(
      (c) => `<tr><td>${escapeHtml(c.nombre)}</td><td data-detalle="${c.id}">…</td><td style="text-align:right">
        <button type="button" class="btn btn-sm btn-ghost btn-icono" data-borrar="${c.id}" aria-label="Borrar ${escapeHtml(c.nombre)}" title="Borrar">${icon("trash")}</button></td></tr>`
    ).join("");
    for (const c of CATEGORIAS) {
      detalleDe(c).then((t) => {
        const celda = filas.querySelector(`[data-detalle="${c.id}"]`);
        if (celda) celda.textContent = t;
      });
    }
    for (const b of filas.querySelectorAll("[data-borrar]")) {
      b.addEventListener("click", async () => {
        const cat = CATEGORIAS.find((c) => c.id === b.dataset.borrar);
        if (!confirmar(`¿Borrar «${cat.nombre}» de este dispositivo? No se puede deshacer.`)) return;
        await borrarCategoria(cat);
        aviso("success", `Se borró «${cat.nombre}».`);
        pintarFilas();
      });
    }
  }
  pintarFilas();

  if (navigator.storage?.estimate) {
    navigator.storage
      .estimate()
      .then(({ usage }) => {
        if (usage) $("[data-espacio]").textContent = `En total ocupa ${megas(usage)}, contando los archivos para usarla sin conexión.`;
      })
      .catch(() => {});
  }

  $("[data-respaldar]").addEventListener("click", async () => {
    const r = await armarRespaldo();
    const hoy = new Date().toISOString().slice(0, 10);
    descargar(`herramientas-respaldo-${hoy}.json`, JSON.stringify(r, null, 2));
    aviso("success", `Respaldo descargado (${plural(r.conversaciones.length, "conversación", "conversaciones")}). Guárdalo en un lugar seguro: contiene tus conversaciones.`);
  });

  const archivo = $("[data-archivo]");
  $("[data-restaurar]").addEventListener("click", () => archivo.click());
  archivo.addEventListener("change", async () => {
    const f = archivo.files?.[0];
    archivo.value = "";
    if (!f) return;
    let r;
    try {
      r = JSON.parse(await f.text());
    } catch {
      return aviso("danger", "No se pudo leer el archivo: no es un respaldo válido.");
    }
    const error = validarRespaldo(r);
    if (error) return aviso("danger", error);
    const cuando = r.creado ? new Date(r.creado).toLocaleString("es-CO", { dateStyle: "medium", timeStyle: "short" }) : "fecha desconocida";
    if (!confirmar(`¿Restaurar el respaldo del ${cuando}?\n\nLos ajustes, agentes, valores de las calculadoras y apariencia de este dispositivo se REEMPLAZAN por los del respaldo. Las conversaciones del respaldo se suman a las que ya tienes.`)) return;
    const res = await restaurarRespaldo(r);
    aviso("success", `Respaldo restaurado (${plural(res.conversaciones, "conversación", "conversaciones")}). La app se recargará para aplicarlo.`);
    setTimeout(recargar, 1200);
  });

  $("[data-todo]").addEventListener("click", async () => {
    if (!confirmar("¿Borrar TODOS los datos de la app en este dispositivo (conversaciones, agentes, ajustes y claves de IA, valores de las calculadoras y apariencia)? No se puede deshacer.\n\nTu sesión y los archivos para usar la app sin conexión se conservan.")) return;
    // primero todo lo de localStorage (inmediato) y después las conversaciones (IndexedDB), para que si esa base no
    // responde no se quede sin borrar lo demás
    for (const c of CATEGORIAS) c.claves.forEach(quitar);
    await Promise.all(CATEGORIAS.map((c) => c.borrarExtra?.()));
    for (const c of CATEGORIAS) c.despues?.();
    aviso("success", "Se borraron todos los datos de este dispositivo. La app se recargará.");
    setTimeout(recargar, 1200);
  });
}
