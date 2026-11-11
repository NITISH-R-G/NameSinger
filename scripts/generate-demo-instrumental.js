// Generates assets/audio/demo-instrumental.wav: a synthesized about 10.7-second placeholder
// loop (Am - F - C - G pads + simple bass + soft kick). Not a produced song.
const fs = require('fs');
const path = require('path');

const SR = 22050;
const BPM = 90;
const beat = 60 / BPM;
const bars = 4;
const secondsPerBar = beat * 4;
const total = Math.round(SR * secondsPerBar * bars);
const data = new Float32Array(total);

const chords = [
  [220.0, 261.63, 329.63], // Am
  [174.61, 220.0, 261.63], // F
  [261.63, 329.63, 392.0], // C
  [196.0, 246.94, 293.66], // G
];
const bass = [110.0, 87.31, 130.81, 98.0];

for (let bar = 0; bar < bars; bar++) {
  const start = Math.round(bar * secondsPerBar * SR);
  const len = Math.round(secondsPerBar * SR);
  for (let i = 0; i < len; i++) {
    const t = i / SR;
    const env = Math.min(1, t / 0.15) * Math.min(1, (secondsPerBar - t) / 0.2);
    let s = 0;
    for (const f of chords[bar]) s += Math.sin(2 * Math.PI * f * t) * 0.12;
    s *= env;
    const bt = t % beat;
    s += Math.sin(2 * Math.PI * bass[bar] * t) * 0.2 * Math.exp(-bt * 2.5);
    if (Math.floor(t / beat) % 2 === 0) {
      s += Math.sin(2 * Math.PI * (60 - bt * 120) * bt) * 0.35 * Math.exp(-bt * 14);
    }
    data[start + i] += s;
  }
}

const pcm = Buffer.alloc(total * 2);
for (let i = 0; i < total; i++) {
  const v = Math.max(-1, Math.min(1, data[i]));
  pcm.writeInt16LE(Math.round(v * 32767), i * 2);
}
const header = Buffer.alloc(44);
header.write('RIFF', 0);
header.writeUInt32LE(36 + pcm.length, 4);
header.write('WAVEfmt ', 8);
header.writeUInt32LE(16, 16);
header.writeUInt16LE(1, 20);
header.writeUInt16LE(1, 22);
header.writeUInt32LE(SR, 24);
header.writeUInt32LE(SR * 2, 28);
header.writeUInt16LE(2, 32);
header.writeUInt16LE(16, 34);
header.write('data', 36);
header.writeUInt32LE(pcm.length, 40);
const out = path.join(__dirname, '..', 'assets', 'audio', 'demo-instrumental.wav');
fs.mkdirSync(path.dirname(out), { recursive: true });
fs.writeFileSync(out, Buffer.concat([header, pcm]));
console.log('wrote', out, (header.length + pcm.length) / 1024, 'KB');
