import { useEffect, useRef } from 'react';
import { ScrollView, StyleSheet, Text, View, type ScrollViewInstance } from 'react-native';

import type { ChatMessage, Chip } from '../conversation/types';
import type { Palette } from '../theme/colors';
import { withAlpha } from '../theme/colorMath';
import { radius, spacing, typography } from '../theme/tokens';
import { useThemedStyles } from '../theme/useTheme';
import { ActionButton } from './ActionButton';

/**
 * The message whose reply buttons are live: the newest message that has any, as long as the user has
 * not answered since. A note added after it (for example the demo-track note) does not hide them.
 */
export function messageWithLiveChips(messages: readonly ChatMessage[]): ChatMessage | null {
  for (let i = messages.length - 1; i >= 0; i -= 1) {
    const message = messages[i];
    if (message.role === 'user') return null;
    if (message.chips.length > 0) return message;
  }
  return null;
}

interface TranscriptProps {
  messages: readonly ChatMessage[];
  onChip: (chip: Chip) => void;
  /** Space kept clear at the bottom (the composer floats over it). */
  bottomInset?: number;
}

/**
 * The text face of the conversation: the same messages that voice mode speaks. Assistant on the
 * left, the user on the right, short system notes in the middle. Reply buttons appear under the
 * newest assistant message only, and do exactly what typing the same answer does. The list scrolls
 * to the newest message whenever one arrives or the space changes (for example the keyboard opening).
 */
export function Transcript({ messages, onChip, bottomInset = 0 }: TranscriptProps) {
  const styles = useThemedStyles(makeStyles);
  const scroll = useRef<ScrollViewInstance>(null);
  const live = messageWithLiveChips(messages);

  useEffect(() => {
    const timer = setTimeout(() => scroll.current?.scrollToEnd({ animated: true }), 40);
    return () => clearTimeout(timer);
  }, [messages.length]);

  return (
    <ScrollView
      ref={scroll}
      style={styles.scroll}
      contentContainerStyle={[styles.content, { paddingBottom: spacing.md + bottomInset }]}
      keyboardShouldPersistTaps="handled"
      onContentSizeChange={() => scroll.current?.scrollToEnd({ animated: false })}
      accessibilityLabel="Conversation"
    >
      {messages.map((message) => (
        <View key={message.id} style={styles.row}>
          {message.role === 'system' ? (
            <Text style={styles.system}>{message.text}</Text>
          ) : (
            <View style={[styles.bubble, message.role === 'user' ? styles.user : styles.assistant]}>
              <Text
                accessibilityLabel={`${message.role === 'user' ? 'You' : 'NameSinger'}: ${message.text}`}
                style={[styles.text, message.role === 'user' && styles.userText]}
              >
                {message.text}
              </Text>
            </View>
          )}
          {message === live ? (
            <View style={styles.chips}>
              {message.chips.map((chip) => (
                <ActionButton key={chip.id} label={chip.label} variant="contextual" onPress={() => onChip(chip)} />
              ))}
            </View>
          ) : null}
        </View>
      ))}
    </ScrollView>
  );
}

const makeStyles = (colors: Palette) =>
  StyleSheet.create({
  scroll: { flex: 1 },
  content: { paddingHorizontal: spacing.lg, paddingVertical: spacing.md, gap: spacing.md },
  row: { gap: spacing.sm },
  bubble: { maxWidth: '88%', paddingHorizontal: 14, paddingVertical: 10, borderRadius: radius.lg },
  assistant: { alignSelf: 'flex-start', backgroundColor: withAlpha(colors.surface, 0.5), borderTopLeftRadius: 6 },
  user: { alignSelf: 'flex-end', backgroundColor: colors.primary, borderTopRightRadius: 6 },
  text: { ...typography.body, color: colors.ink },
  userText: { color: colors.onPrimary },
  system: { ...typography.caption, color: colors.inkMuted, textAlign: 'center', paddingHorizontal: spacing.lg },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm, alignSelf: 'flex-start', maxWidth: '100%' },
  });
