import { Avatar, AvatarFallback } from '@markfix/ui';
import { useEffect, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Alert, AlertDescription, Button, MarkFixLogo, MarkFixMark } from '@markfix/ui';
import { FolderKanban, LayoutDashboard, LogOut, Users } from '@markfix/ui/icons';
import { adminApi, commercialRequest } from './api';
import { OverviewView } from './OverviewView';
import { ProjectsView } from './ProjectsView';
import { UsersView } from './UsersView';
import { ProjectDrawer } from './components/ProjectDrawer';
import {
  type AdminView,
  type CommercialBootstrap,
  type CommercialOverview,
  type OverviewProject,
} from './model';
import './admin.css';

const viewPresentation: Record<AdminView, { title: string; description: string }> = {
  overview: { title: '项目概览', description: '查看项目、标注与团队的最新状态。' },
  projects: { title: '标注项目', description: '集中查看每个网站的反馈与处理进度。' },
  users: { title: '团队成员', description: '管理成员与他们参与的项目。' },
};

export function AdminApp() {
  const queryClient = useQueryClient();
  const pathView = window.location.pathname.split('/')[2];
  const [view, setView] = useState<AdminView>(
    pathView === 'projects' || pathView === 'users' ? pathView : 'overview',
  );
  const [selectedProject, setSelectedProject] = useState<OverviewProject | null>(null);
  const bootstrap = useQuery({
    queryKey: ['commercial-bootstrap'],
    queryFn: () => commercialRequest<CommercialBootstrap>('/bootstrap'),
    retry: false,
    staleTime: 5 * 60_000,
  });
  const bootstrapData = bootstrap.data;
  const overview = useQuery({
    queryKey: ['commercial-overview'],
    queryFn: () => commercialRequest<CommercialOverview>('/overview'),
    enabled: Boolean(bootstrapData),
    retry: false,
    staleTime: 30_000,
    initialData: () => {
      if (!bootstrapData) return undefined;
      return bootstrapData.overview;
    },
    initialDataUpdatedAt: () => queryClient.getQueryState(['commercial-bootstrap'])?.dataUpdatedAt,
  });

  useEffect(() => {
    if (bootstrap.error) window.location.replace('/login');
  }, [bootstrap.error]);

  const activeProject = selectedProject
    ? (overview.data?.projects.find((project) => project.id === selectedProject.id) ??
      selectedProject)
    : null;
  const page = viewPresentation[view];
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
          <MarkFixLogo className="admin-brand-logo-full" />
          <MarkFixMark className="admin-brand-logo-compact" />
        </a>
        <nav className="admin-nav">
          <a href="/agent">Agent 接入</a>
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
          <Avatar className="user-symbol">
            <AvatarFallback className="bg-transparent text-inherit">
              {bootstrap.data?.user.displayName.slice(0, 1) ?? 'M'}
            </AvatarFallback>
          </Avatar>
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
        <header className="admin-page-header">
          <div>
            <span>MARKFIX</span>
            <h1>{page.title}</h1>
            <p>{page.description}</p>
          </div>
        </header>
        {overview.isPending && <div className="admin-loading">正在汇总项目数据…</div>}
        {overview.error instanceof Error && (
          <Alert variant="destructive">
            <AlertDescription>{overview.error.message}</AlertDescription>
          </Alert>
        )}
        {overview.data && view === 'overview' && (
          <OverviewView overview={overview.data} onProject={setSelectedProject} />
        )}
        {overview.data && view === 'projects' && (
          <ProjectsView projects={overview.data.projects} onProject={setSelectedProject} />
        )}
        {overview.data && view === 'users' && (
          <UsersView users={overview.data.users} projects={overview.data.projects} />
        )}
      </main>
      <ProjectDrawer
        project={activeProject}
        users={(overview.data?.users ?? []).filter(
          (user) => activeProject && user.projectIds?.includes(activeProject.id),
        )}
        canManage={activeProject?.role === 'OWNER' || activeProject?.role === 'ADMIN'}
        onClose={() => setSelectedProject(null)}
      />
    </div>
  );
}
