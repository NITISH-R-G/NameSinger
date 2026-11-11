import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import {
  Animated,
  BackHandler,
  Easing,
  PanResponder,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
  useWindowDimensions,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useReducedMotion } from '../../hooks/useAppActive';
import { spacing, typography } from '../../theme/tokens';
import { useTheme } from '../../theme/useTheme';
import { GlassSurface } from './GlassSurface';

interface GlassBottomSheetProps {
  visible: boolean;
  onClose: () => void;
  title: string;
  children: ReactNode;
  /** Long content scrolls inside the sheet, which then fills most of the screen. */
  scrollable?: boolean;
}

/** A drag past this fraction of the sheet's height, or a fast flick, closes it. */
export const CLOSE_DRAG_FRACTION = 0.28;
export const CLOSE_FLICK_VELOCITY = 0.9;

/** Pure: whether a release of the drag handle closes the sheet. */
export function shouldCloseSheet(dy: number, vy: number, height: number): boolean {
  return dy > height * CLOSE_DRAG_FRACTION || vy > CLOSE_FLICK_VELOCITY;
}

/**
 * A sheet of glass that rises from the bottom edge. It follows the finger while dragged by its
 * handle and settles with a spring, so opening and closing feel continuous. It closes with the
 * handle's drag, a tap on the dimmed page, the Close button (the way for people who cannot drag)
 * or the Android back button. The motion is native-driven; only the open or closed state is React state.
 */
export function GlassBottomSheet({ visible, onClose, title, children, scrollable = false }: GlassBottomSheetProps) {
  const { colors } = useTheme();
  const reduced = useReducedMotion();
  const insets = useSafeAreaInsets();
  const { height: windowHeight, width: windowWidth } = useWindowDimensions();
  const [mounted, setMounted] = useState(visible);
  const [sheetHeight, setSheetHeight] = useState(Math.round(windowHeight * 0.6));
  const progress = useRef(new Animated.Value(0)).current; // 0 closed, 1 open
  const heightRef = useRef(sheetHeight);
  heightRef.current = sheetHeight;
  // Open or close with a spring (or at once with reduced motion).
  useEffect(() => {
    if (visible) setMounted(true);
    if (!visible && !mounted) return undefined;
    const animation = reduced
      ? Animated.timing(progress, { toValue: visible ? 1 : 0, duration: 0, useNativeDriver: true })
      : visible
        ? Animated.spring(progress, { toValue: 1, damping: 22, stiffness: 190, mass: 0.9, useNativeDriver: true })
        : Animated.timing(progress, { toValue: 0, duration: 240, easing: Easing.in(Easing.cubic), useNativeDriver: true });
    animation.start(({ finished }) => {
      if (finished && !visible) setMounted(false);
    });
    return () => animation.stop();
  }, [visible, mounted, reduced, progress]);

  // Android back closes the sheet first.
  useEffect(() => {
    if (!visible) return undefined;
    const subscription = BackHandler.addEventListener('hardwareBackPress', () => {
      onClose();
      return true;
    });
    return () => subscription.remove();
  }, [visible, onClose]);

  const pan = useMemo(
    () =>
      PanResponder.create({
        onStartShouldSetPanResponder: () => true,
        onMoveShouldSetPanResponder: (_e, g) => Math.abs(g.dy) > 4,
        onPanResponderGrant: () => progress.stopAnimation(),
        onPanResponderMove: (_e, g) => {
          const height = Math.max(1, heightRef.current);
          progress.setValue(Math.max(0, Math.min(1.04, 1 - g.dy / height)));
        },
        onPanResponderRelease: (_e, g) => {
          if (shouldCloseSheet(g.dy, g.vy, heightRef.current)) {
            onClose();
          } else {
            Animated.spring(progress, { toValue: 1, damping: 22, stiffness: 190, useNativeDriver: true }).start();
          }
        },
        onPanResponderTerminate: () => {
          Animated.spring(progress, { toValue: 1, damping: 22, stiffness: 190, useNativeDriver: true }).start();
        },
      }),
    [progress, onClose],
  );

  const translateY = useMemo(
    () => progress.interpolate({ inputRange: [0, 1], outputRange: [sheetHeight, 0] }),
    [progress, sheetHeight],
  );
  // A highlight that sweeps across the glass as the sheet rises.
  const sheen = useMemo(
    () => progress.interpolate({ inputRange: [0, 1], outputRange: [-90, windowWidth * 0.8], extrapolate: 'clamp' }),
    [progress, windowWidth],
  );
  const scrim = useMemo(() => progress.interpolate({ inputRange: [0, 1], outputRange: [0, 1], extrapolate: 'clamp' }), [progress]);

  if (!mounted) return null;

  return (
    <View style={StyleSheet.absoluteFill} pointerEvents="box-none">
      <Animated.View style={[StyleSheet.absoluteFill, { backgroundColor: colors.scrim, opacity: scrim }]}>
        <Pressable
          style={StyleSheet.absoluteFill}
          onPress={onClose}
          accessibilityRole="button"
          accessibilityLabel={`Close ${title}`}
        />
      </Animated.View>
      <Animated.View
        style={[styles.sheet, { transform: [{ translateY }] }]}
        onLayout={(event) => setSheetHeight(Math.round(event.nativeEvent.layout.height))}
        accessibilityViewIsModal
      >
        <GlassSurface topOnly radius={30} lifted sheen={sheen} animated>
          <View {...pan.panHandlers} style={styles.handleArea} accessibilityElementsHidden importantForAccessibility="no">
            <View style={[styles.handle, { backgroundColor: colors.inkMuted }]} />
          </View>
          <View style={styles.titleRow}>
            <Text accessibilityRole="header" style={[styles.title, { color: colors.ink }]}>
              {title}
            </Text>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={`Close ${title}`}
              onPress={onClose}
              hitSlop={8}
              style={styles.close}
            >
              <Text style={[styles.closeText, { color: colors.primary }]}>Done</Text>
            </Pressable>
          </View>
          {scrollable ? (
            <ScrollView
              style={{ maxHeight: windowHeight * 0.78 }}
              contentContainerStyle={{ paddingBottom: Math.max(insets.bottom, spacing.lg) }}
              keyboardShouldPersistTaps="handled"
            >
              {children}
            </ScrollView>
          ) : (
            <View style={{ paddingBottom: Math.max(insets.bottom, spacing.lg) }}>{children}</View>
          )}
        </GlassSurface>
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  sheet: { position: 'absolute', left: 0, right: 0, bottom: 0 },
  handleArea: { height: 28, alignItems: 'center', justifyContent: 'center' },
  handle: { width: 40, height: 4, borderRadius: 2, opacity: 0.5 },
  titleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.sm,
  },
  title: { ...typography.title },
  close: { minHeight: 48, minWidth: 48, alignItems: 'center', justifyContent: 'center' },
  closeText: { ...typography.label, fontWeight: '700' },
});
