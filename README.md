# NameSinger

Type a name, pick an occasion, and your phone sings a personalised birthday song. The song is generated **entirely on the device**
(Android, CPU) by the YuE2 model; there is no server and no per-song cost.

Status: working prototype on a Nothing A001 (Dimensity 7300 Pro, 8 GB). Not cleared for commercial distribution (see Licences).

## How it works
- React Native / Expo SDK 58 app (`src/`, routes in `src/app`).
- `modules/yue-engine`: a local Expo module that bundles the prebuilt CPU song engine from the Killa YuE 1.8.1 release and runs it as a
  child process, talking to its documented HTTP API on 127.0.0.1. Models are **not** in git: `YuE2-3B-Q5_K_M.gguf` (2.62 GB) and
  `YuE2-Vae-F32.gguf` (530 MB) must be placed in the app's private `files/models/` folder.
- `modules/killa-ui`: native views built from Killa YuE's Apache-2.0 UI classes and artwork (Killa Gold design language).
- The score and lyrics for a name are built in `src/song/songRequest.ts` (golden-tested against the Python reference in `__tests__`).

## Build (Windows)
`scripts/build-gold-apk.ps1` mirrors the project to `C:\n` (Windows path-length limit), regenerates `android/` with `expo prebuild`
and builds a standalone arm64 debug APK into `.native-build/<name>/`. See `docs/DELIVERY_2026-11-11.md` for measured timings and limits.

```
npm ci
npx tsc --noEmit && npx jest
powershell -File scripts\build-gold-apk.ps1
```

## Licences
- NameSinger source: see `LICENSE`.
- **YuE2 model weights: CC BY-NC 4.0** (non-commercial). A company needs a licence from the model authors. Not included in this repository.
- Killa YuE UI classes, artwork and the prebuilt engine libraries: Apache-2.0, Copyright 2026 JackKnifeAI. Typefaces Killa Gel / Killa Meridian: SIL OFL 1.1.
  Details and the list of changes: `NOTICE.md` and `modules/killa-ui/NOTICE.md`.
- NameSinger is independent of, and not endorsed by, Killa YuE or the YuE2 authors.
