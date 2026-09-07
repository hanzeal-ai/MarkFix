import { describe, expect, it } from 'vitest';
import { isWebsiteUrlAllowed, normalizeWebsiteUrl } from '../src/main/url.js';
import { retryDelayMs } from '../src/main/sync-policy.js';

describe('normalizeWebsiteUrl', () => {
  it('adds HTTPS for a bare hostname', () => {
    expect(normalizeWebsiteUrl('example.com')).toBe('https://example.com/');
  });

  it('rejects unsafe protocols', () => {
    expect(() => normalizeWebsiteUrl('javascript:alert(1)')).toThrow();
  });

  it('applies the HTTPS policy to page-initiated navigation', () => {
    expect(isWebsiteUrlAllowed('https://example.com/path')).toBe(true);
    expect(isWebsiteUrlAllowed('http://example.com/path')).toBe(false);
    expect(isWebsiteUrlAllowed('http://localhost:4312/path', true)).toBe(true);
    expect(isWebsiteUrlAllowed('file:///tmp/example.html')).toBe(false);
  });
});

describe('retryDelayMs', () => {
  it('backs off and caps retries', () => {
    expect(retryDelayMs(1)).toBe(2000);
    expect(retryDelayMs(20)).toBe(300_000);
  });
});
