import { File, Paths } from 'expo-file-system';

import type { ConsentStorePort } from './consentStore';

/**
 * The consent record is one small JSON file in the app's document directory (kept across launches,
 * unlike the cache). It is deliberately NOT inside the recording work folder, whose contents are
 * swept as orphans (see recordingFiles.ts). It holds a version and a timestamp, never audio.
 * expo-file-system is already a dependency; nothing was added for this.
 */
const CONSENT_FILE_NAME = 'namesinger-consent.json';

function consentFile(): File {
  return new File(Paths.document, CONSENT_FILE_NAME);
}

export const consentFilePort: ConsentStorePort = {
  read: async () => {
    const file = consentFile();
    if (!file.exists) return null;
    return file.text();
  },
  write: async (text) => {
    const file = consentFile();
    if (!file.exists) file.create({ intermediates: true });
    await file.write(text);
  },
  remove: async () => {
    const file = consentFile();
    if (file.exists) file.delete();
  },
};
