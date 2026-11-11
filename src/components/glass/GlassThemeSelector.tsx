import { memo, useEffect, useMemo, useRef, useState } from 'react';
import {
  Animated,
  PanResponder,
  Pressable,
  StyleSheet,
  Text,
  View,
  useWindowDimensions,
  type AccessibilityActionEvent,
} from 'react-native';
import Svg, { Defs, LinearGradient, RadialGradient, Rect, Stop } from 'react-native-svg';

import { useReducedMotion } from '../../hooks/useAppActive';
import {
  ORB_PALETTE_LIST,
  ORB_PALETTES,
  ORB_THEME_IDS,
  type OrbPalette,
  type OrbThemeId,
} from '../../orb/orbPalettes';
import { spacing, typography } from '../../theme/tokens';
import { useTheme } from '../../theme/useTheme';

/** Vertical distance between orbs on the arc, in dp. */
export const ARC_GAP = 54;
/** How far an orb bends toward the right per step away from the middle (a parabola). */
export const ARC_BEND = 7;
export const ARC_VISIBLE = 2; // orbs shown above and below the selected one
export const SELECTED_SIZE = 60;
export const SMALL_SIZE = 34;

/** Pure: the nearest theme index for a scroll position, kept inside the list. */
export function indexForPosition(position: number): number {
  return Math.max(0, Math.min(ORB_THEME_IDS.length - 1, Math.round(position)));
}

/** Pure: the next index for a swipe that ended with a velocity, in index units. */
export function settleIndex(position: number, velocityY: number): number {
  // Dragging up (negative velocity) moves toward later themes.
  return indexForPosition(position - velocityY * 0.35);
}

interface GlassThemeSelectorProps {
  selected: OrbThemeId;
  onSelect: (id: OrbThemeId) => void;
  /** True while the microphone is open: choosing is locked so nothing changes mid-recording. */
  disabled?: boolean;
}

/**
 * Choose the orb's colours by turning an arc of small orbs, like a dial: drag up or down, or tap one.
 * The selected orb grows and is named beside the arc, and the real orb above the sheet blends to
 * that palette as the selection moves. Every orb is also a radio button for screen readers, which can
 * step with increment and decrement. Choosing only sets the orb's colours: it never touches a
 * recording, playback, speech or the conversation, and it is locked while the microphone is open.
 */
export function GlassThemeSelector({ selected, onSelect, disabled = false }: GlassThemeSelectorProps) {
  const { colors } = useTheme();
  const reduced = useReducedMotion();
  const selectedIndex = ORB_THEME_IDS.indexOf(selected);
  const position = useRef(new Animated.Value(selectedIndex)).current;
  const current = useRef(selectedIndex);
  const dragStart = useRef(selectedIndex);
  const lastChosen = useRef(selectedIndex);
  const [shownIndex, setShownIndex] = useState(selectedIndex);
  const latest = useRef({ onSelect, disabled, reduced });
  latest.current = { onSelect, disabled, reduced };

  // Keep the arc in step if the theme is changed from somewhere else.
  useEffect(() => {
    const index = ORB_THEME_IDS.indexOf(selected);
    lastChosen.current = index;
    setShownIndex(index);
    Animated.spring(position, { toValue: index, damping: 18, stiffness: 160, useNativeDriver: false }).start();
  }, [selected, position]);

  useEffect(() => {
    const id = position.addListener(({ value }) => {
      current.current = value;
      const nearest = indexForPosition(value);
      if (nearest !== lastChosen.current) {
        lastChosen.current = nearest;
        setShownIndex(nearest);
        latest.current.onSelect(ORB_THEME_IDS[nearest]);
      }
    });
    return () => position.removeListener(id);
  }, [position]);

  const goTo = (index: number) => {
    if (latest.current.disabled) return;
    const target = indexForPosition(index);
    if (latest.current.reduced) {
      position.setValue(target);
      return;
    }
    Animated.spring(position, { toValue: target, damping: 18, stiffness: 160, useNativeDriver: false }).start();
  };

  const pan = useMemo(
    () =>
      PanResponder.create({
        onStartShouldSetPanResponder: () => !latest.current.disabled,
        onMoveShouldSetPanResponder: (_e, g) => !latest.current.disabled && Math.abs(g.dy) > 6 && Math.abs(g.dy) > Math.abs(g.dx),
        onPanResponderGrant: () => {
          position.stopAnimation();
          dragStart.current = current.current;
        },
        onPanResponderMove: (_e, g) => {
          const next = dragStart.current - g.dy / ARC_GAP;
          position.setValue(Math.max(-0.3, Math.min(ORB_THEME_IDS.length - 0.7, next)));
        },
        onPanResponderRelease: (_e, g) => {
          const target = settleIndex(dragStart.current - g.dy / ARC_GAP, g.vy);
          Animated.spring(position, { toValue: target, damping: 18, stiffness: 160, useNativeDriver: false }).start();
        },
      }),
    [position],
  );

  const onAccessibilityAction = (event: AccessibilityActionEvent) => {
    if (event.nativeEvent.actionName === 'increment') goTo(shownIndex + 1);
    if (event.nativeEvent.actionName === 'decrement') goTo(shownIndex - 1);
  };

  const palette = ORB_PALETTES[ORB_THEME_IDS[shownIndex]];
  const { height: windowHeight } = useWindowDimensions();
  // On a short screen the arc shows one orb each side, so the orb above the sheet stays in view.
  const visibleEach = windowHeight >= 700 ? ARC_VISIBLE : 1;
  const arcHeight = ARC_GAP * (visibleEach * 2 + 1);

  return (
    <View
      accessibilityRole="radiogroup"
      accessibilityLabel="Orb colours"
      accessibilityHint="Swipe up or down, or use the increment and decrement actions, to change the orb's colours"
      accessibilityActions={[{ name: 'increment' }, { name: 'decrement' }]}
      onAccessibilityAction={onAccessibilityAction}
      style={styles.root}
    >
      <View {...pan.panHandlers} style={[styles.arc, { height: arcHeight }]}>
        {ORB_PALETTE_LIST.map((item, index) => (
          <ArcOrb
            key={item.id}
            palette={item}
            index={index}
            position={position}
            selected={index === shownIndex}
            disabled={disabled}
            onPress={() => goTo(index)}
          />
        ))}
        <View pointerEvents="none" style={[styles.names, { height: arcHeight }]}>
          <Text style={[styles.name, { color: colors.ink }]}>{palette.name}</Text>
          <Text style={[styles.words, { color: colors.inkMuted }]}>{palette.colorWords}</Text>
        </View>
      </View>
      <Text style={[styles.note, { color: colors.inkMuted }]}>
        {disabled
          ? 'Colours are locked while the microphone is open.'
          : 'Orb colours only change how the orb looks. The assistant’s voice stays the same.'}
      </Text>
    </View>
  );
}

interface ArcOrbProps {
  palette: OrbPalette;
  index: number;
  position: Animated.Value;
  selected: boolean;
  disabled: boolean;
  onPress: () => void;
}

/** One small orb on the arc. Its place, size and brightness are interpolated from the scroll position. */
const ArcOrb = memo(function ArcOrb({ palette, index, position, selected, disabled, onPress }: ArcOrbProps) {
  const { colors } = useTheme();
  const steps = [-3, -2, -1, 0, 1, 2, 3];
  const input = steps.map((d) => index + d);
  const translateY = position.interpolate({ inputRange: input, outputRange: steps.map((d) => -d * ARC_GAP) });
  const translateX = position.interpolate({ inputRange: input, outputRange: steps.map((d) => ARC_BEND * d * d) });
  const scale = position.interpolate({
    inputRange: input,
    outputRange: steps.map((d) => (d === 0 ? 1 : SMALL_SIZE / SELECTED_SIZE)),
    extrapolate: 'clamp',
  });
  const opacity = position.interpolate({
    inputRange: input,
    outputRange: steps.map((d) => (d === 0 ? 1 : Math.abs(d) === 1 ? 0.78 : Math.abs(d) === 2 ? 0.45 : 0)),
    extrapolate: 'clamp',
  });
  return (
    <Animated.View
      style={[
        styles.orbSlot,
        { opacity, transform: [{ translateY }, { translateX }, { scale }] },
      ]}
    >
      <Pressable
        accessibilityRole="radio"
        accessibilityLabel={`${palette.name}, ${palette.colorWords}`}
        accessibilityState={{ selected, disabled }}
        disabled={disabled}
        onPress={onPress}
        hitSlop={14}
        style={styles.orbPress}
      >
        <MiniOrb palette={palette} size={SELECTED_SIZE} />
        {selected ? <View pointerEvents="none" style={[styles.ring, { borderColor: colors.focusRing }]} /> : null}
      </Pressable>
    </Animated.View>
  );
});

/** A still sphere in a palette's colours, for the arc. Cheap: two gradients and no animation. */
function MiniOrb({ palette, size }: { palette: OrbPalette; size: number }) {
  const [top, mid, low, bottom] = palette.base;
  const id = `mini-${palette.id}`;
  return (
    <Svg width={size} height={size}>
      <Defs>
        <LinearGradient id={`${id}-base`} x1="0.2" y1="0" x2="0.6" y2="1">
          <Stop offset="0" stopColor={top} />
          <Stop offset="0.4" stopColor={mid} />
          <Stop offset="0.78" stopColor={low} />
          <Stop offset="1" stopColor={bottom} />
        </LinearGradient>
        <RadialGradient id={`${id}-shine`} cx="34%" cy="26%" r="40%">
          <Stop offset="0" stopColor="#FFFFFF" stopOpacity={0.7} />
          <Stop offset="1" stopColor="#FFFFFF" stopOpacity={0} />
        </RadialGradient>
        <RadialGradient id={`${id}-cloud`} cx="72%" cy="70%" r="42%">
          <Stop offset="0" stopColor={palette.clouds.violet} stopOpacity={0.7} />
          <Stop offset="1" stopColor={palette.clouds.violet} stopOpacity={0} />
        </RadialGradient>
      </Defs>
      <Rect width={size} height={size} rx={size / 2} fill={`url(#${id}-base)`} />
      <Rect width={size} height={size} rx={size / 2} fill={`url(#${id}-cloud)`} />
      <Rect width={size} height={size} rx={size / 2} fill={`url(#${id}-shine)`} />
    </Svg>
  );
}

const styles = StyleSheet.create({
  root: { paddingHorizontal: spacing.lg, gap: spacing.sm },
  arc: { alignSelf: 'stretch', justifyContent: 'center', overflow: 'hidden' },
  orbSlot: {
    position: 'absolute',
    left: spacing.xl + 8,
    top: '50%',
    marginTop: -SELECTED_SIZE / 2,
    width: SELECTED_SIZE,
    height: SELECTED_SIZE,
  },
  ring: { position: 'absolute', left: -5, top: -5, right: -5, bottom: -5, borderRadius: SELECTED_SIZE, borderWidth: 2.5 },
  orbPress: { width: SELECTED_SIZE, height: SELECTED_SIZE, alignItems: 'center', justifyContent: 'center' },
  names: { position: 'absolute', left: spacing.xl + SELECTED_SIZE + 32, right: 0, top: 0, justifyContent: 'center', gap: 2 },
  name: { ...typography.title, fontWeight: '700' },
  words: { ...typography.caption },
  note: { ...typography.caption, paddingBottom: spacing.sm },
});
