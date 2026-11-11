import { PipelineError, type PcmAudio } from './types';

const RIFF = 0x46464952; // 'RIFF' little-endian
const WAVE = 0x45564157; // 'WAVE'
const FMT = 0x20746d66; // 'fmt '
const DATA = 0x61746164; // 'data'

/**
 * Decodes a PCM WAV file (16-bit integer or 32-bit float) to mono floats. Multi-channel audio is
 * averaged. A data chunk whose declared size is wrong (a file still being written, or a
 * streaming header) is clamped to the bytes actually present.
 */
export function decodeWav(bytes: Uint8Array): PcmAudio {
  if (bytes.byteLength < 44) throw new PipelineError('unsupported_wav', 'WAV file is too small.');
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  if (view.getUint32(0, true) !== RIFF || view.getUint32(8, true) !== WAVE) {
    throw new PipelineError('unsupported_wav', 'Not a RIFF/WAVE file.');
  }

  let format = 0;
  let channels = 0;
  let sampleRate = 0;
  let bitsPerSample = 0;
  let dataStart = -1;
  let dataLength = 0;

  let offset = 12;
  while (offset + 8 <= bytes.byteLength) {
    const id = view.getUint32(offset, true);
    const size = view.getUint32(offset + 4, true);
    const body = offset + 8;
    if (id === FMT && body + 16 <= bytes.byteLength) {
      format = view.getUint16(body, true);
      channels = view.getUint16(body + 2, true);
      sampleRate = view.getUint32(body + 4, true);
      bitsPerSample = view.getUint16(body + 14, true);
    } else if (id === DATA) {
      dataStart = body;
      dataLength = Math.min(size, bytes.byteLength - body);
      break;
    }
    offset = body + size + (size % 2);
  }

  if (dataStart < 0 || channels < 1 || sampleRate < 1) {
    throw new PipelineError('unsupported_wav', 'WAV header is incomplete.');
  }
  const isInt16 = format === 1 && bitsPerSample === 16;
  const isFloat32 = format === 3 && bitsPerSample === 32;
  if (!isInt16 && !isFloat32) {
    throw new PipelineError('unsupported_wav', 'Only 16-bit PCM and 32-bit float WAV are supported.');
  }

  const bytesPerSample = bitsPerSample / 8;
  const frames = Math.floor(dataLength / (bytesPerSample * channels));
  const samples = new Float32Array(frames);
  for (let frame = 0; frame < frames; frame += 1) {
    let sum = 0;
    for (let channel = 0; channel < channels; channel += 1) {
      const at = dataStart + (frame * channels + channel) * bytesPerSample;
      sum += isInt16 ? view.getInt16(at, true) / 32768 : view.getFloat32(at, true);
    }
    samples[frame] = sum / channels;
  }
  return { sampleRate, samples };
}

/** Encodes mono audio as a 16-bit PCM WAV file. Samples are clamped to -1..1. */
export function encodeWav(audio: PcmAudio): Uint8Array {
  const { samples, sampleRate } = audio;
  const dataLength = samples.length * 2;
  const out = new Uint8Array(44 + dataLength);
  const view = new DataView(out.buffer);
  view.setUint32(0, RIFF, true);
  view.setUint32(4, 36 + dataLength, true);
  view.setUint32(8, WAVE, true);
  view.setUint32(12, FMT, true);
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true); // PCM
  view.setUint16(22, 1, true); // mono
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * 2, true);
  view.setUint16(32, 2, true);
  view.setUint16(34, 16, true);
  view.setUint32(36, DATA, true);
  view.setUint32(40, dataLength, true);
  for (let i = 0; i < samples.length; i += 1) {
    const clamped = Math.max(-1, Math.min(1, samples[i]));
    view.setInt16(44 + i * 2, Math.round(clamped * 32767), true);
  }
  return out;
}
