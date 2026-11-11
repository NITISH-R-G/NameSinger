# Conversational interface

NameSinger is a voice-first conversation. The orb is the interface and the only microphone control. The chat transcript and composer at the bottom are the text side of the same conversation. This document supersedes the screen layout described in `voice-orb.md`, `onboarding-implementation.md` and `button-system.md`. Those documents describe removed components (`CreateScreen`, `OrbStage`, `NameRecorder`, `WelcomeScreen`, `LanguageSelector`, `ConsentNotice`, `AudioPreview`, `SongGenerator`).

## Screen states

1. **Opening** (`OpeningScreen`, `GlassOrb`): a native animated glass orb, the headline "Your name, in a song.", the hint "Swipe up to enter", and NameSinger branding. No video is used. A swipe up (dy ≤ −80, or dy ≤ −30 with vy ≤ −0.5, mostly vertical) or the accessibility "activate" action commits.
2. **Transition** (`AppShell`): one `Animated` progress value (1900 ms, 260 ms with reduced motion) morphs the glass orb into the violet orb. The conversation is mounted only after the commit. It then starts the first question.
3. **Conversation** (`ConversationScreen`): header (wordmark, speaker toggle, settings), orb, status line, transcript, composer. Collapsing voice mode hides the orb and keeps the transcript and composer.
4. **Settings** (`SettingsSheet`): consent management and withdrawal, delete recording, Android settings shortcut, and a development-only test voice.

## Conversation steps

`intro` → `ask-name` → `review-take` → `ask-language` → `confirm-make` → `making` → `song-ready`.

- Questions are asked one at a time and the assistant waits for the answer.
- The language question says it does not change the song yet.
- Generation starts only after an explicit confirmation.
- The name can be spoken (tap the orb) or typed. Typed text and chips call the same conversation functions as the orb.

## Architecture

| Concern | Module |
|---|---|
| State and rules (pure reducer, `onUserText`, `onChip`, `onTake*`, `onConsent*`, `onSong*`, `orbTapCommand`) | `src/conversation/conversation.ts` |
| Assistant copy | `src/conversation/script.ts` |
| Answer parsing | `src/conversation/answers.ts` |
| Orchestration (executes commands against recorder, song, playback, consent, speech) | `src/conversation/useConversation.ts` |
| Assistant speech | `src/speech/assistantSpeech.ts`, `expoSpeechPort.ts`, `useAssistantSpeech.ts` |
| Orb state and motion | `src/orb/orbState.ts`, `VoiceOrb.tsx` |
| Audio levels | `src/audio/levels.ts`, `envelope.ts` (unchanged) |
| Transcript and composer | `Transcript.tsx`, `Composer.tsx` |
| Keyboard | `src/hooks/useKeyboardInset.ts` |

## Text to speech audit

- No speech output existed before. `expo-speech ~58.0.3` was added, the only new dependency, because no on-device TTS path exists in the current stack. It uses the phone's own engine, with no network, prerecorded audio or paid API.
- The engine speaks the exact transcript text. Messages are queued in order, and nothing is spoken while the microphone is open.
- Speech can be interrupted by tapping the orb, switching voice mode off, backgrounding the app, or unmounting.
- A start watchdog of 8 s and one retry after 700 ms guard against a slow cold start. Two consecutive failures switch to text only, with a message in the transcript.

## What drives the orb

- **Listening**: real microphone buffers (`MicMeter`).
- **Playing**: the song's envelope sampled at the player's position.
- **Speaking**: word-boundary events from TTS. Android exposes no TTS amplitude, so this is a pulse and not a waveform.
- **Processing and generating**: a state-based breath, never a level.

## Known limits and deviations

- No speech recognition is available, so only the name can be answered by voice. Other answers use text or chips.
- A typed name cannot become audio, because the song needs a spoken take. The assistant says so and asks for a recording.
- Verified on an Android 15 emulator only (including 320 dp). The emulator microphone is silent (about −77 dBFS), so microphone reactivity was not observed with a real voice. There was no physical-device, iOS or screen-reader testing.
- The `/testvoice` command, the "Use test voice" setting and the level readout are development-only (`__DEV__`).
