# NameSinger: Data access policies (row-level security)

- **Status:** **Not implemented and not executable.** There is no database, no schema and no access policy of any kind.
- **Reviewed against source:** 2026-11-06
- **Related:** [auth.md](auth.md), [security.md](security.md) (decision register), [threat-model.md](threat-model.md), [data-retention.md](data-retention.md)

**Legend.** **[Planned]** means intended design only. **[Decision]** needs owner approval (IDs in the register in `security.md`).

This file intentionally contains no SQL and no product-specific syntax. It records *what* access rules must hold so they can be translated into executable policies once a database is chosen.

## 1. Why policies are not executable yet

- **D-02 (database) is undecided.** Row-level security syntax, and whether it exists at all, depends on the product. Some databases enforce row policies natively; others require the application layer or a separate gateway to enforce them. Writing policy code now would invent behaviour that may not match the chosen product.
- **D-05 (identity model) is undecided.** Policies are written against an identity (an account, an anonymous session, or a capability token). Until that is fixed the "who" in every rule is a placeholder.
- **D-01 / D-03 (backend platform, object storage)** determine whether clients ever talk to the database or storage directly. The safest default (below) is that they do not.
- The current app has no persistence and no network calls (verified in `src/`), so there is nothing to protect with policies today. **No claim is made anywhere in the repository that RLS or any server-side access control is enabled.**

## 2. Default access architecture (**[Planned]**)

1. **Clients do not access the database or private storage directly.** They call the project's own backend API only.
2. The backend authenticates the caller's credential (D-05), authorizes each operation against the ownership rules below, and then uses its own least-privilege service identity to touch data.
3. If the chosen database supports row-level policies, they are enabled **as defence in depth** on top of backend checks, with default-deny and no table left unprotected. If clients are ever allowed direct database access (not recommended), policies become the primary control and the isolation tests below become release blockers.
4. Default deny: a record with no matching rule is inaccessible.

## 3. Data entities and intended ownership (**[Planned]**)

| Entity | Contains | Owner | Created by | Lifetime |
|---|---|---|---|---|
| **Template song** | Pre-rendered per-language base song, slot timing metadata | Project (no user owner) | Operators / offline pipeline | Long-lived, versioned |
| **Recording** | Raw voice clip of a user's name, upload metadata | The requester who created the job | Backend, from an authenticated upload | Short; see data-retention (D-06) |
| **Generation job** | Language, template reference, status, error code, links to the recording and song | The requester | Backend | Short to medium |
| **Generated song** | Personalized audio file and metadata | The requester | Worker (server-only) | See data-retention (D-07) |
| **Ownership credential** | Hash of the capability token (or account link) | The requester | Backend | Same as the job |
| **Abuse/audit records** | Rate-limit counters, request IDs, cost counters, deletion audit | Project | Backend | Short, no personal content |

"Requester" is whatever D-05 selects: the holder of a capability token (guest model), an anonymous session, or an account.

## 4. What an anonymous requester may do

Under the guest-with-capability-token model (**[Planned]**, D-05):

| Operation | Allowed? | Condition |
|---|---|---|
| Read the list of supported languages and available template songs | Yes | Public, read-only, non-personal. |
| Fetch a template song preview (for example the demo instrumental) | Yes | Public asset; no personal data. |
| Create a job and upload one recording for it | Yes | Subject to rate limits, size/format validation and spend caps. The job and recording are bound to the issued credential. |
| Read the status of **their own** job | Yes | Only with the matching credential. |
| Download **their own** generated song | Yes | Only with the matching credential or a signed URL issued for it. |
| Delete **their own** job, recording and song | Yes | Only with the matching credential. |
| List jobs | No | There is no "list all" for anonymous users; a requester can address only the jobs their credential matches. |
| Read, modify or delete anyone else's recording, job or song | **Never** | |
| Overwrite or delete template songs | **Never** | |
| Read raw recordings after the job has produced its song | **Never** | Raw audio is not exposed to clients at all after upload (see below). |

## 5. What must remain server-only

Regardless of the identity model (**[Planned]**):

- Writing generated songs and changing job status (workers only).
- Any call to a third-party AI/music/speech provider, and all provider credentials.
- Reading raw recordings, other than the processing worker that needs the audio.
- Issuing and verifying ownership credentials and signed URLs.
- Creating, updating or deleting template songs.
- Reading or writing abuse/audit records and cost counters.
- Retention enforcement, deletion jobs and deletion of backups.
- Any bulk read, export or administrative query. These require separate, strongly authenticated, logged administrative access and are never reachable through the guest path.
- Setting any ownership field. Owner references are always derived server-side from the verified credential, never accepted from request bodies.

## 6. Changes if accounts are introduced (**[Planned]**, D-05)

- Ownership moves from "holder of a token" to "authenticated account". Records gain an account reference set server-side.
- Existing anonymous records may be *claimed once* by proving possession of their token, then re-owned; claiming must be atomic and auditable.
- Multiple jobs per user become listable *for that user only*.
- Add rules for account deletion that cascade to recordings, jobs, songs and credentials, and for revoking sessions.
- Introduce administrative roles with separate, narrowly scoped, audited permissions; no role may read raw recordings by default.
- Re-run every isolation test below with two distinct accounts, plus the anonymous-to-account claim path.
- Re-assess [data-retention.md](data-retention.md) because stored data becomes identifiable.

## 7. Required isolation tests

These must exist as automated tests against the real database and API (not mocks) before any release that stores user data. All are **[Planned]**.

1. **Cross-requester read:** requester A creates a job; requester B (valid but different credential) requests A's job status, recording and song by ID: every request is denied and returns the same response as a nonexistent ID.
2. **No credential / malformed / expired credential:** every protected endpoint denies access.
3. **Cross-requester write and delete:** B cannot update, replace or delete A's job, recording or song.
4. **Owner spoofing:** a request body or header that names another owner (or sets an owner field, status or song reference) is ignored or rejected.
5. **ID enumeration:** sequential or guessed IDs do not reveal existence; IDs are non-guessable.
6. **Signed URL scope:** a signed URL works only for its object and operation, expires on time, and cannot be reused for another object or after deletion.
7. **Direct access:** private storage and database endpoints reject unauthenticated direct requests.
8. **Server-only operations:** guest credentials cannot set job status, write songs, call provider-backed operations outside the allowed flow, or read abuse records.
9. **Template integrity:** guests cannot modify or delete template songs.
10. **Deletion:** after a delete, the job, recording and song are unreadable by the owner and by others, and storage objects are gone (see data-retention for backups).
11. **Retention expiry:** expired records and objects become inaccessible within the documented window.
12. **Account migration (if D-05 introduces accounts):** claiming works once, only for the token holder, and cannot be used to take another requester's records.
13. **Default deny:** a newly added table or bucket is inaccessible until explicit rules are added (checked in CI).

## 8. Unresolved decisions for this document

- **D-02** Database product, and whether row-level policies are native to it.
- **D-05** Identity model, which defines the "owner" in every rule.
- **D-03** Object storage and signed-URL mechanism.
- **D-07** Whether generated songs may ever be shared by link, which would deliberately weaken rule "own song only".
- **D-12** Backup policy, which affects the deletion test in item 10.
