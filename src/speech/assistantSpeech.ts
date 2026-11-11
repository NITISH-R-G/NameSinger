import { createLevelEmitter, type LevelSource } from '../audio/levels';

/**
 * What the assistant's speech engine must provide. The real implementation wraps expo-speech
 * (`expoSpeechPort.ts`); tests use a fake. Text to speech engines do not expose their audio, so the
 * only live signals are the engine's own events: start, each word reached, done, stopped, error.
 */
export interface SpeechPort {
  speak: (
    text: string,
    handlers: {
      onStart: () => void;
      onDone: () => void;
      onStopped: () => void;
      onError: () => void;
      /** The utterance reached a word of this length (characters). Optional: not every engine reports it. */
      onWord?: (length: number) => void;
    },
  ) => void;
  stop: () => void;
}

export type SpeechStatus = 'idle' | 'speaking';

export interface AssistantSpeech {
  /**
   * Speaks the text after anything already queued. Returns false (and speaks nothing) when speech
   * is unavailable or voice mode is off, so the caller can fall back to text only.
   */
  speak: (text: string) => boolean;
  /** Stops the current utterance and drops the queue. Safe to call at any time. */
  stop: () => void;
  status: () => SpeechStatus;
  /** True after an engine error: the app then stays text only. */
  unavailable: () => boolean;
  /** Voice mode on or off. Turning it off stops speech at once. */
  setEnabled: (enabled: boolean) => void;
  isEnabled: () => boolean;
  subscribeStatus: (listener: (status: SpeechStatus) => void) => () => void;
  /** A short pulse per word the engine reports; 0 otherwise. Never an invented amplitude. */
  level: LevelSource;
  /** Texts spoken or started since creation, for tests and diagnostics. */
  spokenCount: () => number;
}

export interface AssistantSpeechOptions {
  /** How long to wait for the engine to report that it started before treating it as unavailable (ms). */
  startTimeoutMs?: number;
  schedule?: (callback: () => void, ms: number) => unknown;
  cancel?: (handle: unknown) => void;
}

/**
 * The assistant's voice. One utterance at a time, in order; a stop clears everything; an engine
 * error switches to text only instead of pretending to speak. It never touches the microphone: the
 * conversation layer decides when speaking is allowed.
 */
export function createAssistantSpeech(port: SpeechPort, options: AssistantSpeechOptions = {}): AssistantSpeech {
  const schedule = options.schedule ?? ((cb, ms) => setTimeout(cb, ms));
  const cancel = options.cancel ?? ((handle) => clearTimeout(handle as ReturnType<typeof setTimeout>));
  const startTimeoutMs = options.startTimeoutMs ?? 8000;
  /** Consecutive utterances that failed to start or errored. One slow start is tolerated; two in a row is not. */
  const FAILURES_BEFORE_UNAVAILABLE = 2;
  let failures = 0;
  const RETRY_DELAY_MS = 700;
  const levelEmitter = createLevelEmitter();
  const listeners = new Set<(status: SpeechStatus) => void>();
  const queue: string[] = [];
  let status: SpeechStatus = 'idle';
  let enabled = true;
  let broken = false;
  let spoken = 0;
  /** Bumped on every stop, so callbacks of an utterance that was stopped are ignored. */
  let generation = 0;
  let decay: unknown = null;

  function setStatus(next: SpeechStatus): void {
    if (status === next) return;
    status = next;
    for (const listener of [...listeners]) listener(status);
  }

  function pulse(length: number): void {
    if (decay !== null) cancel(decay);
    levelEmitter.emit(Math.min(0.9, 0.45 + length * 0.05));
    decay = schedule(() => {
      decay = null;
      levelEmitter.emit(0);
    }, 140);
  }

  function silence(): void {
    if (decay !== null) cancel(decay);
    decay = null;
    levelEmitter.emit(0);
  }

  /**
   * The utterance did not work (often the engine was still starting). Try the same text once more
   * after a short pause, so the first question is not lost; after repeated failures stay text only.
   */
  function failed(text: string): void {
    failures += 1;
    if (failures >= FAILURES_BEFORE_UNAVAILABLE) {
      broken = true;
      queue.length = 0;
      setStatus('idle');
      return;
    }
    queue.unshift(text);
    const mine = generation;
    schedule(() => {
      if (mine === generation && status === 'speaking') next();
    }, RETRY_DELAY_MS);
  }

  function next(): void {
    if (!enabled || broken) {
      queue.length = 0;
      setStatus('idle');
      return;
    }
    const text = queue.shift();
    if (text === undefined) {
      setStatus('idle');
      silence();
      return;
    }
    const mine = generation;
    const alive = () => mine === generation;
    spoken += 1;
    setStatus('speaking');
    // An engine that never reports a start (no voice installed, a stuck service) must not leave the
    // app saying it is speaking: after the timeout it counts as unavailable and the app stays text only.
    let startWatch: unknown = schedule(() => {
      startWatch = null;
      if (!alive()) return;
      generation += 1;
      port.stop();
      silence();
      failed(text);
    }, startTimeoutMs);
    const started = () => {
      if (startWatch !== null) cancel(startWatch);
      startWatch = null;
    };
    port.speak(text, {
      onStart: () => {
        started();
        failures = 0;
      },
      onWord: (length) => {
        if (alive()) pulse(length);
      },
      onDone: () => {
        started();
        if (!alive()) return;
        silence();
        next();
      },
      onStopped: () => {
        // A stop we asked for already moved on; nothing to do.
      },
      onError: () => {
        started();
        if (!alive()) return;
        silence();
        failed(text);
      },
    });
  }

  return {
    speak(text) {
      if (!enabled || broken || text.trim().length === 0) return false;
      queue.push(text);
      if (status === 'idle') next();
      return true;
    },
    stop() {
      generation += 1;
      queue.length = 0;
      silence();
      if (status === 'speaking') port.stop();
      setStatus('idle');
    },
    status: () => status,
    unavailable: () => broken,
    setEnabled(value) {
      if (value === enabled) return;
      enabled = value;
      if (!value) {
        generation += 1;
        queue.length = 0;
        silence();
        if (status === 'speaking') port.stop();
        setStatus('idle');
      }
    },
    isEnabled: () => enabled,
    subscribeStatus(listener) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    level: levelEmitter,
    spokenCount: () => spoken,
  };
}
