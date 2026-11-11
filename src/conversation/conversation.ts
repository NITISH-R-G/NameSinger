import { getLanguage } from '../constants/languages';
import { formatDuration } from '../hooks/recorderState';
import type { LanguageCode } from '../types';
import { classifyReply, matchLanguage, parseName } from './answers';
import * as script from './script';
import type { Action, ChatMessage, Chip, Command, ConversationState, OrbTapContext, Result } from './types';

export const initialConversation: ConversationState = {
  step: 'intro',
  messages: [],
  displayName: null,
  language: null,
  languageAnswered: false,
  nextId: 1,
};

/** The single reducer for the conversation. It only records what happened; decisions live below. */
export function conversationReducer(state: ConversationState, action: Action): ConversationState {
  switch (action.type) {
    case 'ADD': {
      const message: ChatMessage = {
        id: `m${state.nextId}`,
        role: action.role,
        text: action.text,
        kind: action.kind ?? 'text',
        chips: action.chips ?? [],
        speak: action.speak ?? action.role === 'assistant',
      };
      return { ...state, messages: [...state.messages, message], nextId: state.nextId + 1 };
    }
    case 'REPLACE_LAST': {
      const messages = [...state.messages];
      const last = messages[messages.length - 1];
      if (!last) return state;
      messages[messages.length - 1] = { ...last, text: action.text, chips: action.chips, speak: false };
      return { ...state, messages };
    }
    case 'SET_STEP':
      return state.step === action.step ? state : { ...state, step: action.step };
    case 'SET_NAME':
      return { ...state, displayName: action.name };
    case 'SET_LANGUAGE':
      return { ...state, language: action.code, languageAnswered: true };
    case 'RESET_ANSWERS':
      return { ...state, step: 'ask-name', displayName: null, language: null, languageAnswered: false };
    default:
      return state;
  }
}

const assistant = (text: string, chips: Chip[] = [], speak = true): Action => ({
  type: 'ADD',
  role: 'assistant',
  text,
  chips,
  speak,
});
const user = (text: string, kind: ChatMessage['kind'] = 'text'): Action => ({ type: 'ADD', role: 'user', text, kind });
const result = (actions: Action[], commands: Command[] = []): Result => ({ actions, commands });

/** Opening the conversation: the first question, and nothing else. */
export function begin(): Result {
  return result([{ type: 'SET_STEP', step: 'ask-name' }, assistant(script.FIRST_QUESTION)]);
}

// ---------------------------------------------------------------------------------------------
// Shared answers. Typing "yes", tapping "Use this recording" and (for the name) speaking all end
// up in these functions, so there is exactly one implementation of each transition.
// ---------------------------------------------------------------------------------------------

function useTake(): Result {
  return result(
    [
      user('Use this recording'),
      { type: 'SET_STEP', step: 'ask-language' },
      assistant(script.LANGUAGE_QUESTION, script.LANGUAGE_CHIPS),
    ],
    ['approve-recording'],
  );
}

function recordAgain(): Result {
  return result(
    [user('Record again'), { type: 'SET_STEP', step: 'ask-name' }, assistant(script.AGAIN)],
    ['discard-recording'],
  );
}

function chooseLanguage(code: LanguageCode | null): Result {
  const language = code === null ? undefined : getLanguage(code);
  return result([
    user(language ? language.englishName : 'Skip'),
    { type: 'SET_LANGUAGE', code: language ? language.code : null },
    assistant(language ? script.LANGUAGE_CHOSEN(language) : script.LANGUAGE_SKIPPED, [], true),
    { type: 'SET_STEP', step: 'confirm-make' },
    assistant(script.CONFIRM_QUESTION, script.CONFIRM_CHIPS),
  ]);
}

function makeSong(label: string): Result {
  return result(
    [user(label), { type: 'SET_STEP', step: 'making' }, assistant(script.MAKING)],
    ['make-song'],
  );
}

function newName(): Result {
  return result(
    [user('Use another name'), { type: 'RESET_ANSWERS' }, assistant(script.FIRST_QUESTION)],
    ['discard-recording'],
  );
}

// ---------------------------------------------------------------------------------------------
// Typed answers.
// ---------------------------------------------------------------------------------------------

export function onUserText(state: ConversationState, input: string): Result {
  const text = input.replace(/\s+/g, ' ').trim();
  if (text.length === 0 || state.step === 'intro') return result([]);

  switch (state.step) {
    case 'ask-name': {
      const parsed = parseName(text);
      if (!parsed.ok) return result([user(text), assistant(script.NAME_INVALID)]);
      return result([
        user(text),
        { type: 'SET_NAME', name: parsed.name },
        assistant(script.NEEDS_VOICE(parsed.name)),
      ]);
    }
    case 'review-take': {
      const intent = classifyReply(text, 'confirm');
      if (intent === 'yes') return useTake();
      if (intent === 'again') return recordAgain();
      const parsed = parseName(text);
      if (parsed.ok) {
        return result([
          user(text),
          { type: 'SET_NAME', name: parsed.name },
          assistant(script.NAME_UPDATED(parsed.name), script.REVIEW_CHIPS),
        ]);
      }
      return result([user(text), assistant(script.REVIEW_RETRY, script.REVIEW_CHIPS)]);
    }
    case 'ask-language': {
      if (classifyReply(text, 'skip') === 'skip') return chooseLanguage(null);
      const language = matchLanguage(text);
      if (language) return chooseLanguage(language.code);
      return result([user(text), assistant(script.LANGUAGE_RETRY, script.LANGUAGE_CHIPS)]);
    }
    case 'confirm-make': {
      const intent = classifyReply(text, 'confirm');
      if (intent === 'yes') return makeSong(text);
      if (intent === 'again') return recordAgain();
      return result([user(text), assistant(script.CONFIRM_RETRY, script.CONFIRM_CHIPS)]);
    }
    case 'making':
      return result([user(text), assistant(script.STILL_MAKING)]);
    case 'song-ready':
      return result([user(text), assistant(script.SONG_NEXT, script.SONG_CHIPS)]);
    default:
      return result([]);
  }
}

// ---------------------------------------------------------------------------------------------
// Reply buttons.
// ---------------------------------------------------------------------------------------------

export function onChip(state: ConversationState, chip: Chip): Result {
  switch (chip.id) {
    case 'consent-agree':
      return result([user('I agree')], ['accept-consent']);
    case 'consent-decline':
      return result([user('No thanks'), assistant(script.CONSENT_DECLINED_REPLY)], ['decline-consent']);
    case 'consent-details':
      return result([{ type: 'REPLACE_LAST', text: script.CONSENT_DETAILS_TEXT, chips: script.CONSENT_DETAIL_CHIPS }]);
    case 'take-play':
      return result([], ['toggle-take-playback']);
    case 'take-use':
      return useTake();
    case 'take-again':
      return recordAgain();
    case 'language-skip':
      return chooseLanguage(null);
    case 'make':
      return makeSong('Make my song');
    case 'song-again':
      return makeSong('Make it again');
    case 'song-new-name':
      return newName();
    case 'retry-mic':
      return result([user('Try again')], ['start-recording']);
    case 'open-settings':
      return result([], ['open-settings']);
    default:
      if (chip.id.startsWith('language:')) return chooseLanguage(chip.id.slice('language:'.length) as LanguageCode);
      return result([]);
  }
}

// ---------------------------------------------------------------------------------------------
// Things that happen to the recorder, the song generator and consent.
// ---------------------------------------------------------------------------------------------

export function onConsentNeeded(): Result {
  return result([assistant(script.CONSENT_REQUEST, script.CONSENT_CHIPS)]);
}

export function onConsentAccepted(saved = true): Result {
  // If the choice could not be stored the user is told; the session still proceeds because they did agree.
  return result([assistant(saved ? script.CONSENT_THANKS : `${script.CONSENT_SAVE_FAILED} ${script.CONSENT_THANKS}`)]);
}

export function onConsentWithdrawn(): Result {
  return result([assistant(script.CONSENT_OFF_NOTE, [], false)]);
}

export function onTakeRecorded(state: ConversationState, take: { durationMs: number; quiet: boolean }): Result {
  return result([
    user(`Voice recording · ${formatDuration(take.durationMs)}`, 'voice-take'),
    { type: 'SET_STEP', step: 'review-take' },
    assistant(script.REVIEW(state.displayName, take.quiet), script.REVIEW_CHIPS),
  ]);
}

export function onTakeUnusable(message: string): Result {
  return result([assistant(`${message}${script.UNUSABLE_SUFFIX}`)]);
}

export function onMicrophoneProblem(kind: 'denied' | 'blocked' | 'error', message?: string | null): Result {
  if (kind === 'denied') return result([assistant(script.MIC_DENIED, script.MIC_DENIED_CHIPS)]);
  if (kind === 'blocked') return result([assistant(script.MIC_BLOCKED, script.MIC_BLOCKED_CHIPS)]);
  return result([assistant(message ? `${message} ${script.MIC_ERROR}` : script.MIC_ERROR, script.MIC_ERROR_CHIPS)]);
}

export function onMicrophoneRecovered(): Result {
  return result([assistant(script.MIC_RECOVERED)]);
}

export function onSongReady(): Result {
  return result([
    { type: 'SET_STEP', step: 'song-ready' },
    assistant(script.SONG_READY, script.SONG_CHIPS),
    { type: 'ADD', role: 'system', text: script.SONG_NOTE, speak: false },
  ]);
}

export function onSongFailed(message: string): Result {
  return result([
    { type: 'SET_STEP', step: 'confirm-make' },
    assistant(message, [{ id: 'make', label: 'Try again' }, ...script.CONFIRM_CHIPS.slice(1)]),
  ]);
}

export function onRecordingDeleted(): Result {
  return result([
    { type: 'SET_STEP', step: 'ask-name' },
    assistant(script.RECORDING_DELETED),
  ]);
}

export function onSpeechUnavailable(): Result {
  return result([{ type: 'ADD', role: 'system', text: script.SPEECH_UNAVAILABLE, speak: false }]);
}

// ---------------------------------------------------------------------------------------------
// The orb is the interaction surface. This decides, in one place, what a tap on it means.
// ---------------------------------------------------------------------------------------------

/**
 * Predictable rules, in order:
 *  1. while the assistant is speaking, a tap interrupts it (and does nothing else);
 *  2. while recording, a tap stops the take;
 *  3. while the microphone is starting or the take is being checked, nothing;
 *  4. with a finished song, a tap plays or pauses it;
 *  5. while reviewing a take, a tap plays or pauses the take;
 *  6. while a song is being made, nothing;
 *  7. when the conversation is waiting for the name, a tap starts listening, or asks for consent first;
 *  8. otherwise a tap repeats the current question.
 * Starting the microphone is only ever the result of this tap or a "Try again" reply, never automatic.
 */
export function orbTapCommand(context: OrbTapContext): Command | null {
  if (context.speaking) return 'stop-speech';
  if (context.recorderPhase === 'recording') return 'stop-recording';
  if (context.recorderPhase === 'requesting-permission' || context.recorderPhase === 'stopping') return null;
  if (context.songReady) return 'toggle-song-playback';
  if (context.step === 'review-take' && context.hasTake) return 'toggle-take-playback';
  if (context.generating) return null;
  if (context.step === 'ask-name') return context.consentAllowed ? 'start-recording' : 'request-consent';
  return 'repeat-question';
}
