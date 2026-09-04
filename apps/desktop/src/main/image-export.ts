const pngPrefix = 'data:image/png;base64,';
const pngSignature = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

export const decodeScreenshotDataUrl = (
  input: unknown,
  maximumBytes = 20 * 1024 * 1024,
): Buffer => {
  if (typeof input !== 'string' || !input.startsWith(pngPrefix)) {
    throw new Error('Only PNG screenshots can be exported');
  }
  const encoded = input.slice(pngPrefix.length);
  if (!encoded || !/^[A-Za-z0-9+/]+={0,2}$/.test(encoded)) {
    throw new Error('Screenshot data is invalid');
  }
  const image = Buffer.from(encoded, 'base64');
  if (image.byteLength === 0 || image.byteLength > maximumBytes) {
    throw new Error('Screenshot exceeds the export size limit');
  }
  if (image.subarray(0, pngSignature.length).compare(pngSignature) !== 0) {
    throw new Error('Screenshot data is not a PNG image');
  }
  return image;
};

export const safeScreenshotFilename = (input: unknown): string => {
  const fallback = `markfix-${new Date().toISOString().replaceAll(':', '-')}.png`;
  if (typeof input !== 'string') return fallback;
  const normalized = input
    .trim()
    .replaceAll(/[^a-zA-Z0-9._-]+/g, '-')
    .replaceAll(/^-+|-+$/g, '')
    .slice(0, 120);
  if (!normalized) return fallback;
  return normalized.toLowerCase().endsWith('.png') ? normalized : `${normalized}.png`;
};
