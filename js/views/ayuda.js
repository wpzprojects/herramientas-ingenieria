// Pantalla de ayuda/documentacion de la app: estatica, sin datos externos.
// Genera la lista de herramientas de cada seccion a partir de sectionMenus
// para que quede siempre sincronizada con la navegacion real.

import { icon } from "../icons.js";
import { sectionMenus, sectionMeta } from "../nav.js";
import { estadoAcceso } from "../auth/acceso.js";
import { itemHabilitado, TEXTO_BLOQUEADO } from "../auth/permisos.js";
import { NOVEDADES } from "../util/novedades.js";

const SECCIONES = ["calculos", "catalogos", "normatividad", "ia", "varios"];
const APP_VERSION = NOVEDADES[0].version; // la misma de sw.js (x.y.z; ver js/util/novedades.js)

// Descripciones largas (2-3 renglones) para la pantalla de Ayuda: explican QUE
// hace la herramienta y PARA QUE sirve, a diferencia de item.desc (una linea
// corta usada en las tarjetas de menu). Clave = hash del item en sectionMenus.
const AYUDA_DESCRIPCIONES = {
  "#/calculos/ocupacion-ductos":
    "Calcula el porcentaje de ocupación de un ducto según la NTC-2050 a partir del diámetro interno de la tubería y los conductores que lleva (uno o varios tipos). Compara el resultado contra los límites de la norma (53/31/40 %), evalúa el atascamiento (jamming) y entrega el radio de curvatura mínimo (12D) del tramo.",
  "#/calculos/perdidas":
    "Calcula la corriente, la potencia y el porcentaje de pérdidas de una línea trifásica a partir de un dato de partida (MW, MVA o A), el conductor y la longitud, en uno o varios tramos en serie. Clasifica el resultado como Óptimo, Aceptable o Elevado, útil para comparar calibres o detectar tramos críticos.",
  "#/calculos/regulacion":
    "Calcula la caída de tensión y la reactancia inductiva de una línea, tramo por tramo, incluyendo la separación del haz de subconductores por fase y las distancias entre fases. Clasifica el resultado para verificar si la regulación queda dentro de un rango de diseño razonable.",
  "#/calculos/cortocircuito":
    "Calcula la capacidad de corriente de cortocircuito admisible de un conductor según su calibre, material y tiempo de despeje de la falla. Si se indica la corriente de falla a soportar, agrega el veredicto Cumple/No cumple y sugiere el calibre más económico que sí la soporta.",
  "#/calculos/ampacidad-aerea":
    "Calcula la corriente máxima admisible de un conductor aéreo según IEEE Std 738, a partir de las condiciones ambientales (temperatura, viento, elevación) y la radiación solar. Muestra el balance térmico completo para entender qué factor limita la capacidad.",
  "#/calculos/ampacidad-subterranea":
    "Calcula la corriente máxima admisible de un cable enterrado (solo o en banco de ductos) según IEC 60287-1-1, con la resistividad del suelo, la temperatura del terreno y el número de circuitos. En cables monopolares también calcula la corriente circulante o la tensión inducida en la pantalla.",
  "#/calculos/conductor-economico":
    "Compara entre 2 y 5 opciones de conductor para una línea nueva por costo total actualizado (inversión más el valor presente de las pérdidas a varios años), con precios que escribe el propio usuario. Ayuda a decidir el calibre más económico a largo plazo, no solo el más barato de instalar.",
  "#/calculos/valoracion-integral":
    "Evalúa de 1 a 6 escenarios de conductor para una misma conexión (misma potencia y longitud), cada uno con su tensión, conductor aéreo o subterráneo y conductores por fase. Calcula a la vez ampacidad, pérdidas, regulación, cortocircuito y, si se indican precios, el costo total actualizado, y dice cuáles cumplen y cuál conviene.",
  "#/catalogos/desnudos":
    "Ficha técnica de conductores ACSR, AAAC, ACAR, AAC y ACSS (diámetro, resistencia, capacidad, etc.), con filtro por tipo y buscador por calibre. Es la fuente de datos que usan Pérdidas, Regulación, Cortocircuito y Ampacidad aérea.",
  "#/catalogos/semiaislados":
    "Ficha técnica de conductores semiaislados bicapa y tricapa AAAC-ACSR, usados en redes compactas. Mismo filtro y buscador por calibre que los demás catálogos de conductores.",
  "#/catalogos/xlpe":
    "Ficha técnica de cables aislados de media tensión (XLPE), con nivel de tensión, aislamiento, material y pantalla. Es la fuente de datos de Ampacidad subterránea y de la tarjeta de conductores en Ocupación de ductos.",
  "#/catalogos/tuberias":
    "Ficha técnica de tuberías PVC y metálicas (EMT, IMC, RIGID) con diámetro nominal e interno. Es la fuente de datos de la calculadora de Ocupación de ductos.",
  "#/normatividad/distancias-seguridad":
    "Tablas RETIE 3.10.x con las distancias mínimas de seguridad según el nivel de tensión y el tipo de instalación. Sirve para verificar despejes ante estructuras, vías, cruces y otros elementos cercanos a una línea.",
  "#/normatividad/zona-servidumbre":
    "Ancho de la zona de servidumbre exigido para una línea según su nivel de tensión (RETIE 3.19.1.a). Útil para trámites de diseño y para estimar el área que debe quedar libre bajo la línea.",
  "#/normatividad/enterramiento-ductos":
    "Profundidades mínimas de enterramiento de ductos según RETIE y NTC 2050, según el tipo de vía o superficie. Referencia rápida para el diseño de redes subterráneas.",
  "#/normatividad/corriente-ntc":
    "Tablas 310-77 a 310-80 de la NTC 2050 con la corriente admisible de conductores según su calibre, aislamiento y condiciones de instalación. Complementa a Ampacidad cuando se necesita el valor tabulado de la norma en vez del cálculo detallado.",
  "#/normatividad/resoluciones":
    "Normativa CREG relevante para el sector eléctrico, con resumen y alcance de cada resolución. Ayuda a ubicar rápido qué resolución aplica a un tema sin tener que leerla completa.",
  "#/ia/analisis":
    "Conversación con IA (Gemini) que ejecuta las calculadoras de la app para comparar escenarios (distintos calibres, longitudes o condiciones) y genera un reporte con hallazgos y recomendaciones. La IA nunca calcula por su cuenta: todos los números salen de las mismas calculadoras del menú Cálculos.",
  "#/ia/redaccion":
    "Asistente de IA para redactar o corregir correos, descripciones técnicas, actas y resúmenes, con agentes configurables (instrucciones propias por tipo de texto). Incluye ajustes rápidos como «Más corto», «Más formal» o «Explica los cambios».",
  "#/ia/configuracion":
    "Clave de API de Gemini (propia o compartida por el administrador), modelo a usar y ajustes avanzados (temperatura, rondas y cálculos máximos por pregunta). También explica qué datos se guardan en este navegador y cuáles se envían a Google.",
  "#/varios/codificacion":
    "Catálogo de códigos usados para nombrar documentos y planos de un proyecto. Sirve como referencia para codificar entregables de forma consistente.",
  "#/varios/conversion-coordenadas":
    "Convierte coordenadas entre distintos sistemas de referencia (Magna-Sirgas, Bogotá 1975, UTM, WGS84, cuadrículas urbanas, entre otros), con el conversor original de 7 sistemas o, si se habilita, entre cualquier par de cerca de 500 códigos EPSG. Acepta un punto a la vez o varios pegados de Excel.",
  "#/varios/conversion-unidades":
    "Convierte entre unidades de longitud, área, fuerza, velocidad y más categorías (con la opción «Habilitar todas las conversiones» para un catálogo más amplio, incluido calibre AWG/kcmil). Útil para pasar rápido un valor de una unidad a otra sin buscar el factor de conversión.",
};

export function render(container) {
  const nivel = estadoAcceso().nivel;
  container.innerHTML = `
    <div class="breadcrumb"><a href="#/">Inicio</a> <span>/</span> <span>Ayuda</span></div>
    <h1 class="page-title">Ayuda</h1>

    ${SECCIONES.map((key) => {
      const meta = sectionMeta[key];
      const items = sectionMenus[key];
      return `
        <div class="card">
          <h2 class="section-title" style="margin-top:0">${meta.title}</h2>
          <p class="text-muted ayuda-intro">${meta.subtitle}</p>
          <ul class="ayuda-lista">
            ${items
              .map(
                (item) => `
              <li>
                ${
                  itemHabilitado(item, nivel)
                    ? `<a href="${item.hash}"><strong>${item.title}</strong></a>`
                    : `<span class="enlace-bloqueado" title="${TEXTO_BLOQUEADO}"><span class="candado-mini">${icon("lock")}</span><strong>${item.title}</strong></span>`
                }
                <p class="ayuda-desc">${AYUDA_DESCRIPCIONES[item.hash] || item.desc}</p>
              </li>`
              )
              .join("")}
          </ul>
        </div>`;
    }).join("")}

    <div class="card dev-card">
      <div class="dev-header">
        <span class="dev-avatar">WP</span>
        <div>
          <p class="dev-name">Wilsson Uriel Perez Valero</p>
          <p class="dev-role">Herramientas de Ingeniería</p>
        </div>
      </div>
      <div class="dev-contact">
        <a href="mailto:wperez.net@hotmail.com">wperez.net@hotmail.com</a>
        <a href="tel:+573104762477">+57 310 476 2477</a>
      </div>
      <p class="dev-footer">Colombia · 2026 · v${APP_VERSION}</p>
    </div>
  `;
}
