import { ReadAuthorization } from './ReadAuthorization';
import { useEffect, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  ArrowLeft,
  ChevronRight,
  Clock3,
  ExternalLink,
  MessageSquareText,
  MoreHorizontal,
  Trash2,
  Pencil,
  Plus,
  Search,
} from '@markfix/ui/icons';
import {
  Alert,
  AlertDescription,
  AlertDialog,
  AlertDialogContent,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogCancel,
  Badge,
  Button,
  Card,
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
  Input,
  Label,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Avatar,
  AvatarFallback,
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

export function ProjectDetailsPage({
  project,
  users,
  canManage,
  onBack,
}: {
  project: OverviewProject;
  users: OverviewUser[];
  canManage: boolean;
  onBack: () => void;
}) {
  const queryClient = useQueryClient();
  const [deleteTarget, setDeleteTarget] = useState<{ id: string; title: string } | null>(null);
  const action = useMutation({
    mutationFn: ({ id, type }: { id: string; type: 'approve' | 'delete' }) =>
      commercialRequest(
        `/annotations/${id}`,
        type === 'delete'
          ? { method: 'DELETE' }
          : { method: 'PATCH', body: JSON.stringify({ status: 'RESOLVED' }) },
      ),
    onSuccess: async () => {
      setDeleteTarget(null);
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['commercial-overview'] }),
        queryClient.invalidateQueries({ queryKey: ['commercial-reports', project.id] }),
      ]);
    },
  });
  const [editor, setEditor] = useState<EditorState | null>(null);
  const [filter, setFilter] = useState<'ALL' | AnnotationStatus>('ALL');
  const [query, setQuery] = useState('');
  const [debouncedQuery, setDebouncedQuery] = useState('');
  const [page, setPage] = useState(1);
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
    setEditor(null);
    const linkedQuery =
      new URLSearchParams(window.location.search).get('query')?.slice(0, 200) ?? '';
    setFilter('ALL');
    setQuery(linkedQuery);
    setDebouncedQuery(linkedQuery);
    setPage(1);
    setPreviewScreenshot(null);
  }, [project?.id]);

  useEffect(() => {
    const timer = window.setTimeout(() => setDebouncedQuery(query.trim()), 250);
    return () => window.clearTimeout(timer);
  }, [query]);

  useEffect(() => setPage(1), [debouncedQuery, filter]);

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
      <section className="project-details-page" aria-label="项目详情">
        <header>
          <Button type="button" variant="ghost" className="project-details-back" onClick={onBack}>
            <ArrowLeft />
            返回项目列表
          </Button>
          <div className="project-details-heading">
            <h1>{project.name}</h1>
            <div className="project-heading-line">
              <Badge variant="secondary">{project.category}</Badge>
              <span>{annotations.data?.total ?? project.annotationCount} 条标注</span>
            </div>
          </div>
          <div className="project-url-line">
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
          </div>
        </header>
        <ReadAuthorization key={project.id} projectId={project.id} />
        <div className="project-details-toolbar">
          <Label className="project-details-search">
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
        {action.error instanceof Error && !deleteTarget && (
          <Alert variant="destructive">
            <AlertDescription>{action.error.message}</AlertDescription>
          </Alert>
        )}
        <div className="project-annotations-list">
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
                  <span className="annotation-reference-code">{annotation.referenceCode}</span>
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
                  {(annotation.status === 'OPEN' || annotation.status === 'FIX_FAILED') && (
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => setEditor({ mode: 'reject', annotation })}
                    >
                      驳回
                    </Button>
                  )}
                  {annotation.status !== 'RESOLVED' && (
                    <Button
                      size="sm"
                      variant="outline"
                      disabled={action.isPending}
                      onClick={() => action.mutate({ id: annotation.id, type: 'approve' })}
                    >
                      通过
                    </Button>
                  )}
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button size="icon-sm" variant="ghost" aria-label="更多操作" title="更多操作">
                        <MoreHorizontal />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      <DropdownMenuItem onSelect={() => setEditor({ mode: 'edit', annotation })}>
                        <Pencil />
                        编辑
                      </DropdownMenuItem>
                      <DropdownMenuItem
                        className="text-destructive focus:text-destructive"
                        disabled={action.isPending}
                        onSelect={() => {
                          action.reset();
                          setDeleteTarget({ id: annotation.id, title: annotation.title });
                        }}
                      >
                        <Trash2 />
                        删除
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </div>
              )}
            </Card>
          ))}
        </div>
        {annotations.data && annotations.data.total > annotations.data.pageSize && (
          <div className="project-annotations-pagination">
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
      </section>
      <AlertDialog
        open={Boolean(deleteTarget)}
        onOpenChange={(open) => {
          if (!open && !action.isPending) setDeleteTarget(null);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>删除标注？</AlertDialogTitle>
            <AlertDialogDescription>
              将永久删除“{deleteTarget?.title}”及其处理记录，此操作无法撤销。
            </AlertDialogDescription>
          </AlertDialogHeader>
          {action.error instanceof Error && (
            <Alert variant="destructive">
              <AlertDescription>{action.error.message}</AlertDescription>
            </Alert>
          )}
          <AlertDialogFooter>
            <AlertDialogCancel disabled={action.isPending}>取消</AlertDialogCancel>
            <Button
              variant="destructive"
              disabled={action.isPending || !deleteTarget}
              onClick={() => {
                if (deleteTarget) action.mutate({ id: deleteTarget.id, type: 'delete' });
              }}
            >
              {action.isPending ? '正在删除…' : '确认删除'}
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
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
