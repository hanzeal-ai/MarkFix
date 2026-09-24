import { afterEach, describe, expect, it, vi } from 'vitest';
import { ClientPolicyService, compareVersions } from '../src/client-policy.service.js';

describe('desktop client policy', () => {
  it('orders stable semantic versions and prereleases', () => {
    expect(compareVersions('1.2.0', '1.1.9')).toBe(1);
    expect(compareVersions('1.2.0-beta.1', '1.2.0')).toBe(-1);
    expect(compareVersions('1.2.0-beta.2', '1.2.0-beta.1')).toBe(1);
    expect(compareVersions('1.2.0', '1.2.0')).toBe(0);
  });

  it('requires an upgrade below the minimum version', () => {
    const previous = process.env.MARKFIX_MINIMUM_DESKTOP_VERSION;
    process.env.MARKFIX_MINIMUM_DESKTOP_VERSION = '2.0.0';
    try {
      expect(new ClientPolicyService().getPolicy('1.9.9')).toMatchObject({
        status: 'upgrade-required',
        minimumVersion: '2.0.0',
      });
    } finally {
      if (previous === undefined) delete process.env.MARKFIX_MINIMUM_DESKTOP_VERSION;
      else process.env.MARKFIX_MINIMUM_DESKTOP_VERSION = previous;
    }
  });

  it('rejects malformed client versions', () => {
    expect(() => new ClientPolicyService().getPolicy('latest')).toThrow();
  });
});

afterEach(() => vi.unstubAllEnvs());

describe('platform-specific Windows distribution', () => {
  it('labels trial installers without changing the other platform', () => {
    vi.stubEnv('MARKFIX_DESKTOP_WINDOWS_DISTRIBUTION', 'trial');
    vi.stubEnv('MARKFIX_DESKTOP_WINDOWS_X64_DOWNLOAD_URL', 'https://example.test/app.exe');
    vi.stubEnv('MARKFIX_DESKTOP_MAC_DISTRIBUTION', 'signed');
    vi.stubEnv('MARKFIX_DESKTOP_DOWNLOAD_URL', 'https://example.test/app.dmg');
    const service = new ClientPolicyService();
    expect(service.getPolicy('0.1.0', 'win32', 'x64').distribution).toBe('trial');
    expect(service.getPolicy('0.1.0', 'darwin', 'arm64').distribution).toBe('signed');
  });
  it('keeps Mac releases from forcing a Windows upgrade or offering a DMG', () => {
    vi.stubEnv('MARKFIX_RECOMMENDED_DESKTOP_VERSION', '9.0.0');
    vi.stubEnv('MARKFIX_DESKTOP_DOWNLOAD_URL', 'https://example.test/app.dmg');
    vi.stubEnv('MARKFIX_WINDOWS_MINIMUM_DESKTOP_VERSION', '0.1.0');
    vi.stubEnv('MARKFIX_WINDOWS_RECOMMENDED_DESKTOP_VERSION', '0.1.0');
    vi.stubEnv('MARKFIX_DESKTOP_WINDOWS_X64_DOWNLOAD_URL', '');
    const service = new ClientPolicyService();
    expect(service.getPolicy('0.1.0', 'win32', 'x64')).toMatchObject({
      status: 'supported',
      recommendedVersion: '0.1.0',
    });
    expect(service.getPolicy('0.1.0', 'win32', 'x64').downloadUrl).toBeUndefined();
    expect(service.getPolicy('0.1.0', 'darwin', 'arm64').downloadUrl).toBe(
      'https://example.test/app.dmg',
    );
    expect(service.getPolicy('0.1.0', 'darwin', 'x64').downloadUrl).toBeUndefined();
  });
  it('selects the x64 installer and Windows version policy without assigning it to ARM', () => {
    vi.stubEnv('MARKFIX_WINDOWS_MINIMUM_DESKTOP_VERSION', '0.2.0');
    vi.stubEnv('MARKFIX_WINDOWS_RECOMMENDED_DESKTOP_VERSION', '0.3.0');
    vi.stubEnv('MARKFIX_DESKTOP_WINDOWS_X64_DOWNLOAD_URL', 'https://example.test/app.exe');
    const service = new ClientPolicyService();
    expect(service.getPolicy('0.1.0', 'win32', 'x64')).toMatchObject({
      status: 'upgrade-required',
      recommendedVersion: '0.3.0',
      downloadUrl: 'https://example.test/app.exe',
    });
    expect(service.getPolicy('0.2.0', 'win32', 'x64').status).toBe('upgrade-recommended');
    expect(service.getPolicy('0.3.0', 'win32', 'x64').status).toBe('supported');
    expect(service.getPolicy('0.1.0', 'win32', 'arm64').downloadUrl).toBeUndefined();
    expect(service.getPolicy('0.1.0', 'linux', 'x64').downloadUrl).toBeUndefined();
  });
  it.each([
    'http://example.test/app.exe',
    'https://user:pass@example.test/app.exe',
    'file:///app.exe',
    'https://example.test/app.dmg',
    'invalid',
    'https://example.test/app.exe#fragment',
  ])('rejects unsafe or wrong-format Windows download %s', (url) => {
    vi.stubEnv('MARKFIX_DESKTOP_WINDOWS_X64_DOWNLOAD_URL', url);
    expect(() => new ClientPolicyService().getPolicy('0.1.0', 'win32', 'x64')).toThrow();
  });
});
