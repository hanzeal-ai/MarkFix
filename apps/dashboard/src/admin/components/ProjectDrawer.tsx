import { useEffect, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ChevronRight, Clock3, MessageSquareText, Pencil, Plus, Search } from '@markfix/ui/icons';
import {
  Alert,
  AlertDescription,
  Badge,
  Button,
  Card,
  Input,
  Label,
  NativeSelect,
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from '@markfix/ui';
import { commercialRequest } from '../api';
import { EmptyState, StatusBadge } from './AdminState';
import { AnnotationEditor } from './AnnotationEditor';
import {
  formatDate,
  kindText,
  statusText,
  type AnnotationStatus,
  type EditorState,
  type OverviewProject,
  type OverviewUser,
  type PaginatedAnnotations,
} from '../model';

export function ProjectDrawer({
  project,
  users,
  canManage,
  onClose,
}: {
  project: OverviewProject | null;
  users: OverviewUser[];
  canManage: boolean;
  onClose: () => void;
}) {
  const queryClient = useQueryClient();
  const [editor, setEditor] = useState<EditorState | null>(null);
  const [filter, setFilter] = useState<'ALL' | AnnotationStatus>('ALL');
  const [query, setQuery] = useState('');
  const [debouncedQuery, setDebouncedQuery] = useState('');
  const [page, setPage] = useState(1);
  const [category, setCategory] = useState(project?.category ?? '');
  const annotations = useQuery({
    queryKey: ['commercial-reports', project?.id, filter, debouncedQuery, page],
    queryFn: () => {
      const search = new URLSearchParams({ page: String(page), pageSize: '50' });
      if (filter !== 'ALL') search.set('status', filter);
      if (debouncedQuery) search.set('query', debouncedQuery);
      return commercialRequest<PaginatedAnnotations>(
        `/projects/${project?.id}/annotations?${search.toString()}`,
      );
    },
    enabled: Boolean(project),
    staleTime: 30_000,
    placeholderData: (previousData, previousQuery) =>
      previousQuery?.queryKey[1] === project?.id ? previousData : undefined,
  });

  useEffect(() => {
    setCategory(project?.category ?? '');
  }, [project?.category, project?.id]);

  useEffect(() => {
    setEditor(null);
    setFilter('ALL');
    setQuery('');
    setDebouncedQuery('');
    setPage(1);
  }, [project?.id]);

  useEffect(() => {
    const timer = window.setTimeout(() => setDebouncedQuery(query.trim()), 250);
    return () => window.clearTimeout(timer);
  }, [query]);

  useEffect(() => setPage(1), [debouncedQuery, filter]);

  const updateCategory = useMutation({
    mutationFn: () =>
      commercialRequest(`/projects/${project?.id}/category`, {
        method: 'PATCH',
        body: JSON.stringify({ category }),
      }),
    onSuccess: () =>
      queryClient.invalidateQueries({ queryKey: ['commercial-overview', project?.workspaceId] }),
  });

  const visibleAnnotations = annotations.data?.items ?? [];
  const totalPages = Math.max(
    1,
    Math.ceil((annotations.data?.total ?? 0) / (annotations.data?.pageSize ?? 50)),
  );

  useEffect(() => {
    if (page > totalPages) setPage(totalPages);
  }, [page, totalPages]);

  useEffect(() => {
    if (!project || page >= totalPages) return;
    const nextPage = page + 1;
    const search = new URLSearchParams({ page: String(nextPage), pageSize: '50' });
    if (filter !== 'ALL') search.set('status', filter);
    if (debouncedQuery) search.set('query', debouncedQuery);
    void queryClient.prefetchQuery({
      queryKey: ['commercial-reports', project.id, filter, debouncedQuery, nextPage],
      queryFn: () =>
        commercialRequest<PaginatedAnnotations>(
          `/projects/${project.id}/annotations?${search.toString()}`,
        ),
      staleTime: 30_000,
    });
  }, [debouncedQuery, filter, page, project, queryClient, totalPages]);

  return (
    <>
      <Sheet open={Boolean(project)} onOpenChange={(open) => !open && onClose()}>
        <SheetContent className="project-sheet">
          {project && (
            <>
              <SheetHeader>
                <div className="sheet-heading-line">
                  <Badge variant="secondary">{project.category}</Badge>
                  <span>{annotations.data?.total ?? project.annotationCount} 条标注</span>
                </div>
                <SheetTitle>{project.name}</SheetTitle>
                <SheetDescription>{project.baseUrl ?? '尚未设置项目地址'}</SheetDescription>
                {canManage && (
                  <form
                    className="category-editor"
                    onSubmit={(event) => {
                      event.preventDefault();
                      updateCategory.mutate();
                    }}
                  >
                    <Input
                      aria-label="项目分类"
                      value={category}
                      onChange={(event) => setCategory(event.target.value)}
                    />
                    <Button
                      type="submit"
                      variant="outline"
                      disabled={!category.trim() || updateCategory.isPending}
                    >
                      保存分类
                    </Button>
                  </form>
                )}
              </SheetHeader>
              <div className="sheet-toolbar">
                <Label className="sheet-search">
                  <Search />
                  <Input
                    value={query}
                    onChange={(event) => setQuery(event.target.value)}
                    placeholder="搜索标注"
                  />
                </Label>
                <NativeSelect
                  aria-label="标注状态"
                  value={filter}
                  onChange={(event) => setFilter(event.target.value as typeof filter)}
                >
                  <option value="ALL">全部状态</option>
                  {Object.entries(statusText).map(([value, label]) => (
                    <option key={value} value={value}>
                      {label}
                    </option>
                  ))}
                </NativeSelect>
                {canManage && (
                  <Button onClick={() => setEditor({ mode: 'create' })}>
                    <Plus />
                    新增标注
                  </Button>
                )}
              </div>
              <div className="sheet-content-list">
                {annotations.isPending && <div className="admin-loading">正在加载标注…</div>}
                {annotations.error instanceof Error && (
                  <Alert variant="destructive">
                    <AlertDescription>{annotations.error.message}</AlertDescription>
                  </Alert>
                )}
                {!annotations.isPending && !visibleAnnotations.length && (
                  <EmptyState icon={MessageSquareText} title="没有符合条件的标注" />
                )}
                {visibleAnnotations.map((annotation) => (
                  <Card className="annotation-row" key={annotation.id}>
                    <button
                      className="annotation-summary"
                      type="button"
                      onClick={() => setEditor({ mode: 'view', annotation })}
                    >
                      <div className="annotation-row-top">
                        <StatusBadge status={annotation.status} />
                        <span>{kindText[annotation.kind]}</span>
                        <span>
                          <Clock3 />
                          {formatDate(annotation.updatedAt)}
                        </span>
                      </div>
                      <strong>{annotation.title}</strong>
                      <div className="annotation-row-bottom">
                        <span className="mini-avatar">
                          {annotation.author?.displayName.slice(0, 1) ?? '?'}
                        </span>
                        <span>{annotation.author?.displayName ?? '未知成员'}</span>
                        <ChevronRight />
                      </div>
                    </button>
                    {canManage && (
                      <div className="annotation-actions">
                        <Button
                          size="icon-sm"
                          variant="ghost"
                          title="编辑"
                          onClick={() => setEditor({ mode: 'edit', annotation })}
                        >
                          <Pencil />
                        </Button>
                        {(annotation.status === 'OPEN' || annotation.status === 'IN_REVIEW') && (
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => setEditor({ mode: 'reject', annotation })}
                          >
                            驳回
                          </Button>
                        )}
                      </div>
                    )}
                  </Card>
                ))}
              </div>
              {annotations.data && annotations.data.total > annotations.data.pageSize && (
                <div className="sheet-pagination">
                  <Button
                    type="button"
                    variant="outline"
                    disabled={page <= 1 || annotations.isFetching}
                    onClick={() => setPage((current) => Math.max(1, current - 1))}
                  >
                    上一页
                  </Button>
                  <span>
                    第 {page} / {totalPages} 页
                  </span>
                  <Button
                    type="button"
                    variant="outline"
                    disabled={page >= totalPages || annotations.isFetching}
                    onClick={() => setPage((current) => Math.min(totalPages, current + 1))}
                  >
                    下一页
                  </Button>
                </div>
              )}
              <AnnotationEditor
                state={editor}
                project={project}
                users={users}
                onClose={() => setEditor(null)}
              />
            </>
          )}
        </SheetContent>
      </Sheet>
    </>
  );
}
