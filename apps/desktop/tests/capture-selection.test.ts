import { describe, expect, it } from 'vitest';
import {
  createCaptureBounds,
  moveCaptureBounds,
  resizeCaptureBounds,
} from '../src/target-runtime/capture-selection.js';

const viewport = { width: 800, height: 600 };

describe('capture selection geometry', () => {
  it('normalizes reverse drags and clips them to the viewport', () => {
    expect(createCaptureBounds({ x: 900, y: 500 }, { x: 100, y: -20 }, viewport)).toEqual({
      x: 100,
      y: 0,
      width: 700,
      height: 500,
    });
  });

  it('moves a selection without letting it leave the viewport', () => {
    expect(
      moveCaptureBounds({ x: 100, y: 100, width: 300, height: 200 }, { x: 900, y: -300 }, viewport),
    ).toEqual({ x: 500, y: 0, width: 300, height: 200 });
  });

  it('resizes from every edge while respecting the minimum size', () => {
    expect(
      resizeCaptureBounds(
        { x: 100, y: 100, width: 300, height: 200 },
        'nw',
        { x: 500, y: 500 },
        viewport,
      ),
    ).toEqual({ x: 360, y: 260, width: 40, height: 40 });
    expect(
      resizeCaptureBounds(
        { x: 600, y: 450, width: 150, height: 100 },
        'se',
        { x: 500, y: 500 },
        viewport,
      ),
    ).toEqual({ x: 600, y: 450, width: 200, height: 150 });
  });
});
