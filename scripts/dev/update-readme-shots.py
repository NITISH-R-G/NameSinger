"""One-off: README screenshot table for the redesigned player (kept for provenance)."""
import os, re
ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", ".."))
p = os.path.join(ROOT, "README.md")
t = open(p, encoding="utf-8").read()
cells = [
    ("01-create.jpg", "Create screen", "Create", "name, occasion, style"),
    ("02-name-input.jpg", "Typing a name", "Name input", ""),
    ("03-generating.jpg", "Generating the song", "Generating", "real step and elapsed time"),
    ("04-song-ready.jpg", "Completed song", "Song ready", "one record, waveform, play"),
    ("05-playback.jpg", "Playing", "Playback", "pause, replay, seek"),
    ("06-saved.jpg", "Saved to Music", "Save and share", "icon-only actions"),
]
def cell(f, alt, title, sub):
    s = f"<b>{title}</b>" + (f"<br>{sub}" if sub else "")
    return f'    <td align="center"><img src="docs/screenshots/{f}" width="200" alt="{alt}"><br><sub>{s}</sub></td>'
rows = ["<table>", "  <tr>"] + [cell(*c) for c in cells[:3]] + ["  </tr>", "  <tr>"] + [cell(*c) for c in cells[3:]] + ["  </tr>", "</table>"]
t = re.sub(r"<table>.*?</table>", "\n".join(rows), t, count=1, flags=re.S)
open(p, "w", encoding="utf-8", newline="\n").write(t)
print("ok")
