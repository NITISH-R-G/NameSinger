# NameSinger: native capability and framework decision

- **Date:** 2026-11-07
- **Question asked:** is Expo (SDK 58, React Native 0.88) enough for high-quality recording, processing, mixing, playback and low-end Android performance, or does the project need React Native Community CLI (bare)?
- **Answer: keep Expo. No blocker was found. Nothing was migrated.** This is the recommendation presented before any migration, as requested.

**Labels.** *Verified here* = I ran it in this repository (emulator or Node). *Verified (docs/source)* = read from the installed package or official docs, not run. *Estimate* = reasoning, no measurement.

## 1. Capabilities required, and how each is met today

| Capability | How it is done now | Native code written? | Status |
|---|---|---|---|
| Microphone permission | `requestRecordingPermissionsAsync` (expo-audio) | No | **Verified here**: real Android dialog |
| Recording to PCM | `useAudioStream` -> `startFileRecordingAsync({format:'wav'})` writes a 16-bit mono WAV natively; the JS buffer callback is not used | No | **Verified here** on Android (Expo Go); iOS not run |
| Decode | Not needed: the recording is already WAV; the instrumental is a bundled WAV | No | Verified here |
| DSP (trim, pitch, stretch, reverb, duck, normalize) | Pure TypeScript on `Float32Array` in Hermes (`src/audio/dsp.ts`) | No | **Verified here**: 2.2 to 2.4 s per song on an emulator |
| Mix and encode | JS mix, 16-bit WAV writer | No | Verified here; output is a 0.97 MB WAV for 22 s |
| Playback | `useAudioPlayer` (expo-audio) from a file URI | No | **Verified here**: the 22 s song played |
| File I/O | `expo-file-system` `File` (`bytes()`, `write()`, `delete()`), `expo-asset` | No | Verified here (`write()` is async; this caused a real bug, now fixed) |
| Background audio, notifications | Not required by the product | No | Not needed |
| Local AAC/MP3 export | Not needed for the demo (WAV plays and is 1 MB) | No | Open, see section 4 |

**Everything the demo needs runs in Expo Go today with zero custom native code.** A development build is *not* needed for the current feature set.

## 2. What the research found about native options (verified from package files and docs)

- **expo-audio 58.0.11:** Android recording is `MediaRecorder` only (formats: default, 3gp, mpeg4, amrnb, amrwb, aac_adts, mpeg2ts, webm; no WAV or PCM). iOS can record linear PCM. The audio stream API is the route to PCM on both platforms (and what we use). It has **no decode-to-PCM and no buffer encoder**.
- **react-native-audio-api 1.0.0** (Software Mansion, MIT): `decodeAudioData` from a file URI (Android: MediaExtractor and MediaCodec in C++), an `OfflineAudioContext` for rendering a mix, but no pitch-preserving time stretch, no buffer-to-file writer, and it needs a development build (C++/JSI). Not needed today because we avoid decoding.
- **ffmpeg-kit** is retired (npm marks `ffmpeg-kit-react-native` deprecated; the fork is a maintenance risk and adds tens of MB). Not used.
- **A local Expo module in Kotlin/Swift** (`npx create-expo-module --local`) is supported by Expo's Modules API and autolinking, and needs a development build. A MediaCodec decode would be about 100 lines (estimate).

## 3. Expo development build versus bare React Native

| Concern | Expo (CNG + development build + local modules) | Bare (Community CLI) |
|---|---|---|
| Custom Kotlin/Swift modules | Supported (local Expo modules) | Supported |
| JSI / TurboModules / C++ | Supported (Expo modules, New Architecture on by default) | Supported |
| Gradle, NDK, ProGuard edits | Through config plugins or `expo-build-properties`; native folders are generated and gitignored | Edit directly |
| New Architecture | Default in RN 0.88 | Default |
| Native libraries that are not Expo modules | Work in a development build (not in Expo Go) | Work |
| Release builds, signing | EAS or local `expo run:android --variant release` | Gradle |
| Windows development | Android fully local; iOS needs EAS or a Mac in either approach | Same |
| What bare adds | Nothing required by NameSinger's audio features | Full manual native-project ownership |

**Concrete limitations found (not theoretical):**

1. **Expo Go cannot load custom native modules.** True, but irrelevant until we add one. If we do, use a development build; this is not a reason to leave Expo.
2. **iOS cannot be built on this Windows machine** (any approach). Needs EAS cloud builds or a Mac. EAS free-tier limits were only found in a third-party source; the official pricing page returned 404 for the researcher, so treat the limits as unverified.
3. **This machine's local Android build toolchain is partly ready:** the Android SDK is at `C:\Users\nitis\AppData\Local\Android\Sdk` (platform-tools, build-tools, cmake, ndk, platforms 36.1 and 37.0, system images 35 and 36.1). The Java on the PATH is **1.8, too old** for React Native 0.88; Android Studio's bundled JBR exists (version not checked) and should be used via `JAVA_HOME` for a local build. **A local development build was not attempted.**
4. **The emulator is unstable at 3 GB and an Android 36.1 image** (the package service crashed during a 225 MB install); the Android 35 AVD with 2.5 GB worked. Host memory was tight (about 2 GB free of 15.7 GB while running the emulator, Metro and a browser).

## 4. When native code would be justified

Add native code only when a measurement says so, and only for the part that measures slow:

| Trigger | Native step | Why not now |
|---|---|---|
| Render time on target low-end phones is above the budget (proposed: 6 s) | Move `timeStretch` and `reverbWet` (the heavy loops) into a small Kotlin or C++ local Expo module (JSI), keeping the same TypeScript interface | Measured 2.2 to 2.4 s in Hermes on an emulator; no real low-end phone has been measured yet |
| AAC/MP3 output is needed for sharing or size | MediaCodec AAC encode in a local module, or `react-native-audio-api` | The WAV is 0.97 MB; sharing is not in scope |
| Recorded audio from other sources needs decoding (for example imported voice notes) | MediaExtractor/MediaCodec decode module, or `react-native-audio-api` | Not in the product flow |
| Formant-preserving pitch shift is wanted | Rubber Band or WORLD in C++ (GPL-2.0 for Rubber Band: licensing review needed) | Quality question for listening tests first |

Because the DSP is behind `renderPersonalizedSong(...)`, the replacement is a drop-in.

## 5. Decision rule applied

- *If Expo development builds provide all required native capabilities, retain the project and use custom native modules where necessary.* -> **Met.** Retained.
- *If Expo introduces a genuine blocker, migrate.* -> **No blocker found.**
- *Do not retain Expo merely for convenience; do not migrate merely to use bare.* -> Followed.
- *Do not sacrifice audio quality, performance or compatibility.* -> Nothing was traded away; the one real risk (JS speed on low-end phones) has a defined native escape hatch and a test plan ([performance-test-plan.md](performance-test-plan.md)).

## 6. Recommendation

1. **Stay on Expo SDK 58.** No migration, no rewrite.
2. **Keep using Expo Go for daily work** until a native module is actually added, then switch to a development build (`npx expo run:android` with `JAVA_HOME` pointed at Android Studio's JBR).
3. **Measure first** on two or three real low-end Android phones. Only if the render exceeds the budget, build a Kotlin/C++ time-stretch module.
4. **Plan for iOS through EAS** if iOS is in scope; nothing in the audio design is Android-specific (the stream API and file APIs exist on both platforms, but iOS behaviour is untested).
