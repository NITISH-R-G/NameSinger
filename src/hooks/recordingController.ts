import type { RecorderAction, RecorderState } from '../types';
import {
  CLEANUP_WARNING_GAVE_UP,
  CLEANUP_WARNING_RETRYING,
  createCleanupQueue,
  type CleanupFailureCode,
} from './recordingCleanup';
import {
  initialRecorderState,
  recorderReducer,
  uriToDiscard,
  validateRecording,
} from './recorderState';

/**
 * Plain TypeScript coordinator for the recording lifecycle. React is not involved, so every
 * transition (start, stop, reject, reset, interruption, backgrounding, cleanup failure) can be
 * unit-tested. `useNameRecorder` is a thin wrapper that supplies real expo-audio ports.
 *
 * File lifecycle (the rules enforced here):
 *  - A take is deleted when the state stops referencing it (reject, re-record, reset, error).
 *  - An approved recording is kept for the rest of the session. It is deleted on reset,
 *    re-record, unmount, or by the orphan sweep at the next launch.
 *  - A take in progress is discarded if the OS interrupts it or the app goes to the background.
 *  - A file being played is never deleted; deletion waits until playback stops.
 *  - Delete failures are retried, surfaced as a fixed message and logged as a fixed code only.
 */

export const INTERRUPTED_MESSAGE =
  'The recording was interrupted, so it was discarded. Please try again.';
export const BACKGROUND_MESSAGE =
  'The recording stopped because the app moved to the background, so it was discarded. Please try again.';

export interface RecorderSnapshot {
  uri: string | null;
  durationMs: number;
  fileSize: number;
}

/** The slice of expo-audio's recorder that the controller depends on. */
export interface RecorderPort {
  prepare: () => Promise<void>;
  record: () => void;
  stop: () => Promise<void>;
  snapshot: () => RecorderSnapshot;
}

/** What the OS said when asked for the microphone. `canAskAgain: false` means Settings only. */
export interface PermissionResult {
  granted: boolean;
  canAskAgain?: boolean;
}

/** Outcome of checking a finished take before it can be approved. */
export type TakeAssessment =
  | { ok: true; quiet?: boolean }
  | { ok: false; message: string };

export interface ControllerDeps {
  port: RecorderPort;
  /** A bare boolean is accepted as "granted or not, and the OS may ask again". */
  requestPermission: () => Promise<boolean | PermissionResult>;
  /** Reads the current microphone permission without showing a dialog. Used on return from Settings. */
  checkPermission?: () => Promise<boolean>;
  /**
   * Looks at the finished take (is there a voice?) before it can be approved. If it throws, the
   * take is accepted: an unreadable file is reported by song generation, not guessed at here.
   */
  analyze?: (uri: string) => Promise<TakeAssessment>;
  setRecordingMode: (enabled: boolean) => Promise<void>;
  /** Removes orphaned recordings from earlier sessions. Called before every take. */
  sweep: () => Promise<{ failed: number }>;
  /** Must treat a missing file as success and throw on a real failure. */
  deleteFile: (uri: string) => void;
  /** Receives fixed codes only: never URIs, paths or error text. */
  log: (code: CleanupFailureCode | 'sweep_failed') => void;
}

export interface ControllerSnapshot {
  recorder: RecorderState;
  /** Set when a leftover recording could not be deleted. Contains no personal data. */
  cleanupWarning: string | null;
}

export interface RecordingController {
  getSnapshot: () => ControllerSnapshot;
  subscribe: (listener: () => void) => () => void;
  start: () => Promise<void>;
  stop: () => Promise<void>;
  /**
   * Treats an already written recording file as a finished take (same states as a real take).
   * Used by the development-only test voice. Requires consent and an idle microphone.
   */
  importRecording: (recording: { uri: string; durationMs: number }) => void;
  approve: () => void;
  reset: () => void;
  setConsent: (granted: boolean) => void;
  setPlayingUri: (uri: string | null) => void;
  handleRecorderEvent: (event: { hasError: boolean; isFinished: boolean }) => void;
  handleAppState: (state: string) => void;
  flushCleanup: () => void;
  /** Re-arms the controller after dispose (React Strict Mode and Fast Refresh re-run effects). */
  activate: () => void;
  dispose: () => void;
}

/**
 * User-facing failure text is fixed. Native error messages can contain file paths, so they are
 * never copied into UI state (they would be shown on screen and read out by screen readers).
 */
function describeError(_error: unknown, fallback: string): string {
  return fallback;
}

export function createRecordingController(deps: ControllerDeps): RecordingController {
  let recorderState = initialRecorderState;
  let cleanupWarning: string | null = null;
  let snapshot: ControllerSnapshot = { recorder: recorderState, cleanupWarning };
  let playingUri: string | null = null;
  let consentGranted = false;
  let disposed = false;
  let startInFlight = false;
  let stopInFlight = false;
  /** Set when the app goes to the background while start() is still awaiting. */
  let backgroundedDuringStart = false;
  /**
   * True while the OS permission dialog is open. On Android that dialog is a separate activity,
   * so the app reports 'background' while it is showing; that must not abort the start.
   */
  let awaitingPermission = false;
  /** A file hit the retry limit this session, so its warning must not be cleared by later flushes. */
  let gaveUp = false;
  const listeners = new Set<() => void>();

  function publish(): void {
    snapshot = { recorder: recorderState, cleanupWarning };
    if (disposed) return;
    for (const listener of [...listeners]) listener();
  }

  function setWarning(next: string | null): void {
    if (next === cleanupWarning) return;
    cleanupWarning = next;
    publish();
  }

  const queue = createCleanupQueue({
    deleteFile: deps.deleteFile,
    onFailure: (failure) => {
      deps.log(failure.code);
      if (failure.permanent) gaveUp = true;
      setWarning(failure.permanent ? CLEANUP_WARNING_GAVE_UP : CLEANUP_WARNING_RETRYING);
    },
  });

  function flushCleanup(): void {
    const result = queue.flush(playingUri);
    if (result.pending === 0 && result.failed === 0 && !gaveUp) setWarning(null);
  }

  function takeUri(): string | null {
    try {
      return deps.port.snapshot().uri;
    } catch {
      return null; // Recorder already released.
    }
  }

  function discardTake(): void {
    queue.schedule(takeUri());
    flushCleanup();
  }

  function apply(action: RecorderAction): void {
    if (disposed) return;
    const previous = recorderState;
    const next = recorderReducer(previous, action);
    const discard = uriToDiscard(previous, next);
    if (next !== previous) {
      recorderState = next;
      publish();
    }
    if (discard !== null) {
      queue.schedule(discard);
      flushCleanup();
    }
  }

  function leaveRecordingMode(): void {
    deps.setRecordingMode(false).catch(() => {
      // Non-fatal: playback still works with the previous mode.
    });
  }

  async function start(): Promise<void> {
    const phase = recorderState.phase;
    if (!consentGranted || disposed) return;
    if (startInFlight || phase === 'recording' || phase === 'stopping') return;
    startInFlight = true;
    backgroundedDuringStart = false;

    /** True when the take must not begin: the screen is gone or the user left the app. */
    function mustAbort(): boolean {
      if (disposed) {
        discardTake();
        leaveRecordingMode();
        return true;
      }
      if (backgroundedDuringStart) {
        discardTake();
        apply({ type: 'FAILED', message: BACKGROUND_MESSAGE });
        leaveRecordingMode();
        return true;
      }
      return false;
    }

    try {
      apply({ type: 'PERMISSION_REQUESTED' });
      const sweep = await deps.sweep();
      if (sweep.failed > 0) deps.log('sweep_failed');
      awaitingPermission = true;
      let permission: PermissionResult;
      try {
        const answer = await deps.requestPermission();
        permission = typeof answer === 'boolean' ? { granted: answer } : answer;
      } finally {
        awaitingPermission = false;
      }
      if (disposed) return;
      if (!permission.granted) {
        // Android stops showing its dialog after a second denial; only Settings can help then.
        apply({ type: permission.canAskAgain === false ? 'PERMISSION_BLOCKED' : 'PERMISSION_DENIED' });
        return;
      }
      if (mustAbort()) return;
      await deps.setRecordingMode(true);
      if (mustAbort()) return;
      await deps.port.prepare();
      if (mustAbort()) return;
      deps.port.record();
      apply({ type: 'RECORDING_STARTED' });
    } catch (error) {
      discardTake();
      leaveRecordingMode();
      apply({ type: 'FAILED', message: describeError(error, 'Could not start recording.') });
    } finally {
      startInFlight = false;
    }
  }

  async function stop(): Promise<void> {
    if (stopInFlight || recorderState.phase !== 'recording') return;
    stopInFlight = true;
    apply({ type: 'STOP_REQUESTED' });
    try {
      const before = deps.port.snapshot();
      await deps.port.stop();
      if (disposed) {
        // The screen went away while stopping: nothing can show this take, so delete it.
        discardTake();
        return;
      }
      const after = deps.port.snapshot();
      const result = validateRecording({
        uri: after.uri,
        durationMs: Math.max(before.durationMs, after.durationMs),
        fileSize: after.fileSize,
      });
      if (result.ok) {
        let assessment: TakeAssessment = { ok: true };
        if (deps.analyze) {
          try {
            assessment = await deps.analyze(result.recording.uri);
          } catch {
            assessment = { ok: true };
          }
          if (disposed) {
            discardTake();
            return;
          }
        }
        if (assessment.ok) {
          apply({ type: 'RECORDING_FINISHED', recording: result.recording, quiet: assessment.quiet });
        } else {
          // The file is kept so the user can hear it; it goes when they record again.
          apply({ type: 'RECORDING_UNUSABLE', recording: result.recording, message: assessment.message });
        }
      } else {
        discardTake();
        apply({ type: 'FAILED', message: result.message });
      }
    } catch (error) {
      discardTake();
      apply({ type: 'FAILED', message: describeError(error, 'Could not finish the recording.') });
    } finally {
      stopInFlight = false;
      leaveRecordingMode();
    }
  }

  /**
   * Returning from Settings: if the user allowed the microphone there, leave the denied panel so
   * the normal record button is back. Nothing starts recording on its own.
   */
  async function recheckPermission(): Promise<void> {
    const phase = recorderState.phase;
    if (!deps.checkPermission || (phase !== 'permission-blocked' && phase !== 'permission-denied')) return;
    try {
      if (await deps.checkPermission()) {
        const current = recorderState.phase;
        if (current === 'permission-blocked' || current === 'permission-denied') apply({ type: 'RESET' });
      }
    } catch {
      // Leave the panel as it is; the user can still open Settings or try again.
    }
  }

  /** Stops a take in progress, throws it away and tells the user why. */
  async function interrupt(message: string): Promise<void> {
    if (stopInFlight || recorderState.phase !== 'recording') return;
    stopInFlight = true;
    apply({ type: 'STOP_REQUESTED' });
    try {
      await deps.port.stop();
    } catch {
      // The OS may already have stopped it; the file is deleted either way.
    } finally {
      discardTake();
      apply({ type: 'FAILED', message });
      stopInFlight = false;
      leaveRecordingMode();
    }
  }

  return {
    getSnapshot: () => snapshot,
    subscribe(listener) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    start,
    stop,
    importRecording(recording) {
      const phase = recorderState.phase;
      if (!consentGranted || disposed || startInFlight) return;
      if (phase === 'recording' || phase === 'stopping') return;
      apply({ type: 'PERMISSION_REQUESTED' });
      apply({ type: 'RECORDING_STARTED' });
      apply({ type: 'STOP_REQUESTED' });
      apply({ type: 'RECORDING_FINISHED', recording });
    },
    approve: () => apply({ type: 'APPROVED' }),
    reset() {
      const phase = recorderState.phase;
      if (phase === 'recording' || phase === 'stopping') return;
      apply({ type: 'RESET' });
    },
    setConsent(granted) {
      consentGranted = granted;
    },
    setPlayingUri(uri) {
      playingUri = uri;
      flushCleanup();
    },
    handleRecorderEvent(event) {
      if (recorderState.phase === 'recording' && (event.hasError || event.isFinished)) {
        void interrupt(INTERRUPTED_MESSAGE);
      }
    },
    handleAppState(state) {
      if (state === 'background') {
        if (startInFlight && !awaitingPermission) backgroundedDuringStart = true;
        void interrupt(BACKGROUND_MESSAGE);
      } else if (state === 'active') {
        flushCleanup();
        void recheckPermission();
      }
    },
    flushCleanup,
    dispose() {
      if (disposed) return;
      const { phase, recording } = recorderState;
      if (phase === 'recording' || phase === 'stopping' || phase === 'requesting-permission') {
        // The native recorder may already be released by useAudioRecorder; ignore that case.
        try {
          void deps.port.stop().catch(() => undefined);
        } catch {
          // Already released.
        }
        queue.schedule(takeUri());
      }
      queue.schedule(recording?.uri);
      queue.flush(null);
      disposed = true;
    },
    activate() {
      disposed = false;
    },
  };
}
