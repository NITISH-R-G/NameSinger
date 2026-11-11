# NameSinger: Mandatory security rules

- **Applies to:** all future implementation, starting after Checkpoint 1
- **Reviewed against source:** 2026-11-06
- **Related:** [auth.md](auth.md), [rls-policies.md](rls-policies.md), [env.md](env.md), [threat-model.md](threat-model.md), [data-retention.md](data-retention.md)

**Legend.** **[Implemented]** is verified in current source. **[Planned]** is not implemented. **[Decision]** needs owner approval.

Rules use MUST / MUST NOT / SHOULD in the RFC 2119 sense. A rule being listed here does not mean it is satisfied; section 2 states what is actually in place.

## 1. Scope and trust model

The mobile app runs on a device the user controls, so **anything shipped in the app bundle or held in the app process can be extracted** by a determined attacker. Client-side checks improve usability and reduce accidental abuse; they are never a security boundary. Every security-relevant rule must be enforced on the backend.

## 2. Current state (Checkpoint 1)

| Area | Status | Evidence |
|---|---|---|
| Backend, database, auth, payments | **None exist** | No such code or config in the repo. |
| Network calls from the app | **None** | No `fetch`/HTTP client in `src/`. |
| Secrets in source | **None found** | Searched `src/`, `scripts/`, `app.json`, `package.json`; no keys, tokens or `process.env` use. |
| Environment files | None present | `.env*` absent. **[Implemented in Checkpoint 1.1]** `.gitignore` now ignores `.env`, `.env.*` (keeping `.env.example`), key and signing files, credential files and local build artifacts; verified with `git check-ignore`. No secret-like file is tracked by git. |
| Logging of personal data | None | The only `console` call in `src/` is a `console.warn` with a fixed code (`delete_failed`, `gave_up`, `sweep_failed`) in `src/hooks/recordingCleanup.ts`; no URIs, paths, names or error text are logged (asserted by tests). Corrected after security audit run-1 found the earlier "no `console.*` calls" wording was inaccurate. |
| Recording limits | **Implemented (client-side only)** | 300 ms minimum, 10 s auto-stop, empty-file and missing-URI rejection in `src/hooks/recorderState.ts` and `useNameRecorder.ts`. These are usability checks, not security controls. |
| Recording cleanup | **Implemented in Checkpoint 1.1; unit-tested, not device-tested** | A take is deleted when the app state stops referencing it (reject, re-record, reset, error, failed validation). An approved recording is kept for the session and deleted on reset, re-record, unmount, or by the orphan sweep at the next launch. A take is discarded if the OS interrupts it or the app goes to the background. A file being played is not deleted until playback stops. Delete failures are retried (3 attempts), shown as a fixed message and logged as a fixed code only. Generated songs (which contain the user's voice) are deleted by the same rules (`songUriToDiscard`). Recordings and songs live in `<cache>/NameSinger`. Logic in `src/hooks/recordingController.ts`, `recordingCleanup.ts` and `songGeneratorState.ts`; storage findings in [data-retention.md](data-retention.md). No runtime behaviour has been verified on a device. |
| Microphone permission and consent | Implemented | A consent notice must be accepted before the first recording (in memory per session; declining is possible). Permission is requested at record time and denial is handled. `app.json` sets the iOS usage description via the `expo-audio` plugin. The generated Android manifest requests `RECORD_AUDIO` (see data-retention.md for the full list). |
| Dependency vulnerability scanning | **Manual only; advisories triaged in 3.2** | `npm audit` was run and every advisory individually triaged (section 3.2). No CI exists, so no automated scanning. No dependency was upgraded or overridden. |
| HTTPS / CORS / rate limiting / input validation | **Not applicable yet** | No server. |

## 3. Rules for all code

### 3.1 No secrets in source or client bundles
- Secrets (private provider API keys, database credentials, signing keys, service tokens) MUST NOT appear in source, git history, `app.json`, `eas.json`, build logs or the JS bundle.
- Any variable prefixed `EXPO_PUBLIC_` is inlined into the app and is **public by definition**. It MUST NOT hold anything sensitive.
- Third-party AI provider keys MUST live only on the backend. The app calls the project's own backend, never a provider directly.
- **[Implemented in Checkpoint 1.1]** `.gitignore` ignores `.env` and `.env.*` (except a committed `.env.example` with placeholders only), key and certificate files, signing credentials, credential files, `.npmrc` and local build artifacts. Keep it that way; do not weaken these rules.
- Add automated secret scanning (pre-commit and CI) before the first secret exists. A key that is ever committed MUST be treated as compromised and rotated.
- See [env.md](env.md) for the variable inventory.

### 3.2 Dependencies
- Run `npm audit` and `npx expo-doctor` in CI on every change; block merges on unreviewed high or critical findings.
- **[Done once, manually, in Checkpoint 1.1]** Advisories triaged below. Re-run `npm audit` and re-triage before every release build; the result is only valid for the dependency tree at that date.

#### Advisory triage (`npm audit`, 2026-11-06)

`npm audit` reports 24 findings in total (1 low, 23 moderate). They come from only three advisories. `npm audit --omit=dev` (the tree that production dependencies pull in) reports exactly **5 moderate** findings: `expo`, `@expo/cli`, `@expo/fingerprint`, `glob`, `minimatch`. These are the "5 moderate" reported earlier.

| Advisory | Package and installed version | Severity | Dependency path | Patched upstream? | Decision |
|---|---|---|---|---|---|
| [GHSA-3g3m-2fjr-6pw4](https://github.com/advisories/GHSA-3g3m-2fjr-6pw4): glob AbortSignal cancellation bypass allows post-timeout filesystem traversal (affects glob 9.0.0 to 14.0.1) | `glob` 13.0.7 (and 10.5.0, 7.2.3 in test tooling) | Moderate | `expo` > `@expo/cli` > `glob`; `expo` > `@expo/fingerprint` > `glob`; `jest`/`jest-expo` > `test-exclude` > `glob` | glob 14.0.4 is published as `latest` on npm. The 13.x line is not patched; `@expo/cli` and `@expo/fingerprint` would have to move to a patched glob | **No change.** Build and test tooling only. Needs an Expo release that bumps glob; forcing it with an override risks breaking `@expo/cli` and is not justified by the exposure |
| [GHSA-g3hv-75wg-m249](https://github.com/advisories/GHSA-g3hv-75wg-m249): minimatch denial of service via globparts amplification (affects minimatch 7.0.0 to before 11.0.1) | `minimatch` 10.2.6 (and 9.0.9, 3.1.5 in test tooling) | Moderate | `glob` > `minimatch`; `@expo/fingerprint` > `minimatch` | minimatch 11.0.5 is published as `latest` on npm | **No change.** Same reasoning; a crafted glob pattern can only slow a developer or CI machine, and no pattern comes from user input |
| [GHSA-gcqx-w48m-w2h4](https://github.com/advisories/GHSA-gcqx-w48m-w2h4): deepmerge `mergeObject()` prototype poisoning (affects 4.2.0 to 4.3.1) | `deepmerge` (transitive) | Low | `jest` > `jest-config` > `deepmerge` | `npm audit` says a fix is available | **No change.** Dev-only test dependency; not part of the app. The fix is bundled with a jest change that was not evaluated |

The remaining findings (`jest`, `jest-expo`, `@jest/*`, `jest-*`, `babel-jest`, `babel-plugin-istanbul`, `test-exclude`, `jest-watch-typeahead`) are the same glob/minimatch advisories reported again on every test-runner package that depends on them.

- **What `npm audit fix --force` would do:** install `expo@57.0.32` (a major downgrade below the SDK 58 target), `jest@29.7.0` and `jest-expo@58.0.6`. Rejected: it would break the SDK 58 requirement and the compatible-version set. It was not run.
- **Runtime exposure:** these packages are command-line and test tooling. A check of an exported Android bundle found no `minimatch` or `globparts` strings in it. This is evidence, not proof, and it was not repeated for iOS.
- **Residual risk:** a developer or CI machine could be slowed or, in the glob case, traverse files if attacker-controlled globbing were ever fed to these tools. Do not run Expo or Jest tooling on untrusted project input.
- **Follow-up:** re-check when a new Expo SDK 58 patch release is published, and move to the patched versions through Expo's own release rather than overrides.
- Pin versions via the lockfile (**currently `package-lock.json` is untracked by git; commit it**), install with `npx expo install` for Expo-managed packages, and review new dependencies for maintenance status and licence before adding them.
- Backend base images and system packages (for example `ffmpeg`) MUST be patched on a schedule.

### 3.3 Logging
- Logs MUST NOT contain voice audio, file contents, transcribed or typed names, access tokens, signed URLs, IP addresses beyond what abuse handling needs, or provider keys.
- Use opaque request and job IDs for correlation.
- Server logs and crash reports are retention-limited (see [data-retention.md](data-retention.md)). Any crash/analytics SDK (D-13) must be configured to avoid capturing audio or names.
- No `console.log` of recording URIs, file paths or error objects that embed them in release builds.

### 3.4 Error handling
- Clients receive generic errors with a stable error code and a request ID. No stack traces, SQL, file paths, provider responses or internal hostnames.
- Detailed errors go to server logs only (without personal data).
- Failures MUST fail closed: if authorization, validation or a malware/format check cannot complete, deny the request.
- The app MUST NOT claim success unless the backend confirmed it. **[Implemented for recording:** the UI shows a recording only when the recorder returned a non-empty URI, a non-empty file and at least 300 ms.]

## 4. Mobile-client protections

| Rule | Status |
|---|---|
| Request microphone permission only at the moment of recording, with a clear usage description. | Implemented. |
| Do not record when permission is denied; offer a path to Settings. | Implemented. |
| Enforce a maximum recording length to bound file size. | Implemented (10 s). Advisory only; the server must re-enforce. |
| Delete local recording files promptly once they are no longer needed (after upload confirmation, after reset, on cancellation) and on app start if orphaned files from a previous session exist. | **Partly implemented (Checkpoint 1.1; unit-tested, not device-tested):** deleted on reject, re-record, reset, error, interruption, backgrounding of a take in progress, unmount, and by a sweep at the next launch. "After upload confirmation" is **[Planned]** because no upload exists. |
| Store any future access token in the platform secure store (`expo-secure-store` or equivalent), never in plain storage or logs. | **[Planned]**; package not installed. |
| Use HTTPS only for the backend; no cleartext traffic allowed in release builds. | **[Planned]**; verify Android cleartext settings when a backend URL exists. |
| Optionally pin or validate the backend certificate. | **[Decision]**; trade-off between security and operational risk. |
| Do not embed provider keys, admin endpoints or feature flags that unlock cost-bearing behaviour. | Rule. |
| Treat deep links (`namesinger://` scheme is set) as untrusted input; validate parameters. | **[Planned]**; no deep-link handlers exist beyond routing. |
| Release builds MUST disable development tooling and debug logging. | **[Planned]**. |

## 5. Backend protections (all **[Planned]**; no backend exists)

### 5.1 Input validation (server-side, always)
- Validate every field by type, length and allowed values with a schema validator. Reject unknown fields. Do not trust client validation.
- Language codes MUST be checked against an allow-list (the ten codes in `src/constants/languages.ts` are the current set).
- Any text derived from a user (for example a typed or transcribed name) MUST be length-limited, Unicode-normalized, and treated as data only: never concatenated into SQL, shell commands, ffmpeg arguments, file paths, prompts or HTML.

### 5.2 Audio upload validation
- **Type:** accept only the formats the app produces (currently `.m4a`/AAC). Determine type from file *content* (magic bytes and a successful decode), not from the extension or client `Content-Type`.
- **Size:** hard byte limit enforced at the edge and while streaming. Proposed starting point: 512 KB (a 10 s mono 96 kbps clip is roughly 120 KB). **[Decision]** on the final figure.
- **Duration and shape:** probe with a decoder and reject files outside 0.3 s to 10.5 s, wrong channel count or sample rate, or with suspicious metadata or trailing data.
- **Re-encode:** never serve or process the original upload. Re-encode to a canonical format in an isolated worker, then discard the original (see data-retention).
- **Sandboxing:** run decoders and `ffmpeg` in a locked-down, resource-limited, network-less worker (CPU, memory, wall-clock limits). Media parsers are a common source of memory-safety bugs; keep them patched.
- **Storage names:** generate server-side random object keys. Never use client file names (path traversal, injection).
- **Uploads go to private storage** via short-lived signed upload URLs bound to size and content type, or through the API. No public write access.
- **Optional:** malware scanning is of limited value for audio but the re-encode step removes embedded payloads.

### 5.3 Rate limiting and cost protection
- Every public endpoint MUST be rate limited per IP and, where available, per token/device. Limits are stricter on upload and generation endpoints.
- Enforce a global and per-day spend cap on cost-bearing operations (generation, TTS, provider calls) with an automatic kill switch. **[Decision]** D-14 on limits.
- Make job creation idempotent (client-supplied idempotency key) and de-duplicate identical requests so retries and replays do not multiply cost.
- Limit queue depth and per-requester concurrent jobs.
- Prefer returning pre-rendered shared assets for anything that does not need per-user processing.

### 5.4 Transport and HTTP
- HTTPS (TLS 1.2+, TLS 1.3 preferred) for all endpoints; redirect or reject HTTP; send HSTS on any web-facing host. Internal service traffic is also encrypted.
- Storage and CDN endpoints used for audio are HTTPS only.
- **CORS:** the native app does not use browser CORS, so CORS gives it no protection. For any browser-facing surface (admin panel, web build, signed-URL buckets), allow only explicit origins, no wildcard with credentials, and only the needed methods and headers.

### 5.5 Injection, XSS and path traversal
- **SQL/NoSQL injection:** parameterized queries or a vetted ORM only; least-privilege database roles.
- **Command injection:** never build shell strings from user data; call `ffmpeg` with an argument array and fixed filters, and no user-controlled filter graph, protocol or file path.
- **Path traversal:** user input never forms a file path; object keys are server-generated.
- **XSS:** the native app renders text as React Native `Text`, which does not interpret HTML. Any web surface (admin, share page) MUST escape output, use a strict Content-Security-Policy and never render user-supplied names as HTML.
- **SSRF:** the backend must not fetch user-supplied URLs.
- **Prompt injection:** if user text is ever sent to an AI provider, treat it as untrusted data and constrain the output; never let it select tools or endpoints.

### 5.6 Secure storage and deletion of uploaded audio
- Encrypt at rest (provider-managed keys at minimum); private buckets; no directory listing.
- Separate raw recordings from generated songs by bucket/prefix and access policy.
- Automatic expiry by lifecycle rule, plus on-demand deletion. Deletion must cover the database record, all object copies (raw, re-encoded, derived), caches/CDN and queued jobs. Details and open questions in [data-retention.md](data-retention.md).
- Access to production audio by staff is exceptional, logged and approved.

### 5.7 Backend hardening and operations
- Least-privilege service identities; separate production and non-production credentials; no shared admin keys.
- Rotate secrets on a schedule and immediately after any suspected exposure.
- Monitoring and alerting for spikes in uploads, generation spend and error rates.
- Backups follow retention rules (see data-retention).
- Infrastructure changes via reviewed code, not manual edits, where possible.

## 6. Pre-release security gates (**[Planned]**)

No release that uploads audio may ship until: authorization tests in [rls-policies.md](rls-policies.md) pass; the verification tests in [threat-model.md](threat-model.md) pass; secret scanning and dependency audit are clean or triaged; retention and deletion are implemented and tested; and the consent/disclosure text is approved (D-08).

## 7. Decision register (canonical)

All documents refer to these IDs. **None is decided.**

| ID | Decision | Needed before |
|---|---|---|
| D-01 | Backend platform and hosting region | Any backend code |
| D-02 | Database product | Any persistence; blocks executable access policies |
| D-03 | Object storage and CDN | Any upload |
| D-04 | Music/voice AI provider(s), and whether any per-user provider call exists (the research recommended pre-rendered per-language templates) | Provider integration |
| D-05 | Identity model: guest with capability tokens, anonymous provider sessions, or accounts | Any upload |
| D-06 | Retention period for raw voice recordings | Any upload |
| D-07 | Retention and sharing model for generated songs (private vs unguessable shareable link) | Song delivery |
| D-08 | Consent text, privacy notice, jurisdiction and legal review (Indian data-protection law and app-store rules to be assessed by qualified counsel) | Public release |
| D-09 | Minimum age and handling of minors' voice data | Public release |
| D-10 | Device attestation for abuse reduction | Public launch |
| D-11 | Whether any text form of the name (typed or transcribed) is stored | Pipeline design |
| D-12 | Backup policy and deletion propagation to backups | Any persistence |
| D-13 | Crash reporting and analytics vendor, if any | Release builds |
| D-14 | Rate limits, daily spend cap and kill-switch thresholds | Any cost-bearing endpoint |
| D-15 | Maximum upload size and accepted formats (proposal in 5.2) | Upload endpoint |
