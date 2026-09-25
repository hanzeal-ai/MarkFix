import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  Avatar,
  AvatarFallback,
} from '@markfix/ui';
import { useEffect, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Alert, AlertDescription, Button, MarkFixLogo, MarkFixMark } from '@markfix/ui';
import { FolderKanban, LayoutDashboard, LogOut, Settings2, Users } from '@markfix/ui/icons';
import { adminApi, commercialRequest } from './api';
import { OverviewView } from './OverviewView';
import { ProjectsView } from './ProjectsView';
import { UsersView } from './UsersView';
import { ProjectDetailsPage } from './components/ProjectDetailsPage';
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
  const [pathname, setPathname] = useState(window.location.pathname);
  const [, , pathView, projectId] = pathname.split('/');
  const view: AdminView = pathView === 'projects' || pathView === 'users' ? pathView : 'overview';
  const detailProjectId = view === 'projects' ? projectId : undefined;
  useEffect(() => {
    const onPopState = () => setPathname(window.location.pathname);
    window.addEventListener('popstate', onPopState);
    return () => window.removeEventListener('popstate', onPopState);
  }, []);
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
    if (bootstrap.error)
      window.location.replace(
        '/login?next=' + encodeURIComponent(window.location.pathname + window.location.search),
      );
  }, [bootstrap.error]);

  const activeProject = overview.data?.projects.find((project) => project.id === detailProjectId);
  const page = viewPresentation[view];
  const navigatePath = (path: string) => {
    if (window.location.pathname !== path) window.history.pushState({}, '', path);
    setPathname(path);
  };
  const navigate = (next: AdminView) => navigatePath(next === 'overview' ? '/app' : `/app/${next}`);
  const openProject = (project: OverviewProject) =>
    navigatePath(`/app/projects/${encodeURIComponent(project.id)}`);

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
            标注项目
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
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" className="admin-profile-trigger" aria-label="个人中心">
                <Avatar className="user-symbol">
                  <AvatarFallback className="bg-transparent text-inherit">
                    {bootstrap.data?.user.displayName.slice(0, 1) ?? 'M'}
                  </AvatarFallback>
                </Avatar>
                <span className="admin-profile-identity">
                  <strong>{bootstrap.data?.user.displayName ?? 'MarkFix 用户'}</strong>
                  <small>{bootstrap.data?.user.email ?? ''}</small>
                </span>
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent side="top" align="start">
              <DropdownMenuItem asChild>
                <a href="/account">
                  <Settings2 />
                  设置
                </a>
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem
                onSelect={() =>
                  void adminApi.logout().finally(() => {
                    queryClient.clear();
                    window.location.assign('/login');
                  })
                }
              >
                <LogOut />
                退出登录
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </aside>

      <main className="admin-main">
        {!detailProjectId && (
          <header className="admin-page-header">
            <div>
              <span>MARKFIX</span>
              <h1>{page.title}</h1>
              <p>{page.description}</p>
            </div>
          </header>
        )}
        {overview.isPending && <div className="admin-loading">正在汇总项目数据…</div>}
        {overview.error instanceof Error && (
          <Alert variant="destructive">
            <AlertDescription>{overview.error.message}</AlertDescription>
          </Alert>
        )}
        {overview.data && !detailProjectId && view === 'overview' && (
          <OverviewView overview={overview.data} onProject={openProject} />
        )}
        {overview.data && !detailProjectId && view === 'projects' && (
          <ProjectsView projects={overview.data.projects} onProject={openProject} />
        )}
        {overview.data && view === 'users' && (
          <UsersView users={overview.data.users} projects={overview.data.projects} />
        )}
        {detailProjectId && activeProject && (
          <ProjectDetailsPage
            key={activeProject.id}
            project={activeProject}
            users={(overview.data?.users ?? []).filter((user) =>
              user.projectIds?.includes(activeProject.id),
            )}
            canManage={activeProject.role === 'OWNER' || activeProject.role === 'ADMIN'}
            onBack={() => navigate('projects')}
          />
        )}
        {detailProjectId && overview.data && !activeProject && (
          <Alert>
            <AlertDescription>项目不存在或你无权访问。</AlertDescription>
            <Button variant="link" onClick={() => navigate('projects')}>
              返回项目列表
            </Button>
          </Alert>
        )}
      </main>
    </div>
  );
}
