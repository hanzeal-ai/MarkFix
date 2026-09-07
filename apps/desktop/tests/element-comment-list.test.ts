import { describe, expect, it } from 'vitest';
import { numberedVisibleRecords } from '../src/renderer/src/annotation-workspace/model.js';

describe('element comment list', () => {
  it('hides the edited comment and preserves the other comments original numbers', () => {
    const comments = [{ id: 'first' }, { id: 'second' }, { id: 'third' }];

    expect(numberedVisibleRecords(comments, 'second')).toEqual([
      { comment: comments[2], number: 3 },
      { comment: comments[0], number: 1 },
    ]);
  });
});
