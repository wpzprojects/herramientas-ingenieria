// Configuracion de navegacion: equivalente a Nav_menu_lateral / Nav_menu_superior
// y a los botones de las 4 pantallas de menu principal del original en Power Apps.

export const sidebarLinks = [
  { key: "calculos", title: "Cálculos", icon: "calculator", hash: "#/calculos" },
  { key: "catalogos", title: "Catálogos", icon: "book", hash: "#/catalogos" },
  { key: "normatividad", title: "Normatividad", icon: "shield", hash: "#/normatividad" },
  { key: "varios", title: "Varios", icon: "grid", hash: "#/varios" },
  { key: "ayuda", title: "Ayuda", icon: "help", hash: "#/ayuda" },
];

export const sectionMeta = {
  calculos: { title: "Cálculos", subtitle: "Calculadoras de ingeniería para líneas y redes de distribución." },
  catalogos: { title: "Catálogos", subtitle: "Consulta técnica de conductores por familia, con filtros y ficha de detalle." },
  normatividad: { title: "Normatividad", subtitle: "Referencia normativa RETIE / NTC 2050 y resoluciones del sector eléctrico." },
  varios: { title: "Varios", subtitle: "Herramientas de apoyo: conversión de unidades, coordenadas y codificación." },
};

export const sectionMenus = {
  calculos: [
    { title: "Ocupación de ductos", desc: "Porcentaje de ocupación de ductos según NTC-2050.", icon: "layers", hash: "#/calculos/ocupacion-ductos" },
    { title: "Pérdidas", desc: "Corriente, potencia y % de pérdidas de una línea trifásica.", icon: "bolt", hash: "#/calculos/perdidas" },
    { title: "Regulación", desc: "Caída de tensión y reactancia inductiva del conductor.", icon: "activity", hash: "#/calculos/regulacion" },
    { title: "Cortocircuito", desc: "Capacidad de corriente de cortocircuito admisible.", icon: "alertTriangle", hash: "#/calculos/cortocircuito" },
    { title: "Ampacidad aérea", desc: "Corriente admisible de conductores aéreos (IEEE Std 738).", icon: "powerTower", hash: "#/calculos/ampacidad-aerea" },
    { title: "Ampacidad subterránea", desc: "Corriente admisible de cables en banco de ductos (IEC 60287-1-1).", icon: "underground", hash: "#/calculos/ampacidad-subterranea" },
  ],
  catalogos: [
    { title: "Conductores desnudos", desc: "ACSR, AAAC, ACAR, AAC, ACSS — 342 referencias.", icon: "conductorBare", hash: "#/catalogos/desnudos" },
    { title: "Conductores semiaislados", desc: "Bicapa / Tricapa AAAC-ACSR — 70 referencias.", icon: "conductorSemi", hash: "#/catalogos/semiaislados" },
    { title: "Conductores XLPE (MT)", desc: "Cables aislados de media tensión — 195 referencias.", icon: "conductorXlpe", hash: "#/catalogos/xlpe" },
  ],
  normatividad: [
    { title: "Distancias de seguridad", desc: "Tablas RETIE 3.10.x de distancias mínimas de seguridad.", icon: "ruler", hash: "#/normatividad/distancias-seguridad" },
    { title: "Zona de servidumbre", desc: "Ancho de zona de servidumbre para líneas (RETIE 3.19.1.a).", icon: "map", hash: "#/normatividad/zona-servidumbre" },
    { title: "Enterramiento de ductos", desc: "Profundidad de enterramiento RETIE / NTC 2050.", icon: "layers", hash: "#/normatividad/enterramiento-ductos" },
    { title: "Corriente de conductores NTC", desc: "Tablas 310-77 a 310-80 de la NTC 2050.", icon: "fileText", hash: "#/normatividad/corriente-ntc" },
    { title: "Resoluciones del sector", desc: "Normativa CREG relevante, con resumen y alcance.", icon: "archive", hash: "#/normatividad/resoluciones" },
  ],
  varios: [
    { title: "Codificación de entregables", desc: "Catálogo consultable de códigos de documentos y planos.", icon: "hash", hash: "#/varios/codificacion" },
    { title: "Conversión de coordenadas", desc: "WGS84 / MAGNA-SIRGAS ↔ UTM (proyección Transversa de Mercator).", icon: "compass", hash: "#/varios/conversion-coordenadas" },
    { title: "Conversión de unidades", desc: "Longitud, fuerza, área, presión, ángulos, temperatura y más.", icon: "ruler", hash: "#/varios/conversion-unidades" },
  ],
};
