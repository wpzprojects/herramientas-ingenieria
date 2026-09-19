"""Genera data/unidades.json (catalogo completo de unidades, fuente de verdad) y RECALCULA los factores de data/factores-conversion.json
(los 71 pares de siempre, que usan el modo normal de la pantalla y la herramienta de la IA) con factores exactos.

Uso (desde la raiz del proyecto):   python tools/generar_unidades.py

Cada unidad se define con su factor a la unidad base de su categoria (y un desfase para las temperaturas). Un par origen -> destino queda
    valor_destino = valor * (f_origen / f_destino) + (o_origen - o_destino) / f_destino
Los pares (categoria, origen, destino) de factores-conversion.json NO cambian: solo se recalculan factor y offset (12 cifras significativas).
"""
import json
import math
import io
import os

RAIZ = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
PI = math.pi

# (codigo, simbolo, nombre, factor a la base, desfase a la base)
CATEGORIAS = [
    ("Area", "Área", "m2", [
        ("m2", "m²", "metro cuadrado", 1, 0),
        ("mm2", "mm²", "milímetro cuadrado", 1e-6, 0),
        ("cm2", "cm²", "centímetro cuadrado", 1e-4, 0),
        ("km2", "km²", "kilómetro cuadrado", 1e6, 0),
        ("in2", "in²", "pulgada cuadrada", 0.0254**2, 0),
        ("ft2", "ft²", "pie cuadrado", 0.3048**2, 0),
        ("yd2", "yd²", "yarda cuadrada", 0.9144**2, 0),
        ("Ha", "ha", "hectárea", 1e4, 0),
        ("acre", "acre", "acre", 4046.8564224, 0),
        ("kcmil", "kcmil", "mil circular mils", PI / 4 * (0.0254e-3) ** 2 * 1000, 0),
        ("cmil", "cmil", "circular mil", PI / 4 * (0.0254e-3) ** 2, 0),
    ]),
    ("Esfuerzo", "Esfuerzo", "Pa", [
        ("Pa", "Pa", "pascal", 1, 0),
        ("kPa", "kPa", "kilopascal", 1e3, 0),
        ("MPa", "MPa", "megapascal", 1e6, 0),
        ("GPa", "GPa", "gigapascal", 1e9, 0),
        ("N/mm2", "N/mm²", "newton por milímetro cuadrado", 1e6, 0),
        ("kg/mm2", "kgf/mm²", "kilogramo-fuerza por milímetro cuadrado", 9.80665e6, 0),
        ("kgf/cm2", "kgf/cm²", "kilogramo-fuerza por centímetro cuadrado", 98066.5, 0),
        ("psi", "psi", "libra-fuerza por pulgada cuadrada", 4.4482216152605 / 0.0254**2, 0),
        ("ksi", "ksi", "kilolibra-fuerza por pulgada cuadrada", 4.4482216152605 / 0.0254**2 * 1000, 0),
    ]),
    ("Fuerza", "Fuerza", "N", [
        ("N", "N", "newton", 1, 0),
        ("daN", "daN", "decanewton", 10, 0),
        ("kN", "kN", "kilonewton", 1e3, 0),
        ("MN", "MN", "meganewton", 1e6, 0),
        ("kgf", "kgf", "kilogramo-fuerza", 9.80665, 0),
        ("tf", "tf", "tonelada-fuerza", 9806.65, 0),
        ("lbf", "lbf", "libra-fuerza", 4.4482216152605, 0),
        ("kip", "kip", "kilolibra-fuerza", 4448.2216152605, 0),
    ]),
    ("Longitud", "Longitud", "m", [
        ("m", "m", "metro", 1, 0),
        ("mm", "mm", "milímetro", 1e-3, 0),
        ("km", "km", "kilómetro", 1e3, 0),
        ("um", "µm", "micrómetro", 1e-6, 0),
        ("cm", "cm", "centímetro", 1e-2, 0),
        ("in", "in", "pulgada", 0.0254, 0),
        ("mil", "mil", "milésima de pulgada", 2.54e-5, 0),
        ("ft", "ft", "pie", 0.3048, 0),
        ("yd", "yd", "yarda", 0.9144, 0),
        ("mi", "mi", "milla", 1609.344, 0),
        ("nmi", "nmi", "milla náutica", 1852, 0),
    ]),
    ("Momento", "Momento", "N.m", [
        ("N.m", "N·m", "newton metro", 1, 0),
        ("N.mm", "N·mm", "newton milímetro", 1e-3, 0),
        ("daN.m", "daN·m", "decanewton metro", 10, 0),
        ("kN.m", "kN·m", "kilonewton metro", 1e3, 0),
        ("kgf.m", "kgf·m", "kilogramo-fuerza metro", 9.80665, 0),
        ("kgf.cm", "kgf·cm", "kilogramo-fuerza centímetro", 0.0980665, 0),
        ("lbf.ft", "lbf·ft", "libra-fuerza pie", 4.4482216152605 * 0.3048, 0),
        ("lbf.in", "lbf·in", "libra-fuerza pulgada", 4.4482216152605 * 0.0254, 0),
        ("kip.ft", "kip·ft", "kilolibra-fuerza pie", 4448.2216152605 * 0.3048, 0),
    ]),
    ("Presion", "Presión", "Pa", [
        ("Pa", "Pa", "pascal", 1, 0),
        ("kPa", "kPa", "kilopascal", 1e3, 0),
        ("MPa", "MPa", "megapascal", 1e6, 0),
        ("bar", "bar", "bar", 1e5, 0),
        ("atm", "atm", "atmósfera", 101325, 0),
        ("mmHg", "mmHg", "milímetro de mercurio", 101325 / 760, 0),
        ("kg/m2", "kgf/m²", "kilogramo-fuerza por metro cuadrado", 9.80665, 0),
        ("kgf/cm2", "kgf/cm²", "kilogramo-fuerza por centímetro cuadrado", 98066.5, 0),
        ("daN/m2", "daN/m²", "decanewton por metro cuadrado", 10, 0),
        ("lb/ft2", "lbf/ft²", "libra-fuerza por pie cuadrado", 4.4482216152605 / 0.3048**2, 0),
        ("psi", "psi", "libra-fuerza por pulgada cuadrada", 4.4482216152605 / 0.0254**2, 0),
    ]),
    ("Temperatura", "Temperatura", "K", [
        ("K", "K", "kelvin", 1, 0),
        ("C", "°C", "grado Celsius", 1, 273.15),
        ("F", "°F", "grado Fahrenheit", 5 / 9, 273.15 - 32 * 5 / 9),
        ("R", "°R", "grado Rankine", 5 / 9, 0),
    ]),
    ("Velocidad", "Velocidad", "m/s", [
        ("m/s", "m/s", "metro por segundo", 1, 0),
        ("cm/s", "cm/s", "centímetro por segundo", 0.01, 0),
        ("km/h", "km/h", "kilómetro por hora", 1 / 3.6, 0),
        ("mph", "mph", "milla por hora", 0.44704, 0),
        ("ft/s", "ft/s", "pie por segundo", 0.3048, 0),
        ("kn", "kn", "nudo", 1852 / 3600, 0),
    ]),
    ("Angulos", "Ángulos", "rad", [
        ("rad", "rad", "radián", 1, 0),
        ("deg", "°", "grado sexagesimal", PI / 180, 0),
        ("gon", "gon", "gradián", PI / 200, 0),
        ("arcmin", "′", "minuto de arco", PI / 10800, 0),
        ("arcsec", "″", "segundo de arco", PI / 648000, 0),
        ("rev", "rev", "revolución", 2 * PI, 0),
    ]),
    # ---- categorias nuevas (solo con «Habilitar todas las conversiones») ----
    ("Potencia", "Potencia", "W", [
        ("W", "W", "vatio", 1, 0),
        ("kW", "kW", "kilovatio", 1e3, 0),
        ("MW", "MW", "megavatio", 1e6, 0),
        ("hp", "hp", "caballo de fuerza (mecánico)", 745.69987158227, 0),
        ("CV", "CV", "caballo de vapor (métrico)", 735.49875, 0),
        ("BTU/h", "BTU/h", "BTU por hora", 0.29307107017222, 0),
    ]),
    ("Energia", "Energía", "J", [
        ("J", "J", "julio", 1, 0),
        ("kJ", "kJ", "kilojulio", 1e3, 0),
        ("MJ", "MJ", "megajulio", 1e6, 0),
        ("Wh", "Wh", "vatio-hora", 3600, 0),
        ("kWh", "kWh", "kilovatio-hora", 3.6e6, 0),
        ("MWh", "MWh", "megavatio-hora", 3.6e9, 0),
        ("kcal", "kcal", "kilocaloría", 4184, 0),
        ("BTU", "BTU", "BTU (tabla internacional)", 1055.05585262, 0),
    ]),
    ("Masa", "Masa", "kg", [
        ("kg", "kg", "kilogramo", 1, 0),
        ("g", "g", "gramo", 1e-3, 0),
        ("t", "t", "tonelada métrica", 1e3, 0),
        ("lb", "lb", "libra", 0.45359237, 0),
        ("oz", "oz", "onza", 0.028349523125, 0),
    ]),
    ("PesoLineal", "Peso por longitud", "kg/m", [
        ("kg/m", "kg/m", "kilogramo por metro", 1, 0),
        ("kg/km", "kg/km", "kilogramo por kilómetro", 1e-3, 0),
        ("lb/ft", "lb/ft", "libra por pie", 0.45359237 / 0.3048, 0),
        ("lb/kft", "lb/kft", "libra por mil pies", 0.45359237 / 304.8, 0),
        ("lb/mi", "lb/mi", "libra por milla", 0.45359237 / 1609.344, 0),
    ]),
    ("ResistenciaLineal", "Resistencia por longitud", "ohm/m", [
        ("ohm/m", "Ω/m", "ohmio por metro", 1, 0),
        ("ohm/km", "Ω/km", "ohmio por kilómetro", 1e-3, 0),
        ("ohm/ft", "Ω/ft", "ohmio por pie", 1 / 0.3048, 0),
        ("ohm/kft", "Ω/kft", "ohmio por mil pies", 1 / 304.8, 0),
        ("ohm/mi", "Ω/mi", "ohmio por milla", 1 / 1609.344, 0),
    ]),
    ("ResistividadTermica", "Resistividad térmica", "K.m/W", [
        ("K.m/W", "K·m/W", "kelvin metro por vatio", 1, 0),
        ("C.cm/W", "°C·cm/W", "grado Celsius centímetro por vatio", 0.01, 0),
        ("C.in/W", "°C·in/W", "grado Celsius pulgada por vatio", 0.0254, 0),
        ("F.ft.h/BTU", "°F·ft·h/BTU", "grado Fahrenheit pie hora por BTU", (5 / 9 * 0.3048) / 0.29307107017222, 0),
    ]),
    ("Volumen", "Volumen", "m3", [
        ("m3", "m³", "metro cúbico", 1, 0),
        ("L", "L", "litro", 1e-3, 0),
        ("mL", "mL", "mililitro", 1e-6, 0),
        ("in3", "in³", "pulgada cúbica", 0.0254**3, 0),
        ("ft3", "ft³", "pie cúbico", 0.3048**3, 0),
        ("yd3", "yd³", "yarda cúbica", 0.9144**3, 0),
        ("gal", "gal", "galón (EE. UU.)", 3.785411784e-3, 0),
    ]),
    ("Tiempo", "Tiempo", "s", [
        ("ms", "ms", "milisegundo", 1e-3, 0),
        ("s", "s", "segundo", 1, 0),
        ("min", "min", "minuto", 60, 0),
        ("h", "h", "hora", 3600, 0),
        ("dia", "día", "día", 86400, 0),
        ("ciclo60", "ciclos (60 Hz)", "ciclos de una red de 60 Hz", 1 / 60, 0),
    ]),
    ("Densidad", "Densidad", "kg/m3", [
        ("kg/m3", "kg/m³", "kilogramo por metro cúbico", 1, 0),
        ("g/cm3", "g/cm³", "gramo por centímetro cúbico", 1000, 0),
        ("lb/ft3", "lb/ft³", "libra por pie cúbico", 0.45359237 / 0.3048**3, 0),
    ]),
]

# categorias que solo existen en el modo completo
NUEVAS = ["Potencia", "Energia", "Masa", "PesoLineal", "ResistenciaLineal", "ResistividadTermica", "Volumen", "Tiempo", "Densidad"]
# orden en las listas (Angulos al final, por pedido del usuario)
ORDEN_BASICO = ["Area", "Esfuerzo", "Fuerza", "Longitud", "Momento", "Presion", "Temperatura", "Velocidad", "Angulos"]
ORDEN_COMPLETO = ["Area", "Calibre", "Densidad", "Energia", "Esfuerzo", "Fuerza", "Longitud", "Masa", "Momento", "PesoLineal", "Potencia",
                  "Presion", "ResistenciaLineal", "ResistividadTermica", "Temperatura", "Tiempo", "Velocidad", "Volumen", "Angulos"]


def cifras(x, n=12):
    """x redondeado a n cifras significativas (para que 32.00000000000001 quede en 32)."""
    if x == 0:
        return 0
    v = float(f"{x:.{n - 1}e}")
    return int(v) if v == int(v) and abs(v) < 1e15 else v


def principal():
    ruta_pares = os.path.join(RAIZ, "data", "factores-conversion.json")
    pares = json.load(open(ruta_pares, encoding="utf-8"))
    usadas = {}
    for r in pares:
        usadas.setdefault(r["categoria"], set()).update([r["unidad_origen"], r["unidad_destino"]])

    catalogo = {"orden_basico": ORDEN_BASICO, "orden_completo": ORDEN_COMPLETO, "categorias": []}
    tabla = {}
    for clave, nombre, base, unidades in CATEGORIAS:
        codigos = [u[0] for u in unidades]
        assert len(set(codigos)) == len(codigos), clave
        tabla[clave] = {u[0]: u for u in unidades}
        basicas = usadas.get(clave, set())
        assert basicas <= set(codigos), (clave, basicas - set(codigos))
        catalogo["categorias"].append({
            "clave": clave,
            "nombre": nombre,
            "base": base,
            "solo_completo": clave in NUEVAS,
            "unidades": [
                {"codigo": c, "simbolo": s, "nombre": n, "factor": cifras(f, 15), "offset": cifras(o, 15), "basica": c in basicas}
                for (c, s, n, f, o) in unidades
            ],
        })
    catalogo["categorias"].append({"clave": "Calibre", "nombre": "Calibre de conductor", "solo_completo": True, "especial": "calibre", "unidades": []})

    # recalcula factor/offset de los pares de siempre
    cambios = []
    for r in pares:
        u = tabla[r["categoria"]]
        (_, _, _, fo, oo), (_, _, _, fd, od) = u[r["unidad_origen"]], u[r["unidad_destino"]]
        f = cifras(fo / fd)
        o = cifras((oo - od) / fd)
        cambios.append((r["categoria"], r["unidad_origen"], r["unidad_destino"], r["factor"], f, r["offset"], o))
        r["factor"], r["offset"] = f, o

    with io.open(os.path.join(RAIZ, "data", "unidades.json"), "w", encoding="utf-8", newline="\n") as f:
        json.dump(catalogo, f, ensure_ascii=False, indent=1)
        f.write("\n")
    with io.open(ruta_pares, "w", encoding="utf-8", newline="\n") as f:
        f.write("[\n" + ",\n".join("  " + json.dumps(r, ensure_ascii=False) for r in pares) + "\n]\n")
    print(f"unidades.json: {len(catalogo['categorias'])} categorias; factores-conversion.json: {len(pares)} pares recalculados")
    mayor = max(cambios, key=lambda c: abs(c[3] - c[4]) / abs(c[4]) if c[4] else 0)
    print("mayor cambio relativo:", mayor)


if __name__ == "__main__":
    principal()
