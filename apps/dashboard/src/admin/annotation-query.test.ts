import { QueryClient } from '@tanstack/react-query';
import { afterEach, expect, it, vi } from 'vitest';
import { commercialRequest } from './api';
import { annotationQueryOptions } from './annotation-query';

vi.mock('./api', () => ({ commercialRequest: vi.fn() }));
afterEach(() => vi.clearAllMocks());

it.each([
  ['ALL', '', 1, 'page=1&pageSize=50'],
  [
    'REJECTED',
    '按钮 & menu',
    2,
    'page=2&pageSize=50&status=REJECTED&query=%E6%8C%89%E9%92%AE+%26+menu',
  ],
] as const)('preserves pagination and filtering for %s', async (filter, query, page, search) => {
  const client = new QueryClient();
  try {
    vi.mocked(commercialRequest).mockResolvedValue({ items: [], total: 0, page, pageSize: 50 });
    const options = annotationQueryOptions('project-a', filter, query, page);
    await client.fetchQuery(options);
    expect(commercialRequest).toHaveBeenCalledExactlyOnceWith(
      `/projects/project-a/annotations?${search}`,
    );
    expect(options.queryKey).toEqual(['commercial-reports', 'project-a', filter, query, page]);
  } finally {
    client.clear();
  }
});

it('reuses prefetched data only for the same project, filter, search and page', async () => {
  const client = new QueryClient();
  const data = { items: [], total: 60, page: 2, pageSize: 50 };
  vi.mocked(commercialRequest).mockResolvedValue(data);
  try {
    await client.prefetchQuery(annotationQueryOptions('project-a', 'OPEN', 'button', 2));
    expect(await client.fetchQuery(annotationQueryOptions('project-a', 'OPEN', 'button', 2))).toBe(
      data,
    );
    expect(commercialRequest).toHaveBeenCalledTimes(1);
    for (const options of [
      annotationQueryOptions('project-b', 'OPEN', 'button', 2),
      annotationQueryOptions('project-a', 'RESOLVED', 'button', 2),
      annotationQueryOptions('project-a', 'OPEN', 'link', 2),
      annotationQueryOptions('project-a', 'OPEN', 'button', 3),
    ]) {
      expect(client.getQueryData(options.queryKey)).toBeUndefined();
    }
  } finally {
    client.clear();
  }
});
