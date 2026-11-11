import { useEffect, useMemo, useSyncExternalStore } from 'react';

import { useAppActive } from '../hooks/useAppActive';
import { createAssistantSpeech, type AssistantSpeech } from './assistantSpeech';
import { expoSpeechPort } from './expoSpeechPort';

export interface UseAssistantSpeechResult {
  speech: AssistantSpeech;
  /** True from the moment the engine starts an utterance until it finishes or is stopped. */
  speaking: boolean;
}

/**
 * The assistant's voice for the screen. Voice mode on or off maps to enabled; leaving the
 * foreground or unmounting stops speech, so it never talks over another app or a recording.
 */
export function useAssistantSpeech(enabled: boolean): UseAssistantSpeechResult {
  const speech = useMemo(() => createAssistantSpeech(expoSpeechPort), []);
  const status = useSyncExternalStore(speech.subscribeStatus, speech.status);
  const appActive = useAppActive();

  useEffect(() => {
    speech.setEnabled(enabled);
  }, [speech, enabled]);

  useEffect(() => {
    if (!appActive) speech.stop();
  }, [speech, appActive]);

  useEffect(() => () => speech.stop(), [speech]);

  return { speech, speaking: status === 'speaking' };
}
