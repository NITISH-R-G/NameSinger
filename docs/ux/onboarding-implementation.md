> **Superseded in part:** the screen layout and components described here were replaced by the conversational interface. See [conversational-interface.md](conversational-interface.md).

# Onboarding: what was implemented

Implements the approved direction from the Stage 1 audit (`onboarding-audit.md`, `proposed-onboarding-flow.md`). Evidence for the recording thresholds: `recording-validation.md`.

## Before and after

| # | Before (the audited app) | After |
|---|---|---|
| 1 | One scrolling screen. Header, then **Step 1 Choose your language** (required to continue) | **Welcome**: header, a "Hear a sample first" card with a clearly labelled demo song (plays only when the user presses Play), and a primary "Make a song with my name". No microphone, consent or language here |
| 2 | Step 2 Say your name: consent card with 4 bullets (89 words), then Record | **Say your name**: a short consent summary with a "More details" button holding the full four points, then Record. Android's permission dialog appears only after the user taps Record |
| 3 | Permission denied: one panel with "Open settings" first, and a "Try again" that silently did nothing after two denials | First denial: "Try again" (main) and "Open settings". Permanent denial: only "Open settings", with the steps to follow. Returning from Settings with the permission granted brings the Record button back (it never starts recording by itself) |
| 4 | Review: Re-record / Use this recording. Silent takes could be approved and failed later | Silent or unclear takes are caught when recording stops: the take stays playable, the reason is explained, and only "Record again" is offered. Quiet but clear takes pass with a note. "Using this recording starts your song right away." |
| 5 | Step 3 Hear the demo track (numbered, optional, between recording and song) | Removed from the flow; the sample on the welcome screen replaces it |
| 6 | Step 4 Your song: a checklist, then tap "Create my song" | Approving starts generation automatically (once per approved recording). The song card scrolls into view with a spinner and "Making your song on this phone…", then Play |
| 7 | Language was Step 1 and blocked recording | "Language (optional)" card after the song, saying it does not change the song yet. Nothing waits on it |

Taps from first launch to first song playback: 8 before, **6** now (Make a song, I agree, Record, Stop, Use this recording, Play), plus the Android permission choice on first use. This counts steps in the flow; it is not a timing study of real users.

## Files changed

New: `src/components/WelcomeScreen.tsx`, `src/components/Section.tsx`, `src/constants/onboardingCopy.ts`, `src/audio/recordingQuality.ts`, `src/audio/sampleSongAsset.ts`, `src/hooks/analyzeTake.ts`, `src/hooks/autoGenerate.ts`, `assets/audio/sample-song.wav`, `scripts/generate-sample-song.js`, `docs/ux/recording-validation.md`, `docs/ux/onboarding-implementation.md`, and the tests `__tests__/recordingQuality.test.ts`, `__tests__/recordingOnboarding.test.ts`, `__tests__/onboardingFlow.test.ts`.

Changed: `src/app/index.tsx`, `src/components/NameRecorder.tsx`, `src/components/ConsentNotice.tsx`, `src/components/SongGenerator.tsx`, `src/components/AudioPreview.tsx`, `src/components/ActionButton.tsx`, `src/hooks/recordingController.ts`, `src/hooks/recorderState.ts`, `src/hooks/useNameRecorder.ts`, `src/audio/renderSong.ts` (now shares the voice settings; nothing else), `src/constants/consent.ts`, `src/constants/languages.ts`, `src/types/index.ts`, `src/utils/accessibility.ts`, `__tests__/accessibility.test.ts`, `docs/ui/button-system.md`, `docs/security/data-retention.md`, `docs/ux/onboarding-audit.md`, `docs/ux/proposed-onboarding-flow.md`.

Unchanged by design: the DiceBear avatar (`Mascot`), the recording controller's lifecycle and cleanup protections, the audio pipeline, the button hierarchy and tokens, `package.json` (no new dependencies).

## Decisions that interpret or depart from the specification

1. **An unusable take is kept, not deleted.** The specification says never discard a recording without an explicit user action, and also to detect unusable recordings before approval. The take is held in a new `unusable` state so the user can hear it. It is deleted only when they tap Record again.
2. **The voice floor was lowered from -50 to -62 dBFS** in the detector settings shared by the check and the renderer, because the old floor rejected quiet but clear voices. This touches `renderSong.ts` (three lines). Evidence and limits are in `recording-validation.md`.
3. **A small fix to `AudioPreview` that was not in the specification.** In the emulator the first generated song stayed on "Loading audio…" with Play disabled. expo-audio's status hook starts from the status at creation and then relies on events, so a "loaded" event fired before its listener attaches is lost. `AudioPreview` now also re-reads the player's own status for up to 10 seconds. A UI fix, not an audio-pipeline change.
4. **Consent and the Android dialog remain two steps** (agree, then Record), so the dialog follows a tap the user understands.
5. **No way back to the welcome screen.** Going back would unmount the recorder and delete the user's recording, which would break "never discard without explicit action". Android Back exits the app as before.
6. **The sample song uses a synthetic voice**, not a person, and says so. It is produced by the real on-device pipeline (`scripts/generate-sample-song.js`) and is about 1 MB.
7. **No analytics code was added**, not even the no-op interface proposed earlier. The approval says not to implement collection without an approved destination and privacy design, and the interface was not among the approved items. `onboarding-analytics.md` is unchanged and still describes a proposal.
8. **The result caption no longer shows internals** ("Made on this phone in N ms", "notes of the chords").

## Remaining limitations

- Not tested on a physical device, on iOS, or with a screen reader. Emulator only (Android 15, Expo Go).
- The emulator microphone is silent, so the happy path used the development-only "Use test voice" button. The silent-take path was exercised with a real take. No real human voice was recorded.
- The voice thresholds come from synthetic speech and noise (see `recording-validation.md`) and should be re-checked on a physical device with several voices.
- Generation time was not re-measured. The earlier figure (about 2.3 s on the emulator) predates these changes, and the new check on stop adds a file read and a voice scan.
- The sample song's voice is a synthetic vowel pattern, so it shows the effect but not how a real name will sound.
- Consent reappearing on every launch was true when this was written; it has since been replaced by a saved acknowledgement (`consent-persistence.md`).
- Abandonment, permission-denial rates and the share of unusable takes cannot be measured because there are no analytics.
- Language still has no effect on the song.
