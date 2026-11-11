import type { RecorderPhase } from '../types';

/** Everything the orb can express. Rendering reads only this and a level source. */
export type OrbState =
  | 'idle'
  | 'listening'
  | 'speaking'
  | 'processing'
  | 'generating'
  | 'playing'
  | 'paused'
  | 'error';

export type SongPhaseName = 'idle' | 'generating' | 'ready' | 'error';
export type PlaybackPhase = 'none' | 'stopped' | 'playing' | 'paused';

export interface OrbInputs {
  /** The assistant is speaking aloud right now (from the speech engine's own start and end events). */
  speaking: boolean;
  recorderPhase: RecorderPhase;
  songPhase: SongPhaseName;
  /** Playback of whatever is playing: the generated song or the recorded take. */
  playback: PlaybackPhase;
}

/**
 * One place that decides the orb's state from the speech engine, the recorder, the song generator
 * and the player. Whatever the user is doing right now wins over background states.
 */
export function deriveOrbState({ speaking, recorderPhase, songPhase, playback }: OrbInputs): OrbState {
  if (recorderPhase === 'recording') return 'listening';
  if (recorderPhase === 'requesting-permission' || recorderPhase === 'stopping') return 'processing';
  if (playback === 'playing') return 'playing';
  if (playback === 'paused') return 'paused';
  if (speaking) return 'speaking';
  if (songPhase === 'generating') return 'generating';
  if (
    songPhase === 'error' ||
    recorderPhase === 'error' ||
    recorderPhase === 'permission-denied' ||
    recorderPhase === 'permission-blocked' ||
    recorderPhase === 'unusable'
  ) {
    return 'error';
  }
  return 'idle';
}

/** A non-animated description for screen readers (never the audio level). */
export const ORB_DESCRIPTIONS: Record<OrbState, string> = {
  idle: 'Voice orb, resting.',
  listening: 'Voice orb, listening to you.',
  speaking: 'Voice orb, NameSinger is speaking.',
  processing: 'Voice orb, working on it.',
  generating: 'Voice orb, making your song.',
  playing: 'Voice orb, playing.',
  paused: 'Voice orb, paused.',
  error: 'Voice orb, needs attention.',
};

export function orbDescription(state: OrbState): string {
  return ORB_DESCRIPTIONS[state];
}

export interface OrbMotion {
  /** Orb size as a fraction of its box when there is no sound. */
  baseScale: number;
  /** How much the level adds to the size (fraction of the box). */
  levelGain: number;
  /** Texture flow and contour rotation run. Off under reduced motion. */
  ambient: boolean;
  /** Slow breathing amplitude (fraction of the box), state-based, never audio-based. */
  breathe: number;
  breatheMs: number;
  /** Overall opacity of the orb. */
  opacity: number;
  /** Extra contour stretch at full level. */
  contour: number;
  /** Extra brightness of the white clouds at full level (0 to 1). */
  cloudLift: number;
}

const BASE: Record<OrbState, OrbMotion> = {
  idle: { baseScale: 0.74, levelGain: 0.05, ambient: true, breathe: 0.012, breatheMs: 4200, opacity: 1, contour: 0.02, cloudLift: 0.05 },
  listening: { baseScale: 0.76, levelGain: 0.22, ambient: true, breathe: 0.006, breatheMs: 3200, opacity: 1, contour: 0.09, cloudLift: 0.45 },
  // Speaking follows the speech engine's real word events (a short pulse per word), not an audio level.
  speaking: { baseScale: 0.76, levelGain: 0.12, ambient: true, breathe: 0.008, breatheMs: 3000, opacity: 1, contour: 0.05, cloudLift: 0.3 },
  processing: { baseScale: 0.72, levelGain: 0, ambient: true, breathe: 0.018, breatheMs: 1800, opacity: 1, contour: 0, cloudLift: 0.1 },
  generating: { baseScale: 0.77, levelGain: 0, ambient: true, breathe: 0.03, breatheMs: 2200, opacity: 1, contour: 0, cloudLift: 0.2 },
  playing: { baseScale: 0.78, levelGain: 0.2, ambient: true, breathe: 0.004, breatheMs: 3600, opacity: 1, contour: 0.08, cloudLift: 0.4 },
  paused: { baseScale: 0.72, levelGain: 0, ambient: true, breathe: 0.01, breatheMs: 5200, opacity: 0.88, contour: 0, cloudLift: 0 },
  error: { baseScale: 0.66, levelGain: 0, ambient: false, breathe: 0, breatheMs: 4000, opacity: 0.7, contour: 0, cloudLift: 0 },
};

/** Motion parameters for a state. Reduced motion removes the flow and keeps changes tiny. */
export function orbMotion(state: OrbState, reducedMotion: boolean): OrbMotion {
  const motion = BASE[state];
  if (!reducedMotion) return motion;
  return {
    ...motion,
    ambient: false,
    breathe: 0,
    levelGain: Math.min(motion.levelGain, 0.04),
    contour: 0,
  };
}
