import type {
  NameRecording,
  RecorderAction,
  RecorderState,
} from '../types';

/** Recordings shorter than this are treated as accidental taps. */
export const MIN_RECORDING_MS = 300;
/** Safety cap so a forgotten recording does not run forever. */
export const MAX_RECORDING_MS = 10_000;

export const initialRecorderState: RecorderState = {
  phase: 'idle',
  recording: null,
  errorMessage: null,
};

/**
 * Pure transition function. Invalid transitions return the same state object,
 * which is what makes repeated taps harmless.
 */
export function recorderReducer(
  state: RecorderState,
  action: RecorderAction,
): RecorderState {
  switch (action.type) {
    case 'PERMISSION_REQUESTED':
      if (state.phase === 'recording' || state.phase === 'stopping') return state;
      return { phase: 'requesting-permission', recording: null, errorMessage: null };
    case 'PERMISSION_DENIED':
      return { phase: 'permission-denied', recording: null, errorMessage: null };
    case 'PERMISSION_BLOCKED':
      return { phase: 'permission-blocked', recording: null, errorMessage: null };
    case 'RECORDING_STARTED':
      if (state.phase !== 'requesting-permission') return state;
      return { phase: 'recording', recording: null, errorMessage: null };
    case 'STOP_REQUESTED':
      if (state.phase !== 'recording') return state;
      return { ...state, phase: 'stopping' };
    case 'RECORDING_FINISHED':
      if (state.phase !== 'stopping') return state;
      return {
        phase: 'recorded',
        recording: action.recording,
        errorMessage: null,
        ...(action.quiet ? { quiet: true } : {}),
      };
    case 'RECORDING_UNUSABLE':
      if (state.phase !== 'stopping') return state;
      return { phase: 'unusable', recording: action.recording, errorMessage: action.message };
    case 'APPROVED':
      if (state.phase !== 'recorded' || state.recording === null) return state;
      return { ...state, phase: 'approved' };
    case 'RESET':
      return initialRecorderState;
    case 'FAILED':
      return { phase: 'error', recording: null, errorMessage: action.message };
    default:
      return state;
  }
}

/**
 * Lifecycle rule for files, derived from a state transition: a recording file must be
 * deleted exactly when the state stops referencing it.
 *
 *   recorded  -> approved   : same recording, file kept (needed by the later upload step)
 *   recorded  -> requesting-permission : re-record starts; the previous file is discarded
 *                                        immediately, before permission is granted
 *   recorded  -> idle       : reject, previous file discarded
 *   approved  -> idle       : reset, file discarded
 *   any       -> error      : file discarded
 *
 * Returns null when nothing must be deleted.
 */
export function uriToDiscard(prev: RecorderState, next: RecorderState): string | null {
  if (prev.recording === null) return null;
  return prev.recording.uri === next.recording?.uri ? null : prev.recording.uri;
}

export type RecordingValidation =
  | { ok: true; recording: NameRecording }
  | { ok: false; message: string };

/**
 * Validates what the recorder returned. A recording only counts if there is a
 * non-empty URI, a non-empty file and a plausible duration.
 */
export function validateRecording(input: {
  uri: string | null | undefined;
  durationMs: number;
  fileSize: number;
}): RecordingValidation {
  const uri = input.uri?.trim();
  if (!uri) {
    return { ok: false, message: 'The recording could not be saved. Please try again.' };
  }
  if (input.fileSize <= 0) {
    return { ok: false, message: 'The recording was empty. Please try again.' };
  }
  if (input.durationMs < MIN_RECORDING_MS) {
    return {
      ok: false,
      message: 'That was too short. Hold on a little longer and say your name.',
    };
  }
  return { ok: true, recording: { uri, durationMs: input.durationMs } };
}

export function formatDuration(durationMs: number): string {
  const totalSeconds = Math.max(0, Math.floor(durationMs / 1000));
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${seconds.toString().padStart(2, '0')}`;
}
