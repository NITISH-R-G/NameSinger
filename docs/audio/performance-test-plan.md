# NameSinger: low-end Android performance test plan

- **Date:** 2026-11-07
- **Goal:** know, with measurements, whether the on-device song pipeline is acceptable on resource-constrained phones, **before** claiming compatibility. No claim of universal device support is made.

## 1. What has been measured so far (and what has not)

| Metric | Result | Where | Weight of the evidence |
|---|---|---|---|
| Render time, desktop Node (V8 with JIT) | 0.14 to 0.27 s per 22 s song (first run 0.3 to 0.56 s) | Compiled TypeScript, six real speech samples, five runs each, machine under load | Measured, not a phone |
| Render time, Hermes on Android 15 emulator (x86_64, 2.5 GB RAM, host CPU) | **2.2 to 2.4 s** | App's own report in the UI ("Made on this phone in 2447 ms", later 2200 ms) | Measured on an emulator, **not real ARM hardware**; Hermes has no JIT, so this is roughly 10 to 15 times slower than desktop Node |
| Native heap during a render | about **+8 MB** (155.5 to 163.9 MB) | `dumpsys meminfo` sampled at 0.4 s intervals | Measured, coarse; whole Expo Go process, so includes dev tooling |
| Output size | **0.97 MB** for 22.8 s (16-bit mono WAV, 22.05 kHz) | File size arithmetic confirmed by the player's 0:22 duration | Measured |
| Playback | 22 s song played to 0:17+ without error; one AudioTrack active | Emulator, `dumpsys audio` | Measured once; no stability run |
| CPU utilization, battery, thermals | **Not measured** | Emulators do not model them | Unknown |
| Real low-end ARM phones | **Not tested** | None available here | Unknown |

## 2. Budgets proposed for approval

| Metric | Budget | Reason |
|---|---|---|
| Render time on a low-end phone (2 to 3 GB RAM, Cortex-A53-class) | at most **6 s** | A progress state is shown, but waits over about 6 s feel broken |
| Render time on a mid-range phone | at most **2 s** | |
| Added peak memory (PSS delta) during render | at most **60 MB** | Leaves room on 2 GB devices; current estimate is under 15 MB |
| Output size | at most **1.2 MB** for a 22 s song (or switch to AAC) | Sharing and storage |
| Playback | no underruns, no crash over a 10-minute looped playback | |
| Battery | at most **1% per 10 songs** (to be confirmed by measurement) | A guess to be replaced after the first device run |
| Cleanup | no leftover voice file after reset, re-record or restart | Privacy |

## 3. Devices

Test on **at least three** physical Android devices, and record their exact model and OS build:

1. **Low-end:** 2 GB RAM, Android 10 to 12, quad-core Cortex-A53 or Unisoc/Helio-class, 32 GB storage. This is the pass/fail device.
2. **Mid-range:** 4 GB RAM, current Snapdragon 6xx/7xx.
3. **High-end:** a flagship, as a ceiling reference.

The emulator remains useful for functional checks, not for speed claims.

## 4. Test cases

**Inputs (create a fixed corpus and keep it in a private folder, not in Git):**
- 10 names, including short (Om), long (Venkatasubramanian), uncommon and non-English-origin names, in all 10 supported languages' scripts when spoken.
- 5 speakers (low male, high female, child if appropriate, accented, soft-spoken).
- Conditions: quiet room, fan noise, street noise, mic held at 10 cm and 40 cm, a 1 s clip and a 10 s clip with a long pause.

**Per input, record:** render time (the app already reports stage timings), pitch estimate, applied shift per slot, whether any slot was clamped, peak and RMS of the output, and whether any warning appeared.

## 5. How to measure (commands)

Run each three times after a cold start and report the median.

```bash
# Render time: read the app's own report ("Made on this phone in N ms") or the stage timings in the render report.
# Memory: sample every 250 ms while pressing "Create my song".
adb shell dumpsys meminfo host.exp.exponent        # use the package name of the development build instead of Expo Go
# Frame drops and CPU: Perfetto trace of one render
adb shell perfetto -o /data/misc/perfetto-traces/trace.pftrace -t 20s sched freq idle am wm gfx view binder_driver hal dalvik camera input res memory
# Battery: reset stats, run 20 songs with the screen on, then read the delta
adb shell dumpsys batterystats --reset
adb shell dumpsys batterystats --charged <package>
# Thermal
adb shell dumpsys thermalservice
# Playback stability: loop a 22 s song for 10 minutes with the screen off, then check for underruns
adb shell dumpsys media.audio_flinger | grep -i underrun
```

Use a **development build in release mode** for the final numbers; Hermes bytecode and the dev tooling in Expo Go distort speed and memory.

## 6. Scenarios beyond the happy path

- Take a phone call or notification sound during recording and during rendering.
- Background the app mid-render; confirm the file is cleaned up.
- Rotate or change font size during the render.
- Kill the app mid-render and during playback; reopen and confirm the leftover-file sweep ran.
- Low storage (fill the device to under 100 MB free).
- Bluetooth headphones connected and disconnected during playback.
- Silent mode on (the audio mode is set to play in silent mode only while recording; the song playback path should be checked).
- Ten renders in a row without restart, watching memory growth.

## 7. Decision rules after the first device run

| Result on the low-end device | Action |
|---|---|
| Render at most 6 s and memory within budget | Ship the TypeScript pipeline |
| Render over 6 s | Profile first. Candidate fixes in order: (1) cache one fit for slots with equal pitch and length; (2) reduce the WSOLA search width; (3) native Kotlin/C++ time stretch behind the same interface |
| Memory over budget | Process the song in chunks or lower the sample rate |
| Output size over budget | Add AAC encoding (needs a development build and a native encoder) |
| Crashes or glitches | Fix before any compatibility claim |

## 8. Reporting

Fill one row per device: model, RAM, OS, build type, median render ms, memory delta MB, battery delta, size, playback result, issues. Until that table exists for real devices, the supported statement is: "Works on an Android 15 emulator with 2.5 GB RAM; real-device performance is untested."
