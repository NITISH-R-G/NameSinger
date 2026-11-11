// Splits a sung name into syllables and finds each syllable's vowel core, from loudness peaks of the
// voiced signal. The syllable count is an input (the person confirms it). Ported from the prototype.
import type { PitchTrack } from './pitch';

export interface Syllable {
  start: number;
  end: number;
  /** The steady, loud voiced core of the vowel: [nStart, nEnd). */
  nStart: number;
  nEnd: number;
}

export interface Segmentation {
  syllables: Syllable[];
  notes: string[];
  /** True when loudness peaks could not be found for every syllable and the singing was split evenly. */
  fellBackToEvenSplit: boolean;
}

function movingAverage(values: Float64Array, radius: number): Float64Array {
  const out = new Float64Array(values.length);
  for (let i = 0; i < values.length; i += 1) {
    let sum = 0;
    let count = 0;
    for (let k = -radius; k <= radius; k += 1) {
      if (i + k >= 0 && i + k < values.length) {
        sum += values[i + k];
        count += 1;
      }
    }
    out[i] = sum / count;
  }
  return out;
}

export function segmentSyllables(track: PitchTrack, count: number): Segmentation {
  const { f0, energyDb, centers, hop } = track;
  const frames = f0.length;
  const notes: string[] = [];
  let peakDb = -Infinity;
  for (let i = 0; i < frames; i += 1) peakDb = Math.max(peakDb, energyDb[i]);
  let first = 0;
  while (first < frames && energyDb[first] < peakDb - 45) first += 1;
  let last = frames - 1;
  while (last > first && energyDb[last] < peakDb - 45) last -= 1;

  const raw = new Float64Array(frames);
  for (let i = 0; i < frames; i += 1) raw[i] = f0[i] > 0 ? energyDb[i] : energyDb[i] - 25;
  const frameMs = (hop / track.sampleRate) * 1000;
  const findPeaks = (radius: number, separationMs: number): number[] => {
    const son = movingAverage(raw, radius);
    const candidates: { index: number; prominence: number }[] = [];
    for (let i = first + 1; i < last; i += 1) {
      if (son[i] >= son[i - 1] && son[i] >= son[i + 1] && f0[i] > 0) {
        let leftMin = son[i];
        for (let k = i - 1; k >= first; k -= 1) {
          leftMin = Math.min(leftMin, son[k]);
          if (son[k] > son[i]) break;
        }
        let rightMin = son[i];
        for (let k = i + 1; k <= last; k += 1) {
          rightMin = Math.min(rightMin, son[k]);
          if (son[k] > son[i]) break;
        }
        candidates.push({ index: i, prominence: son[i] - Math.max(leftMin, rightMin) });
      }
    }
    candidates.sort((a, b) => b.prominence - a.prominence);
    const separation = Math.round(separationMs / frameMs);
    const chosen: number[] = [];
    for (const c of candidates) {
      if (chosen.length === count) break;
      if (chosen.every((p) => Math.abs(p - c.index) >= separation)) chosen.push(c.index);
    }
    return chosen.sort((a, b) => a - b);
  };
  let peaks: number[] = [];
  let fell = false;
  for (const [radius, separationMs] of [[3, 90], [2, 70], [1, 55]] as const) {
    peaks = findPeaks(radius, separationMs);
    if (peaks.length === count) {
      if (radius < 3) notes.push(`Used finer loudness smoothing to find all ${count} syllables.`);
      break;
    }
  }
  if (peaks.length < count) {
    fell = true;
    notes.push(`Only ${peaks.length} clear syllable peaks for ${count} syllables; the singing was split evenly instead.`);
    peaks = [];
    for (let k = 0; k < count; k += 1) peaks.push(Math.round(first + ((k + 0.5) * (last - first + 1)) / count));
  }

  const bounds: number[] = [first];
  for (let k = 0; k + 1 < peaks.length; k += 1) {
    let low = peaks[k];
    for (let i = peaks[k]; i <= peaks[k + 1]; i += 1) if (energyDb[i] < energyDb[low]) low = i;
    bounds.push(low);
  }
  bounds.push(last + 1);

  const syllables: Syllable[] = [];
  for (let k = 0; k < peaks.length; k += 1) {
    const s = bounds[k];
    const e = bounds[k + 1];
    const p = peaks[k];
    let margin = 6;
    let l = p;
    let r = p;
    for (let attempt = 0; attempt < 4; attempt += 1) {
      l = p;
      r = p;
      const limit = energyDb[p] - margin;
      while (l - 1 >= s && f0[l - 1] > 0 && energyDb[l - 1] >= limit && Math.abs(Math.log(f0[l - 1] / f0[p])) <= 0.2) l -= 1;
      while (r + 1 < e && f0[r + 1] > 0 && energyDb[r + 1] >= limit && Math.abs(Math.log(f0[r + 1] / f0[p])) <= 0.2) r += 1;
      if (r - l + 1 >= 5) break;
      margin += 4;
    }
    syllables.push({
      start: Math.max(0, centers[s] - (hop >> 1)),
      end: centers[Math.min(e, frames - 1)] - (hop >> 1),
      nStart: Math.max(0, centers[l] - (hop >> 1)),
      nEnd: centers[r] + (hop >> 1),
    });
  }
  return { syllables, notes, fellBackToEvenSplit: fell };
}
