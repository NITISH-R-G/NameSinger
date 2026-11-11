import { Asset } from 'expo-asset';
import { File } from 'expo-file-system';

import { newWorkFileUri } from '../hooks/recordingFiles';
import type { SongIO } from './generateSong';
import { DEMO_INSTRUMENTAL_ASSET } from './instrumentalAsset';

/** Real file and asset access for the app (expo-file-system and expo-asset). */
export const nativeSongIO: SongIO = {
  readBytes: (uri) => new File(uri).bytes(),

  writeBytes: async (uri, bytes) => {
    const file = new File(uri);
    if (!file.exists) file.create({ intermediates: true });
    // write() is asynchronous: the file must be complete before anything plays or reads it.
    await file.write(bytes);
  },

  newSongUri: () => newWorkFileUri('song'),

  loadInstrumental: async () => {
    const asset = Asset.fromModule(DEMO_INSTRUMENTAL_ASSET);
    await asset.downloadAsync();
    if (asset.localUri === null) throw new Error('The demo instrumental could not be loaded.');
    return new File(asset.localUri).bytes();
  },
};
