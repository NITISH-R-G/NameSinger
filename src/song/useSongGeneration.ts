import { useCallback, useEffect, useRef, useState } from 'react';

import { loadYueEngine, type YueEngineNative } from '../../modules/yue-engine/src';
import { parseProgress, type SongProgress } from './progress';
import { buildSongRequest, normaliseName, serialiseRequest, type SongStyleId } from './songRequest';

export const MODEL_FILE = 'YuE2-3B-Q5_K_M.gguf';
export const VAE_FILE = 'YuE2-Vae-F32.gguf';
/** Smallest sizes that mean the file is complete (the real files are 2,622,936,832 and 530,497,344 bytes). */
const MODEL_MIN_BYTES = 2_600_000_000;
const VAE_MIN_BYTES = 500_000_000;
const MIN_FREE_RAM_BYTES = 1_800_000_000;
const MIN_FREE_STORAGE_BYTES = 100_000_000;

export type SongPhase = 'idle' | 'preparing' | 'generating' | 'done' | 'error';

export interface FinishedSong {
  name: string;
  style: SongStyleId;
  audioPath: string;
  seconds: number;
}

export interface SongGenerationState {
  phase: SongPhase;
  progress: SongProgress;
  elapsedSeconds: number;
  song: FinishedSong | null;
  error: string | null;
}

const IDLE_PROGRESS: SongProgress = { stage: 'starting', fraction: 0, text: 'Getting ready' };

function sleep(ms: number) {
  return new Promise<void>((resolve) => setTimeout(resolve, ms));
}

/** Everything that must be true before a job is submitted. Returns an error message, or null when ready. */
export function checkReadiness(engine: YueEngineNative): string | null {
  if (!engine.hasEngineBinary()) return 'The song engine is missing from this build.';
  const dir = engine.modelsDir();
  if (engine.fileSize(`${dir}/${MODEL_FILE}`) < MODEL_MIN_BYTES || engine.fileSize(`${dir}/${VAE_FILE}`) < VAE_MIN_BYTES) {
    return `The song models are not installed yet. Place ${MODEL_FILE} and ${VAE_FILE} in the app model folder (${dir})`;
  }
  if (engine.availableMemoryBytes() < MIN_FREE_RAM_BYTES) {
    return 'Not enough free memory. Close a few other apps and try again.';
  }
  if (engine.freeStorageBytes() < MIN_FREE_STORAGE_BYTES) return 'Not enough free storage to save a song.';
  return null;
}

export function useSongGeneration() {
  const [state, setState] = useState<SongGenerationState>({
    phase: 'idle',
    progress: IDLE_PROGRESS,
    elapsedSeconds: 0,
    song: null,
    error: null,
  });
  const running = useRef(false);
  const cancelled = useRef(false);
  const engineRef = useRef<YueEngineNative | null>(null);

  useEffect(
    () => () => {
      // Leaving the screen while a job runs keeps the engine going; it is stopped only by an explicit cancel.
    },
    [],
  );

  const fail = useCallback((message: string) => {
    running.current = false;
    setState((s) => ({ ...s, phase: 'error', error: message }));
  }, []);

  const generate = useCallback(
    async (rawName: string, style: SongStyleId) => {
      if (running.current) return; // one job at a time
      const name = normaliseName(rawName);
      if (name.length === 0) {
        setState((s) => ({ ...s, phase: 'error', error: 'Type a name to sing.' }));
        return;
      }
      running.current = true;
      cancelled.current = false;
      const started = Date.now();
      setState({ phase: 'preparing', progress: IDLE_PROGRESS, elapsedSeconds: 0, song: null, error: null });

      const engine = engineRef.current ?? loadYueEngine();
      engineRef.current = engine;
      if (!engine) return fail('The song engine is not available on this device build.');
      const notReady = checkReadiness(engine);
      if (notReady) return fail(notReady);

      let timer: ReturnType<typeof setInterval> | null = null;
      try {
        const dir = engine.modelsDir();
        const st = engine.status();
        if (!st.running || !st.healthy) {
          engine.stop();
          engine.start(`${dir}/${MODEL_FILE}`, `${dir}/${VAE_FILE}`, 0, 4096, false);
          let ok = false;
          for (let i = 0; i < 90 && !cancelled.current; i += 1) {
            await sleep(1000);
            const s = engine.status();
            if (s.healthy) {
              ok = true;
              break;
            }
            if (!s.running) {
              const last = engine.recentLog(8).filter((l) => l.trim().length > 0).slice(-1)[0] ?? '';
              return fail(`The song engine could not start. ${last.slice(0, 140)}`.trim());
            }
          }
          if (!ok) return fail(cancelled.current ? 'Cancelled.' : 'The song engine took too long to start.');
        }

        setState((s) => ({ ...s, phase: 'generating' }));
        timer = setInterval(() => {
          try {
            const progress = parseProgress(engine.recentLog(60));
            setState((s) =>
              s.phase === 'generating'
                ? {
                    ...s,
                    progress: progress.fraction >= s.progress.fraction ? progress : s.progress,
                    elapsedSeconds: Math.round((Date.now() - started) / 1000),
                  }
                : s,
            );
          } catch {
            // a failed poll only skips one progress tick
          }
        }, 1000);

        const request = serialiseRequest(buildSongRequest({ name, style }));
        const tag = `song_${name.replace(/[^\p{L}\p{N}]+/gu, '_')}_${started}`;
        const result = await engine.generate(request, engine.songsDir(), tag);
        const seconds = Math.round((Date.now() - started) / 1000);
        running.current = false;
        setState({
          phase: 'done',
          progress: { stage: 'saving', fraction: 1, text: 'Your song is ready' },
          elapsedSeconds: seconds,
          song: { name, style, audioPath: result.audioPath, seconds },
          error: null,
        });
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        if (cancelled.current || msg.includes('cancelled')) fail('Cancelled.');
        else if (msg.includes('engine stopped')) fail('The song engine stopped unexpectedly. Your name is safe: try again.');
        else fail(msg);
      } finally {
        if (timer) clearInterval(timer);
      }
    },
    [fail],
  );

  const cancel = useCallback(() => {
    cancelled.current = true;
    try {
      engineRef.current?.cancel();
    } catch {
      // the engine may already be gone
    }
  }, []);

  const reset = useCallback(() => {
    if (running.current) return;
    setState({ phase: 'idle', progress: IDLE_PROGRESS, elapsedSeconds: 0, song: null, error: null });
  }, []);

  return { ...state, generate, cancel, reset, engine: engineRef };
}
