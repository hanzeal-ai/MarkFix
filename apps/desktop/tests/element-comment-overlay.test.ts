import { describe, expect, it } from 'vitest';
import {
  avoidOverlappingPins,
  elementCommentPinPosition,
} from '../src/target-runtime/element-comment-overlay.js';

describe('element comment badge position', () => {
  it('places the badge at the top left corner', () => {
    expect(
      elementCommentPinPosition(
        { left: 120, right: 320, top: 80, height: 20 },
        { width: 800, height: 600 },
      ),
    ).toEqual({ x: 120, y: 80 });
  });

  it('shifts only enough to keep the badge visible at the viewport edge', () => {
    expect(
      elementCommentPinPosition(
        { left: 0, right: 30, top: 0, height: 24 },
        { width: 800, height: 600 },
      ),
    ).toEqual({ x: 12, y: 12 });
  });
});

describe('annotation pin collision avoidance', () => {
  it('keeps isolated pins and separates partially overlapping pins without losing their identity', () => {
    const pins = [
      { id: 'one', x: 32, y: 40 },
      { id: 'two', x: 34, y: 42 },
      { id: 'three', x: 300, y: 200 },
    ];
    const result = avoidOverlappingPins(pins, { width: 800, height: 600 });
    expect(result[0]).toEqual(pins[0]);
    expect(result[1]).toEqual({ id: 'two', x: 60, y: 42 });
    expect(result[2]).toEqual(pins[2]);
    expect(pins[1]?.x).toBe(34);
  });
  it('wraps at the right and bottom edges, with deterministic positions', () => {
    const pins = Array.from({ length: 8 }, (_, id) => ({ id, x: 188, y: 88 }));
    const result = avoidOverlappingPins(pins, { width: 200, height: 100 });
    expect(result).toEqual(avoidOverlappingPins(pins, { width: 200, height: 100 }));
    result.forEach((pin, index) => {
      expect(pin.x).toBeGreaterThanOrEqual(12);
      expect(pin.x).toBeLessThanOrEqual(188);
      expect(pin.y).toBeGreaterThanOrEqual(12);
      expect(pin.y).toBeLessThanOrEqual(88);
      result
        .slice(0, index)
        .forEach((other) =>
          expect(Math.hypot(pin.x - other.x, pin.y - other.y)).toBeGreaterThanOrEqual(26),
        );
    });
  });
});
