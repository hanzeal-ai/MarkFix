import { describe, expect, it, vi } from 'vitest';
import type { CreateReport } from '@markfix/contracts';
import {
  optimizeReportScreenshot,
  type UploadImage,
} from '../src/main/report-screenshot-optimizer.js';

const report = (captureScale = 2): CreateReport => ({
  projectId: '00000000-0000-4000-8000-000000000001',
  title: 'Screenshot',
  description: 'Description',
  priority: 'MEDIUM',
  screenshotDataUrl: `data:image/png;base64,${Buffer.alloc(200, 1).toString('base64')}`,
  captureBundle: {
    schemaVersion: 1,
    annotations: [],
    reproduction: [],
    page: {
      url: 'https://example.com',
      title: 'Example',
      viewportWidthCssPx: 1000,
      viewportHeightCssPx: 500,
      deviceScaleFactor: 2,
      capturedAt: '2026-09-07T00:00:00.000Z',
    },
    capture: {
      mode: 'visible',
      imageWidthPx: 2000,
      imageHeightPx: 1000,
      widthCssPx: 1000,
      heightCssPx: 500,
      originCssPx: { x: 0, y: 0 },
      captureScale,
      truncated: false,
    },
  },
});

const image = (width: number, height: number, bytes = 100): UploadImage => ({
  getSize: () => ({ width, height }),
  isEmpty: () => false,
  resize: vi.fn(({ width: resizedWidth }: { width: number }) =>
    image(resizedWidth, Math.round((height * resizedWidth) / width), bytes),
  ),
  toPNG: () => Buffer.alloc(bytes, 2),
});

describe('report screenshot optimizer', () => {
  it('downsamples high-DPI upload copies and updates capture metadata', () => {
    const source = image(2000, 1000);
    const optimized = optimizeReportScreenshot(report(), () => source);

    expect(source.resize).toHaveBeenCalledWith({ width: 1250, quality: 'best' });
    expect(optimized.screenshotDataUrl).not.toBe(report().screenshotDataUrl);
    expect(optimized.captureBundle.capture).toMatchObject({
      imageWidthPx: 1250,
      imageHeightPx: 625,
      captureScale: 1.25,
    });
  });

  it('keeps screenshots that are already within the upload scale limit', () => {
    const original = report(1);
    const decode = vi.fn(() => image(1000, 500));

    expect(optimizeReportScreenshot(original, decode)).toBe(original);
    expect(decode).not.toHaveBeenCalled();
  });

  it('keeps the original when PNG re-encoding does not reduce its size', () => {
    const original = report();
    const decode = vi.fn(() => image(2000, 1000, 300));

    expect(optimizeReportScreenshot(original, decode)).toBe(original);
  });
});
