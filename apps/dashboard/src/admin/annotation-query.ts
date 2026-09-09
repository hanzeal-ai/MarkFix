import { queryOptions } from '@tanstack/react-query';
import { commercialRequest } from './api';
import type { AnnotationStatus, PaginatedAnnotations } from './model';

export function annotationQueryOptions(
  projectId: string | undefined,
  filter: 'ALL' | AnnotationStatus,
  query: string,
  page: number,
) {
  const search = new URLSearchParams({ page: String(page), pageSize: '50' });
  if (filter !== 'ALL') search.set('status', filter);
  if (query) search.set('query', query);
  return queryOptions({
    queryKey: ['commercial-reports', projectId, filter, query, page],
    queryFn: () =>
      commercialRequest<PaginatedAnnotations>(
        `/projects/${projectId}/annotations?${search.toString()}`,
      ),
    staleTime: 30_000,
  });
}
