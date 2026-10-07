from pathlib import Path

from PIL import Image, ImageDraw, ImageFont

out = Path(__file__).resolve().parent


def load_font(size: int, bold: bool = False):
    candidates = [
        r"C:\Windows\Fonts\segoeuib.ttf" if bold else r"C:\Windows\Fonts\segoeui.ttf",
        r"C:\Windows\Fonts\arialbd.ttf" if bold else r"C:\Windows\Fonts\arial.ttf",
        r"C:\Windows\Fonts\calibrib.ttf" if bold else r"C:\Windows\Fonts\calibri.ttf",
    ]
    for p in candidates:
        try:
            return ImageFont.truetype(p, size)
        except OSError:
            continue
    return ImageFont.load_default()


def center_text(draw: ImageDraw.ImageDraw, text: str, font, y: int, fill, width: int):
    bbox = draw.textbbox((0, 0), text, font=font)
    tw = bbox[2] - bbox[0]
    draw.text(((width - tw) / 2, y), text, font=font, fill=fill)


def make_card(path: Path, bg: tuple[int, int, int], lines: list):
    w, h = 1920, 1080
    img = Image.new("RGB", (w, h), bg)
    accent = (36, 150, 95) if bg[1] > 40 else (40, 120, 80)
    overlay = Image.new("RGBA", (w, h), (0, 0, 0, 0))
    od = ImageDraw.Draw(overlay)
    od.ellipse((-200, -200, 700, 700), fill=(*accent, 40))
    od.ellipse((1300, 600, 2200, 1400), fill=(*accent, 28))
    img = Image.alpha_composite(img.convert("RGBA"), overlay).convert("RGB")
    draw = ImageDraw.Draw(img)
    for text, size, bold, y, color in lines:
        center_text(draw, text, load_font(size, bold), y, color, w)
    img.save(path, quality=95)
    print("wrote", path)


make_card(
    out / "isarva-title-card.png",
    (18, 103, 57),
    [
        ("ISARVA", 110, True, 360, (255, 255, 255)),
        ("Restaurant POS", 58, False, 500, (216, 240, 226)),
        ("Dining  ·  Delivery  ·  Kitchen  ·  Payments", 34, False, 620, (168, 213, 192)),
    ],
)

make_card(
    out / "isarva-end-card.png",
    (18, 32, 28),
    [
        ("ISARVA Restaurant POS", 68, True, 380, (255, 255, 255)),
        ("Book a demo today", 46, False, 500, (140, 233, 154)),
        ("app.restaurant-pos.isarva.in", 38, False, 600, (216, 235, 229)),
    ],
)
