import { assessRecording, QUIET_VOICE_NOTE, UNUSABLE_MESSAGES } from '../audio/recordingQuality';
import { decodeWav } from '../audio/wav';
import type { TakeAssessment } from './recordingController';

/**
 * Reads a finished take and decides whether it can become a song. Reading or decoding failures
 * propagate: the recording controller treats a throw as "accept", because an unreadable file is
 * reported properly by song generation and must not be reported here as "silent".
 */
export async function analyzeTake(
  uri: string,
  io: { readBytes: (uri: string) => Promise<Uint8Array> },
): Promise<TakeAssessment> {
  const audio = decodeWav(await io.readBytes(uri));
  const result = assessRecording(audio);
  if (!result.ok) return { ok: false, message: UNUSABLE_MESSAGES[result.reason] };
  return { ok: true, quiet: result.quiet };
}

export { QUIET_VOICE_NOTE };
