export type CaptureBounds = {
  x: number;
  y: number;
  width: number;
  height: number;
};

export type CaptureHandle = 'nw' | 'n' | 'ne' | 'e' | 'se' | 's' | 'sw' | 'w';

type Point = { x: number; y: number };
type Viewport = { width: number; height: number };

const clamp = (value: number, minimum: number, maximum: number): number =>
  Math.min(maximum, Math.max(minimum, value));

export const createCaptureBounds = (
  start: Point,
  current: Point,
  viewport: Viewport,
): CaptureBounds => {
  const startX = clamp(start.x, 0, viewport.width);
  const startY = clamp(start.y, 0, viewport.height);
  const currentX = clamp(current.x, 0, viewport.width);
  const currentY = clamp(current.y, 0, viewport.height);
  return {
    x: Math.min(startX, currentX),
    y: Math.min(startY, currentY),
    width: Math.abs(currentX - startX),
    height: Math.abs(currentY - startY),
  };
};

export const moveCaptureBounds = (
  bounds: CaptureBounds,
  delta: Point,
  viewport: Viewport,
): CaptureBounds => ({
  ...bounds,
  x: clamp(bounds.x + delta.x, 0, Math.max(0, viewport.width - bounds.width)),
  y: clamp(bounds.y + delta.y, 0, Math.max(0, viewport.height - bounds.height)),
});

export const resizeCaptureBounds = (
  bounds: CaptureBounds,
  handle: CaptureHandle,
  delta: Point,
  viewport: Viewport,
  minimumSize = 40,
): CaptureBounds => {
  let left = bounds.x;
  let top = bounds.y;
  let right = bounds.x + bounds.width;
  let bottom = bounds.y + bounds.height;

  if (handle.includes('w')) left = clamp(left + delta.x, 0, right - minimumSize);
  if (handle.includes('e')) right = clamp(right + delta.x, left + minimumSize, viewport.width);
  if (handle.includes('n')) top = clamp(top + delta.y, 0, bottom - minimumSize);
  if (handle.includes('s')) bottom = clamp(bottom + delta.y, top + minimumSize, viewport.height);

  return { x: left, y: top, width: right - left, height: bottom - top };
};
