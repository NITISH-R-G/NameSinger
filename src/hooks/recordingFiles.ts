import { Directory, File, Paths } from 'expo-file-system';

import { sweepOrphanedRecordings, type SweepResult } from './recordingCleanup';

/**
 * Everything NameSinger writes that contains the user's voice (the name recording and the
 * generated song) lives in this one folder of the app cache, so a single sweep can remove
 * leftovers. Nothing else in the app writes here.
 */
const WORK_DIRECTORY_NAME = 'NameSinger';

function workDirectory(): Directory {
  const directory = new Directory(Paths.cache, WORK_DIRECTORY_NAME);
  if (!directory.exists) directory.create({ idempotent: true, intermediates: true });
  return directory;
}

/** A fresh, unique file URI inside the work folder. The file is not created. */
export function newWorkFileUri(prefix: 'name' | 'song'): string {
  const unique = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
  return new File(workDirectory(), `${prefix}-${unique}.wav`).uri;
}

/** Deletes a file. A file that is already gone counts as success; anything else throws. */
export function deleteRecordingFile(uri: string): void {
  const file = new File(uri);
  if (!file.exists) return;
  file.delete();
}

function listOrphanUris(): string[] {
  const directory = new Directory(Paths.cache, WORK_DIRECTORY_NAME);
  if (!directory.exists) return [];
  const uris: string[] = [];
  for (const entry of directory.list()) {
    if (entry instanceof File) uris.push(entry.uri);
  }
  return uris;
}

let sweepPromise: Promise<SweepResult> | null = null;

/** Runs the orphan sweep once per JS process; later callers share the same promise. */
export function sweepOnce(): Promise<SweepResult> {
  if (sweepPromise === null) {
    sweepPromise = Promise.resolve().then(() =>
      sweepOrphanedRecordings({ listOrphanUris, deleteFile: deleteRecordingFile }),
    );
  }
  return sweepPromise;
}
