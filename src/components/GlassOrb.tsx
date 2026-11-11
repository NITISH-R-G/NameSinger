import { memo, useMemo } from 'react';
import { Animated, StyleSheet, Text, View } from 'react-native';
import Svg, { Circle, Defs, LinearGradient, Path, RadialGradient, Stop } from 'react-native-svg';

import { ORB_PALETTES } from '../orb/orbPalettes';
import { mix } from '../theme/colorMath';
import { typography } from '../theme/tokens';
import { useTheme } from '../theme/useTheme';

interface GlassOrbProps {
  /** Diameter of the glass sphere. */
  size: number;
  /** Opacity of the light that travels along the inside of the rim (the "swipe up" invitation). */
  glow: Animated.AnimatedInterpolation<number> | Animated.Value;
  /** Opacity of the refracted wordmark inside the glass. */
  label: Animated.AnimatedInterpolation<number> | Animated.Value;
  /** The word shown inside the glass. */
  text: string;
}

/** Point on the sphere for an angle in degrees (SVG convention: 0 is right, 270 is straight up). */
function polar(size: number, radius: number, degrees: number): { x: number; y: number } {
  const a = (degrees * Math.PI) / 180;
  return { x: size / 2 + radius * Math.cos(a), y: size / 2 + radius * Math.sin(a) };
}

/** An arc along the sphere, clockwise from one angle to the other. */
function arcPath(size: number, radius: number, from: number, to: number): string {
  const a = polar(size, radius, from);
  const b = polar(size, radius, to);
  return `M ${a.x} ${a.y} A ${radius} ${radius} 0 0 1 ${b.x} ${b.y}`;
}

/**
 * A thin crescent that hugs the rim between two angles: the sphere's edge catching the key light.
 * Its outer edge follows the sphere; its inner edge is a flatter arc, so it tapers to a point at both
 * ends and has no hard edge anywhere.
 */
function crescentPath(size: number, radius: number, from: number, to: number): string {
  const a = polar(size, radius, from);
  const b = polar(size, radius, to);
  const inner = radius * 1.12;
  return `M ${a.x} ${a.y} A ${radius} ${radius} 0 0 1 ${b.x} ${b.y} A ${inner} ${inner} 0 0 0 ${a.x} ${a.y} Z`;
}

/**
 * The glass orb of the opening screen, drawn with vector layers only (no image, no video).
 *
 * It is a clear sphere, not a coloured one: the body is nearly transparent in the middle and a little
 * denser toward the rim, which is what makes a glass ball read as having thickness. Everything else is
 * what light does at the edge of such an object:
 *  - a thin bright rim, brightest where the key light hits (upper left);
 *  - a dispersion band just inside the rim, where the edge splits the light into faint cyan, blue and
 *    violet fringes on opposite sides (offset strokes, not a gradient ring);
 *  - a tapering crescent of reflected light along the upper edge and a soft thickness shade below;
 *  - one arc of light travelling along the inside of the rim, which breathes with `glow` as the
 *    swipe-up invitation.
 * Colour is restrained on purpose: the fringes are a fixed cyan, blue and violet blended a little toward
 * the selected palette, so every palette gets the same quality of glass. The word inside is drawn three
 * times with a small colour offset to suggest refraction as it passes the edge.
 */
function GlassOrbBase({ size, glow, label, text }: GlassOrbProps) {
  const { scheme, colors, orbTheme } = useTheme();
  const orb = ORB_PALETTES[orbTheme];
  const tone = useMemo(() => glassTone(scheme === 'dark', colors.accent), [scheme, colors.accent]);
  const fontSize = Math.round(size * 0.12);
  const R = size / 2 - 1;

  const rimHigh = polar(size, R, 232);
  const rimLow = polar(size, R, 308);
  const glowFrom = polar(size, R - 14, 236);
  const glowTo = polar(size, R - 14, 304);

  return (
    <View style={{ width: size, height: size }} pointerEvents="none">
      <Svg width={size} height={size}>
        <Defs>
          {/* Clear in the middle, denser toward the rim. Many soft stops so it never bands into rings. */}
          <RadialGradient id="glass-body" cx="50%" cy="50%" r="50%">
            <Stop offset="0" stopColor={tone.bodyCore} stopOpacity={tone.coreAlpha} />
            <Stop offset="0.7" stopColor={tone.bodyMid} stopOpacity={tone.coreAlpha + 0.04} />
            <Stop offset="0.86" stopColor={tone.bodyEdge} stopOpacity={tone.edgeAlpha * 0.55} />
            <Stop offset="0.96" stopColor={tone.bodyEdge} stopOpacity={tone.edgeAlpha} />
            <Stop offset="1" stopColor={tone.bodyRim} stopOpacity={tone.edgeAlpha + 0.1} />
          </RadialGradient>
          {/* Volume: lit from above, a little thicker and darker toward the bottom. */}
          <LinearGradient id="glass-volume" x1="0" y1="0" x2="0" y2="1">
            <Stop offset="0" stopColor={tone.lift} stopOpacity={tone.liftAlpha} />
            <Stop offset="0.45" stopColor={tone.lift} stopOpacity={0} />
            <Stop offset="1" stopColor={tone.thick} stopOpacity={tone.thickAlpha} />
          </LinearGradient>
          {/* Dispersion: each fringe is strongest on opposite sides of the sphere. */}
          <LinearGradient id="glass-fringe-a" x1="0" y1="0" x2="1" y2="1">
            <Stop offset="0" stopColor={tone.fringeCyan} stopOpacity={tone.fringeAlpha} />
            <Stop offset="0.5" stopColor={tone.fringeBlue} stopOpacity={tone.fringeAlpha * 0.25} />
            <Stop offset="1" stopColor={tone.fringeBlue} stopOpacity={tone.fringeAlpha * 0.7} />
          </LinearGradient>
          <LinearGradient id="glass-fringe-b" x1="1" y1="0" x2="0" y2="1">
            <Stop offset="0" stopColor={tone.fringeViolet} stopOpacity={tone.fringeAlpha * 0.8} />
            <Stop offset="0.5" stopColor={tone.fringeViolet} stopOpacity={tone.fringeAlpha * 0.2} />
            <Stop offset="1" stopColor={tone.fringeCyan} stopOpacity={tone.fringeAlpha * 0.6} />
          </LinearGradient>
          <LinearGradient id="glass-rim" x1="0.1" y1="0" x2="0.9" y2="1">
            <Stop offset="0" stopColor="#FFFFFF" stopOpacity={tone.rimTop} />
            <Stop offset="0.5" stopColor="#FFFFFF" stopOpacity={tone.rimMid} />
            <Stop offset="1" stopColor={tone.rimEnd} stopOpacity={0.7} />
          </LinearGradient>
          {/* The crescent fades inward from the rim. */}
          <LinearGradient id="glass-crescent" gradientUnits="userSpaceOnUse" x1="0" y1={rimHigh.y - size * 0.05} x2="0" y2={rimHigh.y + size * 0.09}>
            <Stop offset="0" stopColor="#FFFFFF" stopOpacity={tone.crescent} />
            <Stop offset="1" stopColor="#FFFFFF" stopOpacity={0} />
          </LinearGradient>
          {/* The travelling arcs fade out at both ends. */}
          <LinearGradient id="glass-sheen" gradientUnits="userSpaceOnUse" x1={rimHigh.x} y1="0" x2={rimLow.x} y2="0">
            <Stop offset="0" stopColor="#FFFFFF" stopOpacity={0} />
            <Stop offset="0.35" stopColor="#FFFFFF" stopOpacity={tone.sheen} />
            <Stop offset="0.7" stopColor="#FFFFFF" stopOpacity={tone.sheen * 0.35} />
            <Stop offset="1" stopColor="#FFFFFF" stopOpacity={0} />
          </LinearGradient>
        </Defs>

        <Circle cx={size / 2} cy={size / 2} r={R} fill="url(#glass-body)" />
        <Circle cx={size / 2} cy={size / 2} r={R} fill="url(#glass-volume)" />

        <Circle cx={size / 2 - 1.2} cy={size / 2 + 0.6} r={R - 3} fill="none" stroke="url(#glass-fringe-a)" strokeWidth={3.4} />
        <Circle cx={size / 2 + 1.2} cy={size / 2 - 0.6} r={R - 3} fill="none" stroke="url(#glass-fringe-b)" strokeWidth={3.4} />
        <Circle cx={size / 2} cy={size / 2} r={R - 6} fill="none" stroke={tone.thick} strokeOpacity={0.12} strokeWidth={0.8} />
        <Circle cx={size / 2} cy={size / 2} r={R - 0.5} fill="none" stroke="url(#glass-rim)" strokeWidth={1.8} />

        <Path d={crescentPath(size, R - 3, 222, 318)} fill="url(#glass-crescent)" />
        <Path d={arcPath(size, R - 8, 232, 308)} fill="none" stroke="url(#glass-sheen)" strokeWidth={Math.max(2, size * 0.004)} strokeLinecap="round" />
      </Svg>

      {/* The light travelling along the inside of the rim; it breathes with `glow`. */}
      <Animated.View style={[StyleSheet.absoluteFill, { opacity: glow }]}>
        <Svg width={size} height={size}>
          <Defs>
            <LinearGradient id="glass-travel-g" gradientUnits="userSpaceOnUse" x1={glowFrom.x} y1="0" x2={glowTo.x} y2="0">
              <Stop offset="0" stopColor={tone.fringeCyan} stopOpacity={0} />
              <Stop offset="0.3" stopColor={tone.fringeCyan} stopOpacity={tone.travel * 0.8} />
              <Stop offset="0.5" stopColor="#FFFFFF" stopOpacity={tone.travel} />
              <Stop offset="0.72" stopColor={tone.fringeViolet} stopOpacity={tone.travel * 0.7} />
              <Stop offset="1" stopColor={tone.fringeViolet} stopOpacity={0} />
            </LinearGradient>
          </Defs>
          <Path d={arcPath(size, R - 16, 240, 300)} fill="none" stroke="url(#glass-travel-g)" strokeWidth={Math.max(3, size * 0.007)} strokeLinecap="round" />
          <Path d={arcPath(size, R - 16 - Math.max(5, size * 0.012), 246, 296)} fill="none" stroke="url(#glass-travel-g)" strokeOpacity={0.45} strokeWidth={Math.max(2, size * 0.003)} strokeLinecap="round" />
        </Svg>
      </Animated.View>

      <Animated.View style={[StyleSheet.absoluteFill, styles.labelBox, { opacity: label }]}>
        <Text style={[styles.label, { fontSize, color: orb.clouds.sky, transform: [{ translateX: -2 }] }]}>{text}</Text>
        <Text style={[styles.label, { fontSize, color: orb.clouds.violet, transform: [{ translateX: 2 }] }]}>{text}</Text>
        <Text style={[styles.label, { fontSize, color: colors.ink }]}>{text}</Text>
      </Animated.View>
    </View>
  );
}

/**
 * The glass for a scheme. The neutral is the glass itself; the accent only leans it a few percent so
 * the orb still belongs to the selected palette. Fringe colours are a fixed cyan, blue and violet.
 */
function glassTone(dark: boolean, accent: string) {
  const fringeCyan = mix('#8FD6F2', accent, 0.18);
  const fringeBlue = mix('#8FA8F4', accent, 0.18);
  const fringeViolet = mix('#BCA6F2', accent, 0.18);
  return dark
    ? {
        bodyCore: mix('#9AA4CC', accent, 0.1),
        coreAlpha: 0.1,
        bodyMid: mix('#6F7AA8', accent, 0.1),
        bodyEdge: mix('#5B6592', accent, 0.12),
        bodyRim: mix('#8B93BE', accent, 0.12),
        edgeAlpha: 0.42,
        lift: '#FFFFFF',
        liftAlpha: 0.07,
        thick: mix('#0B0E1E', accent, 0.1),
        thickAlpha: 0.3,
        fringeCyan,
        fringeBlue,
        fringeViolet,
        fringeAlpha: 0.38,
        rimTop: 0.85,
        rimMid: 0.2,
        rimEnd: mix('#B9C0E0', accent, 0.2),
        crescent: 0.3,
        sheen: 0.55,
        travel: 0.55,
      }
    : {
        bodyCore: '#FFFFFF',
        coreAlpha: 0.14,
        bodyMid: mix('#F1F3FA', accent, 0.04),
        bodyEdge: mix('#DDE1F0', accent, 0.08),
        bodyRim: mix('#CED4EA', accent, 0.1),
        edgeAlpha: 0.5,
        lift: '#FFFFFF',
        liftAlpha: 0.4,
        thick: mix('#8F98BC', accent, 0.2),
        thickAlpha: 0.12,
        fringeCyan,
        fringeBlue,
        fringeViolet,
        fringeAlpha: 0.4,
        rimTop: 1,
        rimMid: 0.4,
        rimEnd: mix('#B4BCDC', accent, 0.2),
        crescent: 0.75,
        sheen: 0.95,
        travel: 0.8,
      };
}

const styles = StyleSheet.create({
  labelBox: { alignItems: 'center', justifyContent: 'center' },
  label: { ...typography.display, position: 'absolute', fontWeight: '800', opacity: 0.9 },
});

export const GlassOrb = memo(GlassOrbBase);
