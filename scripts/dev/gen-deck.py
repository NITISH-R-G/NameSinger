"""One-off generator: adapts Killa YuE's PlayerView.java into modules/killa-ui/.../Deck.java.
The onDraw body and the glyph/tri methods are taken verbatim from the original; only host-activity references change."""
import os

K = r"C:\Projects\Name singer\research-killa-yue\killa-yue\app\src\ai\jackknife\killayue\PlayerView.java"
OUT = r"C:\Projects\Name singer\name-singer\modules\killa-ui\android\src\main\java\ai\jackknife\killayue\Deck.java"
lines = open(K, encoding="utf-8").read().split("\n")

on_draw = "\n".join(lines[90:195])        # body of onDraw, original lines 91-195 (1-indexed), verbatim
tri_glyph = "\n".join(lines[197:239])     # tri() and glyph(), original lines 198-239

on_draw = on_draw.replace("a.playTitle", "playTitle")
on_draw = on_draw.replace("MainActivity.clock(", "clock(")
# one song: only back, play and forward are drawn
on_draw = on_draw.replace(
    "for (int i = 0; i < 5; i++) {\n            bx[i] = w / 2f + (i - 2) * gap;",
    "for (int i = BACK; i <= FWD; i++) {\n            bx[i] = w / 2f + (i - 2) * gap;",
)
assert "for (int i = BACK; i <= FWD; i++)" in on_draw, "transport loop not adapted"
# NameSinger: drop the level bars. In Killa they "follow a made-up pulse, not the audio itself", so they are removed here.
a = on_draw.index("        // level bars on the right")
b = on_draw.index("        // title and time")
on_draw = on_draw[:a] + "        float barsL = w - 20 * dp; // the original's decorative level bars were removed\n\n" + on_draw[b:]
assert "BARS" not in on_draw
assert "a.playTitle" not in on_draw and "MainActivity" not in on_draw

head = open(os.path.join(os.path.dirname(__file__), "deck-head.txt"), encoding="utf-8").read()
tail = open(os.path.join(os.path.dirname(__file__), "deck-tail.txt"), encoding="utf-8").read()
src = head + "    @Override\n    protected void onDraw(Canvas c) {\n" + on_draw + "\n    }\n\n" + tri_glyph + "\n" + tail
open(OUT, "w", encoding="utf-8", newline="\n").write(src)
print("wrote", OUT, len(src.split("\n")), "lines")
