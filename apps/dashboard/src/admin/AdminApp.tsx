import { useEffect, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import {
  Alert,
  AlertDescription,
  Button,
  MarkFixLogo,
  MarkFixMark,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@markfix/ui';
import { FolderKanban, LayoutDashboard, LogOut, Users } from '@markfix/ui/icons';
import { adminApi, commercialRequest } from './api';
import { OverviewView, ProjectDrawer, ProjectsView, UsersView } from './AdminViews';
import {
  type AdminView,
  type CommercialBootstrap,
  type CommercialOverview,
  type OverviewProject,
} from './model';
import './admin.css';

export function AdminApp() {
  const queryClient = useQueryClient();
  const pathView = window.location.pathname.split('/')[2];
  const [view, setView] = useState<AdminView>(
    pathView === 'projects' || pathView === 'users' ? pathView : 'overview',
  );
  const [workspaceId, setWorkspaceId] = useState<string>();
  const [selectedProject, setSelectedProject] = useState<OverviewProject | null>(null);
  const bootstrap = useQuery({
    queryKey: ['commercial-bootstrap'],
    queryFn: () => commercialRequest<CommercialBootstrap>('/bootstrap'),
    retry: false,
    staleTime: 5 * 60_000,
  });
  const bootstrapData = bootstrap.data;
  const activeWorkspaceId = workspaceId ?? bootstrapData?.workspaceId;
  const overview = useQuery({
    queryKey: ['commercial-overview', activeWorkspaceId],
    queryFn: () =>
      commercialRequest<CommercialOverview>(`/workspaces/${activeWorkspaceId}/overview`),
    enabled: Boolean(activeWorkspaceId),
    retry: false,
    staleTime: 30_000,
    initialData: () => {
      if (!bootstrapData || bootstrapData.workspaceId !== activeWorkspaceId) return undefined;
      return bootstrapData.overview;
    },
    initialDataUpdatedAt: () => queryClient.getQueryState(['commercial-bootstrap'])?.dataUpdatedAt,
  });

  useEffect(() => {
    if (bootstrap.error) window.location.replace('/login');
  }, [bootstrap.error]);

  const currentWorkspace = bootstrap.data?.workspaces.find(
    (workspace) => workspace.id === activeWorkspaceId,
  );
  const canManage = currentWorkspace?.role === 'OWNER' || currentWorkspace?.role === 'ADMIN';
  const activeProject = selectedProject
    ? (overview.data?.projects.find((project) => project.id === selectedProject.id) ??
      selectedProject)
    : null;
  const navigate = (next: AdminView) => {
    setView(next);
    window.history.replaceState({}, '', next === 'overview' ? '/app' : `/app/${next}`);
  };

  if (bootstrap.isPending)
    return <main className="admin-loading-page">正在打开 MarkFix 管理后台…</main>;

  return (
    <div className="admin-shell">
      <aside className="admin-sidebar">
        <a className="admin-brand" href="/">
          <MarkFixLogo className="admin-brand-logo-full" variant="reversed" />
          <MarkFixMark className="admin-brand-logo-compact" />
        </a>
        <div className="admin-workspace-label">工作区</div>
        <Select
          value={activeWorkspaceId ?? ''}
          onValueChange={(value) => {
            setWorkspaceId(value);
            setSelectedProject(null);
          }}
        >
          <SelectTrigger aria-label="选择工作区" className="admin-workspace-select">
            <SelectValue placeholder="选择工作区" />
          </SelectTrigger>
          <SelectContent>
            {(bootstrap.data?.workspaces ?? []).map((workspace) => (
              <SelectItem key={workspace.id} value={workspace.id}>
                {workspace.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
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
          <span className="user-symbol">{bootstrap.data?.user.displayName.slice(0, 1) ?? 'M'}</span>
          <span>
            <strong>{bootstrap.data?.user.displayName ?? 'MarkFix 用户'}</strong>
            <small>{bootstrap.data?.user.email ?? ''}</small>
          </span>
          <a className="admin-profile-settings" href="/account">
            账户
          </a>
          <Button
            size="icon-sm"
            variant="ghost"
            title="退出登录"
            onClick={() =>
              void adminApi.logout().finally(() => {
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
        {overview.data && activeWorkspaceId && view === 'users' && (
          <UsersView
            users={overview.data.users}
            workspaceId={activeWorkspaceId}
            canManage={canManage}
          />
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
