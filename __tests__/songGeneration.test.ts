import * as fs from 'fs';
import * as path from 'path';

import { generateSong, songErrorMessage, type SongIO } from '../src/audio/generateSong';
import { synthesizeTestVoice } from '../src/audio/testVoice';
import { PipelineError } from '../src/audio/types';
import { decodeWav, encodeWav } from '../src/audio/wav';
import {
  initialSongState,
  songReducer,
  songUriToDiscard,
  type SongState,
} from '../src/hooks/songGeneratorState';

// Rendering a full song is CPU-heavy and several times slower under Jest than in plain Node.
jest.setTimeout(30_000);

const instrumentalBytes = new Uint8Array(
  fs.readFileSync(path.join(__dirname, '..', 'assets', 'audio', 'demo-instrumental.wav')),
);

function createIO(nameBytes: Uint8Array, writeDelayMs = 0) {
  const written = new Map<string, Uint8Array>();
  const events: string[] = [];
  const io: SongIO = {
    readBytes: async () => nameBytes,
    loadInstrumental: async () => instrumentalBytes,
    newSongUri: () => 'file:///cache/NameSinger/song-test.wav',
    writeBytes: async (uri, bytes) => {
      events.push('write-start');
      await new Promise((resolve) => setTimeout(resolve, writeDelayMs));
      written.set(uri, bytes);
      events.push('write-done');
    },
  };
  return { io, written, events };
}

const voiceBytes = () => encodeWav(synthesizeTestVoice({ sampleRate: 22050 }));

describe('generateSong', () => {
  it('reads the recording, renders and writes a playable WAV', async () => {
    const { io, written } = createIO(voiceBytes());
    const result = await generateSong({ nameUri: 'file:///name.wav', languageCode: 'hi-IN' }, io);
    expect(result.uri).toBe('file:///cache/NameSinger/song-test.wav');
    expect(result.isPlaceholderTemplate).toBe(true);
    expect(result.report.slots.length).toBeGreaterThan(0);
    const bytes = written.get(result.uri) as Uint8Array;
    const decoded = decodeWav(bytes);
    expect(decoded.sampleRate).toBe(22050);
    expect(decoded.samples.length / decoded.sampleRate).toBeGreaterThan(20);
  });

  it('does not resolve until the file has been completely written', async () => {
    const { io, events } = createIO(voiceBytes(), 30);
    await generateSong({ nameUri: 'x', languageCode: 'en-IN' }, io);
    expect(events).toEqual(['write-start', 'write-done']);
  });

  it('yields to the UI before the heavy step', async () => {
    const { io } = createIO(voiceBytes());
    const order: string[] = [];
    await generateSong({ nameUri: 'x', languageCode: 'en-IN' }, io, {
      yieldToUi: async () => {
        order.push('yield');
      },
      now: () => {
        order.push('render');
        return 0;
      },
    });
    expect(order[0]).toBe('yield');
    expect(order).toContain('render');
  });

  it('rejects a silent recording with a typed error and writes nothing', async () => {
    const silent = encodeWav({ sampleRate: 22050, samples: new Float32Array(22050) });
    const { io, written } = createIO(silent);
    await expect(generateSong({ nameUri: 'x', languageCode: 'hi-IN' }, io)).rejects.toMatchObject({
      code: 'no_voice',
    });
    expect(written.size).toBe(0);
  });

  it('rejects data that is not a WAV file', async () => {
    const { io } = createIO(new Uint8Array(200));
    await expect(generateSong({ nameUri: 'x', languageCode: 'hi-IN' }, io)).rejects.toMatchObject({
      code: 'unsupported_wav',
    });
  });
});

describe('songErrorMessage', () => {
  it('gives a fixed, helpful message per code and never echoes native text', () => {
    expect(songErrorMessage(new PipelineError('no_voice', 'secret /data/user/0/x'))).toMatch(/couldn't hear/i);
    expect(songErrorMessage(new PipelineError('name_too_short', 'x'))).toMatch(/too short/i);
    expect(songErrorMessage(new PipelineError('unsupported_wav', 'x'))).toMatch(/couldn't be read/i);
    const generic = songErrorMessage(new Error('open failed: /data/user/0/host/cache/x.wav'));
    expect(generic).toBe('Something went wrong while making your song.');
    expect(generic).not.toContain('/data');
  });
});

describe('songReducer', () => {
  const song = { uri: 'file:///a.wav', report: {} as never, isPlaceholderTemplate: true };

  it('walks idle -> generating -> ready', () => {
    let state = songReducer(initialSongState, { type: 'STARTED' });
    expect(state.phase).toBe('generating');
    state = songReducer(state, { type: 'SUCCEEDED', song });
    expect(state.phase).toBe('ready');
    expect(state.song?.uri).toBe('file:///a.wav');
  });

  it('ignores a repeated start and results nobody is waiting for', () => {
    const generating = songReducer(initialSongState, { type: 'STARTED' });
    expect(songReducer(generating, { type: 'STARTED' })).toBe(generating);
    expect(songReducer(initialSongState, { type: 'SUCCEEDED', song })).toBe(initialSongState);
    expect(songReducer(initialSongState, { type: 'FAILED', message: 'x' })).toBe(initialSongState);
  });

  it('keeps a fixed error message and returns to idle on reset', () => {
    const failed = songReducer(songReducer(initialSongState, { type: 'STARTED' }), { type: 'FAILED', message: 'Nope' });
    expect(failed).toEqual({ phase: 'error', song: null, errorMessage: 'Nope' });
    expect(songReducer(failed, { type: 'RESET' })).toBe(initialSongState);
    expect(songReducer(initialSongState, { type: 'RESET' })).toBe(initialSongState);
  });

  it('deletes the song file exactly when the state stops referencing it', () => {
    const ready: SongState = { phase: 'ready', song, errorMessage: null };
    expect(songUriToDiscard(ready, songReducer(ready, { type: 'RESET' }))).toBe('file:///a.wav');
    expect(songUriToDiscard(ready, songReducer(ready, { type: 'STARTED' }))).toBe('file:///a.wav');
    expect(songUriToDiscard(ready, ready)).toBeNull();
    expect(songUriToDiscard(initialSongState, initialSongState)).toBeNull();
  });
});
