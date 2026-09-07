import { describe, expect, it } from 'vitest';
import { anchorRecoveryNotice } from '../src/renderer/src/annotation-workspace/anchor-recovery.js';

describe('anchor recovery notice', () => {
  it('does not interrupt scrolling with a successful recovery notice', () => {
    expect(anchorRecoveryNotice('resolved')).toBeUndefined();
  });

  it('keeps the actionable lost-element notice', () => {
    expect(anchorRecoveryNotice('lost')).toBe(
      'The selected element moved or disappeared. Select it again or use a region.',
    );
  });
});
