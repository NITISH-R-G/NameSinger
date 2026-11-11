import type { PcmAudio } from './types';

const EPSILON = 1e-9;

export function toDb(linear: number): number {
  return 20 * Math.log10(Math.max(linear, EPSILON));
}

export function fromDb(db: number): number {
  return 10 ** (db / 20);
}

export function peakOf(samples: Float32Array): number {
  let peak = 0;
  for (let i = 0; i < samples.length; i += 1) {
    const value = Math.abs(samples[i]);
    if (value > peak) peak = value;
  }
  return peak;
}

export function rmsOf(samples: Float32Array): number {
  if (samples.length === 0) return 0;
  let sum = 0;
  for (let i = 0; i < samples.length; i += 1) sum += samples[i] * samples[i];
  return Math.sqrt(sum / samples.length);
}

/** Removes DC offset and rumble below about 80 Hz with a one-pole high-pass filter. */
export function highPass(samples: Float32Array, sampleRate: number, cutoffHz = 80): Float32Array {
  const out = new Float32Array(samples.length);
  const rc = 1 / (2 * Math.PI * cutoffHz);
  const dt = 1 / sampleRate;
  const alpha = rc / (rc + dt);
  let previousIn = 0;
  let previousOut = 0;
  for (let i = 0; i < samples.length; i += 1) {
    const x = samples[i];
    previousOut = alpha * (previousOut + x - previousIn);
    previousIn = x;
    out[i] = previousOut;
  }
  return out;
}

/** Linear-interpolation resample. ratio > 1 plays faster: shorter and higher in pitch. */
export function resampleByRatio(samples: Float32Array, ratio: number): Float32Array {
  if (samples.length === 0 || ratio <= 0) return new Float32Array(0);
  const length = Math.max(1, Math.floor((samples.length - 1) / ratio) + 1);
  const out = new Float32Array(length);
  for (let i = 0; i < length; i += 1) {
    const position = i * ratio;
    const index = Math.floor(position);
    const fraction = position - index;
    const a = samples[index];
    const b = index + 1 < samples.length ? samples[index + 1] : a;
    out[i] = a + (b - a) * fraction;
  }
  return out;
}

/** Changes the sample rate, keeping pitch and duration. */
export function resampleToRate(audio: PcmAudio, targetRate: number): PcmAudio {
  if (audio.sampleRate === targetRate) return audio;
  return {
    sampleRate: targetRate,
    samples: resampleByRatio(audio.samples, audio.sampleRate / targetRate),
  };
}

export function applyFades(samples: Float32Array, sampleRate: number, inMs: number, outMs: number): Float32Array {
  const out = Float32Array.from(samples);
  const fadeIn = Math.min(Math.round((inMs / 1000) * sampleRate), out.length);
  const fadeOut = Math.min(Math.round((outMs / 1000) * sampleRate), out.length);
  for (let i = 0; i < fadeIn; i += 1) out[i] *= i / fadeIn;
  for (let i = 0; i < fadeOut; i += 1) out[out.length - 1 - i] *= i / fadeOut;
  return out;
}

export interface TrimOptions {
  /** Analysis frame length in ms. */
  frameMs?: number;
  /** Speech must be this many dB above the estimated noise floor. */
  marginDb?: number;
  /** Absolute floor for the threshold, in dBFS. */
  minThresholdDb?: number;
  /** Shorter voiced bursts are treated as clicks. */
  minVoicedMs?: number;
  padStartMs?: number;
  padEndMs?: number;
}

export interface TrimResult {
  audio: PcmAudio;
  startSeconds: number;
  endSeconds: number;
  /** Fraction of the original recording that is kept. */
  keptRatio: number;
  noiseFloorDb: number;
  thresholdDb: number;
}

/**
 * Finds the spoken part of a recording and trims leading and trailing silence. The noise floor is
 * estimated from the quietest frames, so a noisy room raises the threshold. Returns null when no
 * frames rise clearly above the floor (silence, or too short to be speech).
 */
export function trimToVoiced(input: PcmAudio, options: TrimOptions = {}): TrimResult | null {
  const frameMs = options.frameMs ?? 10;
  const marginDb = options.marginDb ?? 12;
  const minThresholdDb = options.minThresholdDb ?? -50;
  const minVoicedMs = options.minVoicedMs ?? 80;
  const padStartMs = options.padStartMs ?? 40;
  const padEndMs = options.padEndMs ?? 80;

  const { sampleRate } = input;
  const filtered = highPass(input.samples, sampleRate);
  const frameLength = Math.max(1, Math.round((frameMs / 1000) * sampleRate));
  const frameCount = Math.floor(filtered.length / frameLength);
  if (frameCount < 3) return null;

  const levels = new Float32Array(frameCount);
  for (let f = 0; f < frameCount; f += 1) {
    levels[f] = toDb(rmsOf(filtered.subarray(f * frameLength, (f + 1) * frameLength)));
  }
  const sorted = Float32Array.from(levels).sort();
  const noiseFloorDb = sorted[Math.floor(sorted.length * 0.1)];
  const loudestDb = sorted[sorted.length - 1];
  const thresholdDb = Math.max(noiseFloorDb + marginDb, minThresholdDb);
  if (loudestDb < thresholdDb + 3) return null;

  const minFrames = Math.max(1, Math.round(minVoicedMs / frameMs));
  let first = -1;
  let last = -1;
  let run = 0;
  for (let f = 0; f < frameCount; f += 1) {
    if (levels[f] >= thresholdDb) {
      run += 1;
      if (run >= minFrames) {
        if (first < 0) first = f - run + 1;
        last = f;
      }
    } else {
      run = 0;
    }
  }
  if (first < 0) return null;

  const padStart = Math.round((padStartMs / 1000) * sampleRate);
  const padEnd = Math.round((padEndMs / 1000) * sampleRate);
  const startIndex = Math.max(0, first * frameLength - padStart);
  const endIndex = Math.min(filtered.length, (last + 1) * frameLength + padEnd);
  const kept = filtered.slice(startIndex, endIndex);
  return {
    audio: { sampleRate, samples: applyFades(kept, sampleRate, 8, 30) },
    startSeconds: startIndex / sampleRate,
    endSeconds: endIndex / sampleRate,
    keptRatio: kept.length / filtered.length,
    noiseFloorDb,
    thresholdDb,
  };
}

/**
 * Estimates the fundamental frequency of voiced speech: normalised autocorrelation over voiced
 * frames, median result. Returns null when the audio is not clearly periodic.
 */
export function estimatePitchHz(
  input: PcmAudio,
  minHz = 70,
  maxHz = 420,
): number | null {
  const { sampleRate, samples } = input;
  const frameLength = Math.round(0.04 * sampleRate);
  const hop = Math.round(0.02 * sampleRate);
  const minLag = Math.floor(sampleRate / maxHz);
  const maxLag = Math.ceil(sampleRate / minHz);
  if (samples.length < frameLength + maxLag) return null;

  const loudness = rmsOf(samples);
  const estimates: number[] = [];
  for (let start = 0; start + frameLength + maxLag <= samples.length; start += hop) {
    const frame = samples.subarray(start, start + frameLength);
    const energy = rmsOf(frame);
    if (energy < loudness * 0.5) continue;

    let zeroLag = 0;
    for (let i = 0; i < frameLength; i += 1) zeroLag += frame[i] * frame[i];
    if (zeroLag < EPSILON) continue;

    const correlations = new Float32Array(maxLag + 2);
    let best = 0;
    for (let lag = minLag; lag <= maxLag + 1; lag += 1) {
      let sum = 0;
      let lagEnergy = 0;
      for (let i = 0; i < frameLength; i += 1) {
        const delayed = samples[start + i + lag];
        sum += frame[i] * delayed;
        lagEnergy += delayed * delayed;
      }
      const correlation = sum / Math.sqrt(zeroLag * lagEnergy + EPSILON);
      correlations[lag] = correlation;
      if (correlation > best) best = correlation;
    }
    if (best <= 0.6) continue;

    // Take the first strong peak, not the highest: multiples of the period correlate almost as
    // well, and choosing the highest gives octave errors.
    let bestLag = 0;
    for (let lag = minLag + 1; lag <= maxLag; lag += 1) {
      const value = correlations[lag];
      if (value >= 0.9 * best && value >= correlations[lag - 1] && value >= correlations[lag + 1]) {
        bestLag = lag;
        break;
      }
    }
    if (bestLag === 0) continue;
    // Parabolic interpolation around the peak for sub-sample accuracy.
    const before = correlations[bestLag - 1];
    const peak = correlations[bestLag];
    const after = correlations[bestLag + 1];
    const denominator = before - 2 * peak + after;
    const refined = denominator < -EPSILON ? bestLag + (0.5 * (before - after)) / denominator : bestLag;
    estimates.push(sampleRate / refined);
  }
  if (estimates.length < 2) return null;
  estimates.sort((a, b) => a - b);
  return estimates[Math.floor(estimates.length / 2)];
}

/**
 * Waveform-similarity overlap-add time stretch. factor > 1 makes the audio longer without
 * changing its pitch. Intended for short clips (a name), so the search is thorough, not fast.
 */
export function timeStretch(samples: Float32Array, sampleRate: number, factor: number): Float32Array {
  if (samples.length === 0 || Math.abs(factor - 1) < 0.01) return Float32Array.from(samples);
  const grain = Math.max(16, Math.round(0.03 * sampleRate));
  const synthesisHop = Math.floor(grain / 2);
  const analysisHop = synthesisHop / factor;
  const seek = Math.round(0.008 * sampleRate);
  const outputLength = Math.round(samples.length * factor);
  const out = new Float32Array(outputLength + grain * 2);
  const weight = new Float32Array(outputLength + grain * 2);
  const window = new Float32Array(grain);
  for (let i = 0; i < grain; i += 1) window[i] = 0.5 - 0.5 * Math.cos((2 * Math.PI * (i + 0.5)) / grain);

  let previousStart = 0;
  for (let outputPosition = 0, index = 0; outputPosition < outputLength; outputPosition += synthesisHop, index += 1) {
    const nominal = Math.round(index * analysisHop);
    let start = nominal;
    if (index > 0) {
      const target = previousStart + synthesisHop;
      let bestScore = -Infinity;
      for (let delta = -seek; delta <= seek; delta += 2) {
        const candidate = nominal + delta;
        if (candidate < 0 || candidate + grain > samples.length || target + grain > samples.length) continue;
        let score = 0;
        for (let i = 0; i < grain; i += 2) score += samples[candidate + i] * samples[target + i];
        if (score > bestScore) {
          bestScore = score;
          start = candidate;
        }
      }
    }
    start = Math.min(Math.max(0, start), Math.max(0, samples.length - grain));
    for (let i = 0; i < grain; i += 1) {
      const source = start + i < samples.length ? samples[start + i] : 0;
      out[outputPosition + i] += source * window[i];
      weight[outputPosition + i] += window[i];
    }
    previousStart = start;
  }
  const result = new Float32Array(outputLength);
  for (let i = 0; i < outputLength; i += 1) result[i] = weight[i] > 1e-3 ? out[i] / weight[i] : out[i];
  return result;
}

export interface FitResult {
  samples: Float32Array;
  /** Pitch change actually applied, in semitones (after clamping). */
  shiftSemitones: number;
  /** Time-stretch factor applied after the pitch change. */
  stretchFactor: number;
  pitchClamped: boolean;
  stretchClamped: boolean;
}

/**
 * Moves a spoken clip toward a target pitch and fits it to a time slot. The pitch change is a
 * varispeed resample (it also moves the formants, so large shifts sound unnatural, which is why
 * the shift is clamped), then a time stretch restores or sets the duration.
 */
export function fitToSlot(
  audio: PcmAudio,
  options: {
    sourceHz: number | null;
    targetHz: number;
    slotSeconds: number;
    maxShiftSemitones?: number;
    minStretch?: number;
    maxStretch?: number;
  },
): FitResult {
  const maxShift = options.maxShiftSemitones ?? 4;
  const minStretch = options.minStretch ?? 0.6;
  const maxStretch = options.maxStretch ?? 1.5;

  let shift = options.sourceHz ? 12 * Math.log2(options.targetHz / options.sourceHz) : 0;
  const pitchClamped = Math.abs(shift) > maxShift;
  shift = Math.max(-maxShift, Math.min(maxShift, shift));
  const ratio = 2 ** (shift / 12);

  const shifted = resampleByRatio(audio.samples, ratio);
  const naturalSeconds = shifted.length / audio.sampleRate;
  let stretch = options.slotSeconds / Math.max(naturalSeconds, 1e-3);
  const clampedStretch = Math.max(minStretch, Math.min(maxStretch, stretch));
  const stretchClamped = clampedStretch !== stretch;
  stretch = clampedStretch;

  let samples = timeStretch(shifted, audio.sampleRate, stretch);
  const slotSamples = Math.round(options.slotSeconds * audio.sampleRate);
  if (samples.length > slotSamples) samples = applyFades(samples.slice(0, slotSamples), audio.sampleRate, 0, 40);
  return { samples, shiftSemitones: shift, stretchFactor: stretch, pitchClamped, stretchClamped };
}

/**
 * Picks the chord tone (in any octave) closest to the speaker's own pitch, so the shift needed to
 * land on a note of the chord is as small as possible.
 */
export function pickTargetHz(sourceHz: number | null, chordTonesHz: readonly number[]): number {
  if (!sourceHz) return chordTonesHz[0];
  let best = chordTonesHz[0];
  let bestDistance = Infinity;
  for (const tone of chordTonesHz) {
    for (let octave = -3; octave <= 3; octave += 1) {
      const candidate = tone * 2 ** octave;
      const distance = Math.abs(12 * Math.log2(candidate / sourceHz));
      if (distance < bestDistance) {
        bestDistance = distance;
        best = candidate;
      }
    }
  }
  return best;
}

/** Schroeder-style reverb (four combs, two all-passes). Returns the wet signal only. */
export function reverbWet(samples: Float32Array, sampleRate: number, tailSeconds = 0.7): Float32Array {
  const length = samples.length + Math.round(tailSeconds * sampleRate);
  const input = new Float32Array(length);
  input.set(samples);
  const combDelays = [0.0297, 0.0371, 0.0411, 0.0437].map((s) => Math.round(s * sampleRate));
  const out = new Float32Array(length);
  for (const delay of combDelays) {
    const buffer = new Float32Array(length);
    for (let i = 0; i < length; i += 1) {
      const feedback = i >= delay ? buffer[i - delay] * 0.77 : 0;
      buffer[i] = input[i] + feedback;
      out[i] += buffer[i] / combDelays.length;
    }
  }
  let current = out;
  for (const delaySeconds of [0.005, 0.0017]) {
    const delay = Math.round(delaySeconds * sampleRate);
    const next = new Float32Array(length);
    for (let i = 0; i < length; i += 1) {
      const delayedIn = i >= delay ? current[i - delay] : 0;
      const delayedOut = i >= delay ? next[i - delay] : 0;
      next[i] = -0.7 * current[i] + delayedIn + 0.7 * delayedOut;
    }
    current = next;
  }
  return current;
}

/** Adds overlay into base starting at startIndex (clipped to the base length). */
export function mixInto(base: Float32Array, overlay: Float32Array, startIndex: number, gain: number): void {
  for (let i = 0; i < overlay.length; i += 1) {
    const target = startIndex + i;
    if (target < 0) continue;
    if (target >= base.length) break;
    base[target] += overlay[i] * gain;
  }
}

/** Lowers the base level around a vocal so it stays clear (a simple sidechain-style duck). */
export function duckRegion(
  base: Float32Array,
  sampleRate: number,
  startSeconds: number,
  durationSeconds: number,
  depthDb: number,
  attackMs = 30,
  releaseMs = 250,
): void {
  const depth = fromDb(-Math.abs(depthDb));
  const start = Math.round(startSeconds * sampleRate);
  const end = start + Math.round(durationSeconds * sampleRate);
  const attack = Math.max(1, Math.round((attackMs / 1000) * sampleRate));
  const release = Math.max(1, Math.round((releaseMs / 1000) * sampleRate));
  const from = Math.max(0, start - attack);
  const to = Math.min(base.length, end + release);
  for (let i = from; i < to; i += 1) {
    let gain = depth;
    if (i < start) gain = 1 - (1 - depth) * ((i - from) / attack);
    else if (i >= end) gain = depth + (1 - depth) * ((i - end) / release);
    base[i] *= gain;
  }
}

/** Scales the whole signal so its peak sits at the target level (dBFS). */
export function normalizePeak(samples: Float32Array, targetPeakDb = -1): void {
  const peak = peakOf(samples);
  if (peak < EPSILON) return;
  const gain = fromDb(targetPeakDb) / peak;
  for (let i = 0; i < samples.length; i += 1) samples[i] *= gain;
}
