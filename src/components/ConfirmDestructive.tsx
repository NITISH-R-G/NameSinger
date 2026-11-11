import { useEffect } from 'react';
import { BackHandler, Pressable, StyleSheet, Text, View } from 'react-native';

import type { Palette } from '../theme/colors';
import { layout, spacing, typography } from '../theme/tokens';
import { useThemedStyles } from '../theme/useTheme';
import { ActionButton } from './ActionButton';
import { GlassSurface } from './glass/GlassSurface';

interface ConfirmDestructiveProps {
  visible: boolean;
  title: string;
  /** What will be lost, said plainly before the user confirms. */
  consequences: readonly string[];
  confirmLabel: string;
  cancelLabel: string;
  onConfirm: () => void;
  onCancel: () => void;
}

/**
 * A dialog dedicated to confirming one destructive operation, drawn as a card of dense glass over a
 * dimmed page. The consequence comes first, the final action is a solid red full-width button and
 * the way out is grey. Red appears nowhere else here, and this is the only place that uses the
 * solid destructive variant. A tap outside, or Android back, cancels: it never confirms.
 */
export function ConfirmDestructive({
  visible,
  title,
  consequences,
  confirmLabel,
  cancelLabel,
  onConfirm,
  onCancel,
}: ConfirmDestructiveProps) {
  const styles = useThemedStyles(makeStyles);

  useEffect(() => {
    if (!visible) return undefined;
    const subscription = BackHandler.addEventListener('hardwareBackPress', () => {
      onCancel();
      return true;
    });
    return () => subscription.remove();
  }, [visible, onCancel]);

  if (!visible) return null;

  return (
    <View style={styles.overlay} accessibilityViewIsModal>
      <Pressable
        style={styles.scrim}
        onPress={onCancel}
        accessibilityRole="button"
        accessibilityLabel={cancelLabel}
      />
      <GlassSurface strong lifted radius={28} style={styles.card} contentStyle={styles.cardContent}>
        <Text accessibilityRole="header" style={styles.title}>
          {title}
        </Text>
        {consequences.map((line) => (
          <Text key={line} style={styles.consequence}>
            {line}
          </Text>
        ))}
        <View style={styles.actions}>
          <ActionButton label={confirmLabel} variant="destructive" onPress={onConfirm} />
          <ActionButton label={cancelLabel} variant="neutral" onPress={onCancel} />
        </View>
      </GlassSurface>
    </View>
  );
}

const makeStyles = (colors: Palette) =>
  StyleSheet.create({
    overlay: { ...StyleSheet.absoluteFill, justifyContent: 'center', paddingHorizontal: layout.contentInset },
    scrim: { ...StyleSheet.absoluteFill, backgroundColor: colors.scrim },
    card: { alignSelf: 'stretch' },
    cardContent: { padding: spacing.xl, gap: spacing.md },
    title: { ...typography.display, fontSize: 26, lineHeight: 32, color: colors.ink },
    consequence: { ...typography.body, color: colors.ink },
    actions: { gap: layout.buttonGap, marginTop: spacing.sm },
  });
