import { Asset } from 'expo-asset';

/**
 * Pre-generated demo songs. Each one was made in advance (outside the app, with SoulX-Singer) and is
 * bundled as a fixed audio file. Nothing here is generated live, and the screen says so.
 */
export const DEMO_LABEL = 'Pre-generated demo';
export const DEMO_EXPLANATION =
  'This song was made in advance, outside the app. It is a recording, not something NameSinger generated just now.';

export interface DemoSong {
  id: string;
  title: string;
  /** The name sung in the song, for display. */
  name: string;
  /** The bundled WAV (22.05 kHz mono, 16-bit). */
  asset: number;
}

export const DEMO_SONGS: readonly DemoSong[] = [
  {
    id: 'isabella',
    title: 'Happy birthday, Isabella',
    name: 'Isabella',
    asset: require('../../assets/audio/demo/isabella_birthday_mix_v1.wav') as number,
  },
];

/** The demo for a route parameter; with no parameter, the first demo. Null for an unknown id. */
export function demoSongById(id: string | undefined): DemoSong | null {
  if (id === undefined || id === '') return DEMO_SONGS[0] ?? null;
  return DEMO_SONGS.find((song) => song.id === id) ?? null;
}

const cache = new Map<string, Promise<string>>();

/** A local file URI the player can open, resolved once per session (same pattern as the birthday song assets). */
export function loadDemoSongUri(song: DemoSong): Promise<string> {
  let loaded = cache.get(song.id);
  if (!loaded) {
    loaded = (async () => {
      const asset = Asset.fromModule(song.asset);
      await asset.downloadAsync();
      if (asset.localUri === null) throw new Error('The demo song could not be loaded.');
      return asset.localUri;
    })();
    cache.set(song.id, loaded);
    loaded.catch(() => cache.delete(song.id));
  }
  return loaded;
}
