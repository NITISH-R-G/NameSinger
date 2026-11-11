import { createContext, useContext, useMemo, useRef, type ComponentProps, type ReactNode } from 'react';
import { Animated, StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';
import Svg, { Defs, RadialGradient, Rect, Stop } from 'react-native-svg';
import { BlurTargetView, type BlurView } from 'expo-blur';

import { GlassTargetView } from '../../../modules/refractive-glass';
import { useReducedMotion } from '../../hooks/useAppActive';
import { ORB_PALETTES, type OrbPalette } from '../../orb/orbPalettes';
import { useTheme } from '../../theme/useTheme';
import { useOrbMorph } from '../VoiceOrb';

/**
 * The page the glass sits on. Whatever draws glass needs to know which view to sample, so the page
 * (the ambient colour scene, the orb and the transcript) is drawn inside one target view, and every
 * pane of glass above it reads the backend from here:
 *
 *  - `native`: the refractive-glass module (Android 13+ development build). Glass samples the live
 *    drawing of the target and refracts it with an AGSL shader.
 *  - `blur`: the fallback (Expo Go, iOS, older Android). `expo-blur` blurs the target; nothing bends.
 *
 * One target serves every pane, which is the cheap way to do it.
 */
export type BlurTargetRef = NonNullable<ComponentProps<typeof BlurView>['blurTarget']>;

export type GlassBackend = { kind: 'native'; name: string } | { kind: 'blur'; ref: BlurTargetRef };

export const PAGE_TARGET = 'page';

const GlassBackendContext = createContext<GlassBackend | null>(null);

/** The backend panes sample, or null outside a GlassBackdrop (tests, previews): then they draw without a backdrop. */
export function useGlassBackend(): GlassBackend | null {
  return useContext(GlassBackendContext);
}

interface GlassBackdropProps {
  children: ReactNode;
  /** The page behind the glass: the scene and anything that should show through it. */
  page: ReactNode;
  style?: StyleProp<ViewStyle>;
}

export function GlassBackdrop({ children, page, style }: GlassBackdropProps) {
  const ref: BlurTargetRef = useRef<BlurTargetRef['current']>(null);
  const backend = useMemo<GlassBackend>(
    () => (GlassTargetView ? { kind: 'native', name: PAGE_TARGET } : { kind: 'blur', ref }),
    [ref],
  );
  return (
    <GlassBackendContext.Provider value={backend}>
      <View style={[{ flex: 1 }, style]}>
        {GlassTargetView ? (
          <GlassTargetView name={PAGE_TARGET} style={StyleSheet.absoluteFill}>
            {page}
          </GlassTargetView>
        ) : (
          <BlurTargetView ref={ref} style={StyleSheet.absoluteFill}>
            {page}
          </BlurTargetView>
        )}
        {children}
      </View>
    </GlassBackendContext.Provider>
  );
}

/**
 * Soft colour fields in the selected orb's colours, so the glass has real colour to blur and to
 * pick up as reflections instead of a flat page. It cross-fades with the orb when the colours
 * change (the same blend, so they move together). Static vector art: no per-frame cost.
 */
export function AmbientScene() {
  const { orbTheme, colors, scheme } = useTheme();
  const reduced = useReducedMotion();
  const morph = useOrbMorph(orbTheme, reduced);
  const changing = morph.from !== morph.to;
  const strength = scheme === 'dark' ? 0.34 : 0.3;
  return (
    <View style={[StyleSheet.absoluteFill, { backgroundColor: colors.background }]} pointerEvents="none">
      {changing ? <Fields palette={ORB_PALETTES[morph.from]} strength={strength} idPrefix="from" /> : null}
      <Animated.View style={[StyleSheet.absoluteFill, { opacity: changing ? morph.blend : 1 }]}>
        <Fields palette={ORB_PALETTES[morph.to]} strength={strength} idPrefix="to" />
      </Animated.View>
    </View>
  );
}

function Fields({ palette, strength, idPrefix }: { palette: OrbPalette; strength: number; idPrefix: string }) {
  const [top, mid, low] = palette.base;
  return (
    <Svg width="100%" height="100%" style={StyleSheet.absoluteFill}>
      <Defs>
        <RadialGradient id={`${idPrefix}-a`} cx="12%" cy="8%" r="62%">
          <Stop offset="0" stopColor={mid} stopOpacity={strength} />
          <Stop offset="1" stopColor={mid} stopOpacity={0} />
        </RadialGradient>
        <RadialGradient id={`${idPrefix}-b`} cx="92%" cy="42%" r="58%">
          <Stop offset="0" stopColor={low} stopOpacity={strength * 0.8} />
          <Stop offset="1" stopColor={low} stopOpacity={0} />
        </RadialGradient>
        <RadialGradient id={`${idPrefix}-c`} cx="30%" cy="96%" r="70%">
          <Stop offset="0" stopColor={top} stopOpacity={strength * 1.1} />
          <Stop offset="1" stopColor={top} stopOpacity={0} />
        </RadialGradient>
      </Defs>
      <Rect width="100%" height="100%" fill={`url(#${idPrefix}-a)`} />
      <Rect width="100%" height="100%" fill={`url(#${idPrefix}-b)`} />
      <Rect width="100%" height="100%" fill={`url(#${idPrefix}-c)`} />
    </Svg>
  );
}
