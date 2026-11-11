import {
  createCleanupQueue,
  logCleanupCode,
  MAX_DELETE_ATTEMPTS,
  sweepOrphanedRecordings,
} from '../src/hooks/recordingCleanup';

describe('cleanup queue', () => {
  it('ignores empty URIs and de-duplicates', () => {
    const deleted: string[] = [];
    const queue = createCleanupQueue({ deleteFile: (u) => deleted.push(u), onFailure: jest.fn() });
    queue.schedule(null);
    queue.schedule(undefined);
    queue.schedule('  ');
    queue.schedule('a');
    queue.schedule('a');
    expect(queue.pendingCount()).toBe(1);
    expect(queue.flush(null)).toEqual({ deleted: 1, failed: 0, deferred: 0, pending: 0 });
    expect(deleted).toEqual(['a']);
  });

  it('defers the file that is playing and deletes the rest', () => {
    const deleted: string[] = [];
    const queue = createCleanupQueue({ deleteFile: (u) => deleted.push(u), onFailure: jest.fn() });
    queue.schedule('playing');
    queue.schedule('idle');
    expect(queue.flush('playing')).toEqual({ deleted: 1, failed: 0, deferred: 1, pending: 1 });
    expect(deleted).toEqual(['idle']);
    expect(queue.flush(null).deleted).toBe(1);
  });

  it('retries failures and reports a permanent failure after the maximum attempts', () => {
    const onFailure = jest.fn();
    const queue = createCleanupQueue({
      deleteFile: () => {
        throw new Error('secret path /data/user/0/x');
      },
      onFailure,
    });
    queue.schedule('a');
    for (let i = 0; i < MAX_DELETE_ATTEMPTS; i += 1) queue.flush(null);
    expect(onFailure).toHaveBeenCalledTimes(MAX_DELETE_ATTEMPTS);
    expect(onFailure).toHaveBeenLastCalledWith({ code: 'gave_up', permanent: true });
    expect(queue.pendingCount()).toBe(0);
    for (const [failure] of onFailure.mock.calls) {
      expect(JSON.stringify(failure)).not.toContain('secret');
    }
  });
});

describe('orphan sweep', () => {
  it('deletes every orphan and counts failures without throwing', () => {
    const deleted: string[] = [];
    const result = sweepOrphanedRecordings({
      listOrphanUris: () => ['a', 'bad', 'c'],
      deleteFile: (u) => {
        if (u === 'bad') throw new Error('nope');
        deleted.push(u);
      },
    });
    expect(result).toEqual({ deleted: 2, failed: 1 });
    expect(deleted).toEqual(['a', 'c']);
  });

  it('survives a listing failure', () => {
    const result = sweepOrphanedRecordings({
      listOrphanUris: () => {
        throw new Error('no directory');
      },
      deleteFile: jest.fn(),
    });
    expect(result).toEqual({ deleted: 0, failed: 1 });
  });
});

describe('logging', () => {
  it('writes only the fixed code', () => {
    const warn = jest.spyOn(console, 'warn').mockImplementation(() => undefined);
    logCleanupCode('delete_failed');
    expect(warn).toHaveBeenCalledWith('[NameSinger] recording cleanup: delete_failed');
    warn.mockRestore();
  });
});
