# NameSinger: audio architecture decision

- **Date:** 2026-11-07
- **Status:** decided for the assignment demo; open items listed at the end need owner input
- **Related:** [cost-model.md](cost-model.md), [native-capability-decision.md](native-capability-decision.md), [performance-test-plan.md](performance-test-plan.md), raw research in [research/](research/)

**Labels.** *Measured* = I ran it in this repository (Node, or the Android emulator). *Verified (public source)* = read from an official page or file, retrieved 2026-11-06, not run. *Advertised* = a vendor claim, not tested. *Estimate* = my arithmetic.

## 1. The requirement that decides everything

A personalized song for **under ₹1 per successful generation**, with the **user's name pronounced correctly**, in multiple Indian languages, usable on low-end Android. ₹1 is about $0.0105 at ₹95.25 per dollar (exchange rate from the earlier research notes, an RBI reference dated 2026-10-30; not re-verified).

## 2. What the existing solutions actually offer

| Option | Verified price (public source) | Supplied lyrics with a name | Indian languages | Verdict |
|---|---|---|---|---|
| Mureka v8 on fal | $0.045 per song with lyrics, $0.30 without | Yes (`lyrics` field, up to 5,000 characters) | Not stated on fal; Hindi, Tamil, Telugu unverified | About ₹4.76 per successful song with 10% retries. **4.8x over budget** |
| BlueMetal | $0.0095 per song, prepaid, billed on success | **No lyrics field** (a `lyrics` field returns 400); text goes into a 2,000-character prompt that an LLM rewrites | Site samples English, Spanish, Japanese; Indian languages undocumented | ₹0.90 best case, but names and lyrics cannot be controlled. **Fails the product requirement**, see 2.1 |
| MiniMax Music | $0.15 per track (3.0), $0.03 (2.0) | Yes | Not found | **Closed to new users since 2026-08-20** |
| Sonauto (now Treblo) | $0.06 per song pay-as-you-go | Not verified | Site says Hindi "may be off" | ₹6.35; requires a "Powered by Treblo" link |
| Google Lyria 3.5 | $0.08 per song | Yes | Hindi vocals listed for the original Lyria 3 | ₹8.47 |
| ACE-Step v1 hosted on fal | $0.0002 per second of audio ($0.012 per 60 s) | Yes (free-text lyrics) | Hindi, Tamil, Telugu **not listed** | ₹1.27 per success; quality in Indian languages unknown |

### 2.1 BlueMetal in detail

Sources: bluemetal.ai docs, terms, privacy and OpenAPI spec. I did not sign up or call the API, so everything below is *verified from public pages only*, and the price is **not tested**.

- **Real API, real price.** REST/JSON, bearer key or OAuth. $0.0095 per song, flat, prepaid, charged only on success; $0.10 of free credit. The docs and the homepage disagree on the price of 100 songs ($0.85 versus $0.95). Credit-pack sizes, minimums, Stripe fees, FX and GST were not found.
- **No lyrics control.** Exact lyrics go inside one 2,000-character prompt that an LLM rewrites before generation, so the name can be changed or mispronounced and nothing guarantees it.
- **Songs are 2 to 4 minutes** with no duration control: more storage, and more time for a user to wait. Latency is unpublished (the docs' own example shows 40 s for a 178 s song).
- **Privacy:** every prompt, including lyrics and names, goes through OpenRouter to Meta's Muse Spark model. The terms say prompts and generated text may be used to improve Meta's products, including AI models, and audio is retained 30 days. That conflicts with our consent text, which promises recordings stay on the phone.
- **Commercial terms:** no ownership claim, but no explicit commercial licence or indemnity; outputs may not be copyrightable. No SLA.
- **Company signals:** run by a custom-software studio whose own page lists it as "Enterprise only - contact us". No independent reviews, status page or SDKs were found. The price is described as "near cost", which may not last.

**Conclusion.** ₹0.90 is real only if every first output is usable and no fees apply. With a 50% usable rate it is ₹1.81. Because the name cannot be guaranteed and user text goes to a third-party model, it is not a safe per-user dependency. It is not worth a paid test unless the product direction changes to "generic song, name not guaranteed".

## 3. The three approaches

- **A. Full external AI song generation** per user (one API call per song).
- **B. Pre-rendered song templates with personalized name insertion**, assembled **on the phone** from the user's own recording.
- **C. Fully on-device neural song generation.**

| Criterion | A. External AI per user | B. Template + name insertion (chosen) | C. On-device neural |
|---|---|---|---|
| Cost per successful song | ₹0.90 to ₹8.47 (table above); only BlueMetal is near ₹1 and it fails other criteria | **₹0 marginal**, about ₹0.005 per user if assets are delivered over a paid CDN, plus a one-time ₹229 estimate for base songs (cost-model.md) | ₹0 per song, but about 3.5 GB of weights per user (₹36 of paid-CDN egress per install, estimate) |
| Audio quality | Highest for vocals and lyrics (Suno-class models) | Instrumental quality is whatever we produce offline (real production later); the name is a spoken chant, not a melody | Not credible today (see below) |
| Name pronunciation | Weakest: the model reads text; Indian names unverified for every hosted model | **Best: it is the user's own voice saying their own name** | Same problem as A, plus smaller models |
| Personalization quality | Lyrics can contain the name, but not guaranteed on BlueMetal | Name placed on beat, tuned to the chord, ducked music; lyrics around it are fixed per template | Unknown |
| Latency | Seconds to minutes, network dependent (unpublished for BlueMetal) | **Measured: about 2.2 to 2.4 s** on a 2.5 GB Android 15 emulator running Hermes; about 0.14 to 0.27 s in desktop Node | Estimated tens of seconds to minutes on phones, no phone benchmark found |
| Memory | Negligible on device | **Measured: about +8 MB native heap** during a render (coarse sampling, whole Expo Go process) | Weights alone 3.5 GB or more |
| CPU | Negligible on device | Single JS thread for about 2 s (energy not measured) | Heavy |
| Low-end Android | Works (network only) | Works on the emulator; real low-end ARM phones **not tested** | Not feasible on 3 to 4 GB phones |
| Offline | No | **Yes** | Yes, in theory |
| Privacy | Name, lyrics (and voice if uploaded) leave the phone; BlueMetal may train on them | **Nothing leaves the phone** (matches the consent text) | Nothing leaves the phone |
| Operational complexity | API keys, a backend to hide them, rate limits, retries, spend caps, provider continuity | One TypeScript module; no backend | Model delivery, quantization, native inference runtime |
| Commercial licensing | Varies; some provider terms unclear or restrictive | Our own assets; ffmpeg not used; needs rights to the produced songs | Model licences (ACE-Step is MIT per its card; Stable Audio Open Small has a community licence and cannot sing) |

### Why C is rejected

- ACE-Step 1.5 weights alone are about 3.5 GB (DiT 2.4 GB, text encoder 748 MB, VAE 322 MB plus a 0.6B language model) *estimate from the GGUF listing*, with no ONNX, CoreML or TFLite port and no phone benchmark found. Its advertised "<4 GB" is VRAM on a GPU.
- Stable Audio Open Small (341M) runs on premium Arm phones (about 8 s for 10 s of audio, *advertised*) but its model card says it cannot make realistic vocals.
- On-device TTS (Piper, Kokoro, Supertonic) is speech, not singing. No credible singing model for Indian languages on phones was found.

### Why A is not the per-user path

Every verified route with supplied lyrics costs more than ₹1 after retries, except BlueMetal, which cannot guarantee the name and sends user text to a model that may train on it. Hosted generation is still useful **offline, once per language**, to produce the base songs (a few rupees in total).

## 4. Decision

**B, with the user's own recorded name, assembled on the device.** Per-language base songs are produced offline (by a hosted model, an open model, or a musician), shipped as assets, and personalized on the phone in about two seconds.

- Hosted AI generation (A) is used only for base songs, once, not per user.
- Neural on-device generation (C) is not introduced. No model weights ship.
- The pipeline is a pure TypeScript module (`src/audio/`), so a native or server implementation can replace it later without touching callers.

## 5. The prototype (built and run)

Pipeline in `src/audio/`: `wav.ts` (codec) -> `dsp.ts` (high-pass, silence trim, pitch estimate, pitch shift, time stretch, reverb, ducking, normalize) -> `template.ts` (name slots) -> `renderSong.ts` (assembly) -> `generateSong.ts` (file I/O boundary) -> `useSongGenerator` (UI state machine).

Recording uses expo-audio's native audio stream to write a 16-bit mono WAV directly, so no decoder is needed (native-capability-decision.md).

**How the name is made to sound intentional (steps that exist in code):** trim leading and trailing silence with a noise-floor-aware detector; level the name above the backing; estimate its pitch; tune it by at most 4 semitones to the nearest note of the chord under each slot; stretch it to the slot (capped at 1.5x); add reverb; place it on the beat; duck the instrumental by 6 dB underneath; peak-normalize.

### Verified in this repository

| Check | Result |
|---|---|
| Unit tests (DSP, WAV, template, render, service, state) | Passing, including real-speech and low/high-pitch cases |
| Real speech through the pipeline (Windows David and Zira voices, three names) | Rendered; detected pitch 74 to 170 Hz; every slot within about ±2.5 semitones; peak -1 dB |
| Android emulator (Android 15, 2.5 GB RAM, Expo Go): real microphone permission and WAV capture | **Works**: live timer, saved take, playback |
| Android emulator: silent microphone take through to a song | Shows the friendly "couldn't hear your name" error, as designed |
| Android emulator: test voice -> approve -> create song -> play | **Works**: 22 s song, generated in 2.2 to 2.4 s, played |
| Android emulator: DiceBear mascot (Bottts, generated locally) | Renders correctly in the header |

### Bugs the on-device test found (all fixed)

1. The Android permission dialog reports the app as "background", which discarded the first recording attempt.
2. `File.write()` is asynchronous; the song file was still being written when the player opened it, so the player never finished loading. Fixed by awaiting it; a service-level test now guards that contract.
3. The pitch estimator picked octave errors (found by unit tests).
4. The name was mixed quieter than the backing track (found by measuring levels).

### What I could not assess

- **How natural it sounds.** I cannot listen. Whether a spoken, tuned and reverbed name reads as an intentional hook or as a pasted voice needs people listening. Rendered samples from the Windows voices are in the scratchpad for a listening check (see section 7).
- Real names in real rooms: noise, accents, whispered or very short names. The synthetic voices are clean.
- Real low-end ARM phones: speed, heat, battery.
- iOS: nothing was run on iOS.

## 6. Known limitations of B

1. **A spoken name is not a sung melody.** Pitch tuning plus time stretch can make it sit in the chord, but sustained notes of a tune will not sound sung. The demo template is designed as a chant (name on the beat), which hides this.
2. **Stretching smears consonants.** Long stretches (over about 1.5x) sound drawn out; the cap trades slot length for quality.
3. **Formants shift with pitch** (varispeed resampling), so shifts are capped at ±4 semitones. A formant-preserving shifter would be better and costs more CPU.
4. **The demo instrumental is a synthesized chord loop**, not a produced song. Language-specific songs with sung lyrics around the name do not exist yet.
5. **The language choice does nothing to the audio today**; all languages use the demo template (the UI says so).
6. **The name is not yet pronounced "by" a singer**: a sung-name option (voice conversion) is deliberately not built (licences: Seed-VC is GPL-3.0 and archived; RVC base weights carry a research-only notice).

## 7. Alternatives compared if the chant is not enough

| Alternative | Gain | Cost or risk |
|---|---|---|
| Sung name via voice conversion of the user's recording | A name that follows a melody | GPL or research-only licences, needs a GPU or a big model, short clips are unverified |
| Per-user hosted generation with the name in lyrics | Real singing | Over ₹1 on every verified route, name pronunciation unverified, privacy concerns |
| Native formant-preserving pitch shift (Kotlin/C++) | Better timbre at larger shifts | Needs a dev build and a benchmark first |
| Produced vocal phrases per language with a name gap | Most natural framing around the name | Needs recording sessions per language |

**Listening test (to run before judging quality).** Render each of 10 real names (including difficult ones) from 5 speakers on a phone and on laptop speakers. Have 5 listeners score "sounds intentional" 1 to 5, "name recognisable" yes/no, "audio glitches" yes/no. Keep the stretch cap, shift cap and reverb as the only variables to tune. Command for the existing real-speech check: set `NAMESINGER_SPEECH_DIR` to a folder of WAVs and `NAMESINGER_OUT_DIR` to an output folder, then `npx jest __tests__/renderSong.test.ts`.

## 8. Decisions needing the owner

1. Who produces the per-language base songs (hosted model, open model, or a musician), and who owns the rights.
2. Whether a spoken-chant name is acceptable for the interview demo, or a sung-name experiment is wanted despite the licence and hardware cost.
3. Whether to spend a small amount to test one hosted model (Mureka on fal with lyrics is about $0.045) for base-song quality in Hindi. **No paid call has been made.**
