// Error base comun a los clientes de IA (Gemini, OpenAI, Anthropic): cada uno
// lo extiende para poder distinguir el origen con "instanceof" especifico si
// hace falta, pero la UI puede atrapar solo ErrorProveedorIA para cualquiera.

export class ErrorProveedorIA extends Error {
  /**
   * @param {string} mensaje
   * @param {object} o
   * @param {"offline"|"red"|"clave"|"cuota"|"modelo"|"bloqueo"|"servidor"|"solicitud"|"vacio"} [o.tipo]
   * @param {number} [o.status]
   * @param {string} [o.proveedor]
   */
  constructor(mensaje, { tipo = "solicitud", status = 0, proveedor = "" } = {}) {
    super(mensaje);
    this.name = "ErrorProveedorIA";
    this.tipo = tipo;
    this.status = status;
    this.proveedor = proveedor;
  }
}
