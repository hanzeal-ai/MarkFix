import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { BrowserWindow, WebContentsView } from 'electron';
const handlers = vi.hoisted(() => new Map<string, (...args: unknown[]) => void>());
vi.mock('electron', () => ({
  ipcMain: {
    handle: (name: string, handler: (...args: unknown[]) => void) => handlers.set(name, handler),
    on: (name: string, handler: (...args: unknown[]) => void) => handlers.set(name, handler),
  },
  clipboard: {},
  ClipboardItem: vi.fn(),
  app: { getPath: () => '/tmp/markfix-test-logs' },
  dialog: { showMessageBox: vi.fn().mockResolvedValue({ response: 0 }) },
}));
vi.mock('../src/main/annotation-save-log', () => ({ logAnnotationSave: vi.fn() }));
import { dialog } from 'electron';
import { annotationSaveFeedbackChannel } from '../src/annotation-save-feedback';
import { logAnnotationSave } from '../src/main/annotation-save-log';
import { registerAnnotationEditorIpc } from '../src/main/ipc/register-annotation-editor-ipc';

describe('inline note action boundary', () => {
  const frame = {};
  const sendShell = vi.fn();
  const reselectElement = vi.fn();
  beforeEach(() => {
    vi.mocked(dialog.showMessageBox).mockClear();
    sendShell.mockClear();
    reselectElement.mockClear();
    registerAnnotationEditorIpc({
      reselectElement,
      assertSender: vi.fn(),
      mainWindow: () => ({ isDestroyed: () => false }) as BrowserWindow,
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
  it('accepts direct reselection only from the current page main frame', () => {
    const handler = handlers.get('markfix:reselect-element');
    const point = { documentUrl: payload.documentUrl, x: 20, y: 40 };
    handler?.({ sender: { id: 5 }, senderFrame: frame }, point);
    expect(reselectElement).toHaveBeenCalledWith(20, 40);
    reselectElement.mockClear();
    handler?.({ sender: { id: 8 }, senderFrame: frame }, point);
    handler?.({ sender: { id: 5 }, senderFrame: {} }, point);
    handler?.({ sender: { id: 5 }, senderFrame: frame }, { ...point, x: -1 });
    handler?.(
      { sender: { id: 5 }, senderFrame: frame },
      { ...point, documentUrl: 'https://example.com/old' },
    );
    expect(reselectElement).not.toHaveBeenCalled();
  });
  it('shows a visible failure for a stale submit without forwarding it', async () => {
    handlers.get('markfix:inline-note-action')?.(
      { sender: { id: 5 }, senderFrame: frame },
      { ...payload, documentUrl: 'https://example.com/old' },
    );
    expect(sendShell).not.toHaveBeenCalled();
    expect(dialog.showMessageBox).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        message: expect.stringContaining('页面或标注模式已变化'),
      }),
    );
  });
  it('validates feedback codes and keeps successful tracing quiet', async () => {
    const handler = handlers.get(annotationSaveFeedbackChannel);
    if (!handler) throw new Error('Feedback handler was not registered');
    await handler({}, 'preview-opened');
    expect(logAnnotationSave).toHaveBeenCalledWith('preview-opened');
    expect(dialog.showMessageBox).not.toHaveBeenCalled();
    await expect(handler({}, 'untrusted free text')).rejects.toThrow();
    await handler({}, 'missing-context');
    expect(dialog.showMessageBox).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        message: expect.stringContaining('项目或页面尚未准备好'),
      }),
    );
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
