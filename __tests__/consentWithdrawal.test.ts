import * as fs from 'fs';
import * as path from 'path';

import {
  CONSENT_NOTICE_VERSION,
  WITHDRAW_CANCEL_LABEL,
  WITHDRAW_CONFIRM_LABEL,
  WITHDRAW_FAILED_MESSAGE,
  WITHDRAW_POINTS,
} from '../src/constants/consent';
import { canRecord, consentReducer, initialConsentState } from '../src/hooks/consentState';
import {
  loadConsent,
  saveConsent,
  withdrawConsent,
  type ConsentStorePort,
} from '../src/hooks/consentStore';
import {
  createRecordingController,
  type PermissionResult,
  type RecordingController,
} from '../src/hooks/recordingController';

const V = CONSENT_NOTICE_VERSION;
const NOW = new Date('2026-11-09T09:00:00.000Z');
const read = (f: string) => fs.readFileSync(path.join(__dirname, '..', f), 'utf8');
/** Source without comments, so a rule about what code does is not tripped by prose about it. */
const code = (f: string) => read(f).replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');

/** In-memory consent file with a switch for each way removal or writing can fail. */
function store(initial: string | null = null) {
  const s = {
    text: initial,
    removeThrows: false,
    removeIgnored: false,
    writeThrows: false,
    readThrows: false,
    calls: [] as string[],
  };
  const port: ConsentStorePort = {
    read: async () => {
      s.calls.push('read');
      if (s.readThrows) throw new Error('read failed');
      return s.text;
    },
    write: async (t) => {
      s.calls.push('write');
      if (s.writeThrows) throw new Error('write failed');
      s.text = t;
    },
    remove: async () => {
      s.calls.push('remove');
      if (s.removeThrows) throw new Error('remove failed');
      if (!s.removeIgnored) s.text = null;
    },
  };
  return { s, port };
}

async function acknowledged() {
  const h = store();
  await saveConsent(h.port, V, NOW);
  h.s.calls.length = 0;
  return h;
}

/** What the app does at launch. */
async function launch(port: ConsentStorePort) {
  const loaded = await loadConsent(port, V);
  return loaded.acknowledged ? consentReducer(initialConsentState, { type: 'RESTORE' }) : initialConsentState;
}

describe('confirming withdrawal', () => {
  it('removes the saved acknowledgement and confirms it by reading storage again', async () => {
    const h = await acknowledged();
    expect(await withdrawConsent(h.port, V, NOW)).toEqual({ withdrawn: true });
    expect(h.s.text).toBeNull();
    expect(h.s.calls).toEqual(['remove', 'read']);
  });

  it('leaves the app in the consent-required state', async () => {
    const accepted = consentReducer(initialConsentState, { type: 'ACCEPT' });
    const after = consentReducer(accepted, { type: 'WITHDRAW' });
    expect(after.status).toBe('unanswered');
    expect(canRecord(after)).toBe(false);
  });

  it('succeeds when there was nothing stored (already withdrawn or never saved)', async () => {
    const h = store();
    expect(await withdrawConsent(h.port, V, NOW)).toEqual({ withdrawn: true });
  });

  it('also withdraws a saved acknowledgement of an older notice version', async () => {
    const h = store();
    await saveConsent(h.port, 'old-version', NOW);
    expect(await withdrawConsent(h.port, V, NOW)).toEqual({ withdrawn: true });
  });
});

describe('cancelling withdrawal', () => {
  it('touches nothing: consent stays saved and on', async () => {
    const h = await acknowledged();
    // Cancel only closes the confirmation (see the source check below); storage is never called.
    expect(h.s.calls).toEqual([]);
    expect((await launch(h.port)).status).toBe('accepted');
  });

  it('the confirmation has a distinct Cancel that changes nothing', () => {
    const ui = read('src/components/ConsentSettings.tsx');
    expect(WITHDRAW_CANCEL_LABEL).toBe('Cancel');
    expect(ui).toMatch(/label=\{WITHDRAW_CANCEL_LABEL\}[\s\S]*?variant="neutral"[\s\S]*?setConfirming\(false\)/);
    // Cancel does not call the hook's withdraw.
    const cancel = ui.slice(ui.indexOf('label={WITHDRAW_CANCEL_LABEL}'));
    expect(cancel.slice(0, 260)).not.toContain('withdraw(');
  });
});

describe('opening the withdrawal flow', () => {
  const ui = read('src/components/ConsentSettings.tsx');
  const settings = read('src/components/SettingsSheet.tsx');
  const screen = read('src/components/ConversationScreen.tsx');

  it('is reachable from the settings entry point, without a new route of its own', () => {
    expect(settings).toContain('<ConsentSettings');
    expect(screen).toContain('<SettingsSheet');
    expect(screen).toContain('label="Settings"');
    expect(fs.readdirSync(path.join(__dirname, '..', 'src/app')).sort()).toEqual(['_layout.tsx', 'assistant.tsx', 'birthday.tsx', 'demo.tsx', 'index.tsx']); // assistant.tsx: the voice assistant moved off the home route; birthday.tsx and demo.tsx: the separate birthday experiment and pre-generated demo routes, not part of withdrawal
  });

  it('asks for confirmation before doing anything, and never in one tap', () => {
    // The first button only opens the confirmation.
    expect(ui).toMatch(/label=\{WITHDRAW_OPEN_LABEL\}[\s\S]*?onPress=\{\(\) => setConfirming\(true\)\}/);
    expect(ui).toMatch(/label=\{WITHDRAW_CONFIRM_LABEL\}[\s\S]*?void confirm\(\)/);
    expect(WITHDRAW_CONFIRM_LABEL).not.toBe(WITHDRAW_CANCEL_LABEL);
  });

  it('uses the existing hierarchy: confirm is primary, Cancel is grey, nothing is red', () => {
    expect(ui).not.toMatch(/variant="destructive/);
    expect(ui).toMatch(/label=\{WITHDRAW_CONFIRM_LABEL\} onPress/); // default variant is primary
    expect(ui).toContain('variant="neutral"');
    expect(ui).toContain('variant="secondary"'); // the entry button
  });

  it('gives the screen reader a heading, labelled buttons and a spoken result', () => {
    expect(ui).toContain('accessibilityRole="header"');
    expect(ui).toContain('accessibilityRole="alert"');
    expect(ui).toContain('announceForAccessibility(WITHDRAWN_ANNOUNCEMENT)');
    expect(read('src/components/ActionButton.tsx')).toContain('buttonA11y(');
  });

  it('shows the entry only while recording is allowed, and a plain status otherwise', () => {
    expect(ui).toMatch(/if \(!allowed\) \{\s*return <Text style=\{styles\.body\}>\{WITHDRAW_STATUS_OFF\}/);
  });
});

describe('what the user is told', () => {
  const point = (heading: RegExp) => WITHDRAW_POINTS.find((p) => heading.test(p.heading))?.text ?? '';

  it('explains recording, existing recordings, songs, other choices and the phone permission separately', () => {
    expect(WITHDRAW_POINTS.map((p) => p.heading)).toEqual([
      'Recording',
      'A recording you already made',
      'A song you already made',
      'Other choices',
      "Your phone's microphone permission",
    ]);
  });

  it('says recording stops and fresh consent is needed', () => {
    expect(point(/^Recording$/)).toMatch(/stop recording/i);
    expect(point(/^Recording$/)).toMatch(/agree again/i);
  });

  it('does not claim that an existing recording or song is deleted', () => {
    expect(point(/recording you already/i)).toMatch(/not deleted/i);
    expect(point(/song you already/i)).toMatch(/not deleted/i);
    for (const p of WITHDRAW_POINTS) expect(p.text).not.toMatch(/\b(is|are|will be|gets) deleted\b/i);
  });

  it('states the real lifetimes from the retention policy', () => {
    expect(point(/recording you already/i)).toMatch(/delete it, record again, or the app clears it/i);
    expect(point(/song you already/i)).toMatch(/make it again|app closes/i);
  });

  it('says the microphone permission is unchanged and where to change it', () => {
    expect(point(/microphone permission/i)).toMatch(/does not change/i);
    expect(point(/microphone permission/i)).toMatch(/Android Settings/);
  });

  it('says the language choice is unchanged', () => {
    expect(point(/other choices/i)).toMatch(/not changed/i);
  });
});

describe('restart after withdrawal, and fresh consent', () => {
  it('a restart asks for consent again and does not allow recording', async () => {
    const h = await acknowledged();
    expect((await launch(h.port)).status).toBe('accepted');
    await withdrawConsent(h.port, V, NOW);
    const restarted = await launch(h.port);
    expect(restarted.status).toBe('unanswered');
    expect(canRecord(restarted)).toBe(false);
  });

  it('agreeing again saves a new acknowledgement, and a later restart skips the notice again', async () => {
    const h = await acknowledged();
    await withdrawConsent(h.port, V, NOW);
    expect(await saveConsent(h.port, V, new Date('2026-11-10T00:00:00.000Z'))).toEqual({ saved: true });
    expect((await launch(h.port)).status).toBe('accepted');
  });

  it('a record invalidated by the fallback is never read back as consent', async () => {
    const h = await acknowledged();
    h.s.removeThrows = true;
    expect(await withdrawConsent(h.port, V, NOW)).toEqual({ withdrawn: true });
    expect(await loadConsent(h.port, V)).toMatchObject({ acknowledged: false, reason: 'invalid' });
    expect(canRecord(await launch(h.port))).toBe(false);
  });
});

describe('storage failure', () => {
  it('remove fails but the overwrite works: still withdrawn, and confirmed', async () => {
    const h = await acknowledged();
    h.s.removeThrows = true;
    expect(await withdrawConsent(h.port, V, NOW)).toEqual({ withdrawn: true });
    expect(h.s.calls).toEqual(['remove', 'read', 'write', 'read']);
  });

  it('remove reports success without removing: the overwrite is used and checked', async () => {
    const h = await acknowledged();
    h.s.removeIgnored = true;
    expect(await withdrawConsent(h.port, V, NOW)).toEqual({ withdrawn: true });
    expect((await loadConsent(h.port, V)).acknowledged).toBe(false);
  });

  it('remove and overwrite both fail: not withdrawn, and the acknowledgement is still stored', async () => {
    const h = await acknowledged();
    h.s.removeThrows = true;
    h.s.writeThrows = true;
    expect(await withdrawConsent(h.port, V, NOW)).toEqual({ withdrawn: false });
    expect((await loadConsent(h.port, V)).acknowledged).toBe(true);
  });

  it('storage that cannot be read afterwards is not proof of withdrawal', async () => {
    const h = await acknowledged();
    h.s.readThrows = true;
    expect(await withdrawConsent(h.port, V, NOW)).toEqual({ withdrawn: false });
  });

  it('never throws, whatever storage does', async () => {
    const broken: ConsentStorePort = {
      read: async () => {
        throw new Error('x');
      },
      write: async () => {
        throw new Error('x');
      },
      remove: async () => {
        throw new Error('x');
      },
    };
    await expect(withdrawConsent(broken, V)).resolves.toEqual({ withdrawn: false });
  });

  it('the hook only returns to consent-required after confirmation, and otherwise reports the failure', () => {
    const hook = read('src/hooks/useConsent.ts');
    const body = hook.slice(hook.indexOf('const withdraw = useCallback'));
    expect(body.indexOf('if (!result.withdrawn)')).toBeLessThan(body.indexOf("dispatch({ type: 'WITHDRAW' })"));
    expect(body).toMatch(/if \(!result\.withdrawn\) \{[\s\S]*?setWithdrawalFailed\(true\);[\s\S]*?return false;/);
    expect(body).toContain('if (withdrawing.current || saving.current) return false;');
  });

  it('the screen shows a clear error and does not claim success', () => {
    const ui = read('src/components/ConsentSettings.tsx');
    expect(WITHDRAW_FAILED_MESSAGE).toMatch(/still on/i);
    expect(ui).toContain('consent.withdrawalFailed');
    expect(ui).toContain('if (done) AccessibilityInfo.announceForAccessibility');
  });

  it('a failed withdrawal leaves the session state untouched', () => {
    const accepted = consentReducer(initialConsentState, { type: 'ACCEPT' });
    // No WITHDRAW action is dispatched on failure, so the state object is the same one.
    expect(canRecord(accepted)).toBe(true);
  });

  it('withdrawing when consent is already off changes nothing', () => {
    expect(consentReducer(initialConsentState, { type: 'WITHDRAW' })).toBe(initialConsentState);
    const declined = consentReducer(initialConsentState, { type: 'DECLINE' });
    expect(consentReducer(declined, { type: 'WITHDRAW' }).status).toBe('unanswered');
  });
});

function recorderHarness(permissions: (boolean | PermissionResult)[] = [true]) {
  const answers = [...permissions];
  const state = { requests: 0, n: 0, uri: null as string | null };
  const files = new Set<string>();
  const controller: RecordingController = createRecordingController({
    port: {
      prepare: async () => undefined,
      record: () => {
        state.n += 1;
        state.uri = `file:///cache/NameSinger/name-${state.n}.wav`;
        files.add(state.uri);
      },
      stop: async () => undefined,
      snapshot: () => ({ uri: state.uri, durationMs: 1500, fileSize: 4096 }),
    },
    requestPermission: async () => {
      state.requests += 1;
      return answers.length > 1 ? (answers.shift() as boolean | PermissionResult) : answers[0];
    },
    setRecordingMode: async () => undefined,
    sweep: async () => ({ failed: 0 }),
    deleteFile: (u) => {
      files.delete(u);
    },
    log: () => undefined,
  });
  controller.setConsent(true);
  const phase = () => controller.getSnapshot().recorder.phase;
  return { controller, state, files, phase };
}

describe('consent and the Android microphone permission stay independent', () => {
  it('withdrawal asks the OS nothing and changes nothing about it', async () => {
    const h = await acknowledged();
    const rec = recorderHarness();
    await rec.controller.start();
    await rec.controller.stop();
    const asked = rec.state.requests;
    await withdrawConsent(h.port, V, NOW);
    rec.controller.setConsent(false);
    expect(rec.state.requests).toBe(asked);
  });

  it('without consent the OS is not asked, so the app cannot start recording behind the notice', async () => {
    const rec = recorderHarness();
    rec.controller.setConsent(false);
    await rec.controller.start();
    expect(rec.state.requests).toBe(0);
    expect(rec.phase()).toBe('idle');
  });

  it('after agreeing again, recording does not start by itself, and the OS is asked fresh on the first record', async () => {
    const rec = recorderHarness([{ granted: false, canAskAgain: true }]);
    rec.controller.setConsent(false);
    rec.controller.setConsent(true); // agreed again
    expect(rec.state.requests).toBe(0);
    expect(rec.phase()).toBe('idle');
    await rec.controller.start(); // the user taps Record
    expect(rec.state.requests).toBe(1);
    expect(rec.phase()).toBe('permission-denied'); // the OS state, not consent, decides
  });

  it('a permission that is still granted is not reported as revoked, and one that is revoked is not reported as granted', async () => {
    const granted = recorderHarness([{ granted: true }]);
    await granted.controller.start();
    expect(granted.phase()).toBe('recording');
    const revoked = recorderHarness([{ granted: false, canAskAgain: false }]);
    await revoked.controller.start();
    expect(revoked.phase()).toBe('permission-blocked');
  });

  it('the withdrawal code never mentions or changes permissions', () => {
    for (const f of ['src/hooks/consentStore.ts', 'src/hooks/consentFile.ts', 'src/hooks/useConsent.ts', 'src/components/ConsentSettings.tsx']) {
      expect(read(f)).not.toMatch(/requestRecordingPermissions|getRecordingPermissions|expo-audio|openSettings|revoke/);
    }
  });
});

describe('existing recordings and songs are not touched by withdrawal', () => {
  it('withdrawing consent deletes no recording file', async () => {
    const h = await acknowledged();
    const rec = recorderHarness();
    await rec.controller.start();
    await rec.controller.stop();
    rec.controller.approve();
    await withdrawConsent(h.port, V, NOW);
    rec.controller.setConsent(false);
    expect(rec.phase()).toBe('approved');
    expect(rec.files.size).toBe(1);
  });

  it('an unapproved take is kept too', async () => {
    const rec = recorderHarness();
    await rec.controller.start();
    await rec.controller.stop();
    rec.controller.setConsent(false);
    expect(rec.phase()).toBe('recorded');
    expect(rec.files.size).toBe(1);
  });

  it('the recording can still be deleted on purpose after withdrawal, and only then', async () => {
    const rec = recorderHarness();
    await rec.controller.start();
    await rec.controller.stop();
    rec.controller.approve();
    rec.controller.setConsent(false);
    expect(rec.files.size).toBe(1);
    rec.controller.reset(); // the user confirmed Delete recording
    expect(rec.phase()).toBe('idle');
    expect(rec.files.size).toBe(0);
  });

  it('recording again is refused while consent is off, and it deletes nothing', async () => {
    const rec = recorderHarness();
    await rec.controller.start();
    await rec.controller.stop();
    rec.controller.setConsent(false);
    await rec.controller.start();
    expect(rec.phase()).toBe('recorded');
    expect(rec.files.size).toBe(1);
  });

  it('the consent code has no way to reach recordings, songs or preferences', () => {
    for (const f of ['src/hooks/consentStore.ts', 'src/hooks/consentFile.ts', 'src/hooks/useConsent.ts']) {
      expect(code(f)).not.toMatch(/recordingFiles|deleteRecordingFile|sweep|NameSinger\/|\.wav|song|language/i);
    }
  });

  it('the retention code and storage locations are unchanged', () => {
    expect(read('src/hooks/recordingFiles.ts')).toContain("new Directory(Paths.cache, WORK_DIRECTORY_NAME)");
    expect(read('src/hooks/consentFile.ts')).toContain('Paths.document');
  });

  it('keeps deleting an existing recording possible whether or not consent is on', () => {
    const settings = read('src/components/SettingsSheet.tsx');
    // The delete control depends only on whether a recording exists, never on consent.
    expect(settings).toContain('hasRecording');
    expect(settings).toContain('label="Delete recording"');
    expect(settings).not.toMatch(/canRecord|consent\.state/);
  });

  it('the conversation only says that recording is off after withdrawal; it deletes nothing', () => {
    const hook = read('src/conversation/useConversation.ts');
    const block = hook.slice(hook.indexOf('const previousAllowed'), hook.indexOf('--- public actions'));
    const code = block.replace(/\/\/.*$/gm, '');
    expect(code).toContain('onConsentWithdrawn()');
    expect(code).not.toMatch(/reset\(|discard|delete/i);
  });
});

describe('withdrawal during an active session', () => {
  it('cannot be started while the microphone is starting, recording or stopping', () => {
    expect(read('src/components/SettingsSheet.tsx')).toContain('<ConsentSettings consent={consent} microphoneBusy={microphoneBusy}');
    expect(read('src/components/ConversationScreen.tsx')).toContain('microphoneBusy={microphoneBusy}');
    const ui = read('src/components/ConsentSettings.tsx');
    expect(ui).toContain('disabled={microphoneBusy}');
    expect(ui).toContain('WITHDRAW_UNAVAILABLE_HINT');
  });

  it('if consent turns off mid-take anyway, the take still stops cleanly and is kept, not lost', async () => {
    const rec = recorderHarness();
    await rec.controller.start();
    expect(rec.phase()).toBe('recording');
    rec.controller.setConsent(false);
    await rec.controller.stop();
    expect(rec.phase()).toBe('recorded');
    expect(rec.files.size).toBe(1);
  });

  it('playback is not stopped or affected by withdrawal', () => {
    expect(read('src/components/ConsentSettings.tsx')).not.toMatch(/onActivate|player|usePlayback/);
  });

  it('a second tap on Withdraw cannot start a second withdrawal', () => {
    expect(read('src/hooks/useConsent.ts')).toContain('if (withdrawing.current || saving.current) return false;');
    expect(read('src/components/ConsentSettings.tsx')).toContain('loading={working}');
  });
});
