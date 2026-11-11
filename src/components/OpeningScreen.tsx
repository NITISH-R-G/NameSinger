import { useEffect, useMemo, useRef } from 'react';
import { Animated, Easing, PanResponder, StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import Svg, { Path } from 'react-native-svg';

import { GlassOrb } from './GlassOrb';
import { typography } from '../theme/tokens';
import { useTheme } from '../theme/useTheme';

export const OPENING_HEADLINE = 'Your name, in a song.';
export const OPENING_HINT = 'Swipe up to enter';
export const OPENING_LABEL = 'NameSinger';

/** Upward travel (dp) or speed (dp per ms) that counts as a deliberate swipe. */
export const SWIPE_DISTANCE = 80;
export const SWIPE_FAST_DISTANCE = 30;
export const SWIPE_FAST_VELOCITY = 0.5;

/**
 * Decides whether a finished drag is a swipe up. `dy` is negative upward (React Native's gesture
 * convention) and `vy` is negative when moving up. A long drag or a short fast flick both count; a
 * mostly sideways or downward drag never does.
 */
export function isSwipeUp(gesture: { dx: number; dy: number; vy: number }): boolean {
  if (Math.abs(gesture.dx) > Math.abs(gesture.dy)) return false;
  if (gesture.dy <= -SWIPE_DISTANCE) return true;
  return gesture.dy <= -SWIPE_FAST_DISTANCE && gesture.vy <= -SWIPE_FAST_VELOCITY;
}

interface OpeningScreenProps {
  /** 0 while the opening is showing, 1 when the conversation has fully taken over. Driven by the shell. */
  progress: Animated.Value;
  /** Vertical distance (px) from the screen centre to where the violet orb will be. */
  targetOffsetY: number;
  /** The user committed to entering (a swipe up, or the accessibility "activate" action). */
  onEnter: () => void;
  reducedMotion: boolean;
  /** False once the transition is running, so a second swipe does nothing. */
  interactive: boolean;
}

/**
 * The first screen: a pale field, one headline, a glass dome rising from the bottom edge with a cobalt
 * glow, and a quiet "Swipe up to enter". The dome follows the finger. On release past a threshold the
 * shell runs `progress` from 0 to 1 and this screen plays its half of the hand-off (the dome rises and
 * becomes a full glass sphere, its wordmark refracts, the headline fades) before dissolving into the
 * violet orb underneath. Everything is native-driven animation; there is no video.
 */
export function OpeningScreen({ progress, targetOffsetY, onEnter, reducedMotion, interactive }: OpeningScreenProps) {
  const { width, height } = useWindowDimensions();
  const { colors } = useTheme();
  const drag = useRef(new Animated.Value(0)).current;
  const pulse = useRef(new Animated.Value(1)).current;
  const bounce = useRef(new Animated.Value(0)).current;
  const enterRef = useRef(onEnter);
  enterRef.current = onEnter;
  const interactiveRef = useRef(interactive);
  interactiveRef.current = interactive;

  const dome = Math.round(width * 1.4);
  const sphere = Math.round(Math.min(width * 0.78, 320));
  const startOffsetY = Math.round(height * 0.26 + dome / 2);
  const endScale = sphere / dome;

  useEffect(() => {
    if (reducedMotion) return undefined;
    const loops = [
      Animated.loop(
        Animated.sequence([
          Animated.timing(pulse, { toValue: 0.62, duration: 1600, easing: Easing.inOut(Easing.sin), useNativeDriver: true }),
          Animated.timing(pulse, { toValue: 1, duration: 1600, easing: Easing.inOut(Easing.sin), useNativeDriver: true }),
        ]),
      ),
      Animated.loop(
        Animated.sequence([
          Animated.timing(bounce, { toValue: -6, duration: 900, easing: Easing.inOut(Easing.quad), useNativeDriver: true }),
          Animated.timing(bounce, { toValue: 0, duration: 900, easing: Easing.inOut(Easing.quad), useNativeDriver: true }),
        ]),
      ),
    ];
    for (const loop of loops) loop.start();
    return () => {
      for (const loop of loops) loop.stop();
    };
  }, [pulse, bounce, reducedMotion]);

  const panResponder = useMemo(
    () =>
      PanResponder.create({
        onMoveShouldSetPanResponder: (_, g) =>
          interactiveRef.current && g.dy < -6 && Math.abs(g.dy) > Math.abs(g.dx) * 1.2,
        onPanResponderMove: (_, g) => {
          if (!interactiveRef.current) return;
          drag.setValue(Math.max(-height * 0.45, Math.min(0, g.dy)));
        },
        onPanResponderRelease: (_, g) => {
          if (interactiveRef.current && isSwipeUp(g)) {
            Animated.timing(drag, { toValue: 0, duration: 420, easing: Easing.out(Easing.cubic), useNativeDriver: true }).start();
            enterRef.current();
          } else {
            Animated.spring(drag, { toValue: 0, useNativeDriver: true, bounciness: 6 }).start();
          }
        },
        onPanResponderTerminate: () => {
          Animated.spring(drag, { toValue: 0, useNativeDriver: true }).start();
        },
      }),
    [drag, height],
  );

  const translateY = useMemo(
    () =>
      Animated.add(
        progress.interpolate({
          inputRange: [0, 0.42, 1],
          outputRange: [startOffsetY, targetOffsetY, targetOffsetY],
          extrapolate: 'clamp',
        }),
        drag.interpolate({ inputRange: [-height, 0], outputRange: [-height * 0.5, 0], extrapolate: 'clamp' }),
      ),
    [progress, drag, startOffsetY, targetOffsetY, height],
  );
  const scale = useMemo(
    () => progress.interpolate({ inputRange: [0, 0.42, 1], outputRange: [1, endScale, endScale], extrapolate: 'clamp' }),
    [progress, endScale],
  );
  const glassOpacity = useMemo(
    () => progress.interpolate({ inputRange: [0, 0.3, 0.55, 1], outputRange: [1, 1, 0, 0], extrapolate: 'clamp' }),
    [progress],
  );
  const labelOpacity = useMemo(
    () => progress.interpolate({ inputRange: [0, 0.1, 0.3, 0.5, 1], outputRange: [0, 0, 1, 0, 0], extrapolate: 'clamp' }),
    [progress],
  );
  const glowFade = useMemo(
    () => progress.interpolate({ inputRange: [0, 0.3, 1], outputRange: [1, 0, 0], extrapolate: 'clamp' }),
    [progress],
  );
  const glow = useMemo(() => Animated.multiply(pulse, glowFade), [pulse, glowFade]);
  const textFade = useMemo(
    () => progress.interpolate({ inputRange: [0, 0.18, 1], outputRange: [1, 0, 0], extrapolate: 'clamp' }),
    [progress],
  );
  const textDim = useMemo(
    () => drag.interpolate({ inputRange: [-height * 0.4, 0], outputRange: [0.45, 1], extrapolate: 'clamp' }),
    [drag, height],
  );
  const textOpacity = useMemo(() => Animated.multiply(textFade, textDim), [textFade, textDim]);
  const backdrop = useMemo(
    () => progress.interpolate({ inputRange: [0, 0.6, 1], outputRange: [1, 1, 0], extrapolate: 'clamp' }),
    [progress],
  );

  return (
    <Animated.View
      {...panResponder.panHandlers}
      accessible
      accessibilityRole="button"
      accessibilityLabel={`NameSinger. ${OPENING_HEADLINE} ${OPENING_HINT}. Double tap to enter.`}
      accessibilityActions={[{ name: 'activate', label: 'Enter NameSinger' }]}
      onAccessibilityAction={() => {
        if (interactiveRef.current) enterRef.current();
      }}
      style={[
        StyleSheet.absoluteFill,
        styles.root,
        { opacity: backdrop, backgroundColor: colors.background },
      ]}
      pointerEvents={interactive ? 'auto' : 'none'}
    >
      <Animated.View style={[styles.headlineBox, { top: height * 0.2, opacity: textOpacity }]}>
        <Text style={[styles.headline, { color: colors.ink }]}>{OPENING_HEADLINE}</Text>
      </Animated.View>

      <Animated.View
        style={{
          position: 'absolute',
          left: (width - dome) / 2,
          top: (height - dome) / 2,
          width: dome,
          height: dome,
          opacity: glassOpacity,
          transform: [{ translateY }, { scale }],
        }}
        pointerEvents="none"
      >
        <GlassOrb
          size={dome}
          glow={glow}
          label={labelOpacity}
          text={OPENING_LABEL}
        />
      </Animated.View>

      <Animated.View style={[styles.hintBox, { opacity: textOpacity }]} pointerEvents="none">
        <Animated.View style={{ transform: [{ translateY: bounce }] }}>
          <Svg width={22} height={12} viewBox="0 0 22 12">
            <Path d="M2 10 L11 2 L20 10" stroke={colors.accent} strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round" fill="none" />
          </Svg>
        </Animated.View>
        <Text style={[styles.hint, { color: colors.inkMuted }]}>{OPENING_HINT}</Text>
      </Animated.View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  root: { overflow: 'hidden' },
  headlineBox: { position: 'absolute', left: 32, right: 32, alignItems: 'center' },
  headline: { ...typography.display, fontSize: 30, lineHeight: 37, textAlign: 'center', fontWeight: '700' },
  hintBox: { position: 'absolute', left: 0, right: 0, bottom: 34, alignItems: 'center', gap: 6 },
  hint: { ...typography.label, fontWeight: '500' },
});
