import {
  CONSENT_ACCEPT_LABEL,
  CONSENT_DECLINE_LABEL,
  CONSENT_DECLINED_MESSAGE,
  CONSENT_POINTS,
} from '../src/constants/consent';
import {
  canRecord,
  consentReducer,
  initialConsentState,
  type ConsentAction,
  type ConsentState,
} from '../src/hooks/consentState';

const run = (actions: ConsentAction[], from: ConsentState = initialConsentState) =>
  actions.reduce(consentReducer, from);

describe('consent state', () => {
  it('starts unanswered and does not allow recording', () => {
    expect(initialConsentState.status).toBe('unanswered');
    expect(canRecord(initialConsentState)).toBe(false);
  });

  it('allows recording only after acceptance', () => {
    const accepted = run([{ type: 'ACCEPT' }]);
    expect(accepted.status).toBe('accepted');
    expect(canRecord(accepted)).toBe(true);
  });

  it('blocks recording after the user declines', () => {
    const declined = run([{ type: 'DECLINE' }]);
    expect(declined.status).toBe('declined');
    expect(canRecord(declined)).toBe(false);
  });

  it('lets a declined user reconsider and then accept', () => {
    const state = run([{ type: 'DECLINE' }, { type: 'RECONSIDER' }]);
    expect(state.status).toBe('unanswered');
    expect(canRecord(run([{ type: 'ACCEPT' }], state))).toBe(true);
  });

  it('does not let a late decline override an acceptance', () => {
    expect(run([{ type: 'ACCEPT' }, { type: 'DECLINE' }]).status).toBe('accepted');
  });

  it('ignores reconsider unless declined', () => {
    expect(run([{ type: 'ACCEPT' }, { type: 'RECONSIDER' }]).status).toBe('accepted');
  });
});

describe('consent wording', () => {
  const text = [...CONSENT_POINTS, CONSENT_DECLINED_MESSAGE].join(' ');

  it('states the local-only behaviour and the microphone use', () => {
    expect(text).toMatch(/microphone/i);
    expect(text).toMatch(/stays on your phone/i);
    expect(text).toMatch(/does not upload/i);
  });

  it('does not claim encryption, secure or guaranteed deletion, or uploading', () => {
    expect(text).toMatch(/does not encrypt/i);
    expect(text).not.toMatch(/\bencrypted\b|\bsecurely\b|\bguarantee|permanently deleted|automatically deleted/i);
    expect(text).not.toMatch(/we (upload|store|send)|is uploaded|will be uploaded/i);
  });

  it('has clear accept and decline choices', () => {
    expect(CONSENT_ACCEPT_LABEL.length).toBeGreaterThan(0);
    expect(CONSENT_DECLINE_LABEL.length).toBeGreaterThan(0);
  });
});
