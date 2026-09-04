import { describe, expect, it } from 'vitest';
import { selectPageRecords } from '../src/renderer/src/page-records';

describe('page-scoped annotation records', () => {
  it('restores each page own element comments and screenshots', () => {
    const pageA = 'https://example.test/page-a';
    const pageB = 'https://example.test/page-b';
    const elementComments = [
      { id: 'a-comment-1', pageUrl: pageA },
      { id: 'b-comment-1', pageUrl: pageB },
      { id: 'b-comment-2', pageUrl: pageB },
      { id: 'b-comment-3', pageUrl: pageB },
      { id: 'b-comment-4', pageUrl: pageB },
    ];
    const screenshots = [
      { id: 'a-shot-1', pageUrl: pageA },
      { id: 'a-shot-2', pageUrl: pageA },
      { id: 'a-shot-3', pageUrl: pageA },
      { id: 'b-shot-1', pageUrl: pageB },
    ];

    expect(selectPageRecords(elementComments, pageA).map(({ id }) => id)).toEqual(['a-comment-1']);
    expect(selectPageRecords(screenshots, pageA).map(({ id }) => id)).toEqual([
      'a-shot-1',
      'a-shot-2',
      'a-shot-3',
    ]);
    expect(selectPageRecords(elementComments, pageB)).toHaveLength(4);
    expect(selectPageRecords(screenshots, pageB).map(({ id }) => id)).toEqual(['b-shot-1']);

    expect(selectPageRecords(elementComments, pageA)).toHaveLength(1);
    expect(selectPageRecords(screenshots, pageA)).toHaveLength(3);
  });
});
