import { useRef, useState } from 'react';
import { Image, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import {
  KillaButton,
  KillaDeck,
  KillaField,
  KillaRecord,
  KillaSegmented,
  KillaStaff,
  type KillaDeckHandle,
} from '../../modules/killa-ui/src';
import { loadYueEngine } from '../../modules/yue-engine/src';
import { STEP_COUNT } from '../song/progress';
import { OCCASIONS, SONG_STYLES, normaliseName } from '../song/songRequest';
import { useSongGeneration } from '../song/useSongGeneration';
import { killa } from './tokens';

function mmss(total: number) {
  return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, '0')}`;
}

/**
 * NameSinger: one screen, three states. Create (name, occasion, style, Generate), Generating (record, staff, honest
 * stage), Done (player, Replay, Save, Share). Killa Gold artwork and typefaces; one gilded plate per screen.
 */
export function KillaSongScreen() {
  const insets = useSafeAreaInsets();
  const [name, setName] = useState('');
  const [styleIndex, setStyleIndex] = useState(0);
  const [note, setNote] = useState<string | null>(null);
  const savedUri = useRef<string | null>(null);
  const deck = useRef<KillaDeckHandle>(null);
  const gen = useSongGeneration();
  const clean = normaliseName(name);
  const busy = gen.phase === 'preparing' || gen.phase === 'generating';
  const done = gen.phase === 'done' && gen.song !== null;
  const style = SONG_STYLES[styleIndex] ?? SONG_STYLES[0];

  const onGenerate = () => {
    setNote(null);
    savedUri.current = null;
    void gen.generate(name, style.id);
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
        <Text style={styles.brand} accessibilityRole="header">
          NameSinger
        </Text>
      </View>

      <ScrollView
        contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + 24 }]}
        keyboardShouldPersistTaps="handled"
      >
        {busy ? (
          <>
            <Text style={styles.heading} numberOfLines={2}>
              Making a song for {clean}
            </Text>
            <View style={styles.recordRow}>
              <KillaRecord style={styles.record} spinning />
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
            <KillaButton style={styles.cancel} variant="link" label="Cancel" onPress={gen.cancel} />
            <Text style={styles.fine}>Keep the app open and the phone plugged in.</Text>
          </>
        ) : done && gen.song ? (
          <>
            <Text style={styles.heading} numberOfLines={2}>
              Happy birthday, {gen.song.name}
            </Text>
            <Text style={styles.body}>
              {style.label} · made on this phone in {mmss(gen.song.seconds)}
            </Text>
            <KillaDeck style={styles.deck} source={gen.song.audioPath} title={gen.song.name} ref={deck} />
            <View style={styles.actions}>
              <KillaButton style={styles.action} variant="chip" label="Replay" onPress={() => void deck.current?.replay()} />
              <KillaButton style={styles.action} variant="chip" label="Save" onPress={onSave} />
              <KillaButton style={styles.action} variant="chip" label="Share" onPress={onShare} />
            </View>
            {note ? <Text style={styles.note}>{note}</Text> : null}
            <KillaButton style={styles.link} variant="link" label="Make another song" onPress={gen.reset} />
          </>
        ) : (
          <>
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
          </>
        )}
      </ScrollView>
    </View>
  );
}

// Type scale: wordmark 30 (script), heading 22, stage title 18, body 14, fine 12.
const MARGIN = 20;
const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: killa.deck },
  wallShade: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: '#000000', opacity: 0.733 }, // Killa's page: wallpaper multiplied by 0x444444
  top: { paddingHorizontal: MARGIN, paddingBottom: 10, backgroundColor: killa.deck },
  brand: { fontFamily: killa.script, fontSize: 30, color: killa.accent },
  content: { paddingHorizontal: MARGIN, paddingTop: 20 },
  heading: { fontFamily: killa.textFont, fontSize: 22, lineHeight: 28, color: killa.text },
  label: { fontFamily: killa.textFont, fontSize: 14, color: killa.dim, marginTop: 20, marginBottom: 8 },
  field: { height: 52, marginTop: 14 },
  segmented: { height: 48 },
  primary: { height: 64, marginTop: 28 },
  cancel: { height: 48, marginTop: 20, alignSelf: 'center', minWidth: 160 },
  error: { fontFamily: killa.textFont, fontSize: 14, lineHeight: 20, color: killa.hi, marginTop: 20 },
  fine: { fontFamily: killa.textFont, fontSize: 12, lineHeight: 17, color: killa.dim, marginTop: 14 },
  recordRow: { alignItems: 'center', marginTop: 8 },
  record: { width: 170, height: 170 },
  staff: { height: 96, marginTop: 4 },
  stage: { marginTop: 14, gap: 4 },
  stageTitle: { fontFamily: killa.textFont, fontSize: 18, color: killa.text },
  body: { fontFamily: killa.textFont, fontSize: 14, lineHeight: 20, color: killa.dim },
  deck: { height: 198, marginTop: 18, marginHorizontal: -MARGIN },
  actions: { flexDirection: 'row', gap: 8, marginTop: 20 },
  action: { flex: 1, height: 48 },
  note: { fontFamily: killa.textFont, fontSize: 14, lineHeight: 20, color: killa.text, marginTop: 14 },
  link: { height: 48, marginTop: 14, alignSelf: 'center', minWidth: 220 },
});
