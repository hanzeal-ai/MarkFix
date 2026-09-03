export type Rectangle = { x: number; y: number; width: number; height: number };

export const cropForQuads = (
  quads: readonly (readonly number[])[],
  viewport: { width: number; height: number },
  paddingCssPx = 24,
): Rectangle | undefined => {
  const valid = quads.filter(
    (quad) => quad.length === 8 && quad.every((value) => Number.isFinite(value)),
  );
  if (valid.length === 0) return undefined;
  const xValues = valid.flatMap((quad) => quad.filter((_value, index) => index % 2 === 0));
  const yValues = valid.flatMap((quad) => quad.filter((_value, index) => index % 2 === 1));
  const left = Math.max(0, Math.min(...xValues) - paddingCssPx);
  const top = Math.max(0, Math.min(...yValues) - paddingCssPx);
  const right = Math.min(viewport.width, Math.max(...xValues) + paddingCssPx);
  const bottom = Math.min(viewport.height, Math.max(...yValues) + paddingCssPx);
  if (right <= left || bottom <= top) return undefined;
  return { x: left, y: top, width: right - left, height: bottom - top };
};

export const boundFullPage = (
  width: number,
  height: number,
  maxHeight = 16_384,
  maxPixels = 60_000_000,
): { width: number; height: number; truncated: boolean } => {
  const boundedWidth = Math.max(1, Math.min(width, 10_000));
  const heightForPixels = Math.floor(maxPixels / boundedWidth);
  const boundedHeight = Math.max(1, Math.min(height, maxHeight, heightForPixels));
  return {
    width: boundedWidth,
    height: boundedHeight,
    truncated: boundedWidth < width || boundedHeight < height,
  };
};
