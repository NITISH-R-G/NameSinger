/** Turns the engine's own log lines into a stage, a fraction and a readable status. Pure, no I/O. */

export interface SongProgress {
  stage: 'starting' | 'loading' | 'score' | 'melody' | 'rendering' | 'decoding' | 'saving';
  /** 0..1 across the whole song. */
  fraction: number;
  text: string;
}

// Share of the whole job each stage is given in the progress bar (the stage order is fixed).
const W = { load: 0.04, score: 0.06, sem: 0.4, nar: 0.4, vae: 0.08, mp3: 0.02 };

const P_SCORE = /\[AR\] Score (\d+)\/(\d+)/;
const P_SEM = /\[AR\] Semantic (\d+)\/(\d+)/;
const P_NAR = /\[NAR\] Step (\d+)\/(\d+)/;

/** Looks at the newest lines first and reports the most advanced stage it can see. */
export function parseProgress(lines: readonly string[]): SongProgress {
  for (let i = lines.length - 1; i >= 0; i -= 1) {
    const line = lines[i];
    if (line.includes('[MP3]') || line.includes('[WAV]')) {
      return { stage: 'saving', fraction: 1 - W.mp3 / 2, text: 'Finishing your song' };
    }
    if (line.includes('[VAE]')) {
      return { stage: 'decoding', fraction: W.load + W.score + W.sem + W.nar + W.vae / 2, text: 'Turning it into sound' };
    }
    const nar = P_NAR.exec(line);
    if (nar) {
      const done = Number(nar[1]);
      const total = Math.max(1, Number(nar[2]));
      return {
        stage: 'rendering',
        fraction: W.load + W.score + W.sem + (W.nar * Math.min(done, total)) / total,
        text: `Rendering the voice, step ${Math.min(done, total)} of ${total}`,
      };
    }
    const sem = P_SEM.exec(line);
    if (sem) {
      const done = Number(sem[1]);
      const total = Math.max(1, Number(sem[2]));
      return {
        stage: 'melody',
        fraction: W.load + W.score + (W.sem * Math.min(done, total)) / total,
        text: 'Singing the melody',
      };
    }
    const score = P_SCORE.exec(line);
    if (score) {
      const done = Number(score[1]);
      const total = Math.max(1, Number(score[2]));
      return { stage: 'score', fraction: W.load + (W.score * Math.min(done, total)) / total, text: 'Reading the score' };
    }
    if (line.includes('[Store] Load') || line.includes('[Load]')) {
      return { stage: 'loading', fraction: W.load / 2, text: 'Waking the singer' };
    }
  }
  return { stage: 'starting', fraction: 0, text: 'Getting ready' };
}
