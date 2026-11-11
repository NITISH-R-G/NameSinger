import { amplitudeToDb, createLevelEmitter, smoothLevel, type LevelEmitter } from './levels';
import { durationSeconds, type PcmAudio } from './types';

/**
 * Amplitude envelope of a finished song, so the orb can follow playback without any microphone or
 * playback-metering API. The generated WAV is analysed once; during playback the current position
 * (from the player) is looked up in it.
 */
export interface Envelope {
  /** Seconds between values. */
  hop: number;
  /** One 0 to 1 value per hop. */
  values: Float32Array;
  durationSeconds: number;
}

export const ENVELOPE_HOP_SECONDS = 0.02;
const WINDOW_SECONDS = 0.04;
/** Frames quieter than this (dBFS) are silence, not part of the song's dynamics. */
const SILENCE_DB = -70;

/**
 * RMS per window, converted to dB and stretched between the song's own quiet and loud parts (5th
 * and 98th percentile of the non-silent frames), so the orb shows relative loudness over time.
 * A song with almost no dynamics is widened around its average instead of being blown up.
 */
export function computeEnvelope(audio: PcmAudio, hop = ENVELOPE_HOP_SECONDS): Envelope {
  const { samples, sampleRate } = audio;
  const hopSamples = Math.max(1, Math.round(hop * sampleRate));
  const windowSamples = Math.max(hopSamples, Math.round(WINDOW_SECONDS * sampleRate));
  const frames = Math.max(0, Math.ceil(samples.length / hopSamples));
  const db = new Float32Array(frames);
  for (let f = 0; f < frames; f += 1) {
    const start = f * hopSamples;
    const end = Math.min(samples.length, start + windowSamples);
    let sum = 0;
    for (let i = start; i < end; i += 1) sum += samples[i] * samples[i];
    db[f] = amplitudeToDb(end > start ? Math.sqrt(sum / (end - start)) : 0);
  }

  const values = new Float32Array(frames);
  if (frames === 0) return { hop, values, durationSeconds: 0 };
  // The quiet and loud references come from frames that actually contain sound. A song that ends
  // in digital silence would otherwise set "quiet" to -180 dB and flatten the whole song to 1.
  const audible = Float32Array.from(db.filter((value) => value > SILENCE_DB)).sort();
  const sorted = audible.length >= 10 ? audible : Float32Array.from(db).sort();
  const at = (p: number) => sorted[Math.min(sorted.length - 1, Math.floor(p * (sorted.length - 1)))];
  let low = at(0.05);
  let high = at(0.98);
  if (high - low < 6) {
    const middle = (high + low) / 2;
    low = middle - 3;
    high = middle + 3;
  }
  for (let f = 0; f < frames; f += 1) {
    values[f] = db[f] < SILENCE_DB ? 0 : Math.min(1, Math.max(0, (db[f] - low) / (high - low)));
  }
  return { hop, values, durationSeconds: durationSeconds(audio) };
}

/** The envelope value at a playback position, linearly interpolated. 0 outside the song. */
export function envelopeAt(envelope: Envelope, seconds: number): number {
  if (!(seconds >= 0) || seconds > envelope.durationSeconds || envelope.values.length === 0) return 0;
  const position = seconds / envelope.hop;
  const index = Math.floor(position);
  const fraction = position - index;
  const a = envelope.values[Math.min(index, envelope.values.length - 1)];
  const b = envelope.values[Math.min(index + 1, envelope.values.length - 1)];
  return a + (b - a) * fraction;
}

export interface PlaybackLevelDriver {
  source: LevelEmitter;
  /** Starts following the player's position. Safe to call twice. */
  start: () => void;
  /** Stops following and drops the level to 0 at once (pause, stop, finish, background). */
  stop: () => void;
  isRunning: () => boolean;
}

export interface PlaybackLevelDriverPorts {
  envelope: () => Envelope | null;
  /** The player's current position in seconds. Read at every frame, not cached. */
  position: () => number;
  /** Schedules the next frame (requestAnimationFrame in the app). */
  schedule: (callback: () => void) => number;
  cancel: (handle: number) => void;
  /** Milliseconds, monotonic. */
  now: () => number;
  /** Do not emit faster than this (ms). 33 is about 30 Hz. */
  minIntervalMs?: number;
}

/**
 * Follows the playing song: at each frame it reads the player's actual position and looks up the
 * song's envelope there. With no envelope (analysis failed or not ready) the level stays at 0; it
 * never substitutes microphone input or random motion.
 */
export function createPlaybackLevelDriver(ports: PlaybackLevelDriverPorts): PlaybackLevelDriver {
  const source = createLevelEmitter();
  const minInterval = ports.minIntervalMs ?? 33;
  let handle: number | null = null;
  let running = false;
  let lastEmit = 0;
  let smoothed = 0;

  function frame(): void {
    handle = null;
    if (!running) return;
    const time = ports.now();
    if (time - lastEmit >= minInterval) {
      const dt = lastEmit === 0 ? minInterval / 1000 : (time - lastEmit) / 1000;
      lastEmit = time;
      const envelope = ports.envelope();
      const target = envelope === null ? 0 : envelopeAt(envelope, ports.position());
      smoothed = smoothLevel(smoothed, target, dt, 0.03, 0.12);
      source.emit(smoothed);
    }
    handle = ports.schedule(frame);
  }

  return {
    source,
    start() {
      if (running) return;
      running = true;
      lastEmit = 0;
      handle = ports.schedule(frame);
    },
    stop() {
      running = false;
      if (handle !== null) ports.cancel(handle);
      handle = null;
      smoothed = 0;
      source.emit(0);
    },
    isRunning: () => running,
  };
}
