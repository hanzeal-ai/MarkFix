import { savedCaptureSchema, type SavedCapture } from '@markfix/contracts';

export type StoredCapture = Omit<SavedCapture, 'dataUrl' | 'sourceDataUrl'>;
const pngDataUrlPrefix = 'data:image/png;base64,';

export const captureStorage = (capture: SavedCapture) => {
  const { dataUrl, sourceDataUrl, ...metadata } = capture;
  return {
    metadata,
    renderedPng: Buffer.from(dataUrl.slice(pngDataUrlPrefix.length), 'base64'),
    sourcePng:
      sourceDataUrl === dataUrl
        ? null
        : Buffer.from(sourceDataUrl.slice(pngDataUrlPrefix.length), 'base64'),
  };
};

export const hydrateCapture = (
  metadata: StoredCapture,
  renderedPng: Buffer,
  sourcePng: Buffer | null,
): SavedCapture =>
  savedCaptureSchema.parse({
    ...metadata,
    dataUrl: `${pngDataUrlPrefix}${renderedPng.toString('base64')}`,
    sourceDataUrl: `${pngDataUrlPrefix}${(sourcePng ?? renderedPng).toString('base64')}`,
  });
