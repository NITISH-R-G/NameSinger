// Gentle retuning of a name the person actually sang. Each syllable is shifted toward the nearest
// octave of its cue note by a fraction of the error, capped; the singer's own pitch contour (vibrato,
// scoops) is kept and timing is not changed. Built on the TD-PSOLA grain engine in ./pitch.
import {
  addCopy,
  addPsola,
  finalize,
  makeRandom,
  median,
  newSynth,
  placeMarks,
  trackPitch,
  type PitchTrack,
  type Run,
  type Yielder,
} from './pitch';
import { segmentSyllables, type Syllable } from './segment';

export interface RetuneOptions {
  targetsHz: readonly number[];
  /** 0 keeps the singer's pitch, 1 snaps to the note. */
  strength: number;
  /** Largest correction applied, in cents. */
  maxCents: number;
  glideSec: number;
}

export interface SyllableReport {
  nucleusStartSec: number;
  nucleusEndSec: number;
  singerHz: number | null;
  targetHz: number;
  /** Singer's error against the nearest octave of the target, in cents (positive = sharp). */
  errorCents: number | null;
  appliedCents: number;
}

export interface RetuneResult {
  audio: Float32Array;
  syllables: Syllable[];
  reports: SyllableReport[];
  warnings: string[];
}

function regionRuns(runs: readonly Run[], a: number, b: number): { a: number; b: number; voiced: boolean }[] {
  const pieces: { a: number; b: number; voiced: boolean }[] = [];
  let cursor = a;
  for (const r of runs) {
    if (r.end <= a || r.start >= b) continue;
    const s = Math.max(a, r.start);
    const e = Math.min(b, r.end);
    if (s > cursor) pieces.push({ a: cursor, b: s, voiced: false });
    pieces.push({ a: s, b: e, voiced: true });
    cursor = e;
  }
  if (cursor < b) pieces.push({ a: cursor, b, voiced: false });
  return pieces;
}

function f0AtSample(track: PitchTrack, sample: number, fallback: number): number {
  const pos = sample / track.hop;
  const i0 = Math.floor(pos);
  const frac = pos - i0;
  const a = track.f0[Math.max(0, Math.min(track.f0.length - 1, i0))];
  const b = track.f0[Math.max(0, Math.min(track.f0.length - 1, i0 + 1))];
  if (a > 0 && b > 0) return Math.exp(Math.log(a) * (1 - frac) + Math.log(b) * frac);
  if (a > 0) return a;
  if (b > 0) return b;
  for (let k = 2; k <= 6; k += 1) {
    for (const j of [i0 - k, i0 + k]) if (j >= 0 && j < track.f0.length && track.f0[j] > 0) return track.f0[j];
  }
  return fallback;
}

export class NoSingingError extends Error {}

export async function retuneName(
  x: Float32Array,
  sampleRate: number,
  syllableCount: number,
  options: RetuneOptions,
  yielder?: Yielder,
): Promise<RetuneResult> {
  const warnings: string[] = [];
  if (options.targetsHz.length !== syllableCount) throw new Error('need one target note per syllable');
  const track = await trackPitch(x, sampleRate, { fmin: 70, fmax: 700, decimate: true }, yielder);
  const { marks, runs } = placeMarks(x, track);
  const seg = segmentSyllables(track, syllableCount);
  warnings.push(...seg.notes);
  const sylls = seg.syllables;
  const voiced = Array.from(track.f0).filter((v) => v > 0);
  if (voiced.length < 10) throw new NoSingingError('no clear pitched singing was found in the take');
  const fallbackHz = median(voiced);

  const reports: SyllableReport[] = sylls.map((s, k) => {
    const f0s = Array.from(track.f0).filter((hz, i) => hz > 0 && track.centers[i] >= s.nStart && track.centers[i] < s.nEnd);
    const target = options.targetsHz[k];
    if (f0s.length < 3) {
      return {
        nucleusStartSec: s.nStart / sampleRate, nucleusEndSec: s.nEnd / sampleRate, singerHz: null, targetHz: target,
        errorCents: null, appliedCents: 0,
      };
    }
    const singer = median(f0s);
    const octaves = Math.round(Math.log2(singer / target));
    const folded = target * Math.pow(2, octaves);
    const error = 1200 * Math.log2(singer / folded);
    const applied = Math.max(-options.maxCents, Math.min(options.maxCents, -options.strength * error));
    return {
      nucleusStartSec: s.nStart / sampleRate, nucleusEndSec: s.nEnd / sampleRate, singerHz: singer, targetHz: folded,
      errorCents: error, appliedCents: applied,
    };
  });
  if (reports.some((r) => r.errorCents === null)) warnings.push('One syllable had too little pitched sound to tune; it was left as sung.');

  const glide = Math.round(options.glideSec * sampleRate);
  const boundaries = sylls.slice(1).map((s) => s.start);
  const shiftAt = (sample: number): number => {
    let k = 0;
    while (k < boundaries.length && sample >= boundaries[k]) k += 1;
    let cents = reports[k].appliedCents;
    if (k > 0 && sample < boundaries[k - 1] + glide) {
      const u = Math.max(0, Math.min(1, (sample - boundaries[k - 1] + glide) / (2 * glide)));
      const s = 0.5 - 0.5 * Math.cos(Math.PI * u);
      cents = reports[k - 1].appliedCents * (1 - s) + reports[k].appliedCents * s;
    }
    if (k < boundaries.length && sample > boundaries[k] - glide) {
      const u = Math.max(0, Math.min(1, (sample - (boundaries[k] - glide)) / (2 * glide)));
      const s = 0.5 - 0.5 * Math.cos(Math.PI * u);
      cents = reports[k].appliedCents * (1 - s) + reports[k + 1].appliedCents * s;
    }
    return cents;
  };

  const synth = newSynth(x.length + Math.round(0.1 * sampleRate), sampleRate);
  const random = makeRandom(5);
  const fallbackPeriod = sampleRate / fallbackHz;
  for (const piece of regionRuns(runs, 0, x.length)) {
    if (piece.voiced && piece.b - piece.a > 3) {
      addPsola(synth, {
        x, marks, outStart: piece.a, outLength: piece.b - piece.a, srcPos: (u) => piece.a + u,
        f0At: (q) => f0AtSample(track, q, fallbackHz) * Math.pow(2, shiftAt(q) / 1200),
        fallbackPeriod, jitter: 0, random,
      });
    } else {
      addCopy(synth, x, piece.a, piece.b, piece.a);
    }
  }
  const y = finalize(synth).slice(0, x.length);
  return { audio: y, syllables: sylls, reports, warnings };
}
