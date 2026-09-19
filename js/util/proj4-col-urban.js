// Proyeccion «Colombia Urban» (metodo EPSG 1052, PROJ: +proj=col_urban) para proj4js, que no la trae.
// Es la de las cuadriculas urbanas de las ciudades colombianas (MAGNA-SIRGAS / Bogota urban grid, Cali urban grid, etc.: EPSG 6244 a
// 6275): un plano local a la altura media de la ciudad (parametro h_0, en metros) que evita las correcciones de las observaciones
// topograficas.
//
// Formulas: IOGP Publication 373-7-2, Geomatics Guidance Note 7 parte 2 (marzo 2020), tal como las implementa PROJ
// (src/projections/col_urban.cpp). La inversa es la aproximada de la guia (de primer orden en la parte del meridiano), suficiente para
// el tamaño de una ciudad (se prueba en tools/verify_coordenadas_epsg.html: ida y vuelta, origen y factor de escala con h_0).
//
// Los angulos van en radianes y la longitud se mide desde el meridiano origen. A, B, C, D, rho0 y h0 son adimensionales (h0 y las
// coordenadas se dividen por el semieje mayor `a`).

const PI = Math.PI;
const ajustarLon = (x) => (Math.abs(x) <= PI ? x : x - Math.sign(x) * 2 * PI);

/** Agrega la proyeccion «col_urban» a proj4 (una sola vez) y devuelve proj4. */
export function registrarColUrban(proj4) {
  if (proj4.__colUrban) return proj4;
  proj4.Proj.projections.add({
    names: ["col_urban", "Colombia_Urban"],
    init() {
      const h0 = Number(this.h_0) / this.a;
      const sinPhi0 = Math.sin(this.lat0);
      const nu0 = 1 / Math.sqrt(1 - this.es * sinPhi0 * sinPhi0);
      const rho0 = (1 - this.es) / Math.pow(1 - this.es * sinPhi0 * sinPhi0, 1.5);
      this.cu = {
        h0,
        rho0,
        A: 1 + h0 / nu0,
        B: Math.tan(this.lat0) / (2 * rho0 * nu0),
        C: 1 + h0,
        D: rho0 * (1 + h0 / (1 - this.es)),
      };
    },
    forward(p) {
      const q = this.cu;
      const lam = ajustarLon(p.x - this.long0);
      const phi = p.y;
      const cosPhi = Math.cos(phi);
      const sinPhi = Math.sin(phi);
      const nu = 1 / Math.sqrt(1 - this.es * sinPhi * sinPhi);
      const lamNuCosPhi = lam * nu * cosPhi;
      const sinPhiM = Math.sin(0.5 * (phi + this.lat0));
      const rhoM = (1 - this.es) / Math.pow(1 - this.es * sinPhiM * sinPhiM, 1.5);
      const G = 1 + q.h0 / rhoM;
      p.x = this.a * (q.A * lamNuCosPhi) + this.x0;
      p.y = this.a * (G * q.rho0 * (phi - this.lat0 + q.B * lamNuCosPhi * lamNuCosPhi)) + this.y0;
      return p;
    },
    inverse(p) {
      const q = this.cu;
      const x = (p.x - this.x0) / this.a;
      const y = (p.y - this.y0) / this.a;
      const phi = this.lat0 + y / q.D - q.B * (x / q.C) * (x / q.C);
      const sinPhi = Math.sin(phi);
      const nu = 1 / Math.sqrt(1 - this.es * sinPhi * sinPhi);
      const lam = x / (q.C * nu * Math.cos(phi));
      p.x = ajustarLon(lam + this.long0);
      p.y = phi;
      return p;
    },
  });
  proj4.__colUrban = true;
  return proj4;
}
