import { describe, expect, it } from 'vitest';
import type { ElementAnchor } from '@markfix/contracts';
import { pickBestAnchorCandidate, scoreAnchorCandidate } from '../src/index.js';

const anchor: ElementAnchor = {
  kind: 'element',
  cssSelector: '#submit',
  textQuote: 'Submit report',
  tagName: 'button',
  attributes: { 'aria-label': 'Submit report' },
  documentUrl: 'https://example.com',
  framePath: [],
  quadsCssPx: [[10, 10, 110, 10, 110, 50, 10, 50]],
};

describe('scoreAnchorCandidate', () => {
  it('returns high confidence when independent signals agree', () => {
    expect(
      scoreAnchorCandidate(anchor, {
        cssSelectorMatched: true,
        textQuote: 'Submit report',
        tagName: 'button',
        attributes: { 'aria-label': 'Submit report' },
        centerDistanceCssPx: 0,
      }).confidence,
    ).toBe('high');
  });

  it('does not trust geometry alone', () => {
    expect(
      scoreAnchorCandidate(anchor, {
        cssSelectorMatched: false,
        textQuote: 'Delete',
        tagName: 'div',
        attributes: {},
        centerDistanceCssPx: 0,
      }).confidence,
    ).toBe('low');
  });

  it('chooses the clicked element when a tag selector matches multiple elements', () => {
    const repeatedTagAnchor: ElementAnchor = {
      ...anchor,
      cssSelector: 'div',
      textQuote: 'Selected card',
      tagName: 'div',
      attributes: {},
      quadsCssPx: [[300, 200, 500, 200, 500, 300, 300, 300]],
    };

    const fullPageContainer = {
      cssSelectorMatched: true,
      textQuote: 'Navigation Selected card Footer',
      tagName: 'div',
      attributes: {},
      centerDistanceCssPx: 420,
    };
    const clickedElement = {
      cssSelectorMatched: true,
      textQuote: 'Selected card',
      tagName: 'div',
      attributes: {},
      centerDistanceCssPx: 0,
    };

    expect(
      pickBestAnchorCandidate(repeatedTagAnchor, [fullPageContainer, clickedElement])?.candidate,
    ).toBe(clickedElement);
  });
});
