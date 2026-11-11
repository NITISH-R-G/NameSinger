> **Superseded in part:** the screen layout and components described here were replaced by the conversational interface. See [conversational-interface.md](conversational-interface.md).

# Voice orb

A single orb on the create screen that reacts to the user's real voice while recording and to the generated song while it plays. Implemented in `src/components/VoiceOrb.tsx` (rendering), `src/components/OrbStage.tsx` (orb, status line, round controls), `src/components/CreateScreen.tsx` (wiring), `src/audio/levels.ts` and `src/audio/envelope.ts` (analysis), `src/orb/orbState.ts` and `src/orb/palette.ts` (state and colours), `src/hooks/useSongPlayback.ts` (song playback).

The reference video could not be played in this session; the look was matched to the supplied frame sheet (white background, large blue-violet orb with pale cloud and deep indigo regions, compact controls at the bottom). Motion timing was not matched to the video.

## What the platform provides (verified against the installed packages)

| Question | Answer | Evidence |
|---|---|---|
| How is the microphone captured? | expo-audio `AudioStream`, 16-bit mono at 22,050 Hz, written to a WAV natively | `useNameRecorder.ts`, `AudioStream.types.d.ts` |
| Is live mic metering available? | Yes, as the stream's buffer events (`onBuffer`), about 10 per second. The native stream already emitted them and the hook discarded them. No second recorder is needed | `AudioStream.kt` (100 ms buffers), measured on the emulator: 25 buffers in 2.5 s |
| Is playback metering available? | Only expo-audio's sample listener, which is documented as needing `RECORD_AUDIO` on Android. It is not used, so playback never depends on the microphone permission | `AudioModule.types.d.ts`, expo-audio docs |
| Can the WAV be analysed? | Yes. A 22.8 s song gives 1,142 envelope frames in 4 ms (Node). `player.currentTime` is a synchronous native property | `envelope.ts`, `AudioModule.kt` |
| Animation capabilities? | React Native `Animated` with the native driver, and `react-native-svg` (both declared). `react-native-reanimated`, worklets and gesture-handler are in `node_modules` only as peer dependencies of expo-router and are **not declared in `package.json`**, so they are not used | `package.json`, `package-lock.json` |

No dependency was added.

## Architecture

```
capture            analysis              state              rendering
useNameRecorder -> MicMeter (levels.ts) \
  (stream buffers)                       > LevelSource -> VoiceOrb
useSongPlayback -> PlaybackLevelDriver  /       ^
  (player position) (envelope.ts)               |
recorder phase + song phase + playback -> deriveOrbState (orbState.ts)
```

- **Capture** stays in the existing recorder controller. The orb never records: the round record button calls the same `controller.start()`, which still requires consent and asks Android for the microphone on every recording.
- **Analysis** is pure and unit-tested: `int16Rms`, `LevelNormalizer`, `smoothLevel`, `createMicMeter`, `computeEnvelope`, `envelopeAt`, `createPlaybackLevelDriver`.
- **Animation state**: `deriveOrbState` picks one of `idle`, `listening`, `recorded`, `generating`, `playing`, `paused`, `error` from the recorder phase, song phase and playback phase. `orbMotion` gives the numbers for each state.
- **Rendering**: `VoiceOrb` takes a state and a `LevelSource`. It decides nothing about audio.

## Microphone reactivity

`useNameRecorder` passes `onBuffer` to the existing stream and feeds each buffer to a `MicMeter`. The meter only measures while the recorder phase is `recording`; it is switched off on every other phase and on unmount, so nothing is measured before consent, before permission, or after stop.

Per buffer: RMS, to dBFS, to a 0 to 1 level relative to the room (`LevelNormalizer`: a noise floor that follows quieter readings at once and rises very slowly, a ceiling that follows louder readings at once and decays slowly, a 6 dB gate above the floor, and an absolute floor of -66 dBFS), then smoothed with a fast attack (60 ms) and slow release (280 ms). Silence, hiss and steady room noise give exactly 0; the orb only breathes. A quiet speaker and a loud speaker both use the full range. Levels are never invented.

## Playback reactivity and synchronisation

1. When a song appears, `useSongPlayback` reads its WAV, decodes it, and computes an envelope: RMS per 40 ms window every 20 ms, in dB, stretched between the 5th and 98th percentile of the **non-silent** frames (the real generated songs end in digital silence; including it flattened the whole envelope to about 0.96. Found during emulator testing and fixed, with a regression test).
2. While the player is playing and the app is in the foreground, a driver reads `player.currentTime` at each animation frame (not a clock of its own, so seeks, pauses and restarts stay in step) and looks that position up in the envelope. It publishes at most about 30 updates a second.
3. Pause, stop, finishing, another sound taking over, the app leaving the foreground, or a missing envelope all drop the level to 0 at once. With no envelope the level stays 0.
4. The sample rate is accounted for because the envelope is built in seconds from the file's own rate (a test gives identical envelopes for the same song at 22,050 and 44,100 Hz).

**Not measured:** audio output latency. The orb follows the player's reported position; the delay between that position and sound leaving the speaker was not measured and no offset is applied.

## Rendering

React Native `Animated` (native driver) plus `react-native-svg` gradients, no image and no spinner. Six soft clouds (white, pale blue, violet, indigo) each rotate around the orb's centre at their own speed over a linear gradient base, with an edge-darkening and a highlight layer for depth and a soft glow behind. The orb grows with the level, its contour (an ellipse that slowly turns) stretches a little with it, and the white clouds brighten. The orb stays round overall. The only motion not driven by audio is a slow, small, state-based breath (idle, making the song). Each audio update is one short `Animated.timing`; no React state is set per update.

Reduced motion (`AccessibilityInfo`) removes the flow, the breath and the contour and limits the size reaction to 4%. The flow also stops when the app is not in the foreground.

## Controls and accessibility

- Round `IconButton`s (56 dp, same colours as the primary and secondary variants): record, stop recording, play or pause, resume, stop. Each is labelled and reports disabled and busy state.
- The record control is shown only when consent allows recording; otherwise the stage says "Agree below to start recording". Withdrawing consent, the permission recovery panels, review, approval, silent-take detection, and deleting an existing recording are unchanged.
- The orb has a fixed, non-animated description per state ("Voice orb, listening to you."). Levels are never announced. Playing, paused and stopped are announced; recording and generation already announce themselves.
- Layout: the orb is bounded by window width and height, so at 320 dp the orb, the status line and the round control are all visible without scrolling.

## Verification summary

See the final report for this task. Emulator only; no physical device. The emulator microphone is essentially silent (about -77 dBFS), so **reaction to a real voice was not observed**; the path from microphone to meter was observed (buffers arriving, level 0 for silence) and the response to voice levels is covered by unit tests with synthetic buffers.

## Limitations

- Voice reactivity unverified end to end on a device or emulator (silent emulator microphone).
- UI Automator cannot reach an idle state while the orb's native loops run, so label-based automation fails on this screen; accessibility services such as TalkBack were not tested.
- Frame timing was measured on a software-rendered emulator only.
- The dev-only readout under the orb (buffer count, dBFS, level) is shown in development builds only.
