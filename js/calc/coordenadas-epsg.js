// Conversion entre CUALQUIER par de sistemas del catalogo data/sistemas-epsg.json (unos 500 codigos EPSG: los de Colombia y los mas
// usados en el mundo) con proj4js. Sin DOM: el objeto proj4 y el catalogo se reciben como parametros (asi se puede probar).
//
// Catalogo: { "3116": [nombre, cadena proj4, [norte, oeste, sur, este] (area de uso)], ... }, sacado de la base EPSG (paquete
// abierto epsg-index). Las coordenadas van siempre en el orden X (longitud / este) y luego Y (latitud / norte).
//
// Este motor NO reemplaza a ./coordenadas.js (los 7 sistemas de la pantalla principal, validado contra el original): proj4 da el
// mismo resultado en esos 7 (diferencia < 1e-6 mm, ver tools/verify_coordenadas_epsg.html), pero aqui se agrega el resto.
//
// Cambios de datum: proj4 usa los parametros de 3 o 7 elementos (+towgs84) del propio sistema. No admite archivos de rejilla, asi que
// el catalogo no incluye los sistemas que los necesitan (NAD27, etc.).

/** Codigo EPSG a partir de lo que escribe el usuario: «3116», «EPSG:3116», « epsg : 3116 ». null si no tiene esa forma. */
export function parseCodigoEpsg(texto) {
  const m = /^\s*(?:epsg\s*:\s*)?(\d{3,6})\s*$/i.exec(String(texto ?? ""));
  return m ? String(Number(m[1])) : null;
}

const numeros = (cadena, clave) => {
  const m = new RegExp(`\\+${clave}=([^\\s]+)`).exec(cadena);
  return m ? m[1] : null;
};

/** Unidad de las coordenadas del sistema, en palabras. */
function unidadDe(p4, esGeo) {
  if (esGeo) return "grados";
  const u = numeros(p4, "units");
  if (u === "m" || (!u && !numeros(p4, "to_meter"))) return "metros";
  if (u === "ft") return "pies";
  if (u === "us-ft") return "pies US";
  if (u === "km") return "kilómetros";
  return u ? u : `otra unidad (×${Number(numeros(p4, "to_meter")).toFixed(4)} m)`;
}

/** Ficha de un codigo del catalogo, o null si no esta. */
export function infoSistema(codigo, catalogo) {
  const e = catalogo?.[codigo];
  if (!e) return null;
  const [nombre, proj4, bbox] = e;
  const esGeo = /\+proj=longlat/.test(proj4);
  return { codigo: String(codigo), nombre, proj4, esGeo, unidad: unidadDe(proj4, esGeo), bbox: bbox ?? null };
}

/**
 * Como se relaciona el datum del sistema con WGS84:
 *  - "wgs84": equivalente (WGS84, NAD83, o elipsoide GRS80/WGS84 con parametros de transformacion nulos o ausentes);
 *  - "parametros": lleva parametros +towgs84 distintos de cero (o un datum propio de proj4): exactitud del orden de metros;
 *  - "sin-parametros": otro elipsoide sin parametros de transformacion: proj4 no puede corregir el datum.
 * `clave` identifica el datum para saber si dos sistemas comparten el mismo.
 */
export function clasificarDatum(proj4) {
  const datum = numeros(proj4, "datum");
  const tw = numeros(proj4, "towgs84");
  const elipsoide = numeros(proj4, "ellps") ?? (numeros(proj4, "a") ? `a=${numeros(proj4, "a")},b=${numeros(proj4, "b") ?? numeros(proj4, "rf")}` : null);
  if (datum === "WGS84" || datum === "NAD83") return { tipo: "wgs84", clave: "wgs84" };
  if (tw) {
    const v = tw.split(",").map(Number);
    return v.every((x) => x === 0) ? { tipo: "wgs84", clave: "wgs84" } : { tipo: "parametros", clave: `tw:${tw}:${elipsoide}` };
  }
  if (datum) return { tipo: "parametros", clave: `datum:${datum}` };
  if (elipsoide === "GRS80" || elipsoide === "WGS84") return { tipo: "wgs84", clave: "wgs84" };
  return { tipo: "sin-parametros", clave: `el:${elipsoide}` };
}

/** Avisos sobre el cambio de datum entre dos sistemas (lista vacia si no hay nada que avisar). */
export function avisosDatum(origen, destino) {
  const a = clasificarDatum(origen.proj4);
  const b = clasificarDatum(destino.proj4);
  if (a.clave === b.clave) return [];
  const avisos = [];
  for (const [s, c] of [[origen, a], [destino, b]]) {
    if (c.tipo === "sin-parametros") {
      avisos.push({ tipo: "peligro", texto: `«${s.nombre}» no trae parámetros para pasar de su datum a WGS84: el resultado puede tener errores de cientos de metros.` });
    }
  }
  if (!avisos.length && (a.tipo === "parametros" || b.tipo === "parametros")) {
    avisos.push({ tipo: "datum", texto: "Esta conversión cambia de datum (por ejemplo entre Bogotá 1975 y MAGNA-SIRGAS) y se hace con parámetros de transformación: la exactitud es del orden de metros." });
  }
  return avisos;
}

/** true si el punto (grados) cae dentro del area de uso del sistema (o si el sistema no la trae). Maneja el antimeridiano. */
export function dentroDelAreaDeUso(sistema, lon, lat) {
  if (!sistema.bbox) return true;
  const [n, w, s, e] = sistema.bbox;
  if (lat > n || lat < s) return false;
  return w <= e ? lon >= w && lon <= e : lon >= w || lon <= e;
}

const definir = (proj4, s) => {
  const nombre = `EPSG:${s.codigo}`;
  if (!proj4.defs(nombre)) proj4.defs(nombre, s.proj4);
  return nombre;
};

/**
 * Convierte un punto entre dos sistemas del catalogo.
 * @param {Function} proj4 - la libreria (global proj4)
 * @param {object} catalogo - data/sistemas-epsg.json
 * @param {string} codOrigen - codigo EPSG (solo digitos)
 * @param {string} codDestino
 * @param {number} x - longitud (grados) o este (unidad del sistema)
 * @param {number} y - latitud (grados) o norte
 * @returns {{x:number, y:number, origen:object, destino:object, esGeoDestino:boolean, avisos:{tipo:string, texto:string}[]}}
 * @throws {Error} con un mensaje en español si el codigo no esta o el dato no es valido
 */
export function convertirEntreSistemas(proj4, catalogo, codOrigen, codDestino, x, y) {
  const origen = infoSistema(codOrigen, catalogo);
  const destino = infoSistema(codDestino, catalogo);
  if (!origen) throw new Error(`El código ${codOrigen} (entrada) no está entre los sistemas incluidos.`);
  if (!destino) throw new Error(`El código ${codDestino} (salida) no está entre los sistemas incluidos.`);
  if (!Number.isFinite(x) || !Number.isFinite(y)) throw new Error("Escriba las dos coordenadas del punto.");
  if (origen.esGeo && (Math.abs(y) > 90 || Math.abs(x) > 360)) throw new Error("La latitud debe estar entre −90° y 90° y la longitud entre −360° y 360°.");

  const nOrigen = definir(proj4, origen);
  const nDestino = definir(proj4, destino);
  const wgs = infoSistema("4326", catalogo) ?? { codigo: "4326", proj4: "+proj=longlat +datum=WGS84" };
  const nWgs = definir(proj4, wgs);

  let salida;
  let lonLat;
  try {
    salida = proj4(nOrigen, nDestino, [x, y]);
    lonLat = origen.esGeo ? [x, y] : proj4(nOrigen, nWgs, [x, y]);
  } catch {
    throw new Error("No se pudo convertir ese punto con estos sistemas (verifique que las coordenadas correspondan al sistema de entrada).");
  }
  if (!salida.every(Number.isFinite)) throw new Error("La conversión no da un resultado válido: el punto está fuera de lo que admite alguno de los sistemas.");

  const avisos = avisosDatum(origen, destino);
  if (lonLat.every(Number.isFinite)) {
    const [lon, lat] = lonLat;
    if (!dentroDelAreaDeUso(origen, lon, lat)) avisos.push({ tipo: "area", texto: `El punto está fuera del área de uso del sistema de entrada («${origen.nombre}»).` });
    if (!dentroDelAreaDeUso(destino, lon, lat)) avisos.push({ tipo: "area", texto: `El punto está fuera del área de uso del sistema de salida («${destino.nombre}»): el resultado puede ser poco confiable.` });
  }
  return { x: salida[0], y: salida[1], origen, destino, esGeoDestino: destino.esGeo, avisos };
}
