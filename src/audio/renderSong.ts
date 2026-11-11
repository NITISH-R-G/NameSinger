import {
  duckRegion,
  estimatePitchHz,
  fitToSlot,
  fromDb,
  mixInto,
  normalizePeak,
  peakOf,
  pickTargetHz,
  resampleToRate,
  reverbWet,
  rmsOf,
  toDb,
  trimToVoiced,
  applyFades,
} from './dsp';
import { MIN_NAME_SECONDS, VOICE_TRIM_OPTIONS } from './recordingQuality';
import { beatSeconds, validateTemplate, type SongTemplate } from './template';
import { durationSeconds, PipelineError, type PcmAudio } from './types';

/**
 * Target level of the spoken name before each slot's own gain, in dBFS RMS. The demo
 * instrumental sits near -16 dBFS RMS, so the name is levelled a little above it.
 */
const NAME_TARGET_RMS_DB = -13;
/** How far the instrumental dips under each name, in dB. */
const DUCK_DEPTH_DB = 6;
const MAX_NAME_BOOST_DB = 24;
const MAX_NAME_SECONDS = 4;

export interface SlotReport {
  startBeat: number;
  targetHz: number;
  shiftSemitones: number;
  stretchFactor: number;
  pitchClamped: boolean;
  stretchClamped: boolean;
}

export interface RenderReport {
  name: {
    recordedSeconds: number;
    keptSeconds: number;
    pitchHz: number | null;
    noiseFloorDb: number;
    thresholdDb: number;
  };
  slots: SlotReport[];
  output: { seconds: number; sampleRate: number; peakDb: number; rmsDb: number };
  /** Wall-clock milliseconds per stage, measured with the injected clock. */
  timingsMs: Record<'prepare' | 'slots' | 'finalize' | 'total', number>;
  warnings: string[];
}

export interface RenderOptions {
  now?: () => number;
}

function defaultNow(): number {
  return typeof performance !== 'undefined' ? performance.now() : Date.now();
}

/**
 * Builds a personalized song from a prepared instrumental and a recording of the user's name.
 * Pure and synchronous: no file or native access, so it can be swapped for a native
 * implementation later without touching the callers.
 *
 * The name is cleaned (high-pass, silence trim), levelled, tuned toward the chord under each
 * slot, fitted to the slot length, given reverb and placed on the beat while the instrumental
 * ducks underneath. A spoken name tuned this way reads as an intentional chant, not as a sung
 * melody; see docs/audio/architecture-decision.md.
 */
export function renderPersonalizedSong(
  input: { instrumental: PcmAudio; name: PcmAudio; template: SongTemplate },
  options: RenderOptions = {},
): { audio: PcmAudio; report: RenderReport } {
  const now = options.now ?? defaultNow;
  const t0 = now();
  const { instrumental, template } = input;
  const sampleRate = instrumental.sampleRate;
  const warnings: string[] = [];

  validateTemplate(template, durationSeconds(instrumental));

  // 1. Clean up the name.
  const name = resampleToRate(input.name, sampleRate);
  const trim = trimToVoiced(name, VOICE_TRIM_OPTIONS);
  if (trim === null) {
    throw new PipelineError('no_voice', 'No voice was detected in the recording.');
  }
  let spoken = trim.audio;
  if (durationSeconds(spoken) < MIN_NAME_SECONDS) {
    throw new PipelineError('name_too_short', 'The recording is too short to be a name.');
  }
  if (durationSeconds(spoken) > MAX_NAME_SECONDS) {
    warnings.push('The recording was long; only the first part is used.');
    spoken = {
      sampleRate,
      samples: applyFades(spoken.samples.slice(0, Math.round(MAX_NAME_SECONDS * sampleRate)), sampleRate, 0, 60),
    };
  }
  const level = rmsOf(spoken.samples);
  const boostDb = Math.min(MAX_NAME_BOOST_DB, NAME_TARGET_RMS_DB - toDb(level));
  const leveled = new Float32Array(spoken.samples.length);
  const boost = fromDb(boostDb);
  for (let i = 0; i < leveled.length; i += 1) leveled[i] = spoken.samples[i] * boost;
  const pitchHz = estimatePitchHz({ sampleRate, samples: leveled });
  if (pitchHz === null) {
    warnings.push('Could not detect a clear pitch; the name is placed without tuning.');
  }
  const tPrepared = now();

  // 2. Lay out the song and place the name.
  const loopLength = instrumental.samples.length;
  const tail = Math.round(template.tailSeconds * sampleRate);
  const song = new Float32Array(loopLength * template.instrumentalLoops + tail);
  for (let loop = 0; loop < template.instrumentalLoops; loop += 1) song.set(instrumental.samples, loop * loopLength);

  const beat = beatSeconds(template);
  const slotReports: SlotReport[] = [];
  const vocal = new Float32Array(song.length);
  for (const slot of template.slots) {
    const startSeconds = slot.startBeat * beat;
    const slotSeconds = slot.beats * beat * 0.92;
    const targetHz = pickTargetHz(pitchHz, slot.chordTonesHz);
    const fit = fitToSlot({ sampleRate, samples: leveled }, { sourceHz: pitchHz, targetHz, slotSeconds });
    const faded = applyFades(fit.samples, sampleRate, 6, 35);
    const wet = reverbWet(faded, sampleRate);
    const start = Math.round(startSeconds * sampleRate);
    mixInto(vocal, faded, start, fromDb(slot.gainDb));
    mixInto(vocal, wet, start, fromDb(slot.gainDb) * slot.reverbSend);
    duckRegion(song, sampleRate, startSeconds, slotSeconds, DUCK_DEPTH_DB);
    slotReports.push({
      startBeat: slot.startBeat,
      targetHz,
      shiftSemitones: fit.shiftSemitones,
      stretchFactor: fit.stretchFactor,
      pitchClamped: fit.pitchClamped,
      stretchClamped: fit.stretchClamped,
    });
  }
  if (slotReports.some((slot) => slot.pitchClamped)) {
    warnings.push('Some notes needed more pitch change than is natural, so they were limited.');
  }
  const tSlots = now();

  // 3. Mix down and finish.
  for (let i = 0; i < song.length; i += 1) song[i] += vocal[i];
  normalizePeak(song, -1);
  const peak = peakOf(song);
  const tDone = now();

  return {
    audio: { sampleRate, samples: song },
    report: {
      name: {
        recordedSeconds: durationSeconds(name),
        keptSeconds: durationSeconds(trim.audio),
        pitchHz,
        noiseFloorDb: trim.noiseFloorDb,
        thresholdDb: trim.thresholdDb,
      },
      slots: slotReports,
      output: {
        seconds: song.length / sampleRate,
        sampleRate,
        peakDb: toDb(peak),
        rmsDb: toDb(rmsOf(song)),
      },
      timingsMs: {
        prepare: tPrepared - t0,
        slots: tSlots - tPrepared,
        finalize: tDone - tSlots,
        total: tDone - t0,
      },
      warnings,
    },
  };
}
