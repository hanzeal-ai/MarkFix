import { EventEmitter } from 'node:events';
import { describe, expect, it, vi } from 'vitest';
import { desktopUpdateFeedUrl, hasDesktopUpdateEdits } from '../src/desktop-update.js';
import { DesktopUpdater } from '../src/main/desktop-updater.js';

function setup(feed = () => desktopUpdateFeedUrl('https://markfix.example', '0.1.0', 'arm64')) {
  const native = Object.assign(new EventEmitter(), {
    setFeedURL: vi.fn(),
    getFeedURL: vi.fn(() => ''),
    checkForUpdates: vi.fn(),
    quitAndInstall: vi.fn(),
  });
  const notify = vi.fn();
  const updater = new DesktopUpdater(native, feed, notify);
  return { native, notify, updater };
}

describe('one-click desktop update', () => {
  it('checks once, downloads, and installs automatically without a second click', () => {
    const { native, updater } = setup();
    expect(updater.start().phase).toBe('checking');
    updater.start();
    expect(native.checkForUpdates).toHaveBeenCalledTimes(1);
    expect(native.setFeedURL).toHaveBeenCalledWith({
      url: 'https://markfix.example/v1/desktop-updates?version=0.1.0&platform=darwin&arch=arm64',
      serverType: 'default',
    });
    native.emit('update-available');
    expect(updater.getStatus().phase).toBe('downloading');
    expect(native.quitAndInstall).not.toHaveBeenCalled();
    native.emit('update-downloaded');
    native.emit('update-downloaded');
    expect(updater.getStatus().phase).toBe('installing');
    expect(native.quitAndInstall).toHaveBeenCalledTimes(1);
  });
  it('keeps the current app on no update or download failure, and allows retry', () => {
    const { native, updater } = setup();
    updater.start();
    native.emit('update-not-available');
    expect(updater.getStatus().phase).toBe('current');
    updater.start();
    native.emit('error', new Error('invalid signature'));
    expect(updater.getStatus().phase).toBe('error');
    native.emit('update-downloaded');
    expect(native.quitAndInstall).not.toHaveBeenCalled();
    updater.start();
    expect(native.checkForUpdates).toHaveBeenCalledTimes(3);
  });
  it('handles synchronous setup and installation failures', () => {
    const unavailable = setup(() => {
      throw new Error('not packaged');
    });
    expect(unavailable.updater.start().phase).toBe('error');
    expect(unavailable.native.checkForUpdates).not.toHaveBeenCalled();
    const { native, updater } = setup();
    native.quitAndInstall.mockImplementation(() => {
      throw new Error('read only');
    });
    updater.start();
    native.emit('update-available');
    native.emit('update-downloaded');
    expect(updater.getStatus().phase).toBe('error');
  });
  it.each([
    'http://example.com',
    'file:///tmp',
    'https://user:secret@example.com',
    'https://example.com?x=1',
    'invalid',
  ])('rejects unsafe feed origin %s', (url) => {
    expect(() => desktopUpdateFeedUrl(url, '0.1.0', 'arm64')).toThrow();
  });
});

it('saves only changed editor content, preserving unchanged submitted records', () => {
  expect(
    hasDesktopUpdateEdits({ note: 'existing', evidence: [], marks: [] }, { note: 'existing' }),
  ).toBe(false);
  expect(hasDesktopUpdateEdits({ note: '' })).toBe(false);
  expect(hasDesktopUpdateEdits({ note: 'new' })).toBe(true);
  expect(hasDesktopUpdateEdits({ note: '' }, { note: 'existing' })).toBe(true);
  expect(hasDesktopUpdateEdits({ note: 'edited' }, { note: 'existing' })).toBe(true);
});
