/**
 * Live level analysis for the voice orb. Pure functions and a small meter, with no React and no
 * native modules, so every behaviour (silence, speech, smoothing) is unit-tested.
 *
 * Nothing here invents activity: a level above zero is only ever produced from audio samples the
 * microphone actually delivered. Silence produces exactly 0.
 */

const EPSILON = 1e-9;
/** Below this level (dBFS) a buffer is treated as silence whatever the room noise is. */
export const ABSOLUTE_FLOOR_DB = -66;

export function amplitudeToDb(amplitude: number): number {
  return 20 * Math.log10(Math.max(amplitude, EPSILON));
}

/** RMS of 16-bit PCM as a fraction of full scale (0 to 1). Accepts an ArrayBuffer or a view. */
export function int16Rms(data: ArrayBuffer | ArrayBufferView): number {
  let samples: Int16Array;
  if (ArrayBuffer.isView(data)) {
    const length = Math.floor(data.byteLength / 2);
    samples = new Int16Array(data.buffer, data.byteOffset, length);
  } else {
    samples = new Int16Array(data, 0, Math.floor(data.byteLength / 2));
  }
  if (samples.length === 0) return 0;
  let sum = 0;
  for (let i = 0; i < samples.length; i += 1) {
    const value = samples[i] / 32768;
    sum += value * value;
  }
  return Math.sqrt(sum / samples.length);
}

export interface LevelNormalizerOptions {
  /** Smallest dynamic range assumed between noise and speech, in dB. */
  minSpanDb?: number;
  /** A signal must be this far above the tracked noise floor to count at all. */
  gateDb?: number;
}

/**
 * Turns dBFS readings into a 0 to 1 level relative to the room. It tracks a noise floor (follows
 * quieter readings at once, rises very slowly) and a ceiling (follows louder readings at once,
 * decays slowly), so a quiet speaker and a loud speaker both use the orb's full range while steady
 * room noise stays at 0.
 */
export class LevelNormalizer {
  private floorDb: number | null = null;
  private ceilingDb = 0;
  private readonly minSpanDb: number;
  private readonly gateDb: number;

  constructor(options: LevelNormalizerOptions = {}) {
    this.minSpanDb = options.minSpanDb ?? 24;
    this.gateDb = options.gateDb ?? 6;
  }

  reset(): void {
    this.floorDb = null;
    this.ceilingDb = 0;
  }

  push(db: number, dtSeconds: number): number {
    const dt = Math.min(Math.max(dtSeconds, 0), 0.5);
    if (this.floorDb === null) {
      this.floorDb = db;
      this.ceilingDb = db + this.minSpanDb;
    }
    if (db < this.floorDb) this.floorDb = db;
    else this.floorDb += (db - this.floorDb) * Math.min(1, dt * 0.05);

    const minCeiling = this.floorDb + this.gateDb + this.minSpanDb;
    if (db > this.ceilingDb) this.ceilingDb = db;
    else this.ceilingDb = Math.max(minCeiling, this.ceilingDb - dt * 1.0);

    if (db < ABSOLUTE_FLOOR_DB) return 0;
    const low = this.floorDb + this.gateDb;
    if (db <= low) return 0;
    const span = Math.max(this.ceilingDb - low, EPSILON);
    return Math.min(1, ((db - low) / span) ** 0.8);
  }
}

/**
 * Smooths a level so sudden jumps do not make the orb jitter: it rises quickly and falls slowly
 * (exponential smoothing with separate attack and release time constants, in seconds).
 */
export function smoothLevel(
  previous: number,
  target: number,
  dtSeconds: number,
  attackSeconds = 0.06,
  releaseSeconds = 0.28,
): number {
  const dt = Math.min(Math.max(dtSeconds, 0), 0.5);
  const tau = target > previous ? attackSeconds : releaseSeconds;
  const amount = 1 - Math.exp(-dt / Math.max(tau, EPSILON));
  const next = previous + (target - previous) * amount;
  return next < 0.002 ? 0 : Math.min(1, next);
}

/** Something that publishes a level between 0 and 1. The orb subscribes; it never polls. */
export interface LevelSource {
  get: () => number;
  subscribe: (listener: (level: number) => void) => () => void;
}

export interface LevelEmitter extends LevelSource {
  emit: (level: number) => void;
}

export function createLevelEmitter(): LevelEmitter {
  let level = 0;
  const listeners = new Set<(level: number) => void>();
  return {
    get: () => level,
    subscribe(listener) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    emit(next) {
      const clamped = Math.min(1, Math.max(0, next));
      if (clamped === level) return;
      level = clamped;
      for (const listener of [...listeners]) listener(level);
    },
  };
}

export interface MicMeter {
  /** What the orb listens to while recording. */
  source: LevelSource;
  /** Feeds one buffer from the native audio stream. Ignored unless the meter is active. */
  push: (buffer: { data: ArrayBuffer | ArrayBufferView }) => void;
  /** Active only while a take is being recorded. Turning it off drops the level to 0. */
  setActive: (active: boolean) => void;
  /** Buffers analysed since the meter was created (for diagnostics and tests). */
  stats: () => { buffers: number; lastDb: number };
}

/**
 * The microphone meter: audio buffers in, a smoothed 0 to 1 level out. Independent of playback.
 */
export function createMicMeter(now: () => number = () => Date.now()): MicMeter {
  const emitter = createLevelEmitter();
  const normalizer = new LevelNormalizer();
  let active = false;
  let lastTime = 0;
  let smoothed = 0;
  let buffers = 0;
  let lastDb = -90;

  return {
    source: emitter,
    push(buffer) {
      if (!active) return;
      const time = now();
      const dt = lastTime === 0 ? 0.1 : (time - lastTime) / 1000;
      lastTime = time;
      lastDb = amplitudeToDb(int16Rms(buffer.data));
      buffers += 1;
      const target = normalizer.push(lastDb, dt);
      smoothed = smoothLevel(smoothed, target, dt);
      emitter.emit(smoothed);
    },
    setActive(next) {
      if (next === active) return;
      active = next;
      normalizer.reset();
      smoothed = 0;
      lastTime = 0;
      emitter.emit(0);
    },
    stats: () => ({ buffers, lastDb }),
  };
}
