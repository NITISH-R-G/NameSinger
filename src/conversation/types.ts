import type { LanguageCode, RecorderPhase } from '../types';

/**
 * The conversation is one sequence of questions. Voice, typing and the reply buttons are three ways
 * of giving the same answer to the same step; there is no separate voice or text conversation.
 */
export type Step =
  | 'intro' // before the first question
  | 'ask-name' // waiting for the name: a spoken take (needed for the song) or typed text
  | 'review-take' // a take exists; waiting for "use it" or "record again"
  | 'ask-language' // optional preference
  | 'confirm-make' // everything collected; waiting for the explicit go-ahead
  | 'making' // the song is being generated
  | 'song-ready';

export type ChipId =
  | 'consent-agree'
  | 'consent-details'
  | 'consent-decline'
  | 'take-play'
  | 'take-use'
  | 'take-again'
  | 'language-skip'
  | `language:${string}`
  | 'make'
  | 'song-again'
  | 'song-new-name'
  | 'retry-mic'
  | 'open-settings';

/** A tappable reply shown under the latest assistant message. Same effect as typing the answer. */
export interface Chip {
  id: ChipId;
  label: string;
}

export interface ChatMessage {
  id: string;
  role: 'assistant' | 'user' | 'system';
  text: string;
  /** A spoken take shown in the transcript as a labelled entry instead of text. */
  kind: 'text' | 'voice-take';
  chips: Chip[];
  /** Whether voice mode speaks this message aloud. Text and voice show and say the same text. */
  speak: boolean;
}

export interface ConversationState {
  step: Step;
  messages: ChatMessage[];
  /** The name as typed, when the user typed it. The song still needs the spoken take. */
  displayName: string | null;
  language: LanguageCode | null;
  languageAnswered: boolean;
  nextId: number;
}

export type Action =
  | { type: 'ADD'; role: ChatMessage['role']; text: string; chips?: Chip[]; speak?: boolean; kind?: ChatMessage['kind'] }
  | { type: 'REPLACE_LAST'; text: string; chips: Chip[] }
  | { type: 'SET_STEP'; step: Step }
  | { type: 'SET_NAME'; name: string | null }
  | { type: 'SET_LANGUAGE'; code: LanguageCode | null }
  | { type: 'RESET_ANSWERS' };

/** Things the conversation asks the rest of the app to do. Executed by the conversation hook. */
export type Command =
  | 'start-recording'
  | 'stop-recording'
  | 'approve-recording'
  | 'discard-recording'
  | 'toggle-take-playback'
  | 'toggle-song-playback'
  | 'make-song'
  | 'stop-speech'
  | 'repeat-question'
  | 'request-consent'
  | 'accept-consent'
  | 'decline-consent'
  | 'open-settings';

export interface Result {
  actions: Action[];
  commands: Command[];
}

export interface OrbTapContext {
  speaking: boolean;
  recorderPhase: RecorderPhase;
  step: Step;
  consentAllowed: boolean;
  /** A take exists (recorded or approved). */
  hasTake: boolean;
  songReady: boolean;
  generating: boolean;
}
