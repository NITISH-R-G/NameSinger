import * as fs from 'fs';
import * as path from 'path';

import { CONSENT_NOTICE_VERSION } from '../src/constants/consent';
import { canRecord, consentReducer, initialConsentState } from '../src/hooks/consentState';
import { loadConsent, saveConsent, type ConsentStorePort } from '../src/hooks/consentStore';
import {
  createRecordingController,
  type PermissionResult,
  type RecordingController,
} from '../src/hooks/recordingController';

/** In-memory stand-in for the consent file, with switches for each way storage can fail. */
function memoryStore(initial: string | null = null) {
  const state = { text: initial, failRead: false, failWrite: false, dropWrites: false, writes: 0 };
  const port: ConsentStorePort = {
    read: async () => {
      if (state.failRead) throw new Error('read failed');
      return state.text;
    },
    write: async (text) => {
      state.writes += 1;
      if (state.failWrite) throw new Error('disk full');
      if (!state.dropWrites) state.text = text;
    },
    remove: async () => {
      state.text = null;
    },
  };
  return { state, port };
}

const V = CONSENT_NOTICE_VERSION;
const NOW = new Date('2026-11-08T10:00:00.000Z');

/** What the app does at launch: load, and restore consent if it was acknowledged. */
async function launch(port: ConsentStorePort, version = V) {
  const loaded = await loadConsent(port, version);
  return loaded.acknowledged
    ? consentReducer(initialConsentState, { type: 'RESTORE' })
    : initialConsentState;
}

describe('first launch', () => {
  it('has no saved consent, so the notice is shown and recording is not allowed', async () => {
    const { port } = memoryStore();
    expect(await loadConsent(port, V)).toEqual({ acknowledged: false, reason: 'none' });
    const state = await launch(port);
    expect(state.status).toBe('unanswered');
    expect(canRecord(state)).toBe(false);
  });

  it('writes nothing just by launching', async () => {
    const { port, state } = memoryStore();
    await launch(port);
    expect(state.writes).toBe(0);
  });
});

describe('acknowledging consent', () => {
  it('stores the version and time, and confirms it by reading it back', async () => {
    const { port, state } = memoryStore();
    expect(await saveConsent(port, V, NOW)).toEqual({ saved: true });
    expect(JSON.parse(state.text as string)).toEqual({ version: V, acknowledgedAt: NOW.toISOString() });
  });

  it('stores nothing but the version and the time', async () => {
    const { port, state } = memoryStore();
    await saveConsent(port, V, NOW);
    expect(Object.keys(JSON.parse(state.text as string)).sort()).toEqual(['acknowledgedAt', 'version']);
  });

  it('allows recording in the session once accepted', () => {
    expect(canRecord(consentReducer(initialConsentState, { type: 'ACCEPT' }))).toBe(true);
  });

  it('does not persist a decline: a user who declined is asked again next launch', async () => {
    const { port, state } = memoryStore();
    consentReducer(initialConsentState, { type: 'DECLINE' });
    expect(state.writes).toBe(0);
    expect((await launch(port)).status).toBe('unanswered');
  });
});

describe('app restart after acknowledgement', () => {
  it('restores consent without showing the notice again', async () => {
    const { port } = memoryStore();
    await saveConsent(port, V, NOW);
    const state = await launch(port);
    expect(state.status).toBe('accepted');
    expect(canRecord(state)).toBe(true);
    expect(await loadConsent(port, V)).toEqual({ acknowledged: true, acknowledgedAt: NOW.toISOString() });
  });

  it('restoring does not write again', async () => {
    const { port, state } = memoryStore();
    await saveConsent(port, V, NOW);
    const writes = state.writes;
    await launch(port);
    expect(state.writes).toBe(writes);
  });

  it('restoring never overrides a decline made this session', () => {
    const declined = consentReducer(initialConsentState, { type: 'DECLINE' });
    expect(consentReducer(declined, { type: 'RESTORE' })).toBe(declined);
  });
});

describe('updated consent version', () => {
  it('asks again when the stored version differs, and does not allow recording', async () => {
    const { port } = memoryStore();
    await saveConsent(port, 'local-recording-0', NOW);
    expect(await loadConsent(port, V)).toEqual({ acknowledged: false, reason: 'version_changed' });
    expect(canRecord(await launch(port))).toBe(false);
  });

  it('asks again for a newer stored version too (for example after a downgrade)', async () => {
    const { port } = memoryStore();
    await saveConsent(port, 'local-recording-99', NOW);
    expect((await loadConsent(port, V)).acknowledged).toBe(false);
  });

  it('accepts the new version once acknowledged, replacing the old record', async () => {
    const { port } = memoryStore();
    await saveConsent(port, 'v1', NOW);
    expect((await loadConsent(port, 'v2')).acknowledged).toBe(false);
    await saveConsent(port, 'v2', NOW);
    expect((await loadConsent(port, 'v2')).acknowledged).toBe(true);
    expect((await loadConsent(port, 'v1')).acknowledged).toBe(false);
  });

  it('compares versions exactly, with no prefix or case matching', async () => {
    const { port } = memoryStore();
    await saveConsent(port, 'LOCAL-RECORDING-1', NOW);
    expect((await loadConsent(port, 'local-recording-1')).acknowledged).toBe(false);
  });
});

describe('storage failures', () => {
  it('a failed write is reported as not saved, never as success', async () => {
    const { port, state } = memoryStore();
    state.failWrite = true;
    expect(await saveConsent(port, V, NOW)).toEqual({ saved: false });
  });

  it('a write that did not stick is not reported as saved', async () => {
    const { port, state } = memoryStore();
    state.dropWrites = true;
    expect(await saveConsent(port, V, NOW)).toEqual({ saved: false });
  });

  it('a write whose read-back fails is not reported as saved', async () => {
    const { port, state } = memoryStore();
    const write = port.write;
    port.write = async (text) => {
      await write(text);
      state.failRead = true;
    };
    expect(await saveConsent(port, V, NOW)).toEqual({ saved: false });
  });

  it('a failed read means not acknowledged, so the notice is shown rather than assuming consent', async () => {
    const { port, state } = memoryStore();
    await saveConsent(port, V, NOW);
    state.failRead = true;
    expect(await loadConsent(port, V)).toEqual({ acknowledged: false, reason: 'read_failed' });
    expect(canRecord(await launch(port))).toBe(false);
  });

  it.each(['', 'not json', '{', '[]', 'null', '{"version":1,"acknowledgedAt":"x"}', '{"version":"","acknowledgedAt":"x"}', '{"version":"local-recording-1"}'])(
    'a corrupt record (%p) means not acknowledged',
    async (text) => {
      const { port } = memoryStore(text);
      const loaded = await loadConsent(port, V);
      expect(loaded.acknowledged).toBe(false);
    },
  );

  it('never throws, whatever storage does', async () => {
    const throwing: ConsentStorePort = {
      read: async () => {
        throw new Error('boom');
      },
      write: async () => {
        throw new Error('boom');
      },
      remove: async () => {
        throw new Error('boom');
      },
    };
    await expect(loadConsent(throwing, V)).resolves.toMatchObject({ acknowledged: false });
    await expect(saveConsent(throwing, V)).resolves.toEqual({ saved: false });
  });

  it('after a failed save the user is told, and the next launch asks again', async () => {
    const { port, state } = memoryStore();
    state.failWrite = true;
    const saved = await saveConsent(port, V, NOW);
    expect(saved.saved).toBe(false);
    state.failWrite = false;
    expect((await loadConsent(port, V)).acknowledged).toBe(false);
    const hook = fs.readFileSync(path.join(__dirname, '..', 'src/hooks/useConsent.ts'), 'utf8');
    expect(hook).toContain('setSaveFailed(!result.saved)');
    // The conversation tells the user, in the transcript, when the choice could not be stored.
    expect(hook).toContain('return result.saved;');
    const convo = fs.readFileSync(path.join(__dirname, '..', 'src/conversation/useConversation.ts'), 'utf8');
    expect(convo).toContain('onConsentAccepted(saved)');
    const script = fs.readFileSync(path.join(__dirname, '..', 'src/conversation/script.ts'), 'utf8');
    expect(script).toContain('CONSENT_SAVE_FAILED_MESSAGE');
  });
});

/** Recording controller with a switchable OS permission, to test consent against permission. */
function controllerHarness(permissions: (boolean | PermissionResult)[]) {
  const answers = [...permissions];
  const requests = { count: 0 };
  const files = new Set<string>();
  let n = 0;
  let uri: string | null = null;
  const controller: RecordingController = createRecordingController({
    port: {
      prepare: async () => undefined,
      record: () => {
        n += 1;
        uri = `file:///cache/take-${n}.wav`;
        files.add(uri);
      },
      stop: async () => undefined,
      snapshot: () => ({ uri, durationMs: 1500, fileSize: 4096 }),
    },
    requestPermission: async () => {
      requests.count += 1;
      return answers.length > 1 ? (answers.shift() as boolean | PermissionResult) : answers[0];
    },
    setRecordingMode: async () => undefined,
    sweep: async () => ({ failed: 0 }),
    deleteFile: (u) => {
      files.delete(u);
    },
    log: () => undefined,
  });
  const phase = () => controller.getSnapshot().recorder.phase;
  return { controller, requests, files, phase };
}

describe('consent and Android microphone permission are separate', () => {
  it('acknowledged consent does not start recording: the OS permission is still asked', async () => {
    const h = controllerHarness([{ granted: false, canAskAgain: true }]);
    h.controller.setConsent(canRecord(await launch((await (async () => { const m = memoryStore(); await saveConsent(m.port, V, NOW); return m; })()).port)));
    await h.controller.start();
    expect(h.requests.count).toBe(1);
    expect(h.phase()).toBe('permission-denied'); // existing recovery flow
    expect(h.files.size).toBe(0);
  });

  it('without consent the OS is not even asked', async () => {
    const h = controllerHarness([true]);
    h.controller.setConsent(false);
    await h.controller.start();
    expect(h.requests.count).toBe(0);
    expect(h.phase()).toBe('idle');
  });

  it('revoked after acknowledgement: the next recording meets the permanent-denial flow', async () => {
    const h = controllerHarness([{ granted: true }, { granted: false, canAskAgain: false }]);
    h.controller.setConsent(true);
    await h.controller.start();
    await h.controller.stop();
    expect(h.phase()).toBe('recorded');
    // The user revokes the microphone in Android Settings; consent is untouched.
    await h.controller.start();
    expect(h.requests.count).toBe(2);
    expect(h.phase()).toBe('permission-blocked');
    expect(h.files.size).toBe(0); // the earlier take was replaced when the user started again
  });

  it('revoked between launches: restored consent still goes through the permission check', async () => {
    const m = memoryStore();
    await saveConsent(m.port, V, NOW);
    // Launch 2: consent restored from storage, but the OS now says no.
    const h = controllerHarness([{ granted: false, canAskAgain: true }]);
    h.controller.setConsent(canRecord(await launch(m.port)));
    await h.controller.start();
    expect(h.phase()).toBe('permission-denied');
    expect(h.requests.count).toBe(1);
  });

  it('the consent store never touches permission and the permission code never reads consent storage', () => {
    const read = (f: string) => fs.readFileSync(path.join(__dirname, '..', 'src', f), 'utf8');
    expect(read('hooks/consentStore.ts')).not.toMatch(/Permission|expo-audio/);
    expect(read('hooks/consentFile.ts')).not.toMatch(/Permission|expo-audio/);
    expect(read('hooks/useNameRecorder.ts')).not.toMatch(/consentStore|consentFile|loadConsent/);
  });
});

describe('what is stored and where', () => {
  const read = (f: string) => fs.readFileSync(path.join(__dirname, '..', f), 'utf8');

  it('keeps the consent file out of the cache folder that is swept for recordings', () => {
    const file = read('src/hooks/consentFile.ts');
    expect(file).toContain('Paths.document');
    expect(file).not.toContain('Paths.cache');
    expect(read('src/hooks/recordingFiles.ts')).toContain('Paths.cache');
  });

  it('adds no dependency for it', () => {
    const pkg = JSON.parse(read('package.json')) as { dependencies: Record<string, string> };
    expect(Object.keys(pkg.dependencies)).not.toContain('@react-native-async-storage/async-storage');
  });

  it('does not change what happens to voice recordings', () => {
    const files = read('src/hooks/recordingFiles.ts');
    expect(files).toMatch(/new Directory\(Paths\.cache, WORK_DIRECTORY_NAME\)/);
    expect(read('src/hooks/consentStore.ts')).not.toMatch(/\.wav|\buri\b|expo-file-system/);
  });

  it('keeps the version constant that gates the stored acknowledgement', () => {
    expect(CONSENT_NOTICE_VERSION).toMatch(/^[a-z0-9-]+$/);
    expect(read('src/hooks/useConsent.ts')).toContain('CONSENT_NOTICE_VERSION');
  });

  it('lets a second tap on Agree start only one save', () => {
    expect(read('src/hooks/useConsent.ts')).toMatch(/if \(saving\.current\) return false;/);
  });
});
