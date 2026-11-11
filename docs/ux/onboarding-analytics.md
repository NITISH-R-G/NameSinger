# Onboarding analytics (proposal, not implemented)

## Current status

- **Implemented event hooks: none.**
- **Analytics actually collected: none.** The app has no analytics, no network telemetry and no persistence.
- This document proposes a typed interface only. Even once the interface exists, it would be a **no-op** until you separately choose a destination, and nothing would be "collected" until then.

## Principles

- Local and lightweight: one small TypeScript module, no package, no network call.
- Default sink does nothing. A development sink may log the fixed event name and a few allowed fields.
- Never record raw audio, file paths or URIs, the user's name, recording contents, transcriptions, device identifiers or sensitive device details.
- Events carry only fixed enum values and small numbers.

## Proposed interface

```ts
export type OnboardingEvent =
  | { name: 'onboarding_started' }
  | { name: 'consent_viewed' }
  | { name: 'consent_accepted' }
  | { name: 'consent_declined' }
  | { name: 'microphone_permission_requested' }
  | { name: 'microphone_permission_granted' }
  | { name: 'microphone_permission_denied'; permanent: boolean }
  | { name: 'recording_started' }
  | { name: 'recording_completed'; durationMs: number; autoStopped: boolean }
  | { name: 'recording_failed'; code: string }          // fixed error codes only
  | { name: 'recording_silent_detected' }
  | { name: 'recording_rerecorded' }
  | { name: 'recording_approved' }
  | { name: 'language_selected'; language: string }     // language code, e.g. 'hi'
  | { name: 'generation_started' }
  | { name: 'generation_completed'; durationMs: number }
  | { name: 'generation_failed'; code: string }
  | { name: 'first_song_played' };                      // activation

export interface AnalyticsSink {
  track(event: OnboardingEvent): void;
}
```

`onboarding_abandoned` is intentionally **not** in the list (see below).

## Allowed properties

| Property | Allowed values |
|----------|----------------|
| `durationMs` | number of milliseconds, rounded |
| `autoStopped`, `permanent` | boolean |
| `language` | one of the app's ten language codes |
| `code` | fixed error code strings already used by the app (for example `no_voice`) |

Nothing else. No names, URIs, file sizes tied to a person, device model, OS version or any user identifier.

## Where each event would fire

| Event | Trigger |
|-------|---------|
| `onboarding_started` | first screen mounts |
| `consent_viewed`, `consent_accepted`, `consent_declined` | consent notice shown / buttons |
| `microphone_permission_requested/granted/denied` | recording controller permission result |
| `recording_started/completed/failed` | recorder hook |
| `recording_silent_detected` | review-step voice check (new, in the proposal) |
| `recording_rerecorded`, `recording_approved` | review buttons |
| `language_selected` | language selector |
| `generation_started/completed/failed` | song generator hook |
| `first_song_played` | first Play of the generated song in a session |

## What can and cannot be measured

- **Measurable once a sink exists:** step-to-step conversion within a session, permission grant/deny rate, share of silent takes, generation failure rate, time to first song.
- **Not reliably measurable:** abandonment. A user who simply leaves emits no event, and a background/close signal is not guaranteed on Android. The only honest way is to infer drop-off from the last event received per session, which needs a session identifier and somewhere to send events. Neither exists, so I make no claim that abandonment can be measured today. Introducing a session id would need a privacy review.
- **Cross-launch behavior** (returning users) is not measurable without persistence, which the app deliberately does not have.

## Hypotheses to test, not results

These are questions the events could answer, not findings: whether moving language after recording raises completion; whether the short consent line changes decline rate; what share of denials are permanent. No improvement figure is claimed.

## Decisions needed from you

1. Is a no-op interface plus a dev-only logging sink acceptable, with no real destination for now?
2. If you want real collection later, which destination and what consent wording?
