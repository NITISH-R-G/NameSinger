import {
  createRecordingController,
  type PermissionResult,
  type RecordingController,
  type TakeAssessment,
} from '../src/hooks/recordingController';
import { shouldAutoGenerate } from '../src/hooks/autoGenerate';
import { initialRecorderState, recorderReducer, uriToDiscard } from '../src/hooks/recorderState';
import { initialSongState, songReducer } from '../src/hooks/songGeneratorState';
import type { GeneratedSong } from '../src/audio/generateSong';
import type { NameRecording, RecorderAction, RecorderState } from '../src/types';
import { announcementForPhase, PHASE_ANNOUNCEMENTS } from '../src/utils/accessibility';

const clip: NameRecording = { uri: 'file:///cache/name.wav', durationMs: 1500 };
const run = (actions: RecorderAction[], from: RecorderState = initialRecorderState) =>
  actions.reduce(recorderReducer, from);

describe('reducer: permission and unusable recordings', () => {
  it('keeps retryable denial and permanent denial apart', () => {
    const denied = run([{ type: 'PERMISSION_REQUESTED' }, { type: 'PERMISSION_DENIED' }]);
    const blocked = run([{ type: 'PERMISSION_REQUESTED' }, { type: 'PERMISSION_BLOCKED' }]);
    expect(denied.phase).toBe('permission-denied');
    expect(blocked.phase).toBe('permission-blocked');
    expect(blocked.recording).toBeNull();
  });

  it('lets the user try again from either denied state', () => {
    for (const action of ['PERMISSION_DENIED', 'PERMISSION_BLOCKED'] as const) {
      const state = run([{ type: 'PERMISSION_REQUESTED' }, { type: action }, { type: 'PERMISSION_REQUESTED' }]);
      expect(state.phase).toBe('requesting-permission');
    }
  });

  const stopped: RecorderAction[] = [
    { type: 'PERMISSION_REQUESTED' },
    { type: 'RECORDING_STARTED' },
    { type: 'STOP_REQUESTED' },
  ];

  it('marks an unusable take but keeps its recording so it can be played back', () => {
    const state = run([...stopped, { type: 'RECORDING_UNUSABLE', recording: clip, message: 'No voice' }]);
    expect(state).toEqual({ phase: 'unusable', recording: clip, errorMessage: 'No voice' });
  });

  it('can never approve an unusable take, however the action arrives', () => {
    const unusable = run([...stopped, { type: 'RECORDING_UNUSABLE', recording: clip, message: 'No voice' }]);
    expect(recorderReducer(unusable, { type: 'APPROVED' })).toBe(unusable);
  });

  it('only records an unusable verdict while a take is being stopped', () => {
    const idle = recorderReducer(initialRecorderState, { type: 'RECORDING_UNUSABLE', recording: clip, message: 'x' });
    expect(idle).toBe(initialRecorderState);
  });

  it('discards the unusable file only when the user records again, never before', () => {
    const unusable = run([...stopped, { type: 'RECORDING_UNUSABLE', recording: clip, message: 'No voice' }]);
    expect(uriToDiscard(initialRecorderState, unusable)).toBeNull();
    const again = recorderReducer(unusable, { type: 'PERMISSION_REQUESTED' });
    expect(uriToDiscard(unusable, again)).toBe(clip.uri);
  });

  it('carries the quiet flag to approval without changing the other fields', () => {
    const state = run([...stopped, { type: 'RECORDING_FINISHED', recording: clip, quiet: true }, { type: 'APPROVED' }]);
    expect(state).toEqual({ phase: 'approved', recording: clip, errorMessage: null, quiet: true });
  });
});

describe('announcements for the new phases', () => {
  it('speaks both denials and the unusable message', () => {
    expect(announcementForPhase('permission-denied', null)).toBe(PHASE_ANNOUNCEMENTS['permission-denied']);
    expect(announcementForPhase('permission-blocked', null)).toBe(PHASE_ANNOUNCEMENTS['permission-blocked']);
    expect(announcementForPhase('unusable', 'We could not hear you.')).toBe('We could not hear you.');
  });

  it('tells a blocked user to open settings, and a retryable one that they can try again', () => {
    expect(PHASE_ANNOUNCEMENTS['permission-blocked']).toMatch(/settings/i);
    expect(PHASE_ANNOUNCEMENTS['permission-denied']).toMatch(/try again/i);
  });
});

interface HarnessOptions {
  permissions?: (boolean | PermissionResult)[];
  assess?: TakeAssessment | 'throw';
  currentlyGranted?: boolean;
}

const tick = () => new Promise<void>((resolve) => setImmediate(() => resolve()));

function harness(options: HarnessOptions = {}) {
  const files = new Set<string>();
  const state = {
    counter: 0,
    uri: null as string | null,
    requests: 0,
    granted: options.currentlyGranted ?? false,
    analyzed: [] as string[],
  };
  const answers = [...(options.permissions ?? [true])];
  const controller: RecordingController = createRecordingController({
    port: {
      prepare: async () => undefined,
      record: () => {
        state.counter += 1;
        state.uri = `file:///cache/take-${state.counter}.wav`;
        files.add(state.uri);
      },
      stop: async () => undefined,
      snapshot: () => ({ uri: state.uri, durationMs: 1500, fileSize: 4096 }),
    },
    requestPermission: async () => {
      state.requests += 1;
      return answers.length > 1 ? (answers.shift() as boolean | PermissionResult) : answers[0];
    },
    checkPermission: async () => state.granted,
    analyze:
      options.assess === undefined
        ? undefined
        : async (uri) => {
            state.analyzed.push(uri);
            if (options.assess === 'throw') throw new Error('unreadable');
            return options.assess as TakeAssessment;
          },
    setRecordingMode: async () => undefined,
    sweep: async () => ({ failed: 0 }),
    deleteFile: (uri) => {
      files.delete(uri);
    },
    log: () => undefined,
  });
  controller.setConsent(true);
  const phase = () => controller.getSnapshot().recorder.phase;
  const snap = () => controller.getSnapshot().recorder;
  return { controller, files, state, phase, snap };
}

describe('microphone permission recovery', () => {
  it('first denial is retryable, and trying again can succeed', async () => {
    const h = harness({ permissions: [{ granted: false, canAskAgain: true }, { granted: true }] });
    await h.controller.start();
    expect(h.phase()).toBe('permission-denied');
    await h.controller.start();
    expect(h.phase()).toBe('recording');
    expect(h.state.requests).toBe(2);
  });

  it('a denial with no further prompts is permanent and creates no file', async () => {
    const h = harness({ permissions: [{ granted: false, canAskAgain: false }] });
    await h.controller.start();
    expect(h.phase()).toBe('permission-blocked');
    expect(h.files.size).toBe(0);
  });

  it('first denial, second denial, then permanent: each state is reported in order', async () => {
    const h = harness({
      permissions: [
        { granted: false, canAskAgain: true },
        { granted: false, canAskAgain: false },
      ],
    });
    await h.controller.start();
    expect(h.phase()).toBe('permission-denied');
    await h.controller.start();
    expect(h.phase()).toBe('permission-blocked');
  });

  it('treats a plain false (older callers) as retryable', async () => {
    const h = harness({ permissions: [false] });
    await h.controller.start();
    expect(h.phase()).toBe('permission-denied');
  });

  it('returns to the record button after the user allows the microphone in Settings', async () => {
    const h = harness({ permissions: [{ granted: false, canAskAgain: false }] });
    await h.controller.start();
    h.state.granted = true;
    h.controller.handleAppState('background'); // opening Settings
    h.controller.handleAppState('active'); // coming back
    await tick();
    expect(h.phase()).toBe('idle');
    expect(h.files.size).toBe(0); // returning never starts recording by itself
  });

  it('stays on the blocked panel if Settings was closed without allowing it', async () => {
    const h = harness({ permissions: [{ granted: false, canAskAgain: false }] });
    await h.controller.start();
    h.controller.handleAppState('active');
    await tick();
    expect(h.phase()).toBe('permission-blocked');
  });

  it('does not touch an unrelated state when the app returns to the foreground', async () => {
    const h = harness({ currentlyGranted: true });
    await h.controller.start();
    await h.controller.stop();
    expect(h.phase()).toBe('recorded');
    h.controller.handleAppState('active');
    await tick();
    expect(h.phase()).toBe('recorded');
  });
});

describe('checking a take before it can be approved', () => {
  it('holds an unusable take: file kept, playable, not approvable', async () => {
    const h = harness({ assess: { ok: false, message: 'We could not hear anything.' } });
    await h.controller.start();
    await h.controller.stop();
    expect(h.phase()).toBe('unusable');
    expect(h.snap().errorMessage).toBe('We could not hear anything.');
    expect(h.files.size).toBe(1); // never discarded without an explicit action
    h.controller.approve();
    expect(h.phase()).toBe('unusable');
  });

  it('deletes the unusable file when the user records again', async () => {
    const h = harness({ assess: { ok: false, message: 'x' } });
    await h.controller.start();
    await h.controller.stop();
    const first = h.snap().recording?.uri as string;
    await h.controller.start();
    expect(h.files.has(first)).toBe(false);
  });

  it('deletes the unusable file when the user clears it', async () => {
    const h = harness({ assess: { ok: false, message: 'x' } });
    await h.controller.start();
    await h.controller.stop();
    h.controller.reset();
    expect(h.phase()).toBe('idle');
    expect(h.files.size).toBe(0);
  });

  it('passes the take to the analysis, once per take', async () => {
    const h = harness({ assess: { ok: true } });
    await h.controller.start();
    await h.controller.stop();
    expect(h.state.analyzed).toEqual([h.state.uri]);
    expect(h.phase()).toBe('recorded');
  });

  it('accepts the take when the analysis itself fails, so a bug cannot lock the user out', async () => {
    const h = harness({ assess: 'throw' });
    await h.controller.start();
    await h.controller.stop();
    expect(h.phase()).toBe('recorded');
  });

  it('keeps a quiet but usable take approvable and remembers that it was quiet', async () => {
    const h = harness({ assess: { ok: true, quiet: true } });
    await h.controller.start();
    await h.controller.stop();
    expect(h.snap().quiet).toBe(true);
    h.controller.approve();
    expect(h.phase()).toBe('approved');
  });

  it('works unchanged without an analysis step', async () => {
    const h = harness();
    await h.controller.start();
    await h.controller.stop();
    expect(h.phase()).toBe('recorded');
  });

  it('deletes the take if the screen goes away while it is being checked', async () => {
    const h = harness({ assess: { ok: true } });
    await h.controller.start();
    const stopping = h.controller.stop();
    h.controller.dispose();
    await stopping;
    expect(h.files.size).toBe(0);
  });
});

describe('automatic song generation after approval', () => {
  const approved: NameRecording = { uri: 'file:///cache/a.wav', durationMs: 1000 };

  it('starts for a newly approved recording', () => {
    expect(shouldAutoGenerate(approved, null, false)).toBe(true);
  });

  it('never starts without an approved recording', () => {
    expect(shouldAutoGenerate(null, null, false)).toBe(false);
  });

  it('does not start a second job for the same recording (re-renders, strict mode, double taps)', () => {
    expect(shouldAutoGenerate(approved, approved.uri, false)).toBe(false);
  });

  it('does not start while a job is already running', () => {
    expect(shouldAutoGenerate({ ...approved, uri: 'file:///cache/b.wav' }, approved.uri, true)).toBe(false);
  });

  it('starts again for a different approved recording', () => {
    expect(shouldAutoGenerate({ ...approved, uri: 'file:///cache/b.wav' }, approved.uri, false)).toBe(true);
  });

  it('the song state refuses a second start while generating', () => {
    const generating = songReducer(initialSongState, { type: 'STARTED' });
    expect(songReducer(generating, { type: 'STARTED' })).toBe(generating);
    const song = { uri: 'file:///song.wav' } as GeneratedSong;
    expect(songReducer(generating, { type: 'SUCCEEDED', song }).phase).toBe('ready');
  });
});
