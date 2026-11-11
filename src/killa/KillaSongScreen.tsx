import { useAudioPlayer, useAudioPlayerStatus } from 'expo-audio';
import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import {
  Alert,
  Animated,
  BackHandler,
  Easing,
  Image,
  Keyboard,
  ScrollView,
  StyleSheet,
  Text,
  View,
  useWindowDimensions,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Svg, { Circle, Defs, RadialGradient, Stop } from 'react-native-svg';

import {
  KillaButton,
  KillaField,
  KillaRecord,
  KillaSegmented,
  KillaStaff,
  loadWaveform,
} from '../../modules/killa-ui/src';
import { loadYueEngine } from '../../modules/yue-engine/src';
import { STEP_COUNT } from '../song/progress';
import { OCCASIONS, SONG_STYLES, normaliseName } from '../song/songRequest';
import { useSongGeneration } from '../song/useSongGeneration';
import { IconButton } from './IconButton';
import { Waveform } from './Waveform';
import { killa } from './tokens';

function mmss(total: number) {
  return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, '0')}`;
}

// Record speeds in degrees per second: 200 is a 33 rpm record. Slower while a song plays, still when paused.
const SPEED_MAKING = 200;
const SPEED_PLAYING = 100;

/** Playback of the finished song with its real waveform. The file starts playing once, when it first loads. */
function useSongPlayer(path: string | null) {
  const player = useAudioPlayer(path ? `file://${path}` : null);
  const status = useAudioPlayerStatus(player);
  const [peaks, setPeaks] = useState<number[]>([]);
  const started = useRef<string | null>(null);

  useEffect(() => {
    setPeaks([]);
    if (!path) return undefined;
    let alive = true;
    void loadWaveform(path, 96).then((p) => alive && setPeaks(p));
    return () => {
      alive = false;
    };
  }, [path]);

  useEffect(() => {
    if (path && status.isLoaded && started.current !== path) {
      started.current = path;
      player.play();
    }
  }, [path, status.isLoaded, player]);

  const duration = status.duration > 0 ? status.duration : 0;
  const position = Math.min(status.currentTime, duration || status.currentTime);
  const playing = status.playing;
  const finished = duration > 0 && position >= duration - 0.15 && !playing;

  const toggle = () => {
    if (playing) player.pause();
    else {
      if (finished) void player.seekTo(0);
      player.play();
    }
  };
  const replay = () => {
    void player.seekTo(0);
    player.play();
  };
  const seek = (seconds: number) => void player.seekTo(seconds);
  return { playing, position, duration, peaks, toggle, replay, seek };
}

/** A slow amber glow behind the record while a song is being made; background motion, not progress. */
function GlowPulse({ size }: { size: number }) {
  const t = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(t, { toValue: 1, duration: 2600, easing: Easing.inOut(Easing.sin), useNativeDriver: true }),
        Animated.timing(t, { toValue: 0, duration: 2600, easing: Easing.inOut(Easing.sin), useNativeDriver: true }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [t]);
  const opacity = t.interpolate({ inputRange: [0, 1], outputRange: [0.35, 0.9] });
  return (
    <Animated.View pointerEvents="none" style={[styles.glow, { width: size, height: size, opacity }]}>
      <Svg width={size} height={size}>
        <Defs>
          <RadialGradient id="pulse" cx="50%" cy="50%" r="50%">
            <Stop offset="0%" stopColor={killa.glow} stopOpacity={0.3} />
            <Stop offset="100%" stopColor={killa.glow} stopOpacity={0} />
          </RadialGradient>
        </Defs>
        <Circle cx={size / 2} cy={size / 2} r={size / 2} fill="url(#pulse)" />
      </Svg>
    </Animated.View>
  );
}

function TopBar({ top, left, right }: { top: number; left?: ReactNode; right?: ReactNode }) {
  return (
    <View style={[styles.top, { paddingTop: top + 4 }]}>
      {left}
      <Text style={[styles.brand, left ? styles.brandAfterIcon : null]} accessibilityRole="header">
        NameSinger
      </Text>
      {right}
    </View>
  );
}

/**
 * NameSinger: one screen, three states. Create (name, occasion, style, Generate), Making (record, staff, honest stage),
 * Player (record, waveform timeline, play/pause, Replay, Save, Share).
 */
export function KillaSongScreen() {
  const insets = useSafeAreaInsets();
  const { width, height } = useWindowDimensions();
  const [name, setName] = useState('');
  const [styleIndex, setStyleIndex] = useState(0);
  const [note, setNote] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [keyboard, setKeyboard] = useState(false);
  const savedUri = useRef<string | null>(null);
  const gen = useSongGeneration();
  const clean = normaliseName(name);
  const busy = gen.phase === 'preparing' || gen.phase === 'generating';
  const done = gen.phase === 'done' && gen.song !== null;
  const style = SONG_STYLES[styleIndex] ?? SONG_STYLES[0];
  const player = useSongPlayer(done && gen.song ? gen.song.audioPath : null);

  useEffect(() => {
    const a = Keyboard.addListener('keyboardDidShow', () => setKeyboard(true));
    const b = Keyboard.addListener('keyboardDidHide', () => setKeyboard(false));
    return () => {
      a.remove();
      b.remove();
    };
  }, []);

  const confirmStop = useCallback(() => {
    Alert.alert('Stop this song?', 'It is not finished yet.', [
      { text: 'Keep going', style: 'cancel' },
      { text: 'Stop', style: 'destructive', onPress: gen.cancel },
    ]);
  }, [gen.cancel]);

  const another = useCallback(() => {
    setNote(null);
    setSaved(false);
    savedUri.current = null;
    gen.reset();
  }, [gen]);

  // Android Back: from the player it returns to Create; while a song is being made it asks first; on Create it leaves the app.
  useEffect(() => {
    const sub = BackHandler.addEventListener('hardwareBackPress', () => {
      if (busy) {
        confirmStop();
        return true;
      }
      if (done) {
        another();
        return true;
      }
      return false;
    });
    return () => sub.remove();
  }, [busy, done, confirmStop, another]);

  const onGenerate = () => {
    setNote(null);
    setSaved(false);
    savedUri.current = null;
    void gen.generate(name, style.id);
  };

  const save = (): string | null => {
    const engine = loadYueEngine();
    if (!engine || !gen.song) return null;
    try {
      const uri = savedUri.current ?? engine.saveToMusic(gen.song.audioPath, `NameSinger ${gen.song.name} birthday song`);
      savedUri.current = uri;
      setSaved(true);
      return uri;
    } catch (e) {
      setNote(`Could not save the song: ${e instanceof Error ? e.message : String(e)}`);
      return null;
    }
  };
  const onSave = () => {
    if (save()) setNote('Saved to Music/NameSinger on this phone.');
  };
  const onShare = () => {
    const uri = save();
    if (!uri || !gen.song) return;
    try {
      loadYueEngine()?.shareUri(uri, `A birthday song for ${gen.song.name}`);
    } catch (e) {
      setNote(`Could not open the share sheet: ${e instanceof Error ? e.message : String(e)}`);
    }
  };
  const onMore = () => {
    if (!gen.song) return;
    const song = gen.song;
    Alert.alert('NameSinger', undefined, [
      { text: 'Make another song', onPress: another },
      {
        text: 'Song details',
        onPress: () =>
          Alert.alert(
            `Happy birthday, ${song.name}`,
            `${style.label} style\n${Math.round(player.duration)} seconds long\nMade on this phone in ${mmss(song.seconds)}`,
          ),
      },
      { text: 'Close', style: 'cancel' },
    ]);
  };

  const recordSide = Math.min(width, height * 0.42);
  const playerSide = Math.min(width * 0.9, height * 0.32); // smaller in the player so the controls fit above the fold

  return (
    <View style={styles.root}>
      <Image source={require('../../assets/killa/wall.jpg')} style={StyleSheet.absoluteFill} resizeMode="cover" />
      <View style={styles.wallShade} pointerEvents="none" />

      {busy ? (
        <TopBar top={insets.top} right={<IconButton icon="close" label="Cancel song" variant="header" onPress={confirmStop} />} />
      ) : done ? (
        <TopBar
          top={insets.top}
          left={<IconButton icon="back" label="Back" hint="Return to the start" variant="header" onPress={another} />}
          right={<IconButton icon="more" label="More options" variant="header" onPress={onMore} />}
        />
      ) : (
        <TopBar top={insets.top} />
      )}

      <ScrollView
        contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + 24 }]}
        keyboardShouldPersistTaps="handled"
      >
        {busy ? (
          <View style={styles.fill}>
            <Text style={styles.heading} numberOfLines={2}>
              Making a song for {clean}
            </Text>
            <View style={styles.stageArt}>
              <GlowPulse size={recordSide * 1.25} />
              <KillaRecord style={{ width: recordSide, height: recordSide }} speed={SPEED_MAKING} />
            </View>
            <KillaStaff style={styles.staff} progress={0} indeterminate />
            <View style={styles.stage}>
              <Text style={styles.body}>
                {gen.progress.step === 0 ? 'Starting' : `Step ${gen.progress.step} of ${STEP_COUNT}`}
                {'  ·  '}
                {mmss(gen.elapsedSeconds)}
              </Text>
              <Text style={styles.stageTitle}>{gen.progress.title}</Text>
              {gen.progress.detail ? <Text style={styles.body}>{gen.progress.detail}</Text> : null}
            </View>
            <Text style={styles.fine}>Keep the app open and the phone plugged in.</Text>
          </View>
        ) : done && gen.song ? (
          <View style={styles.fill}>
            <View style={styles.playerArt}>
              <KillaRecord style={{ width: playerSide, height: playerSide }} speed={player.playing ? SPEED_PLAYING : 0} />
            </View>
            <View style={styles.titles}>
              <Text style={styles.songTitle} numberOfLines={2}>
                Happy birthday, {gen.song.name}
              </Text>
              <Text style={styles.body}>
                Birthday · {style.label} · made on this phone in {mmss(gen.song.seconds)}
              </Text>
            </View>
            <Waveform peaks={player.peaks} position={player.position} duration={player.duration} onSeek={player.seek} />
            <View style={styles.playRow}>
              <IconButton
                icon={player.playing ? 'pause' : 'play'}
                label={player.playing ? 'Pause' : 'Play'}
                variant="primary"
                onPress={player.toggle}
              />
            </View>
            <View style={styles.actions}>
              <IconButton icon="replay" label="Replay from the start" onPress={player.replay} />
              <IconButton
                icon={saved ? 'saved' : 'save'}
                label={saved ? 'Saved to Music' : 'Save to Music'}
                selected={saved}
                onPress={onSave}
              />
              <IconButton icon="share" label="Share song" onPress={onShare} />
            </View>
            {note ? <Text style={styles.note}>{note}</Text> : null}
          </View>
        ) : (
          <View style={styles.fill}>
            {!keyboard ? (
              <View style={styles.hero}>
                <KillaRecord style={{ width: Math.min(width, 300), height: Math.min(width, 300) }} speed={0} />
              </View>
            ) : null}
            <Text style={styles.heading}>Who is the song for?</Text>
            <KillaField
              style={styles.field}
              value={name}
              hint="Type any name"
              maxLength={24}
              onChangeText={(e) => setName(e.nativeEvent.text)}
            />

            <Text style={styles.label}>Occasion</Text>
            <KillaSegmented style={styles.segmented} options={OCCASIONS.map((o) => o.label)} selectedIndex={0} />

            <Text style={styles.label}>Style (optional)</Text>
            <KillaSegmented
              style={styles.segmented}
              options={SONG_STYLES.map((s) => s.label)}
              selectedIndex={styleIndex}
              onSelect={(e) => setStyleIndex(e.nativeEvent.index)}
            />

            {gen.phase === 'error' && gen.error ? <Text style={styles.error}>{gen.error}</Text> : null}
            <KillaButton
              style={styles.primary}
              variant="primary"
              label="Generate song"
              disabled={clean.length === 0}
              onPress={onGenerate}
            />
            <Text style={styles.fine}>
              Made on this phone in a few minutes. Song model YuE2 (CC BY-NC 4.0): non-commercial use.
            </Text>
          </View>
        )}
      </ScrollView>
    </View>
  );
}

// Type scale: wordmark 30 (script), song title 24, heading 22, stage title 18, body 14, fine 12.
const MARGIN = 20;
const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: killa.deck },
  wallShade: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: '#000000', opacity: 0.733 }, // Killa's page: wallpaper multiplied by 0x444444
  top: { flexDirection: 'row', alignItems: 'center', minHeight: 60, paddingHorizontal: MARGIN - 8, paddingBottom: 6, backgroundColor: killa.deck },
  brand: { flex: 1, fontFamily: killa.script, fontSize: 30, color: killa.accent, paddingLeft: 8 },
  brandAfterIcon: { paddingLeft: 4 },
  content: { flexGrow: 1, paddingHorizontal: MARGIN, paddingTop: 12 },
  fill: { flex: 1, justifyContent: 'center' },
  hero: { alignItems: 'center', marginBottom: 4 },
  heading: { fontFamily: killa.textFont, fontSize: 22, lineHeight: 28, color: killa.text },
  songTitle: { fontFamily: killa.textFont, fontSize: 24, lineHeight: 30, color: killa.text, textAlign: 'center' },
  label: { fontFamily: killa.textFont, fontSize: 14, color: killa.dim, marginTop: 20, marginBottom: 8 },
  field: { height: 52, marginTop: 14 },
  segmented: { height: 48 },
  primary: { height: 64, marginTop: 28 },
  error: { fontFamily: killa.textFont, fontSize: 14, lineHeight: 20, color: killa.hi, marginTop: 20 },
  fine: { fontFamily: killa.textFont, fontSize: 12, lineHeight: 17, color: killa.dim, marginTop: 14 },
  stageArt: { alignItems: 'center', justifyContent: 'center', marginTop: 4 },
  glow: { position: 'absolute' },
  staff: { height: 96, marginTop: 0 },
  stage: { marginTop: 14, gap: 4 },
  stageTitle: { fontFamily: killa.textFont, fontSize: 18, color: killa.text },
  body: { fontFamily: killa.textFont, fontSize: 14, lineHeight: 20, color: killa.dim },
  playerArt: { alignItems: 'center' },
  titles: { alignItems: 'center', gap: 6, marginBottom: 10 },
  playRow: { alignItems: 'center', marginTop: 14 },
  actions: { flexDirection: 'row', justifyContent: 'space-evenly', marginTop: 22, paddingHorizontal: 24 },
  note: { fontFamily: killa.textFont, fontSize: 14, lineHeight: 20, color: killa.text, marginTop: 14, textAlign: 'center' },
});
