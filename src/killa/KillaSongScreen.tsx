import { router } from 'expo-router';
import { useRef, useState } from 'react';
import { Image, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { KillaButton, KillaDeck, KillaField, KillaRecord, KillaStaff, type KillaDeckHandle } from '../../modules/killa-ui/src';
import { loadYueEngine } from '../../modules/yue-engine/src';
import { OCCASIONS, SONG_STYLES, type SongStyleId, normaliseName } from '../song/songRequest';
import { useSongGeneration } from '../song/useSongGeneration';
import { killa } from './tokens';

function mmss(total: number) {
  return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, '0')}`;
}

/** NameSinger on Killa YuE's design: the Create page with the player deck below it. */
export function KillaSongScreen() {
  const insets = useSafeAreaInsets();
  const [name, setName] = useState('');
  const [style, setStyle] = useState<SongStyleId>('pop');
  const [note, setNote] = useState<string | null>(null);
  const savedUri = useRef<string | null>(null);
  const deck = useRef<KillaDeckHandle>(null);
  const gen = useSongGeneration();
  const clean = normaliseName(name);
  const busy = gen.phase === 'preparing' || gen.phase === 'generating';
  const done = gen.phase === 'done' && gen.song !== null;

  const status = busy ? 'Making your song' : done ? 'Song ready' : 'On this phone';

  const onGenerate = () => {
    if (busy) {
      gen.cancel();
      return;
    }
    setNote(null);
    savedUri.current = null;
    void gen.generate(name, style);
  };

  const save = (): string | null => {
    const engine = loadYueEngine();
    if (!engine || !gen.song) return null;
    try {
      const uri = savedUri.current ?? engine.saveToMusic(gen.song.audioPath, `NameSinger ${gen.song.name} birthday song`);
      savedUri.current = uri;
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

  return (
    <View style={styles.root}>
      <Image source={require('../../assets/killa/wall.jpg')} style={StyleSheet.absoluteFill} resizeMode="cover" />
      <View style={styles.wallShade} pointerEvents="none" />

      <View style={[styles.top, { paddingTop: insets.top + 8 }]}>
        <Text style={styles.title} accessibilityRole="header">
          NameSinger
        </Text>
        <Text style={styles.header}>{status}</Text>
      </View>

      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <Text style={styles.label}>Name</Text>
        <KillaField style={styles.field} value={name} hint="Type any name" maxLength={24} onChangeText={(e) => setName(e.nativeEvent.text)} />

        <Text style={styles.label}>Occasion</Text>
        <View style={styles.row}>
          {OCCASIONS.map((o) => (
            <KillaButton key={o.id} style={styles.chip} variant="chip" label={o.label} selected />
          ))}
          <View style={styles.tabSpacer} />
          <View style={styles.tabSpacer} />
        </View>

        <Text style={styles.label}>Style</Text>
        <View style={styles.row}>
          {SONG_STYLES.map((s) => (
            <KillaButton key={s.id} style={styles.chip} variant="chip" label={s.label} selected={style === s.id} onPress={() => setStyle(s.id)} />
          ))}
        </View>

        <View style={styles.gap}>
          <KillaButton
            style={styles.primary}
            variant="primary"
            label={busy ? 'Cancel' : 'Generate song'}
            disabled={!busy && clean.length === 0}
            onPress={onGenerate}
          />
        </View>

        {busy ? (
          <>
            <View style={styles.recordRow}>
              <KillaRecord style={styles.record} spinning />
            </View>
            <KillaStaff
              style={styles.staff}
              progress={Math.round(gen.progress.fraction * 1000)}
              indeterminate={gen.phase === 'preparing'}
            />
            <Text style={styles.progText}>
              {gen.phase === 'preparing' ? 'Getting ready' : gen.progress.text} Â· {Math.round(gen.progress.fraction * 100)}% Â· {mmss(gen.elapsedSeconds)}
            </Text>
            <Text style={styles.hint}>Made on this phone. Keep the app open and the phone plugged in.</Text>
          </>
        ) : null}

        {gen.phase === 'error' && gen.error ? <Text style={styles.progText}>{gen.error}</Text> : null}

        {done && gen.song ? (
          <>
            <Text style={styles.label}>Your song for {gen.song.name}</Text>
            <View style={styles.row}>
              <KillaButton style={styles.plate} variant="plate" label="Save" onPress={onSave} />
              <KillaButton style={styles.plate} variant="plate" label="Share" onPress={onShare} />
              <KillaButton style={styles.plate} variant="plate" label="Replay" onPress={() => void deck.current?.replay()} />
            </View>
            {note ? <Text style={styles.progText}>{note}</Text> : null}
            <Text style={styles.hint}>Made on this phone in {mmss(gen.song.seconds)}.</Text>
          </>
        ) : null}

        {!busy ? (
          <View style={styles.footer}>
            <KillaButton style={styles.plate} variant="plate" label="Voice assistant" onPress={() => router.push('/assistant')} />
            <Text style={styles.hint}>
              Song model YuE2 (CC BY-NC 4.0), non-commercial use. Design from Killa YuE (Apache-2.0); typefaces SIL OFL 1.1.
            </Text>
          </View>
        ) : null}
      </ScrollView>

      <KillaDeck
        ref={deck}
        style={styles.deck}
        source={done && gen.song ? gen.song.audioPath : null}
        title={done && gen.song ? `Happy birthday, ${gen.song.name}` : ''}
      />
      <View style={{ height: insets.bottom, backgroundColor: killa.deck }} />
    </View>
  );
}

// Sizes are Killa's: top row padding 18/8, content padding 16, labels 13 bold, 44 plates, 64 primary, staff 72, deck 132.
const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: killa.deck },
  wallShade: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: '#000000', opacity: 0.733 }, // Skin.background: multiply 0x444444
  top: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 18, paddingBottom: 8, backgroundColor: killa.deck },
  title: { flex: 1, fontFamily: killa.script, fontSize: 30, color: killa.accent, textShadowColor: '#CC000000', textShadowOffset: { width: 0, height: 2 }, textShadowRadius: 8 },
  header: { fontFamily: killa.textFont, fontSize: 12, color: killa.dim },
  content: { paddingHorizontal: 16, paddingTop: 4, paddingBottom: 24 },
  label: { fontFamily: killa.textFont, fontWeight: '700', fontSize: 13, color: killa.dim, paddingTop: 16, paddingBottom: 5, textShadowColor: '#99000000', textShadowOffset: { width: 0, height: 1 }, textShadowRadius: 4 },
  field: { height: 52 },
  row: { flexDirection: 'row', gap: 8 },
  chip: { flex: 1, height: 44 },
  tabSpacer: { flex: 1 },
  gap: { marginTop: 18 },
  primary: { height: 64 },
  plate: { flex: 1, height: 50 },
  recordRow: { alignItems: 'center', marginTop: 14 },
  record: { width: 190, height: 190 },
  staff: { height: 72, marginTop: 10 },
  progText: { fontFamily: killa.textFont, fontSize: 14, color: killa.text, marginTop: 8, textShadowColor: '#99000000', textShadowOffset: { width: 0, height: 1 }, textShadowRadius: 4 },
  hint: { fontFamily: killa.textFont, fontSize: 12, color: killa.dim, marginTop: 8 },
  footer: { marginTop: 22 },
  deck: { height: 132 },
});
