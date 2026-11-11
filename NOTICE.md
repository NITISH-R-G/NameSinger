# NameSinger notices

## NameSinger source code
Copyright 2026 NITISH-R-G and NameSinger contributors.

The original NameSinger application source in this repository (everything under `src/`, `modules/yue-engine/` Kotlin and TypeScript,
`modules/killa-ui/src/`, `modules/killa-ui/android/.../KillaUiModule.kt`, `Waveform.kt`, `Vinyl.java`, `__tests__/`, `scripts/` and the
documentation) is licensed under the **Apache License, Version 2.0** (see [`LICENSE`](LICENSE)). Files that come from third parties keep their own
licences, listed below. Apache-2.0 applies to the source code only.

> **Not licensed by Apache-2.0: the YuE2 model weights.** They are a separate download, are not part of this repository and are licensed
> **CC BY-NC 4.0 (non-commercial only)**. A company needs a licence from the model authors before offering anything built on them commercially.
> The Apache licence on this application's source does **not** clear the complete product for commercial use.

## Third-party components

## Killa YuE (https://github.com/JackKnifeAI/killa-yue), release 1.8.1
Copyright 2026 JackKnifeAI (Killa Studio project). Licensed under the Apache License 2.0 (`modules/killa-ui/LICENSE-Apache-2.0.txt`).
Used in this repository:
- `modules/killa-ui/android/src/main/java/ai/jackknife/killayue/{Skin,Ui,StaffProgress}.java` (Skin and Ui reduced, StaffProgress adapted; see `modules/killa-ui/NOTICE.md` for the changes) and `Vinyl.java` (NameSinger code: it uses the rim of the record artwork and draws the grooves, label and gloss itself, so no lettering is shown).
- Artwork under `modules/killa-ui/android/src/main/assets/skins/gold/` and `assets/killa/wall.jpg`.
- Prebuilt arm64 engine libraries from the release APK under `modules/yue-engine/android/src/main/jniLibs/arm64-v8a/`
  (`libyueserver_portable.so`, `libkyggml*.so`, `libkycpu-*.so`, and the engine's C++ runtime renamed `libyuecxx.so`), unmodified.
  The engine is yue2.cpp by ServeurpersoCom (MIT) with Killa's patches; ggml is MIT.

## Typefaces
Killa Gel Bold Script and Killa Meridian Text, Copyright 2026 JackKnifeAI, SIL Open Font License 1.1
(`modules/killa-ui/LICENSE-Killa-Typefaces-OFL-1.1.txt`), bundled unmodified.

## YuE2 model weights (not distributed here)
YuE2 by M-A-P, GGUF conversions by Serveurperso. Licensed CC BY-NC 4.0: non-commercial use only; individuals may use and monetise what they
generate, companies need a licence from the authors. Downloaded separately; never committed.

## Material icons
The vector icon paths in `src/killa/icons.tsx` (back, replay, save, saved, share, play, pause, close, more) are Google Material icons, Apache License 2.0 (https://github.com/google/material-design-icons).

## Expo and the project template (MIT)
The project was created from the Expo template. Template-derived files and the Expo / React Native packages installed from npm remain under
their own licences (mostly MIT). The Expo licence text is kept verbatim in [`licenses/Expo-MIT.txt`](licenses/Expo-MIT.txt):
Copyright (c) 2015-present 650 Industries, Inc. (aka Expo). Other npm dependencies carry their own licence files in `node_modules`.

## Modifications to third-party material
- Killa YuE `Skin.java`, `Ui.java`, `StaffProgress.java`: reduced / adapted as listed in `modules/killa-ui/NOTICE.md`.
- Killa YuE engine libraries: unmodified. Typefaces: unmodified. Artwork: used as is, with the lettering covered by NameSinger's own `Vinyl.java` drawing.
