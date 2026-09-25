import { expect, it, vi } from 'vitest';
import type { MarkFixApi } from '@markfix/api-client';
import type { DraftStore } from '../src/main/draft-store.js';
import { ReportOutbox } from '../src/main/report-outbox.js';
vi.mock('electron', () => ({ ipcMain: { handle: vi.fn() }, nativeImage: {} }));

it('does not notify or claim more work after the account changes during upload', async () => {
  let owner = { id: 'a' };
  let release!: (value: unknown) => void;
  const api = {
    submitReport: vi.fn(
      () =>
        new Promise((resolve) => {
          release = resolve;
        }),
    ),
  };
  const candidate = {
    projectId: '90e2a0c5-0755-49b9-9d5d-41534ed41b41',
    title: 'Pending note',
    description: 'A content',
    priority: 'MEDIUM',
    captureBundle: {
      schemaVersion: 2,
      annotationKind: 'ELEMENT',
      page: {
        url: 'https://example.test',
        title: 'Page',
        viewportWidthCssPx: 100,
        viewportHeightCssPx: 100,
        deviceScaleFactor: 1,
        capturedAt: '2026-09-05T00:00:00.000Z',
      },
      reproduction: [],
    },
  };
  const entry = { id: 'entry-a', idempotencyKey: 'key-a', payload: candidate, attempts: 0 };
  const store = {
    claimDue: vi.fn().mockReturnValueOnce([entry]).mockReturnValue([]),
    markCompleted: vi.fn(),
    markFailed: vi.fn(),
  };
  const send = vi.fn();
  const after = vi.fn();
  const outbox = new ReportOutbox(
    api as unknown as MarkFixApi,
    () => store as unknown as DraftStore,
    () => owner,
    () => true,
    async () => {},
    after,
    send,
  );
  const pending = outbox.flush();
  expect(store.claimDue).toHaveBeenCalledWith('a', 1);
  owner = { id: 'b' };
  release({ id: 'report-a' });
  await pending;
  expect(store.claimDue).toHaveBeenCalledTimes(1);
  expect(store.markCompleted).not.toHaveBeenCalled();
  expect(store.markFailed).toHaveBeenCalledWith('entry-a', 1, expect.any(String));
  expect(send).not.toHaveBeenCalled();
  expect(after).not.toHaveBeenCalled();
});
