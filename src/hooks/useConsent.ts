import { useCallback, useEffect, useReducer, useRef, useState } from 'react';

import { CONSENT_NOTICE_VERSION } from '../constants/consent';
import { consentReducer, initialConsentState, type ConsentState } from './consentState';
import { consentFilePort } from './consentFile';
import { loadConsent, saveConsent, withdrawConsent, type ConsentStorePort } from './consentStore';

export interface UseConsentResult {
  state: ConsentState;
  /** False until storage has been read, so the notice does not flash before a saved choice loads. */
  ready: boolean;
  /** The acknowledgement could not be saved, so this session only; the notice returns next launch. */
  saveFailed: boolean;
  /** Resolves true only when the acknowledgement was confirmed in storage. The session proceeds either way. */
  accept: () => Promise<boolean>;
  /** Withdrawal could not be confirmed in storage; consent is unchanged and still on. */
  withdrawalFailed: boolean;
  /** Resolves true only when storage confirmed the withdrawal and the app is back to consent-required. */
  withdraw: () => Promise<boolean>;
  decline: () => void;
  reconsider: () => void;
}

export function useConsent(port: ConsentStorePort = consentFilePort): UseConsentResult {
  const [state, dispatch] = useReducer(consentReducer, initialConsentState);
  const [ready, setReady] = useState(false);
  const [saveFailed, setSaveFailed] = useState(false);
  const [withdrawalFailed, setWithdrawalFailed] = useState(false);
  const saving = useRef(false);
  const withdrawing = useRef(false);

  useEffect(() => {
    let active = true;
    void loadConsent(port, CONSENT_NOTICE_VERSION).then((loaded) => {
      if (!active) return;
      if (loaded.acknowledged) dispatch({ type: 'RESTORE' });
      setReady(true);
    });
    return () => {
      active = false;
    };
  }, [port]);

  const accept = useCallback(async (): Promise<boolean> => {
    if (saving.current) return false; // a second tap cannot start a second write
    saving.current = true;
    try {
      const result = await saveConsent(port, CONSENT_NOTICE_VERSION);
      setSaveFailed(!result.saved);
      // The user did choose to continue, so this session proceeds either way. Whether it was
      // stored is reported separately and is never assumed.
      dispatch({ type: 'ACCEPT' });
      return result.saved;
    } finally {
      saving.current = false;
    }
  }, [port]);

  const withdraw = useCallback(async () => {
    if (withdrawing.current || saving.current) return false;
    withdrawing.current = true;
    setWithdrawalFailed(false);
    try {
      const result = await withdrawConsent(port, CONSENT_NOTICE_VERSION);
      if (!result.withdrawn) {
        // Consent stays on, exactly as it was, and the user is told.
        setWithdrawalFailed(true);
        return false;
      }
      setSaveFailed(false);
      dispatch({ type: 'WITHDRAW' });
      return true;
    } finally {
      withdrawing.current = false;
    }
  }, [port]);

  const decline = useCallback(() => dispatch({ type: 'DECLINE' }), []);
  const reconsider = useCallback(() => dispatch({ type: 'RECONSIDER' }), []);

  return { state, ready, saveFailed, accept, withdrawalFailed, withdraw, decline, reconsider };
}
