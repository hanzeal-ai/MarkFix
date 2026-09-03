import { describe, expect, it } from 'vitest';
import { normalizeWebsiteUrl } from '../src/main/url.js';
import { retryDelayMs } from '../src/main/sync-policy.js';

describe('normalizeWebsiteUrl', () => {
  it('adds HTTPS for a bare hostname', () => {
    expect(normalizeWebsiteUrl('example.com')).toBe('https://example.com/');
  });

  it('rejects unsafe protocols', () => {
    expect(() => normalizeWebsiteUrl('javascript:alert(1)')).toThrow();
  });
});

describe('retryDelayMs', () => {
  it('backs off and caps retries', () => {
    expect(retryDelayMs(1)).toBe(2000);
    expect(retryDelayMs(20)).toBe(300_000);
  });
});
