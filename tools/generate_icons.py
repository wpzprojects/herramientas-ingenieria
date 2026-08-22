"""
Genera iconos PWA placeholder (PNG, sin dependencias externas: solo zlib de
la libreria estandar) hasta que el usuario aporte un logo definitivo.
Dibuja un rayo blanco simple sobre fondo solido color de marca.

Uso: python tools/generate_icons.py
Salida: icons/icon-192.png, icons/icon-512.png, icons/icon-maskable-512.png
"""
import struct
import zlib
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
OUT = ROOT / "icons"
OUT.mkdir(exist_ok=True)

BG = (10, 102, 194, 255)   # var(--accent)
FG = (255, 255, 255, 255)

# Poligono de un rayo, en un viewBox de 24x24 (mismo trazo que js/icons.js "bolt")
BOLT = [(13, 2), (4, 14), (10, 14), (9, 22), (18, 10), (12, 10), (13, 2)]


def point_in_polygon(x, y, poly):
    inside = False
    n = len(poly)
    j = n - 1
    for i in range(n):
        xi, yi = poly[i]
        xj, yj = poly[j]
        if ((yi > y) != (yj > y)) and (x < (xj - xi) * (y - yi) / (yj - yi) + xi):
            inside = not inside
        j = i
    return inside


def render(size, padding_frac, rounded=True):
    pad = size * padding_frac
    scale = (size - 2 * pad) / 24
    poly = [(pad + px * scale, pad + py * scale) for px, py in BOLT]
    corner_r = size * 0.18 if rounded else 0

    rows = []
    for y in range(size):
        row = bytearray()
        for x in range(size):
            # esquinas redondeadas del fondo
            in_bg = True
            if rounded:
                cx = min(max(x, corner_r), size - corner_r)
                cy = min(max(y, corner_r), size - corner_r)
                if (x < corner_r or x > size - corner_r) and (y < corner_r or y > size - corner_r):
                    if (x - cx) ** 2 + (y - cy) ** 2 > corner_r ** 2:
                        in_bg = False
            if not in_bg:
                row.extend((0, 0, 0, 0))
            elif point_in_polygon(x + 0.5, y + 0.5, poly):
                row.extend(FG)
            else:
                row.extend(BG)
        rows.append(bytes(row))
    return rows


def write_png(path, size, rows):
    def chunk(tag, data):
        return struct.pack(">I", len(data)) + tag + data + struct.pack(">I", zlib.crc32(tag + data))

    sig = b"\x89PNG\r\n\x1a\n"
    ihdr = struct.pack(">IIBBBBB", size, size, 8, 6, 0, 0, 0)
    raw = b"".join(b"\x00" + row for row in rows)
    idat = zlib.compress(raw, 9)
    png = sig + chunk(b"IHDR", ihdr) + chunk(b"IDAT", idat) + chunk(b"IEND", b"")
    path.write_bytes(png)
    print(f"  -> {path.relative_to(ROOT)} ({size}x{size})")


def main():
    write_png(OUT / "icon-192.png", 192, render(192, padding_frac=0.22))
    write_png(OUT / "icon-512.png", 512, render(512, padding_frac=0.22))
    # maskable: mas relleno de seguridad (zona segura ~80% central), sin
    # esquinas redondeadas propias porque el SO ya aplica su propia mascara
    write_png(OUT / "icon-maskable-512.png", 512, render(512, padding_frac=0.32, rounded=False))


if __name__ == "__main__":
    main()
