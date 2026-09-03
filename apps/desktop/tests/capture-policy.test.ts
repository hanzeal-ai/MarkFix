import { describe, expect, it } from 'vitest';
import { boundFullPage, cropForQuads } from '../src/main/capture-policy.js';

describe('cropForQuads', () => {
  it('adds context and clamps the crop to the viewport', () => {
    expect(cropForQuads([[5, 10, 80, 10, 80, 40, 5, 40]], { width: 100, height: 80 })).toEqual({
      x: 0,
      y: 0,
      width: 100,
      height: 64,
    });
  });
});

describe('boundFullPage', () => {
  it('caps height and total pixels', () => {
    expect(boundFullPage(8_000, 30_000)).toEqual({
      width: 8_000,
      height: 7_500,
      truncated: true,
    });
  });
});
