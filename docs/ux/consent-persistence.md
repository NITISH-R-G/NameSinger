# Consent persistence and versioning

Implemented in `src/hooks/consentStore.ts` (logic), `consentFile.ts` (storage), `useConsent.ts` (React wiring), `consentState.ts` (session state) and `src/constants/consent.ts` (text and version). Tests: `__tests__/consentPersistence.test.ts`.

## What is stored

One JSON file, `namesinger-consent.json`, in the app's **document directory** (kept between launches; not the cache):

```json
{ "version": "local-recording-1", "acknowledgedAt": "2026-11-08T10:00:00.000Z" }
```

Nothing else: no audio, no name, no identifier. It uses `expo-file-system`, which was already a dependency. It is not in the cache folder `NameSinger/` that is swept for recordings, so the sweep never deletes it and the consent file never counts as voice data. Voice recordings and songs are handled exactly as before (cache folder, deleted on re-record, reset, unmount and by the next-launch sweep).

## Behavior

| Situation | Result |
|---|---|
| First launch (no file) | Consent notice shown |
| User taps "I agree, continue" | The record is written and read back. Recording is allowed for the session |
| Next launch, same version | The notice is skipped. The record button is shown directly |
| Next launch, different version | The notice is shown again; accepting replaces the record |
| File unreadable, corrupt, or malformed | Treated as not acknowledged: the notice is shown. Consent is never assumed |
| User taps "No thanks" | Not saved. The notice returns next launch |
| Write fails, or cannot be read back | The user is told "We couldn't save your choice on this phone, so we'll ask again next time. You can still continue now." The session proceeds because the user did choose to continue, but nothing is recorded as saved and the next launch asks again |
| Double tap on Agree | One write only |

While the saved choice is being read, the card shows nothing, so the notice does not flash before a saved acknowledgement is restored.

## Consent is not microphone permission

- Acknowledging the notice only unlocks the Record button. **Every** time the user records, the app asks Android for the microphone (`requestRecordingPermissionsAsync`), which returns the real current state.
- Nothing in the consent code touches permissions, and nothing in the permission code reads the consent file (asserted by tests).
- If the user later revokes the microphone in Android Settings, the next Record meets the existing recovery flow: "Microphone not allowed" with Try again, or, if Android will no longer ask, "Microphone is blocked" with Open settings. Returning from Settings with the permission granted restores the Record button.

## Versioning: how to ask again

`CONSENT_NOTICE_VERSION` in `src/constants/consent.ts` is the version of the notice users acknowledge. A saved acknowledgement counts only if its version is **exactly equal** to the current one (no prefix or case matching, and a newer stored version also counts as different).

**Bump it** (for example `local-recording-1` to `local-recording-2`) when the notice or recording practice changes materially:
- anything leaves the phone (upload, a server, a third-party service, analytics that carry the voice or name);
- retention changes (the recording or song is kept longer, or somewhere else);
- encryption or deletion claims change;
- a new use of the voice is added (for example sharing, training, or a different song service);
- the microphone is used for something new.

**Do not bump it** for typo fixes, layout, or copy that does not change meaning.

When you bump it: update the consent text first, change the version in the same commit, update `consentPersistence.test.ts` if it hard-codes anything, and note the change here. All existing users then see the notice once more.

## Withdrawing consent

Code: `withdrawConsent` in `consentStore.ts`, `useConsent().withdraw`, `src/components/ConsentSettings.tsx`, the `WITHDRAW_*` copy in `src/constants/consent.ts`. Tests: `__tests__/consentWithdrawal.test.ts`.

**Where:** the "Recording consent" card at the bottom of the create screen. There is no separate settings screen or route. While recording is allowed it shows "You agreed to let NameSinger record your name on this phone." and a secondary button, **Withdraw recording consent**. While recording is off it shows "Recording is off until you agree again above."

**Flow:**
1. Tap **Withdraw recording consent**. Nothing changes yet. The button is disabled, with a short reason, while the microphone is starting, recording or stopping, so a take in progress is never interrupted.
2. The card shows what withdrawing does and does not do (below), with **Withdraw consent** (primary) and **Cancel** (grey). Nothing is red, because nothing is deleted.
3. **Cancel** closes the card. Storage and consent are unchanged.
4. **Withdraw consent** removes the saved record, then reads storage again to confirm. Only after that is confirmed does the app return to the consent-required state and speak "Consent withdrawn. Recording is off until you agree again."
5. The recorder card now shows the consent notice. The next recording needs a fresh acknowledgement. Agreeing again saves a new record. It does not start recording: the user still taps Record, and Android's permission is asked as usual.

**What the confirmation says (and what is true):**

| Topic | Statement | Why it is true |
|---|---|---|
| Recording | NameSinger stops recording; asks you to agree again first | `canRecord` is false, so the controller refuses to start and the Record button is not shown |
| A recording already made | Not deleted by this. It stays until you delete it, record again, or the app clears it when it closes or next starts | Withdrawal never touches recording files. Existing lifecycle: `docs/security/data-retention.md` |
| A song already made | Not deleted by this, still playable. It stays until you delete the recording it was made from, make it again, or the app closes | The song card and its file are untouched. Existing lifecycle as above |
| Other choices | The optional language choice is not changed | It is in memory and nothing here touches it |
| Android microphone permission | Not changed. Use Android Settings | The withdrawal code never calls any permission API (asserted by tests) |

**A recording that exists when consent is off.** The recorder card would otherwise be replaced by the consent notice, hiding a recording that is still on the phone. So while consent is off, an existing recording stays visible, can be played, and can be deleted (with the usual confirmation). Nothing can record, re-record or approve until the user agrees again.

**Failure handling:** the saved record is deleted; if that fails or does not take effect, it is overwritten with a record that can never match a notice version. Each step is checked by reading storage again. If nothing can be confirmed (both fail, or storage cannot be read afterwards) the app does **not** claim success: consent stays on, and the card says "We couldn't withdraw your consent, so it is still on. Please try again." A second tap while withdrawing is ignored.

**Active sessions:** recording blocks the button (above). Playback is unaffected. If consent were turned off mid-take by some other route, the take still stops normally and is kept.

**Consent and Android permission:** unchanged by withdrawal in both directions. Withdrawing does not revoke the microphone, and agreeing again does not grant it. The permission is asked of Android on every recording, and revoked or blocked states use the existing recovery flow.

## Known limits

- Withdrawal is in the app (see below). Clearing the app's data in Android Settings also removes the record.
- The record is not encrypted or signed; someone with access to the app's private storage could edit it. It is a record of the user's own choice on their own phone, not a legal evidence store.
- Not verified on a physical device or on iOS. Checked on the Android emulator only.
- Legal review of the wording remains open (decision D-08 in `docs/security`).
