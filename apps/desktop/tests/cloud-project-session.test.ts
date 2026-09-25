import { describe, expect, it, vi } from 'vitest';
import type { CloudProjectState } from '@markfix/contracts';
import { MarkFixApiError } from '@markfix/api-client';
import { CloudProjectSession } from '../src/main/cloud-project-session.js';

const state = (): CloudProjectState => ({
  project: {
    id: crypto.randomUUID(),
    storageMode: 'CLOUD',
    title: 'Project',
    origin: 'https://example.test',
    entryUrl: 'https://example.test/',
    currentUrl: 'https://example.test/',
    currentPageSessionId: crypto.randomUUID(),
    faviconUrl: null,
    faviconSource: 'markfix',
    createdAt: '2026-09-25T00:00:00Z',
    updatedAt: '2026-09-25T00:00:00Z',
  },
  navigation: { entries: [], currentIndex: 0 },
  revision: 1,
});
const deferred = <T>() => {
  let resolve!: (value: T) => void;
  let reject!: (reason: unknown) => void;
  const promise = new Promise<T>((yes, no) => {
    resolve = yes;
    reject = no;
  });
  return { promise, resolve, reject };
};

describe('CloudProjectSession', () => {
  it.each(['delete', 'clear'] as const)('ignores late save success after %s', async (action) => {
    const pending = deferred<CloudProjectState>();
    const api = {
      saveCloudProjectState: vi.fn(() => pending.promise),
      getCloudProjectState: vi.fn(),
    };
    const updated = vi.fn(),
      failed = vi.fn();
    const session = new CloudProjectSession(api, updated, failed),
      initial = state();
    session.set(initial.project.id, initial);
    const saving = session.save(initial.project.id);
    await vi.waitFor(() => expect(api.saveCloudProjectState).toHaveBeenCalledOnce());
    if (action === 'delete') session.delete(initial.project.id);
    else session.clear();
    pending.resolve({ ...initial, revision: 2 });
    await saving;
    expect(session.get(initial.project.id)).toBeUndefined();
    expect(updated).not.toHaveBeenCalled();
    expect(failed).not.toHaveBeenCalled();
  });
  it.each([new Error('offline'), new MarkFixApiError('conflict', 409)])(
    'ignores old session failure',
    async (error) => {
      const pending = deferred<CloudProjectState>();
      const api = {
        saveCloudProjectState: vi.fn(() => pending.promise),
        getCloudProjectState: vi.fn(),
      };
      const failed = vi.fn(),
        session = new CloudProjectSession(api, vi.fn(), failed),
        initial = state();
      session.set(initial.project.id, initial);
      const saving = session.save(initial.project.id);
      await vi.waitFor(() => expect(api.saveCloudProjectState).toHaveBeenCalledOnce());
      session.clear();
      pending.reject(error);
      await saving;
      expect(failed).not.toHaveBeenCalled();
      expect(api.getCloudProjectState).not.toHaveBeenCalled();
    },
  );
  it('keeps the latest local edit while advancing the queued revision', async () => {
    const pending = deferred<CloudProjectState>(),
      initial = state();
    const api = {
      saveCloudProjectState: vi
        .fn()
        .mockImplementationOnce(() => pending.promise)
        .mockImplementation(async (value: CloudProjectState) => ({
          ...value,
          revision: value.revision + 1,
        })),
      getCloudProjectState: vi.fn(),
    };
    const session = new CloudProjectSession(api, vi.fn(), vi.fn());
    session.set(initial.project.id, initial);
    const first = session.save(initial.project.id);
    await vi.waitFor(() => expect(api.saveCloudProjectState).toHaveBeenCalledOnce());
    session.set(initial.project.id, {
      ...initial,
      project: { ...initial.project, title: 'Latest' },
    });
    const second = session.save(initial.project.id);
    pending.resolve({ ...initial, revision: 2 });
    await Promise.all([first, second]);
    expect(api.saveCloudProjectState.mock.calls[1]?.[0].revision).toBe(2);
    expect(session.get(initial.project.id)?.project.title).toBe('Latest');
    expect(session.get(initial.project.id)?.revision).toBe(3);
  });
});
