// The guided recording cue: four count-in clicks, then the last two lines of the song (bars 7 and 8)
// with a soft guide note per syllable of the name in bar 8. It is built at run time from a slice of the
// pre-rendered song plus clicks and sine guide notes, so no cue audio is stored and the take stays
// under the recorder's 10 s cap.
import type { PcmAudio } from '../audio/types';
import { BEATS_PER_BAR, NAME_MELODIES, NAME_SLOT, beatSeconds, midiToHz, type KeyName, KEYS } from './score';

/** Bars of the song included in the cue (1-based, inclusive). */
export const CUE_FROM_BAR = 7;
export const CUE_TO_BAR = 8;
/** Quiet tail after the last bar, in seconds. */
const CUE_TAIL_SECONDS = 1.1;

export interface Cue {
  audio: PcmAudio;
  /** Seconds from the start of the cue to the start and end of the name slot. */
  slotStartSec: number;
  slotEndSec: number;
  /** Seconds before bar 7 begins (the count-in). */
  countInSec: number;
  durationSec: number;
}

function click(sampleRate: number, freq: number): Float32Array {
  const n = Math.round(0.06 * sampleRate);
  const out = new Float32Array(n);
  for (let i = 0; i < n; i += 1) out[i] = Math.sin((2 * Math.PI * freq * i) / sampleRate) * Math.exp(-i / (0.012 * sampleRate));
  return out;
}

/** Clear, soft note: a sine with a quick attack so each note start is audible. */
function guideTone(sampleRate: number, freq: number, seconds: number): Float32Array {
  const n = Math.round(seconds * sampleRate);
  const out = new Float32Array(n);
  for (let i = 0; i < n; i += 1) {
    const t = i / sampleRate;
    const env = Math.min(1, t / 0.012) * Math.min(1, Math.max(0, (seconds - t) / 0.08)) * (0.75 + 0.25 * Math.exp(-t / 0.25));
    out[i] = env * (Math.sin(2 * Math.PI * freq * t) + 0.25 * Math.sin(4 * Math.PI * freq * t));
  }
  return out;
}

function addAt(buffer: Float32Array, startSample: number, signal: Float32Array, gain: number): void {
  const s = Math.round(startSample);
  for (let i = 0; i < signal.length; i += 1) {
    const o = s + i;
    if (o >= 0 && o < buffer.length) buffer[o] += signal[i] * gain;
  }
}

/** Builds the cue from the pre-rendered song for a key and the name's syllable count. */
export function buildCue(song: PcmAudio, key: KeyName, syllables: number): Cue {
  const melody = NAME_MELODIES[syllables];
  if (!melody) throw new Error(`no name melody for ${syllables} syllables`);
  const sr = song.sampleRate;
  const beat = beatSeconds();
  const countIn = 4 * beat;
  const sliceStart = Math.round((CUE_FROM_BAR - 1) * BEATS_PER_BAR * beat * sr);
  const sliceEnd = Math.min(song.samples.length, Math.round(CUE_TO_BAR * BEATS_PER_BAR * beat * sr + CUE_TAIL_SECONDS * sr));
  const body = song.samples.subarray(sliceStart, sliceEnd);
  const out = new Float32Array(Math.round(countIn * sr) + body.length);
  out.set(body, Math.round(countIn * sr));
  for (let k = 0; k < 4; k += 1) addAt(out, k * beat * sr, click(sr, k === 0 ? 1500 : 1000), 0.5);

  const slotStartBeat = NAME_SLOT.startBeat - (CUE_FROM_BAR - 1) * BEATS_PER_BAR;
  let b = slotStartBeat;
  melody.midi.forEach((m, k) => {
    const hz = midiToHz(m + KEYS[key].shift);
    addAt(out, (countIn + b * beat) * sr, guideTone(sr, hz, melody.beats[k] * beat * 0.92), 0.4);
    b += melody.beats[k];
  });

  const slotStartSec = countIn + slotStartBeat * beat;
  return {
    audio: { sampleRate: sr, samples: out },
    slotStartSec,
    slotEndSec: slotStartSec + NAME_SLOT.beats * beat,
    countInSec: countIn,
    durationSec: out.length / sr,
  };
}
