# NameSinger: Threat model

- **Scope:** Checkpoint 1 app plus the **planned** backend pipeline (recording upload, queued personalization, song delivery)
- **Reviewed against source:** 2026-11-06
- **Method:** asset and trust-boundary identification, attacker profiles, STRIDE-style scenarios scored on likelihood and impact, then mitigations and verification tests.
- **Related:** [security.md](security.md) (rules, decision register), [auth.md](auth.md), [rls-policies.md](rls-policies.md), [env.md](env.md), [data-retention.md](data-retention.md)

**Important.** Likelihood and impact ratings are the author's qualitative estimates (Low / Medium / High), not measurements. Every mitigation labelled **[Planned]** does not exist yet; this document must not be read as evidence that any control is in place.

## 1. System under analysis

**[Implemented] today (Checkpoint 1):** a local-only Expo app. It records a 0.3 to 10 s clip with `expo-audio`, plays it back, lets the user approve or discard it, plays a bundled demo track, and shows a disabled "Generate song" button. It makes no network requests, has no accounts and no app-level persistent storage (the recording file stays in the app cache until it is deleted). The main current exposure is the recording file on the device.

**[Planned]:** app uploads the approved clip to a backend; a worker validates and re-encodes it, splices it into a pre-rendered per-language template song, stores the result in object storage; the app polls job status and plays the song via a CDN or signed URL. A third-party AI/speech provider may be used for some steps (D-04), or may not.

## 2. Assets

| ID | Asset | Why it matters | Sensitivity |
|---|---|---|---|
| A1 | Raw voice recordings of a user's name | A voice sample is personal data and can identify a person; names are personal data too. Reuse could enable impersonation or voice cloning. | High |
| A2 | The user's name (audio content, and any typed/transcribed text, D-11) | Personal data; may reveal ethnicity, religion or family details. | High |
| A3 | Generated personalized songs | Contain A1/A2 content; may be private gifts. | Medium to High |
| A4 | Ownership credentials (capability tokens or sessions, D-05) | Possession grants access to A1 to A3. | High |
| A5 | Provider API keys and cloud credentials | Abuse causes financial loss and may expose data. | Critical |
| A6 | Generation budget and compute capacity | Cost-bearing and denial-of-service target. | High |
| A7 | Template songs and pipeline code | Business assets; tampering affects every user. | Medium |
| A8 | Logs, metrics and backups | May leak A1 to A4 if careless. | Medium to High |
| A9 | App signing keys and release pipeline | Compromise enables malicious app updates. | Critical |

## 3. Trust boundaries

| ID | Boundary | Crossing data |
|---|---|---|
| TB1 | User and device OS to the NameSinger app | Microphone audio, permission prompt, local files |
| TB2 | App to internet to backend API (untrusted network, untrusted client) | Uploads, tokens, job requests, status. **The client and everything it sends is untrusted.** |
| TB3 | API to queue and workers | Job messages, file references |
| TB4 | Workers to media decoders (`ffmpeg` and similar) | Untrusted audio bytes |
| TB5 | Backend to object storage and CDN | Raw and generated audio, signed URLs |
| TB6 | Backend to database | Records, token hashes |
| TB7 | Backend to third-party AI/speech providers | Possibly audio or text; provider handling unverified |
| TB8 | Operators, CI/CD and secret stores to production | Deploys, secrets, admin access |

## 4. Potential attackers

| ID | Attacker | Capability and motivation |
|---|---|---|
| X1 | Curious or malicious app user | Uses the genuine app, inspects traffic, tries other users' IDs |
| X2 | Scripted abuser / botnet | Calls the API directly at scale to burn budget or deny service |
| X3 | Network attacker (hostile Wi-Fi) | Intercepts or alters traffic if TLS is weak |
| X4 | Malicious file author | Crafts audio to exploit decoders or exhaust resources |
| X5 | Reverse engineer | Unpacks the app bundle to extract keys and endpoints |
| X6 | External intruder | Exploits backend or dependency vulnerabilities |
| X7 | Malicious or careless insider / contractor | Has some production access |
| X8 | Compromised or non-compliant third-party provider | Retains or misuses data sent to it |
| X9 | Local attacker on a lost, shared or rooted device | Reads app files on the phone |

## 5. Threat scenarios

Rating = (Likelihood, Impact). Status reflects what exists today.

| ID | Threat | Attacker | Asset | L / I | Status today |
|---|---|---|---|---|---|
| T-01 | **Voice recording theft in transit:** upload or download intercepted or tampered with | X3 | A1, A3, A4 | Medium / High | No upload exists; nothing in transit |
| T-02 | **Voice recording theft at rest:** public or misconfigured bucket, over-broad credentials, leaked signed URLs | X6, X7 | A1, A3 | Medium / High | No storage exists |
| T-03 | **Unauthorized recording access / cross-user data access:** guessed or enumerated IDs, missing ownership check, trusting a client-supplied owner | X1 | A1 to A3 | High / High | No server |
| T-04 | **Recording theft from the device:** leftover audio file read by another app, backup or person with device access | X9 | A1 | Low to Medium / Medium | **Reduced in Checkpoint 1.1, not eliminated.** A generated song file (also the user's voice) is deleted on regenerate, reset and unmount. Files are deleted on reject, re-record, reset, interruption, unmount and by a launch-time sweep (unit-tested only). The file sits in the app cache directory, which the OS keeps private to the app by default; it is unencrypted by the app and a rooted device or debug access can read it. Approved clips stay until reset, unmount or next launch. Nothing verified on a device |
| T-05 | **API abuse and generation-cost attack:** scripted calls to upload or generate at scale; replay and retries multiplying cost | X2 | A6, A5 | High / High | No server |
| T-06 | **Resource exhaustion by large or endless uploads** (denial of service) | X2, X4 | A6 | Medium / Medium | No server |
| T-07 | **Malicious audio upload:** decoder exploit (memory corruption), decompression-style bombs, hostile metadata, command or path injection via file name or ffmpeg arguments | X4 | Backend, A1, A5 | Medium / High | No server |
| T-08 | **Exposure of user names:** names in logs, URLs, analytics, error messages, file names or object keys; plaintext name stored needlessly | X7, X6, X1 | A2, A8 | Medium / Medium | No analytics or network. One fixed-code `console.warn` for cleanup failures; user-visible error text is fixed (native error messages are not shown). The recording file is stored locally in the cache |
| T-09 | **Backend compromise:** vulnerable dependency, stolen deploy credentials, over-privileged service account | X6, X7 | All | Medium / Critical | No backend |
| T-10 | **Provider API key leakage:** key in the app bundle, repo, CI logs or client-reachable config; then abused for cost or data access | X5, X6 | A5, A6 | High if keys are ever placed client-side / High | No keys exist; risk arises at integration time |
| T-11 | **Third-party provider data misuse or retention:** audio or names sent to a provider that stores or trains on it | X8 | A1, A2 | Unknown / High | Not applicable until D-04; terms unverified |
| T-12 | **Shared-link exposure:** a generated-song link forwarded or crawled | X1 | A3 | Medium / Medium | No sharing exists (D-07) |
| T-13 | **Token loss or theft** (capability-token model): lost token means lost access; stolen token means takeover of that user's data | X1, X9 | A4 | Medium / Medium | No tokens exist (D-05) |
| T-14 | **Malicious app update or fake app:** compromised signing key or look-alike app captures voice | X6, X7 | A9, A1 | Low / Critical | No release pipeline yet |
| T-15 | **Backup and replica retention:** deleted data persists in backups or caches | X6, X7 | A1 to A3 | Medium / Medium | No backups exist |
| T-16 | **Voice misuse / deepfake abuse:** the service's output or stored voices used to impersonate | X1, X8 | A1, A3 | Low to Medium / High | Not applicable at present |
| T-17 | **Supply-chain compromise** of an npm or pip package | X6 | All | Low / High | `npm audit` findings triaged individually on 2026-11-06 (see security.md 3.2); all are build/test tooling and none is fixed yet. No CI scanning |

## 6. Mitigations (all **[Planned]** unless marked)

| Threat | Mitigations |
|---|---|
| T-01 | HTTPS only (TLS 1.2+); no cleartext traffic in release builds; HSTS on web surfaces; no tokens in URLs; optional certificate pinning (decision pending). |
| T-02 | Private buckets, no listing; separate buckets and credentials for raw vs generated audio; short-lived scoped signed URLs; encryption at rest; least-privilege roles; automated storage-policy checks in CI; lifecycle expiry. |
| T-03 | Ownership bound server-side; random, unguessable IDs and tokens (at least 128 bits); authorization on every request; generic denial identical to "not found"; isolation tests from [rls-policies.md](rls-policies.md). |
| T-04 | Delete local clip after confirmed upload, cancel, reset and on next launch (orphan sweep); keep clips in app-private storage and verify the actual location; disable OS backup of the audio directory if feasible; treat as low-severity but document it. **[Partially implemented:]** delete on re-record, reset and failed validation. |
| T-05 | Per-IP and per-credential rate limits; strict limits on upload/generation; idempotency keys and request de-duplication; queue-depth and concurrency caps; global and daily spend cap with automatic kill switch; prefer pre-rendered shared assets so most requests cost nothing; optional device attestation (D-10); alerting on spend spikes. |
| T-06 | Edge and streaming byte limits; request timeouts; upload size cap (D-15); per-requester pending-job cap. |
| T-07 | Content-based format detection; decode-probe before processing; duration and shape limits; re-encode to a canonical format and discard the original; sandboxed, resource-limited, network-less worker; fixed ffmpeg arguments with no user-controlled filters or paths; server-generated object keys; patch decoders on a schedule. |
| T-08 | No names in URLs, logs, analytics, object keys or error messages; do not store a text name unless required (D-11); log opaque IDs only; scrub crash reports; restrict who can read production data. |
| T-09 | Least-privilege service identities; separate prod/non-prod; MFA and audited access for operators; dependency audit in CI; infrastructure as code; network segmentation of workers; incident response plan; rotate credentials. |
| T-10 | Provider keys only on the backend; none in `EXPO_PUBLIC_*`, `app.json`, repo or CI logs; secret scanning; bundle inspection before release; per-key spend limits at the provider if available; rotation procedure. See [env.md](env.md). |
| T-11 | Verify each provider's data handling, retention, training use and regional processing before sending anything (list in [data-retention.md](data-retention.md)); prefer designs where raw voice never leaves the project's own infrastructure; contractual terms reviewed by the owner (D-04, D-08). |
| T-12 | Songs private by default; shareable links only on explicit owner action, random and expiring; revocable (D-07). |
| T-13 | Store token in secure storage; hash tokens server-side; allow revocation and deletion; communicate in-product that losing the token loses access, or adopt accounts (D-05). |
| T-14 | Protect signing keys in the platform keystore/secret manager; restrict who can publish; MFA on store accounts; review release diffs. |
| T-15 | Document backup contents and retention; ensure deletion propagates or ages out within a stated window (D-12). |
| T-16 | Minimize and expire raw voice; never use user voices for anything beyond the requested song; no voice cloning without separate explicit consent; abuse reporting path. |
| T-17 | **Supply-chain compromise** of an npm or pip package | X6 | All | Low / High | `npm audit` findings triaged individually on 2026-11-06 (see security.md 3.2); all are build/test tooling and none is fixed yet. No CI scanning |

## 7. Verification tests

All **[Planned]**; none exists yet. A test passing is evidence for that scenario only.

| Test | Covers |
|---|---|
| Intercepting proxy shows no cleartext HTTP from a release build; TLS downgrade attempts fail | T-01 |
| Anonymous request to a raw-recording object or bucket listing is denied; an expired or tampered signed URL fails; storage-config scan finds no public access | T-02 |
| Two-requester isolation tests (read, write, delete, spoofed owner, guessed ID) from [rls-policies.md](rls-policies.md) | T-03, T-13 |
| After approval, cancel, reset, kill and relaunch, no orphan audio file remains in app storage (manual device check on iOS and Android, also confirming the storage location) | T-04 |
| Load test: scripted burst from one IP and one credential triggers limits; replayed idempotency key creates one job; spend cap trips the kill switch in a test environment | T-05, T-06 |
| Upload fuzzing: truncated, oversized, wrong-type, polyglot, hostile-metadata and malformed-container files are rejected or safely re-encoded; worker stays within CPU, memory and time limits; file names containing `../`, shell metacharacters or Unicode tricks have no effect | T-07 |
| Grep of logs, traces, URLs and crash reports from a test run containing a distinctive test name shows no occurrence | T-08 |
| CI secret scan fails on a planted fake key; release bundle contains only variables listed in [env.md](env.md) section 3.1 | T-10 |
| Provider checklist in [data-retention.md](data-retention.md) completed with cited documentation before any provider call is enabled | T-11 |
| Link expiry and revocation tests | T-12 |
| Deletion test: after deletion request, database rows, raw and derived objects, CDN cache and queued jobs are gone; backup expiry window confirmed by documentation | T-15 |
| Dependency audit report is clean or triaged for every release | T-17 |
| Tabletop exercise for key leakage and backend compromise (rotation steps timed) | T-09, T-10, T-14 |

## 8. Residual risk and open items

- Several mitigations depend on undecided choices: **D-01** hosting, **D-02** database, **D-03** storage, **D-04** providers, **D-05** identity, **D-10** attestation, **D-11** name text storage, **D-12** backups, **D-14** limits, **D-15** upload cap.
- **Unverified assumptions:** the `expo-audio` recording file location and whether it is excluded from OS backups; the Android manifest generated by the `expo-audio` plugin; whether any provider can meet the retention requirements.
- The highest-impact risks to settle before backend work are T-03 (cross-user access), T-05 (cost abuse), T-07 (malicious audio) and T-10 (key leakage).
- This model should be revisited when the pipeline design, provider selection or identity model changes.
