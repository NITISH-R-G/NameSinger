/**
 * Turns the engine's own log lines into honest stage information. Pure, no I/O.
 *
 * There is deliberately no overall percentage: only the voice-render stage reports a real count ("step 2 of 4").
 * The other stages are named, never given an invented fraction.
 */

export interface SongProgress {
  stage: 'starting' | 'loading' | 'score' | 'melody' | 'rendering' | 'decoding' | 'saving';
  /** Which of the four steps is running: 0 before the first, then 1 to 4. Only moves forward. */
  step: 0 | 1 | 2 | 3 | 4;
  title: string;
  /** A real count from the engine, when there is one. */
  detail: string | null;
}

export const STEP_COUNT = 4;

const P_SCORE = /\[AR\] Score (\d+)\/(\d+)/;
const P_SEM = /\[AR\] Semantic (\d+)\/(\d+)/;
const P_NAR = /\[NAR\] Step (\d+)\/(\d+)/;

export const START_PROGRESS: SongProgress = { stage: 'starting', step: 0, title: 'Getting ready', detail: null };

/** Looks at the newest lines first and reports the most advanced stage it can see. */
export function parseProgress(lines: readonly string[]): SongProgress {
  for (let i = lines.length - 1; i >= 0; i -= 1) {
    const line = lines[i];
    if (line.includes('[MP3]') || line.includes('[WAV]')) {
      return { stage: 'saving', step: 4, title: 'Finishing the audio', detail: null };
    }
    if (line.includes('[VAE]')) {
      return { stage: 'decoding', step: 4, title: 'Finishing the audio', detail: null };
    }
    const nar = P_NAR.exec(line);
    if (nar) {
      const total = Math.max(1, Number(nar[2]));
      const done = Math.min(Number(nar[1]), total);
      return { stage: 'rendering', step: 3, title: 'Rendering the voice', detail: `Render pass ${done} of ${total}` };
    }
    if (P_SEM.test(line)) {
      return { stage: 'melody', step: 2, title: 'Singing the melody', detail: null };
    }
    if (P_SCORE.test(line)) {
      return { stage: 'score', step: 1, title: 'Reading the score', detail: null };
    }
    if (line.includes('[Store] Load') || line.includes('[Load]')) {
      return { stage: 'loading', step: 1, title: 'Waking the singer', detail: null };
    }
  }
  return START_PROGRESS;
}
