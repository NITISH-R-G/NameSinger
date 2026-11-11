import { buildGlass, buildPalette } from './buildTheme';
import type { OrbThemeId } from '../orb/orbPalettes';

/**
 * The semantic colour tokens of the whole app. Two families, deliberately separate:
 *
 *  - NEUTRALS (text, backgrounds, surfaces, dividers, disabled, error): dark or light by scheme,
 *    with only a faint tint of the selected orb so they sit naturally with the accent. Body text
 *    stays readable; it is never the accent colour.
 *  - ACCENT and ORB tokens: all taken from the selected orb palette. Anything interactive,
 *    selected, focused or glass-tinted reads from these, so choosing Ocean, Sunset or Emerald
 *    re-colours the entire interface, not just the orb.
 *
 * Built by `buildPalette(scheme, orbTheme)` in buildTheme.ts and exposed by `useTheme().colors`.
 * Every text-on-surface pair is contrast-tested for all eight palettes in both schemes.
 */
export interface Palette {
  // ----- neutrals
  background: string;
  surface: string;
  /** A raised surface: cards, sheets, bubbles. */
  surfaceElevated: string;
  surfaceMuted: string;
  /** Primary text. */
  ink: string;
  /** Secondary text. */
  inkMuted: string;
  /** Dividers and hairlines. */
  border: string;
  placeholder: string;
  /** A text field resting on a surface. */
  field: string;
  /** Scrim behind sheets and dialogs. */
  scrim: string;
  disabled: string;
  onDisabled: string;
  /** Grey for cancel and go-back actions. */
  neutral: string;
  neutralPressed: string;
  onNeutral: string;
  // ----- error and destructive
  danger: string;
  dangerPressed: string;
  dangerSurface: string;
  onDanger: string;
  success: string;
  successSurface: string;
  // ----- accent (from the orb palette)
  accent: string;
  /** Pressed and emphasised accent. */
  accentStrong: string;
  /** A light wash of the accent for selected backgrounds. */
  accentSoft: string;
  /** A quiet accent for borders and inactive parts. */
  accentMuted: string;
  /** The accent when used as text or an icon on a neutral surface (always readable there). */
  accentForeground: string;
  /** Text and icons on top of the accent. */
  onAccent: string;
  /** A translucent accent for selected rows and text selection. */
  selection: string;
  focusRing: string;
  // ----- glass tints (from the orb palette)
  glassTint: string;
  glassHighlight: string;
  glassBorder: string;
  // ----- the orb's own colours
  orbPrimary: string;
  orbSecondary: string;
  orbHighlight: string;
  // ----- legacy names, kept so existing components follow the accent without edits
  primary: string;
  primaryPressed: string;
  onPrimary: string;
}

export type ColorScheme = 'light' | 'dark';

/** The default (Aurora) palettes, for code and tests that do not depend on the orb choice. */
export const lightColors: Palette = buildPalette('light', 'aurora');
export const darkColors: Palette = buildPalette('dark', 'aurora');

export function paletteFor(scheme: ColorScheme, orbTheme: OrbThemeId = 'aurora'): Palette {
  return buildPalette(scheme, orbTheme);
}

/**
 * How the glass material is drawn. Separate from the text palette so contrast is always computed
 * against the opaque colour the glass sits on, never against the glass itself.
 */
export interface GlassTokens {
  /** The default translucent fill, light enough to show the blurred page through it. */
  fill: string;
  /** A nearly opaque fill for surfaces that carry text. */
  fillStrong: string;
  /** Colour wash over the glass, taken from the orb palette. */
  tint: string;
  rim: string;
  /** Colour of the bright rim glow along the top edge. */
  rimGlow: string;
  /** The specular highlight colour and its strength (a number: SVG ignores rgba alpha in stops). */
  highlight: string;
  highlightAlpha: number;
  /** Faint inner light along the lower edge, as if light passed through the glass. */
  bounce: string;
  shadow: string;
  /** A coloured under-glow shadow in the accent. */
  glow: string;
  blurIntensity: number;
  blurTint: 'light' | 'dark';
  /** Parameters for the native refraction shader (Android 13+), per scheme and orb. */
  refraction: {
    /** dp of blur on the sampled page. */
    frost: number;
    saturation: number;
    specular: number;
    /** Colour wash inside the glass, and a denser one for glass that carries text. */
    tint: string;
    tintStrong: string;
    /** Palette-coloured light along the bezel. */
    glow: string;
    specularColor: string;
  };
}

export const lightGlass: GlassTokens = buildGlass('light', 'aurora');
export const darkGlass: GlassTokens = buildGlass('dark', 'aurora');

export function glassFor(scheme: ColorScheme, orbTheme: OrbThemeId = 'aurora'): GlassTokens {
  return buildGlass(scheme, orbTheme);
}
