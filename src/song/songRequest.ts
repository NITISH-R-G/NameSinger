/**
 * Builds the YuE2 request for one birthday song. Pure logic, no I/O.
 *
 * Port of the experiment configuration "C2" (natural spelling + ABC score whose name slot is split by an
 * estimated syllable count) from research-killa-yue/exp/lib.py. The name is passed to the engine as plain
 * lyrics text; the engine has no phoneme or pronunciation field. Nothing here is name-specific.
 */

export type SongStyleId = 'pop' | 'acoustic' | 'dance';

export interface SongStyle {
  id: SongStyleId;
  label: string;
  /** The tag string sent to the model. Only "pop" has been validated end to end. */
  tags: string;
}

export const SONG_STYLES: readonly SongStyle[] = [
  { id: 'pop', label: 'Pop', tags: 'pop cheerful birthday song female vocal upbeat' },
  { id: 'acoustic', label: 'Acoustic', tags: 'acoustic folk gentle birthday song female vocal warm' },
  { id: 'dance', label: 'Dance', tags: 'dance pop energetic birthday song female vocal bright' },
];

export const OCCASIONS = [{ id: 'birthday', label: 'Birthday' }] as const;

/** Render steps for the acoustic stage. A quality/latency trade-off; see docs for the measurements. */
export const DEFAULT_RENDER_STEPS = 4;
/** Fixed so the same name and style give the same song. */
export const LM_SEED = 4420344455356672063n;
export const NOISE_SEED = 7773520133666643031n;

const BAR = 16; // M:2/4 at L:1/32

/** Cleans what the user typed: letters, marks, spaces, hyphens and apostrophes only; at most 24 characters. */
export function normaliseName(raw: string): string {
  const cleaned = raw
    .normalize('NFC')
    .replace(/[^\p{L}\p{M}' -]/gu, '')
    .replace(/\s+/g, ' ')
    .trim();
  return cleaned.slice(0, 24).trim();
}

/** Vowel-group syllable estimate. The same rule for every name, no exceptions list. */
export function countSyllables(name: string): number {
  const w = name
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z]/g, '');
  const groups = w.match(/[aeiouy]+/g) ?? [];
  let n = groups.length;
  if (n > 1 && w.endsWith('e') && !w.endsWith('le') && !w.endsWith('ee') && /[^aeiouy]e$/.test(w)) n -= 1;
  return Math.max(1, Math.min(n, 6));
}

function splitEven(total: number, n: number): number[] {
  const base = Math.floor(total / n);
  const rem = total % n;
  return Array.from({ length: n }, (_, i) => base + (i < rem ? 1 : 0));
}

/**
 * Happy Birthday scaffold in the model's own ABC dialect (the melody the model itself wrote). Only the name
 * slot (24 thirty-second notes after "dear") changes: it is split evenly over `nameNotes` notes.
 */
export function buildAbc(nameNotes: number, slotUnits = 24, bpm = 95): string {
  const n = Math.max(1, nameNotes);
  const contour = [...Array(n - 1).fill('a'), 'g'] as string[];
  const durs = splitEven(slotUnits, n);
  const ev: Array<[string, number]> = [];
  ev.push(['z', 16]);
  ev.push(['a', 4], ['a', 2], ['a', 4], ['f', 6]);
  ev.push(['d', 4], ['b', 4], ['z', 8]);
  ev.push(['g', 4], ['g', 2], ['g', 4], ['e', 6]);
  ev.push(['c', 8]); // "dear"
  contour.forEach((p, i) => ev.push([p, durs[i]]));
  const used = ev.reduce((s, [, u]) => s + u, 0);
  const pad = (BAR - (used % BAR)) % BAR;
  if (pad) ev.push(['z', pad]);
  ev.push(['a', 4], ['a', 2], ['a', 4], ['f', 6]);
  ev.push(['d', 4], ['b', 12]);
  ev.push(["c'", 16]);

  const chords = ['F', 'F', 'Bb', 'C', 'C', 'F', 'F', 'Bb', 'C', 'F'];
  const bars: string[][] = [];
  let cur: string[] = [];
  let inBar = 0;
  for (const [p, units] of ev) {
    let left = units;
    while (left > 0) {
      const take = Math.min(left, BAR - inBar);
      const tie = take < left && p !== 'z' ? '-' : '';
      cur.push(`${p}${take}${tie}`);
      inBar += take;
      left -= take;
      if (inBar === BAR) {
        bars.push(cur);
        cur = [];
        inBar = 0;
      }
    }
  }
  if (cur.length) {
    cur.push(`z${BAR - inBar}`);
    bars.push(cur);
  }
  const rendered = bars.map((b, i) => `"${chords[i] ?? 'F'}"${b.join('')}|`);
  const head =
    `X:1\nT:\nM:2/4\nL:1/32\nQ:1/4=${bpm}\n` +
    'V: Vocal clef=treble name="Vocal Melody" snm="Vocal"\n' +
    'V: Ins clef=treble name="Ins Melody" snm="Inst."\nK:F\n';
  let body = '';
  for (let g = 0; g < rendered.length; g += 4) {
    const grp = rendered.slice(g, g + 4);
    if (g === 0) body += '% intro\n';
    body += `V: Vocal\n${grp.join('')}\nV: Ins\n${grp.length === 4 ? 'Z4|' : 'Z|'}\n`;
  }
  return head + body;
}

export function buildLyrics(name: string): string {
  return `[Verse]\nHappy birthday to you\nHappy birthday dear ${name}\nHappy birthday to you`;
}

export interface SongRequestInput {
  name: string;
  style: SongStyleId;
  steps?: number;
}

/** The JSON body for POST /synth. */
export function buildSongRequest({ name, style, steps = DEFAULT_RENDER_STEPS }: SongRequestInput) {
  const clean = normaliseName(name);
  if (clean.length === 0) throw new Error('Enter a name first.');
  const tags = (SONG_STYLES.find((s) => s.id === style) ?? SONG_STYLES[0]).tags;
  return {
    style: tags,
    lyrics: buildLyrics(clean),
    abc: buildAbc(countSyllables(clean)),
    cot: 'full',
    duration: 30,
    steps,
    // 64-bit seeds are sent as exact JSON integers (see serialiseRequest)
    lm_seed: LM_SEED,
    seed: NOISE_SEED,
    output_format: 'mp3',
    mp3_bitrate: 128,
  };
}

/** JSON.stringify cannot write BigInt; seeds must stay exact 64-bit integers. */
export function serialiseRequest(req: ReturnType<typeof buildSongRequest>): string {
  return JSON.stringify(req, (_k, v) => (typeof v === 'bigint' ? `__BIG__${v.toString()}__` : v)).replace(
    /"__BIG__(\d+)__"/g,
    '$1',
  );
}
