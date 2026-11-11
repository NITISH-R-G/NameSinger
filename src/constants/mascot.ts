/**
 * Mascot appearance. DiceBear generates the SVG locally from a style definition and a seed, so
 * there is no network request and the same options always draw the same robot.
 *
 * Style: "Bottts" by Pablo Stanley, listed by DiceBear as free for personal and commercial use.
 * Source: https://www.dicebear.com/styles/bottts/
 */
export const MASCOT_SEED = 'NameSinger';

/** Brand purple (colors.primary without the #) so the mascot matches the app. */
const MASCOT_COLOR = '4B2E9F';

/** Options that never change, so the mascot stays recognisable. Headphone-style ear cups. */
export const MASCOT_BASE_OPTIONS = {
  seed: MASCOT_SEED,
  textureProbability: 0,
  baseColor: [MASCOT_COLOR],
  headVariant: ['round01'],
  sidesVariant: ['round'],
  topVariant: ['antenna'],
  eyesVariant: ['happy'],
} as const;

export type MascotMood = 'calm' | 'singing';

/** The mouth is the only thing that changes: closed smile at rest, open mouth when singing. */
export const MASCOT_MOUTH = {
  calm: ['smile01'],
  singing: ['smile02'],
} as const satisfies Record<MascotMood, readonly string[]>;
