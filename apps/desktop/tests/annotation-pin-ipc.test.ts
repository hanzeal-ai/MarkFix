import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { WebContentsView } from 'electron';
import { ipcChannels } from '@markfix/contracts';
import type { CapturePin, ElementCommentPin } from '../src/capture-pin';
const handlers = vi.hoisted(() => new Map<string, (...args: unknown[]) => void>());
vi.mock('electron', () => ({
  ipcMain: {
    handle: vi.fn(),
    on: (name: string, handler: (...args: unknown[]) => void) => handlers.set(name, handler),
  },
}));
import { registerAnnotationStoreIpc } from '../src/main/ipc/register-annotation-store-ipc';

describe('annotation pin selection', () => {
  const frame = {};
  const sendShell = vi.fn();
  const pageUrl = 'https://example.com/page';
  const record = { id: 'known', projectId: 'project', pageUrl };
  const event = { sender: { id: 5 }, senderFrame: frame };
  beforeEach(() => {
    sendShell.mockClear();
    registerAnnotationStoreIpc({
      assertSender: vi.fn(),
      dataRouter: vi.fn(),
      projects: () => [],
      activeProjectId: () => 'project',
      websiteView: () =>
        ({ webContents: { id: 5, mainFrame: frame, getURL: () => pageUrl } }) as WebContentsView,
      elementComments: () => [record as ElementCommentPin],
      capturePins: () => [record as CapturePin],
      setElementComments: vi.fn(),
      setCapturePins: vi.fn(),
      sendShell,
    });
  });
  it.each(['element', 'capture'])('opens a known %s record', (type) => {
    handlers.get('markfix:select-annotation-pin')?.(event, {
      id: record.id,
      type,
      documentUrl: pageUrl,
    });
    expect(sendShell).toHaveBeenCalledWith(ipcChannels.annotationHistorySelected, {
      type,
      id: record.id,
      projectId: record.projectId,
    });
  });
  it('rejects other senders, frames, pages, unknown records and types', () => {
    const select = handlers.get('markfix:select-annotation-pin');
    const payload = { id: record.id, type: 'element', documentUrl: pageUrl };
    select?.({ ...event, sender: { id: 99 } }, payload);
    select?.({ ...event, senderFrame: {} }, payload);
    select?.(event, { ...payload, documentUrl: 'https://example.com/other' });
    select?.(event, { ...payload, id: 'missing' });
    select?.(event, { ...payload, type: 'diagnostic' });
    select?.(event, null);
    expect(sendShell).not.toHaveBeenCalled();
  });
});
