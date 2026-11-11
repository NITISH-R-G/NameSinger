/**
 * The version of the notice a user acknowledges. The acknowledgement is stored with this value
 * (src/hooks/consentStore.ts) and only counts while it equals the current one, so changing it
 * asks everyone again. Bump it when the wording changes materially or recording practice changes
 * (for example anything leaves the phone, retention changes, or a new use of the voice is added).
 * Do not bump it for typo fixes. Rules and examples: docs/ux/consent-persistence.md.
 */
export const CONSENT_NOTICE_VERSION = 'local-recording-1';

export const CONSENT_TITLE = 'Before you record';

/** The short version shown first. The full points below sit behind "More details". */
export const CONSENT_SUMMARY =
  'NameSinger uses your microphone to record you saying your name. The recording stays on your phone and is not uploaded or shared. Your phone will ask you to allow the microphone next.';
export const CONSENT_DETAILS_SHOW_LABEL = 'More details';
export const CONSENT_DETAILS_HIDE_LABEL = 'Hide details';

/**
 * Accuracy rules for this text (see docs/security/data-retention.md):
 * - Only describe behaviour that exists in this build.
 * - Do not say recordings are uploaded, encrypted or guaranteed deleted. They are none of those.
 */
export const CONSENT_POINTS: readonly string[] = [
  'NameSinger will use your microphone to record you saying your name.',
  'In this version the recording stays on your phone. The app does not upload or share it.',
  'It is saved as a temporary file. The app tries to delete it when you record again or start over, and removes any leftover file before your next recording. The app does not encrypt it.',
  'Your song is made on your phone from your recording. If a future version sends anything off your phone, the app will ask you again first.',
];

export const CONSENT_ACCEPT_LABEL = 'I agree, continue';
export const CONSENT_DECLINE_LABEL = 'No thanks';
export const CONSENT_DECLINED_MESSAGE =
  'No problem. The microphone was not used and nothing was recorded. You can change your mind at any time.';
export const CONSENT_RECONSIDER_LABEL = 'Review again';

/**
 * Withdrawal wording. Accuracy rules: say only what the app really does (see
 * docs/ux/consent-persistence.md). Withdrawing deletes nothing. The lifetimes below are the
 * existing retention behaviour in docs/security/data-retention.md.
 */
export const WITHDRAW_SECTION_TITLE = 'Recording consent';
export const WITHDRAW_STATUS_ON = 'You agreed to let NameSinger record your name on this phone.';
export const WITHDRAW_STATUS_OFF = 'Recording is off until you agree again above.';
export const WITHDRAW_OPEN_LABEL = 'Withdraw recording consent';
export const WITHDRAW_UNAVAILABLE_HINT = 'You can withdraw consent when you are not recording.';
export const WITHDRAW_CONFIRM_TITLE = 'Withdraw recording consent?';
export const WITHDRAW_CONFIRM_LABEL = 'Withdraw consent';
export const WITHDRAW_CANCEL_LABEL = 'Cancel';
export const WITHDRAW_POINTS: readonly { heading: string; text: string }[] = [
  {
    heading: 'Recording',
    text: 'NameSinger will stop recording your voice. The next time you want to record, it will ask you to agree again first.',
  },
  {
    heading: 'A recording you already made',
    text: 'It is not deleted by this. It stays on this phone until you delete it, record again, or the app clears it when it closes or next starts.',
  },
  {
    heading: 'A song you already made',
    text: 'It is not deleted by this, and you can still play it. It stays until you delete the recording it was made from, make it again, or the app closes.',
  },
  {
    heading: 'Other choices',
    text: 'Your optional language choice is not changed.',
  },
  {
    heading: "Your phone's microphone permission",
    text: 'This does not change it. To turn it off or on, use Android Settings.',
  },
];
export const WITHDRAW_FAILED_MESSAGE =
  "We couldn't withdraw your consent, so it is still on. Please try again.";
export const WITHDRAWN_ANNOUNCEMENT = 'Consent withdrawn. Recording is off until you agree again.';
export const WITHDRAWN_EXISTING_RECORDING_NOTE =
  'Recording is off. This recording stays on your phone until you delete it or the app clears it.';
export const CONSENT_SAVE_FAILED_MESSAGE =
  "We couldn't save your choice on this phone, so we'll ask again next time. You can still continue now.";
