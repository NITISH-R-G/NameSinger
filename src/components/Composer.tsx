import { useState } from 'react';
import { StyleSheet, TextInput, View } from 'react-native';

import type { Step } from '../conversation/types';
import type { Palette } from '../theme/colors';
import { spacing, typography } from '../theme/tokens';
import { useTheme, useThemedStyles } from '../theme/useTheme';
import { IconButton } from './ActionButton';
import { GlassSurface } from './glass/GlassSurface';

export const COMPOSER_MAX_LENGTH = 80;

/** What the field suggests for the current question. The field itself accepts any answer. */
export function composerPlaceholder(step: Step): string {
  switch (step) {
    case 'ask-name':
      return 'Type your name';
    case 'review-take':
      return 'Type "use it" or "again"';
    case 'ask-language':
      return 'Type a language, or "skip"';
    case 'confirm-make':
      return 'Type "yes" to make your song';
    default:
      return 'Type a message';
  }
}

interface ComposerProps {
  step: Step;
  onSend: (text: string) => void;
}

/**
 * The text counterpart of the orb: one field and a send button that feed the same conversation
 * actions as voice and the reply buttons. It is not tied to the name question; whatever the current
 * step is, what is typed here is that step's answer.
 */
export function Composer({ step, onSend }: ComposerProps) {
  const styles = useThemedStyles(makeStyles);
  const { colors } = useTheme();
  const [text, setText] = useState('');
  const [focused, setFocused] = useState(false);
  const canSend = text.trim().length > 0;

  const send = () => {
    if (!canSend) return;
    onSend(text);
    setText('');
  };

  return (
    <View style={styles.bar}>
      <GlassSurface radius={26} style={styles.field} contentStyle={styles.fieldContent}>
        <TextInput
          value={text}
          onChangeText={setText}
          placeholder={composerPlaceholder(step)}
          placeholderTextColor={colors.placeholder}
          selectionColor={colors.accent}
          cursorColor={colors.accent}
          style={styles.input}
          maxLength={COMPOSER_MAX_LENGTH}
          returnKeyType="send"
          blurOnSubmit={false}
          onSubmitEditing={send}
          onFocus={() => setFocused(true)}
          onBlur={() => setFocused(false)}
          accessibilityLabel="Message"
          accessibilityHint="Type your answer, then press send"
          autoCorrect={false}
        />
        {/* The focus ring: the selected accent, drawn over the glass rim while the field is in use. */}
        {focused ? <View pointerEvents="none" style={styles.focusRing} /> : null}
      </GlassSurface>
      <IconButton label="Send message" icon="send" size={48} disabled={!canSend} onPress={send} />
    </View>
  );
}

const makeStyles = (colors: Palette) =>
  StyleSheet.create({
  bar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
  },
  field: { flex: 1 },
  fieldContent: { justifyContent: 'center' },
  input: {
    minHeight: 48,
    paddingHorizontal: 18,
    color: colors.ink,
    ...typography.body,
  },
  focusRing: {
    ...StyleSheet.absoluteFill,
    borderRadius: 26,
    borderWidth: 2,
    borderColor: colors.focusRing,
  },
  });
