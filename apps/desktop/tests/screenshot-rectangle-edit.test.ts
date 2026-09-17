import { describe, expect, it } from 'vitest';
import {
  editScreenshotRectangle,
  type RectangleMark,
} from '../src/target-runtime/screenshot-rectangle-edit';

const mark: RectangleMark = {
  id: 'rectangle',
  type: 'rectangle',
  color: '#ef4444',
  strokeWidth: 4,
  x: 120,
  y: 90,
  width: 80,
  height: 60,
};
const capture = { x: 100, y: 50, width: 300, height: 200 };

describe('screenshot rectangle editing', () => {
  it('moves a mark while retaining its identity, style and size', () => {
    expect(editScreenshotRectangle(mark, { x: 30, y: -10 }, capture)).toEqual({
      ...mark,
      x: 150,
      y: 80,
    });
  });
  it('clamps dragging to the screenshot rather than the viewport', () => {
    expect(editScreenshotRectangle(mark, { x: 900, y: -900 }, capture)).toEqual({
      ...mark,
      x: 320,
      y: 50,
    });
  });
  it('resizes a corner without moving the opposite corner', () => {
    expect(editScreenshotRectangle(mark, { x: 20, y: 30 }, capture, 'se')).toEqual({
      ...mark,
      width: 100,
      height: 90,
    });
    expect(editScreenshotRectangle(mark, { x: -900, y: -900 }, capture, 'nw')).toEqual({
      ...mark,
      x: 100,
      y: 50,
      width: 100,
      height: 100,
    });
  });
  it('keeps a minimum size when dragging past the opposite edge', () => {
    expect(editScreenshotRectangle(mark, { x: 900, y: 0 }, capture, 'w')).toEqual({
      ...mark,
      x: 196,
      width: 4,
    });
  });
});
