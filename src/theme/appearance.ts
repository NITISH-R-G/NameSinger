import type { ColorScheme } from './colors';
import { DEFAULT_ORB_THEME, isOrbThemeId, type OrbThemeId } from '../orb/orbPalettes';

/**
 * Appearance settings: the one place that says how the app looks. Two choices, both local:
 *  - the colour mode: System (follow the phone), Light or Dark;
 *  - the orb's colour identity.
 * Voice is deliberately not here. The assistant's spoken voice is a separate setting that does not
 * exist yet; the orb theme does not imply or change it.
 *
 * Pure logic over an injected storage port, so every outcome (first launch, restart, corrupt file,
 * failed read, failed write) is unit-tested without native modules.
 */
export type ThemePreference = 'system' | 'light' | 'dark';

export const THEME_PREFERENCES: readonly ThemePreference[] = ['system', 'light', 'dark'];

export interface Appearance {
  themePreference: ThemePreference;
  orbTheme: OrbThemeId;
}

export const DEFAULT_APPEARANCE: Appearance = { themePreference: 'system', orbTheme: DEFAULT_ORB_THEME };

export const APPEARANCE_VERSION = 1;

export interface AppearanceStorePort {
  /** The stored text, or null when nothing has been stored. Throws on a real read failure. */
  read: () => Promise<string | null>;
  write: (text: string) => Promise<void>;
}

export function isThemePreference(value: unknown): value is ThemePreference {
  return value === 'system' || value === 'light' || value === 'dark';
}

/** The colour scheme to draw with. An unknown system scheme (null) is treated as light. */
export function resolveScheme(preference: ThemePreference, system: ColorScheme | null | undefined): ColorScheme {
  if (preference === 'light' || preference === 'dark') return preference;
  return system === 'dark' ? 'dark' : 'light';
}

/** Parses stored text. Each field falls back to its default on its own, so one bad field loses nothing else. */
export function parseAppearance(text: string | null): Appearance {
  if (text === null) return DEFAULT_APPEARANCE;
  try {
    const value: unknown = JSON.parse(text);
    if (typeof value !== 'object' || value === null) return DEFAULT_APPEARANCE;
    const { themePreference, orbTheme } = value as Record<string, unknown>;
    return {
      themePreference: isThemePreference(themePreference) ? themePreference : DEFAULT_APPEARANCE.themePreference,
      orbTheme: isOrbThemeId(orbTheme) ? orbTheme : DEFAULT_APPEARANCE.orbTheme,
    };
  } catch {
    return DEFAULT_APPEARANCE;
  }
}

export function serializeAppearance(appearance: Appearance): string {
  return JSON.stringify({
    version: APPEARANCE_VERSION,
    themePreference: appearance.themePreference,
    orbTheme: appearance.orbTheme,
  });
}

/** Loads the saved appearance. Never throws: a failed read means the defaults. */
export async function loadAppearance(port: AppearanceStorePort): Promise<Appearance> {
  try {
    return parseAppearance(await port.read());
  } catch {
    return DEFAULT_APPEARANCE;
  }
}

/** Saves the appearance. Reports whether it was kept; the screen already shows the new look either way. */
export async function saveAppearance(port: AppearanceStorePort, appearance: Appearance): Promise<boolean> {
  try {
    await port.write(serializeAppearance(appearance));
    return true;
  } catch {
    return false;
  }
}
