# NameSinger: Authentication model

- **Applies to:** Checkpoint 1 (`name-singer`, Expo SDK 58, React Native 0.88)
- **Reviewed against source:** 2026-11-06 (single commit `0c28aba` plus uncommitted Checkpoint 1 work)
- **Related:** [security.md](security.md) (rules and decision register), [rls-policies.md](rls-policies.md), [threat-model.md](threat-model.md), [data-retention.md](data-retention.md), [env.md](env.md)

**Legend.** **[Implemented]** means verified in the current source. **[Planned]** means designed here but not built. **[Decision]** means the project owner must approve it; IDs (D-xx) refer to the register in `security.md`.

## 1. Current state: guest-only, no authentication

**[Implemented] Authentication does not exist.** Verified by searching `src/`, `app.json` and `package.json`:

- No sign-in or registration screen, and no auth library or provider SDK.
- No passwords, sessions, tokens, refresh tokens or password-reset flow.
- No user identifier of any kind is created, stored or transmitted.
- No network request is made by the app at all (no `fetch`, HTTP client or backend URL). `@tanstack/react-query` is installed and wrapped around the app, but no query or mutation exists.
- No persistent storage of app state (no AsyncStorage, SecureStore or database).

Everything the app does today happens on the device, so there is currently nothing to authenticate against and nothing server-side to protect. This document describes how that must change *before* a backend exists.

## 2. Operations available to an anonymous user today

All of these are **[Implemented]** and local to the device:

| Operation | Notes |
|---|---|
| Select a language | In-memory React state only; lost on app restart. |
| Request microphone permission | OS permission prompt via `expo-audio`. |
| Accept or decline the recording notice | Acknowledgement is saved on the phone (version and time only) and the notice is not shown again unless its version changes; a decline is not saved. Recording is locked until accepted. See `docs/ux/consent-persistence.md`. |
| Withdraw recording consent | In-app, with confirmation. Deletes the saved acknowledgement (or invalidates it if deletion fails) and confirms it by reading it back; deletes no recording, song or preference; does not touch Android's microphone permission. Failure leaves consent on and says so. See `docs/ux/consent-persistence.md`. |
| Record a name (300 ms to 10 s) | Limits enforced in `src/hooks/recorderState.ts`. Discarded if interrupted or the app is backgrounded mid-take. |
| Play back, re-record, approve the recording | "Approve" only sets in-memory state; it does not upload or save anything elsewhere. |
| Play the bundled demo instrumental | Local asset `assets/audio/demo-instrumental.wav`, a synthesized placeholder. |
| "Generate song" | **Disabled placeholder.** No generation exists. |

There are no operations that require authentication today.

## 3. What would require authentication or other identity if introduced later

**[Planned], not implemented, and depends on decision D-05.** The product requirement is "no login or registration". The following capabilities should be treated as the *trigger points* where anonymous access stops being sufficient:

| Capability | Why anonymous access is insufficient |
|---|---|
| Uploading a voice recording to a server | Needs at minimum an abuse-limiting identity (see §4) because it creates storage and compute cost. |
| Creating a song-generation job | Cost-bearing; must be rate-limited and attributable to something revocable. |
| Reading a generated song or job status | Must be restricted to the creator (or deliberately shared link). |
| Deleting one's own data | Requires proving ownership of the data. |
| Sharing a song publicly | Needs an explicit owner action and an unguessable link. |
| Payments, subscriptions, credits | Out of scope for this MVP; would require real accounts. |
| Admin, support or moderation tools | Must always require strong authentication, never the guest path. |

## 4. Protecting recordings and songs once a backend exists

The same protections apply whichever identity model is chosen. All are **[Planned]**.

1. **Ownership is bound at creation.** Every recording, job and song record carries an owner reference set server-side from the verified credential, never from a client-supplied field.
2. **Anonymous ownership uses an unguessable capability, not an account.** Preferred design (needs approval, D-05): the server issues an opaque random token (at least 128 bits from a CSPRNG) when a job is created. The app keeps it in the platform secure store and presents it to read that job's status and song. The server stores only a hash of the token. This provides "no login" while keeping other users out.
3. **No enumerable identifiers.** Record IDs exposed to clients must be random, not sequential. Knowing an ID alone must never grant access.
4. **Short-lived, scoped access to files.** Audio objects are private by default; clients receive time-limited signed URLs scoped to one object and one operation. No public buckets for raw recordings.
5. **Server-side authorization on every request.** The client UI is never trusted to hide or limit anything. See [rls-policies.md](rls-policies.md) for the ownership model and required isolation tests.
6. **Device attestation as an abuse signal, not as identity** (D-10): Play Integrity (Android) and App Attest (iOS) could reduce scripted abuse. Their availability, cost and Expo support are unverified and must be researched before relying on them.
7. **Lost token means lost access.** With token-only ownership there is no recovery path. The product must accept this or move to accounts (D-05).

## 5. If accounts are introduced

**[Planned]; requires owner approval, D-05.**

- Prefer an established identity provider over a hand-rolled password system. No provider is selected; none may be configured until D-05 and D-02 are decided.
- Anonymous records created before sign-up should be claimable once, by presenting the capability token, then re-owned by the account.
- Passwords (if any) are handled only by the provider; the app never stores them. Session tokens live in secure storage, not in plain app storage or logs.
- Re-evaluate [data-retention.md](data-retention.md) because accounts make data identifiable and extend retention duties.

## 6. Unresolved decisions for this document

- **D-05** Authentication model: guest-only with capability tokens, anonymous provider sessions, or full accounts.
- **D-10** Whether and how to use device attestation.
- **D-09** Whether minors may use the app (affects whether accounts or consent flows are needed).

## 7. Verification (for when a backend is built)

- A request with no token, an expired token or another user's token to any job, recording or song endpoint returns a generic denial and leaks no existence information.
- Token values never appear in logs, crash reports or URLs (query strings).
- Deleting a token's job makes both the record and the audio objects unreachable.
