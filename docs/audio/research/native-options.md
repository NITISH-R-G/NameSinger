# Native audio options (research, 2026-11-06)

Legend: [V] verified from package files/registry in this session; [U] unverified/estimate.

## 1. expo-audio 58.0.11 [V, read .d.ts + Kotlin/Swift]
- Android recorder uses android.media.MediaRecorder only. Output formats: default, 3gp, mpeg4, amrnb, amrwb, aac_adts, mpeg2ts, webm. Encoders: default, amr_nb, amr_wb, aac, he_aac, aac_eld. NO WAV/PCM on Android via the recorder. Controls: sampleRate, numberOfChannels, bitRate.
- iOS recorder: extension/outputFormat/linearPCMBitDepth/IsFloat/IsBigEndian -> WAV/CAF PCM possible on iOS only.
- useAudioStream (AudioStream.types.d.ts): live mic PCM (float32|int16, sampleRate, channels, onBuffer ArrayBuffer) + startFileRecordingAsync({format:'wav'|'pcm'}) -> writes WAV on android+ios. This is the way to RECORD straight to PCM/WAV on Android, avoiding decode entirely. (Not tested on device; real-time stream, not a decoder.)
- Sample listener (setAudioSamplingEnabled / audioSampleUpdate): playback-only, per AudioPlayer. Android impl = android.media.audiofx.Visualizer waveform capture, requires RECORD_AUDIO, emits number[] frames. Lossy 8-bit visualizer data, real-time only. NOT usable to decode a file to PCM.
- No decode-to-PCM API, no encoder/WAV writer for buffers. Playback of a WAV file URI: ExoPlayer/AVPlayer handle WAV [U: not run, but standard].

## 2. react-native-audio-api 1.0.0 (published 2026-11-06, MIT) [V]
- decodeAudioData(input: number|string|ArrayBuffer, sampleRate?) -> AudioBuffer; string = local path/file:// or remote URL. Android native decoder uses NDK AMediaExtractor/AMediaCodec (AndroidDecoding.cpp) + r8brain resampler, so m4a/aac decodes using OS codecs, no ffmpeg. iOS uses OS decoders too [U for iOS detail]. Resamples to requested rate in decode.
- AudioBuffer.getChannelData() gives Float32Array; copyToChannel exists -> JS can process then play via AudioBufferSourceNode.
- OfflineAudioContext(channels, length, sampleRate).startRendering() -> AudioBuffer: renders a mix (gain, biquad, convolver, etc.) to a buffer faster than real time. Nodes include AudioBufferSourceNode (playbackRate = naive pitch+speed coupling, no WSOLA/pitch-preserving time-stretch node found in core list [V list, U semantics]).
- Writing files: only AudioRecorder.enableFileOutput (mic -> WAV/CAF/M4A/ADTS/FLAC/AIFF/ALAC/Opus via AndroidEncoder, MediaCodec) and concatAudioFiles. NO API to encode an arbitrary AudioBuffer to a file [V from d.ts]. You'd write WAV yourself in JS (44-byte header + Int16, trivial) and use expo-file-system.
- Expo config plugin: app.plugin.js -> withAudioAPI (options iosMicrophonePermission, iosBackgroundMode, androidPermissions, androidForegroundService, androidFSTypes, enableFFmpeg, disableStaticExternalLibs). Requires dev build (C++ JSI), not Expo Go.
- New Arch: android/build.gradle defaults newArch on unless newArchEnabled=false; podspec same. Works with new arch. minSdk 24, ndk 27.1.12297006 (matches RN 0.88 libs.versions.toml ndkVersion 27.1.12297006). 16KB: build.gradle comment "useLegacyPackaging=false // enables 16KB alignment" [V], .so alignment of prebuilt libs [U].
- FFmpeg: opt-in (HLS/remote streaming only), off by default; docs say adds "several megabytes". Not needed for local m4a decode. Default prebuilt static libs (ogg/opus/vorbis) add some size; disableStaticExternalLibs removes. Exact APK delta [U].
- Docs: https://docs.swmansion.com/react-native-audio-api/docs/other/prebuilt-libraries-support

## 3. Custom module / libs
- Local Expo module: `npx create-expo-module@latest --local` creates modules/<name> with android/ios/src/expo-module.config.json; autolinked on prebuild/build; needs dev build (not Expo Go) [V docs.expo.dev/modules/get-started]. Kotlin: MediaExtractor+MediaCodec decode loop (~80-120 lines) -> ShortArray/FloatArray; return base64 or write PCM to file path (pass a file path, not big arrays across the bridge). Encode: MediaCodec AAC + MediaMuxer(MPEG_4) ~100 lines, or hand-write WAV in 20 lines. Swift: AVAudioFile read into AVAudioPCMBuffer / AVAssetWriter. Feasible; unit not built here [U on exact LOC].
- ffmpeg-kit-react-native 6.0.2 (LGPL-3.0, last modified 2025-01-21) is DEPRECATED on npm "no longer supported"; upstream ffmpeg-kit retired in 2025, binaries removed. Fork @apescoding/ffmpeg-kit-react-native 1.0.8 (LGPL-3.0, 2025-12-22) exists, maintenance risk, +tens of MB. Avoid.
- @siteed/audio-studio 3.2.1 (MIT, 2026-08-23; @siteed/expo-audio-studio 3.2.2 is deprecated shim): recording/analysis/streaming; decode/trim features claimed in description, not verified.
- No maintained lightweight "decode to PCM" lib other than react-native-audio-api found on npm.

## 4. Pure JS DSP in Hermes [U, no benchmark found]
Web search found no Float32Array/Hermes benchmark. Hermes has no JIT; interpreted bytecode, typed-array element access roughly 30-100x slower than native C. Estimate: simple O(N) loops over 660k samples = ~5-30 ms per pass desktop-class, ~30-150 ms per pass on low-end Android. WSOLA (cross-correlation search per hop, e.g. 20 ms window, +-10 ms search at 22.05 kHz ~ 440 x 220 MACs per hop, ~3000 hops for 30 s) ~ 3-6e8 MACs -> estimate 3-15 s on low-end, too slow; reduce via decimated search or plain OLA/SOLA with coarse search (~10x cheaper) -> 0.3-1.5 s. Resampling (linear/cubic) 660k samples: <0.3 s. Run off the UI path (await + chunking), result passes as Float32Array. Native JSI is justified only for WSOLA/pitch shift; otherwise use native module in Kotlin/C++ for that single step. Benchmark on the target device first.
- Cheap trick: pitch shift by resampling (changes duration) + time stretch only needed for correction; or use OfflineAudioContext playbackRate for "chipmunk" pitch.

## 5. Expo CNG + dev build vs bare [V unless noted]
| Capability | Expo CNG+dev build+local module |
|---|---|
| record | yes (expo-audio, AAC; or useAudioStream->WAV) |
| decode | yes via react-native-audio-api or local Kotlin/Swift module |
| DSP | JS, or local module C++/Kotlin (NDK via CMake in local module works, Gradle access via config plugin / expo-build-properties [U]) |
| encode | JS WAV writer, or MediaCodec in local module |
| playback | expo-audio (WAV file uri OK [U]) |
| background audio | expo-audio `enableBackgroundPlayback`/plugin options + FGS via react-native-audio-api plugin [U exact] |
| permissions | config plugin sets RECORD_AUDIO / NSMicrophoneUsage |
| custom Kotlin/Swift | yes: modules/ autolinked |
| New Arch | yes (default, RN 0.88) |
| Gradle/NDK | prebuild generates android/; custom config plugin or expo-build-properties edit gradle.properties, proguard |
| ProGuard | expo-build-properties android.enableProguardInReleaseBuilds + extraProguardRules |
| 16 KB page size | RN 0.88/NDK 27 default compliant; verify third-party .so with `zipalign -c -P 16` [U] |
| release builds | `eas build` or `npx expo run:android --variant release` |
Bare RN adds nothing needed; only direct hand-editing of android/ (CNG regenerates it, but config plugins cover it). No concrete blocker found.

Toolchain on Windows (local dev build): JDK 17 (RN docs; verify for 0.88 [U]), Android Studio/SDK (compileSdk per RN template), NDK 27.1.12297006, CMake, Gradle wrapper (bundled), Node >=22 for react-native-audio-api (engines >=22.0.0 [V]). Command: `npx expo run:android`. Gradle cold build 10-25 min. iOS cannot be built on Windows -> EAS cloud only.
EAS free tier: secondary sources (not official page; docs.expo.dev/eas/pricing 404 in my fetch): 15 Android + 15 iOS builds/month, low-priority queue (waits up to 90+ min at peak), 45 min timeout, 1 concurrent. Source: https://cadrant.ai/blog/eas-build [U, third party]. `eas build --local` needs Linux/macOS, not native Windows (use WSL) [U].
