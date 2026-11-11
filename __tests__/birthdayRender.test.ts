import { readFileSync } from 'fs';
import { join } from 'path';

import { rmsOf, toDb } from '../src/audio/dsp';
import { synthesizeTestVoice } from '../src/audio/testVoice';
import { decodeWav, encodeWav } from '../src/audio/wav';
import { buildCue } from '../src/birthday/cue';
import { NoSingingFoundError, renderBirthdaySong } from '../src/birthday/renderBirthday';
import { nameNoteStarts, slotWindowSeconds } from '../src/birthday/score';

// MECHANICS ONLY. These tests use a synthetic voice (not a person singing) to prove that the pipeline
// finds the voice in a guided take, places it in the name slot, and writes a valid file. They say
// nothing about how a real sung name sounds; that needs a human to listen.

const song = (key: string) =>
  decodeWav(new Uint8Array(readFileSync(join(__dirname, '..', 'assets', 'audio', 'birthday', `birthday-${key}.wav`))));

/** A silent-room take on the cue's timeline with the synthetic voice placed `at` seconds in. */
function takeWithVoice(sampleRate: number, totalSec: number, at: number) {
  const voice = synthesizeTestVoice({ sampleRate, leadSeconds: 0.2, tailSeconds: 0.2, syllableSeconds: 0.3 });
  const samples = new Float32Array(Math.round(totalSec * sampleRate));
  // quiet room noise so the noise-floor estimate is realistic
  let seed = 7;
  for (let i = 0; i < samples.length; i += 1) {
    seed = (seed * 1664525 + 1013904223) % 4294967296;
    samples[i] = (seed / 4294967296 - 0.5) * 0.004;
  }
  const start = Math.round(at * sampleRate);
  for (let i = 0; i < voice.samples.length && start + i < samples.length; i += 1) samples[start + i] += voice.samples[i];
  return { sampleRate, samples };
}

const sec = (x: Float32Array, sr: number, a: number, b: number) => x.slice(Math.round(a * sr), Math.round(b * sr));

describe('renderBirthdaySong (synthetic voice, mechanics only)', () => {
  const key = 'mid' as const;
  const syllables = 3;
  const base = song(key);
  const cue = buildCue(base, key, syllables);

  it('puts the name into the slot, keeps the rest of the song, and stays within level limits', async () => {
    // The voice's first vowel is 0.2 s into the clip; singing starts 0.35 s late (a human reaction).
    const take = takeWithVoice(22050, cue.durationSec, cue.slotStartSec + 0.35 - 0.2);
    const result = await renderBirthdaySong({
      song: base, take, key, syllables, takeSlotStartSec: cue.slotStartSec, takeSlotEndSec: cue.slotEndSec,
    });
    const out = result.audio;
    expect(out.sampleRate).toBe(base.sampleRate);
    expect(out.samples.length).toBe(base.samples.length);

    // 1. The name starts on the first cue note (alignment absorbs the late start).
    const slot = slotWindowSeconds();
    expect(Math.abs(result.report.nameStartSec - nameNoteStarts(syllables)[0])).toBeLessThan(0.08);
    expect(result.report.nameStartSec).toBeGreaterThanOrEqual(slot.start - 0.1);
    expect(result.report.nameEndSec).toBeLessThanOrEqual(slot.end + 0.6);

    // 2. The slot is clearly louder than the same stretch of the plain song (the voice is there) ...
    const { nameStartSec: a, nameEndSec: b } = result.report;
    const nameOut = toDb(rmsOf(sec(out.samples, out.sampleRate, a, b)));
    const nameSong = toDb(rmsOf(sec(base.samples, base.sampleRate, a, b)));
    expect(nameOut - nameSong).toBeGreaterThan(3); // present over the music; whether it is loud enough is for a listener

    // 3. ... and the name-only track is where the report says.
    const named = result.nameOnly;
    const inName = rmsOf(sec(named, out.sampleRate, result.report.nameStartSec, result.report.nameEndSec));
    const before = rmsOf(sec(named, out.sampleRate, 2, 6));
    expect(inName).toBeGreaterThan(0.01);
    expect(before).toBe(0);

    // 4. The rest of the song is the same music: the other lines keep the same level relative to each other.
    const line = (x: Float32Array, a: number, b: number) => rmsOf(sec(x, out.sampleRate, a, b));
    const ratioOut = line(out.samples, 5.2, 10.4) / line(out.samples, 21, 28);
    const ratioSong = line(base.samples, 5.2, 10.4) / line(base.samples, 21, 28);
    expect(ratioOut / ratioSong).toBeGreaterThan(0.95);
    expect(ratioOut / ratioSong).toBeLessThan(1.05);

    // 5. Peak is at -1 dBFS (never clipped).
    let peak = 0;
    for (const v of out.samples) peak = Math.max(peak, Math.abs(v));
    expect(peak).toBeGreaterThan(0.85);
    expect(peak).toBeLessThanOrEqual(0.9);

    // 6. Corrections stay within the cap and every syllable has a report.
    expect(result.report.syllables).toHaveLength(syllables);
    for (const s of result.report.syllables) expect(Math.abs(s.appliedCents)).toBeLessThanOrEqual(200);
  });

  it('exports a valid 16-bit WAV that decodes back to the same audio', async () => {
    const take = takeWithVoice(22050, cue.durationSec, cue.slotStartSec);
    const result = await renderBirthdaySong({
      song: base, take, key, syllables, takeSlotStartSec: cue.slotStartSec, takeSlotEndSec: cue.slotEndSec,
    });
    const bytes = encodeWav(result.audio);
    expect(bytes.length).toBe(44 + result.audio.samples.length * 2);
    const back = decodeWav(bytes);
    expect(back.sampleRate).toBe(22050);
    expect(back.samples.length).toBe(result.audio.samples.length);
    let worst = 0;
    for (let i = 0; i < back.samples.length; i += 997) worst = Math.max(worst, Math.abs(back.samples[i] - result.audio.samples[i]));
    expect(worst).toBeLessThan(1 / 16000);
  });

  it('accepts a take recorded at another sample rate', async () => {
    const take = takeWithVoice(16000, cue.durationSec, cue.slotStartSec);
    const result = await renderBirthdaySong({
      song: base, take, key, syllables, takeSlotStartSec: cue.slotStartSec, takeSlotEndSec: cue.slotEndSec,
    });
    expect(result.report.nameStartSec).toBeGreaterThan(18);
  });

  it('says so plainly when the take holds no singing', async () => {
    const silent = takeWithVoice(22050, cue.durationSec, 0);
    silent.samples.fill(0.0005);
    await expect(
      renderBirthdaySong({ song: base, take: silent, key, syllables, takeSlotStartSec: cue.slotStartSec, takeSlotEndSec: cue.slotEndSec }),
    ).rejects.toBeInstanceOf(NoSingingFoundError);
  });
});
