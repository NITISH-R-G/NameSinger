import { PipelineError } from './types';

/** A place in the song where the user's name is sung (spoken, pitched to the chord). */
export interface NameSlot {
  /** Position from the start of the song, in beats. */
  startBeat: number;
  beats: number;
  /** Notes of the chord under this slot, in Hz (any octave). The name is tuned to the nearest one. */
  chordTonesHz: readonly number[];
  gainDb: number;
  /** Amount of reverb added to this slot (0 to 1). */
  reverbSend: number;
}

export interface SongTemplate {
  id: string;
  title: string;
  /** True while the instrumental is the synthesized demo and not a produced song. */
  isPlaceholder: boolean;
  bpm: number;
  beatsPerBar: number;
  /** How many times the instrumental asset repeats to make the song. */
  instrumentalLoops: number;
  /** Silence added after the last bar so reverb can ring out. */
  tailSeconds: number;
  slots: readonly NameSlot[];
}

const A_MINOR = [220, 261.63, 329.63] as const;
const F_MAJOR = [174.61, 220, 261.63] as const;
const C_MAJOR = [261.63, 329.63, 392] as const;
const G_MAJOR = [196, 246.94, 293.66] as const;

/**
 * Template for the bundled demo loop (scripts/generate-demo-instrumental.js: 90 BPM, four bars of
 * Am, F, C, G). Played twice: the name enters quietly in the first pass and becomes a chant in the
 * second, ending on a long held name.
 */
export const DEMO_TEMPLATE: SongTemplate = {
  id: 'demo-chant',
  title: 'Demo chant',
  isPlaceholder: true,
  bpm: 90,
  beatsPerBar: 4,
  instrumentalLoops: 2,
  tailSeconds: 1.5,
  slots: [
    { startBeat: 4, beats: 2, chordTonesHz: F_MAJOR, gainDb: -4, reverbSend: 0.25 },
    { startBeat: 12, beats: 2, chordTonesHz: G_MAJOR, gainDb: -4, reverbSend: 0.25 },
    { startBeat: 16, beats: 2, chordTonesHz: A_MINOR, gainDb: -2, reverbSend: 0.3 },
    { startBeat: 20, beats: 2, chordTonesHz: F_MAJOR, gainDb: -2, reverbSend: 0.3 },
    { startBeat: 24, beats: 2, chordTonesHz: C_MAJOR, gainDb: -2, reverbSend: 0.3 },
    { startBeat: 28, beats: 4, chordTonesHz: G_MAJOR, gainDb: 0, reverbSend: 0.5 },
  ],
};

/** Language-specific templates will be registered here once real produced songs exist. */
export function templateForLanguage(_languageCode: string): SongTemplate {
  return DEMO_TEMPLATE;
}

export function beatSeconds(template: SongTemplate): number {
  return 60 / template.bpm;
}

export function totalBeats(template: SongTemplate, instrumentalSeconds: number): number {
  return Math.round(instrumentalSeconds / beatSeconds(template)) * template.instrumentalLoops;
}

/** Throws if a slot falls outside the song or overlaps another. */
export function validateTemplate(template: SongTemplate, instrumentalSeconds: number): void {
  const beats = totalBeats(template, instrumentalSeconds);
  let previousEnd = 0;
  for (const slot of [...template.slots].sort((a, b) => a.startBeat - b.startBeat)) {
    if (slot.beats <= 0 || slot.startBeat < 0 || slot.startBeat + slot.beats > beats) {
      throw new PipelineError('invalid_template', 'A name slot is outside the song.');
    }
    if (slot.startBeat < previousEnd) {
      throw new PipelineError('invalid_template', 'Name slots overlap.');
    }
    previousEnd = slot.startBeat + slot.beats;
  }
}
