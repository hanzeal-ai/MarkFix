import { afterEach, describe, expect, it, vi } from 'vitest';
import { composeScreenshot } from '../src/renderer/src/screenshot-compositor.js';

describe('screenshot compositor', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('reuses the decoded source and encodes PNG asynchronously', async () => {
    const drawImage = vi.fn();
    const toBlob = vi.fn((callback: BlobCallback) =>
      callback(new Blob(['png'], { type: 'image/png' })),
    );
    const toDataURL = vi.fn(() => {
      throw new Error('synchronous encoding should not be used');
    });
    const createElement = vi.fn(() => ({
      width: 0,
      height: 0,
      getContext: () => ({ drawImage }),
      toBlob,
      toDataURL,
    }));
    let imageCount = 0;

    class TestImage {
      naturalWidth = 100;
      naturalHeight = 50;
      onload: (() => void) | null = null;
      onerror: (() => void) | null = null;

      constructor() {
        imageCount += 1;
      }

      set src(_value: string) {
        queueMicrotask(() => this.onload?.());
      }
    }

    class TestFileReader {
      result: string | ArrayBuffer | null = null;
      error: DOMException | null = null;
      onload: (() => void) | null = null;
      onerror: (() => void) | null = null;

      readAsDataURL(): void {
        this.result = 'data:image/png;base64,cG5n';
        queueMicrotask(() => this.onload?.());
      }
    }

    vi.stubGlobal('Image', TestImage);
    vi.stubGlobal('FileReader', TestFileReader);
    vi.stubGlobal('document', { createElement });

    const region = { xCssPx: 0, yCssPx: 0 };
    await expect(composeScreenshot('data:image/png;base64,c291cmNl', [], region, 2)).resolves.toBe(
      'data:image/png;base64,cG5n',
    );
    await composeScreenshot('data:image/png;base64,c291cmNl', [], region, 2);

    expect(imageCount).toBe(1);
    expect(drawImage).toHaveBeenCalledTimes(2);
    expect(toBlob).toHaveBeenCalledTimes(2);
    expect(toDataURL).not.toHaveBeenCalled();
  });
});
