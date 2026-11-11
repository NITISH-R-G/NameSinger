import type { NameRecording } from '../types';

/**
 * Song generation starts by itself once the user has explicitly approved a recording, and only
 * once per approved recording. This pure rule is what keeps repeated renders, double taps and
 * development double-effects from starting a second job.
 *
 * @param approved   the approved recording, or null when there is none
 * @param lastStartedUri  the recording a job was already started for
 * @param generating  a job is running right now
 */
export function shouldAutoGenerate(
  approved: NameRecording | null,
  lastStartedUri: string | null,
  generating: boolean,
): boolean {
  if (approved === null) return false;
  if (generating) return false;
  return approved.uri !== lastStartedUri;
}
