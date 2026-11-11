// Pitch tracking (YIN), pitch-mark placement and the TD-PSOLA grain engine, ported from
// research/singing-engine/td-psola-prototype for React Native. Pure TypeScript on Float32Array: no
// Node or browser API. Hermes runs this roughly ten times slower than Node, so the pitch tracker
// analyses a half-rate copy and can hand control back to the UI between chunks of frames.
import { toDb } from '../audio/dsp';

export const median = (values: readonly number[]): number => {
  if (values.length === 0) return NaN;
  const s = [...values].sort((a, b) => a - b);
  const m = s.length >> 1;
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
};

export function rmsRange(x: Float32Array, start = 0, end = x.length): number {
  const a = Math.max(0, start);
  const b = Math.min(x.length, end);
  if (b <= a) return 0;
  let sum = 0;
  for (let i = a; i < b; i += 1) sum += x[i] * x[i];
  return Math.sqrt(sum / (b - a));
}

export function makeRandom(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export interface PitchTrack {
  sampleRate: number;
  /** Samples (at `sampleRate`) between frames. */
  hop: number;
  centers: number[];
  /** Fundamental frequency in Hz; 0 where the frame is unvoiced. */
  f0: Float64Array;
  conf: Float64Array;
  /** Short-time level in dBFS. */
  energyDb: Float64Array;
}

export interface PitchOptions {
  fmin?: number;
  fmax?: number;
  hopMs?: number;
  windowMs?: number;
  threshold?: number;
  minDb?: number;
  /** Analyse at half the sample rate (about four times cheaper). The track is reported at full rate. */
  decimate?: boolean;
}

/** Called every few dozen frames so a caller on the UI thread can let the screen update. */
export type Yielder = () => Promise<void>;

function halve(x: Float32Array): Float32Array {
  const y = new Float32Array(Math.floor(x.length / 2));
  for (let i = 0; i < y.length; i += 1) {
    const j = 2 * i;
    y[i] = 0.25 * (j > 0 ? x[j - 1] : x[j]) + 0.5 * x[j] + 0.25 * x[j + 1];
  }
  return y;
}

export async function trackPitch(
  input: Float32Array,
  inputRate: number,
  options: PitchOptions = {},
  yielder?: Yielder,
): Promise<PitchTrack> {
  const factor = options.decimate ? 2 : 1;
  const x = factor === 2 ? halve(input) : input;
  const sampleRate = inputRate / factor;
  const fmin = options.fmin ?? 50;
  const fmax = options.fmax ?? 450;
  const hop = Math.round((sampleRate * (options.hopMs ?? 5)) / 1000);
  const win = Math.round((sampleRate * (options.windowMs ?? 36)) / 1000);
  const threshold = options.threshold ?? 0.2;
  const minDb = options.minDb ?? -60;
  const tauMin = Math.floor(sampleRate / fmax);
  const tauMax = Math.ceil(sampleRate / fmin);
  const pad = win + tauMax + 8;
  const xp = new Float32Array(x.length + 2 * pad);
  xp.set(x, pad);

  const frames = Math.floor(x.length / hop) + 1;
  const centers: number[] = [];
  const f0 = new Float64Array(frames);
  const conf = new Float64Array(frames);
  const energyDb = new Float64Array(frames);
  const diff = new Float64Array(tauMax + 2);
  const cmnd = new Float64Array(tauMax + 2);
  const halfEnergy = Math.round(sampleRate * 0.01);

  for (let i = 0; i < frames; i += 1) {
    if (yielder && i > 0 && i % 40 === 0) await yielder();
    const c = i * hop;
    centers.push(c * factor);
    energyDb[i] = toDb(rmsRange(x, c - halfEnergy, c + halfEnergy));
    if (energyDb[i] < minDb) continue;

    const s = c - (win >> 1) + pad;
    for (let tau = 1; tau <= tauMax + 1; tau += 1) {
      let sum = 0;
      for (let j = 0; j < win; j += 1) {
        const d = xp[s + j] - xp[s + j + tau];
        sum += d * d;
      }
      diff[tau] = sum;
    }
    let running = 0;
    cmnd[0] = 1;
    for (let tau = 1; tau <= tauMax + 1; tau += 1) {
      running += diff[tau];
      cmnd[tau] = running > 0 ? (diff[tau] * tau) / running : 1;
    }
    let best = -1;
    for (let tau = tauMin; tau <= tauMax; tau += 1) {
      if (cmnd[tau] < threshold) {
        best = tau;
        while (best + 1 <= tauMax && cmnd[best + 1] < cmnd[best]) best += 1;
        break;
      }
    }
    if (best < 0) {
      let low = tauMin;
      for (let tau = tauMin; tau <= tauMax; tau += 1) if (cmnd[tau] < cmnd[low]) low = tau;
      if (cmnd[low] > 0.35) continue;
      best = low;
    }
    const a = cmnd[best - 1];
    const b = cmnd[best];
    const d = cmnd[best + 1];
    const denom = a - 2 * b + d;
    const refined = Math.abs(denom) > 1e-9 ? best + (0.5 * (a - d)) / denom : best;
    conf[i] = 1 - b;
    f0[i] = sampleRate / refined;
  }

  // Fix octave jumps against the recent median, then smooth with a 5-frame median.
  const recent: number[] = [];
  for (let i = 0; i < frames; i += 1) {
    if (f0[i] === 0) {
      recent.length = 0;
      continue;
    }
    if (recent.length >= 3) {
      const ref = median(recent);
      if (f0[i] > ref * 1.8 && f0[i] / ref < 2.3) f0[i] /= 2;
      else if (f0[i] < ref * 0.55 && ref / f0[i] < 2.3) f0[i] *= 2;
    }
    recent.push(f0[i]);
    if (recent.length > 7) recent.shift();
  }
  const smoothed = Float64Array.from(f0);
  for (let i = 0; i < frames; i += 1) {
    if (f0[i] === 0) continue;
    const window: number[] = [];
    for (let k = -2; k <= 2; k += 1) {
      const v = f0[i + k];
      if (i + k >= 0 && i + k < frames && v > 0) window.push(v);
    }
    smoothed[i] = median(window);
  }
  return { sampleRate: inputRate, hop: hop * factor, centers, f0: smoothed, conf, energyDb };
}

export interface Run {
  start: number;
  end: number;
}

export function voicedRuns(track: PitchTrack, maxGapFrames = 3, minFrames = 4): Run[] {
  const { f0, centers, hop } = track;
  const runs: Run[] = [];
  let first = -1;
  let last = -1;
  const flush = () => {
    if (first >= 0 && last - first + 1 >= minFrames) {
      runs.push({ start: Math.max(0, centers[first] - (hop >> 1)), end: centers[last] + (hop >> 1) });
    }
    first = -1;
    last = -1;
  };
  for (let i = 0; i < f0.length; i += 1) {
    if (f0[i] > 0) {
      if (first < 0) first = i;
      else if (i - last > maxGapFrames + 1) {
        flush();
        first = i;
      }
      last = i;
    }
  }
  flush();
  return runs;
}

export function periodAt(track: PitchTrack, sample: number): number {
  const { f0, hop, sampleRate } = track;
  const idx = Math.max(0, Math.min(f0.length - 1, Math.round(sample / hop)));
  for (let k = 0; k <= 6; k += 1) {
    for (const j of [idx - k, idx + k]) {
      if (j >= 0 && j < f0.length && f0[j] > 0) return sampleRate / f0[j];
    }
  }
  return sampleRate / 150;
}

export interface Marks {
  marks: number[];
  runs: Run[];
}

/** One mark per glottal cycle: peaks of one polarity, one period apart, inside each voiced run. */
export function placeMarks(x: Float32Array, track: PitchTrack): Marks {
  const runs = voicedRuns(track);
  const all: number[] = [];
  for (const run of runs) {
    let maxPos = 0;
    let maxNeg = 0;
    for (let i = run.start; i < run.end && i < x.length; i += 1) {
      maxPos = Math.max(maxPos, x[i]);
      maxNeg = Math.max(maxNeg, -x[i]);
    }
    const sign = maxPos >= maxNeg ? 1 : -1;
    let m0 = run.start;
    let best = -Infinity;
    for (let i = run.start; i < run.end && i < x.length; i += 1) {
      if (sign * x[i] > best) {
        best = sign * x[i];
        m0 = i;
      }
    }
    const strongest = best;
    const pick = (center: number, lo: number, hi: number, quarter: number): number => {
      let bestIndex = Math.max(lo, 0);
      let bestScore = -Infinity;
      for (let i = Math.max(lo, 0); i <= hi && i < x.length; i += 1) {
        const score = sign * x[i] - 0.25 * strongest * (Math.abs(i - center) / quarter);
        if (score > bestScore) {
          bestScore = score;
          bestIndex = i;
        }
      }
      return bestIndex;
    };
    const forward: number[] = [];
    let m = m0;
    for (;;) {
      const t = periodAt(track, m);
      const lo = m + Math.round(0.75 * t);
      const hi = Math.min(run.end - 1, m + Math.round(1.25 * t));
      if (hi < lo) break;
      m = pick(m + t, lo, hi, 0.25 * t);
      forward.push(m);
    }
    const backward: number[] = [];
    m = m0;
    for (;;) {
      const t = periodAt(track, m);
      const hi = m - Math.round(0.75 * t);
      const lo = Math.max(run.start, m - Math.round(1.25 * t));
      if (hi <= lo) break;
      m = pick(m - t, lo, hi, 0.25 * t);
      backward.unshift(m);
    }
    all.push(...backward, m0, ...forward);
  }
  return { marks: all, runs };
}

export function localPeriod(marks: readonly number[], j: number, fallback: number): number {
  const left = j > 0 ? marks[j] - marks[j - 1] : 0;
  const right = j < marks.length - 1 ? marks[j + 1] - marks[j] : 0;
  let t: number;
  if (left > 0 && right > 0) t = Math.max(left, right) / Math.min(left, right) > 1.5 ? Math.min(left, right) : (left + right) / 2;
  else t = left > 0 ? left : right > 0 ? right : fallback;
  return Math.max(fallback / 2.5, Math.min(fallback * 2.5, t));
}

export function nearestMark(marks: readonly number[], sample: number): number {
  let lo = 0;
  let hi = marks.length - 1;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (marks[mid] < sample) lo = mid + 1;
    else hi = mid;
  }
  if (lo > 0 && Math.abs(marks[lo - 1] - sample) <= Math.abs(marks[lo] - sample)) return lo - 1;
  return lo;
}

// ---- TD-PSOLA grain engine ----------------------------------------------------------------------
// Each output pitch cycle is a Hann-windowed two-period grain cut from the recording around a pitch
// mark, so each cycle keeps the singer's spectral envelope while the cycle spacing (the pitch) is free.

export interface Synth {
  sampleRate: number;
  out: Float32Array;
  wsum: Float32Array;
}

export function newSynth(length: number, sampleRate: number): Synth {
  return { sampleRate, out: new Float32Array(length), wsum: new Float32Array(length) };
}

export function finalize(s: Synth): Float32Array {
  const y = new Float32Array(s.out.length);
  for (let i = 0; i < y.length; i += 1) y[i] = s.out[i] / Math.max(s.wsum[i], 0.4);
  return y;
}

export function addCopy(s: Synth, x: Float32Array, srcStart: number, srcEnd: number, outStart: number, rampMs = 6): void {
  const a = Math.max(0, Math.round(srcStart));
  const b = Math.min(x.length, Math.round(srcEnd));
  const ramp = Math.max(1, Math.round((rampMs / 1000) * s.sampleRate));
  for (let i = a; i < b; i += 1) {
    const o = Math.round(outStart) + (i - a);
    if (o < 0 || o >= s.out.length) continue;
    const w = Math.min(1, (i - a + 1) / ramp, (b - i) / ramp);
    s.out[o] += x[i] * w;
    s.wsum[o] += w;
  }
}

export interface PsolaJob {
  x: Float32Array;
  marks: readonly number[];
  outStart: number;
  outLength: number;
  srcPos: (offset: number) => number;
  f0At: (outSample: number) => number;
  fallbackPeriod: number;
  jitter: number;
  random: () => number;
}

export function addPsola(s: Synth, job: PsolaJob): number {
  const { x, marks } = job;
  if (marks.length === 0) return 0;
  let grains = 0;
  let q = job.outStart;
  const end = job.outStart + job.outLength;
  while (q < end) {
    const source = job.srcPos(q - job.outStart);
    let jl = nearestMark(marks, source);
    if (marks[jl] > source && jl > 0) jl -= 1;
    let jr = Math.min(marks.length - 1, jl + 1);
    const periodL = localPeriod(marks, jl, job.fallbackPeriod);
    const span = marks[jr] - marks[jl];
    let frac = span > 0 ? Math.max(0, Math.min(1, (source - marks[jl]) / span)) : 0;
    if (span > 1.6 * periodL) {
      jr = jl;
      frac = 0;
    }
    const periodR = localPeriod(marks, jr, job.fallbackPeriod);
    const half = Math.max(8, Math.round(Math.max(periodL, periodR)));
    const length = 2 * half + 1;
    const base = Math.floor(q);
    const place = q - base;
    for (let k = 0; k < length; k += 1) {
      const il = marks[jl] - half + k;
      const ir = marks[jr] - half + k;
      const w = 0.5 + 0.5 * Math.cos((Math.PI * (k - half)) / (half + 1));
      const a = il >= 0 && il < x.length ? x[il] : 0;
      const b = ir >= 0 && ir < x.length ? x[ir] : 0;
      const g = ((1 - frac) * a + frac * b) * w;
      const o = base - half + k;
      if (o < 0 || o + 1 >= s.out.length) continue;
      s.out[o] += g * (1 - place);
      s.out[o + 1] += g * place;
      s.wsum[o] += w * (1 - place);
      s.wsum[o + 1] += w * place;
    }
    grains += 1;
    const hz = Math.max(40, job.f0At(q));
    q += (s.sampleRate / hz) * (1 + job.jitter * (job.random() * 2 - 1));
  }
  return grains;
}
