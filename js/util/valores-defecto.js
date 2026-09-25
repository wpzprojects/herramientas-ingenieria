// Valores por defecto personales de las calculadoras (Perfil > Calculadoras). Se guardan en este navegador.
// Un campo vacío = la calculadora conserva su propio valor inicial. Cada calculadora llama a aplicarDefectos() justo
// después de pintar su formulario y ANTES de restaurar lo que el usuario había escrito (persistencia-calculo.js), así
// que lo escrito en la sesión siempre gana sobre el valor por defecto.
export const CLAVE_DEFECTOS = "calc.defectos";

// `en`: calculadora (nombre de la ruta #/calculos/<nombre>) → selector del campo. `inicial`: lo que traen hoy las
// calculadoras (se muestra como texto de ayuda en el campo vacío).
export const GRUPOS = [
  {
    titulo: "Sistema",
    donde: "Pérdidas, Regulación, Conductor económico, Ampacidad subterránea y Valoración integral",
    campos: [
      { clave: "tension", etiqueta: "Tensión de línea (kV)", inicial: "34.5", min: 0, step: 0.01, en: { perdidas: "#f-tension", regulacion: "#f-tension", "conductor-economico": "#f-tension", "ampacidad-subterranea": "#f-tension" }, info: "En Ampacidad subterránea solo se aplica hasta 46 kV (el máximo de esa calculadora)." },
      { clave: "fp", etiqueta: "Factor de potencia", inicial: "0.9", min: 0, max: 1, step: 0.01, en: { perdidas: "#f-fp", regulacion: "#f-fp", "conductor-economico": "#f-fp", "valoracion-integral": "#f-fp" } },
      { clave: "fc", etiqueta: "Factor de carga (Fc)", inicial: "0.4", min: 0, max: 1, step: 0.0001, en: { perdidas: "#f-fc", "conductor-economico": "#f-fc", "valoracion-integral": "#f-fc" } },
    ],
  },
  {
    titulo: "Evaluación económica",
    donde: "Conductor económico y Valoración integral",
    campos: [
      { clave: "precio", etiqueta: "Precio de la energía perdida ($/kWh)", inicial: "vacío", min: 0, step: "any", en: { "conductor-economico": "#f-precio", "valoracion-integral": "#f-precio" }, info: "Se guarda solo en este navegador; no se sube a ningún servidor." },
      { clave: "escalada", etiqueta: "Aumento anual del precio (%)", inicial: "2.5", min: 0, max: 100, step: "any", en: { "conductor-economico": "#f-escalada", "valoracion-integral": "#f-escalada" } },
      { clave: "tasa", etiqueta: "Tasa de descuento (%)", inicial: "10", min: 0, max: 100, step: "any", en: { "conductor-economico": "#f-tasa", "valoracion-integral": "#f-tasa" } },
      { clave: "anios", etiqueta: "Años de análisis", inicial: "25", min: 1, max: 60, step: 1, en: { "conductor-economico": "#f-anios", "valoracion-integral": "#f-anios" } },
    ],
  },
  {
    titulo: "Ambiente de las líneas aéreas",
    donde: "Ampacidad aérea y Valoración integral",
    campos: [
      { clave: "ta", etiqueta: "Temperatura ambiente (°C)", inicial: "25", min: -50, max: 60, step: 0.1, en: { "ampacidad-aerea": "#f-ta", "valoracion-integral": "#f-ta" } },
      { clave: "vw", etiqueta: "Velocidad del viento (m/s)", inicial: "0.61", min: 0, max: 100, step: 0.01, en: { "ampacidad-aerea": "#f-vw", "valoracion-integral": "#f-vw" } },
      { clave: "elevacion", etiqueta: "Elevación sobre el nivel del mar (m)", inicial: "0", min: 0, max: 10000, step: 1, en: { "ampacidad-aerea": "#f-elevacion", "valoracion-integral": "#f-elevacion" } },
    ],
  },
  {
    titulo: "Terreno",
    donde: "Ampacidad subterránea y Valoración integral",
    campos: [
      { clave: "tempterreno", etiqueta: "Temperatura del terreno (°C)", inicial: "25", min: -50, max: 100, step: 0.1, en: { "ampacidad-subterranea": "#f-tempterreno", "valoracion-integral": "#f-tempterreno" } },
      { clave: "rhosuelo", etiqueta: "Resistividad térmica del suelo (K·m/W)", inicial: "1", min: 0, max: 1000, step: 0.01, en: { "ampacidad-subterranea": "#f-rhosuelo", "valoracion-integral": "#f-rhosuelo" } },
      { clave: "profundidad", etiqueta: "Profundidad de enterramiento (m)", inicial: "1", min: 0, max: 10, step: 0.01, en: { "ampacidad-subterranea": "#f-profundidad", "valoracion-integral": "#f-profundidad" } },
    ],
  },
  {
    titulo: "Falla",
    donde: "Cortocircuito, conductor de continuidad de tierra (Ampacidad subterránea) y Valoración integral",
    campos: [{ clave: "tiempo", etiqueta: "Tiempo de despeje de la falla (s)", inicial: "0.3", min: 0, max: 60, step: 0.1, en: { cortocircuito: "#f-tiempo", "ampacidad-subterranea": "#f-gcc-tiempo" } }],
  },
];

export const CAMPOS = GRUPOS.flatMap((g) => g.campos);

/** { clave: número } solo con los campos definidos y válidos. */
export function leerDefectos() {
  let crudo = {};
  try {
    crudo = JSON.parse(localStorage.getItem(CLAVE_DEFECTOS) || "{}") || {};
  } catch {
    crudo = {};
  }
  const out = {};
  for (const c of CAMPOS) {
    const v = crudo[c.clave];
    if (typeof v === "number" && Number.isFinite(v)) out[c.clave] = v;
  }
  return out;
}

/** Guarda los valores (los vacíos/no numéricos se quitan). Devuelve lo guardado. */
export function guardarDefectos(valores) {
  const limpio = {};
  for (const c of CAMPOS) {
    const v = valores?.[c.clave];
    if (typeof v === "number" && Number.isFinite(v)) limpio[c.clave] = v;
  }
  try {
    if (Object.keys(limpio).length) localStorage.setItem(CLAVE_DEFECTOS, JSON.stringify(limpio));
    else localStorage.removeItem(CLAVE_DEFECTOS);
  } catch {
    /* sin storage: no se guarda */
  }
  return limpio;
}

/** Pone los valores por defecto personales en el formulario de una calculadora. Si un valor no es válido para el campo
 *  de esa calculadora (fuera de rango, p. ej. 115 kV en Ampacidad subterránea, que llega a 46, o con más decimales de los
 *  que admite su `step`), se deja el valor propio: así «Calcular» nunca se bloquea por un valor por defecto. */
export function aplicarDefectos(contenedor, calculadora) {
  const valores = leerDefectos();
  for (const c of CAMPOS) {
    const selector = c.en[calculadora];
    if (!selector || !(c.clave in valores)) continue;
    const campo = contenedor.querySelector(selector);
    if (!campo) continue;
    const previo = campo.value;
    campo.value = String(valores[c.clave]);
    if (!campo.validity.valid) campo.value = previo;
  }
}
