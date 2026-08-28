"""
Genera los iconos PWA (icons/icon-192.png, icon-512.png, icon-maskable-512.png)
a partir del logo definitivo en assets/IconoAPP.png.

Uso: python tools/generate_icons_from_source.py
"""
from pathlib import Path
from PIL import Image

ROOT = Path(__file__).resolve().parent.parent
SRC = ROOT / "assets" / "IconoAPP.png"
OUT = ROOT / "icons"


def fit_on_canvas(src: Image.Image, size: int, padding_frac: float, bg=(0, 0, 0, 0)) -> Image.Image:
    canvas = Image.new("RGBA", (size, size), bg)
    inner = int(size * (1 - 2 * padding_frac))
    resized = src.copy()
    resized.thumbnail((inner, inner), Image.LANCZOS)
    x = (size - resized.width) // 2
    y = (size - resized.height) // 2
    canvas.paste(resized, (x, y), resized)
    return canvas


def main():
    src = Image.open(SRC).convert("RGBA")
    OUT.mkdir(exist_ok=True)

    fit_on_canvas(src, 192, padding_frac=0.06).save(OUT / "icon-192.png")
    fit_on_canvas(src, 512, padding_frac=0.06).save(OUT / "icon-512.png")
    # maskable: zona segura ~80% central y fondo opaco (el SO recorta con su
    # propia mascara y no debe verse transparencia fuera de ella)
    fit_on_canvas(src, 512, padding_frac=0.18, bg=(255, 255, 255, 255)).save(OUT / "icon-maskable-512.png")

    print("Iconos generados en", OUT)


if __name__ == "__main__":
    main()
