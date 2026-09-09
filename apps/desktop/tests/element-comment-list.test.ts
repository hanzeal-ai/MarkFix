import { describe, expect, it } from 'vitest';
import { numberedVisibleRecords } from '../src/renderer/src/annotation-workspace/model.js';

describe('element comment list', () => {
  it('numbers visible records in display order after the preceding record group', () => {
    const comments = [{ id: 'first' }, { id: 'second' }, { id: 'third' }];

    expect(numberedVisibleRecords(comments, 'second', 2)).toEqual([
      { comment: comments[2], number: 3 },
      { comment: comments[0], number: 4 },
    ]);
  });

  it('starts at one and closes gaps after deletion', () => {
    expect(
      numberedVisibleRecords([{ id: 'first' }, { id: 'third' }], undefined).map(
        ({ number }) => number,
      ),
    ).toEqual([1, 2]);
  });
});
