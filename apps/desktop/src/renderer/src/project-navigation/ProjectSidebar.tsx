import type { WebsiteProject } from '@markfix/contracts';
import {
  Avatar,
  AvatarFallback,
  Button,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuShortcut,
  DropdownMenuTrigger,
  toast,
} from '@markfix/ui';
import { CircleHelp, Gift, History, LogOut, Plus, Settings2, Trash2 } from '@markfix/ui/icons';
import { useEffect, useState } from 'react';
import { DesktopUpdateButton } from '../DesktopUpdateButton';
import { WebsiteLogo } from './WebsiteLogo';

export function ProjectSidebar({
  expanded,
  user,
  projects,
  selectedProjectId,
  activeView,
  onNew,
  onHistory,
  onProject,
  onDeleteProject,
  onAgentProject,
  onOpenSettings,
  onMenuOpenChange,
  beforeUpdate,
  updateAvailable,
  onLogout,
}: {
  expanded: boolean;
  user: { id: string; email: string; displayName: string };
  projects: WebsiteProject[];
  selectedProjectId: string | undefined;
  activeView: 'workspace' | 'new';
  onNew: () => void;
  onHistory: () => void;
  onProject: (project: WebsiteProject) => void;
  onAgentProject: (project: WebsiteProject) => void;
  onDeleteProject: (project: WebsiteProject) => void;
  onOpenSettings: () => void;
  onMenuOpenChange: (open: boolean) => void;
  beforeUpdate: () => Promise<void>;
  updateAvailable: boolean;
  onLogout: () => Promise<void>;
}): React.JSX.Element | null {
  const [accountMenuOpen, setAccountMenuOpen] = useState(false);
  const [helpMenuOpen, setHelpMenuOpen] = useState(false);
  useEffect(() => {
    onMenuOpenChange(expanded && (accountMenuOpen || helpMenuOpen));
    return () => onMenuOpenChange(false);
  }, [expanded, accountMenuOpen, helpMenuOpen, onMenuOpenChange]);
  const initials = Array.from(user.displayName.trim() || user.email)
    .slice(0, 2)
    .join('')
    .toUpperCase();

  if (!expanded) return null;

  return (
    <nav className="project-sidebar expanded" aria-label="项目导航">
      <Button
        type="button"
        className={`project-sidebar-action ${activeView === 'new' ? 'active' : ''}`}
        aria-label="新标注"
        title="新标注"
        onClick={onNew}
      >
        <Plus />
        <span>新标注</span>
      </Button>

      <div className="project-sidebar-list" aria-label="项目列表">
        <p>项目</p>
        {projects.map((project) => {
          const active = activeView === 'workspace' && selectedProjectId === project.id;
          return (
            <div className="project-sidebar-item-shell" key={project.id}>
              <Button
                type="button"
                className={`project-sidebar-item ${active ? 'active' : ''}`}
                aria-current={active ? 'page' : undefined}
                aria-label={`${project.title}，${new URL(project.origin).hostname}`}
                onClick={() => onProject(project)}
              >
                <WebsiteLogo project={project} />
                <span className="project-sidebar-copy">
                  <strong>{project.title}</strong>
                  <small>
                    {new URL(project.origin).hostname} ·{' '}
                    {project.storageMode === 'LOCAL' ? '本地' : '云端'}
                  </small>
                </span>
              </Button>
              <Button
                type="button"
                className="project-sidebar-agent"
                aria-label={`仓库与修复：${project.title}`}
                title="仓库与修复"
                onClick={() => onAgentProject(project)}
              >
                <Settings2 />
              </Button>
              <Button
                type="button"
                className="project-sidebar-delete"
                aria-label={`删除项目：${project.title}`}
                title={`删除 ${project.title}`}
                onClick={() => onDeleteProject(project)}
              >
                <Trash2 />
              </Button>
            </div>
          );
        })}
      </div>

      <Button
        type="button"
        className="project-sidebar-action project-sidebar-history"
        aria-label="历史标注"
        title="历史标注"
        onClick={onHistory}
      >
        <History />
        <span>历史标注</span>
      </Button>

      <div className="project-sidebar-account-area">
        <DropdownMenu open={accountMenuOpen} onOpenChange={setAccountMenuOpen}>
          <DropdownMenuContent
            className="account-menu"
            side="top"
            align="start"
            sideOffset={8}
            aria-label="账号菜单"
          >
            <DropdownMenuLabel className="account-menu-profile">
              <Avatar className="account-avatar">
                <AvatarFallback className="bg-transparent text-inherit">{initials}</AvatarFallback>
              </Avatar>
              <span>
                <strong>{user.displayName}</strong>
                <small>{user.email}</small>
              </span>
            </DropdownMenuLabel>
            <DropdownMenuSeparator className="account-menu-separator" />
            <DropdownMenuItem onSelect={onOpenSettings}>
              <Settings2 />
              <span>设置</span>
              <DropdownMenuShortcut>⌘,</DropdownMenuShortcut>
            </DropdownMenuItem>
            <DropdownMenuItem
              className="account-menu-logout"
              onSelect={() => {
                void onLogout();
              }}
            >
              <LogOut />
              <span>退出登录</span>
            </DropdownMenuItem>
          </DropdownMenuContent>
          <DropdownMenuTrigger asChild>
            <Button
              type="button"
              className="project-sidebar-account"
              aria-label={`账号：${user.displayName}`}
            >
              <Avatar className="account-avatar">
                <AvatarFallback className="bg-transparent text-inherit">{initials}</AvatarFallback>
              </Avatar>
              <span className="project-sidebar-account-copy">
                <strong>{user.displayName}</strong>
              </span>
            </Button>
          </DropdownMenuTrigger>
        </DropdownMenu>
        <DesktopUpdateButton
          available={updateAvailable}
          beforeStart={beforeUpdate}
          fallback={
            <DropdownMenu open={helpMenuOpen} onOpenChange={setHelpMenuOpen}>
              <DropdownMenuTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon"
                  className="project-sidebar-help"
                  aria-label="帮助"
                  title="帮助"
                >
                  <CircleHelp />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent side="top" align="end" sideOffset={8} aria-label="帮助菜单">
                <DropdownMenuItem
                  onSelect={() => {
                    void window.markfix
                      .openOfficialWebsite()
                      .catch(() => toast.error('无法打开 Chrome，请确认已安装 Google Chrome。'));
                  }}
                >
                  <Gift />
                  <span>新功能</span>
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          }
        />
      </div>
    </nav>
  );
}
