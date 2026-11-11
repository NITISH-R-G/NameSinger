# Killa YuE design system (reused)

The artwork, typefaces and several Java classes in this module come from **Killa YuE** (https://github.com/JackKnifeAI/killa-yue),
Copyright 2026 JackKnifeAI (Killa Studio project).

- Source files `ai/jackknife/killayue/Skin.java`, `Ui.java`, `StaffProgress.java`, `Deck.java` (adapted from `PlayerView.java`):
  Apache License 2.0 (see LICENSE-Apache-2.0.txt). **Changes:** Skin.java is reduced to the built-in Killa Gold skin (community-skin loading removed);
  Ui.java keeps the label, field, button and plate builders; Deck.java replaces the host activity with its own MediaPlayer and shows only the
  controls NameSinger needs; StaffProgress.java is unmodified.
- Images `assets/skins/gold/*.png` and `assets/killa/wall.jpg`: part of the Killa YuE repository. The project states its artwork was generated
  with an image model and edited by hand, and the repository is Apache-2.0.
- Typefaces `Killa Gel Bold Script` and `Killa Meridian Text`: SIL Open Font License 1.1 (see LICENSE-Killa-Typefaces-OFL-1.1.txt).
  The fonts are bundled unmodified.
- "Killa YuE" is the name of an independent project; NameSinger is not affiliated with or endorsed by it. The Killa YuE logo/title art is NOT used.
