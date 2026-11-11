import { ORB_PALETTES, type OrbThemeId } from '../orb/orbPalettes';
import type { ColorScheme, GlassTokens, Palette } from './colors';
import { mix, readableOn, withAlpha } from './colorMath';

/**
 * Derives the whole interface palette from the selected orb. The orb is the source of truth:
 * its accent colour becomes the accent of every control, selection, focus ring and glass tint.
 * Neutrals are designed per scheme (dark is not an inversion of light) and only lean very slightly
 * toward the accent, so text stays readable and the interface still feels one colour world.
 */
export function buildPalette(scheme: ColorScheme, orbTheme: OrbThemeId): Palette {
  const orb = ORB_PALETTES[orbTheme];
  const dark = scheme === 'dark';
  const accent = orb.accent[scheme];
  const onAccent = readableOn(accent);
  const accentStrong = dark ? mix(accent, '#FFFFFF', 0.2) : mix(accent, '#000000', 0.22);

  const background = dark ? mix('#0B0A12', accent, 0.06) : mix('#FBF7F0', accent, 0.05);
  const surface = dark ? mix('#16131E', accent, 0.06) : '#FFFFFF';
  const surfaceElevated = dark ? mix('#1D1A28', accent, 0.08) : mix('#FFFFFF', accent, 0.02);
  const surfaceMuted = dark ? mix('#201C2C', accent, 0.1) : mix('#F3EDE3', accent, 0.07);
  const field = dark ? mix('#221E2E', accent, 0.1) : mix('#F2EFF6', accent, 0.08);
  const ink = dark ? mix('#F4F1FA', accent, 0.05) : mix('#1B1925', accent, 0.1);
  const inkMuted = dark ? mix('#C4BDD6', accent, 0.08) : mix('#545062', accent, 0.12);
  const border = dark ? mix('#332E46', accent, 0.2) : mix('#E4DACB', accent, 0.2);
  const danger = dark ? '#FCA5A5' : '#B42318';
  const neutral = dark ? mix('#2A2738', accent, 0.06) : mix('#E6E2EC', accent, 0.05);
  const neutralPressed = dark ? mix('#383449', accent, 0.06) : mix('#D4CFDC', accent, 0.05);
  const disabled = dark ? mix('#2B283A', accent, 0.1) : mix('#D6D1DC', accent, 0.14);

  return {
    background,
    surface,
    surfaceElevated,
    surfaceMuted,
    ink,
    inkMuted,
    border,
    placeholder: dark ? '#ABA3C0' : '#5C576D',
    field,
    scrim: dark ? 'rgba(0, 0, 0, 0.55)' : withAlpha(mix('#14102A', accent, 0.25), 0.4),
    disabled,
    onDisabled: dark ? '#9189A6' : '#625C72',
    neutral,
    neutralPressed,
    onNeutral: ink,
    danger,
    dangerPressed: dark ? '#F28B8B' : '#8E1B12',
    dangerSurface: dark ? '#3A1517' : '#FDECEA',
    onDanger: readableOn(danger),
    success: dark ? '#86EFAC' : '#166534',
    successSurface: dark ? '#12301F' : '#E3F4E8',
    accent,
    accentStrong,
    accentSoft: dark ? mix(surface, accent, 0.24) : mix('#FFFFFF', accent, 0.12),
    accentMuted: dark ? mix(background, accent, 0.45) : mix(background, accent, 0.4),
    accentForeground: accent,
    onAccent,
    selection: withAlpha(accent, dark ? 0.34 : 0.22),
    focusRing: dark ? accent : accentStrong,
    glassTint: withAlpha(accent, dark ? 0.2 : 0.15),
    glassHighlight: dark ? withAlpha(mix(accent, '#FFFFFF', 0.6), 0.5) : 'rgba(255, 255, 255, 0.9)',
    glassBorder: dark ? withAlpha(mix(accent, '#FFFFFF', 0.3), 0.5) : withAlpha(mix('#FFFFFF', accent, 0.3), 0.9),
    orbPrimary: orb.base[1],
    orbSecondary: orb.base[2],
    orbHighlight: orb.base[0],
    primary: accent,
    primaryPressed: accentStrong,
    onPrimary: onAccent,
  };
}

/** The glass material for a scheme and orb: dark glass is deeper with bright restrained highlights, light glass is clear and bright. */
export function buildGlass(scheme: ColorScheme, orbTheme: OrbThemeId): GlassTokens {
  const orb = ORB_PALETTES[orbTheme];
  const dark = scheme === 'dark';
  const accent = orb.accent[scheme];
  const reflect = orb.base[0];
  return {
    fill: dark ? withAlpha(mix('#15111F', accent, 0.12), 0.46) : withAlpha(mix('#FFFFFF', accent, 0.05), 0.4),
    fillStrong: dark ? withAlpha(mix('#14111E', accent, 0.1), 0.9) : withAlpha(mix('#FFFFFF', accent, 0.04), 0.9),
    tint: withAlpha(accent, dark ? 0.2 : 0.14),
    rim: dark ? withAlpha(mix(accent, '#FFFFFF', 0.35), 0.5) : withAlpha(mix('#FFFFFF', accent, 0.25), 0.95),
    rimGlow: dark ? withAlpha(mix(reflect, '#FFFFFF', 0.4), 0.7) : withAlpha('#FFFFFF', 1),
    highlight: dark ? mix(reflect, '#FFFFFF', 0.55) : '#FFFFFF',
    highlightAlpha: dark ? 0.26 : 0.7,
    bounce: dark ? withAlpha(accent, 0.28) : withAlpha(mix(accent, '#FFFFFF', 0.2), 0.3),
    shadow: dark ? 'rgba(0, 0, 0, 0.55)' : withAlpha(mix('#201840', accent, 0.4), 0.22),
    glow: withAlpha(accent, dark ? 0.3 : 0.2),
    blurIntensity: dark ? 62 : 50,
    blurTint: dark ? 'dark' : 'light',
    refraction: {
      frost: dark ? 5 : 3,
      saturation: dark ? 1.2 : 1.25,
      specular: dark ? 0.6 : 0.65,
      tint: dark ? withAlpha(mix('#0E0C16', accent, 0.25), 0.2) : withAlpha(mix('#FFFFFF', accent, 0.2), 0.12),
      tintStrong: dark ? withAlpha(mix('#0E0C16', accent, 0.2), 0.34) : withAlpha(mix('#FFFFFF', accent, 0.12), 0.2),
      glow: withAlpha(accent, dark ? 0.42 : 0.32),
      specularColor: dark ? mix(reflect, '#FFFFFF', 0.6) : '#FFFFFF',
    },
  };
}
