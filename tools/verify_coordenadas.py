"""Verificacion cruzada (no forma parte de la app) del algoritmo de
conversion de coordenadas Kruger, reimplementado en Python de forma
independiente a partir del mismo pseudocodigo de Power Fx, para validar
numericamente la transcripcion hecha en js/calc/coordenadas.js."""
import math

SISTEMAS = {
    4326: dict(elipsoide="WGS84", lat0=0, lon0=0, k0=1, FE=0, FN=0, esGeo=True),
    3116: dict(elipsoide="GRS80", lat0=4.59620041666667, lon0=-74.0775079166667, k0=1, FE=1000000, FN=1000000, esGeo=False),
    9377: dict(elipsoide="GRS80", lat0=4, lon0=-73, k0=0.9992, FE=5000000, FN=2000000, esGeo=False),
    32618: dict(elipsoide="WGS84", lat0=0, lon0=-75, k0=0.9996, FE=500000, FN=0, esGeo=False),
}


def ellipsoid(a, f):
    e = math.sqrt(f * (2 - f))
    n = f / (2 - f)
    A = (a / (1 + n)) * (1 + n**2/4 + n**4/64 + n**6/256)
    a1 = 1/2*n - 2/3*n**2 + 5/16*n**3 + 41/180*n**4 - 127/288*n**5 + 7891/37800*n**6
    a2 = 13/48*n**2 - 3/5*n**3 + 557/1440*n**4 + 281/630*n**5 - 1983433/1935360*n**6
    a3 = 61/240*n**3 - 103/140*n**4 + 15061/26880*n**5 + 167603/181440*n**6
    a4 = 49561/161280*n**4 - 179/168*n**5 + 6601661/7257600*n**6
    a5 = 34729/80640*n**5 - 3418889/1995840*n**6
    a6 = 212378941/319334400*n**6
    b1 = 1/2*n - 2/3*n**2 + 37/96*n**3 - 1/360*n**4 - 81/512*n**5 + 96199/604800*n**6
    b2 = 1/48*n**2 + 1/15*n**3 - 437/1440*n**4 + 46/105*n**5 - 1118711/3870720*n**6
    b3 = 17/480*n**3 - 37/840*n**4 - 209/4480*n**5 + 5569/90720*n**6
    b4 = 4397/161280*n**4 - 11/504*n**5 - 830251/7257600*n**6
    b5 = 4583/161280*n**5 - 108847/3991680*n**6
    b6 = 20648693/638668800*n**6
    d1 = 2*n - 2/3*n**2 - 2*n**3 + 116/45*n**4 + 26/45*n**5 - 2854/675*n**6
    d2 = 7/3*n**2 - 8/5*n**3 - 227/45*n**4 + 2704/315*n**5 + 2323/945*n**6
    d3 = 56/15*n**3 - 136/35*n**4 - 1262/105*n**5 + 73814/2835*n**6
    d4 = 4279/630*n**4 - 332/35*n**5 - 399572/14175*n**6
    d5 = 4174/315*n**5 - 144838/6237*n**6
    d6 = 601676/22275*n**6
    return dict(e=e, n=n, A=A, a=[a1,a2,a3,a4,a5,a6], b=[b1,b2,b3,b4,b5,b6], d=[d1,d2,d3,d4,d5,d6])

GRS80 = ellipsoid(6378137, 1/298.257222101)
WGS84 = ellipsoid(6378137, 1/298.257223563)
ep = lambda elips: GRS80 if elips == "GRS80" else WGS84


def M0(p, k0, phi0):
    e, A, a = p["e"], p["A"], p["a"]
    argT0 = 0.5*math.log((1+math.sin(phi0))/(1-math.sin(phi0))) - e*0.5*math.log((1+e*math.sin(phi0))/(1-e*math.sin(phi0)))
    t0 = math.sinh(argT0)
    xiP0 = math.atan(t0)
    xi0 = xiP0 + sum(a[k-1]*math.sin(2*k*xiP0) for k in range(1,7))
    return k0*A*xi0


def proyectada_a_latlon(sis, x_in, y_in):
    p = ep(sis["elipsoide"])
    e, A, b, d = p["e"], p["A"], p["b"], p["d"]
    phi0 = math.radians(sis["lat0"]); lambda0 = math.radians(sis["lon0"])
    m0 = M0(p, sis["k0"], phi0)
    xi_pt = (y_in - sis["FN"] + m0) / (sis["k0"]*A)
    eta_pt = (x_in - sis["FE"]) / (sis["k0"]*A)
    xiPrime = xi_pt - sum(b[k-1]*math.sin(2*k*xi_pt)*math.cosh(2*k*eta_pt) for k in range(1,7))
    etaPrime = eta_pt - sum(b[k-1]*math.cos(2*k*xi_pt)*math.sinh(2*k*eta_pt) for k in range(1,7))
    sinhEtaPrime = math.sinh(etaPrime)
    # Power Fx Atan2(x,y) = atan2(y,x) estandar (orden de argumentos invertido vs Excel/matematico)
    chi = math.atan2(math.sin(xiPrime), math.sqrt(sinhEtaPrime**2 + math.cos(xiPrime)**2))
    dLambda = math.atan2(sinhEtaPrime, math.cos(xiPrime))
    phi = chi + sum(d[k-1]*math.sin(2*k*chi) for k in range(1,7))
    lam = lambda0 + dLambda
    return phi, lam


def latlon_a_proyectada(sis, phi, lam):
    p = ep(sis["elipsoide"])
    e, A, a = p["e"], p["A"], p["a"]
    phi0 = math.radians(sis["lat0"]); lambda0 = math.radians(sis["lon0"])
    dLambda = lam - lambda0
    argT = 0.5*math.log((1+math.sin(phi))/(1-math.sin(phi))) - e*0.5*math.log((1+e*math.sin(phi))/(1-e*math.sin(phi)))
    t = math.sinh(argT)
    xiP = math.atan2(t, math.cos(dLambda))
    etaArg = math.sin(dLambda) / math.sqrt(t**2 + math.cos(dLambda)**2)
    etaP = math.asinh(etaArg)
    xi = xiP + sum(a[k-1]*math.sin(2*k*xiP)*math.cosh(2*k*etaP) for k in range(1,7))
    eta = etaP + sum(a[k-1]*math.cos(2*k*xiP)*math.sinh(2*k*etaP) for k in range(1,7))
    m0 = M0(p, sis["k0"], phi0)
    return sis["FE"]+sis["k0"]*A*eta, sis["FN"]+sis["k0"]*A*xi - m0


def convertir(epsg_o, epsg_d, x_in, y_in):
    so, sd = SISTEMAS[epsg_o], SISTEMAS[epsg_d]
    if so["esGeo"]:
        phi, lam = math.radians(y_in), math.radians(x_in)
    else:
        phi, lam = proyectada_a_latlon(so, x_in, y_in)
    if sd["esGeo"]:
        return math.degrees(lam), math.degrees(phi)
    return latlon_a_proyectada(sd, phi, lam)


# Test 1: centro de Bogota (aprox) WGS84 -> MAGNA-SIRGAS Bogota (3116)
# El origen de 3116 esta casi en el centro de Bogota, se espera algo cercano a (1000000, 1000000)
x, y = convertir(4326, 3116, -74.08175, 4.60971)
print("Bogota WGS84->3116:", x, y, " (se espera cerca de 1,000,000 / 1,000,000)")

# Test 2: round-trip 3116 -> 4326 -> 3116
x2, y2 = convertir(3116, 4326, x, y)
x3, y3 = convertir(4326, 3116, x2, y2)
print("round-trip 3116->4326->3116 delta:", x3-x, y3-y, "(deben ser ~0)")

# Test 3: round-trip via UTM 18N
xu, yu = convertir(4326, 32618, -74.08175, 4.60971)
print("Bogota WGS84->UTM18N:", xu, yu, "(se espera E~500000+/-100000ish, N positivo)")
xu2, yu2 = convertir(32618, 4326, xu, yu)
print("UTM18N->WGS84 back:", xu2, yu2, "(debe ser ~ -74.08175, 4.60971)")

# Test 4: 9377 origen unico nacional
x9, y9 = convertir(4326, 9377, -74.08175, 4.60971)
print("Bogota WGS84->9377:", x9, y9)
