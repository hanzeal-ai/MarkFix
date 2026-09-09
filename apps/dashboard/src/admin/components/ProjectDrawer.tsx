import { ProjectRepositoryBinding } from '../../agent/ProjectRepositoryBinding.js';
import { useEffect, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  ChevronRight,
  Clock3,
  ExternalLink,
  MessageSquareText,
  Pencil,
  Plus,
  Search,
} from '@markfix/ui/icons';
import {
  Alert,
  AlertDescription,
  Badge,
  Button,
  Card,
  Input,
  Label,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Avatar,
  AvatarFallback,
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from '@markfix/ui';
import { commercialRequest, resolveAdminAssetUrl } from '../api';
import { EmptyState, StatusBadge } from './AdminState';
import { AnnotationEditor } from './AnnotationEditor';
import { ScreenshotPreviewDialog } from './ScreenshotPreviewDialog';
import { annotationQueryOptions } from '../annotation-query';
import {
  formatDate,
  kindText,
  statusText,
  type AnnotationStatus,
  type EditorState,
  type OverviewProject,
  type OverviewUser,
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
  const [previewScreenshot, setPreviewScreenshot] = useState<{
    title: string;
    url: string;
  } | null>(null);
  const annotations = useQuery({
    ...annotationQueryOptions(project?.id, filter, debouncedQuery, page),
    enabled: Boolean(project),
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
    setPreviewScreenshot(null);
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
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['commercial-overview'] }),
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
    void queryClient.prefetchQuery(
      annotationQueryOptions(project.id, filter, debouncedQuery, page + 1),
    );
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
                <SheetDescription className="project-url-line">
                  {project.baseUrl ? (
                    <Button asChild variant="link" className="project-url-button">
                      <a href={project.baseUrl} target="_blank" rel="noreferrer">
                        <span>{project.baseUrl}</span>
                        <ExternalLink />
                      </a>
                    </Button>
                  ) : (
                    '尚未设置项目地址'
                  )}
                </SheetDescription>
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
              <ProjectRepositoryBinding projectId={project.id} canManage={canManage} />
              <div className="sheet-toolbar">
                <Label className="sheet-search">
                  <Search />
                  <Input
                    value={query}
                    onChange={(event) => setQuery(event.target.value)}
                    placeholder="搜索标注"
                  />
                </Label>
                <Select value={filter} onValueChange={(value) => setFilter(value as typeof filter)}>
                  <SelectTrigger aria-label="标注状态">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="ALL">全部状态</SelectItem>
                    {Object.entries(statusText).map(([value, label]) => (
                      <SelectItem key={value} value={value}>
                        {label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
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
                {!annotations.isPending && !annotations.isError && !visibleAnnotations.length && (
                  <EmptyState icon={MessageSquareText} title="没有符合条件的标注" />
                )}
                {visibleAnnotations.map((annotation) => (
                  <Card className="annotation-row" key={annotation.id}>
                    <div className="annotation-summary">
                      <div className="annotation-row-top">
                        <span className="annotation-reference-code">
                          {annotation.referenceCode}
                        </span>
                        <StatusBadge status={annotation.status} />
                        <span>{kindText[annotation.kind]}</span>
                      </div>
                      <div className="annotation-summary-body">
                        {annotation.screenshotUrl && (
                          <Button
                            className="annotation-thumbnail-button"
                            variant="ghost"
                            type="button"
                            aria-label={`预览${annotation.title}截图`}
                            onClick={(event) => {
                              event.stopPropagation();
                              const screenshotUrl = annotation.screenshotUrl;
                              if (!screenshotUrl) return;
                              setPreviewScreenshot({
                                title: annotation.title,
                                url: screenshotUrl,
                              });
                            }}
                          >
                            <img
                              className="annotation-thumbnail"
                              src={resolveAdminAssetUrl(annotation.screenshotUrl)}
                              alt={`${annotation.title}截图缩略图`}
                              loading="lazy"
                            />
                            <span>预览</span>
                          </Button>
                        )}
                        <Button
                          className="annotation-summary-copy"
                          variant="ghost"
                          type="button"
                          onClick={() => setEditor({ mode: 'view', annotation })}
                        >
                          <p className="annotation-row-note">{annotation.note}</p>
                          <div className="annotation-row-bottom">
                            <Avatar className="mini-avatar">
                              <AvatarFallback className="bg-transparent text-inherit">
                                {annotation.author?.displayName.slice(0, 1) ?? '?'}
                              </AvatarFallback>
                            </Avatar>
                            <span>{annotation.author?.displayName ?? '未知成员'}</span>
                            <span className="annotation-submitted-at">
                              <Clock3 />
                              {formatDate(annotation.createdAt)}
                            </span>
                            <ChevronRight />
                          </div>
                        </Button>
                      </div>
                    </div>
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
      {previewScreenshot && (
        <ScreenshotPreviewDialog
          title={previewScreenshot.title}
          url={previewScreenshot.url}
          onClose={() => setPreviewScreenshot(null)}
        />
      )}
    </>
  );
}
