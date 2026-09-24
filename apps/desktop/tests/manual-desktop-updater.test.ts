import { describe, expect, it, vi } from 'vitest';
import type { ClientPolicy } from '@markfix/contracts';
import { ManualDesktopUpdater } from '../src/main/manual-desktop-updater.js';

const policy: ClientPolicy = {
  status: 'upgrade-recommended',
  currentVersion: '0.1.0',
  recommendedVersion: '0.2.0',
  minimumVersion: '0.1.0',
  features: {},
  downloadUrl: 'https://example.test/setup.exe',
};

describe('Windows manual update', () => {
  it('opens the download page once and reports manual installation without restarting', async () => {
    const open = vi.fn(async () => {});
    const updater = new ManualDesktopUpdater(async () => policy, open, vi.fn());
    const result = updater.start();
    expect(updater.getStatus().phase).toBe('checking');
    await updater.start();
    expect((await result).phase).toBe('manual');
    expect(open).toHaveBeenCalledTimes(1);
  });
  it('does not open the browser when current, unpublished, or offline', async () => {
    const open = vi.fn(async () => {});
    const load = vi.fn(async () => ({ ...policy, status: 'supported' as const }));
    expect((await new ManualDesktopUpdater(load, open, vi.fn()).start()).phase).toBe('current');
    const missing = new ManualDesktopUpdater(
      async () => ({ ...policy, downloadUrl: undefined }),
      open,
      vi.fn(),
    );
    expect((await missing.start()).phase).toBe('error');
    const offline = new ManualDesktopUpdater(
      async () => {
        throw new Error('offline');
      },
      open,
      vi.fn(),
    );
    expect((await offline.start()).message).toBe('offline');
    expect(open).not.toHaveBeenCalled();
  });
  it('allows retry after a browser launch failure and supports required upgrades', async () => {
    const open = vi
      .fn()
      .mockRejectedValueOnce(new Error('browser unavailable'))
      .mockResolvedValue(undefined);
    const updater = new ManualDesktopUpdater(
      async () => ({ ...policy, status: 'upgrade-required' }),
      open,
      vi.fn(),
    );
    expect((await updater.start()).phase).toBe('error');
    expect((await updater.start()).phase).toBe('manual');
  });
});
