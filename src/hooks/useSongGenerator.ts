import { useCallback, useEffect, useReducer, useRef } from 'react';

import { generateSong, songErrorMessage, type GeneratedSong } from '../audio/generateSong';
import { nativeSongIO } from '../audio/nativeSongIO';
import { deleteRecordingFile } from './recordingFiles';
import { initialSongState, songReducer, songUriToDiscard, type SongState } from './songGeneratorState';

export interface UseSongGeneratorResult {
  state: SongState;
  /** Builds a song from the approved name recording. Ignored while one is already being made. */
  generate: (nameUri: string, languageCode: string) => Promise<void>;
  /** Drops the current song and deletes its file. */
  reset: () => void;
}

function yieldToUi(): Promise<void> {
  // Let React paint the "working" state before the CPU-heavy render blocks the JS thread.
  return new Promise((resolve) => {
    requestAnimationFrame(() => setTimeout(resolve, 0));
  });
}

function deleteQuietly(uri: string): void {
  try {
    deleteRecordingFile(uri);
  } catch {
    // Best effort. Leftovers are removed by the next-launch sweep of the work folder.
  }
}

export function useSongGenerator(): UseSongGeneratorResult {
  const [state, dispatch] = useReducer(songReducer, initialSongState);
  const stateRef = useRef(state);
  stateRef.current = state;
  const runId = useRef(0);
  const mounted = useRef(true);

  const apply = useCallback((action: Parameters<typeof songReducer>[1]) => {
    const previous = stateRef.current;
    const next = songReducer(previous, action);
    const discard = songUriToDiscard(previous, next);
    stateRef.current = next;
    if (mounted.current) dispatch(action);
    if (discard !== null) deleteQuietly(discard);
  }, []);

  const generate = useCallback(
    async (nameUri: string, languageCode: string) => {
      if (stateRef.current.phase === 'generating') return;
      runId.current += 1;
      const myRun = runId.current;
      apply({ type: 'RESET' });
      apply({ type: 'STARTED' });
      try {
        const song: GeneratedSong = await generateSong({ nameUri, languageCode }, nativeSongIO, { yieldToUi });
        if (myRun !== runId.current || !mounted.current) {
          // Superseded or unmounted while rendering: the finished file is not wanted.
          deleteQuietly(song.uri);
          return;
        }
        apply({ type: 'SUCCEEDED', song });
      } catch (error) {
        if (myRun === runId.current) apply({ type: 'FAILED', message: songErrorMessage(error) });
      }
    },
    [apply],
  );

  const reset = useCallback(() => {
    runId.current += 1; // invalidates a render that is still running
    apply({ type: 'RESET' });
  }, [apply]);

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      runId.current += 1;
      const song = stateRef.current.song;
      if (song !== null) deleteQuietly(song.uri);
    };
  }, []);

  return { state, generate, reset };
}
