# Model size and performance baseline (the demo baseline; nothing here was changed)

Measured on a Nothing A001 (Dimensity 7300 Pro, 4x A78 + 4x A55, 7.6 GB RAM, Android 16), CPU only, 11 Nov 2026.

## Sizes and quantization
| File | Size (bytes) | Format | Notes |
|---|---|---|---|
| `YuE2-3B-Q5_K_M.gguf` | 2,622,936,832 (2.62 GB) | Q5_K_M | 3.6B-parameter backbone (two transformer halves: AR writes score and tokens, NAR paints audio), 627 tensors |
| `YuE2-Vae-F32.gguf` | 530,497,344 (0.53 GB) | F32 | decoder to 48 kHz stereo |
| Total download | 3.15 GB | | stored in the app's private `files/models/` |
| APK (arm64 debug, standalone) | ~51 MB | | engine libs ~9.6 MB inside |

## Runtime (measured; sampled every 10 s over the session, so approximate)
- Engine resident memory 0.5 to 2.5 GB (includes memory-mapped model pages, so this is not a true peak); free system memory fell to a minimum of 1.35 GB.
- CPU about 380% average, 456% max (the engine defaults to 4 threads; Killa's "gentle" throttling is not used).
- Battery-sensor temperature 34 to 40 degrees C over the runs. Not measured: VmHWM peak RSS, battery drain on battery power.

## Timings (unthrottled, 4 render steps)
- Sam, 12.1 s of audio, manual engine run: 175 s and 211 s. Engine log breakdown: load LM 3.7 s; prefill 9 to 10 s; melody tokens 44.8 s (147 ms per token); load NAR 1.5 s; **NAR render 108 to 138 s (27 to 35 s per step)**; VAE decode 14.5 to 20.6 s; MP3 0.7 s.
- In the app: Sam 2:59 (12 s song), Emma 2:53 (11 s song).
- Render-step test, same tokens re-rendered (Sam, replay only): 2 steps 106 s, 3 steps 135 s, 4 steps 181 s (full run), 6 steps 240 s. About +27 s per step.
- Earlier throttled numbers (Killa gentle mode on) were 8 to 17 minutes and should not be used.

## Smaller quantization options (documented, none attempted)
- Published backbone variants: Q8_0 3.81 GB, Q6_K 2.94 GB, **Q5_K_M 2.62 GB** (current, the smallest).
- yue2.cpp's own `quantize.sh` states the backbone stops at Q5_K_M: "an audio code LM breaks below Q5", so Q4_K_M and lower are not supported by the authors.
- The VAE is never quantized by design ("its weights carry the audio"). An F16 VAE would be about half the size (about 265 MB) but is unverified and the engine does not document it.
- Largest realistic saving without a new model: about 0.27 GB (VAE F16), at unknown quality risk. Not worth pursuing before the pronunciation work.

## Risks of any change, and the required comparison
Any replacement must be compared against this baseline on the same names, seeds and render steps for: audio quality (human listening), name intelligibility, generation time, peak memory (VmHWM) and crash rate. Until then the current files stay as they are.

## Pipeline frozen during the UI refinement
Not modified in this task: model files, quantization, VAE, the native engine and its C++ runtime, engine process management (`YueEngineModule.kt` start/stop/generate), model paths, generation configuration (`src/song/songRequest.ts`: seeds, 4 steps, Pop tags, ABC score builder), the audio pipeline. Only presentation code changed (`src/killa`, `modules/killa-ui`, and `src/song/progress.ts`, which parses log lines for display).
