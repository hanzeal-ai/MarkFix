import { describe, expect, it } from 'vitest';
import { isWebsiteUrlAllowed, normalizeWebsiteUrl } from '../src/main/url.js';
import { retryDelayMs } from '../src/main/sync-policy.js';

describe('normalizeWebsiteUrl', () => {
  it('adds HTTPS for a bare hostname', () => {
    expect(normalizeWebsiteUrl('example.com')).toBe('https://example.com/');
  });

  it.each([
    'javascript:alert(1)',
    'file:///tmp/example.html',
    'data:text/html,test',
    'ftp://example.com',
    'about:blank',
    '',
  ])('rejects non-website input %s', (input) => {
    expect(() => normalizeWebsiteUrl(input)).toThrow();
    expect(isWebsiteUrlAllowed(input)).toBe(false);
  });

  it.each([
    'http://example.com/path?q=1#section',
    'http://192.168.1.2:8080/',
    'http://localhost:4312/path',
  ])('preserves an explicit HTTP address %s', (input) => {
    expect(normalizeWebsiteUrl(input)).toBe(input);
  });

  it('applies the HTTP/HTTPS policy to page-initiated navigation', () => {
    expect(isWebsiteUrlAllowed('https://example.com/path')).toBe(true);
    expect(isWebsiteUrlAllowed('http://example.com/path')).toBe(true);
    expect(isWebsiteUrlAllowed('http://localhost:4312/path')).toBe(true);
    expect(isWebsiteUrlAllowed('file:///tmp/example.html')).toBe(false);
  });
});

describe('retryDelayMs', () => {
  it('backs off and caps retries', () => {
    expect(retryDelayMs(1)).toBe(2000);
    expect(retryDelayMs(20)).toBe(300_000);
  });
});
