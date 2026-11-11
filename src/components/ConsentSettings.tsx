import { useState } from 'react';
import { AccessibilityInfo, StyleSheet, Text, View } from 'react-native';

import {
  WITHDRAWN_ANNOUNCEMENT,
  WITHDRAW_CANCEL_LABEL,
  WITHDRAW_CONFIRM_LABEL,
  WITHDRAW_CONFIRM_TITLE,
  WITHDRAW_FAILED_MESSAGE,
  WITHDRAW_OPEN_LABEL,
  WITHDRAW_POINTS,
  WITHDRAW_STATUS_OFF,
  WITHDRAW_STATUS_ON,
  WITHDRAW_UNAVAILABLE_HINT,
} from '../constants/consent';
import { canRecord } from '../hooks/consentState';
import type { UseConsentResult } from '../hooks/useConsent';
import type { Palette } from '../theme/colors';
import { layout, radius, spacing, typography } from '../theme/tokens';
import { useThemedStyles } from '../theme/useTheme';
import { ActionButton } from './ActionButton';

interface ConsentSettingsProps {
  consent: UseConsentResult;
  /** The microphone is starting, recording or stopping. Withdrawal waits until it is idle. */
  microphoneBusy: boolean;
}

/**
 * Shows whether recording is allowed and, while it is, lets the user withdraw consent after an
 * explicit confirmation. Withdrawing changes only the saved acknowledgement: it deletes no
 * recording or song, changes no preference and does not touch Android's microphone permission.
 * The confirmation is inline (the grey Cancel and the purple confirm are different variants, and
 * nothing here is red because nothing is deleted).
 */
export function ConsentSettings({ consent, microphoneBusy }: ConsentSettingsProps) {
  const styles = useThemedStyles(makeStyles);
  const [confirming, setConfirming] = useState(false);
  const [working, setWorking] = useState(false);

  if (!consent.ready) return null;

  const allowed = canRecord(consent.state);

  const confirm = async () => {
    setWorking(true);
    try {
      const done = await consent.withdraw();
      if (done) AccessibilityInfo.announceForAccessibility(WITHDRAWN_ANNOUNCEMENT);
    } finally {
      setWorking(false);
      setConfirming(false);
    }
  };

  if (!allowed) {
    return <Text style={styles.body}>{WITHDRAW_STATUS_OFF}</Text>;
  }

  if (!confirming) {
    return (
      <View style={styles.stack}>
        <Text style={styles.body}>{WITHDRAW_STATUS_ON}</Text>
        {consent.withdrawalFailed ? (
          <Text accessibilityRole="alert" style={styles.error}>
            {WITHDRAW_FAILED_MESSAGE}
          </Text>
        ) : null}
        <ActionButton
          label={WITHDRAW_OPEN_LABEL}
          variant="secondary"
          disabled={microphoneBusy}
          accessibilityHint={microphoneBusy ? WITHDRAW_UNAVAILABLE_HINT : 'Asks you to confirm first'}
          onPress={() => setConfirming(true)}
        />
        {microphoneBusy ? <Text style={styles.caption}>{WITHDRAW_UNAVAILABLE_HINT}</Text> : null}
      </View>
    );
  }

  return (
    <View style={styles.stack}>
      <View style={styles.box}>
        <Text accessibilityRole="header" style={styles.title}>
          {WITHDRAW_CONFIRM_TITLE}
        </Text>
        {WITHDRAW_POINTS.map((point) => (
          <Text key={point.heading} style={styles.point}>
            <Text style={styles.pointHeading}>{point.heading}. </Text>
            {point.text}
          </Text>
        ))}
      </View>
      <ActionButton label={WITHDRAW_CONFIRM_LABEL} onPress={() => void confirm()} loading={working} />
      <ActionButton
        label={WITHDRAW_CANCEL_LABEL}
        variant="neutral"
        disabled={working}
        onPress={() => setConfirming(false)}
      />
    </View>
  );
}

const makeStyles = (colors: Palette) =>
  StyleSheet.create({
  stack: { gap: layout.buttonGap },
  box: {
    gap: spacing.md,
    padding: spacing.lg,
    borderRadius: radius.md,
    backgroundColor: colors.surfaceMuted,
  },
  title: { ...typography.title, color: colors.ink },
  point: { ...typography.body, color: colors.ink },
  pointHeading: { fontWeight: '700' },
  body: { ...typography.body, color: colors.inkMuted },
  caption: { ...typography.caption, color: colors.inkMuted },
  error: { ...typography.body, color: colors.danger },
  });
