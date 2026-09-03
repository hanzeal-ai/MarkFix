import { describe, expect, it } from 'vitest';
import type { ReproductionStep } from '@markfix/contracts';
import { mergeAdjacentInputSteps } from '../src/index.js';

describe('mergeAdjacentInputSteps', () => {
  it('keeps only the latest event in a typing burst', () => {
    const base = { type: 'input' as const, description: 'Type', anchor: undefined };
    const steps: ReproductionStep[] = [
      { ...base, id: crypto.randomUUID(), timestampMs: 100 },
      { ...base, id: crypto.randomUUID(), timestampMs: 400 },
    ];
    expect(mergeAdjacentInputSteps(steps)).toEqual([steps[1]]);
  });
});
