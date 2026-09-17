import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { BrowserWindow, WebContentsView } from 'electron';
const handlers = vi.hoisted(() => new Map<string, (...args: unknown[]) => void>());
vi.mock('electron', () => ({
  ipcMain: {
    handle: vi.fn(),
    on: (name: string, handler: (...args: unknown[]) => void) => handlers.set(name, handler),
  },
  clipboard: {},
  ClipboardItem: vi.fn(),
  dialog: {},
}));
import { registerCaptureIpc } from '../src/main/ipc/register-capture-ipc';

describe('inline note action boundary', () => {
  const frame = {};
  const sendShell = vi.fn();
  beforeEach(() => {
    sendShell.mockClear();
    registerCaptureIpc({
      assertSender: vi.fn(),
      captureService: () => undefined,
      mainWindow: () => undefined as BrowserWindow | undefined,
      websiteView: () =>
        ({
          webContents: { id: 5, mainFrame: frame, getURL: () => 'https://example.com/page' },
        }) as WebContentsView,
      sendShell,
    });
  });
  const payload = {
    action: 'submit',
    mode: 'comment',
    note: '修改标题',
    documentUrl: 'https://example.com/page',
  };
  it('forwards valid actions only from the current target main frame', () => {
    handlers.get('markfix:inline-note-action')?.(
      { sender: { id: 5 }, senderFrame: frame },
      payload,
    );
    expect(sendShell).toHaveBeenCalledWith('annotation:inline-note-action', payload);
  });
  it('rejects other senders, subframes, stale pages and invalid notes', () => {
    const handler = handlers.get('markfix:inline-note-action');
    handler?.({ sender: { id: 8 }, senderFrame: frame }, payload);
    handler?.({ sender: { id: 5 }, senderFrame: {} }, payload);
    for (const invalid of [
      { ...payload, documentUrl: 'https://example.com/old' },
      { ...payload, note: 'x'.repeat(2001) },
      { ...payload, action: 'execute' },
    ]) {
      handler?.({ sender: { id: 5 }, senderFrame: frame }, invalid);
    }
    expect(sendShell).not.toHaveBeenCalled();
  });
});
