import { Pressable, StyleSheet } from 'react-native';

import { Icon, type IconName } from './icons';
import { killa } from './tokens';

interface IconButtonProps {
  icon: IconName;
  /** What a screen reader says. Icon-only buttons need it. */
  label: string;
  onPress: () => void;
  hint?: string;
  /**
   * header: bare icon in a 48dp target (Back, Cancel, More).
   * soft: a quiet 48dp disc (Replay, Save, Share).
   * primary: the 72dp gold disc with a dark play/pause glyph (a plain control, not a second record).
   */
  variant?: 'header' | 'soft' | 'primary';
  /** A lasting on-state, e.g. Save after the song is saved. */
  selected?: boolean;
  disabled?: boolean;
}

const TARGET = 48;

export function IconButton({ icon, label, onPress, hint, variant = 'soft', selected = false, disabled = false }: IconButtonProps) {
  const primary = variant === 'primary';
  const size = primary ? 72 : TARGET;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityHint={hint}
      accessibilityState={{ disabled, selected }}
      android_ripple={primary ? undefined : { color: '#E7BD6133', radius: TARGET / 2, borderless: true }}
      disabled={disabled}
      onPress={onPress}
      hitSlop={primary ? 0 : 4}
      style={({ pressed }) => [
        styles.base,
        { width: size, height: size, borderRadius: size / 2 },
        variant === 'soft' && styles.soft,
        variant === 'soft' && selected && styles.softSelected,
        variant === 'soft' && pressed && styles.softPressed,
        variant === 'header' && pressed && styles.headerPressed,
        primary && styles.primary,
        primary && pressed && styles.primaryPressed,
        disabled && styles.disabled,
      ]}
    >
      {primary ? (
        <Icon name={icon} size={40} color={killa.deck} />
      ) : (
        <Icon name={icon} size={24} color={variant === 'header' ? killa.text : selected ? killa.hi : killa.accent} />
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  base: { alignItems: 'center', justifyContent: 'center' },
  soft: { backgroundColor: killa.off },
  softSelected: { backgroundColor: '#3A2F14' },
  softPressed: { backgroundColor: '#2E2713' },
  headerPressed: { backgroundColor: '#FFFFFF14' },
  primary: { backgroundColor: killa.accent },
  primaryPressed: { backgroundColor: killa.lo },
  disabled: { opacity: 0.4 },
});
