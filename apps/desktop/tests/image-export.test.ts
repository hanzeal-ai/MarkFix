import { describe, expect, it } from 'vitest';
import { decodeScreenshotDataUrl, safeScreenshotFilename } from '../src/main/image-export.js';

const onePixelPng =
  'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=';

describe('screenshot image export', () => {
  it('decodes validated PNG data', () => {
    expect(decodeScreenshotDataUrl(onePixelPng).subarray(1, 4).toString('ascii')).toBe('PNG');
  });

  it('rejects invalid image data and oversized payloads', () => {
    expect(() => decodeScreenshotDataUrl('data:text/plain;base64,aGVsbG8=')).toThrow(
      'Only PNG screenshots',
    );
    expect(() => decodeScreenshotDataUrl(onePixelPng, 4)).toThrow('export size limit');
  });

  it('normalizes download names', () => {
    expect(safeScreenshotFilename('Login modal / spacing')).toBe('Login-modal-spacing.png');
    expect(safeScreenshotFilename('capture.PNG')).toBe('capture.PNG');
  });
});
