# NameSinger: Data collection and retention

- **Reviewed against source:** 2026-11-06
- **Related:** [security.md](security.md) (rules, decision register), [auth.md](auth.md), [rls-policies.md](rls-policies.md), [threat-model.md](threat-model.md), [env.md](env.md)

**This document contains proposals and open questions, not legal advice.** It makes no claim of compliance with any law or standard. Qualified counsel must review the final policy, consent text and retention periods before public release (D-08). Retention figures below are **proposals** pending owner approval (D-06, D-07).

**Legend.** **[Implemented]** is verified in current source. **[Planned]** is not built. **[Decision]** needs owner approval.

## 1. Current state (Checkpoint 1.1)

Everything in this section describes the app as built and checked against source. **Nothing has been run on a physical device or emulator**, so runtime behaviour is unverified; automated tests cover the logic only.

- **[Implemented]** The app records a short voice clip (0.3 to 10 s) of the user saying their name and keeps it on the device only. Since Checkpoint 2 it is captured natively as a 16-bit mono **WAV** through expo-audio's audio stream (no longer m4a), and the app builds a personalized song from it **on the phone**; the song is also a WAV file (about 1 MB for 22 s) that contains the user's voice. Nothing is uploaded, transmitted or backed by any server: the app makes no network requests. Verified on an Android 15 emulator (Expo Go) only; no real device and no iOS build was used.
- **[Implemented]** A consent notice must be accepted before the first recording. It opens with a short summary (the microphone records the user's name; the recording stays on the phone and is not uploaded or shared; the phone will ask for microphone permission next) and keeps the full text, including that the app tries to delete the file and does not encrypt it, behind a "More details" button. The welcome screen asks for nothing and plays nothing until the user presses Play. The user can decline. The acknowledgement is saved in a small file in the app's document directory containing only the notice version and a timestamp (no audio, name or identifier), so the notice is not shown again until `CONSENT_NOTICE_VERSION` changes; a decline is not saved. The user can withdraw it in the app ("Recording consent" card, with confirmation): that deletes only the consent file, then the notice is required again before any recording. **Withdrawal does not delete or change any recording, song or preference**; they follow the lifecycle table below, and an existing recording stays visible and deletable while consent is off. It does not change Android's microphone permission. How it works: `docs/ux/consent-persistence.md`. Wording and version: `src/constants/consent.ts`.
- **[Implemented]** The optional language choice is held in memory only and is lost when the app restarts. It does not change the song yet.
- **[Implemented, unit-tested, not device-tested]** Recording file lifecycle (`src/hooks/recordingController.ts`, `recorderState.ts`, `recordingCleanup.ts`):

| Event | What happens to the file |
|---|---|
| Recording stopped, valid (URI present, file not empty, at least 300 ms) | Kept; state is `recorded` |
| Recording stopped, invalid (no URI, empty, too short) | Deleted; error shown |
| User approves | **Kept** for the rest of the session. Approval does not delete or move it |
| User rejects ("Re-record") | Old file deleted, new take started |
| User resets ("Record again") from `recorded` or `approved` | Deleted |
| Error after a clip exists | Deleted |
| OS interrupts or errors a take in progress | Recorder stopped, take deleted, user told |
| App goes to the background during a take | Recorder stopped, take deleted, user told |
| App goes to the background with an approved or recorded clip | Kept |
| Screen unmounts | Current clip and any take in progress deleted (best effort) |
| App killed, crashed or restarted | Leftover recordings **and generated songs** are removed by an orphan sweep of the `NameSinger` cache folder before the next recording is created (best effort; not tested after a real kill) |
| A file is playing when deletion is due | Deletion waits until playback stops |
| A delete fails | Retried up to 3 times; the user sees a fixed message; a fixed code is logged. After giving up, the message says it will be retried before the next recording, and the warning stays visible for the rest of the session |

- **Not deleted automatically:** an approved clip is not removed by a timer, and there is no deletion on approval. It persists until reset, re-record, unmount, or the next-launch sweep.
- **Logging:** cleanup failures are logged as fixed codes only (`delete_failed`, `gave_up`, `sweep_failed`). Neither URIs, paths nor error text are logged or returned. Tests assert this.
- **Not present:** privacy notice beyond the consent card, accounts, analytics, crash reporting, backend storage, backups.

So today no personal data leaves the device. Sections 2 onward describe the **planned** backend.

### 1.1 Recording storage: inspection findings

Method: read the installed `expo-audio` 58.0.11 native sources in `node_modules/expo-audio` (Kotlin and Swift), the TypeScript definitions, and the Android manifest produced by `npx expo prebuild --platform android --no-install` on 2026-11-06 (generated folder deleted afterwards). **No device, emulator or iOS build was used.** Items marked "platform behaviour" come from general Android/iOS documentation, not from testing this app.

**Where recordings are written (read from source):**

| Platform | Location | Evidence |
|---|---|---|
| Android | `<app cache directory>/NameSinger/name-<time>-<random>.wav` (recordings) and `.../NameSinger/song-<time>-<random>.wav` (generated songs) | Since Checkpoint 2 the app chooses the path itself (`newWorkFileUri` in `src/hooks/recordingFiles.ts`) and passes it to the audio stream. The earlier expo-audio m4a recorder paths no longer apply. The folder was **not** inspected on the device (Expo Go is not debuggable) |
| iOS | `<Caches directory>/NameSinger/...` (same app-chosen path) | Same code path; **not run on iOS** |

The app supplies an explicit file URI inside `Paths.cache/NameSinger`, so the assumption about where expo-audio writes no longer matters. `Paths.cache` is the app cache directory, which the OS may clear when storage is low.

**Can other applications read the files?**
- Source shows the files are written only inside the app's own cache directory (Android) or Caches directory (iOS); no external storage, shared media store or share extension is used by the recorder. I found no code that exposes them to other apps.
- Platform behaviour (not tested here): both operating systems sandbox these folders so other apps cannot read them. A rooted or jailbroken device, a debuggable build with developer tools, or someone with access to an unlocked device can read them. The app adds no extra protection.
- The generated Android manifest declares these permissions: `RECORD_AUDIO`, `INTERNET`, `MODIFY_AUDIO_SETTINGS`, `FOREGROUND_SERVICE`, `FOREGROUND_SERVICE_MEDIA_PLAYBACK`, `READ_EXTERNAL_STORAGE` and `WRITE_EXTERNAL_STORAGE` (both limited to Android 12 and below), `SYSTEM_ALERT_WINDOW` and `VIBRATE`. The app does not use the network, so `INTERNET` is unused today. The storage and overlay permissions look broader than needed (probably Expo or React Native defaults). **Open item:** review whether `android.blockedPermissions` can remove them; not changed because it was not checked on a device or against dev tooling.

**Backup and restore:**
- Android: the generated manifest originally had `android:allowBackup="true"` with no backup rules. Platform behaviour: Android Auto Backup excludes the app cache directory by default, so recordings should not have been backed up, but this was not tested. **Changed in Checkpoint 1.1:** `android.allowBackup` is set to `false` in `app.json`; the regenerated manifest shows `android:allowBackup="false"`. This stops Android from backing up or restoring any app data. Behaviour on a real device and during device-to-device transfer was not tested.
- iOS: platform behaviour is that the Caches folder is not included in iCloud or iTunes backups and may be purged by the system. `expo-audio` sets no "exclude from backup" flag and no file-protection class (searched its iOS and Android sources), so the files rely on those defaults. **Not verified on a device.**

**Encryption and secure deletion (no claim is made):**
- The app does not encrypt recordings and does not set a file-protection class. Any at-rest encryption comes from the operating system (for example full-device encryption), which depends on the device and was not verified. The consent text says the app does not encrypt the file.
- Deletion removes the file with the `expo-file-system` `File.delete()`. It does not overwrite the data. **Secure deletion is not claimed**; on flash storage deleted data may remain recoverable until overwritten.

**Sweep:** it lists `Paths.cache/NameSinger` and deletes every file in it. Because the app now writes only there, the earlier unverified assumption (that `Paths.cache` equals expo-audio's recording directory) is gone. Whether the sweep works after a real force-kill is still untested on a device.

**To verify before relying on any of this (manual device checklist):**
1. Record, approve, kill the app, relaunch, record again: confirm the old file is gone (Android Studio Device Explorer or `adb shell run-as` on a debug build; Xcode container download on iOS).
2. Confirm the folder paths above on both platforms.
3. Confirm Auto Backup is disabled (`adb shell bmgr`/`dumpsys backup`) and that nothing from the app appears in an iOS backup.
4. Confirm recording stops and the file is removed when the app is backgrounded, and when a phone call interrupts a take.
5. Confirm delete-while-playing behaviour and the cleanup warning (for example by making a file read-only in a debug build).

## 2. Personal data inventory (planned)

| Data | Why it is needed | Required? | Notes |
|---|---|---|---|
| **Raw voice recording of the user's name** | Source of the name audio spliced into the personalized song | Yes, for the core feature | Highest sensitivity; a voice sample identifies a person |
| **Language selection** | Chooses the template song | Yes | Low sensitivity |
| **Generated song** (contains the recorded name) | The product the user receives | Yes | Contains personal voice content |
| **Ownership credential** (hashed capability token, or account link) | Lets the user, and only the user, retrieve or delete their data | Yes (D-05) | Store only a hash of tokens |
| **Job metadata** (job ID, timestamps, status, error code, template ID) | Run and debug the pipeline | Yes | Keep minimal; no names |
| **Network identifiers** (IP address, coarse device signals) | Rate limiting and abuse prevention | Only transiently | Retain briefly and only in aggregated or hashed form where feasible |
| **Text form of the name** (typed or transcribed) | Not needed by the recorded-name design | **No, by default** | Storing it is a decision (D-11); avoid unless required |
| **Crash/analytics data** | Reliability | Optional (D-13) | Must not capture audio or names |
| **Consent record** (version accepted, timestamp, credential reference) | Evidence of what the user agreed to | Yes if consent is required (D-08) | Keep minimal |

Data **not** collected by design: contacts, location, advertising identifiers, payment data, email addresses (unless accounts are adopted, D-05).

## 3. Retention (proposed; all require approval)

| Data | Proposed retention | Rationale / decision |
|---|---|---|
| Raw recording on the device | Delete after upload is confirmed (**[Planned]**, no upload exists), on reject, reset, interruption and unmount, and sweep orphans at next launch | Reject, reset, interruption, unmount and the sweep are implemented and unit-tested; not device-tested (section 1). An approved clip currently stays until one of those events |
| Raw recording on the server | Delete immediately after the song has been produced successfully; hard maximum **24 hours** for any raw recording, including failed or abandoned jobs | **D-06.** Raw voice is the most sensitive asset, so keep it as short as the pipeline allows |
| Re-encoded working copies and temporary worker files | Delete when the job ends; ephemeral storage preferred | Same as above |
| Generated song | Proposed **30 days** after creation, then deleted; the user can delete earlier. Shorter if songs are not meant to be re-downloaded | **D-07.** Whether songs are retained at all, and whether they can be shared by link, is the owner's call |
| Job metadata | Proposed 30 days, aligned with the song; no personal content | |
| Ownership credential hash | Same lifetime as the job it protects | |
| Rate-limit and abuse records | Hours to days; no names or audio | **D-14** |
| Application logs | Proposed 14 days, containing no names, audio, tokens or signed URLs | See [security.md](security.md) 3.3 |
| Crash reports | Proposed 30 to 90 days if used | D-13 |
| Consent records | Retain for as long as needed to evidence consent; period set with counsel | D-08 |
| Template songs | Not personal data; retained indefinitely | |

Does the service retain generated audio? **Proposed answer: yes, briefly (30 days) so the user can replay and download it, and then no.** Raw recordings are not retained beyond processing (maximum 24 hours). These are proposals, not facts about any system.

## 4. Deletion requirements (planned)

1. **User-initiated deletion:** the user can delete their job, recording and song from the app. Deletion must remove the database rows, every object copy (raw, re-encoded, generated, derived), cached copies and CDN entries, and cancel any queued job.
2. **Automatic expiry:** storage lifecycle rules and a scheduled deletion job enforce the retention periods above. Expiry is verified by tests, not assumed.
3. **Deletion is authorized:** only the owner (or a documented, logged administrative process) can request it; see [rls-policies.md](rls-policies.md).
4. **Deletion is auditable without personal data:** keep a record that a deletion occurred (ID, time), never the content.
5. **Provider deletion:** if any data was sent to a third-party provider, deletion there must also be possible and confirmed (section 7).
6. **Failure handling:** a failed deletion is retried and alerted on; it is never silently ignored.
7. **Incident deletion:** the operator can purge all data for a given job or time range.

## 5. Backups and replicas

**[Planned]; D-12 undecided.** Questions that must be answered before any backup is enabled:

- Do backups include raw recordings at all? **Preferred:** exclude raw recordings and generated audio from backups, and back up only non-personal configuration and metadata.
- If database or storage backups do contain personal data, what is their retention, and does a user's deletion request age out of them within a documented, disclosed window?
- Are there replicas, search indexes, CDN caches, data warehouse copies or log archives holding the same data? Each needs a retention rule.
- How are backups encrypted and who can restore from them?
- Is "put beyond use until the backup expires" acceptable, and is it disclosed to users?

Do not claim immediate or complete deletion in user-facing text unless backup behaviour has been verified to support it.

## 6. User consent (planned; D-08 and D-09)

The product owner and counsel must decide the exact requirements. The recommended engineering baseline:

- **Before the first recording is uploaded** (not merely recorded locally), show a clear, plain-language notice stating: what is collected (a voice clip of the name), why, who processes it (including any third-party provider), how long it is kept, and how to delete it. The iOS microphone prompt alone is not an adequate disclosure for uploading and processing.
- Obtain an affirmative action (for example a button or checkbox), not a pre-ticked box, and record the version of the notice accepted.
- Make the notice available in the languages the app supports.
- Give the user a way to withdraw consent and delete data, and make that as easy as giving it.
- Do not use recordings for any purpose beyond the requested song (no model training, no marketing, no voice cloning) unless a separate, specific consent is obtained.
- Decide how to handle minors (D-09): minimum age, whether guardian consent is needed, and whether the app should be offered to children.
- Provide a privacy notice and a contact route for requests.
- **[Implemented in Checkpoint 1.1]** A local-only consent card precedes the first recording (section 1). It does **not** cover uploading, third-party processing or a retention period, none of which exist. The upload-time notice described above is still **[Planned]** and must be added before any upload; the current text promises to ask again. The acknowledgement is persisted locally as described in section 1; it is not sent anywhere.

## 7. Third-party AI provider data handling: questions to verify

No provider is selected (D-04), and none of the answers below is known. Verify each from the provider's current official terms, privacy policy and data-processing documentation, and record the source and date. Do not send any user data until the answers are acceptable.

1. What exactly is sent: the raw audio, a text name, or only non-personal prompts? Can the design avoid sending raw voice at all?
2. Is submitted data stored, for how long, and where (country or region)? Can that region be chosen?
3. Is data used to train or improve the provider's models? Is there an opt-out, and is it contractual or only a setting?
4. Do humans review submitted content?
5. Can submitted data and outputs be deleted on request, and is there an API for it? How is deletion confirmed?
6. What zero-retention or enterprise options exist, and what do they cost?
7. Who are the provider's sub-processors?
8. What are the commercial-use and output-ownership terms for generated audio? Are there restrictions on voice content, or watermarking requirements?
9. What security certifications and breach-notification commitments exist?
10. What happens to data if the account is closed or the provider changes terms?
11. Are voice-cloning or biometric-related restrictions stated?
12. Does using the provider change the consent text and the retention periods above?

## 8. Unresolved decisions for this document

- **D-06** Raw voice retention period (proposal: delete after processing, max 24 hours).
- **D-07** Generated-song retention and sharing (proposal: 30 days, private by default).
- **D-08** Consent text, privacy notice, jurisdiction and legal review.
- **D-09** Minors.
- **D-11** Whether any text form of the name is stored (proposal: no).
- **D-12** Backups and deletion propagation.
- **D-13** Crash and analytics vendor.
- **D-04** Provider selection, which determines section 7.
- **D-05** Identity model, which determines how deletion is authorized.
