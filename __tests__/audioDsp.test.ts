import {
  applyFades,
  duckRegion,
  estimatePitchHz,
  fitToSlot,
  highPass,
  mixInto,
  normalizePeak,
  peakOf,
  pickTargetHz,
  resampleByRatio,
  reverbWet,
  rmsOf,
  timeStretch,
  trimToVoiced,
} from '../src/audio/dsp';
import { synthesizeTestVoice } from '../src/audio/testVoice';
import { PipelineError, type PcmAudio } from '../src/audio/types';
import { decodeWav, encodeWav } from '../src/audio/wav';

// Rendering a full song is CPU-heavy and several times slower under Jest than in plain Node.
jest.setTimeout(30_000);

const RATE = 22050;

function sine(frequency: number, seconds: number, amplitude = 0.5, rate = RATE): Float32Array {
  const out = new Float32Array(Math.round(seconds * rate));
  for (let i = 0; i < out.length; i += 1) out[i] = amplitude * Math.sin((2 * Math.PI * frequency * i) / rate);
  return out;
}

/** A harmonic tone with a clear period, like a sustained vowel. */
function voicedTone(f0: number, seconds: number, rate = RATE): Float32Array {
  const out = new Float32Array(Math.round(seconds * rate));
  for (let i = 0; i < out.length; i += 1) {
    let value = 0;
    for (let h = 1; h <= 8; h += 1) value += Math.sin((2 * Math.PI * f0 * h * i) / rate) / h;
    out[i] = 0.2 * value;
  }
  return out;
}

/** Deterministic pseudo-random noise in -0.5..0.5. */
function whiteNoise(length: number, amplitude: number, seedStart = 1): Float32Array {
  let seed = seedStart;
  const out = new Float32Array(length);
  for (let i = 0; i < length; i += 1) {
    seed = (seed * 1664525 + 1013904223) % 4294967296;
    out[i] = amplitude * (seed / 4294967296 - 0.5);
  }
  return out;
}

function zeroCrossingHz(samples: Float32Array, rate: number): number {
  let crossings = 0;
  for (let i = 1; i < samples.length; i += 1) if (samples[i - 1] < 0 && samples[i] >= 0) crossings += 1;
  return crossings / (samples.length / rate);
}

describe('WAV codec', () => {
  it('round-trips 16-bit audio', () => {
    const audio: PcmAudio = { sampleRate: RATE, samples: sine(440, 0.1) };
    const decoded = decodeWav(encodeWav(audio));
    expect(decoded.sampleRate).toBe(RATE);
    expect(decoded.samples.length).toBe(audio.samples.length);
    for (let i = 0; i < audio.samples.length; i += 97) {
      expect(Math.abs(decoded.samples[i] - audio.samples[i])).toBeLessThan(1 / 16000);
    }
  });

  it('clamps out-of-range samples when encoding', () => {
    const bytes = encodeWav({ sampleRate: RATE, samples: Float32Array.from([2, -2, 0.5]) });
    const decoded = decodeWav(bytes);
    expect(decoded.samples[0]).toBeCloseTo(1, 3);
    expect(decoded.samples[1]).toBeCloseTo(-1, 3);
  });

  it('downmixes stereo and reads a header that claims more data than exists', () => {
    const mono = encodeWav({ sampleRate: RATE, samples: Float32Array.from([0.5, 0.5, -0.5, -0.5]) });
    const stereo = new Uint8Array(44 + 16);
    stereo.set(mono.subarray(0, 44));
    const view = new DataView(stereo.buffer);
    view.setUint16(22, 2, true); // two channels
    view.setUint32(40, 1_000_000, true); // lying data size, like a file still being written
    const samples = [0.5, -0.5, 0.25, 0.25, 1, 1, -1, -1];
    samples.forEach((s, i) => view.setInt16(44 + i * 2, Math.round(s * 32767), true));
    const decoded = decodeWav(stereo);
    expect(decoded.samples.length).toBe(4);
    expect(decoded.samples[0]).toBeCloseTo(0, 3);
    expect(decoded.samples[2]).toBeCloseTo(1, 3);
  });

  it('rejects files that are not supported WAV', () => {
    expect(() => decodeWav(new Uint8Array(10))).toThrow(PipelineError);
    expect(() => decodeWav(new Uint8Array(64))).toThrow(PipelineError);
    const wrongBits = encodeWav({ sampleRate: RATE, samples: new Float32Array(100) });
    new DataView(wrongBits.buffer).setUint16(34, 24, true);
    expect(() => decodeWav(wrongBits)).toThrow(PipelineError);
  });
});

describe('resampling and filtering', () => {
  it('doubles the pitch and halves the length at ratio 2', () => {
    const tone = sine(300, 1);
    const fast = resampleByRatio(tone, 2);
    expect(Math.abs(fast.length - tone.length / 2)).toBeLessThanOrEqual(1);
    expect(zeroCrossingHz(fast, RATE)).toBeCloseTo(600, -1);
  });

  it('removes DC offset', () => {
    const shifted = sine(440, 0.5).map((v) => v + 0.3);
    const filtered = highPass(shifted, RATE);
    const tail = filtered.subarray(filtered.length - 2000);
    const mean = tail.reduce((sum, v) => sum + v, 0) / tail.length;
    expect(Math.abs(mean)).toBeLessThan(0.02);
  });

  it('fades the edges to silence', () => {
    const faded = applyFades(new Float32Array(1000).fill(1), RATE, 10, 10);
    expect(faded[0]).toBe(0);
    expect(faded[999]).toBe(0);
    expect(faded[500]).toBe(1);
  });
});

describe('trimToVoiced', () => {
  it('keeps the voiced part of a clip and drops leading and trailing silence', () => {
    const voice = synthesizeTestVoice({ sampleRate: RATE });
    const result = trimToVoiced(voice);
    expect(result).not.toBeNull();
    const kept = (result?.audio.samples.length ?? 0) / RATE;
    expect(kept).toBeGreaterThan(0.6);
    expect(kept).toBeLessThan(1.0); // 0.66 s of voice plus short padding, not the 1.46 s recording
    expect(result?.startSeconds).toBeGreaterThan(0.25);
    expect(result?.keptRatio).toBeLessThan(0.75);
  });

  it('raises the threshold in a noisy room instead of keeping the noise', () => {
    const voice = synthesizeTestVoice({ sampleRate: RATE });
    const room = whiteNoise(voice.samples.length, 0.05, 7);
    const noisy = voice.samples.map((v, i) => v + room[i]);
    const result = trimToVoiced({ sampleRate: RATE, samples: noisy });
    expect(result).not.toBeNull();
    expect((result?.audio.samples.length ?? 0) / RATE).toBeLessThan(1.1);
  });

  it('returns null for silence, steady noise and a lone click', () => {
    expect(trimToVoiced({ sampleRate: RATE, samples: new Float32Array(RATE) })).toBeNull();
    expect(trimToVoiced({ sampleRate: RATE, samples: whiteNoise(RATE, 0.02, 3) })).toBeNull();
    const click = new Float32Array(RATE);
    for (let i = 0; i < 200; i += 1) click[5000 + i] = 0.8 * Math.sin(i / 3);
    expect(trimToVoiced({ sampleRate: RATE, samples: click })).toBeNull();
  });
});

describe('pitch estimation', () => {
  it.each([110, 150, 220, 300])('finds %p Hz', (f0) => {
    const estimate = estimatePitchHz({ sampleRate: RATE, samples: voicedTone(f0, 0.6) });
    expect(estimate).not.toBeNull();
    expect(Math.abs((estimate as number) / f0 - 1)).toBeLessThan(0.04);
  });

  it('returns null for noise', () => {
    expect(estimatePitchHz({ sampleRate: RATE, samples: whiteNoise(RATE, 1, 5) })).toBeNull();
  });

  it('finds the pitch of the synthetic test voice', () => {
    const voice = trimToVoiced(synthesizeTestVoice({ sampleRate: RATE, pitchHz: 140 }));
    const estimate = estimatePitchHz((voice as NonNullable<typeof voice>).audio);
    expect(estimate).toBeGreaterThan(110);
    expect(estimate).toBeLessThan(160);
  });
});

describe('time stretch and slot fitting', () => {
  it('changes duration without changing pitch', () => {
    const tone = voicedTone(180, 0.5);
    const stretched = timeStretch(tone, RATE, 1.5);
    expect(Math.abs(stretched.length / tone.length - 1.5)).toBeLessThan(0.02);
    const pitch = estimatePitchHz({ sampleRate: RATE, samples: stretched });
    expect(Math.abs((pitch as number) / 180 - 1)).toBeLessThan(0.05);
    expect(stretched.every(Number.isFinite)).toBe(true);
  });

  it('returns a copy when the factor is about 1', () => {
    const tone = sine(200, 0.2);
    const same = timeStretch(tone, RATE, 1.001);
    expect(same).not.toBe(tone);
    expect(same.length).toBe(tone.length);
  });

  it('moves pitch toward the target and fits the slot', () => {
    const tone = voicedTone(150, 0.5);
    const fit = fitToSlot({ sampleRate: RATE, samples: tone }, { sourceHz: 150, targetHz: 180, slotSeconds: 0.6 });
    expect(fit.shiftSemitones).toBeCloseTo(12 * Math.log2(180 / 150), 2);
    expect(fit.samples.length).toBeLessThanOrEqual(Math.round(0.6 * RATE));
    expect(fit.pitchClamped).toBe(false);
    const pitch = estimatePitchHz({ sampleRate: RATE, samples: fit.samples });
    expect(Math.abs((pitch as number) / 180 - 1)).toBeLessThan(0.05);
  });

  it('limits a large pitch change and reports it', () => {
    const fit = fitToSlot(
      { sampleRate: RATE, samples: voicedTone(120, 0.4) },
      { sourceHz: 120, targetHz: 400, slotSeconds: 0.5 },
    );
    expect(fit.pitchClamped).toBe(true);
    expect(fit.shiftSemitones).toBe(4);
  });

  it('trims a clip that is longer than the slot even at the maximum compression', () => {
    const fit = fitToSlot(
      { sampleRate: RATE, samples: voicedTone(150, 2) },
      { sourceHz: 150, targetHz: 150, slotSeconds: 0.5 },
    );
    expect(fit.stretchClamped).toBe(true);
    expect(fit.samples.length).toBeLessThanOrEqual(Math.round(0.5 * RATE));
  });

  it('chooses the chord tone that needs the smallest shift, in any octave', () => {
    expect(pickTargetHz(130, [220, 261.63, 329.63])).toBeCloseTo(130.81, 1); // C3
    expect(pickTargetHz(null, [220, 261.63])).toBe(220);
    const target = pickTargetHz(250, [174.61, 220, 261.63]);
    expect(Math.abs(12 * Math.log2(target / 250))).toBeLessThan(1);
  });
});

describe('mixing helpers', () => {
  it('adds an overlay at an offset and ignores what falls outside', () => {
    const base = new Float32Array(10);
    mixInto(base, Float32Array.from([1, 1, 1, 1]), 8, 0.5);
    mixInto(base, Float32Array.from([1, 1]), -1, 1);
    expect(Array.from(base)).toEqual([1, 0, 0, 0, 0, 0, 0, 0, 0.5, 0.5]);
  });

  it('ducks only around the vocal and recovers', () => {
    const base = new Float32Array(RATE * 3).fill(1);
    duckRegion(base, RATE, 1, 1, 6);
    expect(base[RATE * 1 + 100]).toBeCloseTo(10 ** (-6 / 20), 2);
    expect(base[100]).toBe(1);
    expect(base[RATE * 3 - 1]).toBeCloseTo(1, 1);
  });

  it('normalizes to the requested peak', () => {
    const samples = sine(220, 0.2, 0.2);
    normalizePeak(samples, -1);
    expect(20 * Math.log10(peakOf(samples))).toBeCloseTo(-1, 1);
    const silent = new Float32Array(10);
    normalizePeak(silent);
    expect(Array.from(silent)).toEqual(new Array(10).fill(0));
  });

  it('adds a reverb tail without producing invalid samples', () => {
    const dry = sine(300, 0.3, 0.4);
    const wet = reverbWet(dry, RATE, 0.7);
    expect(wet.length).toBe(dry.length + Math.round(0.7 * RATE));
    expect(wet.every(Number.isFinite)).toBe(true);
    const tail = wet.subarray(dry.length + 2000);
    expect(rmsOf(tail)).toBeGreaterThan(0);
    expect(peakOf(wet)).toBeLessThan(3);
  });
});
