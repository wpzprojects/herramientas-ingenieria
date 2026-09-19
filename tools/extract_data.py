"""
OBSOLETO (2026-09-19): el .msapp y APP_PowerApps/ se retiraron del repositorio (siguen en el historial de git) y los
data/*.json son ahora la fuente de verdad. Este script se conserva solo como registro de como se saneo la informacion;
para volver a usarlo hay que restaurar APP_PowerApps desde el historial (ver README.md, "Catalogos de datos").

Extrae y sanea los catalogos de datos embebidos en el .msapp original de
Power Apps ("Herramientas offline") hacia JSON limpio para la PWA.

Fuente: APP_PowerApps/_extracted/References/DataSources.json
        (generado extrayendo el .msapp, que es un archivo zip, en
        APP_PowerApps/_extracted/)

Uso:  python tools/extract_data.py
Salida: data/*.json

Volver a ejecutar este script si se actualiza el .msapp original y hay que
resincronizar los catalogos de conductores/tuberias/codificacion/resoluciones.
"""
import json
import re
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
SRC_DATASOURCES = ROOT / "APP_PowerApps" / "_extracted" / "References" / "DataSources.json"
SRC_AMPACIDAD_SUB = ROOT / "APP_PowerApps" / "_extracted" / "Src" / "Calculo de ampacidad subterraneos.pa.yaml"
DATA_DIR = ROOT / "data"


def to_float(value):
    """Convierte 'string con coma decimal' -> float. Deja None/num tal cual."""
    if value is None:
        return None
    if isinstance(value, (int, float)):
        return value
    s = str(value).strip().replace(",", ".")
    return float(s)


def rename_rows(rows, mapping, floats=(), ints=()):
    """mapping: dict {clave_origen: clave_destino}. floats/ints: claves
    destino que deben forzarse a numero."""
    out = []
    for row in rows:
        new_row = {}
        for src_key, dst_key in mapping.items():
            val = row.get(src_key)
            if dst_key in floats:
                try:
                    val = to_float(val)
                except ValueError:
                    val = None
            elif dst_key in ints:
                try:
                    val = int(to_float(val)) if val is not None else None
                except ValueError:
                    val = None
            new_row[dst_key] = val
        out.append(new_row)
    return out


def write_json(name, data):
    DATA_DIR.mkdir(exist_ok=True)
    out_path = DATA_DIR / name
    with open(out_path, "w", encoding="utf-8") as f:
        json.dump(data, f, ensure_ascii=False, indent=2)
    print(f"  -> {out_path.relative_to(ROOT)}  ({len(data)} filas)")


def normalize_calibre(rows, key):
    """Los calibres tipo '266,8' son numeros con coma decimal; los tipo
    '1/0' son fracciones AWG. Solo se normaliza la coma a punto cuando el
    valor es puramente numerico."""
    numeric_re = re.compile(r"^\d+,\d+$")
    for row in rows:
        v = row.get(key)
        if v and numeric_re.match(v):
            row[key] = v.replace(",", ".")
    return rows


def main():
    with open(SRC_DATASOURCES, encoding="utf-8") as f:
        raw = json.load(f)
    tables = {t["Name"]: json.loads(t["Data"]) for t in raw["DataSources"]}

    print("Extrayendo catalogos desde DataSources.json...")

    # --- Conductores desnudos ---------------------------------------
    rows = rename_rows(
        tables["T_Catalogo_Conductores"],
        {
            "ID": "id",
            "Tipo": "tipo",
            "Código": "codigo",
            "Nombre_clave": "nombre_clave",
            "Calibre_(AWG_o_kcmil)": "calibre_awg_kcmil",
            "Conductor_equivalente_ACSR": "conductor_equivalente_acsr",
            "Clase": "clase",
            "Numero_de_hilos_(Aluminio/Acero)": "numero_hilos_aluminio_acero",
            "Numero_de_hilos_(Al1350/Al6201)": "numero_hilos_al1350_al6201",
            "Diametro_hilos_aluminio_(mm)": "diametro_hilos_aluminio_mm",
            "Diametro_hilos_acero_(mm)": "diametro_hilos_acero_mm",
            "Diametro_nucleo_acero_(mm)": "diametro_nucleo_acero_mm",
            "Area_seccion_aluminio_(mm2)": "area_seccion_aluminio_mm2",
            "Diametro_del_cable_(mm)": "diametro_cable_mm",
            "Masa_(kg/km)": "masa_kg_km",
            "Carga_de_rotura_(kgf)": "carga_rotura_kgf",
            "R_CC_a_20°C_(Ohm/km)": "r_cc_20c_ohm_km",
            "R_AC_a_25°C_(Ohm/km)": "r_ac_25c_ohm_km",
            "R_AC_a_75°C_(Ohm/km)": "r_ac_75c_ohm_km",
            "Radio_Medio_Geometrico_(mm)": "radio_medio_geometrico_mm",
            "Corriente_a_75°C_(A)": "corriente_75c_a",
            "Corriente_a_200°C_(A)": "corriente_200c_a",
            "Corriente_a_250°C_(A)": "corriente_250c_a",
            "Corriente_sol_y_no_viento_(A)": "corriente_sol_no_viento_a",
            "Corriente_sol_y_viento_(A)": "corriente_sol_viento_a",
            "Corriente_no_sol_y_viento_(A)": "corriente_no_sol_viento_a",
            "Corriente_cortocircuito_1S_(kA)": "corriente_cortocircuito_1s_ka",
        },
        floats=(
            "diametro_hilos_aluminio_mm", "diametro_hilos_acero_mm",
            "diametro_nucleo_acero_mm", "area_seccion_aluminio_mm2",
            "diametro_cable_mm", "masa_kg_km", "carga_rotura_kgf",
            "r_cc_20c_ohm_km", "r_ac_25c_ohm_km", "r_ac_75c_ohm_km",
            "radio_medio_geometrico_mm",
        ),
        ints=(
            "corriente_75c_a", "corriente_200c_a", "corriente_250c_a",
            "corriente_sol_no_viento_a", "corriente_sol_viento_a",
            "corriente_no_sol_viento_a",
        ),
    )
    normalize_calibre(rows, "calibre_awg_kcmil")
    write_json("conductores-desnudos.json", rows)

    # --- Conductores semiaislados -------------------------------------
    rows = rename_rows(
        tables["T_Conductores_Semiaislados"],
        {
            "ID": "id",
            "Capas": "capas",
            "Tension_Operacion_(kV)": "tension_operacion_kv",
            "Tipo_Conductor": "material_conductor",
            "Codigo": "codigo",
            "Calibre_(AWG_o_kcmil)": "calibre_awg_kcmil",
            "Nombre_clave": "nombre_clave",
            "Numero_de_hilos": "numero_hilos",
            "Diametro_total_(mm)": "diametro_total_mm",
            "Masa_total_(kg/km)": "masa_total_kg_km",
        },
        floats=("diametro_total_mm", "masa_total_kg_km"),
    )
    normalize_calibre(rows, "calibre_awg_kcmil")
    write_json("conductores-semiaislados.json", rows)

    # --- Conductores XLPE MT ------------------------------------------
    rows = rename_rows(
        tables["T_Catalogo_Conductores_XLPE"],
        {
            "ID": "id",
            "Nivel_Tension_(kV)": "nivel_tension_kv",
            "Porcentaje_Aislamiento_(%)": "porcentaje_aislamiento_pct",
            "Material_Conductor": "material_conductor",
            "Pantalla": "pantalla",
            "Calibre_Conductor_(AWG/kcmil)": "calibre_awg_kcmil",
            "Area_Conductor_(mm2)": "area_conductor_mm2",
            "Diametro_Conductor_(mm)": "diametro_conductor_mm",
            "Radio_Medio_Geometrico_(mm)": "radio_medio_geometrico_mm",
            "Espesor_Aislamiento_(mm)": "espesor_aislamiento_mm",
            "Diametro_sobre_Aislamiento_(mm)": "diametro_sobre_aislamiento_mm",
            "Num_hilos_de_pantalla": "num_hilos_pantalla",
            "Diametro_cada_hilo_(mm)": "diametro_cada_hilo_pantalla_mm",
            "Espesor_Chaqueta_(mm)": "espesor_chaqueta_mm",
            "Diametro_Total_Conductor_(mm)": "diametro_total_conductor_mm",
            "Masa_Total_(kg/km)": "masa_total_kg_km",
            "R_CC_a_20°C_(Ohm/km)": "r_cc_20c_ohm_km",
            "R_AC_a_75°C_(Ohm/km)": "r_ac_75c_ohm_km",
            "R_AC_a_90°C_(Ohm/km)": "r_ac_90c_ohm_km",
        },
        floats=(
            "area_conductor_mm2", "diametro_conductor_mm",
            "radio_medio_geometrico_mm", "espesor_aislamiento_mm",
            "diametro_sobre_aislamiento_mm", "diametro_cada_hilo_pantalla_mm",
            "espesor_chaqueta_mm", "diametro_total_conductor_mm",
            "masa_total_kg_km", "r_cc_20c_ohm_km", "r_ac_75c_ohm_km",
            "r_ac_90c_ohm_km",
        ),
        ints=("num_hilos_pantalla", "porcentaje_aislamiento_pct"),
    )
    normalize_calibre(rows, "calibre_awg_kcmil")
    for r in rows:
        r["tipo"] = "XLPE"
    write_json("conductores-xlpe.json", rows)

    # --- Tuberias (para Ocupacion de ductos) ---------------------------
    rows = rename_rows(
        tables["T_Tuberias"],
        {
            "Tipo": "tipo",
            "Diametro Nominal": "diametro_nominal",
            "Diametro Exterior Mínimo (pulg)": "diametro_exterior_min_pulg",
            "Diametro Interno Mínimo (Pulg)": "diametro_interno_min_pulg",
            "Diametro Interno Mínimo (mm)": "diametro_interno_min_mm",
            "Espesor Pared Máximo (Pulg)": "espesor_pared_max_pulg",
            "Espesor Pared Mínimo (Pulg)": "espesor_pared_min_pulg",
            "Peso Mínimo (Kg)": "peso_min_kg",
        },
        floats=(
            "diametro_exterior_min_pulg", "diametro_interno_min_pulg",
            "diametro_interno_min_mm", "espesor_pared_max_pulg",
            "espesor_pared_min_pulg", "peso_min_kg",
        ),
    )
    write_json("tuberias.json", rows)

    # --- Codificacion de entregables ------------------------------------
    rows = rename_rows(
        tables["T_Codificacion"],
        {"ID": "id", "Codigo": "codigo", "Entregable": "entregable", "Especialidad": "especialidad"},
    )
    write_json("codificacion.json", rows)

    # --- Resoluciones ------------------------------------------------
    rows = rename_rows(
        tables["T_Resoluciones"],
        {"ID": "id", "Resolucion": "resolucion", "Fecha": "fecha",
         "Objeto_Importancia": "objeto", "Resumen": "resumen"},
    )
    write_json("resoluciones.json", rows)

    # --- Construccion de cable subterraneo (colConstruccionCable) -------
    print("Extrayendo colConstruccionCable desde el .pa.yaml (ampacidad subterranea)...")
    text = SRC_AMPACIDAD_SUB.read_text(encoding="utf-8")
    start = text.index("ClearCollect(\n        colConstruccionCable,")
    end = text.index("\n        );", start)
    block = text[start:end]
    record_pattern = re.compile(r"\{([^{}]+)\}")
    cable_rows = []
    for m in record_pattern.finditer(block):
        body = m.group(1)
        record_json = "{" + re.sub(r"(\w+):", r'"\1":', body) + "}"
        cable_rows.append(json.loads(record_json))

    key_map = {
        "Material": "material", "Calibre": "calibre_awg_kcmil",
        "TipoPantalla": "tipo_pantalla", "NivelAislamiento_kV": "nivel_aislamiento_kv",
        "NivelAislamiento_Pct": "nivel_aislamiento_pct", "dc": "dc_m", "ds": "ds_m",
        "De": "de_m", "t1": "t1_m", "t2": "t2_m", "t3": "t3_m", "R0": "r0_ohm_m",
        "Alpha20": "alpha20", "RhoAislamiento": "rho_aislamiento",
        "RhoRelleno": "rho_relleno", "RhoChaqueta": "rho_chaqueta",
        "EpsilonR": "epsilon_r", "TanDelta": "tan_delta", "Rs": "rs_ohm_m",
    }
    cable_rows_clean = [
        {key_map[k]: v for k, v in row.items()} for row in cable_rows
    ]
    # corrige el bug de nomenclatura original: colCalibresLista decia
    # "1000 AWG" pero la tabla de construccion usa "1000 kcmil" -- aqui
    # ya viene correcto ("1000 kcmil"); no se requiere fix, se deja
    # constancia de la verificacion.
    assert all(r["calibre_awg_kcmil"] != "1000 AWG" for r in cable_rows_clean)
    write_json("construccion-cable-subterraneo.json", cable_rows_clean)

    print(f"\nListo. {len(list(DATA_DIR.glob('*.json')))} archivos en data/ (mas factores-conversion.json escrito a mano).")


if __name__ == "__main__":
    main()
