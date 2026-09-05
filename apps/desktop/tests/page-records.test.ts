import { describe, expect, it } from 'vitest';
import { selectPageRecords, selectProjectPageRecords } from '../src/renderer/src/page-records';

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

  it('isolates identical page sessions between projects', () => {
    const records = [
      { id: 'project-a', projectId: 'a', pageSessionId: 'page-1' },
      { id: 'project-b', projectId: 'b', pageSessionId: 'page-1' },
      { id: 'other-page', projectId: 'a', pageSessionId: 'page-2' },
    ];

    expect(selectProjectPageRecords(records, 'a', 'page-1')).toEqual([records[0]]);
    expect(selectProjectPageRecords(records, 'b', 'page-1')).toEqual([records[1]]);
    expect(selectProjectPageRecords(records, undefined, 'page-1')).toEqual([]);
  });
});
