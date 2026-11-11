import * as fs from 'fs';
import * as path from 'path';

import { classifyReply, matchLanguage, MAX_NAME_LENGTH, parseName } from '../src/conversation/answers';
import * as convo from '../src/conversation/conversation';
import { conversationReducer, initialConversation } from '../src/conversation/conversation';
import * as script from '../src/conversation/script';
import type { Action, Chip, Command, ConversationState, OrbTapContext, Result } from '../src/conversation/types';

const read = (f: string) => fs.readFileSync(path.join(__dirname, '..', f), 'utf8');

/** Applies a result to a state, collecting the commands, like the hook does. */
function run(state: ConversationState, result: Result, commands: Command[] = []): ConversationState {
  commands.push(...result.commands);
  return result.actions.reduce(conversationReducer, state);
}

function start(): ConversationState {
  return run(initialConversation, convo.begin());
}

const lastAssistant = (s: ConversationState) => [...s.messages].reverse().find((m) => m.role === 'assistant');
const chip = (id: Chip['id'], label = id as string): Chip => ({ id, label });

/** Voice path: the take finished and passed the checks. */
function withTake(state: ConversationState, quiet = false): ConversationState {
  return run(state, convo.onTakeRecorded(state, { durationMs: 2300, quiet }));
}

describe('the first question', () => {
  it('asks the name and nothing else, and does not start the microphone', () => {
    const result = convo.begin();
    const state = run(initialConversation, result);
    expect(state.step).toBe('ask-name');
    expect(state.messages).toHaveLength(1);
    expect(state.messages[0].text).toBe(script.FIRST_QUESTION);
    expect(state.messages[0].role).toBe('assistant');
    expect(result.commands).toEqual([]);
  });

  it('offers both ways to answer in the question itself', () => {
    expect(script.FIRST_QUESTION).toMatch(/say it/i);
    expect(script.FIRST_QUESTION).toMatch(/type it/i);
  });

  it('waits for an answer: no later question is asked until one arrives', () => {
    const state = start();
    expect(state.messages.filter((m) => m.role === 'assistant')).toHaveLength(1);
  });
});

describe('typed names', () => {
  it('accepts a typed name into the conversation state and answers in the transcript', () => {
    const state = run(start(), convo.onUserText(start(), '  Asha  '));
    expect(state.displayName).toBe('Asha');
    expect(state.messages[1]).toMatchObject({ role: 'user', text: 'Asha' });
    expect(lastAssistant(state)?.text).toBe(script.NEEDS_VOICE('Asha'));
    expect(state.step).toBe('ask-name'); // the song still needs the spoken take
  });

  it('is honest that typed letters cannot become the voice in the song', () => {
    expect(script.NEEDS_VOICE('Asha')).toMatch(/your own voice/i);
    expect(script.NEEDS_VOICE('Asha')).toMatch(/can't turn typed letters into your voice/i);
  });

  it('accepts names in any script', () => {
    for (const name of ['आशा', 'அன்பு', 'José', 'Mary-Ann', "D'Souza"]) {
      expect(parseName(name)).toEqual({ ok: true, name });
    }
  });

  it('rejects empty, numeric, symbol-only, control-character and over-long names', () => {
    for (const bad of ['', '   ', '1234', '!!!', 'Asha\u0007', 'x'.repeat(MAX_NAME_LENGTH + 1)]) {
      expect(parseName(bad)).toEqual({ ok: false });
    }
    expect(parseName('x'.repeat(MAX_NAME_LENGTH))).toMatchObject({ ok: true });
  });

  it('asks again for an invalid name and records no name', () => {
    const state = run(start(), convo.onUserText(start(), '1234'));
    expect(state.displayName).toBeNull();
    expect(lastAssistant(state)?.text).toBe(script.NAME_INVALID);
  });

  it('collapses whitespace in a typed name', () => {
    expect(parseName('  Mary   Ann ')).toEqual({ ok: true, name: 'Mary Ann' });
  });
});

describe('spoken names (the take)', () => {
  it('shows the take in the transcript as a labelled voice entry and moves to review', () => {
    const state = withTake(start());
    expect(state.step).toBe('review-take');
    const voice = state.messages.find((m) => m.kind === 'voice-take');
    expect(voice).toMatchObject({ role: 'user', text: 'Voice recording · 0:02' });
    expect(lastAssistant(state)?.chips.map((c) => c.id)).toEqual(['take-play', 'take-use', 'take-again']);
  });

  it('is the same conversation as typing: a typed name before the take is used in the review', () => {
    let state = run(start(), convo.onUserText(start(), 'Asha'));
    state = withTake(state);
    expect(lastAssistant(state)?.text).toBe(script.REVIEW('Asha', false));
    expect(state.displayName).toBe('Asha');
  });

  it('mentions when the take was quiet, without rejecting it', () => {
    const state = withTake(start(), true);
    expect(lastAssistant(state)?.text).toMatch(/quiet/i);
    expect(state.step).toBe('review-take');
  });

  it('explains an unusable take and keeps waiting at the name question', () => {
    const state = run(start(), convo.onTakeUnusable("We couldn't hear anything."));
    expect(state.step).toBe('ask-name');
    expect(lastAssistant(state)?.text).toMatch(/couldn't hear anything.*tap the orb to try again/i);
  });
});

describe('correcting the name', () => {
  it('a typed correction at the review step updates the name and keeps the review choices', () => {
    const reviewed = withTake(run(start(), convo.onUserText(start(), 'Asha')));
    const state = run(reviewed, convo.onUserText(reviewed, 'Aisha'));
    expect(state.displayName).toBe('Aisha');
    expect(state.step).toBe('review-take');
    expect(lastAssistant(state)?.text).toBe(script.NAME_UPDATED('Aisha'));
    expect(lastAssistant(state)?.chips.map((c) => c.id)).toContain('take-use');
  });

  it('"record again" by chip or by typing is the same transition', () => {
    const reviewed = withTake(start());
    const viaChip = convo.onChip(reviewed, chip('take-again'));
    const viaText = convo.onUserText(reviewed, 'again');
    expect(viaText.commands).toEqual(viaChip.commands);
    expect(viaText.commands).toEqual(['discard-recording']);
    const a = run(reviewed, viaChip);
    const b = run(reviewed, viaText);
    expect(a.step).toBe('ask-name');
    expect(b.step).toBe('ask-name');
    expect(lastAssistant(a)?.text).toBe(script.AGAIN);
    expect(lastAssistant(b)?.text).toBe(script.AGAIN);
  });

  it('"use another name" after a song starts over, forgets the answers and keeps the transcript', () => {
    let state = withTake(run(start(), convo.onUserText(start(), 'Asha')));
    const before = state.messages.length;
    const commands: Command[] = [];
    state = run(state, convo.onChip(state, chip('song-new-name')), commands);
    expect(commands).toEqual(['discard-recording']);
    expect(state.displayName).toBeNull();
    expect(state.languageAnswered).toBe(false);
    expect(state.step).toBe('ask-name');
    expect(state.messages.length).toBeGreaterThan(before);
  });
});

describe('voice, text and chips are one set of actions', () => {
  it('"use this recording": chip and typed "yes" give identical results', () => {
    const reviewed = withTake(start());
    const viaChip = convo.onChip(reviewed, chip('take-use'));
    for (const text of ['yes', 'use it', 'Use this recording', 'ok', 'sure']) {
      expect(convo.onUserText(reviewed, text)).toEqual(viaChip);
    }
    expect(viaChip.commands).toEqual(['approve-recording']);
  });

  it('language: chip, English name and native name all choose the same language', () => {
    let state = withTake(start());
    state = run(state, convo.onChip(state, chip('take-use')));
    expect(state.step).toBe('ask-language');
    const viaChip = convo.onChip(state, chip('language:hi-IN'));
    expect(convo.onUserText(state, 'Hindi')).toEqual(viaChip);
    const native = run(state, convo.onUserText(state, 'हिन्दी'));
    expect(native.language).toBe('hi-IN');
    expect(matchLanguage('hindi please')?.code).toBe('hi-IN');
    expect(matchLanguage('klingon')).toBeNull();
  });

  it('skipping the language by chip or by typing is the same', () => {
    let state = withTake(start());
    state = run(state, convo.onChip(state, chip('take-use')));
    const viaChip = convo.onChip(state, chip('language-skip'));
    for (const text of ['skip', 'none', 'later']) expect(convo.onUserText(state, text)).toEqual(viaChip);
  });

  it('an unknown language is asked about again, not guessed', () => {
    let state = withTake(start());
    state = run(state, convo.onChip(state, chip('take-use')));
    const next = run(state, convo.onUserText(state, 'klingon'));
    expect(next.language).toBeNull();
    expect(next.languageAnswered).toBe(false);
    expect(lastAssistant(next)?.text).toBe(script.LANGUAGE_RETRY);
  });

  it('classifies short replies the same way wherever they are used', () => {
    expect(classifyReply('Yes!', 'confirm')).toBe('yes');
    expect(classifyReply('record again', 'confirm')).toBe('again');
    expect(classifyReply('maybe', 'confirm')).toBe('none');
    expect(classifyReply('skip', 'skip')).toBe('skip');
  });
});

describe('the song is only generated after the answers and an explicit go-ahead', () => {
  function reachConfirm(): ConversationState {
    let state = withTake(run(start(), convo.onUserText(start(), 'Asha')));
    state = run(state, convo.onChip(state, chip('take-use')));
    state = run(state, convo.onChip(state, chip('language:en-IN')));
    return state;
  }

  it('asks for the go-ahead after the language and offers it as a chip and as typing', () => {
    const state = reachConfirm();
    expect(state.step).toBe('confirm-make');
    expect(lastAssistant(state)?.text).toBe(script.CONFIRM_QUESTION);
    expect(lastAssistant(state)?.chips.map((c) => c.id)).toEqual(['make', 'take-again']);
  });

  it('make-song comes only from the confirmation step, by chip or by typing, and identically', () => {
    const state = reachConfirm();
    const viaChip = convo.onChip(state, chip('make'));
    expect(viaChip.commands).toEqual(['make-song']);
    expect(convo.onUserText(state, 'yes').commands).toEqual(['make-song']);
    expect(convo.onUserText(state, 'make my song').commands).toEqual(['make-song']);
  });

  it('no other step or answer can start generation', () => {
    const all: Command[] = [];
    let state = start();
    for (const text of ['Asha', 'yes', 'use it', 'Hindi', 'skip', 'ready', 'make my song']) {
      all.push(...convo.onUserText(state, text).commands.filter((c) => c === 'make-song'));
      state = run(state, convo.onUserText(state, text));
      if (state.step === 'confirm-make' || state.step === 'making') break;
    }
    // "yes" at the name question or "ready" at the review question did not make a song.
    const early = [
      convo.onUserText(start(), 'make my song'),
      convo.onUserText(withTake(start()), 'make my song'),
    ];
    for (const result of early) expect(result.commands).not.toContain('make-song');
  });

  it('the language is optional and the conversation says it changes nothing yet', () => {
    const state = reachConfirm();
    const note = state.messages.find((m) => m.text === script.LANGUAGE_CHOSEN({ code: 'en-IN', nativeName: 'English', englishName: 'English' }));
    expect(note).toBeDefined();
    for (const text of [script.LANGUAGE_QUESTION, script.LANGUAGE_CHOSEN({ code: 'en-IN', nativeName: 'English', englishName: 'English' })]) {
      expect(text).toMatch(/doesn't change your song yet/i);
    }
    expect(script.LANGUAGE_QUESTION).toMatch(/optional/i);
    expect(Object.values(script).join(' ')).not.toMatch(/sung in your language|in your language/i);
  });

  it('shows generation in the transcript, then the finished song with its demo note', () => {
    let state = reachConfirm();
    state = run(state, convo.onChip(state, chip('make')));
    expect(state.step).toBe('making');
    expect(lastAssistant(state)?.text).toBe(script.MAKING);
    state = run(state, convo.onSongReady());
    expect(state.step).toBe('song-ready');
    expect(state.messages.some((m) => m.text === script.SONG_READY)).toBe(true);
    expect(state.messages[state.messages.length - 1]).toMatchObject({ role: 'system', text: script.SONG_NOTE, speak: false });
  });

  it('a failed generation is explained and can be retried explicitly', () => {
    let state = reachConfirm();
    state = run(state, convo.onChip(state, chip('make')));
    state = run(state, convo.onSongFailed('Something went wrong while making your song.'));
    expect(state.step).toBe('confirm-make');
    expect(lastAssistant(state)?.chips[0]).toMatchObject({ id: 'make', label: 'Try again' });
  });

  it('typing while the song is being made does not change anything', () => {
    let state = reachConfirm();
    state = run(state, convo.onChip(state, chip('make')));
    const result = convo.onUserText(state, 'hello');
    expect(result.commands).toEqual([]);
    expect(run(state, result).step).toBe('making');
  });
});

describe('the orb tap (the only microphone control)', () => {
  const base: OrbTapContext = {
    speaking: false,
    recorderPhase: 'idle',
    step: 'ask-name',
    consentAllowed: true,
    hasTake: false,
    songReady: false,
    generating: false,
  };
  const tap = (over: Partial<OrbTapContext>) => convo.orbTapCommand({ ...base, ...over });

  it('starts listening at the name question when consent allows it', () => {
    expect(tap({})).toBe('start-recording');
  });

  it('asks for consent first instead of recording when consent is missing', () => {
    expect(tap({ consentAllowed: false })).toBe('request-consent');
  });

  it('interrupts the assistant instead of recording while it is speaking', () => {
    expect(tap({ speaking: true })).toBe('stop-speech');
  });

  it('stops the take while recording', () => {
    expect(tap({ recorderPhase: 'recording' })).toBe('stop-recording');
  });

  it('does nothing while the microphone is starting or the take is being checked', () => {
    expect(tap({ recorderPhase: 'requesting-permission' })).toBeNull();
    expect(tap({ recorderPhase: 'stopping' })).toBeNull();
  });

  it('plays or pauses the take while reviewing it', () => {
    expect(tap({ step: 'review-take', hasTake: true, recorderPhase: 'recorded' })).toBe('toggle-take-playback');
  });

  it('plays or pauses the finished song', () => {
    expect(tap({ step: 'song-ready', songReady: true, hasTake: true })).toBe('toggle-song-playback');
  });

  it('does nothing while the song is being made', () => {
    expect(tap({ step: 'making', generating: true })).toBeNull();
  });

  it('repeats the question at the other steps; it never starts the microphone there', () => {
    for (const step of ['ask-language', 'confirm-make'] as const) expect(tap({ step })).toBe('repeat-question');
  });

  it('only ever starts recording at the name step', () => {
    for (const step of ['intro', 'review-take', 'ask-language', 'confirm-make', 'making', 'song-ready'] as const) {
      expect(tap({ step })).not.toBe('start-recording');
    }
  });
});

describe('consent in the conversation', () => {
  it('asks for consent in the transcript with the same short summary, and does not record', () => {
    const result = convo.onConsentNeeded();
    const state = run(start(), result);
    expect(lastAssistant(state)?.text).toBe(script.CONSENT_REQUEST);
    expect(lastAssistant(state)?.chips.map((c) => c.id)).toEqual(['consent-agree', 'consent-details', 'consent-decline']);
    expect(result.commands).toEqual([]);
  });

  it('"More details" expands in place and "I agree" is a separate explicit reply', () => {
    let state = run(start(), convo.onConsentNeeded());
    state = run(state, convo.onChip(state, chip('consent-details')));
    expect(lastAssistant(state)?.text).toBe(script.CONSENT_DETAILS_TEXT);
    expect(lastAssistant(state)?.speak).toBe(false); // the long text is shown, not read aloud
    expect(lastAssistant(state)?.chips.map((c) => c.id)).toEqual(['consent-agree', 'consent-decline']);
    expect(convo.onChip(state, chip('consent-agree')).commands).toEqual(['accept-consent']);
    expect(convo.onChip(state, chip('consent-decline')).commands).toEqual(['decline-consent']);
  });

  it('agreeing does not start recording: the user still taps the orb', () => {
    const result = convo.onConsentAccepted(true);
    expect(result.commands).toEqual([]);
    expect(run(start(), result).messages.pop()?.text).toBe(script.CONSENT_THANKS);
  });

  it('tells the user when the choice could not be saved', () => {
    const text = run(start(), convo.onConsentAccepted(false)).messages.pop()?.text ?? '';
    expect(text).toMatch(/couldn't save your choice/i);
  });

  it('withdrawal is announced in the transcript without a deletion command', () => {
    const result = convo.onConsentWithdrawn();
    expect(result.commands).toEqual([]);
    expect(run(start(), result).messages.pop()?.text).toBe(script.CONSENT_OFF_NOTE);
  });
});

describe('microphone permission in the conversation', () => {
  it('a retryable denial offers Try again and Open settings', () => {
    const state = run(start(), convo.onMicrophoneProblem('denied'));
    expect(lastAssistant(state)?.chips.map((c) => c.id)).toEqual(['retry-mic', 'open-settings']);
    expect(convo.onChip(state, chip('retry-mic')).commands).toEqual(['start-recording']);
  });

  it('a permanent denial offers only Settings, with the steps', () => {
    const state = run(start(), convo.onMicrophoneProblem('blocked'));
    expect(lastAssistant(state)?.chips.map((c) => c.id)).toEqual(['open-settings']);
    expect(lastAssistant(state)?.text).toMatch(/Permissions.*Microphone.*Allow/i);
    expect(convo.onChip(state, chip('open-settings')).commands).toEqual(['open-settings']);
  });

  it('recovery tells the user to tap the orb, and does not record by itself', () => {
    const result = convo.onMicrophoneRecovered();
    expect(result.commands).toEqual([]);
    expect(run(start(), result).messages.pop()?.text).toBe(script.MIC_RECOVERED);
  });

  it('only the retry reply starts the microphone from a chip', () => {
    for (const id of ['take-play', 'take-use', 'take-again', 'language-skip', 'make', 'song-again', 'open-settings'] as const) {
      expect(convo.onChip(start(), chip(id)).commands).not.toContain('start-recording');
    }
  });
});

describe('the reducer', () => {
  it('numbers messages and never mutates the previous state', () => {
    const a = start();
    const b = conversationReducer(a, { type: 'ADD', role: 'user', text: 'hi' });
    expect(a.messages).toHaveLength(1);
    expect(b.messages.map((m) => m.id)).toEqual(['m1', 'm2']);
  });

  it('replaces the last message in place', () => {
    const state = conversationReducer(start(), { type: 'REPLACE_LAST', text: 'x', chips: [] } as Action);
    expect(state.messages[0]).toMatchObject({ text: 'x', speak: false });
  });

  it('ignores typing before the conversation has started', () => {
    expect(convo.onUserText(initialConversation, 'Asha')).toEqual({ actions: [], commands: [] });
  });

  it('keeps every assistant message short and speakable', () => {
    for (const [key, value] of Object.entries(script)) {
      if (typeof value === 'string' && key !== 'CONSENT_DETAILS_TEXT') {
        expect(value.length).toBeLessThan(260);
      }
    }
  });
});

describe('what the screen does with the conversation', () => {
  const hook = read('src/conversation/useConversation.ts');
  const screen = read('src/components/ConversationScreen.tsx');

  it('has exactly one conversation instance, shared by voice and text', () => {
    expect(screen.match(/useConversation\(/g)).toHaveLength(1);
    expect(hook.match(/useReducer|useState<ConversationState>/g)).toHaveLength(1);
  });

  it('typing, chips and the orb all call the same hook functions', () => {
    expect(screen).toContain('onSend={conv.submitText}');
    expect(screen).toContain('onChip={conv.pressChip}');
    expect(screen).toContain('conv.tapOrb');
  });

  it('the transcript and composer are not inside the voice-mode branch, so closing voice keeps them', () => {
    const voiceBranchStart = screen.indexOf('{voiceMode ? (');
    const voiceBranchEnd = screen.indexOf('<Animated.View style={[styles.chat');
    const branch = screen.slice(voiceBranchStart, voiceBranchEnd);
    expect(branch).not.toMatch(/<Transcript|<Composer/);
    expect(screen.match(/<Transcript/g)).toHaveLength(1);
    expect(screen.match(/<Composer/g)).toHaveLength(1);
  });

  it('closing voice mode stops a take in progress instead of losing it, and does not reset the conversation', () => {
    expect(screen).toContain("if (voiceMode && conv.recorder.phase === 'recording') void conv.recorder.stopRecording();");
    expect(screen).not.toMatch(/recorder\.reset|RESET_ANSWERS/);
  });

  it('the first question is asked once, after the opening hands over', () => {
    expect(screen).toContain('if (started) conv.begin();');
    expect(hook).toContain("if (stateRef.current.step === 'intro') apply(conversation.begin());");
  });

  it('speaks exactly the text shown, in order, once, only in voice mode and never while the microphone is open', () => {
    expect(hook).toContain('speech.speak(message.text);');
    expect(hook).toMatch(/message\.role === 'assistant' && message\.speak && voiceMode && !recorderBusy && appActive/);
    expect(hook).toContain('spokenUpTo.current = messages.length;');
    expect(hook).toMatch(/if \(recorderBusy\) speech\.stop\(\);/);
  });

  it('turning voice back on continues from the current question', () => {
    expect(hook).toContain('if (voiceMode && !previousVoice.current && stateRef.current.step !== \'intro\')');
    expect(hook).toContain('speakLastQuestion();');
  });

  it('stops the assistant before any recording or playback', () => {
    for (const command of ["case 'start-recording'", "case 'toggle-take-playback'", "case 'toggle-song-playback'"]) {
      const at = hook.indexOf(command);
      expect(hook.slice(at, at + 420)).toContain('now.speech.stop();');
    }
  });

  it('shows a fallback message and stays text only if speech is unavailable', () => {
    expect(hook).toContain('speech.unavailable()');
    expect(hook).toContain('conversation.onSpeechUnavailable()');
  });

  it('keeps the recorder controller as the only way to record', () => {
    expect(hook).toContain('now.recorder.startRecording()');
    expect(hook).not.toMatch(/requestRecordingPermissions|useAudioStream|AudioRecorder/);
    expect(hook).toContain('if (!now.allowed) {');
  });

  it('generation is only ever triggered by the make-song command', () => {
    expect(hook.match(/generator\.generate\(/g)).toHaveLength(1);
    expect(hook.slice(hook.indexOf("case 'make-song'"), hook.indexOf("case 'stop-speech'"))).toContain('generator.generate(');
  });

  it('never starts the microphone from an effect', () => {
    // Each effect callback ends at the "}, [" that opens its dependency list.
    const effects = hook.split('useEffect(').slice(1).map((chunk) => chunk.slice(0, chunk.indexOf('}, [')));
    expect(effects.length).toBeGreaterThan(5);
    for (const body of effects) expect(body).not.toContain('startRecording(');
  });
});
