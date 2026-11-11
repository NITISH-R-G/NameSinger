# Third-party notices

## Killa YuE (https://github.com/JackKnifeAI/killa-yue), release 1.8.1
Copyright 2026 JackKnifeAI (Killa Studio project). Licensed under the Apache License 2.0 (`modules/killa-ui/LICENSE-Apache-2.0.txt`).
Used in this repository:
- `modules/killa-ui/android/src/main/java/ai/jackknife/killayue/{Skin,Ui,StaffProgress,Deck}.java` (Deck adapted from PlayerView.java; Skin and Ui reduced; see `modules/killa-ui/NOTICE.md` for the changes) and `RecordSpin.java` (drawing taken from PlayerView).
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
