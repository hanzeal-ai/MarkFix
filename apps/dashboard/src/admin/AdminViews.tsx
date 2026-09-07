import { useState, type ComponentType, type CSSProperties } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import {
  ChevronRight,
  CircleDot,
  Clock3,
  Copy,
  FolderKanban,
  MessageSquareText,
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
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
  toast,
} from '@markfix/ui';
import './admin.css';
import { adminApi as api } from './api';
import { EmptyState } from './components/AdminState';
import {
  projectProgress,
  type CommercialOverview,
  type OverviewProject,
  type OverviewUser,
} from './model';

export { ProjectDrawer } from './components/ProjectDrawer';

function ProjectLogo({ project }: { project: OverviewProject }) {
  const faviconUrl = project.baseUrl ? new URL('/favicon.ico', project.baseUrl).href : null;
  const [failedUrl, setFailedUrl] = useState<string | null>(null);
  const showFavicon = faviconUrl && faviconUrl !== failedUrl;

  return (
    <span className="project-symbol" aria-hidden="true">
      {showFavicon ? (
        <img src={faviconUrl} alt="" onError={() => setFailedUrl(faviconUrl)} />
      ) : (
        <MessageSquareText />
      )}
    </span>
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
                <Button
                  type="button"
                  variant="ghost"
                  key={project.id}
                  onClick={() => onProject(project)}
                >
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
                </Button>
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
              <Button
                type="button"
                variant="ghost"
                className="dimension-row"
                key={project.id}
                onClick={() => onProject(project)}
              >
                <ProjectLogo project={project} />
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
              </Button>
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
  canManage,
  onProject,
}: {
  projects: OverviewProject[];
  memberCount: number;
  canManage: boolean;
  onProject: (project: OverviewProject) => void;
}) {
  const queryClient = useQueryClient();
  const [query, setQuery] = useState('');
  const [category, setCategory] = useState('ALL');
  const [deleteTarget, setDeleteTarget] = useState<OverviewProject | null>(null);
  const deletion = useMutation({
    mutationFn: (projectId: string) => api.deleteProject(projectId),
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['commercial-bootstrap'] }),
        queryClient.invalidateQueries({ queryKey: ['commercial-overview'] }),
      ]);
      setDeleteTarget(null);
      toast.success('项目已删除');
    },
    onError: (error) => {
      toast.error(error instanceof Error ? error.message : '删除项目失败');
    },
  });
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
          <Select value={category} onValueChange={setCategory}>
            <SelectTrigger aria-label="项目分类筛选">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="ALL">全部分类</SelectItem>
              {categories.map((item) => (
                <SelectItem key={item} value={item}>
                  {item}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>
      <section className="projects-grid">
        {visible.map((project) => (
          <Card className="project-card" key={project.id}>
            <Button
              type="button"
              variant="ghost"
              className="project-card-open"
              onClick={() => onProject(project)}
            >
              <div className="project-card-top">
                <ProjectLogo project={project} />
                <Badge variant="secondary">{project.category}</Badge>
                <ChevronRight className="project-card-chevron" />
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
            </Button>
            {canManage && (
              <Button
                type="button"
                size="icon-sm"
                variant="ghost"
                className="project-delete-trigger"
                title={`删除${project.name}`}
                aria-label={`删除${project.name}`}
                onClick={() => setDeleteTarget(project)}
              >
                <Trash2 />
              </Button>
            )}
          </Card>
        ))}
      </section>
      {!visible.length && <EmptyState icon={FolderKanban} title="没有找到项目" />}
      <AlertDialog
        open={Boolean(deleteTarget)}
        onOpenChange={(open) => !open && !deletion.isPending && setDeleteTarget(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>删除“{deleteTarget?.name}”？</AlertDialogTitle>
            <AlertDialogDescription>
              项目、标注记录和截图将被永久删除，此操作无法撤销。
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deletion.isPending}>取消</AlertDialogCancel>
            <AlertDialogAction
              className="project-delete-confirm"
              disabled={deletion.isPending}
              onClick={(event) => {
                event.preventDefault();
                if (deleteTarget) deletion.mutate(deleteTarget.id);
              }}
            >
              {deletion.isPending ? '正在删除…' : '确认删除'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
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
