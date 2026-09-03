import { describe, expect, it } from 'vitest';
import { normalizeWebsiteUrl } from '../src/main/url.js';

describe('normalizeWebsiteUrl', () => {
  it('adds HTTPS for a bare hostname', () => {
    expect(normalizeWebsiteUrl('example.com')).toBe('https://example.com/');
  });

  it('rejects unsafe protocols', () => {
    expect(() => normalizeWebsiteUrl('javascript:alert(1)')).toThrow();
  });
});
