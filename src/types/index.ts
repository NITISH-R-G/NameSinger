export type LanguageCode =
  | 'hi-IN'
  | 'bn-IN'
  | 'ta-IN'
  | 'te-IN'
  | 'kn-IN'
  | 'ml-IN'
  | 'mr-IN'
  | 'gu-IN'
  | 'pa-IN'
  | 'en-IN';

export interface Language {
  code: LanguageCode;
  /** Name in the language's own script, shown to the user. */
  nativeName: string;
  /** English name, used for accessibility labels. */
  englishName: string;
}

/** A recording that the recorder actually returned with a usable file URI. */
export interface NameRecording {
  uri: string;
  durationMs: number;
}

export type RecorderPhase =
  | 'idle'
  | 'requesting-permission'
  /** Denied, but Android will show the permission dialog again. */
  | 'permission-denied'
  /** Denied for good: Android will not ask again, so only Settings can change it. */
  | 'permission-blocked'
  | 'recording'
  | 'stopping'
  | 'recorded'
  /** Recorded, but silent or unclear. The file is kept (so it can be played back) until the user records again. */
  | 'unusable'
  | 'approved'
  | 'error';

export interface RecorderState {
  phase: RecorderPhase;
  recording: NameRecording | null;
  errorMessage: string | null;
  /** True when the recording is usable but quiet; the screen suggests moving closer. */
  quiet?: boolean;
}

export type RecorderAction =
  | { type: 'PERMISSION_REQUESTED' }
  | { type: 'PERMISSION_DENIED' }
  | { type: 'PERMISSION_BLOCKED' }
  | { type: 'RECORDING_STARTED' }
  | { type: 'STOP_REQUESTED' }
  | { type: 'RECORDING_FINISHED'; recording: NameRecording; quiet?: boolean }
  | { type: 'RECORDING_UNUSABLE'; recording: NameRecording; message: string }
  | { type: 'APPROVED' }
  | { type: 'RESET' }
  | { type: 'FAILED'; message: string };
