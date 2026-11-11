import {
  CONSENT_DETAILS_HIDE_LABEL,
  CONSENT_POINTS,
  CONSENT_SAVE_FAILED_MESSAGE,
  CONSENT_SUMMARY,
} from '../constants/consent';
import { LANGUAGES } from '../constants/languages';
import { SONG_DEMO_NOTE } from '../constants/onboardingCopy';
import type { Language } from '../types';
import type { Chip } from './types';

/**
 * Every word the assistant says lives here, once. The transcript shows these exact strings and
 * voice mode speaks these exact strings. Accuracy rules: say only what the app does today.
 * Language does not change the song yet; a typed name cannot become audio, so the song always needs
 * the spoken take; there is no speech recognition, so spoken answers exist only for the name.
 */
export const FIRST_QUESTION =
  "Hi, I'm NameSinger. What's your name? Tap the orb and say it, or type it below.";

export const NEEDS_VOICE = (name: string) =>
  `Nice to meet you, ${name}. Songs use your own voice, so tap the orb and say your name once. I can't turn typed letters into your voice.`;

export const NAME_INVALID = 'I need a name with at least one letter, up to 40 characters. What should I call you?';

export const REVIEW = (name: string | null, quiet: boolean) =>
  `${name ? `Got it, ${name}. ` : 'Got it. '}Take a listen. Shall I use this recording, or record it again?${
    quiet ? ' It was quiet, so a closer recording would sound better.' : ''
  }`;

export const NAME_UPDATED = (name: string) =>
  `Okay, I'll call you ${name}. Shall I use the recording, or record it again?`;

export const REVIEW_RETRY = 'Say "use it" to keep the recording, or "again" to record it again.';

export const AGAIN = 'Okay. Tap the orb and say your name again.';

export const LANGUAGE_QUESTION =
  "Which language would you like? It's optional, and it doesn't change your song yet. Every song uses the same demo track for now.";

export const LANGUAGE_CHOSEN = (language: Language) =>
  `${language.englishName}, noted. Remember, it doesn't change your song yet.`;

export const LANGUAGE_SKIPPED = 'No problem, we can skip that.';

export const LANGUAGE_RETRY = "I didn't catch a language. Pick one below, or say \"skip\".";

export const CONFIRM_QUESTION = 'Ready? I will make your song now.';

export const CONFIRM_RETRY = 'Say "yes" to make your song, or "again" to record your name again.';

export const MAKING = 'Making your song on this phone…';

export const STILL_MAKING = "I'm still making your song. It will only take a moment.";

export const SONG_READY = 'Your song is ready. Tap the orb to play it, tap again to pause.';

export const SONG_NOTE = SONG_DEMO_NOTE;

export const SONG_NEXT = 'Tap the orb to play your song, or pick an option below.';

export const SONG_FAILED_PREFIX = '';

export const CONSENT_REQUEST = `${CONSENT_SUMMARY}`;
export const CONSENT_DETAILS_TEXT = `${CONSENT_SUMMARY}\n\n${CONSENT_POINTS.map((point) => `• ${point}`).join('\n')}`;
export const CONSENT_SAVE_FAILED = CONSENT_SAVE_FAILED_MESSAGE;
export const CONSENT_THANKS = "Thanks. Tap the orb and say your name when you're ready.";
export const CONSENT_DECLINED_REPLY =
  "No problem. You can type your name, but I need your voice to make the song. Tap the orb whenever you change your mind.";
export const CONSENT_OFF_NOTE =
  'Recording is off. Tap the orb to agree again, or type your name to keep chatting.';

export const MIC_DENIED =
  "The microphone isn't allowed yet. Try again and choose Allow when your phone asks.";
export const MIC_BLOCKED =
  "The microphone is blocked. Your phone won't ask again: open Settings, choose Permissions, then Microphone, and select Allow.";
export const MIC_RECOVERED = 'The microphone is on. Tap the orb and say your name.';
export const MIC_ERROR = 'That did not work. Try again?';

export const RECORDING_DELETED =
  'Your recording was deleted. Tap the orb and say your name when you want to start again.';

export const UNUSABLE_SUFFIX = ' Tap the orb to try again.';

export const SPEECH_UNAVAILABLE = "Speech isn't available on this phone, so I'll keep to text.";

export const TYPED_COMMAND_HINT = "Type your name, or tap the orb to say it.";

export const CONSENT_CHIPS: Chip[] = [
  { id: 'consent-agree', label: 'I agree' },
  { id: 'consent-details', label: 'More details' },
  { id: 'consent-decline', label: 'No thanks' },
];

export const CONSENT_DETAIL_CHIPS: Chip[] = [
  { id: 'consent-agree', label: 'I agree' },
  { id: 'consent-decline', label: 'No thanks' },
];

export const REVIEW_CHIPS: Chip[] = [
  { id: 'take-play', label: 'Play it back' },
  { id: 'take-use', label: 'Use this recording' },
  { id: 'take-again', label: 'Record again' },
];

export const LANGUAGE_CHIPS: Chip[] = [
  ...LANGUAGES.map((language): Chip => ({ id: `language:${language.code}`, label: language.englishName })),
  { id: 'language-skip', label: 'Skip' },
];

export const CONFIRM_CHIPS: Chip[] = [
  { id: 'make', label: 'Make my song' },
  { id: 'take-again', label: 'Record again' },
];

export const SONG_CHIPS: Chip[] = [
  { id: 'song-again', label: 'Make it again' },
  { id: 'song-new-name', label: 'Use another name' },
];

export const MIC_DENIED_CHIPS: Chip[] = [
  { id: 'retry-mic', label: 'Try again' },
  { id: 'open-settings', label: 'Open settings' },
];
export const MIC_BLOCKED_CHIPS: Chip[] = [{ id: 'open-settings', label: 'Open settings' }];
export const MIC_ERROR_CHIPS: Chip[] = [{ id: 'retry-mic', label: 'Try again' }];

export { CONSENT_DETAILS_HIDE_LABEL };
