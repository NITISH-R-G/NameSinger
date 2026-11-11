// Puts the person's sung name into the pre-rendered birthday song. Pure function of audio in, audio
// out (no files, no Expo), so it runs identically in the app and in the Jest tests.
//
// Steps: high-pass; find the singing near the name slot in the guided take; gently retune each
// syllable toward its cue note (the singer's own contour is kept); align the first vowel to the first
// cue note; compressor; level to -14 dBFS RMS; small room; duck the song under the name; mix.
import { duckRegion, fromDb, highPass, mixInto, normalizePeak, peakOf, reverbWet, resampleToRate, toDb } from '../audio/dsp';
import type { PcmAudio } from '../audio/types';
import { rmsRange, type Yielder } from './pitch';
import { retuneName, NoSingingError } from './retune';
import { nameNoteStarts, nameTargetsHz, slotWindowSeconds, type KeyName } from './score';

export interface RenderInput {
  /** The pre-rendered song for the chosen key (name slot empty). */
  song: PcmAudio;
  /** The person's guided take (mono). Any sample rate. */
  take: PcmAudio;
  key: KeyName;
  syllables: number;
  /** Where the slot starts in the take, in seconds (the cue's own timeline). */
  takeSlotStartSec: number;
  takeSlotEndSec: number;
  strength?: number;
  maxCents?: number;
}

export interface RenderReport {
  noiseFloorDb: number;
  singingFoundSec: [number, number];
  /** Per syllable: where its vowel starts relative to its cue note after alignment, in ms. */
  timingErrorsMs: number[];
  /** The slot in the finished song, in seconds, and where the sung name actually starts. */
  slotSec: [number, number];
  nameStartSec: number;
  nameEndSec: number;
  syllables: { singerHz: number | null; targetHz: number; errorCents: number | null; appliedCents: number }[];
  warnings: string[];
}

export interface RenderResult {
  audio: PcmAudio;
  /** The processed name on its own, same rate as the song, aligned to the finished song's timeline. */
  nameOnly: Float32Array;
  nameOffsetSamples: number;
  report: RenderReport;
}

export class NoSingingFoundError extends Error {}

export async function renderBirthdaySong(input: RenderInput, yielder?: Yielder): Promise<RenderResult> {
  const warnings: string[] = [];
  const strength = input.strength ?? 0.8;
  const maxCents = input.maxCents ?? 200;
  const sr = input.take.sampleRate;
  const take = highPass(input.take.samples, sr, 90);

  // ---- find the singing ------------------------------------------------------------------------
  const frame = Math.round(0.01 * sr);
  const levels: number[] = [];
  for (let i = 0; i + frame <= take.length; i += frame) levels.push(toDb(rmsRange(take, i, i + frame)));
  const quiet = [...levels.slice(0, 250)].sort((p, q) => p - q);
  const noiseFloorDb = quiet[Math.floor(quiet.length * 0.3)] ?? -90;
  const thresholdDb = Math.max(noiseFloorDb + 14, -52);
  const winA = Math.max(0, Math.round((input.takeSlotStartSec - 1.2) * 100));
  const winB = Math.min(levels.length - 1, Math.round((input.takeSlotEndSec + 1.6) * 100));
  let first = -1;
  let last = -1;
  let run = 0;
  for (let i = winA; i <= winB; i += 1) {
    if (levels[i] >= thresholdDb) {
      run += 1;
      if (run >= 6) {
        if (first < 0) first = i - run + 1;
        last = i;
      }
    } else run = 0;
  }
  if (first < 0) throw new NoSingingFoundError('No singing was found near the name slot.');
  const pad = 12;
  const regionStart = Math.max(0, (first - pad) * frame);
  const regionEnd = Math.min(take.length, (last + 1 + pad * 2) * frame);
  const region = take.slice(regionStart, regionEnd);
  if (peakOf(take) > 0.98) warnings.push('clipping');
  if (toDb(rmsRange(region)) - noiseFloorDb < 20) warnings.push('quiet');
  if (yielder) await yielder();

  // ---- retune ----------------------------------------------------------------------------------
  const targetsHz = nameTargetsHz(input.syllables, input.key);
  let tuned;
  try {
    tuned = await retuneName(region, sr, input.syllables, { targetsHz, strength, maxCents, glideSec: 0.06 }, yielder);
  } catch (error) {
    if (error instanceof NoSingingError) throw new NoSingingFoundError(error.message);
    throw error;
  }
  warnings.push(...tuned.warnings);
  if (yielder) await yielder();

  // ---- align the first vowel to the first cue note (in the finished song's timeline) -----------
  const noteStarts = nameNoteStarts(input.syllables);
  const firstVowel = tuned.syllables[0].nStart / sr;
  const placeAtSong = noteStarts[0] - firstVowel; // seconds, may be slightly negative
  const timingErrorsMs = tuned.syllables.map((s, k) => Math.round((s.nStart / sr + placeAtSong - noteStarts[k]) * 1000));
  if (timingErrorsMs.some((e) => Math.abs(e) > 160)) warnings.push('off-beat');

  // ---- level, dynamics, room -------------------------------------------------------------------
  const voice = Float32Array.from(tuned.audio);
  {
    const att = Math.exp(-1 / (0.005 * sr));
    const rel = Math.exp(-1 / (0.09 * sr));
    let env = 0;
    for (let i = 0; i < voice.length; i += 1) {
      const a = Math.abs(voice[i]);
      env = a > env ? att * env + (1 - att) * a : rel * env + (1 - rel) * a;
      const over = toDb(env) + 24;
      voice[i] *= over > 0 ? fromDb(-over * (1 - 1 / 2.5)) : 1;
    }
    const voicedLevel = toDb(rmsRange(voice, tuned.syllables[0].nStart, tuned.syllables[tuned.syllables.length - 1].nEnd));
    const g = fromDb(-14 - voicedLevel);
    for (let i = 0; i < voice.length; i += 1) voice[i] *= g;
  }
  const songSr = input.song.sampleRate;
  const voiceAtSong = resampleToRate({ sampleRate: sr, samples: voice }, songSr).samples;
  const wet = reverbWet(voiceAtSong, songSr, 0.6);

  // ---- mix -------------------------------------------------------------------------------------
  const mix = Float32Array.from(input.song.samples);
  const slot = slotWindowSeconds();
  duckRegion(mix, songSr, slot.start, slot.end - slot.start, 2);
  const start = Math.round(placeAtSong * songSr);
  mixInto(mix, voiceAtSong, start, 1);
  mixInto(mix, wet, start, 0.22);
  normalizePeak(mix, -1);

  const nameStartSec = placeAtSong + tuned.syllables[0].nStart / sr;
  const nameEndSec = placeAtSong + tuned.syllables[tuned.syllables.length - 1].nEnd / sr;
  const nameOnly = new Float32Array(mix.length);
  mixInto(nameOnly, voiceAtSong, start, 1);
  return {
    audio: { sampleRate: songSr, samples: mix },
    nameOnly,
    nameOffsetSamples: start,
    report: {
      noiseFloorDb: Math.round(noiseFloorDb),
      singingFoundSec: [(first * frame) / sr, ((last + 1) * frame) / sr],
      timingErrorsMs,
      slotSec: [slot.start, slot.end],
      nameStartSec,
      nameEndSec,
      syllables: tuned.reports.map((r) => ({
        singerHz: r.singerHz,
        targetHz: r.targetHz,
        errorCents: r.errorCents === null ? null : Math.round(r.errorCents),
        appliedCents: Math.round(r.appliedCents),
      })),
      warnings,
    },
  };
}
