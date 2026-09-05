import { useEffect, useMemo, useState, type ComponentType, type CSSProperties } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { MarkFixApi } from '@markfix/api-client';
import {
  ArrowUpRight,
  ChevronRight,
  CircleDot,
  Clock3,
  Copy,
  ExternalLink,
  Filter,
  FolderKanban,
  LayoutDashboard,
  LogOut,
  MessageSquareText,
  Pencil,
  Plus,
  Search,
  Trash2,
  Users,
} from '@markfix/ui/icons';
import {
  Alert,
  AlertDescription,
  Badge,
  Button,
  Card,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  Input,
  Label,
  NativeSelect,
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
  Textarea,
} from '@markfix/ui';
import './admin.css';

const apiBaseUrl = import.meta.env.VITE_API_URL ?? 'http://localhost:4310';
const api = new MarkFixApi(apiBaseUrl);

type AdminView = 'overview' | 'projects' | 'users';
type AnnotationStatus = 'OPEN' | 'IN_REVIEW' | 'RESOLVED' | 'REJECTED';
type AnnotationKind = 'ELEMENT' | 'SCREENSHOT' | 'COMMENT';

type ManagedAnnotation = {
  id: string;
  sourceReportId: string | null;
  projectId: string;
  authorId: string | null;
  author: { id: string; displayName: string; email: string } | null;
  title: string;
  note: string;
  kind: AnnotationKind;
  pageUrl: string;
  status: AnnotationStatus;
  rejectionReason: string | null;
  createdAt: string;
  updatedAt: string;
};

type OverviewProject = {
  id: string;
  workspaceId: string;
  name: string;
  baseUrl: string | null;
  category: string;
  annotationCount: number;
  pendingCount: number;
  rejectedCount: number;
  resolvedCount: number;
  createdAt: string;
  updatedAt: string;
};

type OverviewUser = {
  id: string;
  displayName: string;
  email: string;
  role: string;
  annotationCount: number;
  rejectedCount: number;
  projectCategories: Array<{ category: string; count: number }>;
};

type CommercialOverview = {
  metrics: { projects: number; annotations: number; pending: number; rejected: number };
  projects: OverviewProject[];
  users: OverviewUser[];
};

type EditorState =
  | { mode: 'create'; annotation?: undefined }
  | { mode: 'view' | 'edit' | 'reject'; annotation: ManagedAnnotation };

const statusText: Record<AnnotationStatus, string> = {
  OPEN: '待处理',
  IN_REVIEW: '处理中',
  RESOLVED: '已解决',
  REJECTED: '已驳回',
};

const kindText: Record<AnnotationKind, string> = {
  ELEMENT: '元素标注',
  SCREENSHOT: '截图标注',
  COMMENT: '文字批注',
};

const viewTitles: Record<AdminView, string> = {
  overview: '统计总览',
  projects: '标注项目',
  users: '用户管理',
};

async function commercialRequest<T>(
  path: string,
  init?: RequestInit,
  retryAfterRefresh = true,
): Promise<T> {
  const response = await fetch(`${apiBaseUrl}/v1/commercial${path}`, {
    ...init,
    credentials: 'include',
    headers: { 'content-type': 'application/json', ...init?.headers },
  });
  if (response.status === 401 && retryAfterRefresh) {
    await api.me();
    return commercialRequest(path, init, false);
  }
  if (!response.ok) {
    const payload = (await response.json().catch(() => ({}))) as { message?: string | string[] };
    const message = Array.isArray(payload.message) ? payload.message[0] : payload.message;
    throw new Error(message ?? `请求失败（${response.status}）`);
  }
  return response.json() as Promise<T>;
}

const formatDate = (value: string) =>
  new Intl.DateTimeFormat('zh-CN', {
    month: 'numeric',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(value));

const projectProgress = (project: OverviewProject) =>
  project.annotationCount ? Math.round((project.resolvedCount / project.annotationCount) * 100) : 0;

function StatusBadge({ status }: { status: AnnotationStatus }) {
  return (
    <Badge className={`annotation-status status-${status.toLowerCase()}`}>
      {statusText[status]}
    </Badge>
  );
}

function EmptyState({
  icon: Icon,
  title,
  description,
}: {
  icon: typeof CircleDot;
  title: string;
  description?: string;
}) {
  return (
    <div className="admin-empty">
      <Icon />
      <strong>{title}</strong>
      {description && <p>{description}</p>}
    </div>
  );
}

function AnnotationEditor({
  state,
  project,
  users,
  onClose,
}: {
  state: EditorState | null;
  project: OverviewProject;
  users: OverviewUser[];
  onClose: () => void;
}) {
  const queryClient = useQueryClient();
  const annotation = state?.annotation;
  const [title, setTitle] = useState('');
  const [note, setNote] = useState('');
  const [kind, setKind] = useState<AnnotationKind>('ELEMENT');
  const [pageUrl, setPageUrl] = useState(project.baseUrl ?? 'https://');
  const [authorId, setAuthorId] = useState('');
  const [status, setStatus] = useState<Exclude<AnnotationStatus, 'REJECTED'>>('OPEN');
  const [reason, setReason] = useState('');

  useEffect(() => {
    setTitle(annotation?.title ?? '');
    setNote(annotation?.note ?? '');
    setKind(annotation?.kind ?? 'ELEMENT');
    setPageUrl(annotation?.pageUrl ?? project.baseUrl ?? 'https://');
    setAuthorId(annotation?.authorId ?? '');
    setStatus(annotation?.status === 'REJECTED' ? 'OPEN' : (annotation?.status ?? 'OPEN'));
    setReason(annotation?.rejectionReason ?? '');
  }, [annotation, project.baseUrl, state?.mode]);

  const save = useMutation({
    mutationFn: async () => {
      if (!state) return;
      if (state.mode === 'reject') {
        return commercialRequest(`/annotations/${state.annotation.id}/reject`, {
          method: 'POST',
          body: JSON.stringify({ reason }),
        });
      }
      const payload = {
        title,
        note,
        kind,
        pageUrl,
        ...(authorId ? { authorId } : {}),
        ...(state.mode === 'edit' ? { status } : {}),
      };
      if (state.mode === 'create') {
        return commercialRequest(`/projects/${project.id}/annotations`, {
          method: 'POST',
          body: JSON.stringify(payload),
        });
      }
      return commercialRequest(`/annotations/${state.annotation.id}`, {
        method: 'PATCH',
        body: JSON.stringify(payload),
      });
    },
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['commercial-overview', project.workspaceId] }),
        queryClient.invalidateQueries({ queryKey: ['managed-annotations', project.id] }),
      ]);
      onClose();
    },
  });

  if (!state) return null;
  const readOnly = state.mode === 'view';
  const rejecting = state.mode === 'reject';
  const dialogTitle =
    state.mode === 'create'
      ? '新增标注'
      : state.mode === 'edit'
        ? '编辑标注'
        : rejecting
          ? '驳回标注'
          : '标注详情';

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="annotation-dialog">
        <DialogHeader>
          <DialogTitle>{dialogTitle}</DialogTitle>
          <DialogDescription>
            {rejecting
              ? '说明驳回原因，提交人将在记录中看到这条说明。'
              : `${project.name} · ${project.category}`}
          </DialogDescription>
        </DialogHeader>

        {readOnly ? (
          <div className="annotation-detail-grid">
            <div className="annotation-detail-title">
              <div className="annotation-detail-badges">
                <StatusBadge status={state.annotation.status} />
                <Badge variant="secondary">{kindText[state.annotation.kind]}</Badge>
              </div>
              <h3>{state.annotation.title}</h3>
            </div>
            <section className="annotation-detail-section">
              <h4>标注内容</h4>
              <p className="annotation-detail-note">{state.annotation.note}</p>
            </section>
            <section className="annotation-detail-section">
              <h4>定位信息</h4>
              <a href={state.annotation.pageUrl} target="_blank" rel="noreferrer">
                {state.annotation.pageUrl}
                <ExternalLink />
              </a>
            </section>
            <section className="annotation-detail-section">
              <h4>记录信息</h4>
              <dl>
                <div>
                  <dt>项目</dt>
                  <dd>{project.name}</dd>
                </div>
                <div>
                  <dt>项目分类</dt>
                  <dd>{project.category}</dd>
                </div>
                <div>
                  <dt>提交人</dt>
                  <dd>
                    {state.annotation.author?.displayName ?? '未知成员'}
                    {state.annotation.author?.email && (
                      <small>{state.annotation.author.email}</small>
                    )}
                  </dd>
                </div>
                <div>
                  <dt>创建时间</dt>
                  <dd>{formatDate(state.annotation.createdAt)}</dd>
                </div>
                <div>
                  <dt>更新时间</dt>
                  <dd>{formatDate(state.annotation.updatedAt)}</dd>
                </div>
              </dl>
            </section>
            {state.annotation.rejectionReason && (
              <section className="annotation-detail-section rejection-detail">
                <h4>驳回原因</h4>
                <p>{state.annotation.rejectionReason}</p>
              </section>
            )}
            <Button variant="outline" onClick={onClose}>
              关闭
            </Button>
          </div>
        ) : (
          <form
            className="annotation-form"
            onSubmit={(event) => {
              event.preventDefault();
              save.mutate();
            }}
          >
            {rejecting ? (
              <Label>
                驳回原因
                <Textarea
                  required
                  minLength={3}
                  maxLength={1000}
                  value={reason}
                  onChange={(event) => setReason(event.target.value)}
                  placeholder="说明为什么暂不采纳这条标注"
                />
              </Label>
            ) : (
              <>
                <Label>
                  标注标题
                  <Input
                    required
                    maxLength={160}
                    value={title}
                    onChange={(event) => setTitle(event.target.value)}
                    placeholder="简要说明页面问题"
                  />
                </Label>
                <Label>
                  详细说明
                  <Textarea
                    required
                    maxLength={4000}
                    value={note}
                    onChange={(event) => setNote(event.target.value)}
                    placeholder="补充预期结果或处理建议"
                  />
                </Label>
                <div className="annotation-form-row">
                  <Label>
                    标注类型
                    <NativeSelect
                      value={kind}
                      disabled={Boolean(annotation?.sourceReportId)}
                      onChange={(event) => setKind(event.target.value as AnnotationKind)}
                    >
                      {Object.entries(kindText).map(([value, label]) => (
                        <option key={value} value={value}>
                          {label}
                        </option>
                      ))}
                    </NativeSelect>
                  </Label>
                  <Label>
                    提交人
                    <NativeSelect
                      value={authorId}
                      onChange={(event) => setAuthorId(event.target.value)}
                    >
                      <option value="">当前用户</option>
                      {users.map((user) => (
                        <option key={user.id} value={user.id}>
                          {user.displayName}
                        </option>
                      ))}
                    </NativeSelect>
                  </Label>
                </div>
                {state.mode === 'edit' && (
                  <Label>
                    处理状态
                    <NativeSelect
                      value={status}
                      onChange={(event) =>
                        setStatus(event.target.value as Exclude<AnnotationStatus, 'REJECTED'>)
                      }
                    >
                      <option value="OPEN">待处理</option>
                      <option value="IN_REVIEW">处理中</option>
                      <option value="RESOLVED">已解决</option>
                    </NativeSelect>
                  </Label>
                )}
                <Label>
                  页面地址
                  <Input
                    required
                    type="url"
                    value={pageUrl}
                    onChange={(event) => setPageUrl(event.target.value)}
                  />
                </Label>
              </>
            )}
            {save.error instanceof Error && (
              <Alert variant="destructive">
                <AlertDescription>{save.error.message}</AlertDescription>
              </Alert>
            )}
            <div className="dialog-actions">
              <Button type="button" variant="outline" onClick={onClose}>
                取消
              </Button>
              <Button
                type="submit"
                variant={rejecting ? 'destructive' : 'default'}
                disabled={save.isPending}
              >
                {save.isPending ? '正在保存…' : rejecting ? '确认驳回' : '保存标注'}
              </Button>
            </div>
          </form>
        )}
      </DialogContent>
    </Dialog>
  );
}

function ProjectDrawer({
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
  const [category, setCategory] = useState(project?.category ?? '');
  const annotations = useQuery({
    queryKey: ['managed-annotations', project?.id],
    queryFn: () => commercialRequest<ManagedAnnotation[]>(`/projects/${project?.id}/annotations`),
    enabled: Boolean(project),
  });

  useEffect(() => {
    setCategory(project?.category ?? '');
    setEditor(null);
    setFilter('ALL');
    setQuery('');
  }, [project]);

  const updateCategory = useMutation({
    mutationFn: () =>
      commercialRequest(`/projects/${project?.id}/category`, {
        method: 'PATCH',
        body: JSON.stringify({ category }),
      }),
    onSuccess: () =>
      queryClient.invalidateQueries({ queryKey: ['commercial-overview', project?.workspaceId] }),
  });

  const remove = useMutation({
    mutationFn: (annotationId: string) =>
      commercialRequest(`/annotations/${annotationId}`, { method: 'DELETE' }),
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['commercial-overview', project?.workspaceId] }),
        queryClient.invalidateQueries({ queryKey: ['managed-annotations', project?.id] }),
      ]);
    },
  });

  const visibleAnnotations = useMemo(() => {
    const normalized = query.trim().toLocaleLowerCase();
    return (annotations.data ?? []).filter(
      (annotation) =>
        (filter === 'ALL' || annotation.status === filter) &&
        (!normalized ||
          `${annotation.title} ${annotation.note} ${annotation.pageUrl}`
            .toLocaleLowerCase()
            .includes(normalized)),
    );
  }, [annotations.data, filter, query]);

  return (
    <Sheet open={Boolean(project)} onOpenChange={(open) => !open && onClose()}>
      <SheetContent className="project-sheet">
        {project && (
          <>
            <SheetHeader>
              <div className="sheet-heading-line">
                <Badge variant="secondary">{project.category}</Badge>
                <span>{project.annotationCount} 条标注</span>
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
                      {!annotation.sourceReportId && (
                        <Button
                          size="icon-sm"
                          variant="ghost"
                          className="delete-action"
                          title="删除"
                          onClick={() => {
                            if (window.confirm(`确认删除“${annotation.title}”吗？此操作无法撤销。`))
                              remove.mutate(annotation.id);
                          }}
                        >
                          <Trash2 />
                        </Button>
                      )}
                    </div>
                  )}
                </Card>
              ))}
            </div>
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
  );
}

function MetricCard({
  icon: Icon,
  label,
  value,
  tone,
}: {
  icon: ComponentType;
  label: string;
  value: number;
  tone?: string;
}) {
  return (
    <Card className={`metric-card ${tone ?? ''}`}>
      <div className="metric-icon">
        <Icon />
      </div>
      <span>{label}</span>
      <strong>{value}</strong>
    </Card>
  );
}

function OverviewView({
  overview,
  onProject,
}: {
  overview: CommercialOverview;
  onProject: (project: OverviewProject) => void;
}) {
  const total = overview.metrics.annotations;
  const resolved = overview.projects.reduce((sum, project) => sum + project.resolvedCount, 0);
  const pendingShare = total ? (overview.metrics.pending / total) * 100 : 0;
  const resolvedShare = total ? (resolved / total) * 100 : 0;
  const pendingPercent = Math.round(pendingShare);
  const resolvedPercent = Math.round(resolvedShare);
  const rejectedPercent = total ? Math.round((overview.metrics.rejected / total) * 100) : 0;
  const donutStyle = {
    background: total
      ? `conic-gradient(#e2a33b 0 ${pendingShare}%, #5b52e8 ${pendingShare}% ${
          pendingShare + resolvedShare
        }%, #d46055 ${pendingShare + resolvedShare}% 100%)`
      : '#ececf1',
  } satisfies CSSProperties;
  const chartProjects = [...overview.projects]
    .sort((left, right) => right.annotationCount - left.annotationCount)
    .slice(0, 6);

  return (
    <>
      <section className="metrics-grid">
        <MetricCard icon={FolderKanban} label="标注项目" value={overview.metrics.projects} />
        <MetricCard
          icon={MessageSquareText}
          label="全部标注"
          value={overview.metrics.annotations}
        />
        <MetricCard icon={Clock3} label="待处理" value={overview.metrics.pending} tone="warning" />
        <MetricCard
          icon={CircleDot}
          label="已驳回"
          value={overview.metrics.rejected}
          tone="danger"
        />
      </section>

      <section className="overview-charts">
        <Card className="chart-card status-chart">
          <div className="chart-card-header">
            <strong>处理状态</strong>
          </div>
          <div className="status-chart-body">
            <div className="status-donut" style={donutStyle}>
              <span>
                <strong>{total}</strong>
                <small>全部标注</small>
              </span>
            </div>
            <ul className="chart-legend">
              <li>
                <i className="pending" />
                <span>待处理</span>
                <strong>{overview.metrics.pending}</strong>
                <small>{pendingPercent}%</small>
              </li>
              <li>
                <i className="resolved" />
                <span>已解决</span>
                <strong>{resolved}</strong>
                <small>{resolvedPercent}%</small>
              </li>
              <li>
                <i className="rejected" />
                <span>已驳回</span>
                <strong>{overview.metrics.rejected}</strong>
                <small>{rejectedPercent}%</small>
              </li>
            </ul>
          </div>
        </Card>

        <Card className="chart-card project-chart-card">
          <div className="chart-card-header">
            <strong>项目标注量</strong>
            <div className="compact-legend" aria-label="图表图例">
              <span>
                <i className="pending" />
                待处理
              </span>
              <span>
                <i className="resolved" />
                已解决
              </span>
              <span>
                <i className="rejected" />
                已驳回
              </span>
            </div>
          </div>
          <div className="project-bars">
            {chartProjects.map((project) => {
              const divisor = project.annotationCount || 1;
              return (
                <button type="button" key={project.id} onClick={() => onProject(project)}>
                  <span title={project.name}>{project.name}</span>
                  <span
                    className="stacked-bar"
                    aria-label={`${project.name} ${project.annotationCount} 条标注`}
                  >
                    <i
                      className="pending"
                      style={{ width: `${(project.pendingCount / divisor) * 100}%` }}
                    />
                    <i
                      className="resolved"
                      style={{ width: `${(project.resolvedCount / divisor) * 100}%` }}
                    />
                    <i
                      className="rejected"
                      style={{ width: `${(project.rejectedCount / divisor) * 100}%` }}
                    />
                  </span>
                  <strong>{project.annotationCount}</strong>
                </button>
              );
            })}
            {!chartProjects.length && <EmptyState icon={FolderKanban} title="暂无项目数据" />}
          </div>
        </Card>
      </section>

      <Card className="dimension-card">
        <Tabs defaultValue="project">
          <div className="dimension-header">
            <div>
              <strong>标注分布</strong>
            </div>
            <TabsList>
              <TabsTrigger value="project">按项目</TabsTrigger>
              <TabsTrigger value="user">按用户</TabsTrigger>
            </TabsList>
          </div>
          <TabsContent value="project" className="dimension-list">
            {overview.projects.map((project) => (
              <button
                type="button"
                className="dimension-row"
                key={project.id}
                onClick={() => onProject(project)}
              >
                <span className="project-symbol">{project.name.slice(0, 1)}</span>
                <span className="dimension-main">
                  <strong>{project.name}</strong>
                  <small>{project.category}</small>
                </span>
                <span className="dimension-stat">
                  <strong>{project.annotationCount}</strong>
                  <small>标注</small>
                </span>
                <span className="dimension-stat">
                  <strong>{project.pendingCount}</strong>
                  <small>待处理</small>
                </span>
                <span className="dimension-stat is-rejected">
                  <strong>{project.rejectedCount}</strong>
                  <small>已驳回</small>
                </span>
                <span className="progress-cell">
                  <span>
                    <i style={{ width: `${projectProgress(project)}%` }} />
                  </span>
                  <small>{projectProgress(project)}%</small>
                </span>
                <ChevronRight />
              </button>
            ))}
          </TabsContent>
          <TabsContent value="user" className="dimension-list">
            {overview.users.map((user) => (
              <div className="dimension-row user-dimension-row" key={user.id}>
                <span className="user-symbol">{user.displayName.slice(0, 1)}</span>
                <span className="dimension-main">
                  <strong>{user.displayName}</strong>
                  <small>{user.email}</small>
                </span>
                <span className="category-badges">
                  {user.projectCategories.length ? (
                    user.projectCategories.map((item) => (
                      <Badge variant="secondary" key={item.category}>
                        {item.category} · {item.count}
                      </Badge>
                    ))
                  ) : (
                    <small>暂无项目分类</small>
                  )}
                </span>
                <span className="dimension-stat">
                  <strong>{user.annotationCount}</strong>
                  <small>提交标注</small>
                </span>
                <span className="dimension-stat is-rejected">
                  <strong>{user.rejectedCount}</strong>
                  <small>被驳回</small>
                </span>
              </div>
            ))}
          </TabsContent>
        </Tabs>
      </Card>
    </>
  );
}

function ProjectsView({
  projects,
  memberCount,
  onProject,
}: {
  projects: OverviewProject[];
  memberCount: number;
  onProject: (project: OverviewProject) => void;
}) {
  const [query, setQuery] = useState('');
  const [category, setCategory] = useState('ALL');
  const categories = [...new Set(projects.map((project) => project.category))];
  const visible = projects.filter(
    (project) =>
      (category === 'ALL' || project.category === category) &&
      (!query.trim() ||
        `${project.name} ${project.baseUrl ?? ''}`
          .toLocaleLowerCase()
          .includes(query.toLocaleLowerCase())),
  );
  return (
    <>
      <div className="project-toolbar">
        <Label className="admin-search">
          <Search />
          <Input
            placeholder="搜索项目"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
          />
        </Label>
        <div className="filter-control">
          <Filter />
          <NativeSelect
            aria-label="项目分类筛选"
            value={category}
            onChange={(event) => setCategory(event.target.value)}
          >
            <option value="ALL">全部分类</option>
            {categories.map((item) => (
              <option key={item}>{item}</option>
            ))}
          </NativeSelect>
        </div>
      </div>
      <section className="projects-grid">
        {visible.map((project) => (
          <button
            type="button"
            className="project-card"
            key={project.id}
            onClick={() => onProject(project)}
          >
            <div className="project-card-top">
              <span className="project-symbol">{project.name.slice(0, 1)}</span>
              <Badge variant="secondary">{project.category}</Badge>
              <ChevronRight />
            </div>
            <h3>{project.name}</h3>
            <p>{project.baseUrl ?? '尚未设置项目地址'}</p>
            <div className="project-card-stats">
              <span>
                <strong>{project.annotationCount}</strong>全部标注
              </span>
              <span>
                <strong>{project.pendingCount}</strong>待处理
              </span>
              <span className="rejected">
                <strong>{project.rejectedCount}</strong>已驳回
              </span>
              <span>
                <strong>{memberCount}</strong>协作成员
              </span>
            </div>
            <div className="project-progress">
              <div>
                <span>解决进度</span>
                <strong>{projectProgress(project)}%</strong>
              </div>
              <span>
                <i style={{ width: `${projectProgress(project)}%` }} />
              </span>
            </div>
          </button>
        ))}
      </section>
      {!visible.length && <EmptyState icon={FolderKanban} title="没有找到项目" />}
    </>
  );
}

function UsersView({
  users,
  workspaceId,
  canManage,
}: {
  users: OverviewUser[];
  workspaceId: string;
  canManage: boolean;
}) {
  const [query, setQuery] = useState('');
  const [email, setEmail] = useState('');
  const [inviteUrl, setInviteUrl] = useState('');
  const [copied, setCopied] = useState(false);
  const invitation = useMutation({
    mutationFn: () => api.createInvitation(workspaceId, email, 'MEMBER'),
    onSuccess: ({ token }) => {
      setInviteUrl(
        `${window.location.origin}/accept-invitation?token=${encodeURIComponent(token)}`,
      );
      setEmail('');
    },
  });
  const normalized = query.trim().toLocaleLowerCase();
  const visibleUsers = users.filter(
    (user) =>
      !normalized || `${user.displayName} ${user.email}`.toLocaleLowerCase().includes(normalized),
  );

  return (
    <>
      <div className="users-toolbar">
        <Label className="admin-search">
          <Search />
          <Input
            placeholder="搜索用户"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
          />
        </Label>
        {canManage && (
          <form
            onSubmit={(event) => {
              event.preventDefault();
              invitation.mutate();
            }}
          >
            <Input
              aria-label="邀请邮箱"
              placeholder="输入邮箱邀请成员"
              required
              type="email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
            />
            <Button type="submit" disabled={invitation.isPending}>
              <Plus />
              {invitation.isPending ? '正在创建…' : '邀请成员'}
            </Button>
          </form>
        )}
      </div>
      {invitation.error instanceof Error && (
        <Alert variant="destructive">
          <AlertDescription>{invitation.error.message}</AlertDescription>
        </Alert>
      )}
      {inviteUrl && (
        <Alert className="invitation-result">
          <AlertDescription>
            <strong>邀请已创建</strong>
            <span>复制链接发送给成员。</span>
            <span className="invitation-link">
              <Input readOnly value={inviteUrl} />
              <Button
                variant="outline"
                onClick={() => {
                  void navigator.clipboard.writeText(inviteUrl).then(() => setCopied(true));
                }}
              >
                <Copy />
                {copied ? '已复制' : '复制'}
              </Button>
            </span>
          </AlertDescription>
        </Alert>
      )}
      <Card className="users-card">
        <div className="users-table-head">
          <span>用户</span>
          <span>项目分类</span>
          <span>标注</span>
          <span>驳回</span>
        </div>
        {visibleUsers.map((user) => (
          <div className="users-table-row" key={user.id}>
            <span className="user-identity">
              <i>{user.displayName.slice(0, 1)}</i>
              <span>
                <strong>{user.displayName}</strong>
                <small>{user.email}</small>
              </span>
            </span>
            <span className="category-badges">
              {user.projectCategories.length ? (
                user.projectCategories.map((item) => (
                  <Badge variant="secondary" key={item.category}>
                    {item.category}
                  </Badge>
                ))
              ) : (
                <small>暂无分类</small>
              )}
            </span>
            <strong>{user.annotationCount}</strong>
            <strong className={user.rejectedCount ? 'rejected-number' : ''}>
              {user.rejectedCount}
            </strong>
          </div>
        ))}
      </Card>
      {!visibleUsers.length && <EmptyState icon={Users} title="没有找到用户" />}
    </>
  );
}

export function AdminApp() {
  const queryClient = useQueryClient();
  const pathView = window.location.pathname.split('/')[2];
  const [view, setView] = useState<AdminView>(
    pathView === 'projects' || pathView === 'users' ? pathView : 'overview',
  );
  const [workspaceId, setWorkspaceId] = useState<string>();
  const [selectedProject, setSelectedProject] = useState<OverviewProject | null>(null);
  const workspaces = useQuery({
    queryKey: ['admin-workspaces'],
    queryFn: () => api.listWorkspaces(),
    retry: false,
  });
  const currentUser = useQuery({ queryKey: ['admin-me'], queryFn: () => api.me(), retry: false });
  const overview = useQuery({
    queryKey: ['commercial-overview', workspaceId],
    queryFn: () => commercialRequest<CommercialOverview>(`/workspaces/${workspaceId}/overview`),
    enabled: Boolean(workspaceId),
    retry: false,
  });

  useEffect(() => {
    if (workspaces.error) window.location.replace('/login');
  }, [workspaces.error]);

  useEffect(() => {
    if (!workspaces.data?.length) return;
    if (workspaceId && workspaces.data.some((workspace) => workspace.id === workspaceId)) return;
    setWorkspaceId(workspaces.data[0]?.id);
  }, [workspaceId, workspaces.data]);

  const currentWorkspace = workspaces.data?.find((workspace) => workspace.id === workspaceId);
  const canManage = currentWorkspace?.role === 'OWNER' || currentWorkspace?.role === 'ADMIN';
  const pageTitle = viewTitles[view];
  const activeProject = selectedProject
    ? (overview.data?.projects.find((project) => project.id === selectedProject.id) ??
      selectedProject)
    : null;
  const navigate = (next: AdminView) => {
    setView(next);
    window.history.replaceState({}, '', next === 'overview' ? '/app' : `/app/${next}`);
  };

  if (workspaces.isPending || currentUser.isPending)
    return <main className="admin-loading-page">正在打开 MarkFix 管理后台…</main>;

  return (
    <div className="admin-shell">
      <aside className="admin-sidebar">
        <a className="admin-brand" href="/">
          <span>M</span>
          <strong>MarkFix</strong>
        </a>
        <div className="admin-workspace-label">工作区</div>
        <NativeSelect
          value={workspaceId ?? ''}
          onChange={(event) => {
            setWorkspaceId(event.target.value);
            setSelectedProject(null);
          }}
        >
          {(workspaces.data ?? []).map((workspace) => (
            <option key={workspace.id} value={workspace.id}>
              {workspace.name}
            </option>
          ))}
        </NativeSelect>
        <nav className="admin-nav">
          <Button
            variant="ghost"
            className={view === 'overview' ? 'active' : ''}
            onClick={() => navigate('overview')}
          >
            <LayoutDashboard />
            统计总览
          </Button>
          <Button
            variant="ghost"
            className={view === 'projects' ? 'active' : ''}
            onClick={() => navigate('projects')}
          >
            <FolderKanban />
            标注项目{overview.data && <span>{overview.data.metrics.projects}</span>}
          </Button>
          <Button
            variant="ghost"
            className={view === 'users' ? 'active' : ''}
            onClick={() => navigate('users')}
          >
            <Users />
            用户管理
          </Button>
        </nav>
        <div className="admin-profile">
          <span className="user-symbol">{currentUser.data?.displayName.slice(0, 1) ?? 'M'}</span>
          <span>
            <strong>{currentUser.data?.displayName ?? 'MarkFix 用户'}</strong>
            <small>{currentWorkspace?.role ?? 'MEMBER'}</small>
          </span>
          <Button
            size="icon-sm"
            variant="ghost"
            title="退出登录"
            onClick={() =>
              void api.logout().finally(() => {
                queryClient.clear();
                window.location.assign('/login');
              })
            }
          >
            <LogOut />
          </Button>
        </div>
      </aside>

      <main className="admin-main">
        <header className="admin-page-header">
          <div>
            <h1>{pageTitle}</h1>
          </div>
          <div className="admin-header-actions">
            <Badge variant={canManage ? 'default' : 'secondary'}>
              {canManage ? '可管理' : '只读'}
            </Badge>
            <Button variant="outline" onClick={() => overview.refetch()}>
              <ArrowUpRight />
              刷新数据
            </Button>
          </div>
        </header>

        {overview.isPending && <div className="admin-loading">正在汇总工作区数据…</div>}
        {overview.error instanceof Error && (
          <Alert variant="destructive">
            <AlertDescription>{overview.error.message}</AlertDescription>
          </Alert>
        )}
        {overview.data && view === 'overview' && (
          <OverviewView overview={overview.data} onProject={setSelectedProject} />
        )}
        {overview.data && view === 'projects' && (
          <ProjectsView
            projects={overview.data.projects}
            memberCount={overview.data.users.length}
            onProject={setSelectedProject}
          />
        )}
        {overview.data && workspaceId && view === 'users' && (
          <UsersView users={overview.data.users} workspaceId={workspaceId} canManage={canManage} />
        )}
      </main>

      <ProjectDrawer
        project={activeProject}
        users={overview.data?.users ?? []}
        canManage={canManage}
        onClose={() => setSelectedProject(null)}
      />
    </div>
  );
}
