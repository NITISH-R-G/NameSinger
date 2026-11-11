/** Mono floating-point audio. All DSP in src/audio works on this shape. */
export interface PcmAudio {
  sampleRate: number;
  /** Samples in the range -1..1. */
  samples: Float32Array;
}

export type PipelineErrorCode =
  | 'unsupported_wav'
  | 'no_voice'
  | 'name_too_short'
  | 'invalid_template';

/** Typed error so the UI can show a helpful, fixed message. Never carries paths or audio. */
export class PipelineError extends Error {
  readonly code: PipelineErrorCode;

  constructor(code: PipelineErrorCode, message: string) {
    super(message);
    this.name = 'PipelineError';
    this.code = code;
  }
}

export function durationSeconds(audio: PcmAudio): number {
  return audio.samples.length / audio.sampleRate;
}
