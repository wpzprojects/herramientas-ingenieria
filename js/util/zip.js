// Escritor de archivos ZIP minimo (sin compresion, metodo «store»), sin dependencias. Un .docx es un ZIP de archivos XML.
//
// crearZip([{ nombre: "word/document.xml", contenido: "<xml…" | Uint8Array }, …]) -> Uint8Array

const TABLA_CRC = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();

export function crc32(bytes) {
  let c = 0xffffffff;
  for (let i = 0; i < bytes.length; i++) c = TABLA_CRC[(c ^ bytes[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

/** Fecha y hora en el formato de MS-DOS que usa el ZIP. */
function fechaDos(d) {
  const hora = (d.getHours() << 11) | (d.getMinutes() << 5) | (d.getSeconds() >> 1);
  const fecha = ((Math.max(d.getFullYear(), 1980) - 1980) << 9) | ((d.getMonth() + 1) << 5) | d.getDate();
  return { hora, fecha };
}

export function crearZip(archivos, fecha = new Date()) {
  const enc = new TextEncoder();
  const { hora, fecha: dia } = fechaDos(fecha);
  const partes = [];
  const central = [];
  let desplazamiento = 0;

  for (const a of archivos) {
    const nombre = enc.encode(a.nombre);
    const datos = typeof a.contenido === "string" ? enc.encode(a.contenido) : a.contenido;
    const crc = crc32(datos);

    const local = new DataView(new ArrayBuffer(30));
    local.setUint32(0, 0x04034b50, true);
    local.setUint16(4, 20, true); // version necesaria
    local.setUint16(6, 0x0800, true); // nombres en UTF-8
    local.setUint16(8, 0, true); // sin compresion
    local.setUint16(10, hora, true);
    local.setUint16(12, dia, true);
    local.setUint32(14, crc, true);
    local.setUint32(18, datos.length, true);
    local.setUint32(22, datos.length, true);
    local.setUint16(26, nombre.length, true);
    local.setUint16(28, 0, true);
    partes.push(new Uint8Array(local.buffer), nombre, datos);

    const ent = new DataView(new ArrayBuffer(46));
    ent.setUint32(0, 0x02014b50, true);
    ent.setUint16(4, 20, true); // version con la que se creo
    ent.setUint16(6, 20, true);
    ent.setUint16(8, 0x0800, true);
    ent.setUint16(10, 0, true);
    ent.setUint16(12, hora, true);
    ent.setUint16(14, dia, true);
    ent.setUint32(16, crc, true);
    ent.setUint32(20, datos.length, true);
    ent.setUint32(24, datos.length, true);
    ent.setUint16(28, nombre.length, true);
    ent.setUint32(42, desplazamiento, true);
    central.push(new Uint8Array(ent.buffer), nombre);

    desplazamiento += 30 + nombre.length + datos.length;
  }

  const tamCentral = central.reduce((s, p) => s + p.length, 0);
  const fin = new DataView(new ArrayBuffer(22));
  fin.setUint32(0, 0x06054b50, true);
  fin.setUint16(8, archivos.length, true);
  fin.setUint16(10, archivos.length, true);
  fin.setUint32(12, tamCentral, true);
  fin.setUint32(16, desplazamiento, true);

  const todo = [...partes, ...central, new Uint8Array(fin.buffer)];
  const salida = new Uint8Array(todo.reduce((s, p) => s + p.length, 0));
  let pos = 0;
  for (const p of todo) {
    salida.set(p, pos);
    pos += p.length;
  }
  return salida;
}
