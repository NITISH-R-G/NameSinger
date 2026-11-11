import type { PcmAudio } from './types';

interface Vowel {
  /** First and second formant in Hz. */
  f1: number;
  f2: number;
}

const VOWELS: readonly Vowel[] = [
  { f1: 800, f2: 1200 }, // "a"
  { f1: 350, f2: 2200 }, // "i"
  { f1: 600, f2: 1000 }, // "o"
];

/**
 * Synthesizes a short voiced, name-like clip: three vowel syllables with a falling pitch, preceded
 * and followed by quiet room noise. It is not a recording of a person. It exists for unit tests
 * and the development-only "test voice" button, where a real microphone is not available.
 */
export function synthesizeTestVoice(options: {
  sampleRate: number;
  pitchHz?: number;
  leadSeconds?: number;
  tailSeconds?: number;
  syllableSeconds?: number;
}): PcmAudio {
  const { sampleRate } = options;
  const pitch = options.pitchHz ?? 140;
  const lead = options.leadSeconds ?? 0.4;
  const tail = options.tailSeconds ?? 0.4;
  const syllable = options.syllableSeconds ?? 0.22;
  const voiced = VOWELS.length * syllable;
  const total = Math.round((lead + voiced + tail) * sampleRate);
  const samples = new Float32Array(total);

  // Deterministic quiet noise so the noise-floor estimate is realistic.
  let seed = 12345;
  const noise = (): number => {
    seed = (seed * 1664525 + 1013904223) % 4294967296;
    return seed / 4294967296 - 0.5;
  };

  let phase = 0;
  for (let i = 0; i < total; i += 1) {
    const t = i / sampleRate;
    let value = noise() * 0.004;
    const local = t - lead;
    if (local >= 0 && local < voiced) {
      const index = Math.min(VOWELS.length - 1, Math.floor(local / syllable));
      const within = (local - index * syllable) / syllable;
      const envelope = Math.sin(Math.PI * Math.min(1, within * 0.9 + 0.05)) ** 0.7;
      const f0 = pitch * (1.06 - 0.12 * (local / voiced)) * (1 + 0.01 * Math.sin(2 * Math.PI * 5 * t));
      phase += (2 * Math.PI * f0) / sampleRate;
      const vowel = VOWELS[index];
      let harmonic = 0;
      for (let h = 1; h * f0 < sampleRate / 2 && h <= 30; h += 1) {
        const frequency = h * f0;
        const gain =
          Math.exp(-(((frequency - vowel.f1) / 220) ** 2)) +
          0.6 * Math.exp(-(((frequency - vowel.f2) / 320) ** 2)) +
          0.05 / h;
        harmonic += gain * Math.sin(h * phase);
      }
      value += 0.12 * envelope * harmonic;
    }
    samples[i] = value;
  }
  return { sampleRate, samples };
}
