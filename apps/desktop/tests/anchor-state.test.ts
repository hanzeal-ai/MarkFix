import { describe, expect, it } from 'vitest';
import type { ElementAnchor } from '@markfix/contracts';
import { anchorsEqual } from '../src/main/anchor-state.js';

const selectedElement: ElementAnchor = {
  kind: 'element',
  cssSelector: 'div',
  textQuote: 'Selected card',
  tagName: 'div',
  attributes: {},
  documentUrl: 'https://example.com',
  framePath: [],
  quadsCssPx: [[300, 200, 500, 200, 500, 300, 300, 300]],
};

describe('anchorsEqual', () => {
  it('recognizes the immediate renderer echo of a selected element', () => {
    expect(anchorsEqual(selectedElement, { ...selectedElement })).toBe(true);
  });

  it('allows a changed element position to be resolved again', () => {
    expect(
      anchorsEqual(selectedElement, {
        ...selectedElement,
        quadsCssPx: [[320, 200, 520, 200, 520, 300, 320, 300]],
      }),
    ).toBe(false);
  });
});
