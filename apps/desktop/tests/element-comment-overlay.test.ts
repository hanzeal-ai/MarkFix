import { describe, expect, it } from 'vitest';
import { elementCommentPinPosition } from '../src/target-runtime/element-comment-overlay.js';

describe('element comment badge position', () => {
  it('places the badge outside the element left edge and centers it vertically', () => {
    expect(
      elementCommentPinPosition(
        { left: 120, right: 320, top: 80, height: 20 },
        { width: 800, height: 600 },
      ),
    ).toEqual({ x: 104, y: 90 });
  });

  it('uses the right edge when the badge would be clipped on the left', () => {
    expect(
      elementCommentPinPosition(
        { left: 0, right: 30, top: 0, height: 24 },
        { width: 800, height: 600 },
      ),
    ).toEqual({ x: 46, y: 12 });
  });
});
