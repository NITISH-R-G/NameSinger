import { peakOf, rmsOf, toDb, trimToVoiced, type TrimOptions } from './dsp';
import { durationSeconds, type PcmAudio } from './types';

/**
 * Voice detection settings shared by the check that runs before a recording is approved and by
 * the song renderer, so a recording that passes the check cannot then fail the render for lack
 * of a voice.
 *
 * The only value that differs from the dsp defaults is the absolute floor. It was -50 dBFS, which
 * rejected clear speech whose peaks were below about -38 dBFS even in a silent room. Measured with
 * synthesized speech (docs/ux/recording-validation.md): -62 dBFS accepts quiet but clear voices,
 * and noise-only, hum, clicks and coughs are still rejected because the noise-relative margin
 * (12 dB above the noise floor) does the discriminating, not the absolute floor.
 */
export const VOICE_TRIM_OPTIONS: TrimOptions = { minThresholdDb: -62 };

/** Voiced speech is at least 80 ms and trimming adds about 120 ms of padding, so 0.25 s is reachable. */
export const MIN_NAME_SECONDS = 0.25;

/** The renderer boosts a name by at most 24 dB; below this voiced level the name stays faint. */
export const QUIET_VOICE_RMS_DB = -48;

/** A take whose loudest sample is below this has no signal at all (muted or covered microphone). */
export const SILENT_PEAK_DB = -66;

export type UnusableReason = 'silent' | 'unclear' | 'too_short';

export type RecordingAssessment =
  | { ok: true; quiet: boolean }
  | { ok: false; reason: UnusableReason };

/** Fixed, user-facing text for each reason. Never includes paths or error text. */
export const UNUSABLE_MESSAGES: Record<UnusableReason, string> = {
  silent:
    "We couldn't hear anything. Make sure nothing is covering the microphone, then record again.",
  unclear:
    "We couldn't pick your voice out from the background. Move somewhere quieter or a little closer, then record again.",
  too_short:
    'That was too short to be a name. Say your name, then wait a moment before you stop.',
};

export const QUIET_VOICE_NOTE =
  'That was quiet. It will work, but a closer recording sounds better.';

/**
 * Decides whether a take can be turned into a song. Quietness alone never rejects a take: the
 * decision is whether a voice stands clearly above the take's own background noise. A quiet but
 * clear voice is accepted and flagged `quiet` so the screen can suggest moving closer.
 */
export function assessRecording(audio: PcmAudio): RecordingAssessment {
  const peakDb = toDb(peakOf(audio.samples));
  const trim = trimToVoiced(audio, VOICE_TRIM_OPTIONS);
  if (trim === null) {
    return { ok: false, reason: peakDb < SILENT_PEAK_DB ? 'silent' : 'unclear' };
  }
  if (durationSeconds(trim.audio) < MIN_NAME_SECONDS) {
    return { ok: false, reason: 'too_short' };
  }
  return { ok: true, quiet: toDb(rmsOf(trim.audio.samples)) < QUIET_VOICE_RMS_DB };
}
