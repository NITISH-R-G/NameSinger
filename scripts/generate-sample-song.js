// Generates assets/audio/sample-song.wav: the sample song played on the welcome screen.
// It is the real on-device pipeline (src/audio) run on the synthetic test voice, so it shows what
// the app produces without using anyone's recording. It is a demo, not a produced song.
//
//   node scripts/generate-sample-song.js
//
// The TypeScript sources are transpiled in memory with the repo's own `typescript` package.
const fs = require('fs');
const path = require('path');
const ts = require('typescript');

const root = path.join(__dirname, '..');
require.extensions['.ts'] = (module, filename) => {
  const { outputText } = ts.transpileModule(fs.readFileSync(filename, 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
  });
  module._compile(outputText, filename);
};

const { decodeWav, encodeWav } = require(path.join(root, 'src/audio/wav.ts'));
const { renderPersonalizedSong } = require(path.join(root, 'src/audio/renderSong.ts'));
const { templateForLanguage } = require(path.join(root, 'src/audio/template.ts'));
const { synthesizeTestVoice } = require(path.join(root, 'src/audio/testVoice.ts'));

const instrumental = decodeWav(new Uint8Array(fs.readFileSync(path.join(root, 'assets/audio/demo-instrumental.wav'))));
const name = synthesizeTestVoice({ sampleRate: instrumental.sampleRate });
const { audio, report } = renderPersonalizedSong({ instrumental, name, template: templateForLanguage('en-IN') });

const out = path.join(root, 'assets/audio/sample-song.wav');
fs.writeFileSync(out, Buffer.from(encodeWav(audio)));
console.log(`wrote ${out}: ${report.output.seconds.toFixed(1)} s, peak ${report.output.peakDb.toFixed(1)} dBFS`);
