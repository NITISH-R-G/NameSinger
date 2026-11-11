"""Crops phone screenshots (status bar and gesture bar removed) and writes 540px-wide JPEGs for the README, plus a contact sheet for review."""
import os
from PIL import Image

SRC = r"C:\Projects\Name singer\research-killa-yue\ns\rel"
DST = os.path.join(os.path.dirname(__file__), "..", "..", "docs", "screenshots")
ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", ".."))
PAIRS = [
    ("01.png", "01-create.jpg"),
    ("02.png", "02-name-input.jpg"),
    ("04_melody.png", "03-generating-melody.jpg"),
    ("05_render.png", "04-generating-render.jpg"),
    ("06_done.png", "05-song-ready.jpg"),
    ("07_playing.png", "06-playback.jpg"),
    ("08_saved.png", "07-saved.jpg"),
]
os.makedirs(DST, exist_ok=True)
tiles = []
for src, dst in PAIRS:
    im = Image.open(os.path.join(SRC, src)).convert("RGB")
    w, h = im.size
    im = im.crop((0, 130, w, h - 80))           # drop the status bar (clock, notification icons) and the gesture bar
    im = im.resize((540, int(540 * im.size[1] / im.size[0])), Image.LANCZOS)
    im.save(os.path.join(DST, dst), quality=86, optimize=True)
    tiles.append(im)
cw, ch = tiles[0].size
sheet = Image.new("RGB", (cw * 4 + 30, ch * 2 + 10), (70, 70, 70))
for i, t in enumerate(tiles):
    sheet.paste(t, ((i % 4) * (cw + 10), (i // 4) * (ch + 10)))
sheet.resize((sheet.width // 2, sheet.height // 2)).save(os.path.join(ROOT, "scratch_sheet.png"))
print("ok", [os.path.getsize(os.path.join(DST, d)) // 1024 for _, d in PAIRS], "KB")
