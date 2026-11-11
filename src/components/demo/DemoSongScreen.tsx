import { router } from 'expo-router';
import { useEffect, useState } from 'react';
import { ScrollView, StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { useSongPlayback } from '../../hooks/useSongPlayback';
import { DEMO_EXPLANATION, DEMO_LABEL, loadDemoSongUri, type DemoSong } from '../../demo/demoSongs';
import type { OrbState } from '../../orb/orbState';
import type { Palette } from '../../theme/colors';
import { radius, spacing, typography } from '../../theme/tokens';
import { useThemedStyles } from '../../theme/useTheme';
import { ActionButton } from '../ActionButton';
import { AmbientScene } from '../glass/GlassBackdrop';
import { GlassSurface } from '../glass/GlassSurface';
import { OrbSurface } from '../OrbSurface';

const leave = () => (router.canGoBack() ? router.back() : router.replace('/'));

/** Plays one bundled, pre-generated song on the home orb. No recording, consent or rendering is involved. */
export function DemoSongScreen({ song }: { song: DemoSong | null }) {
  const styles = useThemedStyles(makeStyles);
  const { width, height } = useWindowDimensions();
  const orbSize = Math.round(Math.max(180, Math.min(width * 0.9, height * 0.36, 380)));
  const [uri, setUri] = useState<string | null>(null);
  const [loadFailed, setLoadFailed] = useState(false);
  const [activeId, setActiveId] = useState<string | null>(null);
  const play = useSongPlayback({ uri, id: 'demo', activeId, onActivate: setActiveId });

  useEffect(() => {
    if (song === null) return undefined;
    let alive = true;
    setLoadFailed(false);
    loadDemoSongUri(song).then(
      (loaded) => alive && setUri(loaded),
      () => alive && setLoadFailed(true),
    );
    return () => {
      alive = false;
    };
  }, [song]);

  const playing = play.phase === 'playing';
  const orbState: OrbState = playing ? 'playing' : play.phase === 'paused' ? 'paused' : play.phase === 'error' || loadFailed ? 'error' : 'idle';
  const caption = playing ? 'Playing the demo song. Tap to pause.' : 'The demo song is ready. Tap to play.';

  return (
    <View style={styles.root}>
      <AmbientScene />
      <SafeAreaView style={styles.root} edges={['top', 'bottom']}>
        <ScrollView contentContainerStyle={styles.scroll}>
          <View style={styles.header}>
            <ActionButton label="Back" variant="contextual" onPress={leave} accessibilityHint="Leaves the demo" />
            <Text style={styles.title}>Birthday song demo</Text>
          </View>

          <GlassSurface strong radius={radius.lg} style={styles.card} contentStyle={styles.cardContent}>
            <Text style={styles.label} accessibilityRole="header">
              {DEMO_LABEL}
            </Text>
            <Text style={styles.body}>{DEMO_EXPLANATION}</Text>
          </GlassSurface>

          {song === null ? (
            <Text style={styles.error}>That demo does not exist.</Text>
          ) : (
            <>
              <View style={styles.orbBox}>
                <OrbSurface
                  state={orbState}
                  level={play.level}
                  size={orbSize}
                  caption={caption}
                  onPress={() => {
                    if (uri !== null) play.toggle();
                  }}
                />
              </View>
              <Text style={styles.status}>
                {loadFailed || play.phase === 'error'
                  ? 'The demo song could not be played.'
                  : uri === null || play.phase === 'loading'
                    ? 'Getting the song ready…'
                    : `${song.title}. Tap the orb to ${playing ? 'pause' : 'play'}.`}
              </Text>
            </>
          )}
        </ScrollView>
      </SafeAreaView>
    </View>
  );
}

const makeStyles = (c: Palette) =>
  StyleSheet.create({
    root: { flex: 1 },
    scroll: { padding: spacing.lg, gap: spacing.lg, paddingBottom: spacing.xxl },
    header: { gap: spacing.sm },
    title: { ...typography.display, color: c.ink },
    card: { alignSelf: 'stretch' },
    cardContent: { padding: spacing.lg, gap: spacing.sm },
    label: { ...typography.title, color: c.ink },
    body: { ...typography.body, color: c.ink },
    status: { ...typography.body, color: c.ink, textAlign: 'center' },
    error: { ...typography.body, color: c.danger },
    orbBox: { alignItems: 'center', justifyContent: 'center' },
  });
