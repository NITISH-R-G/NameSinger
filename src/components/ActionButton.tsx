import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import Svg, { Path } from 'react-native-svg';

import {
  BUTTON_MIN_HEIGHT,
  buttonSpecs,
  resolveButtonColors,
  type ButtonVariant,
} from '../theme/buttonStyles';
import { minTouchTarget, radius, spacing, typography } from '../theme/tokens';
import { useTheme } from '../theme/useTheme';
import { buttonA11y } from '../utils/accessibility';

export type { ButtonVariant };

interface ActionButtonProps {
  label: string;
  onPress: () => void;
  /** What the button means; see theme/buttonStyles.ts. Defaults to the main forward action. */
  variant?: ButtonVariant;
  disabled?: boolean;
  /** Work is in progress: shows a spinner, ignores presses and reports a busy state. */
  loading?: boolean;
  accessibilityHint?: string;
  /** Set on a button that reveals or hides content, so a screen reader says expanded or collapsed. */
  expanded?: boolean;
}

/**
 * The only button in the app. Full-width variants fill their container, so put them in a card or
 * directly on the screen for a primary action, or two of them in a ButtonRow to share a row.
 * The contextual variant sizes itself to its label for actions that belong to a card or list row.
 */
export function ActionButton({
  label,
  onPress,
  variant = 'primary',
  disabled = false,
  loading = false,
  accessibilityHint,
  expanded,
}: ActionButtonProps) {
  const { colors: palette } = useTheme();
  const spec = buttonSpecs(palette)[variant];
  const inactive = disabled || loading;
  return (
    <Pressable
      {...buttonA11y({ label, disabled: inactive, busy: loading, hint: accessibilityHint, expanded })}
      disabled={inactive}
      onPress={onPress}
      style={({ pressed }) => {
        const colors = resolveButtonColors(variant, { pressed, inactive }, palette);
        return [
          styles.base,
          spec.fullWidth ? styles.fullWidth : styles.contextual,
          {
            backgroundColor: colors.background,
            borderColor: colors.border,
            borderWidth: spec.border === 'transparent' ? 0 : 1.5,
            paddingHorizontal: spec.paddingHorizontal,
          },
          pressed && !inactive && styles.pressed,
        ];
      }}
    >
      {({ pressed }) => {
        const colors = resolveButtonColors(variant, { pressed, inactive }, palette);
        return (
          <View style={styles.content}>
            {loading ? <ActivityIndicator size="small" color={colors.text} /> : null}
            <Text style={[styles.label, { color: colors.text, fontSize: spec.fontSize }]}>{label}</Text>
          </View>
        );
      }}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  base: {
    minHeight: BUTTON_MIN_HEIGHT,
    borderRadius: radius.pill,
    paddingVertical: spacing.sm,
    alignItems: 'center',
    justifyContent: 'center',
  },
  // flexGrow lets the two buttons in a ButtonRow match heights when one label wraps.
  fullWidth: { alignSelf: 'stretch', flexGrow: 1 },
  contextual: { alignSelf: 'flex-start' },
  pressed: { transform: [{ scale: 0.98 }] },
  content: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: spacing.sm },
  label: { ...typography.label, fontWeight: '700', textAlign: 'center', flexShrink: 1 },
});

export type IconName = 'mic' | 'stop' | 'play' | 'pause' | 'send' | 'settings' | 'speaker' | 'speaker-off' | 'palette';

export const ICON_PATHS: Record<IconName, string> = {
  palette:
    'M12 3a9 9 0 0 0 0 18c.83 0 1.5-.67 1.5-1.5 0-.39-.15-.74-.39-1.01-.23-.26-.38-.61-.38-.99 0-.83.67-1.5 1.5-1.5H16c2.76 0 5-2.24 5-5 0-4.42-4.03-8-9-8zm-5.5 9c-.83 0-1.5-.67-1.5-1.5S5.67 9 6.5 9 8 9.67 8 10.5 7.33 12 6.5 12zm3-4C8.67 8 8 7.33 8 6.5S8.67 5 9.5 5s1.5.67 1.5 1.5S10.33 8 9.5 8zm5 0c-.83 0-1.5-.67-1.5-1.5S13.67 5 14.5 5s1.5.67 1.5 1.5S15.33 8 14.5 8zm3 4c-.83 0-1.5-.67-1.5-1.5S16.67 9 17.5 9s1.5.67 1.5 1.5-.67 1.5-1.5 1.5z',
  mic: 'M12 14a3 3 0 0 0 3-3V6a3 3 0 0 0-6 0v5a3 3 0 0 0 3 3zm5-3a5 5 0 0 1-10 0H5a7 7 0 0 0 6 6.92V21h2v-3.08A7 7 0 0 0 19 11z',
  stop: 'M7 7h10v10H7z',
  play: 'M8 5v14l11-7z',
  pause: 'M7 5h4v14H7zM13 5h4v14h-4z',
  send: 'M2.01 21L23 12 2.01 3 2 10l15 2-15 2z',
  settings:
    'M19.14 12.94c.04-.3.06-.61.06-.94 0-.32-.02-.64-.07-.94l2.03-1.58a.49.49 0 0 0 .12-.61l-1.92-3.32a.488.488 0 0 0-.59-.22l-2.39.96c-.5-.38-1.03-.7-1.62-.94l-.36-2.54a.484.484 0 0 0-.48-.41h-3.84c-.24 0-.43.17-.47.41l-.36 2.54c-.59.24-1.13.57-1.62.94l-2.39-.96c-.22-.08-.47 0-.59.22L2.74 8.87c-.12.21-.08.47.12.61l2.03 1.58c-.05.3-.09.63-.09.94s.02.64.07.94l-2.03 1.58a.49.49 0 0 0-.12.61l1.92 3.32c.12.22.37.29.59.22l2.39-.96c.5.38 1.03.7 1.62.94l.36 2.54c.05.24.24.41.48.41h3.84c.24 0 .44-.17.47-.41l.36-2.54c.59-.24 1.13-.56 1.62-.94l2.39.96c.22.08.47 0 .59-.22l1.92-3.32c.12-.22.07-.47-.12-.61l-2.01-1.58zM12 15.6A3.6 3.6 0 1 1 12 8.4a3.6 3.6 0 0 1 0 7.2z',
  speaker: 'M3 9v6h4l5 5V4L7 9H3zm13.5 3c0-1.77-1.02-3.29-2.5-4.03v8.05c1.48-.73 2.5-2.25 2.5-4.02z',
  'speaker-off':
    'M16.5 12c0-1.77-1.02-3.29-2.5-4.03v2.21l2.45 2.45c.03-.2.05-.41.05-.63zM4.27 3L3 4.27 7.73 9H3v6h4l5 5v-6.73l4.25 4.25c-.67.52-1.42.93-2.25 1.18v2.06a8.99 8.99 0 0 0 3.69-1.81L19.73 21 21 19.73l-9-9L4.27 3zM12 4L9.91 6.09 12 8.18V4z',
};

/** Diameter of a round control. At least the 48 dp touch target. */
export const ICON_BUTTON_SIZE = 56;

interface IconButtonProps {
  /** Spoken label and the only text alternative: the icon is decoration. */
  label: string;
  icon: IconName;
  onPress: () => void;
  /** primary is the main action (record, play); secondary supports it (stop). */
  variant?: 'primary' | 'secondary';
  disabled?: boolean;
  loading?: boolean;
  accessibilityHint?: string;
  /** Diameter in dp (at least 48). Defaults to 56. */
  size?: number;
}

/**
 * A compact round button for the voice stage, using the same colours as ActionButton's primary
 * and secondary variants. It reports its label, disabled and busy state like every button.
 */
export function IconButton({
  label,
  icon,
  onPress,
  variant = 'primary',
  disabled = false,
  loading = false,
  accessibilityHint,
  size = ICON_BUTTON_SIZE,
}: IconButtonProps) {
  const { colors: palette } = useTheme();
  const inactive = disabled || loading;
  const diameter = Math.max(minTouchTarget, size);
  return (
    <Pressable
      {...buttonA11y({ label, disabled: inactive, busy: loading, hint: accessibilityHint })}
      disabled={inactive}
      onPress={onPress}
      style={({ pressed }) => {
        const colors = resolveButtonColors(variant, { pressed, inactive }, palette);
        return [
          iconStyles.base,
          {
            width: diameter,
            height: diameter,
            borderRadius: diameter / 2,
            backgroundColor: colors.background,
            borderColor: colors.border,
            borderWidth: buttonSpecs(palette)[variant].border === 'transparent' ? 0 : 1.5,
          },
          pressed && !inactive && styles.pressed,
        ];
      }}
    >
      {({ pressed }) => {
        const colors = resolveButtonColors(variant, { pressed, inactive }, palette);
        return loading ? (
          <ActivityIndicator size="small" color={colors.text} />
        ) : (
          <Svg width={26} height={26} viewBox="0 0 24 24">
            <Path d={ICON_PATHS[icon]} fill={colors.text} />
          </Svg>
        );
      }}
    </Pressable>
  );
}

const iconStyles = StyleSheet.create({
  base: {
    width: ICON_BUTTON_SIZE,
    height: ICON_BUTTON_SIZE,
    borderRadius: ICON_BUTTON_SIZE / 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
