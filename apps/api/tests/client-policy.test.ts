import { describe, expect, it } from 'vitest';
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
