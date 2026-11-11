import type { Palette } from './colors';
import { colors, minTouchTarget } from './tokens';

/**
 * Button hierarchy. Each variant says what the button means, not how it looks on one screen:
 *
 *  - primary          the main forward action on a screen; full width
 *  - secondary        an alternative or supporting action; full width, outlined
 *  - neutral          cancel / go back; full width, grey
 *  - destructive      the final, confirmed destructive action; full width, solid red.
 *                     Only for a screen dedicated to confirming the operation.
 *  - destructiveText  a destructive action on an ordinary screen; red text, no fill
 *  - contextual       a small action that belongs to a card or list row; sized to its content
 *
 * Red is reserved for destructive variants. Nothing else may use it.
 */
export type ButtonVariant =
  | 'primary'
  | 'secondary'
  | 'neutral'
  | 'destructive'
  | 'destructiveText'
  | 'contextual';

export interface ButtonSpec {
  /** Stretches to the full width of its container (or its half of a ButtonRow). */
  fullWidth: boolean;
  background: string;
  backgroundPressed: string;
  border: string;
  text: string;
  /** True only for variants that signal a destructive operation. */
  destructive: boolean;
  fontSize: number;
  paddingHorizontal: number;
}

/** The specs for one palette. The app uses the current theme's; BUTTON_SPECS below is the light one. */
export function buttonSpecs(colors: Palette): Record<ButtonVariant, ButtonSpec> {
  return {
  primary: {
    fullWidth: true,
    background: colors.primary,
    backgroundPressed: colors.primaryPressed,
    border: colors.primary,
    text: colors.onPrimary,
    destructive: false,
    fontSize: 16,
    paddingHorizontal: 24,
  },
  secondary: {
    fullWidth: true,
    background: colors.surface,
    backgroundPressed: colors.surfaceMuted,
    border: colors.primary,
    text: colors.primary,
    destructive: false,
    fontSize: 16,
    paddingHorizontal: 24,
  },
  neutral: {
    fullWidth: true,
    background: colors.neutral,
    backgroundPressed: colors.neutralPressed,
    border: colors.neutral,
    text: colors.onNeutral,
    destructive: false,
    fontSize: 16,
    paddingHorizontal: 24,
  },
  destructive: {
    fullWidth: true,
    background: colors.danger,
    backgroundPressed: colors.dangerPressed,
    border: colors.danger,
    text: colors.onDanger,
    destructive: true,
    fontSize: 16,
    paddingHorizontal: 24,
  },
  destructiveText: {
    fullWidth: true,
    background: 'transparent',
    backgroundPressed: colors.dangerSurface,
    border: 'transparent',
    text: colors.danger,
    destructive: true,
    fontSize: 16,
    paddingHorizontal: 16,
  },
  contextual: {
    fullWidth: false,
    background: colors.surface,
    backgroundPressed: colors.surfaceMuted,
    border: colors.primary,
    text: colors.primary,
    destructive: false,
    fontSize: 15,
    paddingHorizontal: 20,
  },
  };
}

export const BUTTON_SPECS = buttonSpecs(colors);

/** Every button is at least this tall, whatever its variant. */
export const BUTTON_MIN_HEIGHT = minTouchTarget;

export interface ResolvedButtonColors {
  background: string;
  border: string;
  text: string;
}

/** Colours for one state. Disabled and loading look the same (inactive); pressed darkens. */
export function resolveButtonColors(
  variant: ButtonVariant,
  state: { pressed: boolean; inactive: boolean },
  palette: Palette = colors,
): ResolvedButtonColors {
  const spec = buttonSpecs(palette)[variant];
  if (state.inactive) {
    if (spec.background === 'transparent') {
      return { background: 'transparent', border: 'transparent', text: palette.onDisabled };
    }
    return { background: palette.disabled, border: palette.disabled, text: palette.onDisabled };
  }
  return {
    background: state.pressed ? spec.backgroundPressed : spec.background,
    border: spec.border,
    text: spec.text,
  };
}
