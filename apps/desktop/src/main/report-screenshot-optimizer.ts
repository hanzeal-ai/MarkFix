import type { CreateReport } from '@markfix/contracts';

type ImageSize = { width: number; height: number };

export type UploadImage = {
  getSize(): ImageSize;
  isEmpty(): boolean;
  resize(options: { width: number; quality: 'best' }): UploadImage;
  toPNG(): Buffer;
};

const pngPrefix = 'data:image/png;base64,';
const maximumUploadCaptureScale = 1.25;

export const optimizeReportScreenshot = (
  report: CreateReport,
  decodeImage: (dataUrl: string) => UploadImage,
): CreateReport => {
  const dataUrl = report.screenshotDataUrl;
  const capture = report.captureBundle.capture;
  if (!dataUrl || !capture || capture.captureScale <= maximumUploadCaptureScale) return report;

  try {
    const image = decodeImage(dataUrl);
    if (image.isEmpty()) return report;
    const originalSize = image.getSize();
    const targetWidth = Math.max(
      1,
      Math.min(originalSize.width, Math.round(capture.widthCssPx * maximumUploadCaptureScale)),
    );
    if (targetWidth >= originalSize.width) return report;

    const resized = image.resize({ width: targetWidth, quality: 'best' });
    if (resized.isEmpty()) return report;
    const optimizedBytes = resized.toPNG();
    const originalBytes = Buffer.from(dataUrl.slice(pngPrefix.length), 'base64');
    if (optimizedBytes.byteLength >= originalBytes.byteLength) return report;

    const optimizedSize = resized.getSize();
    return {
      ...report,
      screenshotDataUrl: `${pngPrefix}${optimizedBytes.toString('base64')}`,
      captureBundle: {
        ...report.captureBundle,
        capture: {
          ...capture,
          imageWidthPx: optimizedSize.width,
          imageHeightPx: optimizedSize.height,
          captureScale: optimizedSize.width / capture.widthCssPx,
        },
      },
    };
  } catch {
    return report;
  }
};
