# Killa YuE design system (reused)

The artwork, typefaces and several Java classes in this module come from **Killa YuE** (https://github.com/JackKnifeAI/killa-yue),
Copyright 2026 JackKnifeAI (Killa Studio project).

- Source files `ai/jackknife/killayue/Skin.java`, `Ui.java`, `StaffProgress.java`: Apache License 2.0 (see LICENSE-Apache-2.0.txt).
  **Changes:** Skin.java is reduced to the built-in Killa Gold skin (community-skin loading removed); Ui.java keeps the label, field,
  button and plate builders; StaffProgress.java: lap time 11s -> 16s, staff height 72dp -> 96dp, ghost-note opacity 70 -> 140 (readability).
- `Vinyl.java` is NameSinger code. It uses the gold rim of Killa's record artwork and draws the grooves, label and gloss itself, so none of
  the original lettering is shown.
- Images `assets/skins/gold/*.png` (including `round.png`, also copied to the app's `assets/killa/`) and `assets/killa/wall.jpg`: part of the
  Killa YuE repository. The project states its artwork was generated with an image model and edited by hand, and the repository is Apache-2.0.
- Typefaces `Killa Gel Bold Script` and `Killa Meridian Text`: SIL Open Font License 1.1 (see LICENSE-Killa-Typefaces-OFL-1.1.txt).
  The fonts are bundled unmodified.
- "Killa YuE" is the name of an independent project; NameSinger is not affiliated with or endorsed by it. The Killa YuE logo and title art are NOT used.

## Material icons
The vector icon paths in `src/killa/icons.tsx` (back, replay, save, saved, share, play, pause, close, more) are Google Material icons, Apache License 2.0 (https://github.com/google/material-design-icons).
