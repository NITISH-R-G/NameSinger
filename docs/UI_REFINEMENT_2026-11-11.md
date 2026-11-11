# UI refinement: NameSinger identity on the Killa Gold language (11 Nov 2026)

Final APK: `.native-build/namesinger-final/NameSinger-namesinger-final-debug-arm64.apk` (standalone arm64 debug).
Rollback APKs kept: `namesinger-killa/` (previous Killa-literal build), `namesinger-gold-v1-rollback/` (first gold build). Approved APKs unchanged.

## What changed
**Identity.** No Killa YuE text or lettering is visible. The title, the Killa YuE logo art and the logo lettering baked into the record artwork are gone: the record
(`dial.png`) gets a fresh vinyl face and a plain gold centre label painted over the lettering at load (`Skin.withoutLettering`), inside the original gold rims.
The unrelated "Voice assistant" link, the status label and the idle "Nothing playing" deck are removed. Credit lives in `NOTICE.md`, the licence texts bundled in the APK
(`assets/licenses/`) and the model-licence line on the Create screen.

**Hierarchy.** One gilded plate per screen, only on the primary action. Secondary actions are Killa's pill chips (as Killa uses for Undo/Redo/Save); Cancel and
"Make another song" are text links. Occasion and Style are single segmented controls with a clear selected segment. Script type is used only for the wordmark; all readable text
is Killa Meridian. Margins are a consistent 20dp; type scale is 30 (wordmark), 22 (heading), 18 (stage title), 14 (body), 12 (fine print).

**Create.** Wordmark, "Who is the song for?", name field, Occasion, Style (optional, Pop by default), Generate song. The keyboard no longer opens on launch.

**Generating.** The record and the staff are kept and made more legible (staff 96dp, ghost notes brighter, slower lap). Progress is honest: "Step N of 4", the stage name,
a real "Render pass n of 4" count where the engine reports one, and elapsed time. There is no percentage.

**Done.** "Happy birthday, NAME", the Killa deck drawn 1.5x without its decorative level bars, labelled Replay / Save / Share, and a text link for another song.

## Frozen (not modified)
Verified against milestone commit `115a112`: `modules/yue-engine/**` and `src/song/songRequest.ts` have an empty diff; the five engine libraries in both APKs have identical SHA-256
(`libyueserver_portable.so` 39A6F4F3BBB8..., `libyuecxx.so` B5D97C38A728..., `libkyggml*.so`, `libkycpu-*.so`). `src/song/useSongGeneration.ts` changed only in the type of the
display-only progress value. Model files, model paths, generation configuration, seeds, steps (4) and the ABC score builder are untouched.

## Verified on the Nothing A001 (11 Nov 2026)
Initial screen; keyboard (opens only when the field is tapped, Generate stays visible above it); name entry (Emma, typed per character); Occasion; Style (Dance selected); Generate;
generating screen at three stages (melody, render pass 1, render pass 3); completed screen; playback; Replay (restarts from 0:00, pause icon shown); Save
(`Music/NameSinger/NameSinger Emma birthday song.mp3`, 256,128 bytes); Share (system chooser opened; no recipient chosen). Generation: Aarav (Acoustic) 3:05, Emma (Dance) 4:08 (a 16 s song).
Not human-listened: pronunciation of any name (see `DELIVERY_2026-11-11.md`).

## Known limitations
- Pronunciation is unsolved; the recogniser screen earlier heard "Anna" for Emma. Only human listening can judge.
- Generation takes 3 to 4 minutes; the app must stay open. Backgrounding is untested.
- Models are not downloadable in the app; they are copied into `files/models/`.
- Occasion has one option (Birthday); the control is real but there is nothing else to choose yet.
- The app icon is still the Expo template icon (not designed in this task).
- Rendering uses Killa's native Java views, so Android's font scaling affects the native plates and the React Native text differently.
