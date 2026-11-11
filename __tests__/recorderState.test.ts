import {
  formatDuration,
  initialRecorderState,
  MIN_RECORDING_MS,
  recorderReducer,
  uriToDiscard,
  validateRecording,
} from '../src/hooks/recorderState';
import type { NameRecording, RecorderAction, RecorderState } from '../src/types';

const clip: NameRecording = { uri: 'file:///cache/name.m4a', durationMs: 1500 };

function run(actions: RecorderAction[], from: RecorderState = initialRecorderState): RecorderState {
  return actions.reduce(recorderReducer, from);
}

describe('recorderReducer', () => {
  it('walks the happy path to approved', () => {
    const state = run([
      { type: 'PERMISSION_REQUESTED' },
      { type: 'RECORDING_STARTED' },
      { type: 'STOP_REQUESTED' },
      { type: 'RECORDING_FINISHED', recording: clip },
      { type: 'APPROVED' },
    ]);
    expect(state).toEqual({ phase: 'approved', recording: clip, errorMessage: null });
  });

  it('moves to permission-denied without a recording', () => {
    const state = run([{ type: 'PERMISSION_REQUESTED' }, { type: 'PERMISSION_DENIED' }]);
    expect(state.phase).toBe('permission-denied');
    expect(state.recording).toBeNull();
  });

  it('ignores repeated start and stop actions', () => {
    const recording = run([{ type: 'PERMISSION_REQUESTED' }, { type: 'RECORDING_STARTED' }]);
    expect(recorderReducer(recording, { type: 'PERMISSION_REQUESTED' })).toBe(recording);
    expect(recorderReducer(recording, { type: 'RECORDING_STARTED' })).toBe(recording);
    const stopping = recorderReducer(recording, { type: 'STOP_REQUESTED' });
    expect(recorderReducer(stopping, { type: 'STOP_REQUESTED' })).toBe(stopping);
  });

  it('never reports a recording unless it was stopped first', () => {
    const state = recorderReducer(initialRecorderState, { type: 'RECORDING_FINISHED', recording: clip });
    expect(state).toBe(initialRecorderState);
  });

  it('cannot approve without a finished recording', () => {
    expect(recorderReducer(initialRecorderState, { type: 'APPROVED' })).toBe(initialRecorderState);
  });

  it('stores the message on failure and clears everything on reset', () => {
    const failed = run([{ type: 'FAILED', message: 'boom' }]);
    expect(failed).toEqual({ phase: 'error', recording: null, errorMessage: 'boom' });
    expect(recorderReducer(failed, { type: 'RESET' })).toEqual(initialRecorderState);
  });

  it('allows re-recording from a finished clip', () => {
    const recorded = run([
      { type: 'PERMISSION_REQUESTED' },
      { type: 'RECORDING_STARTED' },
      { type: 'STOP_REQUESTED' },
      { type: 'RECORDING_FINISHED', recording: clip },
    ]);
    const again = recorderReducer(recorded, { type: 'PERMISSION_REQUESTED' });
    expect(again.phase).toBe('requesting-permission');
    expect(again.recording).toBeNull();
  });
});

describe('validateRecording', () => {
  it('accepts a real recording', () => {
    const result = validateRecording({ uri: 'file:///a.m4a', durationMs: 1200, fileSize: 4096 });
    expect(result).toEqual({ ok: true, recording: { uri: 'file:///a.m4a', durationMs: 1200 } });
  });

  it.each([null, undefined, '', '   '])('rejects a missing URI (%p)', (uri) => {
    expect(validateRecording({ uri, durationMs: 1200, fileSize: 4096 }).ok).toBe(false);
  });

  it('rejects an empty file', () => {
    expect(validateRecording({ uri: 'file:///a.m4a', durationMs: 1200, fileSize: 0 }).ok).toBe(false);
  });

  it('rejects accidental taps', () => {
    const result = validateRecording({ uri: 'file:///a.m4a', durationMs: MIN_RECORDING_MS - 1, fileSize: 100 });
    expect(result.ok).toBe(false);
  });
});

describe('formatDuration', () => {
  it.each([
    [0, '0:00'],
    [999, '0:00'],
    [1000, '0:01'],
    [65_000, '1:05'],
    [-5, '0:00'],
  ])('formats %p ms as %p', (ms, expected) => {
    expect(formatDuration(ms)).toBe(expected);
  });
});

describe("uriToDiscard", () => {
  const recorded: RecorderState = { phase: "recorded", recording: clip, errorMessage: null };
  const approved: RecorderState = { phase: "approved", recording: clip, errorMessage: null };
  const discardOn = (from: RecorderState, action: RecorderAction) =>
    uriToDiscard(from, recorderReducer(from, action));

  it("keeps the file on approval", () => {
    expect(discardOn(recorded, { type: "APPROVED" })).toBeNull();
  });

  it.each<[string, RecorderState, RecorderAction]>([
    ["rejecting a recorded clip", recorded, { type: "RESET" }],
    ["resetting an approved clip", approved, { type: "RESET" }],
    ["re-recording a recorded clip", recorded, { type: "PERMISSION_REQUESTED" }],
    ["re-recording an approved clip", approved, { type: "PERMISSION_REQUESTED" }],
    ["failing with a clip present", recorded, { type: "FAILED", message: "x" }],
  ])("discards the file when %s", (_name, from, action) => {
    expect(discardOn(from, action)).toBe(clip.uri);
  });

  it("discards nothing when there is no recording or the action changes nothing", () => {
    expect(discardOn(initialRecorderState, { type: "RESET" })).toBeNull();
    expect(discardOn(approved, { type: "APPROVED" })).toBeNull();
    expect(discardOn(approved, { type: "STOP_REQUESTED" })).toBeNull();
  });
});
