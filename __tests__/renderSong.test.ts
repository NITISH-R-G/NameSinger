import * as fs from 'fs';
import * as path from 'path';

import { rmsOf } from '../src/audio/dsp';
import { renderPersonalizedSong } from '../src/audio/renderSong';
import { beatSeconds, DEMO_TEMPLATE, validateTemplate, type SongTemplate } from '../src/audio/template';
import { synthesizeTestVoice } from '../src/audio/testVoice';
import { durationSeconds, PipelineError, type PcmAudio } from '../src/audio/types';
import { decodeWav, encodeWav } from '../src/audio/wav';

// Rendering a full song is CPU-heavy and several times slower under Jest than in plain Node.
jest.setTimeout(30_000);

const instrumental = decodeWav(
  new Uint8Array(fs.readFileSync(path.join(__dirname, '..', 'assets', 'audio', 'demo-instrumental.wav'))),
);

const voice = (pitchHz = 140, sampleRate = instrumental.sampleRate): PcmAudio =>
  synthesizeTestVoice({ sampleRate, pitchHz });

describe('demo template', () => {
  it('matches the bundled instrumental (90 BPM, four bars)', () => {
    expect(beatSeconds(DEMO_TEMPLATE)).toBeCloseTo(0.6667, 3);
    expect(durationSeconds(instrumental)).toBeCloseTo(4 * 4 * beatSeconds(DEMO_TEMPLATE), 1);
    expect(() => validateTemplate(DEMO_TEMPLATE, durationSeconds(instrumental))).not.toThrow();
  });

  it('rejects slots outside the song or overlapping', () => {
    const seconds = durationSeconds(instrumental);
    const outside: SongTemplate = { ...DEMO_TEMPLATE, slots: [{ ...DEMO_TEMPLATE.slots[0], startBeat: 31, beats: 4 }] };
    expect(() => validateTemplate(outside, seconds)).toThrow(PipelineError);
    const overlapping: SongTemplate = {
      ...DEMO_TEMPLATE,
      slots: [
        { ...DEMO_TEMPLATE.slots[0], startBeat: 4, beats: 4 },
        { ...DEMO_TEMPLATE.slots[0], startBeat: 6, beats: 2 },
      ],
    };
    expect(() => validateTemplate(overlapping, seconds)).toThrow(PipelineError);
  });
});

describe('renderPersonalizedSong', () => {
  const run = (name: PcmAudio) => renderPersonalizedSong({ instrumental, name, template: DEMO_TEMPLATE });

  it('builds a two-pass song with a tail, normalized below clipping', () => {
    const { audio, report } = run(voice());
    const expected = durationSeconds(instrumental) * DEMO_TEMPLATE.instrumentalLoops + DEMO_TEMPLATE.tailSeconds;
    expect(durationSeconds(audio)).toBeCloseTo(expected, 2);
    expect(report.output.peakDb).toBeLessThan(0);
    expect(report.output.peakDb).toBeGreaterThan(-1.5);
    expect(audio.samples.every(Number.isFinite)).toBe(true);
    expect(report.slots).toHaveLength(DEMO_TEMPLATE.slots.length);
  });

  it('tunes the name to a note of each slot chord within the natural range', () => {
    const { report } = run(voice(140));
    expect(report.name.pitchHz).toBeGreaterThan(105);
    expect(report.name.pitchHz).toBeLessThan(165);
    for (const slot of report.slots) {
      expect(Math.abs(slot.shiftSemitones)).toBeLessThanOrEqual(4);
      expect(slot.stretchFactor).toBeGreaterThan(0.5);
      expect(slot.stretchFactor).toBeLessThan(2);
    }
  });

  it('puts audible vocal energy in the name slots and keeps the instrumental elsewhere', () => {
    const { audio } = run(voice());
    const rate = audio.sampleRate;
    const beat = beatSeconds(DEMO_TEMPLATE);
    const finalSlot = DEMO_TEMPLATE.slots[DEMO_TEMPLATE.slots.length - 1];
    const at = (beatIndex: number, beats: number) =>
      audio.samples.subarray(Math.round(beatIndex * beat * rate), Math.round((beatIndex + beats) * beat * rate));
    const dry = renderPersonalizedSong({
      instrumental,
      name: voice(),
      template: { ...DEMO_TEMPLATE, slots: [] },
    }).audio;
    const dryAt = (beatIndex: number, beats: number) =>
      dry.samples.subarray(Math.round(beatIndex * beat * rate), Math.round((beatIndex + beats) * beat * rate));
    // Compare relative to each render's own level: the name slot must stand out more than the
    // same stretch of a render with no name.
    const withName = rmsOf(at(finalSlot.startBeat, finalSlot.beats)) / rmsOf(audio.samples);
    const without = rmsOf(dryAt(finalSlot.startBeat, finalSlot.beats)) / rmsOf(dry.samples);
    expect(withName).toBeGreaterThan(without * 1.15);
    // An early bar with no slot is still the instrumental.
    expect(rmsOf(at(0, 4))).toBeGreaterThan(0.01);
  });

  it('works for low and high voices and for another input sample rate', () => {
    for (const pitch of [95, 200, 260]) {
      const { report } = run(voice(pitch));
      expect(report.output.peakDb).toBeLessThan(0);
      for (const slot of report.slots) expect(Math.abs(slot.shiftSemitones)).toBeLessThanOrEqual(4);
    }
    const resampled = run(synthesizeTestVoice({ sampleRate: 16000, pitchHz: 150 }));
    expect(resampled.audio.sampleRate).toBe(instrumental.sampleRate);
  });

  it('is deterministic', () => {
    const a = run(voice()).audio.samples;
    const b = run(voice()).audio.samples;
    expect(Buffer.from(a.buffer).equals(Buffer.from(b.buffer))).toBe(true);
  });

  it('rejects silence and too-short clips with typed errors', () => {
    const silence: PcmAudio = { sampleRate: 22050, samples: new Float32Array(22050) };
    expect(() => run(silence)).toThrow(expect.objectContaining({ code: 'no_voice' }));
    const blip = synthesizeTestVoice({ sampleRate: 22050, syllableSeconds: 0.03 });
    expect(() => run(blip)).toThrow(expect.objectContaining({ code: 'name_too_short' }));
    const click = synthesizeTestVoice({ sampleRate: 22050, syllableSeconds: 0.01 });
    expect(() => run(click)).toThrow(PipelineError);
  });

  it('reports a stage-by-stage timing using the injected clock', () => {
    let tick = 0;
    const { report } = renderPersonalizedSong(
      { instrumental, name: voice(), template: DEMO_TEMPLATE },
      { now: () => (tick += 10) },
    );
    expect(report.timingsMs.total).toBe(30);
    expect(report.timingsMs.prepare + report.timingsMs.slots + report.timingsMs.finalize).toBe(30);
  });

  it('encodes the result as a WAV of the expected size', () => {
    const { audio } = run(voice());
    const wav = encodeWav(audio);
    expect(wav.byteLength).toBe(44 + audio.samples.length * 2);
    expect(decodeWav(wav).samples.length).toBe(audio.samples.length);
  });
});

/**
 * Optional manual check on real speech. Set NAMESINGER_SPEECH_DIR to a folder of WAV files of
 * spoken names and NAMESINGER_OUT_DIR to receive the rendered songs plus a JSON report. Skipped
 * when the variable is not set, so it never depends on files that are not in the repository.
 */
const speechDir = process.env.NAMESINGER_SPEECH_DIR;
(speechDir ? describe : describe.skip)('real speech (manual)', () => {
  it('renders every WAV in the folder and writes reports', () => {
    const outDir = process.env.NAMESINGER_OUT_DIR ?? path.join(speechDir as string, 'out');
    fs.mkdirSync(outDir, { recursive: true });
    const summary: Record<string, unknown> = {};
    for (const file of fs.readdirSync(speechDir as string).filter((f) => f.endsWith('.wav'))) {
      const name = decodeWav(new Uint8Array(fs.readFileSync(path.join(speechDir as string, file))));
      const { audio, report } = renderPersonalizedSong({ instrumental, name, template: DEMO_TEMPLATE });
      fs.writeFileSync(path.join(outDir, `song-${file}`), encodeWav(audio));
      summary[file] = report;
      expect(report.output.peakDb).toBeLessThan(0);
    }
    fs.writeFileSync(path.join(outDir, 'report.json'), JSON.stringify(summary, null, 2));
  });
});
