# NameSinger onboarding audit (Stage 1)

Status: **Stage 1 audit, approved with product decisions.** The findings below describe the app **before** the changes. What was implemented, the before/after screens and the deviations are in `onboarding-implementation.md`.

Activation is defined as: *a user successfully plays their first personalized song.*

## How this was gathered

- Read the code: `src/app/index.tsx`, `NameRecorder`, `ConsentNotice`, `LanguageSelector`, `AudioPreview`, `SongGenerator`, `useNameRecorder`, `recordingController`, `recorderState`, `src/audio/*`, `constants/consent.ts`.
- Ran the app in Expo Go on an Android 15 emulator (`ref35`), including first launch and the microphone permission being denied three times.
- **Not tested:** a physical device, iOS, a screen reader, a real first-time user. Time estimates below are my estimates, not measurements, except the 2.2 to 2.4 s song render which was measured on the emulator.

## 1. What exists today

There is no onboarding. The app is one scrolling screen (single route) with four numbered cards. Nothing is persisted between launches and there is no analytics of any kind.

First launch (screenshot `ob_first_launch.png`): the header and the 10-option language grid fill the screen. There is no recording button, no sound and no example of the result above the fold.

### Per-screen table

| # | Card | Purpose | User action | Info collected | Value delivered | Est. time | Likely abandonment reason | Mandatory? | Changes later experience? |
|---|------|---------|-------------|----------------|-----------------|-----------|---------------------------|-----------|---------------------------|
| 0 | Header | Brand and promise | Read | None | A promise, no proof. Tagline says "soon hear it sung", which reads as unfinished | 5 s | Does not understand what happens or what they get | n/a | No |
| 1 | Choose your language | Pick song language | Tap one of 10 | `language` (in memory) | None heard. **Language has no audible effect today**: `templateForLanguage()` returns the same demo template for every language | 5 s | Asked to decide before knowing why; sees native-script labels that may not be theirs | **Yes, enforced**: recording is disabled until chosen | Not audibly. Only the label in the result |
| 2a | Say your name: consent | Explain microphone use and storage | Read 4 bullets (89 words), tap "I agree, continue" or "No thanks" | Consent (in memory, resets each launch) | None | 20 to 30 s reading | Wall of text before any value; privacy wording is accurate but heavy | Yes, enforced | Gates recording |
| 2b | Say your name: permission | Android microphone dialog | Allow / deny | Permission | None | 3 s | Dialog follows a consent screen, so it feels like a second ask | Yes | Gates recording |
| 2c | Say your name: record | Capture the name | Tap Record, speak, tap Stop (auto-stops at 10 s, not announced) | WAV file (temporary) | None yet | 5 to 12 s | Fear of getting it wrong; no level meter; no tip on how to speak | Yes | Is the voice in the song |
| 2d | Say your name: review | Check the take | Play it, then "Use this recording" or "Re-record" | Approval flag | None yet | 5 to 10 s | Extra decision; silent takes pass this step | Yes | Gates generation |
| 3 | Hear the demo track | Show the backing music | Press Play | None | The only audio before the song. Numbered as a step but **optional**, and sits between the recording and the generate button | 0 to 10 s | Looks like a required step; delays the goal | **No** (but numbered) | No |
| 4 | Your song | Generate and play | Tap "Create my song", wait, press Play | None | **The value.** About 2.3 s to render (measured), 22 s of audio | 3 s + 22 s listening | Button disabled with a checklist; result caption talks about "ms" and "notes of the chords" | Yes | End of journey |

## 2. Funnel map: first launch to first song

| Step | Event (what the user does) | Interaction count |
|------|---------------------------|-------------------|
| F0 | App opens, sees header and language grid | 0 |
| F1 | Choose language | 1 |
| F2 | Scroll to Step 2 | (scroll) |
| F3 | Read consent, tap "I agree, continue" | 2 |
| F4 | Tap "Record my name" | 3 |
| F5 | Android permission dialog: allow | 4 |
| F6 | Speak, tap "Stop" (or wait 10 s) | 5 |
| F7 | Tap "Use this recording" (optionally play it first) | 6 |
| F8 | Scroll to Step 4 | (scroll) |
| F9 | Tap "Create my song" | 7 |
| F10 | Wait about 2.3 s | |
| F11 | Tap Play on the result | 8 |
| F12 | **Activation: first song playing** | |

8 taps plus at least 2 scrolls. Value (a song with their name) arrives only at F11. Everything before F9 is effort before value. Where a step can be skipped without breaking the journey, noted above, it is only the demo track.

## 3. Friction

| ID | Finding | Evidence | Type |
|----|---------|----------|------|
| U1 | Language is asked first but changes nothing audible, and it blocks the main action | `templateForLanguage()` ignores its argument; Record is disabled until chosen | UX problem (and a misleading promise) |
| U2 | No value shown before commitment: no example song, nothing playable above the fold | First-launch screenshot | UX problem |
| U3 | Consent text of 89 words is shown before any benefit is established, and repeats every launch | `consent.ts`; consent state is in memory only | UX problem |
| U4 | Two asks in a row (our consent, then Android's dialog) with no explanation linking them | Observed | UX problem |
| U5 | Primary action is never visible without scrolling | First-launch screenshot | UX problem |
| U6 | Demo track is numbered Step 3 but optional, and it sits between recording and generating | `index.tsx` | UX problem |
| U7 | Tagline "soon hear it sung inside a song made for you" reads as a promise for later | Header copy | UX problem (copy) |
| U8 | 10 s auto-stop is not announced; the user does not know there is a limit or how long they have | `MAX_RECORDING_MS` | UX problem |
| U9 | "Create my song" is disabled until both prerequisites are met, with a checklist as the only explanation | `SongGenerator` | UX problem (minor; the checklist does explain it) |
| U10 | Result caption exposes implementation ("Made on this phone in 2300 ms", "tuned to 6 notes of the chords") and a placeholder-template note | `SongGenerator` | UX problem (copy) |

## 4. Technical failure points

Classification: **UX** = confusing experience; **TECH** = defect or limitation in behavior; **ERR** = missing or weak error handling; **ANA** = cannot be measured today.

| ID | Area | Finding | Observed? | Class |
|----|------|---------|-----------|-------|
| T1 | Microphone permission, first denial | Panel says "Microphone access is off ... Allow it in Settings, then try again." But Android shows the dialog again on the next try, so "Settings" is wrong at this point. | **Yes (emulator)**: Try again showed the dialog | UX |
| T2 | Microphone permission, permanent denial | After denying twice Android stops showing the dialog. "Try again" then does **nothing visible**: same panel, no message, no feedback. "Open settings" is the only route and is not distinguished from "Try again" | **Yes (emulator)**: third Try again changed nothing | ERR + UX |
| T3 | Silent or very quiet recording | `validateRecording` accepts any non-empty file of at least 300 ms. Silence is only detected inside `renderSong` (`trimToVoiced` returns null, `PipelineError('no_voice')`). So the user approves a silent take and learns at generation time | By code reading | TECH + ERR |
| T4 | Recording initialisation failure | Handled: error panel with retry; fixed-code logging only | Existing tests | OK |
| T5 | Interrupted recording (call, app background) | Handled by the controller (interrupt on background, ignores the permission-dialog "background") | Existing tests | OK |
| T6 | 10 s auto-stop | Works, but is silent to the user | Emulator | UX |
| T7 | Generation failure | Error text with alert role and announcement; the user can retry | Code | OK |
| T8 | Long operation feedback | Generation about 2.3 s on the emulator with a spinner and caption "Tuning your name to the music…". Adequate; low-end devices untested | Emulator | OK (device untested) |
| T9 | File I/O | Cleanup queue and sweep exist; failures are logged by code | Existing tests | OK |
| T10 | Navigation resets | Single route, so no back-stack loss. Consent, language and approval are all lost on app restart | Code | UX (cheap to accept; see recommendations) |
| T11 | Unexplained disabled buttons | Record is disabled until a language is chosen with no explanation near the button; Create is disabled but explained by the checklist | Code | UX |
| T12 | Analytics | None. Funnel drop-off, permission denial rate, silent takes and first-play rate are all unmeasurable. Abandonment (a user who just leaves) cannot be detected from inside the app without a session mechanism | n/a | ANA |

## 5. Recommendations, prioritized

Impact is my judgment, not a measured effect. I have no conversion data and make no claim about how much any change improves activation.

| Priority | Change | Fixes | Impact | Effort |
|----------|--------|-------|--------|--------|
| P0 | Fix permanent-denial dead end: detect "can't ask again", show distinct copy and make "Open settings" the single primary action | T1, T2 | High for denied users (they are otherwise stuck) | Low |
| P0 | Detect silent or too-quiet takes at review time and ask to re-record before approval | T3 | High (removes the worst late failure) | Low to medium (reuse `trimToVoiced` check) |
| P1 | Make the record action the first thing visible; move language after the recording (or make it optional with a default) | U1, U5, T11 | High | Medium |
| P1 | Stop presenting language as a decision that changes the song until it does; or say plainly what it will do | U1 | High (honesty) | Low |
| P1 | Compress consent: one short sentence plus "Learn more"; keep the full text available. Show it at the moment of recording, with one explanatory line before Android's dialog | U3, U4 | Medium | Low |
| P1 | Fold "Create my song" into the approval step: after "Use this recording" go straight to generating, then show Play | funnel F8 to F9 | High (removes a scroll and a tap) | Medium |
| P2 | Mention the 10 s limit and show the remaining time while recording | U8, T6 | Medium | Low |
| P2 | Move the demo track out of the numbered steps (optional "hear an example") | U6 | Low to medium | Low |
| P2 | Update tagline and result copy; drop the implementation details | U7, U10 | Low to medium | Low |
| P2 | Add a typed, no-op analytics interface and call sites | T12 | Enables measurement later | Low (see `onboarding-analytics.md`) |

## 6. Constraints respected

No new packages, no backend, no bare migration, audio pipeline and recording lifecycle unchanged, existing button variants and layout tokens reused, no fake progress or artificial delays, nothing logged beyond fixed codes.

## 7. Open questions for you

1. Language: should it move after the recording, stay first but optional with a default, or stay as is until it audibly changes the song?
2. Should consent be reduced to one sentence with "Learn more", given the full text is accurate and you may prefer it explicit?
3. Should approval automatically start generation, or keep "Create my song" as an explicit tap?
