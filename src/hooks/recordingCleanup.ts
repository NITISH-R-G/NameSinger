/**
 * Deletion bookkeeping for recording files. Pure TypeScript with injected side effects so it
 * can be unit-tested without native modules.
 *
 * Privacy rule: nothing here ever logs or returns a file URI, a path or an error message,
 * because paths and platform error text can contain personal data. Only fixed codes are used.
 */

/** A failing delete is retried on later flushes, up to this many attempts in total. */
export const MAX_DELETE_ATTEMPTS = 3;

export type CleanupFailureCode = 'delete_failed' | 'gave_up';

export interface CleanupFailure {
  code: CleanupFailureCode;
  /** True when the app has stopped retrying this file in the current session. */
  permanent: boolean;
}

export interface CleanupDeps {
  /** Must treat "file already gone" as success and throw on a real failure. */
  deleteFile: (uri: string) => void;
  onFailure: (failure: CleanupFailure) => void;
}

export interface FlushResult {
  deleted: number;
  failed: number;
  /** Files kept on purpose because they are currently being played. */
  deferred: number;
  /** Files still scheduled after this flush (deferred plus retryable failures). */
  pending: number;
}

export interface CleanupQueue {
  schedule: (uri: string | null | undefined) => void;
  flush: (playingUri: string | null) => FlushResult;
  pendingCount: () => number;
}

export function createCleanupQueue(deps: CleanupDeps): CleanupQueue {
  const attempts = new Map<string, number>();

  return {
    schedule(uri) {
      const trimmed = uri?.trim();
      if (!trimmed || attempts.has(trimmed)) return;
      attempts.set(trimmed, 0);
    },

    flush(playingUri) {
      let deleted = 0;
      let failed = 0;
      let deferred = 0;
      for (const [uri, tries] of [...attempts]) {
        if (playingUri !== null && uri === playingUri) {
          deferred += 1;
          continue;
        }
        try {
          deps.deleteFile(uri);
          attempts.delete(uri);
          deleted += 1;
        } catch {
          failed += 1;
          const used = tries + 1;
          if (used >= MAX_DELETE_ATTEMPTS) {
            attempts.delete(uri);
            deps.onFailure({ code: 'gave_up', permanent: true });
          } else {
            attempts.set(uri, used);
            deps.onFailure({ code: 'delete_failed', permanent: false });
          }
        }
      }
      return { deleted, failed, deferred, pending: attempts.size };
    },

    pendingCount: () => attempts.size,
  };
}

export interface SweepDeps {
  listOrphanUris: () => string[];
  deleteFile: (uri: string) => void;
}

export interface SweepResult {
  deleted: number;
  failed: number;
}

/**
 * Removes recording files left behind by an earlier session (app killed, crash, or a
 * recording that was approved and never reset). Best effort: a failure is counted, never thrown.
 */
export function sweepOrphanedRecordings(deps: SweepDeps): SweepResult {
  let deleted = 0;
  let failed = 0;
  let uris: string[];
  try {
    uris = deps.listOrphanUris();
  } catch {
    return { deleted: 0, failed: 1 };
  }
  for (const uri of uris) {
    try {
      deps.deleteFile(uri);
      deleted += 1;
    } catch {
      failed += 1;
    }
  }
  return { deleted, failed };
}

export const CLEANUP_WARNING_RETRYING =
  'A temporary recording could not be removed from your phone yet. The app will try again.';
export const CLEANUP_WARNING_GAVE_UP =
  'A temporary recording could not be removed from your phone. The app will try again before your next recording.';

/** Fixed-code logger: never receives URIs, paths or error text. */
export function logCleanupCode(code: CleanupFailureCode | 'sweep_failed'): void {
  console.warn(`[NameSinger] recording cleanup: ${code}`);
}
