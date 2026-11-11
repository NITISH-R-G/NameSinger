import { router } from 'expo-router';
import { useEffect, useRef, type ComponentRef, type ReactNode } from 'react';
import { Linking, ScrollView, StyleSheet, Text, TextInput, View, useWindowDimensions } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import {
  CONSENT_ACCEPT_LABEL,
  CONSENT_DECLINED_MESSAGE,
  CONSENT_DECLINE_LABEL,
  CONSENT_RECONSIDER_LABEL,
  CONSENT_SAVE_FAILED_MESSAGE,
  CONSENT_SUMMARY,
} from '../../constants/consent';
import { formatDuration } from '../../hooks/recorderState';
import type { SongPlaybackPhase } from '../../hooks/useSongPlayback';
import { MAX_NAME_LENGTH } from '../../birthday/birthdayFlow';
import { KEYS, KEY_NAMES, MAX_SYLLABLES, MIN_SYLLABLES } from '../../birthday/score';
import { useBirthdayFlow } from '../../birthday/useBirthdayFlow';
import type { Palette } from '../../theme/colors';
import { radius, spacing, typography } from '../../theme/tokens';
import { useThemedStyles } from '../../theme/useTheme';
import { ActionButton, IconButton } from '../ActionButton';
import type { OrbState } from '../../orb/orbState';
import { OrbSurface } from '../OrbSurface';
import { AmbientScene } from '../glass/GlassBackdrop';
import { GlassSurface } from '../glass/GlassSurface';

/** Development only, and only when started with EXPO_PUBLIC_BIRTHDAY_TEST_TAKE=1: a synthetic stand-in take. Never shown to users. */
const DEV_TEST_TAKE = __DEV__ && process.env.EXPO_PUBLIC_BIRTHDAY_TEST_TAKE === '1';

const isPlaying = (phase: SongPlaybackPhase) => phase === 'playing';

function Card({ children, style }: { children: ReactNode; style?: object }) {
  const styles = useThemedStyles(makeStyles);
  return (
    <GlassSurface strong radius={radius.lg} style={[styles.card, style]} contentStyle={styles.cardContent}>
      {children}
    </GlassSurface>
  );
}

function PlayRow(props: {
  title: string;
  detail: string;
  phase: SongPlaybackPhase;
  onToggle: () => void;
  disabled?: boolean;
}) {
  const styles = useThemedStyles(makeStyles);
  return (
    <View style={styles.playRow}>
      <IconButton
        label={`${isPlaying(props.phase) ? 'Pause' : 'Play'}: ${props.title}`}
        icon={isPlaying(props.phase) ? 'pause' : 'play'}
        variant="secondary"
        onPress={props.onToggle}
        disabled={props.disabled || props.phase === 'error' || props.phase === 'none'}
        loading={props.phase === 'loading'}
        size={48}
      />
      <View style={styles.playText}>
        <Text style={styles.rowTitle}>{props.title}</Text>
        <Text style={styles.caption}>{props.phase === 'error' ? 'This could not be played.' : props.detail}</Text>
      </View>
    </View>
  );
}

/**
 * The first personalised birthday song, inside NameSinger: choose the name, its syllables and a
 * comfortable key, sing the name to a guide, then hear it placed in an original song. Everything
 * runs on the phone. The sung lines of the song are a placeholder instrument; the name is the
 * only human voice, and it is the person's own.
 */
export function BirthdayScreen() {
  const styles = useThemedStyles(makeStyles);
  const b = useBirthdayFlow();
  const { width, height } = useWindowDimensions();
  const orbSize = Math.round(Math.max(180, Math.min(width * 0.9, height * 0.36, 380)));
  const { flow, recorder, consent } = b;
  const step = flow.step;
  // A new step starts at the top: otherwise it opens at the previous step's scroll position and the
  // header (and Back) can be off screen on a small phone.
  const scroller = useRef<ComponentRef<typeof ScrollView>>(null);
  useEffect(() => {
    scroller.current?.scrollTo({ y: 0, animated: false });
  }, [step]);
  const consentAccepted = consent.state.status === 'accepted';
  const leave = () => (router.canGoBack() ? router.back() : router.replace('/'));
  const stepNumber = step === 'setup' ? 1 : step === 'record' ? 2 : 3;

  const header = (
    <View style={styles.header}>
      <ActionButton label="Back" variant="contextual" onPress={leave} accessibilityHint="Leaves the birthday song" />
      <Text style={styles.kicker} accessibilityRole="header">
        Step {stepNumber} of 3
      </Text>
      <Text style={styles.title}>Birthday song</Text>
    </View>
  );

  // ---------------------------------------------------------------------------------------------
  let body: ReactNode;
  if (step === 'setup') {
    body = (
      <>
        <Text style={styles.lead}>
          We&apos;ll sing a short birthday song, and you&apos;ll sing the name into it yourself, so it sounds like you.
        </Text>
        <Card>
          <Text style={styles.sectionTitle}>Whose birthday is it?</Text>
          <TextInput
            value={flow.name}
            onChangeText={(name) => b.dispatch({ type: 'NAME', name })}
            placeholder="A name, like Maria"
            placeholderTextColor={styles.placeholder.color}
            maxLength={MAX_NAME_LENGTH}
            autoCapitalize="words"
            style={styles.input}
            accessibilityLabel="Name for the birthday song"
          />
          <Text style={styles.sectionTitle}>How many syllables?</Text>
          <Text style={styles.caption}>Sam is 1, Ma-ri-a is 3. Change it if we guessed wrong.</Text>
          <View style={styles.stepper}>
            <ActionButton
              label="Fewer"
              variant="secondary"
              onPress={() => b.dispatch({ type: 'SYLLABLES', count: flow.syllables - 1 })}
              disabled={flow.syllables <= MIN_SYLLABLES}
              accessibilityHint="One fewer syllable"
            />
            <Text style={styles.count} accessibilityLabel={`${flow.syllables} ${flow.syllables === 1 ? 'syllable' : 'syllables'}`}>
              {flow.syllables}
            </Text>
            <ActionButton
              label="More"
              variant="secondary"
              onPress={() => b.dispatch({ type: 'SYLLABLES', count: flow.syllables + 1 })}
              disabled={flow.syllables >= MAX_SYLLABLES}
              accessibilityHint="One more syllable"
            />
          </View>
        </Card>
        <Card>
          <Text style={styles.sectionTitle}>Pick a comfortable key</Text>
          <Text style={styles.caption}>Hear the guide, then choose the one that is easiest to sing.</Text>
          {KEY_NAMES.map((k) => (
            <View key={k} style={styles.keyOption}>
              <ActionButton
                label={flow.key === k ? `${KEYS[k].title} (selected)` : KEYS[k].title}
                variant={flow.key === k ? 'primary' : 'secondary'}
                onPress={() => b.dispatch({ type: 'KEY', key: k })}
                accessibilityHint={KEYS[k].hint}
              />
              <Text style={styles.caption}>{KEYS[k].hint}</Text>
            </View>
          ))}
        </Card>
        <Card>
          <Text style={styles.sectionTitle}>Listen first</Text>
          <PlayRow
            title="The birthday song"
            detail="About 30 seconds. The name goes in the pause."
            phase={b.song.play.phase}
            onToggle={b.song.play.toggle}
            disabled={!b.song.ready}
          />
          <PlayRow
            title="The guide you'll sing to"
            detail="Four clicks, then one note for each syllable."
            phase={b.cue.play.phase}
            onToggle={b.cue.play.toggle}
            disabled={!b.cue.ready}
          />
          {b.song.error ? <Text style={styles.error}>The song could not be loaded.</Text> : null}
        </Card>
        <ActionButton
          label="Next: sing the name"
          onPress={() => b.dispatch({ type: 'STEP', step: 'record' })}
          disabled={!b.canContinue || !b.cue.ready}
        />
      </>
    );
  } else if (step === 'record') {
    const live = recorder.phase === 'recording';
    const busy = recorder.phase === 'requesting-permission' || recorder.phase === 'stopping';
    const hasTake = b.take.uri !== null;
    const takePlaying = isPlaying(b.take.play.phase);
    const canRecord = (consentAccepted && b.cue.ready) || hasTake;
    // The home screen's own orb states (src/orb/orbState.ts): nothing new is invented for this flow.
    const takePaused = b.take.play.phase === 'paused';
    const orbState: OrbState = live
      ? 'listening'
      : busy
        ? 'processing'
        : takePlaying
          ? 'playing'
          : takePaused
            ? 'paused'
            : recorder.phase === 'error' || recorder.phase === 'unusable' || recorder.phase.startsWith('permission-')
              ? 'error'
              : 'idle';
    const orbCaption = live
      ? 'Recording. Tap to stop.'
      : busy
        ? 'Please wait.'
        : hasTake
          ? takePlaying
            ? 'Playing your take. Tap to pause.'
            : 'Your take is ready. Tap to play it.'
          : canRecord
            ? 'Ready to record. Tap to start.'
            : 'Recording is off until you agree below.';
    const noteWord = flow.syllables === 1 ? 'note' : 'notes';
    body = (
      <>
        <View style={styles.orbBox}>
        <OrbSurface
          state={orbState}
          level={takePlaying ? b.take.play.level : b.micLevel}
          size={orbSize}
          caption={hasTake ? orbCaption : `${orbCaption} Sing ${flow.name.trim()} on ${flow.syllables} ${noteWord}.`}
          onPress={() => {
            if (busy || !canRecord) return;
            if (live) void recorder.stopRecording();
            else if (hasTake) b.take.play.toggle();
            else void b.startTake();
          }}
        />
        </View>
        <Text style={styles.status}>
          {live
            ? `Recording… ${formatDuration(recorder.durationMs)}. Sing when the guide notes play.`
            : recorder.phase === 'requesting-permission'
              ? 'Waiting for your phone to ask about the microphone…'
              : recorder.phase === 'stopping'
                ? 'Finishing your recording…'
                : hasTake
                  ? 'Tap the orb to hear your take.'
                  : canRecord
                    ? `Tap the orb, then sing “${flow.name.trim()}” on ${flow.syllables} ${noteWord}.`
                    : 'Agree below to start recording.'}
        </Text>

        {!hasTake && !live ? (
          <Card>
            <Text style={styles.body}>1. Put on headphones so the guide doesn&apos;t leak into your recording.</Text>
            <Text style={styles.body}>
              2. You&apos;ll hear four clicks, then the guide notes. Sing one note per syllable and hold the last one.
            </Text>
          </Card>
        ) : null}

        {!consentAccepted && !hasTake ? (
          <Card>
            <Text style={styles.sectionTitle}>Before you record</Text>
            <Text style={styles.body}>{CONSENT_SUMMARY}</Text>
            <Text style={styles.caption}>This time you&apos;ll sing your name rather than say it. It&apos;s handled the same way.</Text>
            {consent.state.status === 'declined' ? (
              <>
                <Text style={styles.body}>{CONSENT_DECLINED_MESSAGE}</Text>
                <ActionButton label={CONSENT_RECONSIDER_LABEL} variant="secondary" onPress={consent.reconsider} />
              </>
            ) : (
              <>
                <ActionButton label={CONSENT_ACCEPT_LABEL} onPress={() => void consent.accept()} disabled={!consent.ready} />
                <ActionButton label={CONSENT_DECLINE_LABEL} variant="neutral" onPress={consent.decline} />
              </>
            )}
          </Card>
        ) : null}

        {consent.saveFailed ? <Text style={styles.caption}>{CONSENT_SAVE_FAILED_MESSAGE}</Text> : null}
        {hasTake ? (
          <>
            {b.take.synthetic ? <Text style={[styles.caption, styles.centered]}>Test take: a synthetic voice, not a person singing.</Text> : null}
            {recorder.quiet ? <Text style={[styles.caption, styles.centered]}>A little quiet. Moving closer next time may help.</Text> : null}
            <ActionButton label="Make my song" onPress={() => void b.makeSong()} />
            <ActionButton label="Record again" variant="secondary" onPress={b.recordAgain} />
          </>
        ) : null}
        {recorder.phase === 'permission-denied' ? (
          <>
            <Text style={styles.error}>NameSinger needs the microphone to hear you sing.</Text>
            <ActionButton label="Try again" variant="secondary" onPress={() => void b.startTake()} />
          </>
        ) : null}
        {recorder.phase === 'permission-blocked' ? (
          <>
            <Text style={styles.error}>The microphone is turned off for NameSinger. You can turn it on in Android Settings.</Text>
            <ActionButton label="Open settings" variant="secondary" onPress={() => void Linking.openSettings()} />
          </>
        ) : null}
        {!hasTake && (recorder.phase === 'unusable' || recorder.phase === 'error') ? (
          <Text style={styles.error}>{recorder.errorMessage ?? 'That recording did not work.'} Tap the orb to try again.</Text>
        ) : null}
        {b.makeError ? <Text style={styles.error}>{b.makeError}</Text> : null}
        {DEV_TEST_TAKE && !hasTake && !live ? (
          <ActionButton
            label="Dev: use a test take (synthetic, not singing)"
            variant="contextual"
            onPress={() => void b.importTestTake()}
            disabled={!b.cue.ready}
          />
        ) : null}
        <ActionButton label="Change name or key" variant="neutral" onPress={b.backToSetup} disabled={live || busy} />
      </>
    );
  } else if (step === 'making') {
    body = (
      <>
        <View style={styles.orbBox}>
          <OrbSurface state="generating" level={b.micLevel} size={orbSize} caption="Making your song. Please wait." onPress={() => undefined} />
        </View>
        <Text style={styles.status}>Putting {flow.name.trim()} into the song…</Text>
        <Text style={[styles.caption, styles.centered]}>This happens on your phone and takes a few seconds.</Text>
      </>
    );
  } else {
    const playing = isPlaying(b.resultPlay.phase);
    body = (
      <>
        <View style={styles.orbBox}>
        <OrbSurface
          state={playing ? 'playing' : b.resultPlay.phase === 'paused' ? 'paused' : 'idle'}
          level={b.resultPlay.level}
          size={orbSize}
          caption={playing ? 'Playing your birthday song. Tap to pause.' : 'Your birthday song is ready. Tap to play.'}
          onPress={b.resultPlay.toggle}
        />
        </View>
        <Text style={styles.status}>
          Happy birthday, {flow.name.trim()}! Tap the orb to {playing ? 'pause' : 'play'} your song.
        </Text>
        <Text style={[styles.caption, styles.centered]}>
          This is an early experiment: the melody is played by a placeholder instrument, and only the name is a human voice.
        </Text>
        {DEV_TEST_TAKE && b.result ? (
          <Text style={[styles.caption, styles.centered]}>
            Dev: made in {(b.result.renderMs / 1000).toFixed(1)} s; name {b.result.report.nameStartSec.toFixed(2)}–
            {b.result.report.nameEndSec.toFixed(2)} s; slot {b.result.report.slotSec[0].toFixed(2)}–
            {b.result.report.slotSec[1].toFixed(2)} s
            {b.take.synthetic ? '; synthetic test take' : ''}.
          </Text>
        ) : null}
        <ActionButton label="Sing the name again" variant="secondary" onPress={b.recordAgain} />
        <ActionButton label="Change name or key" variant="neutral" onPress={b.backToSetup} />
      </>
    );
  }

  return (
    // The home screen's ambient scene, without its refractive-glass backdrop: that glass samples the
    // screen as first drawn, so cards that scroll into view (or change height) render black.
    <View style={styles.safe}>
      <AmbientScene />
      <SafeAreaView style={styles.safe} edges={['top', 'bottom']}>
        <ScrollView ref={scroller} contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">
          {header}
          {body}
        </ScrollView>
      </SafeAreaView>
    </View>
  );
}

const makeStyles = (c: Palette) =>
  StyleSheet.create({
    safe: { flex: 1 },
    scroll: { padding: spacing.lg, gap: spacing.lg, paddingBottom: spacing.xxl },
    header: { gap: spacing.sm },
    kicker: { ...typography.caption, color: c.inkMuted },
    title: { ...typography.display, color: c.ink },
    lead: { ...typography.body, color: c.ink },
    body: { ...typography.body, color: c.ink },
    caption: { ...typography.caption, color: c.inkMuted },
    status: { ...typography.body, color: c.ink, textAlign: 'center' },
    centered: { textAlign: 'center' },
    orbBox: { alignItems: 'center', justifyContent: 'center' },
    error: { ...typography.body, color: c.danger },
    sectionTitle: { ...typography.title, color: c.ink },
    rowTitle: { ...typography.label, color: c.ink },
    card: { alignSelf: 'stretch' },
    cardContent: { padding: spacing.lg, gap: spacing.md },
    input: {
      ...typography.body,
      color: c.ink,
      backgroundColor: c.field,
      borderColor: c.border,
      borderWidth: 1,
      borderRadius: radius.md,
      paddingHorizontal: spacing.lg,
      minHeight: 48,
    },
    placeholder: { color: c.placeholder },
    stepper: { flexDirection: 'row', alignItems: 'center', gap: spacing.lg },
    count: { ...typography.mono, color: c.ink, minWidth: 40, textAlign: 'center' },
    keyOption: { gap: spacing.xs },
    playRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
    playText: { flex: 1, gap: 2 },
  });
