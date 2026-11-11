import { Avatar, Style } from '@dicebear/core';
import botttsDefinition from '@dicebear/styles/bottts.json';

import { MASCOT_BASE_OPTIONS, MASCOT_MOUTH, type MascotMood } from '../constants/mascot';

const style = new Style(botttsDefinition);
const cache = new Map<string, string>();

/** Returns the mascot as an SVG string. Pure and cached: the same inputs give the same string. */
export function mascotSvg(mood: MascotMood, size: number): string {
  const key = `${mood}:${size}`;
  const cached = cache.get(key);
  if (cached !== undefined) return cached;
  const svg = new Avatar(style, {
    ...MASCOT_BASE_OPTIONS,
    mouthVariant: MASCOT_MOUTH[mood],
    size,
  }).toString();
  cache.set(key, svg);
  return svg;
}
