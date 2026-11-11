import { LANGUAGES } from '../constants/languages';
import type { Language } from '../types';

export const MAX_NAME_LENGTH = 40;

export type NameParse = { ok: true; name: string } | { ok: false };

/**
 * A typed name: trimmed, inner whitespace collapsed, 1 to 40 characters, at least one letter (any
 * script), and no control characters. Nothing is looked up or stored beyond this conversation.
 */
export function parseName(input: string): NameParse {
  const name = input.replace(/\s+/g, ' ').trim();
  if (name.length === 0 || name.length > MAX_NAME_LENGTH) return { ok: false };
  if (/[\u0000-\u001F\u007F]/.test(name)) return { ok: false };
  if (!/\p{L}/u.test(name)) return { ok: false };
  return { ok: true, name };
}

export type Intent = 'yes' | 'again' | 'skip' | 'none';

const YES =
  /^(yes|yeah|yep|yup|ok|okay|sure|use it|use this|use this recording|keep it|looks good|sounds good|good|go|go ahead|make it|make my song|make song|start|ready|do it)[.!]*$/i;
const AGAIN = /^(again|redo|re-?record|record again|record it again|try again|change it|wrong|not right|no)[.!]*$/i;
const SKIP = /^(skip|none|no preference|any|later|don'?t mind|whatever|no)[.!]*$/i;

/** What a short typed reply means. Anything else is 'none' and is treated as a possible name or language. */
export function classifyReply(input: string, expecting: 'confirm' | 'skip'): Intent {
  const text = input.replace(/\s+/g, ' ').trim();
  if (expecting === 'confirm') {
    if (YES.test(text)) return 'yes';
    if (AGAIN.test(text)) return 'again';
    return 'none';
  }
  if (SKIP.test(text)) return 'skip';
  return 'none';
}

/** Finds one of the supported languages by its English or native name. */
export function matchLanguage(input: string): Language | null {
  const text = input.trim().toLowerCase();
  if (text.length === 0) return null;
  for (const language of LANGUAGES) {
    if (language.englishName.toLowerCase() === text || language.nativeName.toLowerCase() === text) return language;
  }
  for (const language of LANGUAGES) {
    if (text.includes(language.englishName.toLowerCase()) || text.includes(language.nativeName.toLowerCase())) {
      return language;
    }
  }
  return null;
}
