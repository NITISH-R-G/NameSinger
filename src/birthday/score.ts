// The original birthday song's structure, as data, for the in-app experiment. Ported from
// research/singing-engine/birthday-experiment/score.mts (the song audio itself is pre-rendered into
// assets/audio/birthday/ by export-assets.mts; only the timing and name-slot notes are needed here).
//
// 4/4 at 92 BPM, 12 bars. Bar 8 is the name slot: a C chord, 4 beats, no lead instrument. The guide
// plays one soft note per syllable so the name rises through the chord and ends on a held note.

export const BPM = 92;
export const BEATS_PER_BAR = 4;
export const BAR_COUNT = 12;

export const NAME_SLOT = { startBar: 8, startBeat: 7 * BEATS_PER_BAR, beats: 4 } as const;

/** Melody of the name for 1 to 5 syllables: one MIDI note per syllable (in C), lengths in beats. */
export const NAME_MELODIES: Record<number, { midi: readonly number[]; beats: readonly number[] }> = {
  1: { midi: [67], beats: [3.5] },
  2: { midi: [64, 67], beats: [1, 2.5] },
  3: { midi: [64, 67, 72], beats: [1, 1, 1.5] },
  4: { midi: [64, 67, 69, 72], beats: [0.75, 0.75, 0.75, 1.25] },
  5: { midi: [64, 67, 69, 67, 72], beats: [0.5, 0.5, 0.5, 0.5, 1.5] },
};

export const MIN_SYLLABLES = 1;
export const MAX_SYLLABLES = 5;

/** Three keys, in semitones from C, so the singer can pick a comfortable range. */
export const KEYS = {
  low: { shift: -5, title: 'Lower', hint: 'Deeper voices, or if the middle one feels too high' },
  mid: { shift: 0, title: 'Middle', hint: 'A good start for most voices' },
  high: { shift: 5, title: 'Higher', hint: 'Lighter voices, or if the middle one feels too low' },
} as const;
export type KeyName = keyof typeof KEYS;
export const KEY_NAMES: readonly KeyName[] = ['low', 'mid', 'high'];

export const midiToHz = (midi: number): number => 440 * Math.pow(2, (midi - 69) / 12);
export const beatSeconds = (): number => 60 / BPM;
export const barSeconds = (): number => BEATS_PER_BAR * beatSeconds();

/** Start time, in seconds from the start of the full song, of each note of the name. */
export function nameNoteStarts(syllables: number): number[] {
  const melody = NAME_MELODIES[syllables];
  if (!melody) throw new Error(`no name melody for ${syllables} syllables`);
  const starts: number[] = [];
  let beat = NAME_SLOT.startBeat;
  for (const length of melody.beats) {
    starts.push(beat * beatSeconds());
    beat += length;
  }
  return starts;
}

/** Target Hz for each syllable's note in a key. */
export function nameTargetsHz(syllables: number, key: KeyName): number[] {
  const melody = NAME_MELODIES[syllables];
  if (!melody) throw new Error(`no name melody for ${syllables} syllables`);
  return melody.midi.map((m) => midiToHz(m + KEYS[key].shift));
}

/** Where the name slot sits in the full song, in seconds. */
export function slotWindowSeconds(): { start: number; end: number } {
  const start = NAME_SLOT.startBeat * beatSeconds();
  return { start, end: start + NAME_SLOT.beats * beatSeconds() };
}

/**
 * A rough syllable count to start from, counting groups of vowels in the name. It is only a
 * suggestion: names are irregular, so the person always confirms or changes it.
 */
export function suggestSyllables(name: string): number {
  const word = name.toLowerCase().replace(/[^a-z]/g, '');
  if (word.length === 0) return 2;
  const groups = word.match(/[aeiouy]+/g)?.length ?? 1;
  let count = groups;
  // A silent final "e" (Jane, Kate) does not add a syllable; "-le" (Gabriele) and "ee" endings do.
  if (/[^aeiouy]e$/.test(word) && !/(le|ee)$/.test(word) && count > 1) count -= 1;
  // A final "-ia" or "-io" after a consonant is two sounds (Ma-ri-a, Ma-ri-o), not one.
  if (/[^aeiou](ia|io)$/.test(word) && !/(tio|sio|cio)$/.test(word)) count += 1;
  return Math.max(MIN_SYLLABLES, Math.min(MAX_SYLLABLES, count));
}
