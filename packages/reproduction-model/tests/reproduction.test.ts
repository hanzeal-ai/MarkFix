import { describe, expect, it } from 'vitest';
import type { ReproductionStep } from '@markfix/contracts';
import { mergeAdjacentInputSteps } from '../src/index.js';

describe('mergeAdjacentInputSteps', () => {
  it('keeps only the latest event in a typing burst', () => {
    const anchor = {
      kind: 'element' as const,
      cssSelector: '#email',
      textQuote: '',
      tagName: 'input',
      attributes: {},
      documentUrl: 'https://example.com/',
      framePath: [],
      quadsCssPx: [[0, 0, 100, 0, 100, 20, 0, 20]],
    };
    const base = { type: 'input' as const, description: 'Type', anchor };
    const steps: ReproductionStep[] = [
      { ...base, id: crypto.randomUUID(), timestampMs: 100 },
      { ...base, id: crypto.randomUUID(), timestampMs: 400 },
    ];
    expect(mergeAdjacentInputSteps(steps)).toEqual([steps[1]]);
  });

  it('does not merge different fields or distant input events', () => {
    const makeStep = (selector: string, timestampMs: number): ReproductionStep => ({
      id: crypto.randomUUID(),
      type: 'input',
      description: 'Type',
      timestampMs,
      anchor: {
        kind: 'element',
        cssSelector: selector,
        textQuote: '',
        tagName: 'input',
        attributes: {},
        documentUrl: 'https://example.com/',
        framePath: [],
        quadsCssPx: [[0, 0, 100, 0, 100, 20, 0, 20]],
      },
    });
    const steps = [makeStep('#email', 100), makeStep('#name', 200), makeStep('#name', 800)];
    expect(mergeAdjacentInputSteps(steps)).toEqual(steps);
  });
});
