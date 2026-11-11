"""Updates NOTICE files for the Vinyl record and the Material icon paths (one-off, kept for provenance)."""
import os, shutil

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", ".."))
ICONS = (
    "\n## Material icons\n"
    "The vector icon paths in `src/killa/icons.tsx` (back, replay, save, saved, share, play, pause, close, more) are Google Material icons, "
    "Apache License 2.0 (https://github.com/google/material-design-icons).\n"
)
for rel in ("NOTICE.md", os.path.join("modules", "killa-ui", "NOTICE.md")):
    p = os.path.join(ROOT, rel)
    t = open(p, encoding="utf-8").read()
    t = t.replace("`Skin.java`, `Ui.java`, `StaffProgress.java`, `Deck.java` (adapted from `PlayerView.java`)", "`Skin.java`, `Ui.java`, `StaffProgress.java`")
    t = t.replace("and `RecordSpin.java` (drawing taken from PlayerView)",
                  "and `Vinyl.java` (NameSinger code: it uses the rim of the record artwork and draws the grooves, label and gloss itself, so no lettering is shown)")
    if "## Material icons" not in t:
        t += ICONS
    open(p, "w", encoding="utf-8", newline="\n").write(t)
shutil.copy(os.path.join(ROOT, "NOTICE.md"), os.path.join(ROOT, "modules", "killa-ui", "android", "src", "main", "assets", "licenses", "NOTICE.md"))
print("notices updated")
