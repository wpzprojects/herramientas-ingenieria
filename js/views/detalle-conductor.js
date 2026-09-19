// Ficha de detalle GENERICA de un conductor, reutilizada por las 3 familias
// del catalogo, parametrizada por :familia/:id (#/catalogos/:familia/:id).
// "id" llega como string desde la URL; en conductores-semiaislados.json el
// campo id es numerico, en los otros dos es string tipo "001" - por eso la
// busqueda siempre compara con String(row.id) === id.

import { el, fmt, loadData } from "../util/format.js";

const CONFIG = {
  desnudos: {
    dataFile: "conductores-desnudos",
    tituloFamilia: "Conductores desnudos",
    titleField: "nombre_clave",
    campos: [
      { key: "tipo", label: "Tipo" },
      { key: "nombre_clave", label: "Nombre clave" },
      { key: "calibre_awg_kcmil", label: "Calibre (AWG o kcmil)" },
      { key: "conductor_equivalente_acsr", label: "Conductor equivalente ACSR" },
      { key: "clase", label: "Clase" },
      { key: "carga_rotura_kgf", label: "Carga de rotura (kgf)" },
      { key: "masa_kg_km", label: "Masa (kg/km)" },
      { key: "area_seccion_aluminio_mm2", label: "Área sección aluminio (mm²)" },
      { key: "corriente_75c_a", label: "Corriente a 75°C (A)" },
      { key: "corriente_200c_a", label: "Corriente a 200°C (A)" },
      { key: "corriente_250c_a", label: "Corriente a 250°C (A)" },
      { key: "corriente_sol_no_viento_a", label: "Corriente sol y no viento (A)" },
      { key: "corriente_sol_viento_a", label: "Corriente sol y viento (A)" },
      { key: "corriente_no_sol_viento_a", label: "Corriente no sol y viento (A)" },
      { key: "corriente_cortocircuito_1s_ka", label: "Corriente cortocircuito 1s (kA)" },
      { key: "diametro_cable_mm", label: "Diámetro del cable (mm)" },
      { key: "diametro_hilos_acero_mm", label: "Diámetro hilos acero (mm)" },
      { key: "diametro_hilos_aluminio_mm", label: "Diámetro hilos aluminio (mm)" },
      { key: "diametro_nucleo_acero_mm", label: "Diámetro núcleo acero (mm)" },
      { key: "numero_hilos_al1350_al6201", label: "Número de hilos (Al1350/Al6201)" },
      { key: "numero_hilos_aluminio_acero", label: "Número de hilos (Aluminio/Acero)" },
      { key: "r_cc_20c_ohm_km", label: "R CC a 20°C (Ω/km)" },
      { key: "r_ac_25c_ohm_km", label: "R AC a 25°C (Ω/km)" },
      { key: "r_ac_75c_ohm_km", label: "R AC a 75°C (Ω/km)" },
      { key: "radio_medio_geometrico_mm", label: "Radio medio geométrico (mm)" },
    ],
  },
  semiaislados: {
    dataFile: "conductores-semiaislados",
    tituloFamilia: "Conductores semiaislados",
    titleField: "nombre_clave",
    campos: [
      { key: "tension_operacion_kv", label: "Tensión de operación (kV)" },
      { key: "capas", label: "Capas" },
      { key: "material_conductor", label: "Material" },
      { key: "calibre_awg_kcmil", label: "Calibre (AWG o kcmil)" },
      { key: "nombre_clave", label: "Nombre clave" },
      { key: "diametro_total_mm", label: "Diámetro total (mm)" },
      { key: "numero_hilos", label: "Número de hilos" },
      { key: "masa_total_kg_km", label: "Masa total (kg/km)" },
    ],
  },
  xlpe: {
    dataFile: "conductores-xlpe",
    tituloFamilia: "Conductores XLPE (MT)",
    titleField: null, // no tiene nombre_clave: se arma con calibre + material
    campos: [
      { key: "tipo", label: "Tipo" },
      { key: "nivel_tension_kv", label: "Nivel de tensión (kV)" },
      { key: "calibre_awg_kcmil", label: "Calibre (AWG/kcmil)" },
      { key: "material_conductor", label: "Material del conductor" },
      { key: "diametro_conductor_mm", label: "Diámetro del conductor (mm)" },
      { key: "area_conductor_mm2", label: "Área del conductor (mm²)" },
      { key: "porcentaje_aislamiento_pct", label: "Porcentaje de aislamiento (%)" },
      { key: "espesor_aislamiento_mm", label: "Espesor de aislamiento (mm)" },
      { key: "diametro_sobre_aislamiento_mm", label: "Diámetro sobre aislamiento (mm)" },
      { key: "pantalla", label: "Pantalla" },
      { key: "num_hilos_pantalla", label: "Número de hilos de pantalla" },
      { key: "diametro_cada_hilo_pantalla_mm", label: "Diámetro de cada hilo (mm)" },
      { key: "espesor_chaqueta_mm", label: "Espesor de chaqueta (mm)" },
      { key: "diametro_total_conductor_mm", label: "Diámetro total del conductor (mm)" },
      { key: "masa_total_kg_km", label: "Masa total (kg/km)" },
      { key: "r_cc_20c_ohm_km", label: "R CC a 20°C (Ω/km)" },
      { key: "r_ac_75c_ohm_km", label: "R AC a 75°C (Ω/km)" },
      { key: "r_ac_90c_ohm_km", label: "R AC a 90°C (Ω/km)" },
      { key: "radio_medio_geometrico_mm", label: "Radio medio geométrico (mm)" },
    ],
  },
};

function tituloDeFila(cfg, row) {
  if (cfg.titleField && row[cfg.titleField] !== null && row[cfg.titleField] !== undefined && row[cfg.titleField] !== "") {
    return String(row[cfg.titleField]);
  }
  return `${row.calibre_awg_kcmil ?? "—"} AWG/kcmil - ${row.material_conductor ?? "—"}`;
}

export async function render(container, params) {
  const cfg = CONFIG[params.familia];

  if (!cfg) {
    container.append(
      el("div", { class: "empty-state" }, [
        el("h2", {}, "Catálogo no reconocido"),
        el("p", { class: "text-muted" }, `La familia "${params.familia}" no existe.`),
        el("p", {}, el("a", { class: "btn btn-ghost", href: "#/catalogos" }, "← Volver a catálogos")),
      ])
    );
    return;
  }

  const rows = await loadData(cfg.dataFile);
  const row = rows.find((r) => String(r.id) === params.id);

  if (!row) {
    container.append(
      el("nav", { class: "breadcrumb" }, [
        el("a", { href: "#/" }, "Inicio"),
        el("span", {}, "/"),
        el("a", { href: "#/catalogos" }, "Catálogos"),
        el("span", {}, "/"),
        el("a", { href: `#/catalogos/${params.familia}` }, cfg.tituloFamilia),
      ]),
      el("div", { class: "empty-state" }, [
        el("h2", {}, "Conductor no encontrado"),
        el("p", { class: "text-muted" }, `No existe un conductor con id "${params.id}" en ${cfg.tituloFamilia}.`),
        el("p", {}, el("a", { class: "btn btn-ghost", href: `#/catalogos/${params.familia}` }, "← Volver al catálogo")),
      ])
    );
    return;
  }

  const titulo = tituloDeFila(cfg, row);

  container.append(
    el("nav", { class: "breadcrumb" }, [
      el("a", { href: "#/" }, "Inicio"),
      el("span", {}, "/"),
      el("a", { href: "#/catalogos" }, "Catálogos"),
      el("span", {}, "/"),
      el("a", { href: `#/catalogos/${params.familia}` }, cfg.tituloFamilia),
      el("span", {}, "/"),
      el("span", {}, titulo),
    ]),
    el("h1", { class: "page-title" }, titulo)
  );

  // Lista de filas (etiqueta a la izquierda, valor a la derecha). Los campos vacios no se muestran.
  const lista = el("div", { class: "detail-list" });
  cfg.campos.forEach((f) => {
    const value = row[f.key];
    if (value === null || value === undefined || value === "") return;
    const display = typeof value === "number" ? fmt(value, 2) : String(value);
    lista.append(el("div", { class: "detail-row" }, [el("span", { class: "k" }, f.label), el("span", { class: "v" }, display)]));
  });

  container.append(el("div", { class: "card detail-list-card" }, lista));
}
