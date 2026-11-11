import { getLanguage, LANGUAGES } from '../src/constants/languages';

describe('language configuration', () => {
  it('has unique BCP-47 codes', () => {
    const codes = LANGUAGES.map((language) => language.code);
    expect(new Set(codes).size).toBe(codes.length);
    for (const code of codes) expect(code).toMatch(/^[a-z]{2}-IN$/);
  });

  it('gives every language a native and an English name', () => {
    for (const language of LANGUAGES) {
      expect(language.nativeName.trim()).not.toBe('');
      expect(language.englishName.trim()).not.toBe('');
    }
  });

  it('shows non-English languages in their own script', () => {
    for (const language of LANGUAGES.filter((l) => l.code !== 'en-IN')) {
      expect(language.nativeName).not.toBe(language.englishName);
      expect(language.nativeName).toMatch(/[^\u0000-\u007F]/);
    }
  });

  it('includes the major Indian languages', () => {
    const english = LANGUAGES.map((language) => language.englishName);
    for (const name of ['Hindi', 'Tamil', 'Telugu', 'Bengali', 'Kannada', 'Malayalam', 'Marathi', 'Gujarati', 'Punjabi']) {
      expect(english).toContain(name);
    }
  });

  it('looks languages up by code', () => {
    expect(getLanguage('ta-IN')?.englishName).toBe('Tamil');
  });
});
