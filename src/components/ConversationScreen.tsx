import { useCallback, useEffect, useMemo, useRef, useState, type ComponentRef } from 'react';
import { Animated, StyleSheet, Text, View, type LayoutChangeEvent } from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';

import { useConversation } from '../conversation/useConversation';
import type { UseConsentResult } from '../hooks/useConsent';
import { useKeyboardInset } from '../hooks/useKeyboardInset';
import type { Palette } from '../theme/colors';
import { spacing, typography } from '../theme/tokens';
import { useTheme, useThemedStyles } from '../theme/useTheme';
import { Composer } from './Composer';
import { AmbientScene, GlassBackdrop } from './glass/GlassBackdrop';
import { GlassBottomSheet } from './glass/GlassBottomSheet';
import { GlassControlGroup } from './glass/GlassControlGroup';
import { GlassIconButton } from './glass/GlassIconButton';
import { GlassThemeSelector } from './glass/GlassThemeSelector';
import { OrbSurface } from './OrbSurface';
import { SettingsSheet } from './SettingsSheet';
import { Transcript } from './Transcript';

interface ConversationScreenProps {
  consent: UseConsentResult;
  /** 0 to 1 while the opening hands over to this screen; 1 afterwards. */
  enter: Animated.Value;
  /** True once the hand-over is done: the first question is asked then. */
  started: boolean;
  /** Reports the window-space centre of the orb so the opening's glass orb can land on it. */
  onOrbCenter: (centerY: number) => void;
}

const COMPACT_ORB = 64;
/** Height reserved for the composer under the transcript: its 48 dp field and the spacing around it. */
const COMPOSER_SPACE = 76;

/**
 * The whole product after the opening: one conversation, shown two ways. In voice mode the orb is
 * the dominant element (and the only microphone control), with one line of status under it. In text
 * mode the orb shrinks to the corner and the transcript takes the space. In both modes the
 * transcript and the composer are the same and the conversation never restarts.
 */
export function ConversationScreen({ consent, enter, started, onOrbCenter }: ConversationScreenProps) {
  const [voiceMode, setVoiceMode] = useState(true);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [colorsOpen, setColorsOpen] = useState(false);
  const rootRef = useRef<ComponentRef<typeof View>>(null);
  const [box, setBox] = useState({ x: 0, y: 0, w: 0, h: 0 });
  const [chatRect, setChatRect] = useState({ x: 0, y: 0, w: 0, h: 0 });
  const chatBox = useRef<ComponentRef<typeof View>>(null);
  const styles = useThemedStyles(makeStyles);
  const { orbTheme, setOrbTheme } = useTheme();
  const [orbSize, setOrbSize] = useState(220);
  const orbBox = useRef<ComponentRef<typeof View>>(null);
  const conv = useConversation({ consent, voiceMode });
  const insets = useSafeAreaInsets();
  const keyboard = useKeyboardInset(insets.bottom);

  useEffect(() => {
    if (started) conv.begin();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [started]);

  const onOrbLayout = useCallback(
    (event: LayoutChangeEvent) => {
      const { width, height } = event.nativeEvent.layout;
      setOrbSize(Math.round(Math.max(96, Math.min(width * 0.9, height, 340))));
      orbBox.current?.measureInWindow((x: number, y: number, w: number, h: number) => {
        onOrbCenter(y + h / 2);
        // Where the orb's box is on the page, so the orb (drawn in the blur target) can sit there.
        rootRef.current?.measureInWindow((rx: number, ry: number) => setBox({ x: x - rx, y: y - ry, w, h }));
      });
    },
    [onOrbCenter],
  );

  const toggleVoice = () => {
    if (voiceMode && conv.recorder.phase === 'recording') void conv.recorder.stopRecording();
    setVoiceMode((value) => !value);
  };

  const headerOpacity = useMemo(
    () => enter.interpolate({ inputRange: [0.55, 0.9], outputRange: [0, 1], extrapolate: 'clamp' }),
    [enter],
  );
  const orbOpacity = useMemo(
    () => enter.interpolate({ inputRange: [0.3, 0.6], outputRange: [0, 1], extrapolate: 'clamp' }),
    [enter],
  );
  const orbScale = useMemo(
    () => enter.interpolate({ inputRange: [0.3, 0.6], outputRange: [0.85, 1], extrapolate: 'clamp' }),
    [enter],
  );
  const chatOpacity = useMemo(
    () => enter.interpolate({ inputRange: [0.5, 1], outputRange: [0, 1], extrapolate: 'clamp' }),
    [enter],
  );
  const chatLift = useMemo(
    () => enter.interpolate({ inputRange: [0.5, 1], outputRange: [70, 0], extrapolate: 'clamp' }),
    [enter],
  );

  const microphoneBusy =
    conv.recorder.phase === 'recording' ||
    conv.recorder.phase === 'requesting-permission' ||
    conv.recorder.phase === 'stopping';

  const body = (
    <>
      <Animated.View style={[styles.header, { opacity: headerOpacity }]}>
        <Text accessibilityRole="header" style={styles.wordmark}>
          NameSinger
        </Text>
        <GlassControlGroup>
          <GlassIconButton
            flat
            label={voiceMode ? 'Turn voice off' : 'Turn voice on'}
            icon={voiceMode ? 'speaker' : 'speaker-off'}
            onPress={toggleVoice}
          />
          <GlassIconButton
            flat
            label="Orb colours"
            icon="palette"
            disabled={microphoneBusy}
            accessibilityHint={microphoneBusy ? 'Unavailable while the microphone is open' : 'Opens the orb colour chooser'}
            onPress={() => setColorsOpen(true)}
          />
          <GlassIconButton flat label="Settings" icon="settings" onPress={() => setSettingsOpen(true)} />
        </GlassControlGroup>
      </Animated.View>

      {voiceMode ? (
        <View style={styles.stage}>
          <View ref={orbBox} style={styles.orbBox} onLayout={onOrbLayout} collapsable={false} pointerEvents="none">
          </View>
          <Animated.Text style={[styles.caption, { opacity: chatOpacity }]}>{conv.caption}</Animated.Text>
          {__DEV__ ? <DevReadout read={() => describeLevel(conv)} /> : null}
        </View>
      ) : (
        <View style={styles.compact}>
          <View ref={orbBox} onLayout={onOrbLayout} collapsable={false} style={{ width: COMPACT_ORB, height: COMPACT_ORB }} />
          <Text style={styles.compactCaption}>Voice is off. Tap the orb to bring it back.</Text>
        </View>
      )}

      <Animated.View style={[styles.chat, { opacity: chatOpacity, transform: [{ translateY: chatLift }] }]} pointerEvents="box-none">
        {/* The transcript itself lives in the page layer behind (so glass can refract its text); this
            box only reserves its space in the layout. */}
        <View
          ref={chatBox}
          collapsable={false}
          pointerEvents="none"
          style={styles.chatSpace}
          onLayout={() =>
            chatBox.current?.measureInWindow((x: number, y: number, w: number, h: number) =>
              rootRef.current?.measureInWindow((rx: number, ry: number) => setChatRect({ x: x - rx, y: y - ry, w, h })),
            )
          }
        />
        <Composer step={conv.state.step} onSend={conv.submitText} />
      </Animated.View>

    </>
  );

  const size = voiceMode ? orbSize : COMPACT_ORB;
  const transcriptLayer =
    chatRect.w > 0 ? (
      <Animated.View
        pointerEvents="box-none"
        style={{
          position: 'absolute',
          left: chatRect.x,
          top: chatRect.y,
          width: chatRect.w,
          // Extends down behind the composer, so text that scrolls under it is refracted by it.
          height: chatRect.h + COMPOSER_SPACE,
          opacity: chatOpacity,
          transform: [{ translateY: chatLift }],
        }}
      >
        <Transcript messages={conv.state.messages} onChip={conv.pressChip} bottomInset={COMPOSER_SPACE} />
      </Animated.View>
    ) : null;
  const orbLayer = box.w > 0 ? (
    <Animated.View
      pointerEvents="box-none"
      style={{
        position: 'absolute',
        left: box.x + (box.w - size) / 2,
        top: box.y + (box.h - size) / 2,
        width: size,
        height: size,
        opacity: orbOpacity,
        transform: [{ scale: orbScale }],
      }}
    >
      <OrbSurface
        state={conv.orbState}
        level={conv.orbLevel}
        size={size}
        caption={voiceMode ? conv.caption : 'Tap to open voice mode.'}
        onPress={voiceMode ? conv.tapOrb : () => setVoiceMode(true)}
      />
    </Animated.View>
  ) : null;

  return (
    <GlassBackdrop
      page={
        <>
          <AmbientScene />
          {orbLayer}
          {transcriptLayer}
        </>
      }
    >
      <View
        ref={rootRef}
        collapsable={false}
        pointerEvents="box-none"
        style={StyleSheet.absoluteFill}
        onLayout={(event) => keyboard.onContainerLayout(event.nativeEvent.layout.height)}
      >
        <SafeAreaView style={styles.safe} edges={['top', 'bottom']} pointerEvents="box-none">
          <View style={[styles.safe, { paddingBottom: keyboard.inset }]} pointerEvents="box-none">
            {body}
          </View>
        </SafeAreaView>
        <GlassBottomSheet visible={colorsOpen} onClose={() => setColorsOpen(false)} title="Orb colours">
          <GlassThemeSelector selected={orbTheme} onSelect={setOrbTheme} disabled={microphoneBusy} />
        </GlassBottomSheet>
        <SettingsSheet
          visible={settingsOpen}
          onClose={() => setSettingsOpen(false)}
          consent={consent}
          microphoneBusy={microphoneBusy}
          hasRecording={conv.hasRecording}
          onDeleteRecording={conv.deleteRecording}
          onDevTestVoice={__DEV__ ? conv.devTestVoice : undefined}
          onOpenOrbColors={() => setColorsOpen(true)}
        />
      </View>
    </GlassBackdrop>
  );
}

function describeLevel(conv: ReturnType<typeof useConversation>): string {
  if (conv.orbState === 'listening') {
    const stats = conv.micStats();
    return `mic buffers ${stats.buffers} · last ${stats.lastDb.toFixed(0)} dBFS · level ${conv.orbLevel.get().toFixed(2)}`;
  }
  return `${conv.orbState} · level ${conv.orbLevel.get().toFixed(2)}`;
}

/** Development builds only: shows that real audio is reaching the orb. Updates 4 times a second. */
function DevReadout({ read }: { read: () => string }) {
  const styles = useThemedStyles(makeStyles);
  const [text, setText] = useState('');
  useEffect(() => {
    const timer = setInterval(() => setText(read()), 250);
    return () => clearInterval(timer);
  }, [read]);
  return <Text style={styles.dev}>{text}</Text>;
}

const makeStyles = (colors: Palette) =>
  StyleSheet.create({
  safe: { flex: 1 },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.sm,
    paddingBottom: spacing.xs,
  },
  wordmark: { ...typography.title, color: colors.primary, fontWeight: '800' },
  stage: { flex: 1.7, alignItems: 'center', justifyContent: 'center', paddingHorizontal: spacing.lg },
  orbBox: { flex: 1, alignSelf: 'stretch', alignItems: 'center', justifyContent: 'center' },
  caption: { ...typography.body, color: colors.inkMuted, textAlign: 'center', minHeight: 24 },
  compact: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, paddingHorizontal: spacing.lg, paddingVertical: spacing.sm },
  compactCaption: { ...typography.caption, color: colors.inkMuted, flex: 1 },
  chat: { flex: 1, minHeight: 150 },
  chatSpace: { flex: 1 },
  dev: { ...typography.caption, color: colors.inkMuted, fontVariant: ['tabular-nums'] },
  });
