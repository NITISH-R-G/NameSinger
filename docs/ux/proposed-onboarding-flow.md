# Proposed onboarding flow (proposal, not implemented)

Status: **approved and implemented**, with the changes and deviations recorded in `onboarding-implementation.md`. This page is the original proposal; its time estimates are estimates, not measurements.

Principle: deliver value before demanding commitment, and shorten the path to the first meaningful song rather than the number of screens.

## Proposed sequence

| # | Screen | Purpose | User action | Value delivered | Est. time | Mandatory | Effect on later experience |
|---|--------|---------|-------------|-----------------|-----------|-----------|---------------------------|
| 1 | Welcome | Show what the app does and let the user hear the demo track right away | Tap "Say my name" (primary); optional Play on the demo | An audible example before any ask | 5 s | Yes (one tap) | None |
| 2 | Before-the-dialog note + mic permission | One line: "NameSinger needs your microphone to hear your name. Audio stays on this phone." with "Learn more" for the full consent text. Then Android's dialog | Tap "Continue", allow | Understanding of why | 5 s | Yes | Gates recording |
| 3 | Record | Capture the name with a visible timer and the 10 s limit stated | Tap Record, speak, tap Stop | Their own voice captured | 5 to 12 s | Yes | Voice in the song |
| 4 | Review | Hear the take; silence or very quiet takes are caught here with a re-record prompt | "Use this recording" (primary) or "Re-record" | Confidence before generating | 5 to 10 s | Yes | Gates generation |
| 5 | Language (optional, defaulted) | Choose the song language, shown only once it affects the song, otherwise a plain note | Tap a language, or accept the default | Personal fit | 5 s | **No** | Song language (once supported) |
| 6 | Your song | Generate on approval, then show Play | Tap Play | **Activation** | about 3 s + listening | Yes | End |

Interaction count: about 6 taps (down from 8) and no required scrolling, because each step fits on one screen. This is an expectation from the structure, not a measured result.

## Decisions and rationale

- **Record first.** The name is the one input that makes the song personal. Language adds nothing audible today, so asking for it first is effort before value.
- **Consent at the moment of need.** Short statement before the Android dialog; the full text remains available through "Learn more". This keeps consent explicit while removing the wall of text from the first screen.
- **Silence caught at review, not at generation.** Reuses the existing voice-detection logic so the user never approves a take that cannot work.
- **Permanent denial handled.** If Android will not show the dialog again, the panel switches to "Open settings" as the single primary action with copy that says so. No silent "Try again".
- **Generation after approval.** Approval leads straight to generating, removing one scroll and one tap. The explicit button remains for "Make it again".
- **Demo track is optional** and not numbered as a step.
- **Copy:** replace the tagline "soon hear it sung" with a present-tense promise; drop "ms" and "notes of the chords" from the result caption.

## Language before or after recording

| | Before recording (today) | After recording (proposed) |
|---|---|---|
| Effort before value | Higher | Lower |
| Honesty | Implies a choice that does nothing audible yet | Honest: asked when it can matter |
| Risk | None | If language later affects name pronunciation guidance, it would be useful before recording; revisit when it does |

Recommendation: after recording and optional with a default, until language changes the song. **This depends on your answer to open question 1 in the audit.**

## What does not change

Expo SDK 58 and React Native, the audio pipeline, the recording lifecycle and cleanup, the DiceBear avatar, the security protections, the button variants and layout tokens, accessibility labels and 48 dp targets. No new packages and no network requests.

## Back and restart behavior

Single route. Back from the app exits it (unchanged). Progress is in memory only, so restarting begins again at the welcome screen. Persisting consent or language would be a separate decision with privacy implications and is not proposed here.

## Verification plan (Stage 5, after approval)

`npx tsc --noEmit`, `npx jest`, `npx expo-doctor`, `npx expo export --platform android`, and an emulator walk-through: first launch, permission granted and denied (including permanent denial), recording success and failure, silent take, re-record, language selection, generation success and failure, first playback, narrow widths, accessibility labels and states. Physical device and iOS remain untested.
