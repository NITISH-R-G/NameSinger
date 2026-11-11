import type { Language, LanguageCode } from '../types';

export const LANGUAGES: readonly Language[] = [
  { code: 'hi-IN', nativeName: 'हिन्दी', englishName: 'Hindi' },
  { code: 'bn-IN', nativeName: 'বাংলা', englishName: 'Bengali' },
  { code: 'ta-IN', nativeName: 'தமிழ்', englishName: 'Tamil' },
  { code: 'te-IN', nativeName: 'తెలుగు', englishName: 'Telugu' },
  { code: 'kn-IN', nativeName: 'ಕನ್ನಡ', englishName: 'Kannada' },
  { code: 'ml-IN', nativeName: 'മലയാളം', englishName: 'Malayalam' },
  { code: 'mr-IN', nativeName: 'मराठी', englishName: 'Marathi' },
  { code: 'gu-IN', nativeName: 'ગુજરાતી', englishName: 'Gujarati' },
  { code: 'pa-IN', nativeName: 'ਪੰਜਾਬੀ', englishName: 'Punjabi' },
  { code: 'en-IN', nativeName: 'English', englishName: 'English' },
];

/**
 * Used when the user does not choose a language. The choice is optional and does not change the
 * song yet (every language uses the same template), so this default has no audible effect.
 */
export const DEFAULT_LANGUAGE_CODE: LanguageCode = 'en-IN';

export function getLanguage(code: LanguageCode): Language | undefined {
  return LANGUAGES.find((language) => language.code === code);
}
