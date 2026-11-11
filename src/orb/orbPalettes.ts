/**
 * The orb's colour identities. Each is a layered gradient system, not a tint: four colours for the
 * body (light top to deep bottom), a glow, and one colour for each of the six drifting clouds
 * (their geometry and motion are the same for every palette, see palette.ts), so every identity
 * keeps the same fluid movement and the same quality.
 *
 * These are purely visual. They are not voices: the assistant's spoken voice is configured
 * separately (see voice settings in docs/ui/orb-themes.md) and nothing here changes it.
 */
export const ORB_THEME_IDS = [
  'aurora',
  'ocean',
  'sunset',
  'emerald',
  'rose',
  'glacier',
  'solar',
  'amethyst',
] as const;

export type OrbThemeId = (typeof ORB_THEME_IDS)[number];

export const DEFAULT_ORB_THEME: OrbThemeId = 'aurora';

export type CloudRole = 'indigo' | 'violet' | 'sky' | 'white' | 'mist' | 'wisp';

export interface OrbPalette {
  id: OrbThemeId;
  name: string;
  /** What the colours are, for the selector's spoken label. */
  colorWords: string;
  /** Body gradient from the light top to the deep bottom. */
  base: readonly [top: string, mid: string, low: string, bottom: string];
  /** Shown under the gradient while it draws, and the colour of the glow. */
  fallback: string;
  glow: string;
  /** Edge shading that gives the sphere depth. */
  depth: string;
  clouds: Record<CloudRole, string>;
  /**
   * The accent the whole interface takes from this orb: a deep tone that reads on the light
   * surfaces and a luminous one for the dark surfaces. See theme/buildTheme.ts.
   */
  accent: { light: string; dark: string };
}

export const ORB_PALETTES: Record<OrbThemeId, OrbPalette> = {
  aurora: {
    id: 'aurora',
    name: 'Aurora',
    colorWords: 'indigo, violet and pale blue',
    base: ['#CFE0FF', '#7C74F6', '#4A38DE', '#271A98'],
    fallback: '#6E62F2',
    glow: '#8C7DFF',
    depth: '#1B1270',
    clouds: { indigo: '#1E1285', violet: '#6A4DFF', sky: '#A9CBFF', white: '#FFFFFF', mist: '#FFFFFF', wisp: '#FFFFFF' },
    accent: { light: '#4B2E9F', dark: '#BBA8FF' },
  },
  ocean: {
    id: 'ocean',
    name: 'Ocean',
    colorWords: 'cyan, deep blue and turquoise',
    base: ['#C9F4FF', '#2EC4E6', '#1565C0', '#0A2A6B'],
    fallback: '#1E88D6',
    glow: '#34D3F0',
    depth: '#061E55',
    clouds: { indigo: '#06235F', violet: '#0E7FD8', sky: '#4FE3D0', white: '#F2FFFF', mist: '#E6FFFF', wisp: '#CFFAF5' },
    accent: { light: '#0B5FA5', dark: '#67D4F0' },
  },
  sunset: {
    id: 'sunset',
    name: 'Sunset',
    colorWords: 'coral, pink and orange',
    base: ['#FFE2C6', '#FF8A5B', '#F0507A', '#8E2457'],
    fallback: '#F2606E',
    glow: '#FF8A65',
    depth: '#5E1240',
    clouds: { indigo: '#7A1C4B', violet: '#FF4F8B', sky: '#FFC27A', white: '#FFF4E6', mist: '#FFFFFF', wisp: '#FFE0B8' },
    accent: { light: '#B93A22', dark: '#FF9B7A' },
  },
  emerald: {
    id: 'emerald',
    name: 'Emerald',
    colorWords: 'mint, emerald and teal',
    base: ['#D8FFF0', '#4FD6A0', '#0F9D7A', '#064B49'],
    fallback: '#17B58A',
    glow: '#3EE0B0',
    depth: '#03393A',
    clouds: { indigo: '#043B3D', violet: '#0E9F7E', sky: '#9BF3D8', white: '#F2FFFA', mist: '#FFFFFF', wisp: '#C9FFE9' },
    accent: { light: '#0B7A5C', dark: '#5FE0B5' },
  },
  rose: {
    id: 'rose',
    name: 'Rose',
    colorWords: 'magenta, rose and soft pink',
    base: ['#FFE0F0', '#F06BB0', '#C21E80', '#6A0F55'],
    fallback: '#D63B96',
    glow: '#FF6EC0',
    depth: '#470A3B',
    clouds: { indigo: '#5A0A4A', violet: '#E0368F', sky: '#FFB3D9', white: '#FFF0F8', mist: '#FFFFFF', wisp: '#FFD1EA' },
    accent: { light: '#B0176D', dark: '#FF8CC6' },
  },
  glacier: {
    id: 'glacier',
    name: 'Glacier',
    colorWords: 'ice blue, white and lavender',
    base: ['#FFFFFF', '#BFDDFF', '#9AA6F0', '#5C5FB8'],
    fallback: '#9CB4F0',
    glow: '#BFD6FF',
    depth: '#3A3F94',
    clouds: { indigo: '#4A4FB0', violet: '#B39DF5', sky: '#D9ECFF', white: '#FFFFFF', mist: '#FFFFFF', wisp: '#EDE4FF' },
    accent: { light: '#4559B8', dark: '#B9CCFF' },
  },
  solar: {
    id: 'solar',
    name: 'Solar',
    colorWords: 'gold, amber and orange',
    base: ['#FFF6C2', '#FFC93C', '#FF9500', '#C4500A'],
    fallback: '#FFA81F',
    glow: '#FFC94A',
    depth: '#8A3606',
    clouds: { indigo: '#B24400', violet: '#FF8A00', sky: '#FFE27A', white: '#FFFBE6', mist: '#FFFFFF', wisp: '#FFEBB0' },
    accent: { light: '#9A5200', dark: '#FFC94A' },
  },
  amethyst: {
    id: 'amethyst',
    name: 'Amethyst',
    colorWords: 'deep purple, lilac and violet',
    base: ['#EBDDFF', '#9B5FE8', '#5B21B6', '#2A0F5E'],
    fallback: '#7A3FD0',
    glow: '#A67BFF',
    depth: '#1A0840',
    clouds: { indigo: '#1F0A55', violet: '#8A4DF0', sky: '#CDB2FF', white: '#F6EEFF', mist: '#FFFFFF', wisp: '#E4D2FF' },
    accent: { light: '#5B21B6', dark: '#C9A6FF' },
  },
};

export const ORB_PALETTE_LIST: readonly OrbPalette[] = ORB_THEME_IDS.map((id) => ORB_PALETTES[id]);

export function isOrbThemeId(value: unknown): value is OrbThemeId {
  return typeof value === 'string' && (ORB_THEME_IDS as readonly string[]).includes(value);
}

export function orbPalette(id: OrbThemeId): OrbPalette {
  return ORB_PALETTES[id];
}

/** The three colours shown on a selector swatch: top, middle and low of the body gradient. */
export function swatchColors(id: OrbThemeId): readonly [string, string, string] {
  const { base } = ORB_PALETTES[id];
  return [base[0], base[1], base[2]];
}
