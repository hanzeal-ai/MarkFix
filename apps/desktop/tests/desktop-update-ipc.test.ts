import { beforeEach, expect, it, vi } from 'vitest';
import type { IpcMainInvokeEvent } from 'electron';
import { desktopUpdateChannels } from '../src/desktop-update';
const handlers = vi.hoisted(() => new Map<string, (event: unknown, input?: unknown) => unknown>());
vi.mock('electron', () => ({
  ipcMain: {
    handle: (channel: string, fn: (event: unknown, input?: unknown) => unknown) =>
      handlers.set(channel, fn),
  },
}));
import { registerDesktopUpdateIpc } from '../src/main/ipc/register-desktop-update-ipc';
const changed = vi.fn();
const start = vi.fn(() => ({ phase: 'checking' as const, message: '' }));
const canPrepare = vi.fn();
const call = (channel: string, input?: unknown, id = 1) =>
  handlers.get(channel)?.({ sender: { id } }, input);
beforeEach(() => {
  vi.clearAllMocks();
  registerDesktopUpdateIpc({
    assertSender: (event: IpcMainInvokeEvent) => {
      if (event.sender.id !== 1) throw new Error('Untrusted update sender');
    },
    assertCanPrepare: canPrepare,
    preparationChanged: changed,
    updater: { start, getStatus: () => ({ phase: 'idle', message: '' }) },
  });
});
it('locks the website before preparation and releases it if saving fails', async () => {
  await expect(call(desktopUpdateChannels.start)).rejects.toThrow('保存');
  call(desktopUpdateChannels.prepare, true);
  expect(changed).toHaveBeenLastCalledWith(true);
  expect(call(desktopUpdateChannels.status)).toMatchObject({ phase: 'preparing' });
  call(desktopUpdateChannels.prepare, false);
  expect(changed).toHaveBeenLastCalledWith(false);
  expect(start).not.toHaveBeenCalled();
  call(desktopUpdateChannels.prepare, true);
  await call(desktopUpdateChannels.start);
  expect(start).toHaveBeenCalledOnce();
});
it('rejects target-page senders, invalid inputs and open child windows', async () => {
  expect(() => call(desktopUpdateChannels.prepare, true, 2)).toThrow('Untrusted');
  expect(() => call(desktopUpdateChannels.status, undefined, 2)).toThrow('Untrusted');
  await expect(call(desktopUpdateChannels.start, undefined, 2)).rejects.toThrow('Untrusted');
  expect(() => call(desktopUpdateChannels.prepare, 'true')).toThrow('Invalid');
  canPrepare.mockImplementationOnce(() => {
    throw new Error('Close child windows');
  });
  expect(() => call(desktopUpdateChannels.prepare, true)).toThrow('Close child');
  expect(changed).not.toHaveBeenCalled();
  expect(start).not.toHaveBeenCalled();
});
