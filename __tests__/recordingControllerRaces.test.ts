import {
  BACKGROUND_MESSAGE,
  createRecordingController,
  type RecordingController,
} from '../src/hooks/recordingController';
import { CLEANUP_WARNING_GAVE_UP, MAX_DELETE_ATTEMPTS } from '../src/hooks/recordingCleanup';

const tick = () => new Promise<void>((resolve) => setImmediate(() => resolve()));

function deferred() {
  let resolve!: () => void;
  const promise = new Promise<void>((r) => {
    resolve = r;
  });
  return { promise, resolve };
}

function createHarness() {
  const files = new Set<string>();
  const logs: string[] = [];
  const modeCalls: boolean[] = [];
  const state = {
    permissionGate: null as Promise<void> | null,
    prepareGate: null as Promise<void> | null,
    stopGate: null as Promise<void> | null,
    prepareError: null as Error | null,
    deleteFails: false,
    uri: null as string | null,
    records: 0,
  };

  const controller: RecordingController = createRecordingController({
    port: {
      prepare: async () => {
        if (state.prepareGate) await state.prepareGate;
        if (state.prepareError) throw state.prepareError;
      },
      record: () => {
        state.records += 1;
        state.uri = `file:///cache/Audio/take-${state.records}.m4a`;
        files.add(state.uri);
      },
      stop: async () => {
        if (state.stopGate) await state.stopGate;
      },
      snapshot: () => ({ uri: state.uri, durationMs: 1500, fileSize: 4096 }),
    },
    requestPermission: async () => {
      if (state.permissionGate) await state.permissionGate;
      return true;
    },
    setRecordingMode: async (enabled) => {
      modeCalls.push(enabled);
    },
    sweep: async () => ({ failed: 0 }),
    deleteFile: (uri) => {
      if (state.deleteFails) throw new Error(`cannot delete ${uri}`);
      files.delete(uri);
    },
    log: (code) => logs.push(code),
  });
  controller.setConsent(true);
  return { controller, files, logs, modeCalls, state };
}

describe('cleanup warning persistence', () => {
  it('keeps the give-up warning after later unrelated flushes', async () => {
    const h = createHarness();
    await h.controller.start();
    await h.controller.stop();
    h.state.deleteFails = true;
    h.controller.reset();
    for (let i = 1; i < MAX_DELETE_ATTEMPTS; i += 1) h.controller.flushCleanup();
    expect(h.controller.getSnapshot().cleanupWarning).toBe(CLEANUP_WARNING_GAVE_UP);

    h.state.deleteFails = false;
    h.controller.handleAppState('active');
    h.controller.setPlayingUri(null);
    expect(h.controller.getSnapshot().cleanupWarning).toBe(CLEANUP_WARNING_GAVE_UP);
  });
});

describe('start() racing with unmount and backgrounding', () => {
  it('never starts recording if the screen unmounts during the permission prompt', async () => {
    const h = createHarness();
    const gate = deferred();
    h.state.permissionGate = gate.promise;
    const started = h.controller.start();
    h.controller.dispose();
    gate.resolve();
    await started;
    expect(h.state.records).toBe(0);
    expect(h.files.size).toBe(0);
  });

  it('still starts when the app reports background only because the permission dialog is open', async () => {
    const h = createHarness();
    const gate = deferred();
    h.state.permissionGate = gate.promise;
    const started = h.controller.start();
    await tick(); // the sweep finished and the permission dialog is now open
    h.controller.handleAppState('background'); // Android: the dialog is another activity
    h.controller.handleAppState('active');
    gate.resolve();
    await started;
    expect(h.state.records).toBe(1);
    expect(h.controller.getSnapshot().recorder.phase).toBe('recording');
  });

  it('never starts recording if the app is backgrounded after the permission step', async () => {
    const h = createHarness();
    const gate = deferred();
    h.state.prepareGate = gate.promise;
    const started = h.controller.start();
    await tick(); // permission is granted; start() is now waiting in prepare()
    h.controller.handleAppState('background');
    gate.resolve();
    await started;
    await tick();
    expect(h.state.records).toBe(0);
    const snapshot = h.controller.getSnapshot().recorder;
    expect(snapshot.phase).toBe('error');
    expect(snapshot.errorMessage).toBe(BACKGROUND_MESSAGE);
  });

  it('leaves recording mode when preparing fails', async () => {
    const h = createHarness();
    h.state.prepareError = new Error('failed at /data/user/0/app/cache/Audio/x.m4a');
    await h.controller.start();
    expect(h.controller.getSnapshot().recorder.phase).toBe('error');
    expect(h.modeCalls[h.modeCalls.length - 1]).toBe(false);
  });

  it('never copies native error text into the user-facing message', async () => {
    const h = createHarness();
    h.state.prepareError = new Error('failed at /data/user/0/app/cache/Audio/x.m4a');
    await h.controller.start();
    const message = h.controller.getSnapshot().recorder.errorMessage ?? '';
    expect(message).not.toContain('/data/user');
    expect(message).not.toContain('x.m4a');
  });
});

describe('stop() racing with unmount', () => {
  it('deletes a take that finishes after the screen is gone', async () => {
    const h = createHarness();
    await h.controller.start();
    const gate = deferred();
    h.state.stopGate = gate.promise;
    const stopping = h.controller.stop();
    h.controller.dispose();
    gate.resolve();
    await stopping;
    expect(h.files.size).toBe(0);
  });
});
