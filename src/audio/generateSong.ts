import { renderPersonalizedSong, type RenderReport } from './renderSong';
import { templateForLanguage } from './template';
import { PipelineError } from './types';
import { decodeWav, encodeWav } from './wav';

/** File and asset access, injected so the service runs in unit tests without native modules. */
export interface SongIO {
  readBytes: (uri: string) => Promise<Uint8Array>;
  writeBytes: (uri: string, bytes: Uint8Array) => Promise<void>;
  newSongUri: () => string;
  loadInstrumental: () => Promise<Uint8Array>;
}

export interface GeneratedSong {
  uri: string;
  report: RenderReport;
  isPlaceholderTemplate: boolean;
}

export interface GenerateSongOptions {
  /** Called before the CPU-heavy step so the UI can paint a "working" state first. */
  yieldToUi?: () => Promise<void>;
  now?: () => number;
}

/**
 * Recording URI + language in, playable song URI out. All audio work is in renderSong.ts; this
 * only moves bytes. Throws PipelineError for problems the user can fix (silence, unreadable file).
 */
export async function generateSong(
  input: { nameUri: string; languageCode: string },
  io: SongIO,
  options: GenerateSongOptions = {},
): Promise<GeneratedSong> {
  const [nameBytes, instrumentalBytes] = await Promise.all([io.readBytes(input.nameUri), io.loadInstrumental()]);
  const name = decodeWav(nameBytes);
  const instrumental = decodeWav(instrumentalBytes);
  const template = templateForLanguage(input.languageCode);

  if (options.yieldToUi) await options.yieldToUi();
  const { audio, report } = renderPersonalizedSong({ instrumental, name, template }, { now: options.now });

  const uri = io.newSongUri();
  await io.writeBytes(uri, encodeWav(audio));
  return { uri, report, isPlaceholderTemplate: template.isPlaceholder };
}

/** Fixed, user-facing text for each failure. Never includes paths or native error messages. */
export function songErrorMessage(error: unknown): string {
  if (error instanceof PipelineError) {
    switch (error.code) {
      case 'no_voice':
        return "We couldn't hear your name clearly. Record again a little closer to the microphone.";
      case 'name_too_short':
        return 'That recording was too short to be a name. Please record it again.';
      case 'unsupported_wav':
        return "That recording couldn't be read. Please record it again.";
      default:
        return 'Something went wrong while making your song.';
    }
  }
  return 'Something went wrong while making your song.';
}
