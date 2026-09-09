import { describe, expect, it } from 'vitest';
import { normalizeWebsiteShortcuts } from '../src/renderer/src/project-navigation/website-shortcuts';

describe('website shortcut restoration', () => {
  it('discards malformed addresses before favicon rendering and preserves valid entries', () => {
    const item = (url: string) => ({ id: url, name: 'Example', url, storageMode: 'LOCAL' });
    expect(
      normalizeWebsiteShortcuts([
        item('http://['),
        item('javascript:alert(1)'),
        item(''),
        item('example.com'),
      ]),
    ).toEqual([{ ...item('example.com'), url: 'https://example.com/' }]);
  });
  it('limits valid shortcuts after excluding invalid records', () => {
    expect(
      normalizeWebsiteShortcuts([
        null,
        {},
        ...Array.from({ length: 14 }, (_, i) => ({
          id: String(i),
          name: 'Example',
          url: `https://example.com/${i}`,
        })),
      ]),
    ).toHaveLength(12);
  });
});
