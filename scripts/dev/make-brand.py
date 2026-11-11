"""Generates the NameSinger app icons and README wordmark from the Killa Gel Bold Script typeface (SIL OFL 1.1).
No Killa YuE logo or artwork is used: the identity is a gold script N over a five-line staff on near-black."""
import os
from PIL import Image, ImageDraw, ImageFont, ImageFilter, ImageChops

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", ".."))
FONT = os.path.join(ROOT, "modules", "killa-ui", "android", "src", "main", "assets", "fonts", "KillaGel-BoldScript.ttf")
HI, ACCENT, LO = (255, 226, 166), (231, 189, 97), (143, 106, 34)
DECK = (8, 9, 9)


def gradient_text(size, text, font_px, box_h):
    """Gold vertical-gradient text on transparent, tightly cropped."""
    font = ImageFont.truetype(FONT, font_px)
    mask = Image.new("L", size, 0)
    d = ImageDraw.Draw(mask)
    bbox = d.textbbox((0, 0), text, font=font)
    w, h = bbox[2] - bbox[0], bbox[3] - bbox[1]
    d.text(((size[0] - w) / 2 - bbox[0], (size[1] - h) / 2 - bbox[1]), text, font=font, fill=255)
    grad = Image.new("RGB", size)
    gp = grad.load()
    top, bot = (size[1] - h) // 2, (size[1] + h) // 2
    for y in range(size[1]):
        t = min(1, max(0, (y - top) / max(1, bot - top)))
        c = tuple(int(HI[i] * (1 - t * 2) + ACCENT[i] * (t * 2)) if t < 0.5 else int(ACCENT[i] * (2 - t * 2) + LO[i] * (t * 2 - 1)) for i in range(3))
        for x in range(size[0]):
            gp[x, y] = c
    out = Image.new("RGBA", size, (0, 0, 0, 0))
    out.paste(grad, (0, 0), mask)
    return out, mask


def staff_layer(size, margin, y_center, gap, alpha=70):
    layer = Image.new("RGBA", size, (0, 0, 0, 0))
    d = ImageDraw.Draw(layer)
    for i in range(-2, 3):
        y = y_center + i * gap
        d.line([(margin, y), (size[0] - margin, y)], fill=ACCENT + (alpha,), width=max(2, size[0] // 300))
    return layer


def backdrop(size):
    img = Image.new("RGB", size, DECK)
    glow = Image.new("RGB", size, (0, 0, 0))
    gd = ImageDraw.Draw(glow)
    r = int(size[0] * 0.55)
    gd.ellipse([size[0] // 2 - r, size[1] // 2 - r, size[0] // 2 + r, size[1] // 2 + r], fill=(26, 19, 8))
    glow = glow.filter(ImageFilter.GaussianBlur(size[0] // 5))
    return ImageChops.add(img, glow)


def monogram(size, n_scale, with_staff=True):
    layer = Image.new("RGBA", size, (0, 0, 0, 0))
    if with_staff:
        layer = Image.alpha_composite(layer, staff_layer(size, int(size[0] * 0.12), int(size[1] * 0.5), int(size[1] * 0.075)))
    n, mask = gradient_text(size, "N", int(size[0] * n_scale), size[1])
    # soft shadow for depth
    sh = Image.new("RGBA", size, (0, 0, 0, 0))
    sh.paste((0, 0, 0, 150), (0, size[1] // 60), mask.filter(ImageFilter.GaussianBlur(size[0] // 80)))
    layer = Image.alpha_composite(layer, sh)
    return Image.alpha_composite(layer, n), mask


def main():
    a = os.path.join(ROOT, "assets")
    S = (1024, 1024)
    # full icon (rounded by the launcher)
    mono, _ = monogram(S, 0.72)
    icon = Image.alpha_composite(backdrop(S).convert("RGBA"), mono)
    icon.convert("RGB").save(os.path.join(a, "icon.png"))
    # adaptive: foreground inside the 66% safe zone, solid dark background
    fg_layer, _ = monogram(S, 0.52, with_staff=True)
    fg_layer.save(os.path.join(a, "android-icon-foreground.png"))
    Image.new("RGB", S, DECK).save(os.path.join(a, "android-icon-background.png"))
    # monochrome: white N silhouette
    _, mask = gradient_text(S, "N", int(S[0] * 0.52), S[1])
    mono_img = Image.new("RGBA", S, (0, 0, 0, 0))
    mono_img.paste((255, 255, 255, 255), (0, 0), mask)
    mono_img.save(os.path.join(a, "android-icon-monochrome.png"))
    # splash + favicon
    sp, _ = monogram(S, 0.5, with_staff=False)
    sp.save(os.path.join(a, "splash-icon.png"))
    icon.convert("RGB").resize((48, 48), Image.LANCZOS).save(os.path.join(a, "favicon.png"))
    # README wordmark banner
    W, H = 1280, 320
    bg = backdrop((W, H)).convert("RGBA")
    bg = Image.alpha_composite(bg, staff_layer((W, H), 60, H // 2, 34, alpha=40))
    word, mask = gradient_text((W, H), "NameSinger", 190, H)
    sh = Image.new("RGBA", (W, H), (0, 0, 0, 0))
    sh.paste((0, 0, 0, 170), (0, 6), mask.filter(ImageFilter.GaussianBlur(6)))
    bg = Image.alpha_composite(Image.alpha_composite(bg, sh), word)
    os.makedirs(os.path.join(ROOT, "docs", "assets"), exist_ok=True)
    bg.convert("RGB").save(os.path.join(ROOT, "docs", "assets", "logo.png"), optimize=True)
    print("brand assets written")


if __name__ == "__main__":
    main()
