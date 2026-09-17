import type { ScreenshotMark } from '@markfix/contracts';
import {
  moveCaptureBounds,
  resizeCaptureBounds,
  type CaptureBounds,
  type CaptureHandle,
} from './capture-selection';

export type RectangleMark = Extract<ScreenshotMark, { type: 'rectangle' }>;

export const editScreenshotRectangle = (
  mark: RectangleMark,
  delta: { x: number; y: number },
  capture: CaptureBounds,
  handle?: CaptureHandle,
): RectangleMark => {
  const local = { ...mark, x: mark.x - capture.x, y: mark.y - capture.y };
  const bounds = handle
    ? resizeCaptureBounds(local, handle, delta, capture, Math.min(4, mark.width, mark.height))
    : moveCaptureBounds(local, delta, capture);
  return { ...mark, ...bounds, x: bounds.x + capture.x, y: bounds.y + capture.y };
};
