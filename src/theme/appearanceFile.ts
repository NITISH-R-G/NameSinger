import { File, Paths } from 'expo-file-system';

import type { AppearanceStorePort } from './appearance';

/**
 * Appearance is one small JSON file in the app's document directory, next to the consent record and
 * outside the recording work folder. It holds the colour mode and the orb theme, never audio or a name.
 */
const APPEARANCE_FILE_NAME = 'namesinger-appearance.json';

function appearanceFile(): File {
  return new File(Paths.document, APPEARANCE_FILE_NAME);
}

export const appearanceFilePort: AppearanceStorePort = {
  read: async () => {
    const file = appearanceFile();
    if (!file.exists) return null;
    return file.text();
  },
  write: async (text) => {
    const file = appearanceFile();
    if (!file.exists) file.create({ intermediates: true });
    await file.write(text);
  },
};
