import { memo, useEffect, useMemo, useRef, useState } from 'react';
import { Animated, Easing, StyleSheet, View } from 'react-native';
import Svg, { Defs, LinearGradient, RadialGradient, Rect, Stop } from 'react-native-svg';

import type { LevelSource } from '../audio/levels';
import { useAppActive, useReducedMotion } from '../hooks/useAppActive';
import { CLOUDS, type CloudSpec } from '../orb/palette';
import { ORB_PALETTES, type OrbPalette, type OrbThemeId } from '../orb/orbPalettes';
import { orbDescription, orbMotion, type OrbState } from '../orb/orbState';
import { useTheme } from '../theme/useTheme';

interface VoiceOrbProps {
  state: OrbState;
  /** Where the orb gets its reaction from: the microphone while listening, the song while playing. */
  level: LevelSource;
  /** Width and height of the box the orb lives in. */
  size: number;
  /** Colour identity to draw. Defaults to the one chosen in the theme. */
  theme?: OrbThemeId;
}

/**
 * The orb. Rendering only: it is told a state and given a level source, and decides nothing about
 * audio. All motion uses React Native's Animated with the native driver, so the JS thread only
 * hands over a new level (about 10 to 30 times a second) and never re-renders React for it:
 *
 *  - clouds, each rotating around the orb's centre at its own speed, give the flowing texture;
 *  - the whole orb grows with the level, and its contour (an ellipse that slowly turns) stretches a
 *    little with it, so the outline responds to sound while the orb stays round overall;
 *  - white clouds brighten with the level;
 *  - a slow breath that depends only on the state (idle, making a song) is the only motion that
 *    is not driven by audio, and it is small.
 *
 * Colour is separate from all of that: the orb draws the palette of the selected orb theme and
 * blends to a new one without restarting the motion (see useOrbMorph). The theme never affects the
 * state, the level or the audio.
 */
function VoiceOrbBase({ state, level, size, theme }: VoiceOrbProps) {
  const reduced = useReducedMotion();
  const appActive = useAppActive();
  const { orbTheme } = useTheme();
  const morph = useOrbMorph(theme ?? orbTheme, reduced);
  const motion = useMemo(() => orbMotion(state, reduced), [state, reduced]);
  const running = appActive && motion.ambient;

  const levelValue = useRef(new Animated.Value(0)).current;
  const baseScale = useRef(new Animated.Value(motion.baseScale)).current;
  const opacity = useRef(new Animated.Value(motion.opacity)).current;
  const breath = useRef(new Animated.Value(0)).current;
  const contourTurn = useRef(new Animated.Value(0)).current;
  const spins = useRef(CLOUDS.map(() => new Animated.Value(0))).current;

  // Follow the level source. One subscription; each update is a short native-driven interpolation.
  useEffect(() => {
    let previous = level.get();
    levelValue.setValue(previous);
    const unsubscribe = level.subscribe((next) => {
      const rising = next > previous;
      previous = next;
      Animated.timing(levelValue, {
        toValue: next,
        duration: rising ? 70 : 150,
        easing: Easing.out(Easing.quad),
        useNativeDriver: true,
      }).start();
    });
    return () => {
      unsubscribe();
      levelValue.stopAnimation();
    };
  }, [level, levelValue]);

  // State changes ease the orb to its new resting size and opacity.
  useEffect(() => {
    const transition = Animated.parallel([
      Animated.timing(baseScale, {
        toValue: motion.baseScale,
        duration: reduced ? 0 : 700,
        easing: Easing.inOut(Easing.cubic),
        useNativeDriver: true,
      }),
      Animated.timing(opacity, {
        toValue: motion.opacity,
        duration: reduced ? 0 : 500,
        useNativeDriver: true,
      }),
    ]);
    transition.start();
    return () => transition.stop();
  }, [motion.baseScale, motion.opacity, reduced, baseScale, opacity]);

  // Continuous flow: only while on screen, in the foreground and motion is allowed.
  useEffect(() => {
    if (!running) return undefined;
    const loops = [
      ...CLOUDS.map((cloud, index) =>
        Animated.loop(
          Animated.timing(spins[index], {
            toValue: 1,
            duration: cloud.spinMs,
            easing: Easing.linear,
            useNativeDriver: true,
          }),
        ),
      ),
      Animated.loop(
        Animated.timing(contourTurn, {
          toValue: 1,
          duration: 11000,
          easing: Easing.linear,
          useNativeDriver: true,
        }),
      ),
    ];
    for (const loop of loops) loop.start();
    return () => {
      for (const loop of loops) loop.stop();
    };
  }, [running, spins, contourTurn]);

  // The slow, state-based breath.
  useEffect(() => {
    if (!running || motion.breathe === 0) {
      breath.setValue(0);
      return undefined;
    }
    const half = motion.breatheMs / 2;
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(breath, { toValue: 1, duration: half, easing: Easing.inOut(Easing.sin), useNativeDriver: true }),
        Animated.timing(breath, { toValue: 0, duration: half, easing: Easing.inOut(Easing.sin), useNativeDriver: true }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [running, motion.breathe, motion.breatheMs, breath]);

  const scale = useMemo(
    () =>
      Animated.add(
        Animated.add(baseScale, levelValue.interpolate({ inputRange: [0, 1], outputRange: [0, motion.levelGain] })),
        breath.interpolate({ inputRange: [0, 1], outputRange: [0, motion.breathe] }),
      ),
    [baseScale, levelValue, breath, motion.levelGain, motion.breathe],
  );
  const glowScale = useMemo(() => Animated.multiply(scale, 1.2), [scale]);
  const contourX = useMemo(
    () => levelValue.interpolate({ inputRange: [0, 1], outputRange: [1, 1 + motion.contour] }),
    [levelValue, motion.contour],
  );
  const contourY = useMemo(
    () => levelValue.interpolate({ inputRange: [0, 1], outputRange: [1, 1 - motion.contour * 0.7] }),
    [levelValue, motion.contour],
  );
  const contourDeg = useMemo(
    () => contourTurn.interpolate({ inputRange: [0, 1], outputRange: ['0deg', '360deg'] }),
    [contourTurn],
  );
  const liftOpacity = useMemo(
    () => levelValue.interpolate({ inputRange: [0, 1], outputRange: [0.72, Math.min(1, 0.72 + motion.cloudLift)] }),
    [levelValue, motion.cloudLift],
  );
  const glowOpacity = useMemo(
    () => levelValue.interpolate({ inputRange: [0, 1], outputRange: [0.55, 1] }),
    [levelValue],
  );

  const changing = morph.from !== morph.to;
  const topBlend = changing ? morph.blend : 1;

  return (
    <View
      accessible
      accessibilityRole="image"
      accessibilityLabel={orbDescription(state)}
      style={{ width: size, height: size, alignItems: 'center', justifyContent: 'center' }}
    >
      <Animated.View
        pointerEvents="none"
        style={[StyleSheet.absoluteFill, { opacity: Animated.multiply(opacity, glowOpacity), transform: [{ scale: glowScale }] }]}
      >
        {changing ? <Glow palette={ORB_PALETTES[morph.from]} size={size} idPrefix="from" /> : null}
        <Animated.View pointerEvents="none" style={[StyleSheet.absoluteFill, { opacity: topBlend }]}>
          <Glow palette={ORB_PALETTES[morph.to]} size={size} idPrefix="to" />
        </Animated.View>
      </Animated.View>

      <Animated.View style={{ width: size, height: size, opacity, transform: [{ scale }] }}>
        <Animated.View style={{ width: size, height: size, transform: [{ rotate: contourDeg }] }}>
          <Animated.View
            style={{
              width: size,
              height: size,
              borderRadius: size / 2,
              overflow: 'hidden',
              backgroundColor: ORB_PALETTES[morph.from].fallback,
              transform: [{ scaleX: contourX }, { scaleY: contourY }],
            }}
          >
            {changing ? (
              <PaletteBody
                palette={ORB_PALETTES[morph.from]}
                size={size}
                spins={spins}
                liftOpacity={liftOpacity}
                idPrefix="from"
              />
            ) : null}
            <Animated.View pointerEvents="none" style={[StyleSheet.absoluteFill, { opacity: topBlend }]}>
              <PaletteBody
                palette={ORB_PALETTES[morph.to]}
                size={size}
                spins={spins}
                liftOpacity={liftOpacity}
                idPrefix="to"
              />
            </Animated.View>
          </Animated.View>
        </Animated.View>
      </Animated.View>
    </View>
  );
}

export const ORB_MORPH_MS = 900;

export interface OrbMorph {
  /** The palette underneath while a change is in progress (the same as `to` when settled). */
  from: OrbThemeId;
  to: OrbThemeId;
  /** 0 to 1 while `to` fades in over `from`. Native-driven; only used when from !== to. */
  blend: Animated.Value;
}

/**
 * Blends the orb from one colour identity to the next without restarting it. The old palette stays
 * drawn underneath while the new one fades in on top (opacity only, native driver), and both share
 * the same drifting clouds, so the flow never stops or jumps. The extra layer exists only for the
 * ~0.9 s of the change. Nothing here touches audio, recording or the conversation.
 */
export function useOrbMorph(theme: OrbThemeId, reduced: boolean): OrbMorph {
  const [layers, setLayers] = useState<{ from: OrbThemeId; to: OrbThemeId }>({ from: theme, to: theme });
  const blend = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    if (theme === layers.to) return undefined;
    if (reduced) {
      setLayers({ from: theme, to: theme });
      return undefined;
    }
    blend.setValue(0);
    setLayers({ from: layers.to, to: theme });
    const animation = Animated.timing(blend, {
      toValue: 1,
      duration: ORB_MORPH_MS,
      easing: Easing.inOut(Easing.cubic),
      useNativeDriver: true,
    });
    animation.start(({ finished }) => {
      if (finished) setLayers((current) => ({ from: current.to, to: current.to }));
    });
    return () => animation.stop();
    // `layers.to` is read once at the start of a change; it must not restart the animation.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [theme, reduced, blend]);

  return { from: layers.from, to: layers.to, blend };
}

function Glow({ palette, size, idPrefix }: { palette: OrbPalette; size: number; idPrefix: string }) {
  return (
    <Svg width={size} height={size} style={StyleSheet.absoluteFill}>
      <Defs>
        <RadialGradient id={`${idPrefix}-orb-glow`} cx="50%" cy="50%" r="50%">
          <Stop offset="0.55" stopColor={palette.glow} stopOpacity={0.3} />
          <Stop offset="1" stopColor={palette.glow} stopOpacity={0} />
        </RadialGradient>
      </Defs>
      <Rect width={size} height={size} fill={`url(#${idPrefix}-orb-glow)`} />
    </Svg>
  );
}

interface PaletteBodyProps {
  palette: OrbPalette;
  size: number;
  spins: Animated.Value[];
  liftOpacity: Animated.AnimatedInterpolation<number>;
  idPrefix: string;
}

/** Everything inside the sphere for one colour identity: body gradient, drifting clouds, depth and shine. */
function PaletteBody({ palette, size, spins, liftOpacity, idPrefix }: PaletteBodyProps) {
  const [top, mid, low, bottom] = palette.base;
  return (
    <>
      <Svg width={size} height={size} style={StyleSheet.absoluteFill}>
        <Defs>
          <LinearGradient id={`${idPrefix}-orb-base`} x1="0.2" y1="0" x2="0.6" y2="1">
            <Stop offset="0" stopColor={top} />
            <Stop offset="0.38" stopColor={mid} />
            <Stop offset="0.75" stopColor={low} />
            <Stop offset="1" stopColor={bottom} />
          </LinearGradient>
        </Defs>
        <Rect width={size} height={size} fill={`url(#${idPrefix}-orb-base)`} />
      </Svg>

      {CLOUDS.map((cloud, index) => (
        <CloudLayer
          key={cloud.id}
          cloud={cloud}
          color={palette.clouds[cloud.role]}
          size={size}
          spin={spins[index]}
          opacity={cloud.lifts ? liftOpacity : undefined}
          idPrefix={idPrefix}
        />
      ))}

      <Svg width={size} height={size} style={StyleSheet.absoluteFill} pointerEvents="none">
        <Defs>
          <RadialGradient id={`${idPrefix}-orb-depth`} cx="50%" cy="46%" r="55%">
            <Stop offset="0.6" stopColor={palette.depth} stopOpacity={0} />
            <Stop offset="1" stopColor={palette.depth} stopOpacity={0.32} />
          </RadialGradient>
          <RadialGradient id={`${idPrefix}-orb-shine`} cx="32%" cy="22%" r="34%">
            <Stop offset="0" stopColor="#FFFFFF" stopOpacity={0.5} />
            <Stop offset="1" stopColor="#FFFFFF" stopOpacity={0} />
          </RadialGradient>
        </Defs>
        <Rect width={size} height={size} fill={`url(#${idPrefix}-orb-depth)`} />
        <Rect width={size} height={size} fill={`url(#${idPrefix}-orb-shine)`} />
      </Svg>
    </>
  );
}

interface CloudLayerProps {
  cloud: CloudSpec;
  color: string;
  size: number;
  spin: Animated.Value;
  opacity?: Animated.AnimatedInterpolation<number>;
  idPrefix: string;
}

function CloudLayer({ cloud, color, size, spin, opacity, idPrefix }: CloudLayerProps) {
  const rotate = useMemo(
    () =>
      spin.interpolate({
        inputRange: [0, 1],
        outputRange: cloud.direction === 1 ? ['0deg', '360deg'] : ['360deg', '0deg'],
      }),
    [spin, cloud.direction],
  );
  const gradientId = `${idPrefix}-orb-cloud-${cloud.id}`;
  return (
    <Animated.View
      pointerEvents="none"
      style={[StyleSheet.absoluteFill, { opacity: opacity ?? 1, transform: [{ rotate }] }]}
    >
      <Svg width={size} height={size}>
        <Defs>
          <RadialGradient
            id={gradientId}
            cx={cloud.cx * size}
            cy={cloud.cy * size}
            r={cloud.r * size}
            gradientUnits="userSpaceOnUse"
          >
            {cloud.stops.map(([offset, stopOpacity]) => (
              <Stop key={offset} offset={offset} stopColor={color} stopOpacity={stopOpacity} />
            ))}
          </RadialGradient>
        </Defs>
        <Rect width={size} height={size} fill={`url(#${gradientId})`} />
      </Svg>
    </Animated.View>
  );
}

export const VoiceOrb = memo(VoiceOrbBase);
