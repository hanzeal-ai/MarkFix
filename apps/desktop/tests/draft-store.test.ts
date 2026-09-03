import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { DraftStore } from '../src/main/draft-store.js';

const temporaryDirectories: string[] = [];

const createStore = (): DraftStore => {
  const directory = mkdtempSync(join(tmpdir(), 'markfix-outbox-'));
  temporaryDirectories.push(directory);
  return new DraftStore(join(directory, 'drafts.sqlite'));
};

afterEach(() => {
  vi.restoreAllMocks();
  for (const directory of temporaryDirectories.splice(0)) {
    rmSync(directory, { recursive: true, force: true });
  }
});

describe('DraftStore outbox', () => {
  it('deduplicates outstanding work and completes a claimed entry', () => {
    const store = createStore();
    const first = store.enqueue({ title: 'Broken menu' }, 'same-request');
    const duplicate = store.enqueue({ title: 'Broken menu' }, 'same-request');

    expect(duplicate.id).toBe(first.id);
    expect(store.claimDue()).toEqual([first]);
    expect(store.claimDue()).toEqual([]);

    store.markCompleted(first.id, 'report-1');
    expect(store.outboxStatus(first.id)).toEqual({ status: 'COMPLETED', reportId: 'report-1' });
    store.close();
  });

  it('applies retry backoff and recovers interrupted claims', () => {
    const now = 1_800_000_000_000;
    vi.spyOn(Date, 'now').mockReturnValue(now);
    const store = createStore();
    const entry = store.enqueue({ title: 'Offline report' }, 'offline-request');

    expect(store.claimDue()).toHaveLength(1);
    store.markFailed(entry.id, 1, 'network unavailable');
    expect(store.claimDue()).toEqual([]);

    vi.mocked(Date.now).mockReturnValue(now + 2_001);
    expect(store.claimDue()).toEqual([{ ...entry, attempts: 1 }]);
    store.recoverInterrupted();
    expect(store.claimDue()).toEqual([{ ...entry, attempts: 1 }]);
    store.close();
  });
});
