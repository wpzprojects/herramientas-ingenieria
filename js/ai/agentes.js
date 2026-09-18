// Agentes de redaccion: cada uno es un "prompt de sistema" con nombre, tono y
// ejemplos opcionales. Vienen 4 precargados y el usuario puede crear, editar,
// borrar, exportar e importar los suyos (se guardan en el navegador).

const K_AGENTES = "ia.agentes";

export const TONOS = ["Formal", "Profesional cordial", "Neutro y técnico", "Cercano"];

const BASE_REDACCION =
  "Escribes en español de Colombia con registro profesional. Corriges ortografía, gramática, puntuación y redacción. " +
  "Conservas el sentido, los datos, cifras, nombres, fechas y referencias normativas del texto original: nunca inventes " +
  "información ni cambies valores numéricos. Si algo es ambiguo o falta un dato, deja el texto como está y señálalo al final " +
  "en una línea que empiece por 'Nota:'.";

export const AGENTES_POR_DEFECTO = [
  {
    id: "correos",
    nombre: "Correos",
    descripcion: "Mejora redacción, tono y claridad de correos corporativos.",
    tono: "Profesional cordial",
    temperatura: 0.4,
    explicarCambios: false,
    ejemplos: [],
    instrucciones:
      "Eres un asistente que corrige y mejora correos electrónicos corporativos. Mantén el saludo y la despedida apropiados, " +
      "una idea principal por párrafo, frases claras y directas, y un cierre con la acción o solicitud concreta. " +
      "Si el correo no tiene asunto, sugiere uno en una primera línea 'Asunto: …'. Devuelve únicamente el correo corregido, sin comentarios previos.",
  },
  {
    id: "descripciones-tecnicas",
    nombre: "Descripciones técnicas",
    descripcion: "Descripciones de proyecto, alcances, memorias y especificaciones.",
    tono: "Neutro y técnico",
    temperatura: 0.3,
    explicarCambios: false,
    ejemplos: [],
    instrucciones:
      "Eres un redactor técnico de ingeniería eléctrica (líneas y redes de distribución). Reescribes descripciones técnicas, alcances, " +
      "memorias de cálculo y especificaciones con precisión terminológica, voz impersonal o en tercera persona, oraciones concisas y " +
      "unidades del SI con su símbolo correcto. Mantén exactamente las cifras, referencias a normas (RETIE, NTC 2050, IEEE, IEC, CREG) " +
      "y nomenclatura del texto original. No agregues requisitos ni datos que no estén en el texto.",
  },
  {
    id: "informes-actas",
    nombre: "Informes y actas",
    descripcion: "Informes de avance, actas de reunión y conclusiones.",
    tono: "Formal",
    temperatura: 0.3,
    explicarCambios: false,
    ejemplos: [],
    instrucciones:
      "Eres un asistente para redactar informes de avance y actas de reunión. Ordena el contenido con títulos claros " +
      "(por ejemplo: Objetivo, Desarrollo, Conclusiones, Compromisos), usa listas para acuerdos y compromisos indicando responsable " +
      "y fecha cuando aparezcan en el texto, y conserva el orden cronológico. Si faltan responsables o fechas, no los inventes: " +
      "escribe 'por definir'. Devuelve solo el documento resultante.",
  },
  {
    id: "resumenes",
    nombre: "Resúmenes",
    descripcion: "Resume textos o documentos largos en puntos clave.",
    tono: "Neutro y técnico",
    temperatura: 0.3,
    explicarCambios: false,
    ejemplos: [],
    instrucciones:
      "Eres un asistente que resume textos. Entrega primero un resumen ejecutivo de 2 a 3 frases y luego los puntos clave en viñetas " +
      "cortas. Conserva cifras, fechas, nombres y decisiones tal como aparecen. No agregues opiniones ni información externa. " +
      "Si el texto contiene compromisos o acciones pendientes, agrégalos en una sección 'Pendientes'.",
  },
].map((a) => ({ ...a, predefinido: true }));

function leerGuardados() {
  try {
    const bruto = window.localStorage.getItem(K_AGENTES);
    if (!bruto) return null;
    const lista = JSON.parse(bruto);
    return Array.isArray(lista) ? lista : null;
  } catch {
    return null;
  }
}

function escribirGuardados(lista) {
  try {
    window.localStorage.setItem(K_AGENTES, JSON.stringify(lista));
    return true;
  } catch {
    return false;
  }
}

export function cargarAgentes() {
  return leerGuardados() ?? structuredClone(AGENTES_POR_DEFECTO);
}

export function guardarAgentes(lista) {
  return escribirGuardados(lista);
}

export function restaurarPredeterminados() {
  try {
    window.localStorage.removeItem(K_AGENTES);
  } catch {
    /* sin storage */
  }
}

export function nuevoAgenteVacio() {
  return {
    id: `agente-${Date.now().toString(36)}`,
    nombre: "Nuevo agente",
    descripcion: "",
    tono: "Profesional cordial",
    temperatura: 0.4,
    explicarCambios: false,
    ejemplos: [],
    instrucciones: "",
    predefinido: false,
  };
}

/** Prompt de sistema completo de un agente (base + tono + instrucciones + ejemplos). */
export function construirSistema(agente) {
  const partes = [BASE_REDACCION];
  if (agente.tono) partes.push(`Tono requerido: ${agente.tono}.`);
  if (agente.instrucciones?.trim()) partes.push(agente.instrucciones.trim());
  partes.push(
    agente.explicarCambios
      ? "Después del texto corregido, agrega una sección 'Cambios realizados:' con una lista breve de las modificaciones principales."
      : "Responde solo con el texto resultante, sin introducciones, sin explicaciones y sin formato Markdown (sin negritas ni encabezados con #)."
  );
  const ejemplos = (agente.ejemplos || []).filter((e) => e?.antes?.trim() && e?.despues?.trim());
  if (ejemplos.length) {
    partes.push(
      "Ejemplos del resultado esperado:\n" +
        ejemplos.map((e, i) => `--- Ejemplo ${i + 1} ---\nAntes:\n${e.antes.trim()}\nDespués:\n${e.despues.trim()}`).join("\n")
    );
  }
  return partes.join("\n\n");
}

export function exportarAgentesJson(lista) {
  return JSON.stringify({ tipo: "agentes-redaccion", version: 1, agentes: lista }, null, 2);
}

/** Valida y normaliza un JSON exportado. Lanza Error con mensaje legible si es invalido. */
export function importarAgentesJson(texto) {
  let datos;
  try {
    datos = JSON.parse(texto);
  } catch {
    throw new Error("El archivo no es un JSON válido.");
  }
  const lista = Array.isArray(datos) ? datos : datos?.agentes;
  if (!Array.isArray(lista) || !lista.length) throw new Error("El archivo no contiene agentes.");
  return lista.map((a, i) => ({
    id: String(a.id || `importado-${Date.now().toString(36)}-${i}`),
    nombre: String(a.nombre || `Agente ${i + 1}`).slice(0, 80),
    descripcion: String(a.descripcion || "").slice(0, 300),
    tono: TONOS.includes(a.tono) ? a.tono : "Profesional cordial",
    temperatura: Number.isFinite(+a.temperatura) ? Math.min(Math.max(+a.temperatura, 0), 1.5) : 0.4,
    explicarCambios: !!a.explicarCambios,
    ejemplos: Array.isArray(a.ejemplos)
      ? a.ejemplos.slice(0, 5).map((e) => ({ antes: String(e?.antes || ""), despues: String(e?.despues || "") }))
      : [],
    instrucciones: String(a.instrucciones || "").slice(0, 8000),
    predefinido: false,
  }));
}
