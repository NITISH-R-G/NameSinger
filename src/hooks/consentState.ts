export type ConsentStatus = 'unanswered' | 'accepted' | 'declined';

export type ConsentAction =
  | { type: 'ACCEPT' }
  /** A saved acknowledgement of the current notice version was found at launch. */
  | { type: 'RESTORE' }
  /** The user withdrew consent and storage confirmed it. Back to the consent-required state. */
  | { type: 'WITHDRAW' }
  | { type: 'DECLINE' }
  | { type: 'RECONSIDER' };

export interface ConsentState {
  status: ConsentStatus;
}

export const initialConsentState: ConsentState = { status: 'unanswered' };

/**
 * Whether the user may record in this session. An acknowledgement is persisted separately
 * (consentStore.ts) and restored with RESTORE; a decline is not persisted, so a user who declined
 * is asked again next launch. Acknowledging consent says nothing about Android's microphone
 * permission, which is asked of the OS on every recording.
 */
export function consentReducer(state: ConsentState, action: ConsentAction): ConsentState {
  switch (action.type) {
    case 'ACCEPT':
      return state.status === 'accepted' ? state : { status: 'accepted' };
    case 'RESTORE':
      return state.status === 'unanswered' ? { status: 'accepted' } : state;
    case 'WITHDRAW':
      return state.status === 'unanswered' ? state : { status: 'unanswered' };
    case 'DECLINE':
      // Declining never overrides an acceptance already given in this session.
      return state.status === 'unanswered' ? { status: 'declined' } : state;
    case 'RECONSIDER':
      return state.status === 'declined' ? { status: 'unanswered' } : state;
    default:
      return state;
  }
}

export function canRecord(state: ConsentState): boolean {
  return state.status === 'accepted';
}
