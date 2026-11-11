import { Asset } from 'expo-asset';
import { File } from 'expo-file-system';

import type { PcmAudio } from '../audio/types';
import { decodeWav } from '../audio/wav';
import type { KeyName } from './score';

/** The original birthday song, pre-rendered once per key (22.05 kHz mono, name slot left empty). */
const SONG_ASSETS: Record<KeyName, number> = {
  low: require('../../assets/audio/birthday/birthday-low.wav') as number,
  mid: require('../../assets/audio/birthday/birthday-mid.wav') as number,
  high: require('../../assets/audio/birthday/birthday-high.wav') as number,
};

export interface LoadedSong {
  /** A local file the player can open. */
  uri: string;
  pcm: PcmAudio;
}

const cache = new Map<KeyName, Promise<LoadedSong>>();

/** Loads a key's song from the app bundle once and keeps it for the session. */
export function loadBirthdaySong(key: KeyName): Promise<LoadedSong> {
  let loaded = cache.get(key);
  if (!loaded) {
    loaded = (async () => {
      const asset = Asset.fromModule(SONG_ASSETS[key]);
      await asset.downloadAsync();
      if (asset.localUri === null) throw new Error('The birthday song could not be loaded.');
      const bytes = await new File(asset.localUri).bytes();
      return { uri: asset.localUri, pcm: decodeWav(bytes) };
    })();
    cache.set(key, loaded);
    loaded.catch(() => cache.delete(key));
  }
  return loaded;
}
