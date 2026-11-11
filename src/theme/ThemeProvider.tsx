import { createContext, useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { Animated, StyleSheet, useColorScheme, View } from 'react-native';

import { useReducedMotion } from '../hooks/useAppActive';
import type { OrbThemeId } from '../orb/orbPalettes';
import {
  DEFAULT_APPEARANCE,
  loadAppearance,
  resolveScheme,
  saveAppearance,
  type Appearance,
  type AppearanceStorePort,
  type ThemePreference,
} from './appearance';
import { appearanceFilePort } from './appearanceFile';
import { glassFor, paletteFor, type ColorScheme, type GlassTokens, type Palette } from './colors';

export interface ThemeValue {
  /** The scheme currently drawn (Light or Dark), after resolving System. */
  scheme: ColorScheme;
  /** What the user chose: System, Light or Dark. */
  preference: ThemePreference;
  colors: Palette;
  glass: GlassTokens;
  orbTheme: OrbThemeId;
  setPreference: (preference: ThemePreference) => void;
  setOrbTheme: (id: OrbThemeId) => void;
}

export const ThemeContext = createContext<ThemeValue | null>(null);

const DIP_MS = 140;
const RISE_MS = 240;

interface ThemeProviderProps {
  children: ReactNode;
  /** Where the appearance is kept. Defaults to the app's document directory. */
  port?: AppearanceStorePort;
}

/**
 * The single source of truth for how the app looks: the colour mode (System, Light, Dark) and the
 * orb's colour identity. It loads the saved choice once, applies changes at once, and saves them.
 *
 * A colour-mode change does not restart or remount anything. It dissolves: a cover in the new
 * background colour fades in (native-driven), the scheme swaps underneath, then the cover fades
 * out. The conversation, recording, playback and speech keep running through it, because nothing
 * but colours changes. With reduced motion the swap is immediate.
 */
export function ThemeProvider({ children, port = appearanceFilePort }: ThemeProviderProps) {
  const system = useColorScheme();
  const reduced = useReducedMotion();
  const [appearance, setAppearance] = useState<Appearance>(DEFAULT_APPEARANCE);
  const [loaded, setLoaded] = useState(false);
  const [applied, setApplied] = useState<ColorScheme | null>(null);
  const cover = useRef(new Animated.Value(0)).current;
  const [coverColor, setCoverColor] = useState('#000000');
  const dirty = useRef(false);

  useEffect(() => {
    let mounted = true;
    void loadAppearance(port).then((saved) => {
      if (!mounted) return;
      setAppearance(saved);
      setApplied(resolveScheme(saved.themePreference, system));
      setLoaded(true);
    });
    return () => {
      mounted = false;
    };
    // The saved choice is read once; later system changes are handled below.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [port]);

  // Save whatever the user changed (not the initial load).
  useEffect(() => {
    if (!loaded || !dirty.current) return;
    void saveAppearance(port, appearance);
  }, [appearance, loaded, port]);

  const target = resolveScheme(appearance.themePreference, system);

  // Move to a new scheme with a dissolve, or at once with reduced motion.
  useEffect(() => {
    if (!loaded || applied === null || target === applied) return undefined;
    if (reduced) {
      setApplied(target);
      return undefined;
    }
    setCoverColor(paletteFor(target, appearance.orbTheme).background);
    // The swap is timed, not tied to the animation's callback: a Modal (settings) hides the cover, and
    // the scheme must still change underneath it.
    const dip = Animated.timing(cover, { toValue: 1, duration: DIP_MS, useNativeDriver: true });
    let rise: Animated.CompositeAnimation | null = null;
    dip.start();
    const swap = setTimeout(() => {
      setApplied(target);
      rise = Animated.timing(cover, { toValue: 0, duration: RISE_MS, useNativeDriver: true });
      rise.start();
    }, DIP_MS);
    return () => {
      clearTimeout(swap);
      dip.stop();
      rise?.stop();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [target, applied, loaded, reduced, cover]);

  const setPreference = useCallback((themePreference: ThemePreference) => {
    dirty.current = true;
    setAppearance((current) => (current.themePreference === themePreference ? current : { ...current, themePreference }));
  }, []);

  const setOrbTheme = useCallback((orbTheme: OrbThemeId) => {
    dirty.current = true;
    setAppearance((current) => (current.orbTheme === orbTheme ? current : { ...current, orbTheme }));
  }, []);

  // A change of orb colours washes once across the interface in the new accent, in step with the orb's
  // own blend, so the controls changing colour read as part of the same movement.
  const wash = useRef(new Animated.Value(0)).current;
  const lastOrb = useRef(appearance.orbTheme);
  useEffect(() => {
    if (!loaded) {
      lastOrb.current = appearance.orbTheme;
      return undefined;
    }
    if (lastOrb.current === appearance.orbTheme) return undefined;
    lastOrb.current = appearance.orbTheme;
    if (reduced) return undefined;
    wash.setValue(0);
    const animation = Animated.sequence([
      Animated.timing(wash, { toValue: 1, duration: 220, useNativeDriver: true }),
      Animated.timing(wash, { toValue: 0, duration: 520, useNativeDriver: true }),
    ]);
    animation.start();
    return () => animation.stop();
  }, [appearance.orbTheme, loaded, reduced, wash]);

  const scheme = applied ?? resolveScheme(appearance.themePreference, system);
  const value = useMemo<ThemeValue>(
    () => ({
      scheme,
      preference: appearance.themePreference,
      colors: paletteFor(scheme, appearance.orbTheme),
      glass: glassFor(scheme, appearance.orbTheme),
      orbTheme: appearance.orbTheme,
      setPreference,
      setOrbTheme,
    }),
    [scheme, appearance.themePreference, appearance.orbTheme, setPreference, setOrbTheme],
  );

  // Until the saved choice is read (a few milliseconds) show only the background, so a saved Dark
  // never flashes Light.
  if (!loaded) return <View style={[styles.fill, { backgroundColor: paletteFor(resolveScheme('system', system)).background }]} />;

  return (
    <ThemeContext.Provider value={value}>
      <View style={[styles.fill, { backgroundColor: value.colors.background }]}>
        {children}
        <Animated.View
          pointerEvents="none"
          style={[StyleSheet.absoluteFill, { backgroundColor: coverColor, opacity: cover }]}
        />
        <Animated.View
          pointerEvents="none"
          style={[
            StyleSheet.absoluteFill,
            { backgroundColor: value.colors.accent, opacity: wash.interpolate({ inputRange: [0, 1], outputRange: [0, 0.1] }) },
          ]}
        />
      </View>
    </ThemeContext.Provider>
  );
}

const styles = StyleSheet.create({ fill: { flex: 1 } });
