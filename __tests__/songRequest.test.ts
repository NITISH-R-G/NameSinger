import { readFileSync } from 'fs';
import { join } from 'path';

import {
  buildAbc,
  buildLyrics,
  buildSongRequest,
  countSyllables,
  normaliseName,
  serialiseRequest,
} from '../src/song/songRequest';

const golden = (n: number) => readFileSync(join(__dirname, 'fixtures', 'abc', `n${n}.abc`), 'utf8');

describe('ABC score (port of the validated experiment builder)', () => {
  it.each([1, 2, 3, 4, 5, 6])('matches the reference output for %i name notes', (n) => {
    expect(buildAbc(n)).toBe(golden(n));
  });

  it.each([1, 2, 3, 4, 5, 6])('keeps every vocal bar at exactly 16 thirty-seconds (%i name notes)', (n) => {
    const abc = buildAbc(n);
    const bars = abc
      .split('\n')
      .filter((l) => l.includes('|') && !l.startsWith('V:') && !l.startsWith('Z'))
      .join('')
      .split('|')
      .filter(Boolean);
    expect(bars.length).toBeGreaterThan(8);
    for (const bar of bars) {
      const units = [...bar.replace(/"[^"]*"/g, '').matchAll(/[a-gz]'?(\d+)-?/g)].reduce((s, m) => s + Number(m[1]), 0);
      expect(units).toBe(16);
    }
  });

  it('gives the name slot more, shorter notes for longer names', () => {
    expect(buildAbc(4)).not.toBe(buildAbc(2));
  });
});

describe('syllable estimate and lyrics', () => {
  it.each([
    ['Sam', 1],
    ['Emma', 2],
    ['Isabella', 4],
    ['Nitish', 2],
    ['Muhammad', 3],
    ['Kai', 1],
    ['Siobhan', 2],
  ])('%s -> %i', (name, n) => {
    expect(countSyllables(name)).toBe(n);
  });

  it('never returns fewer than one or more than six', () => {
    expect(countSyllables('xyz')).toBe(1);
    expect(countSyllables('aeiouaeiouaeiouaeiou')).toBeLessThanOrEqual(6);
  });

  it('puts the typed name, untouched, in the sung line', () => {
    expect(buildLyrics('Aarav')).toBe(
      '[Verse]\nHappy birthday to you\nHappy birthday dear Aarav\nHappy birthday to you',
    );
  });
});

describe('request building', () => {
  it('passes the name dynamically: different names give different lyrics and scores', () => {
    const a = buildSongRequest({ name: 'Sam', style: 'pop' });
    const b = buildSongRequest({ name: 'Isabella', style: 'pop' });
    expect(a.lyrics).toContain('dear Sam');
    expect(b.lyrics).toContain('dear Isabella');
    expect(a.abc).not.toBe(b.abc);
  });

  it('rejects an empty or symbol-only name', () => {
    expect(() => buildSongRequest({ name: '   ', style: 'pop' })).toThrow();
    expect(() => buildSongRequest({ name: '123!!', style: 'pop' })).toThrow();
  });

  it('cleans odd input and keeps accents, hyphens and apostrophes', () => {
    expect(normaliseName('  Zoë   O\'Neil-Smith <b> ')).toBe("Zoë O'Neil-Smith b");
    expect(normaliseName('a'.repeat(60)).length).toBe(24);
  });

  it('serialises 64-bit seeds exactly', () => {
    const json = serialiseRequest(buildSongRequest({ name: 'Kai', style: 'pop' }));
    expect(json).toContain('"lm_seed":4420344455356672063');
    expect(json).toContain('"seed":7773520133666643031');
    expect(JSON.parse(json.replace(/(\d{16,})/g, '"$1"')).steps).toBe(4);
  });
});
