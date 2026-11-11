import {
  BACKGROUND_MESSAGE,
  createRecordingController,
  INTERRUPTED_MESSAGE,
  type RecordingController,
} from '../src/hooks/recordingController';
import {
  CLEANUP_WARNING_GAVE_UP,
  CLEANUP_WARNING_RETRYING,
  MAX_DELETE_ATTEMPTS,
} from '../src/hooks/recordingCleanup';

interface Options {
  permission?: boolean;
  fileSize?: number;
  durationMs?: number;
}

const tick = () => new Promise<void>((resolve) => setImmediate(() => resolve()));

function createHarness(options: Options = {}) {
  const files = new Set<string>();
  const logs: string[] = [];
  const state = {
    permission: options.permission ?? true,
    fileSize: options.fileSize ?? 4096,
    durationMs: options.durationMs ?? 1500,
    prepareFails: false,
    stopFails: false,
    deleteFails: false,
    sweepFailed: 0,
    uri: null as string | null,
    counter: 0,
  };

  const controller: RecordingController = createRecordingController({
    port: {
      prepare: async () => {
        if (state.prepareFails) throw new Error('prepare failed');
      },
      record: () => {
        state.counter += 1;
        state.uri = `file:///cache/Audio/take-${state.counter}.m4a`;
        files.add(state.uri);
      },
      stop: async () => {
        if (state.stopFails) throw new Error('stop failed');
      },
      snapshot: () => ({ uri: state.uri, durationMs: state.durationMs, fileSize: state.fileSize }),
    },
    requestPermission: async () => state.permission,
    setRecordingMode: async () => undefined,
    sweep: async () => ({ failed: state.sweepFailed }),
    deleteFile: (uri) => {
      if (state.deleteFails) throw new Error(`cannot delete ${uri}`);
      files.delete(uri);
    },
    log: (code) => logs.push(code),
  });
  controller.setConsent(true);

  const phase = () => controller.getSnapshot().recorder.phase;
  const recording = () => controller.getSnapshot().recorder.recording;
  const warning = () => controller.getSnapshot().cleanupWarning;

  async function recordTake() {
    await controller.start();
    await controller.stop();
  }
  return { controller, files, logs, state, phase, recording, warning, recordTake };
}

describe('consent gate', () => {
  it('does not touch the microphone or create a file without consent', async () => {
    const h = createHarness();
    h.controller.setConsent(false);
    await h.controller.start();
    expect(h.phase()).toBe('idle');
    expect(h.files.size).toBe(0);
  });
});

describe('approval and deletion', () => {
  it('keeps the file after approval', async () => {
    const h = createHarness();
    await h.recordTake();
    expect(h.phase()).toBe('recorded');
    h.controller.approve();
    expect(h.phase()).toBe('approved');
    expect(h.files.size).toBe(1);
  });

  it('deletes the file when a recorded clip is rejected', async () => {
    const h = createHarness();
    await h.recordTake();
    h.controller.reset();
    expect(h.phase()).toBe('idle');
    expect(h.recording()).toBeNull();
    expect(h.files.size).toBe(0);
  });

  it('deletes the old file when re-recording and keeps only the new one', async () => {
    const h = createHarness();
    await h.recordTake();
    const first = h.recording()?.uri as string;
    await h.recordTake();
    expect(h.files.has(first)).toBe(false);
    expect(h.files.size).toBe(1);
    expect(h.recording()?.uri).not.toBe(first);
  });

  it('deletes an approved recording on reset', async () => {
    const h = createHarness();
    await h.recordTake();
    h.controller.approve();
    h.controller.reset();
    expect(h.phase()).toBe('idle');
    expect(h.files.size).toBe(0);
  });

  it('deletes an approved recording when the controller is disposed', async () => {
    const h = createHarness();
    await h.recordTake();
    h.controller.approve();
    h.controller.dispose();
    expect(h.files.size).toBe(0);
  });

  it('does not approve when nothing was recorded', () => {
    const h = createHarness();
    h.controller.approve();
    expect(h.phase()).toBe('idle');
  });

  it('discards recordings that are empty or too short, and reports an error', async () => {
    const empty = createHarness({ fileSize: 0 });
    await empty.recordTake();
    expect(empty.phase()).toBe('error');
    expect(empty.recording()).toBeNull();
    expect(empty.files.size).toBe(0);

    const short = createHarness({ durationMs: 50 });
    await short.recordTake();
    expect(short.phase()).toBe('error');
    expect(short.files.size).toBe(0);
  });
});

describe('reset behaviour', () => {
  it('is idempotent', async () => {
    const h = createHarness();
    await h.recordTake();
    h.controller.reset();
    h.controller.reset();
    expect(h.phase()).toBe('idle');
    expect(h.files.size).toBe(0);
    expect(h.logs).toEqual([]);
  });

  it('is ignored while a take is in progress', async () => {
    const h = createHarness();
    await h.controller.start();
    h.controller.reset();
    expect(h.phase()).toBe('recording');
    expect(h.files.size).toBe(1);
  });

  it('clears an error back to idle', async () => {
    const h = createHarness({ fileSize: 0 });
    await h.recordTake();
    h.controller.reset();
    expect(h.phase()).toBe('idle');
  });
});

describe('repeated actions', () => {
  it('creates only one file for concurrent start calls', async () => {
    const h = createHarness();
    await Promise.all([h.controller.start(), h.controller.start(), h.controller.start()]);
    expect(h.phase()).toBe('recording');
    expect(h.state.counter).toBe(1);
  });

  it('handles repeated stop calls once', async () => {
    const h = createHarness();
    await h.controller.start();
    await Promise.all([h.controller.stop(), h.controller.stop()]);
    expect(h.phase()).toBe('recorded');
    expect(h.files.size).toBe(1);
  });

  it('ignores start while already recording and stop while idle', async () => {
    const h = createHarness();
    await h.controller.stop();
    expect(h.phase()).toBe('idle');
    await h.controller.start();
    await h.controller.start();
    expect(h.state.counter).toBe(1);
  });

  it('ignores a second approval', async () => {
    const h = createHarness();
    await h.recordTake();
    h.controller.approve();
    h.controller.approve();
    expect(h.phase()).toBe('approved');
    expect(h.files.size).toBe(1);
  });
});

describe('interrupted recordings', () => {
  it('discards a take the OS ended', async () => {
    const h = createHarness();
    await h.controller.start();
    h.controller.handleRecorderEvent({ hasError: false, isFinished: true });
    await tick();
    expect(h.phase()).toBe('error');
    expect(h.controller.getSnapshot().recorder.errorMessage).toBe(INTERRUPTED_MESSAGE);
    expect(h.files.size).toBe(0);
  });

  it('discards a take when the recorder reports an error', async () => {
    const h = createHarness();
    await h.controller.start();
    h.controller.handleRecorderEvent({ hasError: true, isFinished: false });
    await tick();
    expect(h.phase()).toBe('error');
    expect(h.files.size).toBe(0);
  });

  it('discards a take when the app goes to the background', async () => {
    const h = createHarness();
    await h.controller.start();
    h.controller.handleAppState('background');
    await tick();
    expect(h.phase()).toBe('error');
    expect(h.controller.getSnapshot().recorder.errorMessage).toBe(BACKGROUND_MESSAGE);
    expect(h.files.size).toBe(0);
  });

  it('still deletes the file if stopping the recorder throws', async () => {
    const h = createHarness();
    await h.controller.start();
    h.state.stopFails = true;
    h.controller.handleAppState('background');
    await tick();
    expect(h.phase()).toBe('error');
    expect(h.files.size).toBe(0);
  });

  it('does not delete an approved recording when the app is backgrounded', async () => {
    const h = createHarness();
    await h.recordTake();
    h.controller.approve();
    h.controller.handleAppState('background');
    await tick();
    expect(h.phase()).toBe('approved');
    expect(h.files.size).toBe(1);
  });

  it('ignores recorder events and inactive state when not recording', () => {
    const h = createHarness();
    h.controller.handleRecorderEvent({ hasError: true, isFinished: true });
    h.controller.handleAppState('inactive');
    expect(h.phase()).toBe('idle');
  });

  it('deletes an in-progress take on dispose (unmount)', async () => {
    const h = createHarness();
    await h.controller.start();
    h.controller.dispose();
    expect(h.files.size).toBe(0);
  });
});

describe('start failures and permissions', () => {
  it('creates no file when permission is denied', async () => {
    const h = createHarness({ permission: false });
    await h.controller.start();
    expect(h.phase()).toBe('permission-denied');
    expect(h.files.size).toBe(0);
  });

  it('allows a retry after permission was denied', async () => {
    const h = createHarness({ permission: false });
    await h.controller.start();
    h.state.permission = true;
    await h.controller.start();
    expect(h.phase()).toBe('recording');
  });

  it('reports an error and leaves no file if preparing fails', async () => {
    const h = createHarness();
    h.state.prepareFails = true;
    await h.controller.start();
    expect(h.phase()).toBe('error');
    expect(h.files.size).toBe(0);
  });

  it('logs a fixed code when the orphan sweep fails, and still records', async () => {
    const h = createHarness();
    h.state.sweepFailed = 2;
    await h.controller.start();
    expect(h.logs).toEqual(['sweep_failed']);
    expect(h.phase()).toBe('recording');
  });
});

describe('playback protection', () => {
  it('does not delete a file while it is playing, then deletes it when playback stops', async () => {
    const h = createHarness();
    await h.recordTake();
    const uri = h.recording()?.uri as string;
    h.controller.setPlayingUri(uri);
    h.controller.reset();
    expect(h.phase()).toBe('idle');
    expect(h.files.has(uri)).toBe(true);
    h.controller.setPlayingUri(null);
    expect(h.files.has(uri)).toBe(false);
  });

  it('deletes other files while a different one is playing', async () => {
    const h = createHarness();
    await h.recordTake();
    const first = h.recording()?.uri as string;
    h.controller.setPlayingUri('file:///some/other/clip.m4a');
    await h.recordTake();
    expect(h.files.has(first)).toBe(false);
  });
});

describe('cleanup failures', () => {
  it('surfaces a fixed warning, logs a fixed code and retries', async () => {
    const h = createHarness();
    await h.recordTake();
    h.state.deleteFails = true;
    h.controller.reset();
    expect(h.files.size).toBe(1);
    expect(h.warning()).toBe(CLEANUP_WARNING_RETRYING);
    expect(h.logs).toEqual(['delete_failed']);

    h.state.deleteFails = false;
    h.controller.handleAppState('active');
    expect(h.files.size).toBe(0);
    expect(h.warning()).toBeNull();
  });

  it('gives up after the maximum attempts and says it will retry at next launch', async () => {
    const h = createHarness();
    await h.recordTake();
    h.state.deleteFails = true;
    h.controller.reset();
    for (let i = 1; i < MAX_DELETE_ATTEMPTS; i += 1) h.controller.flushCleanup();
    expect(h.warning()).toBe(CLEANUP_WARNING_GAVE_UP);
    expect(h.logs).toEqual(['delete_failed', 'delete_failed', 'gave_up']);
  });

  it('never exposes file paths or error text in logs or the warning', async () => {
    const h = createHarness();
    await h.recordTake();
    const uri = h.recording()?.uri as string;
    h.state.deleteFails = true;
    h.controller.reset();
    const exposed = [...h.logs, h.warning() ?? ''].join(' ');
    expect(exposed).not.toContain(uri);
    expect(exposed).not.toContain('file:');
    expect(exposed).not.toContain('cannot delete');
  });
});

describe('subscriptions', () => {
  it('notifies listeners on change and stops after unsubscribe', async () => {
    const h = createHarness();
    const listener = jest.fn();
    const unsubscribe = h.controller.subscribe(listener);
    await h.controller.start();
    expect(listener).toHaveBeenCalled();
    const calls = listener.mock.calls.length;
    unsubscribe();
    await h.controller.stop();
    expect(listener.mock.calls.length).toBe(calls);
  });
});
