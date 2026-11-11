import { useState } from 'react';
import { Linking, Pressable, StyleSheet, Text, View } from 'react-native';

import type { UseConsentResult } from '../hooks/useConsent';
import { ORB_PALETTES } from '../orb/orbPalettes';
import type { Palette } from '../theme/colors';
import { withAlpha } from '../theme/colorMath';
import { THEME_PREFERENCES, type ThemePreference } from '../theme/appearance';
import { layout, radius, spacing, typography } from '../theme/tokens';
import { useTheme, useThemedStyles } from '../theme/useTheme';
import { ActionButton } from './ActionButton';
import { ConfirmDestructive } from './ConfirmDestructive';
import { GlassBottomSheet } from './glass/GlassBottomSheet';
import { ConsentSettings } from './ConsentSettings';

interface SettingsSheetProps {
  visible: boolean;
  onClose: () => void;
  consent: UseConsentResult;
  microphoneBusy: boolean;
  /** A recording of the user's voice exists on the phone. */
  hasRecording: boolean;
  onDeleteRecording: () => void;
  /** Development builds only. */
  onDevTestVoice?: () => void;
  /** Opens the orb colour sheet (the settings sheet closes first). */
  onOpenOrbColors: () => void;
}

/**
 * Everything secondary, out of the way of the orb: recording consent (with withdrawal), deleting the
 * recording, the Android microphone permission, and in development builds the test voice. Withdrawing
 * consent never deletes anything; deleting the recording is its own explicit, confirmed action and
 * stays available whether or not consent is on.
 */
export function SettingsSheet({
  visible,
  onClose,
  consent,
  microphoneBusy,
  hasRecording,
  onDeleteRecording,
  onDevTestVoice,
  onOpenOrbColors,
}: SettingsSheetProps) {
  const styles = useThemedStyles(makeStyles);
  const { preference, setPreference, orbTheme } = useTheme();
  const [confirmingDelete, setConfirmingDelete] = useState(false);

  return (
    <>
      <GlassBottomSheet visible={visible} onClose={onClose} title="Settings" scrollable>
        <View style={styles.content}>
          <View style={styles.card}>
            <Text accessibilityRole="header" style={styles.cardTitle}>
              Appearance
            </Text>
            <View accessibilityRole="radiogroup" accessibilityLabel="Colour mode" style={styles.segments}>
              {THEME_PREFERENCES.map((option) => (
                <Segment
                  key={option}
                  label={MODE_LABELS[option]}
                  selected={preference === option}
                  onPress={() => setPreference(option)}
                />
              ))}
            </View>
            <Text style={styles.body}>
              {preference === 'system' ? 'Follows your phone’s light or dark setting.' : `Always ${preference}.`}
            </Text>
            <View style={styles.orbRow}>
              <View style={styles.orbRowText}>
                <Text style={styles.rowTitle}>Orb colours</Text>
                <Text style={styles.body}>{ORB_PALETTES[orbTheme].name}</Text>
              </View>
              <ActionButton
                label="Change"
                variant="contextual"
                accessibilityHint="Opens the orb colour chooser"
                disabled={microphoneBusy}
                onPress={() => {
                  onClose();
                  onOpenOrbColors();
                }}
              />
            </View>
          </View>

          <View style={styles.card}>
            <Text accessibilityRole="header" style={styles.cardTitle}>
              Recording consent
            </Text>
            <ConsentSettings consent={consent} microphoneBusy={microphoneBusy} />
          </View>

          <View style={styles.card}>
            <Text accessibilityRole="header" style={styles.cardTitle}>
              Your recording
            </Text>
            <Text style={styles.body}>
              {hasRecording
                ? 'A recording of your voice, and any song made from it, is on this phone. It is not uploaded.'
                : 'There is no recording of your voice on this phone right now.'}
            </Text>
            {hasRecording ? (
              <ActionButton
                label="Delete recording"
                variant="destructiveText"
                accessibilityHint="Asks you to confirm before anything is deleted"
                onPress={() => setConfirmingDelete(true)}
              />
            ) : null}
          </View>

          <View style={styles.card}>
            <Text accessibilityRole="header" style={styles.cardTitle}>
              Microphone permission
            </Text>
            <Text style={styles.body}>
              Android controls whether this app may use the microphone, separately from your consent. Change it in
              your phone's settings.
            </Text>
            <ActionButton
              label="Open Android settings"
              variant="secondary"
              onPress={() => void Linking.openSettings().catch(() => undefined)}
            />
          </View>

          {__DEV__ && onDevTestVoice ? (
            <View style={styles.card}>
              <Text accessibilityRole="header" style={styles.cardTitle}>
                Development only
              </Text>
              <ActionButton
                label="Use test voice"
                variant="contextual"
                onPress={() => {
                  onClose();
                  onDevTestVoice();
                }}
              />
            </View>
          ) : null}
        </View>
      </GlassBottomSheet>

        <ConfirmDestructive
          visible={confirmingDelete}
          title="Delete your recording?"
          consequences={[
            'Your name recording and the song made from it will be deleted from this phone.',
            'This cannot be undone. You can record your name again afterwards.',
          ]}
          confirmLabel="Delete recording"
          cancelLabel="Keep my recording"
          onCancel={() => setConfirmingDelete(false)}
          onConfirm={() => {
            setConfirmingDelete(false);
            onDeleteRecording();
          }}
        />
    </>
  );
}

const MODE_LABELS: Record<ThemePreference, string> = { system: 'System', light: 'Light', dark: 'Dark' };

interface SegmentProps {
  label: string;
  selected: boolean;
  onPress: () => void;
}

/** One option of a colour-mode choice: a radio for screen readers, at least 48 dp tall. */
function Segment({ label, selected, onPress }: SegmentProps) {
  const styles = useThemedStyles(makeStyles);
  return (
    <Pressable
      accessibilityRole="radio"
      accessibilityLabel={label}
      accessibilityState={{ selected }}
      onPress={onPress}
      style={[styles.segment, selected && styles.segmentOn]}
    >
      <Text style={[styles.segmentText, selected && styles.segmentTextOn]}>{label}</Text>
    </Pressable>
  );
}

const makeStyles = (colors: Palette) =>
  StyleSheet.create({
  segments: { flexDirection: 'row', gap: spacing.sm },
  segment: {
    flex: 1,
    minHeight: 48,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: radius.pill,
    borderWidth: 1.5,
    borderColor: colors.border,
    backgroundColor: colors.field,
  },
  segmentOn: { borderColor: colors.primary, backgroundColor: colors.primary },
  segmentText: { ...typography.label, color: colors.ink, fontWeight: '700' },
  segmentTextOn: { color: colors.onPrimary },
  orbRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: spacing.md },
  orbRowText: { flex: 1, gap: 2 },
  rowTitle: { ...typography.label, color: colors.ink, fontWeight: '700' },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: layout.contentInset,
    paddingVertical: spacing.md,
  },
  title: { ...typography.title },
  content: { paddingHorizontal: layout.screenGutter, paddingBottom: spacing.xxl, gap: spacing.lg },
  card: {
    gap: spacing.md,
    padding: layout.cardPadding,
    borderRadius: radius.lg,
    backgroundColor: withAlpha(colors.surface, 0.55),
    borderWidth: layout.cardBorderWidth,
    borderColor: withAlpha(colors.border, 0.8),
  },
  cardTitle: { ...typography.title, color: colors.ink },
  body: { ...typography.body, color: colors.inkMuted },
  });
