import { useEffect, useState, type ComponentType, type CSSProperties } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  ChevronRight,
  CircleDot,
  Clock3,
  Copy,
  Filter,
  FolderKanban,
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
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
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
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from '@markfix/ui';
import './admin.css';
import { adminApi as api, commercialRequest } from './api';
import { EmptyState, StatusBadge } from './components/AdminState';
import { AnnotationEditor } from './components/AnnotationEditor';
import {
  formatDate,
  kindText,
  projectProgress,
  statusText,
  type AnnotationStatus,
  type CommercialOverview,
  type EditorState,
  type ManagedAnnotation,
  type OverviewProject,
  type OverviewUser,
  type PaginatedAnnotations,
} from './model';

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
  const [pendingDelete, setPendingDelete] = useState<ManagedAnnotation | null>(null);
  const [filter, setFilter] = useState<'ALL' | AnnotationStatus>('ALL');
  const [query, setQuery] = useState('');
  const [debouncedQuery, setDebouncedQuery] = useState('');
  const [page, setPage] = useState(1);
  const [category, setCategory] = useState(project?.category ?? '');
  const annotations = useQuery({
    queryKey: ['managed-annotations', project?.id, filter, debouncedQuery, page],
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
    setPendingDelete(null);
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
      queryKey: ['managed-annotations', project.id, filter, debouncedQuery, nextPage],
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
                        {!annotation.sourceReportId && (
                          <Button
                            size="icon-sm"
                            variant="ghost"
                            className="delete-action"
                            title="删除"
                            onClick={() => setPendingDelete(annotation)}
                          >
                            <Trash2 />
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
      <AlertDialog
        open={Boolean(pendingDelete)}
        onOpenChange={(open) => {
          if (!open) setPendingDelete(null);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>删除这条标注？</AlertDialogTitle>
            <AlertDialogDescription>
              {pendingDelete ? `“${pendingDelete.title}”删除后无法恢复。` : '删除后无法恢复。'}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>取消</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-white hover:bg-destructive/90"
              disabled={remove.isPending}
              onClick={() => {
                if (!pendingDelete) return;
                remove.mutate(pendingDelete.id);
                setPendingDelete(null);
              }}
            >
              删除
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
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

export function OverviewView({
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

export function ProjectsView({
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

export function UsersView({
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
