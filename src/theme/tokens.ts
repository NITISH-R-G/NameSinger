import { lightColors } from './colors';

/**
 * The light palette. Kept as the static default so non-visual code and tests can read it; anything
 * that renders must use `useTheme().colors`, which follows the Light, Dark or System preference.
 */
export const colors = lightColors;

export const spacing = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 24,
  xxl: 32,
} as const;

export const radius = {
  sm: 8,
  md: 14,
  lg: 20,
  pill: 999,
} as const;

export const typography = {
  display: { fontSize: 34, lineHeight: 40, fontWeight: '800' },
  title: { fontSize: 20, lineHeight: 26, fontWeight: '700' },
  body: { fontSize: 16, lineHeight: 22, fontWeight: '400' },
  label: { fontSize: 14, lineHeight: 18, fontWeight: '600' },
  caption: { fontSize: 13, lineHeight: 18, fontWeight: '400' },
  mono: { fontSize: 28, lineHeight: 34, fontWeight: '700' },
} as const;

/** Minimum touch target recommended by iOS and Android guidelines. */
export const minTouchTarget = 48;

/**
 * Horizontal layout. A primary button sits `contentInset` from the screen edge:
 * screen gutter + card border + card padding = 4 + 1 + 14 = 19 dp, inside the 16 to 20 dp range.
 */
export const layout = {
  screenGutter: 4,
  cardBorderWidth: 1,
  cardPadding: 14,
  contentInset: 19,
  /** Gap between two buttons sharing a row, and between stacked buttons. */
  buttonGap: 12,
} as const;
