import * as Speech from 'expo-speech';

import type { SpeechPort } from './assistantSpeech';

/**
 * The real speech engine: the phone's own text to speech through expo-speech. No network, no paid
 * service, no prerecorded audio. The text spoken is exactly the text passed in.
 */
export const expoSpeechPort: SpeechPort = {
  speak(text, handlers) {
    Speech.speak(text, {
      onStart: handlers.onStart,
      onDone: handlers.onDone,
      onStopped: handlers.onStopped,
      onError: () => handlers.onError(),
      onBoundary: handlers.onWord
        ? (event: { charLength?: number }) => {
            const length = typeof event?.charLength === 'number' && event.charLength > 0 ? event.charLength : 4;
            handlers.onWord?.(length);
          }
        : null,
    });
  },
  stop() {
    void Speech.stop();
  },
};
