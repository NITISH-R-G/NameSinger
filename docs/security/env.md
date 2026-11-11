# NameSinger: Environment variable inventory

- **Reviewed against source:** 2026-11-06
- **Related:** [security.md](security.md) (secrets rules, decision register), [auth.md](auth.md), [threat-model.md](threat-model.md)

## 1. Ground rules

- This file lists **names and purposes only**. It never contains values, and must never be edited to include any.
- In Expo, any variable prefixed `EXPO_PUBLIC_` is read at build time and **inlined into the app bundle**. Treat it as public: anyone can extract it. No secret may ever use that prefix.
- **Private provider API keys never belong in the Expo app.** The app talks only to the project's own backend.
- Production, staging and local development use separate values. No value is shared between environments.
- **[Implemented in Checkpoint 1.1]** `.gitignore` ignores `.env` and `.env.*` and keeps `.env.example` trackable, so a placeholder example file may be committed but real values may not. Verified with `git check-ignore`; no `.env*` file exists.
- Secrets live in the hosting platform's secret store or a secrets manager, never in the repository, `app.json`, `eas.json`, CI logs or build output.

## 2. Current configuration status

**No environment variables are read or required by the app today.** Verified: no `process.env` or `EXPO_PUBLIC_` references in `src/`, `scripts/`, `app.json` or `package.json`; no `.env*` files and no `eas.json` exist. Every "Configured" value below is therefore **No**, and everything in this table is **[Planned]**, not implemented.

## 3. Inventory

**Where** = Mobile app (compiled into the bundle), Backend (server runtime), or Deployment (CI/CD and infrastructure tooling).
**Class** = Public (safe to expose) or Secret (must never reach a client, repo or log).

Names are proposals; they may change when the platform decisions (D-01 to D-04) are made.

### 3.1 Mobile app (public only)

| Variable | Purpose | Class | Where | Configured |
|---|---|---|---|---|
| `EXPO_PUBLIC_API_BASE_URL` | HTTPS base URL of the project's backend API | Public | Mobile app | No |
| `EXPO_PUBLIC_ENV_NAME` | Label such as `development`, `staging`, `production`, used to select behaviour and display | Public | Mobile app | No |
| `EXPO_PUBLIC_MAX_RECORDING_MS` | Optional override of the client recording cap (currently a code constant of 10,000 ms); advisory only, the server enforces the real limit | Public | Mobile app | No |
| `EXPO_PUBLIC_CRASH_REPORTING_DSN` | Ingest endpoint for crash reporting, only if D-13 adopts a vendor. Must confirm the vendor treats DSNs as public identifiers | Public (verify) | Mobile app | No |

No other variable may be exposed to the app. In particular there is **no** public provider key, database URL, storage credential or admin token.

### 3.2 Backend (runtime)

| Variable | Purpose | Class | Where | Configured |
|---|---|---|---|---|
| `APP_ENV` | Environment name for behaviour toggles | Public (non-sensitive) | Backend | No |
| `DATABASE_URL` | Connection string to the database selected in D-02 (includes credentials) | **Secret** | Backend | No |
| `DB_ENCRYPTION_KEY_REF` | Reference (not the key) to the encryption key in the platform KMS, if used | **Secret** (reference) | Backend | No |
| `STORAGE_BUCKET_RAW` | Name of the private bucket for raw recordings | Non-public config | Backend | No |
| `STORAGE_BUCKET_SONGS` | Name of the bucket for generated songs | Non-public config | Backend | No |
| `STORAGE_ACCESS_KEY_ID` | Object storage access key identifier | **Secret** | Backend | No |
| `STORAGE_SECRET_ACCESS_KEY` | Object storage secret | **Secret** | Backend | No |
| `SIGNED_URL_TTL_SECONDS` | Lifetime of signed upload/download URLs | Public (non-sensitive) | Backend | No |
| `CDN_BASE_URL` | Public CDN origin for template songs and shareable assets | Public | Backend | No |
| `TOKEN_HASH_PEPPER` | Server-side secret mixed into hashed ownership tokens (if D-05 uses capability tokens) | **Secret** | Backend | No |
| `JWT_SIGNING_SECRET` or key reference | Signing key for sessions, only if D-05 introduces signed sessions | **Secret** | Backend | No |
| `REDIS_URL` | Cache, rate-limit and queue store connection (includes credentials) | **Secret** | Backend | No |
| `QUEUE_URL` | Job queue connection or endpoint | **Secret** | Backend | No |
| `RATE_LIMIT_PER_IP_PER_MIN` | Request limit per IP (value set under D-14) | Non-sensitive config | Backend | No |
| `RATE_LIMIT_UPLOADS_PER_DAY` | Per-requester upload limit | Non-sensitive config | Backend | No |
| `DAILY_SPEND_CAP` | Kill-switch threshold for cost-bearing operations | Non-sensitive config | Backend | No |
| `MAX_UPLOAD_BYTES` | Server-enforced upload size limit (proposal in security.md: 512 KB, D-15) | Non-sensitive config | Backend | No |
| `RAW_RECORDING_TTL_HOURS` | Retention window for raw recordings (D-06) | Non-sensitive config | Backend | No |
| `GENERATED_SONG_TTL_DAYS` | Retention window for generated songs (D-07) | Non-sensitive config | Backend | No |
| `ALLOWED_ORIGINS` | Explicit CORS origins for any browser-facing surface | Non-sensitive config | Backend | No |
| `MUSIC_PROVIDER_API_KEY` | Key for the music generation provider, if one is chosen (D-04) | **Secret** | Backend | No |
| `TTS_PROVIDER_API_KEY` | Key for a text-to-speech provider, if one is chosen and used (D-04) | **Secret** | Backend | No |
| `STT_PROVIDER_API_KEY` | Key for a speech-recognition provider, if one is chosen and used (D-04, D-11) | **Secret** | Backend | No |
| `LOG_LEVEL` | Verbosity of server logs (must not enable personal-data logging) | Non-sensitive config | Backend | No |
| `CRASH_REPORTING_SERVER_DSN` | Server-side crash reporting credential, if D-13 adopts a vendor | **Secret** | Backend | No |

Provider variable names are generic placeholders. Which providers exist, and what each key can do, is unresolved and must be verified from each provider's own documentation; no provider capability is assumed here.

### 3.3 Deployment environment (CI/CD and infrastructure)

| Variable | Purpose | Class | Where | Configured |
|---|---|---|---|---|
| `EXPO_TOKEN` | Authenticates CI to Expo/EAS for builds and updates | **Secret** | Deployment (CI secret store) | No |
| `APPLE_APP_STORE_CREDENTIALS` (as secure files or secret refs) | Signing and submission for iOS | **Secret** | Deployment | No |
| `ANDROID_KEYSTORE_REF`, `ANDROID_KEYSTORE_PASSWORD`, `ANDROID_KEY_ALIAS`, `ANDROID_KEY_PASSWORD` | Android release signing (the keystore file itself must never be committed; `.gitignore` already ignores `*.jks`) | **Secret** | Deployment | No |
| `CLOUD_DEPLOY_CREDENTIALS` | Credentials for deploying the backend to the host chosen in D-01 | **Secret** | Deployment | No |
| `SECRET_SCANNING_TOKEN` | Only if the chosen scanning tool needs one | **Secret** | Deployment | No |

## 4. Handling rules

1. **Add before use:** a variable is added to this file in the same change that introduces it. Reviewers reject code that reads an undocumented variable.
2. **Validate at startup:** the backend must refuse to start if a required secret is missing or malformed, and must never print its value.
3. **Rotation:** every secret has an owner and a rotation procedure; rotate immediately after suspected exposure, and on staff departure.
4. **Least privilege:** each key grants only what its component needs (for example the worker may read raw recordings; the API may not).
5. **Client review:** before each app release, inspect the produced bundle for strings that look like keys, and confirm that only the variables in section 3.1 are present.
6. **Never log** environment contents or full connection strings.

## 5. Unresolved decisions for this document

- **D-01** Hosting platform (changes deployment variables and secret stores).
- **D-02, D-03** Database and storage (change the storage and database variable names).
- **D-04** Providers (determine which `*_PROVIDER_API_KEY` variables exist at all).
- **D-05** Identity model (determines whether `TOKEN_HASH_PEPPER` or `JWT_SIGNING_SECRET` exist).
- **D-13** Crash reporting vendor.
- **D-14, D-15, D-06, D-07** Numeric limits and retention values.
