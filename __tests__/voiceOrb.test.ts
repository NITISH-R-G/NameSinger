import * as fs from 'fs';
import * as path from 'path';

import {
  computeEnvelope,
  createPlaybackLevelDriver,
  envelopeAt,
  type Envelope,
} from '../src/audio/envelope';
import {
  ABSOLUTE_FLOOR_DB,
  amplitudeToDb,
  createLevelEmitter,
  createMicMeter,
  int16Rms,
  LevelNormalizer,
  smoothLevel,
} from '../src/audio/levels';
import {
  deriveOrbState,
  ORB_DESCRIPTIONS,
  orbDescription,
  orbMotion,
  type OrbState,
} from '../src/orb/orbState';
import { decodeWav } from '../src/audio/wav';
import type { PcmAudio } from '../src/audio/types';
import type { RecorderPhase } from '../src/types';

const read = (f: string) => fs.readFileSync(path.join(__dirname, '..', f), 'utf8');
const code = (f: string) => read(f).replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');

/** 100 ms of 16-bit audio at 22,050 Hz: a sine at the given peak amplitude (0 to 1). */
function buffer(amplitude: number, ms = 100, rate = 22050): ArrayBuffer {
  const samples = new Int16Array(Math.round((rate * ms) / 1000));
  for (let i = 0; i < samples.length; i += 1) {
    samples[i] = Math.round(amplitude * 32767 * Math.sin((2 * Math.PI * 220 * i) / rate));
  }
  return samples.buffer;
}

describe('microphone level analysis', () => {
  it('measures RMS of real 16-bit samples', () => {
    expect(int16Rms(new Int16Array(100).buffer)).toBe(0);
    const half = int16Rms(buffer(0.5));
    expect(half).toBeGreaterThan(0.34);
    expect(half).toBeLessThan(0.37); // 0.5 / sqrt(2)
    expect(amplitudeToDb(0)).toBeLessThan(-150);
  });

  it('accepts views and ignores a trailing odd byte', () => {
    const samples = new Int16Array([1000, -1000, 1000]);
    expect(int16Rms(samples)).toBeGreaterThan(0);
    expect(int16Rms(new Uint8Array(samples.buffer, 0, 5))).toBeGreaterThan(0);
    expect(int16Rms(new ArrayBuffer(0))).toBe(0);
  });

  it('silence gives exactly zero, and so does steady room noise', () => {
    const normalizer = new LevelNormalizer();
    for (let i = 0; i < 50; i += 1) expect(normalizer.push(-90, 0.1)).toBe(0);
    const noisy = new LevelNormalizer();
    let max = 0;
    for (let i = 0; i < 100; i += 1) max = Math.max(max, noisy.push(-55 + (i % 3), 0.1));
    expect(max).toBe(0);
  });

  it('never reacts below the absolute floor, however quiet the room', () => {
    const normalizer = new LevelNormalizer();
    normalizer.push(-95, 0.1);
    expect(normalizer.push(ABSOLUTE_FLOOR_DB - 3, 0.1)).toBe(0);
  });

  it('reacts to speech above the room, and louder speech reacts more', () => {
    const normalizer = new LevelNormalizer();
    for (let i = 0; i < 10; i += 1) normalizer.push(-60, 0.1); // quiet room
    const soft = normalizer.push(-40, 0.1);
    const loud = normalizer.push(-14, 0.1);
    expect(soft).toBeGreaterThan(0);
    expect(loud).toBeGreaterThan(soft);
    expect(loud).toBeLessThanOrEqual(1);
  });

  it('a quiet speaker and a loud speaker both use the orb range', () => {
    const quiet = new LevelNormalizer();
    for (let i = 0; i < 10; i += 1) quiet.push(-70, 0.1);
    let quietPeak = 0;
    for (let i = 0; i < 6; i += 1) quietPeak = Math.max(quietPeak, quiet.push(-45 + (i % 2) * 3, 0.1));
    const loud = new LevelNormalizer();
    for (let i = 0; i < 10; i += 1) loud.push(-60, 0.1);
    let loudPeak = 0;
    for (let i = 0; i < 6; i += 1) loudPeak = Math.max(loudPeak, loud.push(-12 + (i % 2) * 3, 0.1));
    expect(quietPeak).toBeGreaterThan(0.6);
    expect(loudPeak).toBeGreaterThan(0.6);
  });

  it('smooths sudden changes: rises fast, falls slowly, never overshoots', () => {
    let level = 0;
    level = smoothLevel(level, 1, 0.1);
    expect(level).toBeGreaterThan(0.5); // attack is quick
    expect(level).toBeLessThanOrEqual(1);
    const afterRise = level;
    level = smoothLevel(level, 0, 0.1);
    expect(level).toBeGreaterThan(afterRise * 0.5); // release is slower than attack
    // A single-buffer spike does not reach the full value, and decays over several frames.
    let spike = smoothLevel(0, 1, 0.03);
    expect(spike).toBeLessThan(0.5);
    const falling: number[] = [];
    for (let i = 0; i < 8; i += 1) {
      spike = smoothLevel(spike, 0, 0.1);
      falling.push(spike);
    }
    for (let i = 1; i < falling.length; i += 1) expect(falling[i]).toBeLessThanOrEqual(falling[i - 1]);
    expect(falling[7]).toBeLessThan(falling[0]);
    expect(smoothLevel(0.001, 0, 0.1)).toBe(0);
  });

  it('the emitter publishes changes only, clamps, and unsubscribes', () => {
    const emitter = createLevelEmitter();
    const seen: number[] = [];
    const off = emitter.subscribe((v) => seen.push(v));
    emitter.emit(0.5);
    emitter.emit(0.5);
    emitter.emit(2);
    emitter.emit(-1);
    expect(seen).toEqual([0.5, 1, 0]);
    off();
    emitter.emit(0.3);
    expect(seen).toEqual([0.5, 1, 0]);
    expect(emitter.get()).toBe(0.3);
  });
});

describe('the microphone meter', () => {
  function clock() {
    let t = 1000;
    return { now: () => t, tick: (ms: number) => (t += ms) };
  }

  it('ignores audio until a take is being recorded', () => {
    const c = clock();
    const meter = createMicMeter(c.now);
    const seen: number[] = [];
    meter.source.subscribe((v) => seen.push(v));
    meter.push({ data: buffer(0.6) });
    expect(seen).toEqual([]);
    expect(meter.stats().buffers).toBe(0);
  });

  it('stays at zero for silent input (never fabricates activity)', () => {
    const c = clock();
    const meter = createMicMeter(c.now);
    meter.setActive(true);
    for (let i = 0; i < 30; i += 1) {
      meter.push({ data: new Int16Array(2205).buffer });
      c.tick(100);
    }
    expect(meter.source.get()).toBe(0);
    expect(meter.stats().buffers).toBe(30);
    expect(meter.stats().lastDb).toBeLessThan(-100);
  });

  it('follows real voice levels: silence, soft speech, loud speech, silence', () => {
    const c = clock();
    const meter = createMicMeter(c.now);
    meter.setActive(true);
    const feed = (amp: number, buffers: number) => {
      let last = 0;
      for (let i = 0; i < buffers; i += 1) {
        meter.push({ data: buffer(amp) });
        c.tick(100);
        last = meter.source.get();
      }
      return last;
    };
    const quiet = feed(0.001, 15);
    const soft = feed(0.03, 4);
    const loud = feed(0.5, 4);
    const after = feed(0.001, 12);
    expect(quiet).toBe(0);
    expect(soft).toBeGreaterThan(0.05);
    expect(loud).toBeGreaterThan(soft);
    expect(after).toBeLessThan(loud * 0.3);
  });

  it('drops to zero when recording stops, and stays there', () => {
    const c = clock();
    const meter = createMicMeter(c.now);
    meter.setActive(true);
    for (let i = 0; i < 8; i += 1) {
      meter.push({ data: buffer(i < 3 ? 0.001 : 0.5) });
      c.tick(100);
    }
    expect(meter.source.get()).toBeGreaterThan(0);
    meter.setActive(false);
    expect(meter.source.get()).toBe(0);
    meter.push({ data: buffer(0.9) });
    expect(meter.source.get()).toBe(0);
  });
});

/** A song whose loudness changes on a known schedule: a burst from 1.0 s to 1.2 s, quiet elsewhere. */
function burstSong(rate: number, seconds = 3): PcmAudio {
  const samples = new Float32Array(Math.round(rate * seconds));
  for (let i = 0; i < samples.length; i += 1) {
    const t = i / rate;
    const loud = t >= 1.0 && t < 1.2;
    samples[i] = (loud ? 0.6 : 0.02) * Math.sin(2 * Math.PI * 330 * t);
  }
  return { sampleRate: rate, samples };
}

describe('the amplitude envelope of the generated song', () => {
  it('follows the loud and quiet parts at the right times', () => {
    const env = computeEnvelope(burstSong(22050));
    expect(envelopeAt(env, 0.5)).toBeLessThan(0.15);
    expect(envelopeAt(env, 1.1)).toBeGreaterThan(0.85);
    expect(envelopeAt(env, 2.0)).toBeLessThan(0.15);
  });

  it('accounts for the sample rate: the same song gives the same envelope at 22,050 and 44,100 Hz', () => {
    const a = computeEnvelope(burstSong(22050));
    const b = computeEnvelope(burstSong(44100));
    expect(a.durationSeconds).toBeCloseTo(b.durationSeconds, 2);
    for (const t of [0.3, 0.9, 1.1, 1.3, 2.4]) expect(envelopeAt(a, t)).toBeCloseTo(envelopeAt(b, t), 1);
  });

  it('interpolates between values and is zero outside the song', () => {
    const env: Envelope = { hop: 0.5, values: Float32Array.from([0, 1, 0]), durationSeconds: 1 };
    expect(envelopeAt(env, 0.25)).toBeCloseTo(0.5, 5);
    expect(envelopeAt(env, 0.5)).toBeCloseTo(1, 5);
    expect(envelopeAt(env, -0.1)).toBe(0);
    expect(envelopeAt(env, 5)).toBe(0);
    expect(envelopeAt(env, Number.NaN)).toBe(0);
  });

  it('keeps its dynamics when the file ends in digital silence (the real generated songs do)', () => {
    const rate = 22050;
    const song = burstSong(rate, 3);
    const padded = new Float32Array(song.samples.length + rate * 2); // two seconds of exact zeros after
    padded.set(song.samples);
    const env = computeEnvelope({ sampleRate: rate, samples: padded });
    expect(envelopeAt(env, 0.5)).toBeLessThan(0.2);
    expect(envelopeAt(env, 1.1)).toBeGreaterThan(0.85);
    expect(envelopeAt(env, 4.0)).toBe(0); // the silent tail itself is zero
  });

  it('gives the real generated sample song visible dynamics, not a flat line', () => {
    const wav = fs.readFileSync(path.join(__dirname, '..', 'assets', 'audio', 'sample-song.wav'));
    const song = decodeWav(new Uint8Array(wav));
    const env = computeEnvelope(song);
    const body = Array.from(env.values).slice(0, Math.floor(env.values.length * 0.9));
    const mean = body.reduce((a, b) => a + b, 0) / body.length;
    const spread = Math.sqrt(body.reduce((a, b) => a + (b - mean) ** 2, 0) / body.length);
    expect(spread).toBeGreaterThan(0.15); // it was about 0.03 when digital silence set the reference
    expect(Math.max(...body)).toBeGreaterThan(0.9);
    expect(Math.min(...body)).toBeLessThan(0.3);
  });

  it('does not blow up a song with almost no dynamics, and handles silence and empty audio', () => {
    const flat = computeEnvelope({ sampleRate: 22050, samples: new Float32Array(22050).fill(0.2) });
    const values = Array.from(flat.values);
    expect(Math.max(...values) - Math.min(...values)).toBeLessThan(0.2);
    const silent = computeEnvelope({ sampleRate: 22050, samples: new Float32Array(22050) });
    expect(Math.max(...Array.from(silent.values))).toBe(0);
    expect(computeEnvelope({ sampleRate: 22050, samples: new Float32Array(0) }).values.length).toBe(0);
  });
});

/** A controllable animation-frame scheduler and clock. */
function fakeFrames() {
  let now = 0;
  let nextHandle = 1;
  const pending = new Map<number, () => void>();
  return {
    now: () => now,
    schedule: (cb: () => void) => {
      const h = nextHandle++;
      pending.set(h, cb);
      return h;
    },
    cancel: (h: number) => {
      pending.delete(h);
    },
    /** Advances one frame of `ms` and runs whatever was scheduled. */
    frame(ms = 16) {
      now += ms;
      const callbacks = [...pending.values()];
      pending.clear();
      for (const cb of callbacks) cb();
    },
    pendingCount: () => pending.size,
  };
}

describe('playback synchronisation with the real player position', () => {
  const env = computeEnvelope(burstSong(22050));

  function setup(position: { t: number }, envelope: Envelope | null = env) {
    const frames = fakeFrames();
    const driver = createPlaybackLevelDriver({
      envelope: () => envelope,
      position: () => position.t,
      schedule: frames.schedule,
      cancel: frames.cancel,
      now: frames.now,
    });
    const seen: number[] = [];
    driver.source.subscribe((v) => seen.push(v));
    const run = (seconds: number) => {
      for (let i = 0; i < Math.round((seconds * 1000) / 16); i += 1) {
        frames.frame(16);
        position.t += 0.016;
      }
    };
    return { driver, frames, seen, run };
  }

  it('shows the song loudness at the position the player reports', () => {
    const position = { t: 0.2 };
    const { driver, run } = setup(position);
    driver.start();
    run(0.3); // position is about 0.5, the quiet part
    expect(driver.source.get()).toBeLessThan(0.2);
    position.t = 1.02;
    run(0.1); // inside the burst (1.0 to 1.2 s)
    expect(driver.source.get()).toBeGreaterThan(0.7);
    position.t = 2.0;
    run(0.4);
    expect(driver.source.get()).toBeLessThan(0.2);
  });

  it('follows seeks: it reads the position at every frame, it does not keep its own clock', () => {
    const position = { t: 0 };
    const { driver, run } = setup(position);
    driver.start();
    position.t = 1.02;
    run(0.1);
    const inBurst = driver.source.get();
    position.t = 0.1; // the user stopped and restarted from the beginning
    run(0.5);
    expect(inBurst).toBeGreaterThan(0.5);
    expect(driver.source.get()).toBeLessThan(inBurst * 0.5);
  });

  it('pause or stop drops the reaction to zero at once and stops scheduling frames', () => {
    const position = { t: 1.02 };
    const { driver, frames, seen, run } = setup(position);
    driver.start();
    run(0.1);
    expect(driver.source.get()).toBeGreaterThan(0.5);
    driver.stop();
    expect(driver.source.get()).toBe(0);
    expect(seen[seen.length - 1]).toBe(0);
    expect(frames.pendingCount()).toBe(0);
    expect(driver.isRunning()).toBe(false);
    const emitted = seen.length;
    frames.frame();
    frames.frame();
    expect(seen.length).toBe(emitted); // no more updates after stop
  });

  it('resuming after a pause works again, from the position where it was', () => {
    const position = { t: 1.1 };
    const { driver, run } = setup(position);
    driver.start();
    run(0.1);
    driver.stop();
    expect(driver.source.get()).toBe(0);
    driver.start();
    run(0.1);
    expect(driver.source.get()).toBeGreaterThan(0);
  });

  it('starting twice does not double the frames', () => {
    const position = { t: 0 };
    const { driver, frames } = setup(position);
    driver.start();
    driver.start();
    expect(frames.pendingCount()).toBe(1);
  });

  it('is throttled (about 30 updates a second at most)', () => {
    const position = { t: 1.1 };
    const { driver, seen, run } = setup(position);
    driver.start();
    run(1);
    expect(seen.length).toBeLessThanOrEqual(34);
    expect(seen.length).toBeGreaterThan(5);
  });

  it('with no envelope (analysis not ready or failed) the level stays zero; nothing is invented', () => {
    const position = { t: 1.1 };
    const { driver, run } = setup(position, null);
    driver.start();
    run(0.5);
    expect(driver.source.get()).toBe(0);
  });
});

describe('recording, speech and playback are independent sources', () => {
  const convo = read('src/conversation/useConversation.ts');
  const playbackHook = code('src/hooks/useSongPlayback.ts');
  const recorderHook = code('src/hooks/useNameRecorder.ts');

  it('picks the orb source by what is actually happening: playback, assistant speech or the microphone', () => {
    expect(convo).toMatch(/let orbLevel: LevelSource = meter\.source;/);
    expect(convo).toMatch(/if \(orbState === 'playing'\) orbLevel = songPlayback\.phase === 'playing' \? songPlayback\.level : takePlayback\.level;/);
    expect(convo).toMatch(/else if \(orbState === 'speaking'\) orbLevel = speech\.level;/);
  });

  it('playback analysis never touches the microphone', () => {
    expect(playbackHook).not.toMatch(/useAudioStream|requestRecording|getRecording|createMicMeter|useAudioRecorder|AudioStream|useAudioSampleListener|setAudioSamplingEnabled/);
    expect(playbackHook).toContain('player.currentTime');
    expect(playbackHook).toContain('computeEnvelope');
  });

  it('the microphone meter is fed only by the recording stream, never by the player or the speech engine', () => {
    expect(recorderHook).toContain('onBuffer: (buffer) => meter?.push(buffer)');
    expect(recorderHook).not.toMatch(/useAudioPlayer|currentTime|envelope|expo-speech/);
    expect(code('src/audio/levels.ts')).not.toMatch(/expo-audio|expo-speech|currentTime|envelope/);
    expect(code('src/audio/envelope.ts')).not.toMatch(/expo-audio|useAudioStream|createMicMeter/);
    expect(code('src/speech/assistantSpeech.ts')).not.toMatch(/expo-audio|createMicMeter|useAudioStream/);
  });

  it('the meter measures only while a take is really being recorded, and is switched off after', () => {
    expect(recorderHook).toContain("meter?.setActive(state.phase === 'recording')");
    expect(recorderHook).toContain('return () => meter?.setActive(false)');
  });

  it('does not use expo-audio sampling, which needs the microphone permission on Android', () => {
    for (const f of ['src/hooks/useSongPlayback.ts', 'src/conversation/useConversation.ts', 'src/components/ConversationScreen.tsx']) {
      expect(code(f)).not.toMatch(/useAudioSampleListener|setAudioSamplingEnabled/);
    }
  });
});

describe('orb states', () => {
  type OrbInput = Parameters<typeof deriveOrbState>[0];
  const none: OrbInput = { speaking: false, recorderPhase: 'idle', songPhase: 'idle', playback: 'none' };

  it('rests in idle on entry, before anything is asked of the user', () => {
    expect(deriveOrbState(none)).toBe('idle');
  });

  it('listens only while a take is recording, and works while the take is started or checked', () => {
    expect(deriveOrbState({ ...none, recorderPhase: 'recording' })).toBe('listening');
    for (const phase of ['requesting-permission', 'stopping'] as RecorderPhase[]) {
      expect(deriveOrbState({ ...none, recorderPhase: phase })).toBe('processing');
    }
  });

  it('speaks only when the speech engine says it is speaking, and never while the microphone is open', () => {
    expect(deriveOrbState({ ...none, speaking: true })).toBe('speaking');
    expect(deriveOrbState({ ...none, speaking: true, recorderPhase: 'recording' })).toBe('listening');
  });

  it('walks through a whole conversation: idle, listening, processing, idle, generating, playing, paused', () => {
    const steps: [Partial<OrbInput>, OrbState][] = [
      [{}, 'idle'],
      [{ speaking: true }, 'speaking'],
      [{ recorderPhase: 'recording' }, 'listening'],
      [{ recorderPhase: 'stopping' }, 'processing'],
      [{ recorderPhase: 'recorded' }, 'idle'],
      [{ recorderPhase: 'approved', songPhase: 'generating' }, 'generating'],
      [{ recorderPhase: 'approved', songPhase: 'ready', playback: 'stopped' }, 'idle'],
      [{ recorderPhase: 'approved', songPhase: 'ready', playback: 'playing' }, 'playing'],
      [{ recorderPhase: 'approved', songPhase: 'ready', playback: 'paused' }, 'paused'],
    ];
    for (const [input, expected] of steps) expect(deriveOrbState({ ...none, ...input })).toBe(expected);
  });

  it('shows the error state for refused takes, permission problems and generation failure', () => {
    for (const phase of ['error', 'permission-denied', 'permission-blocked', 'unusable'] as RecorderPhase[]) {
      expect(deriveOrbState({ ...none, recorderPhase: phase })).toBe('error');
    }
    expect(deriveOrbState({ ...none, songPhase: 'error' })).toBe('error');
  });

  it('a stopped song never makes the orb react as if playing', () => {
    expect(deriveOrbState({ ...none, songPhase: 'ready', playback: 'stopped' })).not.toBe('playing');
  });

  it('has a fixed, non-animated description for every state', () => {
    const states = Object.keys(ORB_DESCRIPTIONS) as OrbState[];
    expect([...states].sort()).toEqual(['error', 'generating', 'idle', 'listening', 'paused', 'playing', 'processing', 'speaking']);
    expect(new Set(states.map(orbDescription)).size).toBe(states.length);
    for (const state of states) expect(orbDescription(state)).not.toMatch(/\d/); // never a level
  });

  it('reacts to a level only where real audio exists: listening, speaking (word events) and playing', () => {
    const states = Object.keys(ORB_DESCRIPTIONS) as OrbState[];
    const reactive = states.filter((s) => orbMotion(s, false).levelGain >= 0.1);
    expect([...reactive].sort()).toEqual(['listening', 'playing', 'speaking']);
    for (const s of ['processing', 'generating', 'paused', 'error'] as OrbState[]) {
      expect(orbMotion(s, false).levelGain).toBe(0);
    }
    // Processing and generating move with a state-based breath, never with a level.
    expect(orbMotion('generating', false).breathe).toBeGreaterThan(0);
    expect(orbMotion('processing', false).breathe).toBeGreaterThan(0);
  });

  it('has a low-level idle animation when the user is silent', () => {
    const idle = orbMotion('idle', false);
    expect(idle.ambient).toBe(true);
    expect(idle.breathe).toBeGreaterThan(0);
    expect(idle.breathe).toBeLessThan(0.03);
  });

  it('reduced motion removes the flow and keeps any reaction tiny', () => {
    for (const state of Object.keys(ORB_DESCRIPTIONS) as OrbState[]) {
      const motion = orbMotion(state, true);
      expect(motion.ambient).toBe(false);
      expect(motion.breathe).toBe(0);
      expect(motion.levelGain).toBeLessThanOrEqual(0.04);
      expect(motion.contour).toBe(0);
    }
  });
});

describe('orb rendering and animation cleanup', () => {
  const orb = read('src/components/VoiceOrb.tsx');

  it('uses the native driver for every animation, and no new animation library', () => {
    const drivers = orb.match(/useNativeDriver: (true|false)/g) ?? [];
    expect(drivers.length).toBeGreaterThanOrEqual(6);
    expect(orb).not.toMatch(/useNativeDriver: false/);
    expect(orb).not.toMatch(/react-native-reanimated|react-native-worklets|skia|lottie/);
    const pkg = JSON.parse(read('package.json')) as { dependencies: Record<string, string> };
    expect(Object.keys(pkg.dependencies)).not.toContain('react-native-reanimated');
    expect(Object.keys(pkg.dependencies)).not.toContain('@shopify/react-native-skia');
  });

  it('does not re-render React for every audio update', () => {
    const subscribe = orb.slice(orb.indexOf('level.subscribe('), orb.indexOf('return () => {', orb.indexOf('level.subscribe(')));
    expect(subscribe).toContain('Animated.timing(levelValue');
    expect(subscribe).not.toMatch(/setState|set[A-Z][A-Za-z]*\(/);
    // the meter and playback driver deliver to listeners, not to React state
    expect(code('src/audio/levels.ts')).not.toMatch(/react/i);
  });

  it('stops every loop, the subscription and in-flight animations when it unmounts or pauses', () => {
    expect(orb).toContain('for (const loop of loops) loop.stop();');
    expect(orb).toContain('return () => loop.stop();');
    expect(orb).toContain('unsubscribe();');
    expect(orb).toContain('levelValue.stopAnimation();');
    expect(orb).toContain('return () => transition.stop();');
  });

  it('runs its flow only in the foreground and when motion is allowed', () => {
    expect(orb).toContain('useAppActive()');
    expect(orb).toContain('useReducedMotion()');
    expect(orb).toContain('const running = appActive && motion.ambient;');
    expect(orb).toMatch(/if \(!running\) return undefined;/);
  });

  it('keeps the orb circular and draws it with gradients, not a flat circle or a static image', () => {
    expect(orb).toContain('borderRadius: size / 2');
    expect(orb).toContain('RadialGradient');
    expect(orb).toContain('LinearGradient');
    expect(orb).not.toMatch(/<Image\b|ActivityIndicator|require\(/);
    const clouds = read('src/orb/palette.ts').match(/id: '/g) ?? [];
    expect(clouds.length).toBeGreaterThanOrEqual(5);
  });

  it('is hidden from accessibility as an image with a fixed description, not a level', () => {
    expect(orb).toContain('accessibilityRole="image"');
    expect(orb).toContain('accessibilityLabel={orbDescription(state)}');
  });

  it('the playback driver and the app lifecycle: no per-frame work in the background', () => {
    const hook = code('src/hooks/useSongPlayback.ts');
    expect(hook).toContain('if (status.playing && appActive) driver.start();');
    expect(hook).toContain('else driver.stop();');
    expect(hook).toContain('return () => driver.stop();');
  });
});


describe('the orb is the interface', () => {
  const surface = read('src/components/OrbSurface.tsx');
  const screen = read('src/components/ConversationScreen.tsx');

  it('is a labelled button whose spoken label states the state and what a tap does', () => {
    expect(surface).toContain('accessibilityRole="button"');
    expect(surface).toContain('accessibilityLabel={`${orbDescription(state)} ${caption}`}');
    expect(surface).not.toMatch(/announceForAccessibility|amplitude/);
  });

  it('is the only microphone control: no round record button, no recorder card', () => {
    for (const f of ['ConversationScreen', 'Transcript', 'Composer', 'SettingsSheet', 'OpeningScreen']) {
      expect(read(`src/components/${f}.tsx`)).not.toMatch(/icon="mic"|Record my name|Stop recording/);
    }
    expect(screen).toContain('conv.tapOrb');
  });

  it('keeps the round buttons at least 48 dp and labelled', () => {
    const button = read('src/components/ActionButton.tsx');
    expect(button).toContain('export const ICON_BUTTON_SIZE = 56;');
    expect(button).toContain('Math.max(minTouchTarget, size)');
    expect(button).toMatch(/export function IconButton[\s\S]*buttonA11y\(\{ label, disabled: inactive, busy: loading/);
  });

  it('adds no dependency other than text-to-speech and the blur view, and no animation library', () => {
    const pkg = JSON.parse(read('package.json')) as { dependencies: Record<string, string> };
    expect(Object.keys(pkg.dependencies)).toContain('expo-speech');
    expect(Object.keys(pkg.dependencies)).toContain('expo-blur');
    expect(Object.keys(pkg.dependencies)).toHaveLength(19);
    for (const name of ['react-native-reanimated', '@shopify/react-native-skia', 'lottie-react-native', 'react-native-tts']) {
      expect(Object.keys(pkg.dependencies)).not.toContain(name);
    }
  });

  it('leaves the audio pipeline and thresholds alone', () => {
    expect(code('src/audio/recordingQuality.ts')).toContain('minThresholdDb: -62');
    expect(read('src/audio/renderSong.ts')).not.toMatch(/levels|envelope|orb|speech/i);
  });
});
