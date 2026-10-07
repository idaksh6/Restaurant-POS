"""Generate PWA / favicon icons from the Isarva logo mark.

Run from repo root:  python mesa-pos/scripts/build_pwa_icons.py
"""
from pathlib import Path

from PIL import Image, ImageDraw

ROOT = Path(__file__).resolve().parents[1]
LOGO = ROOT / "docs" / "poster" / "assets" / "logo-isarva.png"
OUT = ROOT / "public"


def extract_mark() -> Image.Image:
    logo = Image.open(LOGO).convert("RGBA")
    w, h = logo.size
    mark = Image.new("RGBA", (w, h), (0, 0, 0, 0))
    src = logo.load()
    dst = mark.load()
    # The emblem (pegasus + "N" shape) sits left of the wordmark; the
    # wordmark's "i" starts at x≈278 below y≈140, the company line at y≈340.
    for y in range(min(h, 338)):
        for x in range(w):
            if x < 278 or y < 140:
                dst[x, y] = src[x, y]
    return mark.crop(mark.getbbox())


def render(mark: Image.Image, size: int, pad: float, radius: float) -> Image.Image:
    scale = 4
    big = size * scale
    canvas = Image.new("RGBA", (big, big), (0, 0, 0, 0))
    bg = Image.new("RGBA", (big, big), (0, 0, 0, 0))
    ImageDraw.Draw(bg).rounded_rectangle(
        (0, 0, big - 1, big - 1), radius=int(big * radius), fill=(255, 255, 255, 255)
    )
    canvas.alpha_composite(bg)
    inner = int(big * (1 - 2 * pad))
    k = inner / max(mark.width, mark.height)
    m = mark.resize((round(mark.width * k), round(mark.height * k)), Image.LANCZOS)
    canvas.alpha_composite(m, ((big - m.width) // 2, (big - m.height) // 2))
    return canvas.resize((size, size), Image.LANCZOS)


def main() -> None:
    OUT.mkdir(exist_ok=True)
    mark = extract_mark()
    render(mark, 192, 0.12, 0.22).save(OUT / "pwa-192.png")
    render(mark, 512, 0.12, 0.22).save(OUT / "pwa-512.png")
    # Maskable: full-bleed square, mark inside the 80% safe zone.
    render(mark, 512, 0.2, 0.0).save(OUT / "pwa-maskable-512.png")
    render(mark, 180, 0.12, 0.0).convert("RGB").save(OUT / "apple-touch-icon.png")
    render(mark, 64, 0.06, 0.22).save(OUT / "favicon.png")
    render(mark, 256, 0.08, 0.22).save(
        OUT / "favicon.ico", sizes=[(16, 16), (32, 32), (48, 48), (64, 64), (256, 256)]
    )
    print("icons written to", OUT)


if __name__ == "__main__":
    main()
