import { createHash } from 'crypto';
import { readFileSync } from 'fs';
import { join } from 'path';

import { decodeWav } from '../src/audio/wav';
import { DEMO_EXPLANATION, DEMO_LABEL, DEMO_SONGS, demoSongById } from '../src/demo/demoSongs';

// The approved pre-generated demo. It must stay byte-for-byte what was approved.
const FILE = join(__dirname, '..', 'assets', 'audio', 'demo', 'isabella_birthday_mix_v1.wav');
const APPROVED_SHA256 = '60FAFCE7FDB69B10744235F51D1469CA22A1653DDE21B5FAF1053640F9B153EE';

describe('pre-generated Isabella demo asset', () => {
  const bytes = readFileSync(FILE);

  it('is byte-identical to the approved file', () => {
    expect(createHash('sha256').update(bytes).digest('hex').toUpperCase()).toBe(APPROVED_SHA256);
  });

  it('is a 22.05 kHz mono 16-bit WAV of about 33.5 s and under 2 MB', () => {
    expect(bytes.length).toBe(1_477_586);
    expect(bytes.length).toBeLessThan(2 * 1024 * 1024);
    expect(bytes.readUInt16LE(22)).toBe(1); // channels
    expect(bytes.readUInt32LE(24)).toBe(22_050); // sample rate
    expect(bytes.readUInt16LE(34)).toBe(16); // bits
    const audio = decodeWav(new Uint8Array(bytes));
    expect(audio.samples.length / audio.sampleRate).toBeCloseTo(33.5, 1);
  });
});

describe('demo registry and label', () => {
  it('registers the Isabella demo and resolves it by id, defaulting to the first', () => {
    expect(DEMO_SONGS.map((s) => s.id)).toEqual(['isabella']);
    expect(demoSongById('isabella')?.name).toBe('Isabella');
    expect(demoSongById(undefined)?.id).toBe('isabella');
    expect(demoSongById('nope')).toBeNull();
  });

  it('states plainly that the song is pre-generated and not live', () => {
    expect(DEMO_LABEL).toMatch(/pre-generated/i);
    expect(DEMO_EXPLANATION).toMatch(/not something NameSinger generated/i);
  });
});
