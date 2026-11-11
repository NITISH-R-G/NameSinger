# Recording validation: how the thresholds were chosen

Code: `src/audio/recordingQuality.ts` (the check), `src/hooks/analyzeTake.ts` (reads the file), `src/hooks/recordingController.ts` (holds an unusable take). Tests: `__tests__/recordingQuality.test.ts`, `__tests__/recordingOnboarding.test.ts`.

## What changed

Before: a take only had to be a non-empty file of at least 300 ms. A silent take was approved, and failed later at "Create my song".

Now: when the user stops recording, the take is checked with the **same voice detector the song renderer uses** (`trimToVoiced`, same settings). A take that passes cannot then fail the render for lack of a voice. A take that fails is kept, can be played back, and is replaced only when the user taps Record again (nothing is discarded without an explicit action). `Use this recording` is not offered for it, and the reducer refuses `APPROVED` from that state.

Quietness alone never rejects a take. The decision is whether a voice stands clearly above **that take's own background noise** (12 dB above the estimated noise floor for at least 80 ms, at least 0.25 s of voice after trimming). A quiet but clear voice is accepted and shown the note "That was quiet. It will work, but a closer recording sounds better."

## The one value that changed: the absolute floor

`trimToVoiced` had an absolute floor of -50 dBFS (frame RMS) under its noise-relative threshold. Measured below, that floor rejected clear speech that was simply quiet. It is now -62 dBFS (`VOICE_TRIM_OPTIONS`), used by both the check and the renderer. Nothing else in the audio pipeline changed.

## What was measured, and on what

**Material (be careful what this does and does not show):**
- 12 speech clips: Windows OS text-to-speech (Microsoft David and Zira) saying six Indian names (Aarav, Priya, Meenakshi, Nitish, Arjun, Ananya), 22,050 Hz, 16-bit mono. **These are synthesized, not recordings of people.**
- Each clip was scaled to a chosen peak level (-3 to -60 dBFS) and placed in a take with 0.5 s of lead and 0.6 s of tail, over a synthetic room-noise bed (white, low-frequency "brown", and 100 Hz hum) at -90 to -20 dBFS RMS, then quantised to 16 bits like the real recorder.
- Noise-only and transient cases: digital zero, 1-LSB dither, steady noise, a 20 ms click, a 40 ms tap, a 60 ms cough, a 70 ms thud, 150 to 300 ms breath-like bursts.
- One real take from the Android emulator's microphone: **digital silence**. It was caught as "silent" (see Emulator below). The emulator offers no real microphone input, so it gave no speech.
- The measurement scripts lived in a scratch folder and are not part of the repo. The unit tests reproduce the key cases with the repo's own synthetic voice.

**Result 1: speech accepted (of 12) by absolute floor, quiet room, by speech peak**

| Speech peak (dBFS) | floor -50 (old) | -56 | **-62 (new)** | -68 |
|---|---|---|---|---|
| -30 | 12/12 | 12/12 | 12/12 | 12/12 |
| -40 | **0/12** | 5/12 | 12/12 | 12/12 |
| -45 | 0/12 | 0/12 | about 6/12 | 12/12 |
| -50 | 0/12 | 0/12 | 0/12 | 11/12 |
| -55 and below | 0/12 | 0/12 | 0/12 | about 0/12 |

With the old floor, speech peaking at -40 dBFS was rejected even in a silent room. Real voices may have a different peak-to-RMS gap than this synthetic speech (about 17 dB here), so absolute levels for real voices will differ; the shape of the result is what matters.

**Result 2: the floor does not affect false accepts.** Across 138 no-speech trials (white, brown and hum noise from -90 to -30 dBFS, plus clicks, taps, coughs, thuds and breath-like bursts in quiet rooms), the same 6 were falsely accepted at every floor tested: soft breath-like bursts of 150 and 300 ms at -40 and -45 dBFS. Steady noise, hum, dither and silence were never accepted. A soft breath of that length is indistinguishable from a soft spoken name by energy alone; this check cannot tell them apart, and that is a known limit.

**Result 3: background noise tolerance (unchanged by this work).** A voice must be at least 12 dB above the take's noise floor. In the test (white noise), a voice peaking at -30 dBFS passed up to about -60 dBFS room noise and failed at -50; a voice peaking at -12 dBFS passed up to -50 and about half passed at -40. Low-frequency noise is easier because the high-pass filter removes it. Noisy rooms are refused with "We couldn't pick your voice out from the background" rather than producing a song with noise in it.

**Result 4: quiet voices vs the 24 dB boost.** The renderer raises a name to a target level but never by more than 24 dB. Voiced RMS about -48 dBFS or lower cannot reach the target, so the name will sit below the music. That level is `QUIET_VOICE_RMS_DB` and only triggers the advisory note, never a refusal.

## Decisions

| Item | Value | Why |
|---|---|---|
| Absolute floor | -62 dBFS | Accepts quiet clear voices; below -62 the name would be 20+ dB under target even after the maximum boost |
| Noise margin | 12 dB (unchanged) | Existing, keeps noisy takes out |
| Minimum voiced length | 0.25 s (unchanged, now shared with the renderer) | Same rule at check and render time |
| "Silent" classification | take peak below -66 dBFS | Separates "mic covered or muted" from "voice not clear" for a more useful message |
| "Quiet" advisory | voiced RMS below -48 dBFS | Where the 24 dB boost stops reaching the target |

## Emulator verification

On the Android 15 emulator (Expo Go) a real 9 s take through the app's recording path contained no signal: the app reported "We couldn't hear anything. Make sure nothing is covering the microphone, then record again.", kept the take playable, and offered only Record again.

## Not verified / limits

The plan for collecting real-voice evidence, and the rule for when a threshold may change, is in `real-voice-validation-protocol.md`. Until it has been run, the thresholds above stay as they are.

- **No recordings of real people** at different distances, in real rooms or on real phone microphones. Thresholds are justified by synthetic speech and synthetic noise. They should be re-checked on a physical device with several voices before relying on them.
- No physical Android device and no iOS device.
- The emulator image has no root access, so recorded files could not be copied off it for analysis.
- Whether the "unusable" rate is acceptable cannot be known without collecting data. No analytics are implemented (see `onboarding-analytics.md`).
