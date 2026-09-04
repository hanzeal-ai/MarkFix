import { describe, expect, it } from 'vitest';
import { captureRequestSchema } from '@markfix/contracts';

describe('screenshot capture contract', () => {
  it('accepts a selected page region', () => {
    const request = captureRequestSchema.parse({
      mode: 'region',
      anchor: {
        kind: 'region',
        xCssPx: 24,
        yCssPx: 32,
        widthCssPx: 320,
        heightCssPx: 180,
        documentUrl: 'https://example.com/page',
      },
    });

    expect(request.mode).toBe('region');
    expect(request.anchor?.kind).toBe('region');
  });
});
