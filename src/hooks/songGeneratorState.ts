import type { GeneratedSong } from '../audio/generateSong';

export type SongPhase = 'idle' | 'generating' | 'ready' | 'error';

export interface SongState {
  phase: SongPhase;
  song: GeneratedSong | null;
  errorMessage: string | null;
}

export type SongAction =
  | { type: 'STARTED' }
  | { type: 'SUCCEEDED'; song: GeneratedSong }
  | { type: 'FAILED'; message: string }
  | { type: 'RESET' };

export const initialSongState: SongState = { phase: 'idle', song: null, errorMessage: null };

export function songReducer(state: SongState, action: SongAction): SongState {
  switch (action.type) {
    case 'STARTED':
      if (state.phase === 'generating') return state;
      return { phase: 'generating', song: null, errorMessage: null };
    case 'SUCCEEDED':
      if (state.phase !== 'generating') return state;
      return { phase: 'ready', song: action.song, errorMessage: null };
    case 'FAILED':
      if (state.phase !== 'generating') return state;
      return { phase: 'error', song: null, errorMessage: action.message };
    case 'RESET':
      return state.phase === 'idle' ? state : initialSongState;
    default:
      return state;
  }
}

/** A generated song contains the user's voice, so its file is deleted whenever it is dropped. */
export function songUriToDiscard(previous: SongState, next: SongState): string | null {
  if (previous.song === null) return null;
  return previous.song.uri === next.song?.uri ? null : previous.song.uri;
}
