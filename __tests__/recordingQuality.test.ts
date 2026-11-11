import { fromDb, peakOf, rmsOf, toDb, trimToVoiced } from '../src/audio/dsp';
import {
  assessRecording,
  MIN_NAME_SECONDS,
  QUIET_VOICE_RMS_DB,
  SILENT_PEAK_DB,
  UNUSABLE_MESSAGES,
  VOICE_TRIM_OPTIONS,
} from '../src/audio/recordingQuality';
import { renderPersonalizedSong } from '../src/audio/renderSong';
import { templateForLanguage } from '../src/audio/template';
import { synthesizeTestVoice } from '../src/audio/testVoice';
import { decodeWav, encodeWav } from '../src/audio/wav';
import { analyzeTake } from '../src/hooks/analyzeTake';
import type { PcmAudio } from '../src/audio/types';

import * as fs from 'fs';
import * as path from 'path';

const RATE = 22050;
const instrumental = decodeWav(
  new Uint8Array(fs.readFileSync(path.join(__dirname, '..', 'assets', 'audio', 'demo-instrumental.wav'))),
);
const template = templateForLanguage('hi-IN');

/** Deterministic noise so the tests do not depend on a random seed. */
function noise(length: number, rmsDb: number | null, seed = 1): Float32Array {
  const out = new Float32Array(length);
  if (rmsDb === null) return out;
  let state = seed;
  for (let i = 0; i < length; i += 1) {
    state = (state * 1664525 + 1013904223) % 4294967296;
    const a = state / 4294967296;
    state = (state * 1664525 + 1013904223) % 4294967296;
    out[i] = a + state / 4294967296 - 1;
  }
  const gain = fromDb(rmsDb) / (rmsOf(out) || 1);
  for (let i = 0; i < length; i += 1) out[i] *= gain;
  return out;
}

/** A synthetic name, scaled to a given peak, with a room-noise bed under it (like a real take). */
function take(peakDb: number, roomDb: number | null): PcmAudio {
  const voice = synthesizeTestVoice({ sampleRate: RATE, leadSeconds: 0.5, tailSeconds: 0.6 });
  // Remove the built-in noise of the test voice so the room level below is the only noise.
  const clean = voice.samples.map((v) => (Math.abs(v) < 0.01 ? 0 : v));
  const gain = fromDb(peakDb) / peakOf(Float32Array.from(clean));
  const bed = noise(clean.length, roomDb);
  const samples = new Float32Array(clean.length);
  for (let i = 0; i < samples.length; i += 1) {
    samples[i] = Math.max(-1, Math.min(1, Math.round((clean[i] * gain + bed[i]) * 32767) / 32767));
  }
  return { sampleRate: RATE, samples };
}

function rendersOk(audio: PcmAudio): boolean {
  try {
    renderPersonalizedSong({ instrumental, name: audio, template });
    return true;
  } catch (error) {
    const code = (error as { code?: string }).code;
    if (code === 'no_voice' || code === 'name_too_short') return false;
    throw error;
  }
}

describe('assessRecording: what is accepted', () => {
  it.each([-6, -12, -20, -30])('accepts a clear voice peaking at %p dBFS in a quiet room', (peak) => {
    expect(assessRecording(take(peak, -75)).ok).toBe(true);
  });

  it('accepts a quiet voice that the old -50 dBFS floor rejected', () => {
    // Measured: a voice peaking at -40 dBFS is clear in a silent room but its frames sit below -50.
    const quietVoice = take(-40, -80);
    expect(trimToVoiced(quietVoice)).toBeNull(); // the old default floor
    expect(trimToVoiced(quietVoice, VOICE_TRIM_OPTIONS)).not.toBeNull();
    const result = assessRecording(quietVoice);
    expect(result.ok).toBe(true);
    // It works, but is flagged so the screen can suggest moving closer, not rejected for it.
    if (result.ok) expect(result.quiet).toBe(true);
  });

  it('does not flag a normal voice as quiet', () => {
    const result = assessRecording(take(-12, -70));
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.quiet).toBe(false);
  });

  it('accepts a voice over moderate background noise', () => {
    expect(assessRecording(take(-10, -50)).ok).toBe(true);
  });
});

describe('assessRecording: what is refused, and why', () => {
  it('calls digital silence silent', () => {
    expect(assessRecording({ sampleRate: RATE, samples: new Float32Array(RATE * 2) })).toEqual({
      ok: false,
      reason: 'silent',
    });
  });

  it('calls a take with only the faintest hiss silent', () => {
    const hiss = { sampleRate: RATE, samples: noise(RATE * 3, -85) };
    expect(toDb(peakOf(hiss.samples))).toBeLessThan(SILENT_PEAK_DB);
    expect(assessRecording(hiss)).toEqual({ ok: false, reason: 'silent' });
  });

  it.each([-70, -60, -50, -40, -30])('refuses steady room noise at %p dBFS with no voice', (level) => {
    const result = assessRecording({ sampleRate: RATE, samples: noise(RATE * 3, level) });
    expect(result.ok).toBe(false);
  });

  it('refuses a voice buried under louder noise as unclear, not silent', () => {
    const buried = take(-30, -25);
    expect(assessRecording(buried)).toEqual({ ok: false, reason: 'unclear' });
  });

  it('refuses a lone click or a short burst', () => {
    const click = noise(RATE * 3, -75);
    for (let i = 0; i < 0.02 * RATE; i += 1) click[RATE + i] += 0.5 * Math.sin(i * 0.9);
    expect(assessRecording({ sampleRate: RATE, samples: click }).ok).toBe(false);
  });

  it('refuses a clip too short to be a name', () => {
    const blip = synthesizeTestVoice({ sampleRate: RATE, syllableSeconds: 0.03 });
    const result = assessRecording(blip);
    expect(result.ok).toBe(false);
  });

  it('has a distinct, actionable message for every reason', () => {
    const messages = Object.values(UNUSABLE_MESSAGES);
    expect(new Set(messages).size).toBe(messages.length);
    for (const message of messages) {
      expect(message.length).toBeGreaterThan(20);
      expect(message).toMatch(/record again|stop/i);
      expect(message).not.toMatch(/file:|\/|\\|exception|error/i);
    }
  });
});

describe('assessRecording and the song renderer agree', () => {
  const peaks = [-6, -20, -30, -40, -45, -55, -65];
  const rooms: (number | null)[] = [null, -80, -65, -50, -40, -30];

  it('never approves a take that the renderer then rejects for lack of a voice', () => {
    const disagreements: string[] = [];
    for (const peak of peaks) {
      for (const room of rooms) {
        const audio = take(peak, room);
        if (assessRecording(audio).ok !== rendersOk(audio)) disagreements.push(`${peak}/${room}`);
      }
    }
    expect(disagreements).toEqual([]);
  });

  it('shares the minimum name length with the renderer', () => {
    expect(MIN_NAME_SECONDS).toBe(0.25);
    expect(QUIET_VOICE_RMS_DB).toBeLessThan(-37); // below what the 24 dB boost can bring to target
  });
});

describe('analyzeTake (reads the file, then assesses it)', () => {
  const read = (audio: PcmAudio) => ({ readBytes: async () => encodeWav(audio) });

  it('returns ok for a good take', async () => {
    expect(await analyzeTake('file:///take.wav', read(take(-12, -70)))).toMatchObject({ ok: true });
  });

  it('returns a fixed message, never the path, for a silent take', async () => {
    const result = await analyzeTake('file:///private/take.wav', read({ sampleRate: RATE, samples: new Float32Array(RATE) }));
    expect(result).toEqual({ ok: false, message: UNUSABLE_MESSAGES.silent });
    expect(JSON.stringify(result)).not.toContain('private');
  });

  it('lets an unreadable file throw, so the controller can fall back to accepting it', async () => {
    await expect(analyzeTake('file:///x.wav', { readBytes: async () => new Uint8Array(10) })).rejects.toBeDefined();
  });
});
