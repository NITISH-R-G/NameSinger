import { useContext, useMemo } from 'react';

import type { GlassTokens, Palette } from './colors';
import { ThemeContext, type ThemeValue } from './ThemeProvider';

/** The current look. Must be used under ThemeProvider. */
export function useTheme(): ThemeValue {
  const value = useContext(ThemeContext);
  if (value === null) throw new Error('useTheme must be used inside ThemeProvider');
  return value;
}

/**
 * Styles that depend on the palette, rebuilt only when the scheme changes (never per audio buffer):
 * `const styles = useThemedStyles(makeStyles)` with `const makeStyles = (c: Palette, g: GlassTokens) => StyleSheet.create({...})`.
 */
export function useThemedStyles<T>(factory: (colors: Palette, glass: GlassTokens) => T): T {
  const { colors, glass } = useTheme();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  return useMemo(() => factory(colors, glass), [colors, glass]);
}
