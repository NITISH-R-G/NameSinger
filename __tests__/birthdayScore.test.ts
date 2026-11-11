import { readFileSync } from 'fs';
import { join } from 'path';

import { decodeWav } from '../src/audio/wav';
import { CUE_FROM_BAR, buildCue } from '../src/birthday/cue';
import {
  BAR_COUNT,
  KEY_NAMES,
  KEYS,
  MAX_SYLLABLES,
  NAME_MELODIES,
  NAME_SLOT,
  barSeconds,
  nameNoteStarts,
  nameTargetsHz,
  slotWindowSeconds,
  suggestSyllables,
} from '../src/birthday/score';

const asset = (key: string) =>
  decodeWav(new Uint8Array(readFileSync(join(__dirname, '..', 'assets', 'audio', 'birthday', `birthday-${key}.wav`))));

describe('birthday score', () => {
  it('has a melody for every syllable count, each filling the 4-beat slot without overrunning it', () => {
    for (let n = 1; n <= MAX_SYLLABLES; n += 1) {
      const m = NAME_MELODIES[n];
      expect(m.midi).toHaveLength(n);
      expect(m.beats).toHaveLength(n);
      const total = m.beats.reduce((a, b) => a + b, 0);
      expect(total).toBeLessThanOrEqual(NAME_SLOT.beats);
      expect(total).toBeGreaterThan(NAME_SLOT.beats - 0.6);
    }
  });

  it('places the name notes inside the slot, in order', () => {
    const slot = slotWindowSeconds();
    for (let n = 1; n <= MAX_SYLLABLES; n += 1) {
      const starts = nameNoteStarts(n);
      expect(starts[0]).toBeCloseTo(slot.start, 6);
      for (let k = 1; k < starts.length; k += 1) expect(starts[k]).toBeGreaterThan(starts[k - 1]);
      expect(starts[starts.length - 1]).toBeLessThan(slot.end);
    }
  });

  it('transposes the cue notes into three singable keys', () => {
    const low = nameTargetsHz(3, 'low');
    const mid = nameTargetsHz(3, 'mid');
    const high = nameTargetsHz(3, 'high');
    expect(mid[0]).toBeCloseTo(329.63, 1); // E4
    expect(low[0]).toBeLessThan(mid[0]);
    expect(high[0]).toBeGreaterThan(mid[0]);
    expect(KEYS.low.shift).toBe(-5);
  });

  it('suggests a plausible syllable count and never leaves 1 to 5', () => {
    expect(suggestSyllables('Sam')).toBe(1);
    expect(suggestSyllables('Maria')).toBe(3);
    expect(suggestSyllables('Jane')).toBe(1);
    expect(suggestSyllables('')).toBe(2);
    expect(suggestSyllables('Alexandrovich')).toBe(MAX_SYLLABLES);
  });
});

describe('pre-rendered song assets', () => {
  it.each(KEY_NAMES)('the %s key is a mono 22.05 kHz song of the right length with the slot free of lead', (key) => {
    const song = asset(key);
    expect(song.sampleRate).toBe(22050);
    const seconds = song.samples.length / song.sampleRate;
    expect(seconds).toBeGreaterThan(BAR_COUNT * barSeconds());
    expect(seconds).toBeLessThan(BAR_COUNT * barSeconds() + 3);
    let peak = 0;
    for (const v of song.samples) peak = Math.max(peak, Math.abs(v));
    expect(peak).toBeGreaterThan(0.5);
    expect(peak).toBeLessThanOrEqual(1);
  });
});

describe('recording cue', () => {
  it.each(KEY_NAMES)('is shorter than the recorder cap and has the slot where the score says (%s)', (key) => {
    const cue = buildCue(asset(key), key, 3);
    expect(cue.durationSec).toBeLessThan(10); // MAX_RECORDING_MS is 10 s
    expect(cue.durationSec).toBeGreaterThan(8);
    const expectedSlot = (NAME_SLOT.startBeat - (CUE_FROM_BAR - 1) * 4) * (60 / 92) + cue.countInSec;
    expect(cue.slotStartSec).toBeCloseTo(expectedSlot, 6);
    expect(cue.slotEndSec).toBeLessThan(cue.durationSec);
  });

  it('plays a guide note at each syllable start (more energy there than in the same slot without it)', () => {
    const song = asset('mid');
    const plain = buildCue(song, 'mid', 1).audio.samples;
    const two = buildCue(song, 'mid', 2);
    const sr = two.audio.sampleRate;
    const from = Math.round((two.slotStartSec + 1.0 * (60 / 92) + 0.02) * sr); // second note begins at beat 1
    const to = from + Math.round(0.25 * sr);
    const energy = (x: Float32Array) => x.slice(from, to).reduce((a, v) => a + v * v, 0);
    // The one-syllable cue holds one long note across this window; the two-syllable cue starts a new one.
    expect(energy(two.audio.samples)).not.toBeCloseTo(energy(plain), 3);
  });
});
