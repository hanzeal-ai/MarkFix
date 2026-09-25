import { EventEmitter } from 'node:events';
import { describe, expect, it, vi } from 'vitest';
import { WindowsDesktopUpdater } from '../src/main/windows-desktop-updater';
import { windowsDesktopUpdateFeedUrl } from '../src/desktop-update';

function setup() {
  const native = Object.assign(new EventEmitter(), {
    autoDownload: false,
    autoInstallOnAppQuit: true,
    autoRunAppAfterInstall: false,
    allowDowngrade: true,
    disableDifferentialDownload: false,
    checkForUpdates: vi.fn().mockResolvedValue(null),
    quitAndInstall: vi.fn(),
  });
  const updater = new WindowsDesktopUpdater(() => native, vi.fn());
  return { native, updater };
}
describe('Windows NSIS updates', () => {
  it('downloads once and explicitly installs silently and restarts', () => {
    const { native, updater } = setup();
    updater.start();
    updater.start();
    expect(native.checkForUpdates).toHaveBeenCalledTimes(1);
    expect(native.autoInstallOnAppQuit).toBe(false);
    expect(native.allowDowngrade).toBe(false);
    expect(native.disableDifferentialDownload).toBe(true);
    native.emit('update-available');
    native.emit('download-progress', { percent: 45.9 });
    expect(updater.getStatus()).toMatchObject({
      phase: 'downloading',
      message: '正在下载更新 45%…',
    });
    native.emit('update-downloaded');
    native.emit('update-downloaded');
    expect(native.quitAndInstall).toHaveBeenCalledExactlyOnceWith(true, true);
  });
  it('does not install a late download after checksum or network failure, and permits retry', () => {
    const { native, updater } = setup();
    updater.start();
    native.emit('update-available');
    native.emit('error', new Error('checksum mismatch'));
    native.emit('update-downloaded');
    expect(native.quitAndInstall).not.toHaveBeenCalled();
    expect(updater.getStatus().phase).toBe('error');
    updater.start();
    expect(native.checkForUpdates).toHaveBeenCalledTimes(2);
    native.emit('update-not-available');
    expect(updater.getStatus().phase).toBe('current');
  });
  it('handles rejected checks and unavailable packaged environments', async () => {
    const { native, updater } = setup();
    native.checkForUpdates.mockRejectedValueOnce(new Error('offline'));
    updater.start();
    await vi.waitFor(() => expect(updater.getStatus().phase).toBe('error'));
    const unsupported = new WindowsDesktopUpdater(() => {
      throw new Error('not installed');
    }, vi.fn());
    expect(unsupported.start().phase).toBe('error');
  });
  it('ignores an old attempt rejection after a retry starts', async () => {
    const first = setup().native;
    const second = setup().native;
    let rejectOld: (error: Error) => void = () => undefined;
    first.checkForUpdates.mockReturnValueOnce(
      new Promise((_resolve, reject) => {
        rejectOld = reject;
      }),
    );
    const factory = vi.fn().mockReturnValueOnce(first).mockReturnValueOnce(second);
    const updater = new WindowsDesktopUpdater(factory, vi.fn());
    updater.start();
    first.emit('error', new Error('offline'));
    updater.start();
    second.emit('update-available');
    rejectOld(new Error('late rejection'));
    first.emit('update-downloaded');
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(updater.getStatus().phase).toBe('downloading');
    expect(first.quitAndInstall).not.toHaveBeenCalled();
    second.emit('update-downloaded');
    expect(second.quitAndInstall).toHaveBeenCalledExactlyOnceWith(true, true);
  });
  it('handles the download promise rejection as well as native error events', async () => {
    const { native, updater } = setup();
    native.checkForUpdates.mockResolvedValueOnce({
      downloadPromise: Promise.reject(new Error('checksum')),
    });
    updater.start();
    await vi.waitFor(() => expect(updater.getStatus().phase).toBe('error'));
    expect(native.quitAndInstall).not.toHaveBeenCalled();
  });
  it('does not accept unsafe feed URLs', () => {
    expect(windowsDesktopUpdateFeedUrl('https://markfix.example')).toBe(
      'https://markfix.example/v1/desktop-updates/windows/x64/',
    );
    for (const url of [
      'http://example.com',
      'file:///app',
      'https://u:p@example.com',
      'https://example.com?x=1',
    ])
      expect(() => windowsDesktopUpdateFeedUrl(url)).toThrow();
  });
});
