import type { ReactNode } from 'react';
import { Animated, Platform, StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';
import Svg, { Defs, LinearGradient, RadialGradient, Rect, Stop } from 'react-native-svg';
import { BlurView } from 'expo-blur';

import { radius as radii } from '../../theme/tokens';
import { useTheme } from '../../theme/useTheme';
import { processColor } from 'react-native';
import { RefractiveGlassView } from '../../../modules/refractive-glass';
import { PAGE_TARGET, useGlassBackend } from './GlassBackdrop';

interface GlassSurfaceProps {
  children?: ReactNode;
  /** Placement of the glass in its parent: size, flex, margin. */
  style?: StyleProp<ViewStyle>;
  /** Layout of what is inside the glass: padding, direction, gap. */
  contentStyle?: StyleProp<ViewStyle>;
  /** Corner radius. Defaults to the large radius. */
  radius?: number;
  /** Surfaces that carry text use a denser fill, so contrast comes from the glass and not from the page. */
  strong?: boolean;
  /** Round only the top corners (a sheet or a panel rising from the bottom edge). */
  topOnly?: boolean;
  /** Layered shadows under the glass. */
  lifted?: boolean;
  /** Blur the page behind. Turn off for glass that sits on other glass, where the blur would sample the wrong layer. */
  blur?: boolean;
  /** Drives a highlight that slides across the glass as the surface moves (a sheet's open progress). Fallback renderer only. */
  sheen?: Animated.AnimatedInterpolation<number> | Animated.Value;
  /** The pane moves (or sits in something that moves): the native renderer samples the page every frame. */
  animated?: boolean;
}

/**
 * One piece of glass, built as the layers a real pane has, bottom to top:
 *
 *  1. backdrop blur       real: `expo-blur` blurs the page behind (Android through one shared
 *                         BlurTargetView, iOS natively). Not drawn where no target exists.
 *  2. translucent fill    the scheme's glass colour at a restrained opacity
 *  3. palette reflections soft fields of the selected orb's colours, upper left and lower right,
 *                         as if the glass picked up light from the orb (simulated)
 *  4. specular highlight  a bright gradient along the top and a soft pool of light in the upper
 *                         left corner (simulated)
 *  5. bounce light        a faint accent glow along the lower edge, light passing through (simulated)
 *  6. rim                 a hairline whose brightness changes with the angle: bright where the
 *                         light hits, nearly clear at the sides, tinted at the bottom (simulated),
 *                         plus a second inner edge for thickness
 *  7. layered shadow      a tight contact shadow, a wide soft one and a faint accent glow
 *
 * Nothing here bends the content behind it: there is no optical refraction (see
 * native/liquid-glass for the seam where a real renderer would replace this).
 */
export function GlassSurface({
  children,
  style,
  contentStyle,
  radius = radii.lg,
  strong = false,
  topOnly = false,
  lifted = false,
  blur = true,
  sheen,
  animated = false,
}: GlassSurfaceProps) {
  const { glass } = useTheme();
  const backend = useGlassBackend();
  const target = backend?.kind === 'blur' ? backend.ref : null;
  const corners = {
    borderTopLeftRadius: radius,
    borderTopRightRadius: radius,
    borderBottomLeftRadius: topOnly ? 0 : radius,
    borderBottomRightRadius: topOnly ? 0 : radius,
  };
  const shadow = lifted
    ? { boxShadow: `0 6 20 ${glass.shadow}` }
    : null;
  const canBlur = blur && (Platform.OS !== 'android' || target !== null);
  const rimRadius = Math.max(0, radius - 0.75);

  if (backend?.kind === 'native' && RefractiveGlassView) {
    const r = glass.refraction;
    const small = radius < 40;
    return (
      <View style={[corners, shadow, style]}>
        {/* The glass is a leaf drawn behind the content: React children live in an ordinary view. */}
        <RefractiveGlassView
          target={PAGE_TARGET}
          style={StyleSheet.absoluteFill}
          cornerRadius={radius}
          extendBottom={topOnly ? 96 : 0}
          bezel={Math.min(small ? 14 : 22, radius * 0.9)}
          thickness={small ? 18 : 28}
          strength={0.5}
          progressive={topOnly ? 0.5 : 0}
          ior={1.5}
          aberration={0.05}
          frost={strong ? r.frost + 2 : r.frost}
          saturation={r.saturation}
          specular={r.specular}
          lightX={-0.55}
          lightY={-0.85}
          tint={processColor(strong ? r.tintStrong : r.tint) as number}
          glow={processColor(r.glow) as number}
          specularColor={processColor(r.specularColor) as number}
          animated={animated}
        />
        <View style={[styles.native, contentStyle]}>{children}</View>
      </View>
    );
  }

  return (
    <View style={[corners, shadow, style]}>
      <View style={[styles.clip, corners]}>
        {canBlur ? (
          <BlurView
            blurTarget={target ?? undefined}
            blurMethod="dimezisBlurViewSdk31Plus"
            intensity={glass.blurIntensity}
            tint={glass.blurTint}
            style={StyleSheet.absoluteFill}
          />
        ) : null}
        <View
          pointerEvents="none"
          style={[StyleSheet.absoluteFill, { backgroundColor: strong ? glass.fillStrong : glass.fill }]}
        />
        <Svg style={StyleSheet.absoluteFill} pointerEvents="none">
          <Defs>
            <LinearGradient id="gs-top" x1="0" y1="0" x2="0" y2="1">
              <Stop offset="0" stopColor={glass.highlight} stopOpacity={glass.highlightAlpha * 0.6} />
              <Stop offset="0.4" stopColor={glass.highlight} stopOpacity={0} />
            </LinearGradient>
          </Defs>
          <Rect width="100%" height="100%" fill="url(#gs-top)" />
        </Svg>
        {sheen ? (
          <Animated.View
            pointerEvents="none"
            style={[
              styles.sheen,
              {
                backgroundColor: glass.highlight,
                opacity: glass.highlightAlpha * 0.16,
                transform: [{ translateX: sheen }, { rotate: '18deg' }],
              },
            ]}
          />
        ) : null}
        <View style={[styles.content, contentStyle]}>{children}</View>
        <Svg style={StyleSheet.absoluteFill} pointerEvents="none">
          <Defs>
            <LinearGradient id="gs-rim" x1="0" y1="0" x2="1" y2="1">
              <Stop offset="0" stopColor={glass.rimGlow} stopOpacity={0.9} />
              <Stop offset="0.5" stopColor={glass.rim} stopOpacity={0.12} />
              <Stop offset="1" stopColor={glass.rim} stopOpacity={0.3} />
            </LinearGradient>
          </Defs>
          <Rect x={0.5} y={0.5} width="99.7%" height="99.7%" rx={rimRadius} ry={rimRadius} fill="none" stroke="url(#gs-rim)" strokeWidth={1} />
        </Svg>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  native: { flexGrow: 1 },
  clip: { overflow: 'hidden', flexGrow: 1 },
  content: { flexGrow: 1 },
  sheen: { position: 'absolute', top: -40, bottom: -40, width: 70, left: 0 },
});
