import { describe, expect, it } from 'vitest';
import { regionAnchorSchema } from '../src/index.js';

describe('regionAnchorSchema', () => {
  it('rejects an empty capture region', () => {
    expect(() =>
      regionAnchorSchema.parse({
        kind: 'region',
        xCssPx: 1,
        yCssPx: 1,
        widthCssPx: 0,
        heightCssPx: 20,
        documentUrl: 'https://example.com',
      }),
    ).toThrow();
  });
});
