import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { SavedCapture, SavedElementComment } from '@markfix/contracts';
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

describe('DraftStore screenshot annotations', () => {
  it('persists, updates, lists, and deletes captures independently', () => {
    const store = createStore();
    const capture: SavedCapture = {
      id: '1d04602d-c0cb-4aac-bf5b-066b33273a03',
      pageUrl: 'https://example.com/page',
      note: '按钮遮挡正文',
      dataUrl: 'data:image/png;base64,AA==',
      widthCssPx: 320,
      heightCssPx: 180,
      marks: [],
      createdAt: '2026-09-04T08:00:00.000Z',
    };

    store.saveCapture(capture);
    expect(store.listCaptures()).toEqual([capture]);

    store.saveCapture({ ...capture, note: '按钮遮挡正文与链接' });
    expect(store.listCaptures()).toEqual([{ ...capture, note: '按钮遮挡正文与链接' }]);

    store.deleteCapture(capture.id);
    expect(store.listCaptures()).toEqual([]);
    store.close();
  });
});

describe('DraftStore element comments', () => {
  it('persists, updates, lists, and deletes comments independently', () => {
    const store = createStore();
    const comment: SavedElementComment = {
      id: '86c28bc3-a8a0-40df-a4b6-c7f71823d41a',
      pageUrl: 'https://example.com/page',
      anchor: {
        kind: 'element',
        cssSelector: '[id="headline"]',
        textQuote: 'A headline',
        tagName: 'h1',
        attributes: { id: 'headline' },
        documentUrl: 'https://example.com/page',
        framePath: [],
        quadsCssPx: [[10, 20, 210, 20, 210, 80, 10, 80]],
      },
      note: '标题需要修改',
      createdAt: '2026-09-04T08:00:00.000Z',
      updatedAt: '2026-09-04T08:00:00.000Z',
    };

    store.saveElementComment(comment);
    expect(store.listElementComments()).toEqual([comment]);

    const updated = {
      ...comment,
      note: '标题字号需要缩小',
      updatedAt: '2026-09-04T08:05:00.000Z',
    };
    store.saveElementComment(updated);
    expect(store.listElementComments()).toEqual([updated]);

    store.deleteElementComment(comment.id);
    expect(store.listElementComments()).toEqual([]);
    store.close();
  });
});
