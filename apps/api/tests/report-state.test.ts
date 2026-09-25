import { describe, expect, it } from 'vitest';
import { transitionReport } from '../src/report-state.js';

describe('transitionReport', () => {
  it('implements the verification rejection loop', () => {
    expect(transitionReport('READY_FOR_VERIFY', 'reject')).toBe('OPEN');
  });

  it('rejects undeclared transitions', () => {
    expect(() => transitionReport('OPEN', 'verify')).toThrow('not allowed');
  });
});
