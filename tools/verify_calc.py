"""Verificacion cruzada de plausibilidad de los motores de calculo (no
forma parte de la app). Reimplementa cada formula en Python de forma
independiente para revisar ordenes de magnitud contra valores tipicos de
ingenieria antes de dar por buena la transcripcion en js/calc/*.js."""
import json
import math

ROOT = __file__.rsplit("tools", 1)[0]

# --- Ampacidad aerea (IEEE 738) -----------------------------------------
def ampacidad_aerea(D_mm, Rbajo, Ralto, epsilon=0.5, alfa=0.5, Ta=25, Tc=75, Vw=0.61, phi=90, He=0, Qse=1000, theta=90):
    D = D_mm/1000
    Tfilm = (Tc+Ta)/2
    rhof = (1.293 - 0.0001525*He + 0.000000006379*He**2) / (1+0.00367*Tfilm)
    muf = (0.000001458*(Tfilm+273)**1.5)/(Tfilm+383.4)
    kf = 0.02424 + 0.00007477*Tfilm - 0.000000004407*Tfilm**2
    re = (D*rhof*Vw)/muf
    kangle = 1.194 - math.cos(math.radians(phi)) + 0.194*math.cos(math.radians(2*phi)) + 0.368*math.sin(math.radians(2*phi))
    qcn = 3.645*rhof**0.5*D**0.75*(Tc-Ta)**1.25
    qc1 = kangle*(1.01+1.35*re**0.52)*kf*(Tc-Ta)
    qc2 = kangle*0.754*re**0.6*kf*(Tc-Ta)
    qc = max(qcn, qc1, qc2)
    qr = 17.8*D*epsilon*(((Tc+273)/100)**4 - ((Ta+273)/100)**4)
    qs = alfa*Qse*math.sin(math.radians(theta))*D
    r = (Rbajo + ((Ralto-Rbajo)/(75-25))*(Tc-25))/1000
    return math.sqrt((qc+qr-qs)/r)

with open(ROOT + "data/conductores-desnudos.json", encoding="utf-8") as f:
    conductores = json.load(f)
c = next(r for r in conductores if r["nombre_clave"] == "Wren (6/1)")  # ACSR pequeno, calibre 8 AWG
amp = ampacidad_aerea(c["diametro_cable_mm"], c["r_ac_25c_ohm_km"], c["r_ac_75c_ohm_km"])
print(f"Ampacidad aerea {c['nombre_clave']} (D={c['diametro_cable_mm']}mm): {amp:.1f} A"
      f"  [catalogo dice Corriente_a_75c={c.get('corriente_75c_a')} A bajo condiciones NTC distintas -> solo referencia de orden de magnitud]")

c2 = next(r for r in conductores if r["nombre_clave"] == "Partridge (26/7)")
amp2 = ampacidad_aerea(c2["diametro_cable_mm"], c2["r_ac_25c_ohm_km"], c2["r_ac_75c_ohm_km"])
print(f"Ampacidad aerea {c2['nombre_clave']} (D={c2['diametro_cable_mm']}mm): {amp2:.1f} A"
      f"  [catalogo Corriente_a_75c={c2.get('corriente_75c_a')} A]")

# --- Cortocircuito --------------------------------------------------------
def cortocircuito(material, area_mm2, t_op=75, t_falla=250, tiempo_s=0.3):
    tres0, k1 = (234, 341) if material == "Cobre" else (228, 224)
    log = math.log10((t_falla+tres0)/(t_op+tres0))
    return area_mm2*k1*math.sqrt(log/tiempo_s)/1000

print("\nCortocircuito Cobre 100mm2 t=0.3s:", round(cortocircuito("Cobre", 100), 2), "kA (tipico: pocas a ~10s kA para conductores medianos)")
print("Cortocircuito Aluminio 100mm2 t=0.3s:", round(cortocircuito("Aluminio", 100), 2), "kA")

# --- Perdidas --------------------------------------------------------------
def perdidas(U_kv=34.5, P_mw=19.9, fp=0.9, R_ohm_km=0.5, L_km=10, Fc=0.564):
    I = (P_mw*1000)/(U_kv*fp*math.sqrt(3))
    S = P_mw/fp
    Q = math.sqrt(S**2-P_mw**2)
    fperd = 0.7*Fc+0.3
    perd = (math.sqrt(3)*I*R_ohm_km*L_km*fperd*100)/(U_kv*1000*fp)
    return I, S, Q, perd

I, S, Q, perd = perdidas()
print(f"\nPerdidas defaults: I={I:.1f}A S={S:.2f}MVA Q={Q:.2f}MVAR perdidas={perd:.2f}%  (tipico 1-8% en distribucion)")

# --- Regulacion --------------------------------------------------------------
def regulacion(U_kv=34.5, P_mw=9.9, fp=0.95, L_km=5.2, R_ohm_km=0.4, RMG_m=0.01, Dab=2, Dac=2.84, Dbc=0.84):
    I = (P_mw*1000)/(U_kv*fp*math.sqrt(3))
    X = 0.0754*math.log((Dab*Dac*Dbc)**(1/3)/RMG_m)
    Z = R_ohm_km*fp + X*math.sin(math.acos(fp))
    psi = R_ohm_km + X*math.tan(math.acos(fp))
    Kv = psi/(10*U_kv**2)
    dV = math.sqrt(3)*I*Z*L_km/(U_kv*1000)
    return I, X, Z, psi, Kv, dV*100

I, X, Z, psi, Kv, dVpct = regulacion()
print(f"\nRegulacion defaults: I={I:.1f}A X={X:.4f} Z={Z:.4f} caida_tension={dVpct:.2f}%  (tipico 1-5% en distribucion)")

# --- Ocupacion de ductos ---------------------------------------------------
def ocupacion(n, Dc_mm, Dtubo_mm):
    PI = 3.1416
    areaCables = PI*(Dc_mm/2)**2 * n
    areaTubo = PI*(Dtubo_mm/2)**2
    return areaCables*100/areaTubo

print("\nOcupacion 3 conductores de 15mm en tubo interno 50mm:", round(ocupacion(3, 15, 50), 2), "% (limite 40% para 3+)")
