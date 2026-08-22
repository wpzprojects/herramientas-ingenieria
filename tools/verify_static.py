"""Verificacion estatica ligera (sin Node): balance de llaves/parentesis y
resolucion de rutas de import relativas, sobre todos los .js del proyecto.

Limitacion conocida: el lexer es ingenuo y no reconoce literales de regex
(/"/g, /'/g, etc.) como distintos de strings -- una comilla dentro de un
literal de regex puede producir un falso positivo de "desbalance". Antes de
confiar en un reporte de error de este script, revisa el archivo a mano; la
prueba autoritativa real es tools/verify_static.py + de verdad cargar la app
en un navegador (ver README)."""
import re
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
JS_DIR = ROOT / "js"

PAIRS = {"{": "}", "(": ")", "[": "]"}
OPEN = set(PAIRS.keys())
CLOSE = {v: k for k, v in PAIRS.items()}

problems = []

for path in sorted(JS_DIR.rglob("*.js")):
    text = path.read_text(encoding="utf-8")
    # balance muy simplificado (ignora que { } tambien puede aparecer en
    # strings/template literals, pero da una señal util de errores groseros)
    stack = []
    in_str = None
    i = 0
    n = len(text)
    while i < n:
        c = text[i]
        if in_str:
            if c == "\\":
                i += 2
                continue
            if c == in_str:
                in_str = None
        elif c in ("'", '"', "`"):
            in_str = c
        elif c == "/" and i + 1 < n and text[i+1] == "/":
            j = text.find("\n", i)
            i = j if j != -1 else n
            continue
        elif c == "/" and i + 1 < n and text[i+1] == "*":
            j = text.find("*/", i)
            i = j + 2 if j != -1 else n
            continue
        elif c in OPEN:
            stack.append(c)
        elif c in CLOSE:
            if not stack or stack[-1] != CLOSE[c]:
                problems.append(f"{path.relative_to(ROOT)}: desbalance en posicion {i} (esperaba cierre de '{stack[-1] if stack else '?'}', encontro '{c}')")
                break
            stack.pop()
        i += 1
    else:
        if stack:
            problems.append(f"{path.relative_to(ROOT)}: quedaron {len(stack)} simbolos sin cerrar: {stack}")

    # resolucion de imports relativos
    for m in re.finditer(r'from\s+["\'](\.\.?/[^"\']+)["\']', text):
        rel = m.group(1)
        target = (path.parent / rel).resolve()
        if not target.exists():
            problems.append(f"{path.relative_to(ROOT)}: import no resuelve -> {rel} (buscado en {target})")

if problems:
    print(f"{len(problems)} problema(s) encontrados:\n")
    for p in problems:
        print(" -", p)
else:
    print("OK: todos los .js balanceados y todos los imports relativos resuelven a un archivo existente.")

print(f"\nArchivos revisados: {len(list(JS_DIR.rglob('*.js')))}")
