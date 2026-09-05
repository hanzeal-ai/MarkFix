import { useEffect, useMemo, useRef, useState, type FormEvent } from 'react';
import {
  Camera,
  ChevronUp,
  History,
  LogOut,
  MessageSquareText,
  PanelLeftClose,
  PanelLeftOpen,
  Plus,
  Settings2,
  SquarePen,
  Terminal,
  Trash2,
} from '@markfix/ui/icons';
import { Badge, Button, Card, Input, Label } from '@markfix/ui';
import type {
  SavedCapture,
  SavedDiagnosticAnnotation,
  SavedElementComment,
  WebsiteProject,
} from '@markfix/contracts';

export type ProjectAnnotation =
  | { type: 'element'; record: SavedElementComment }
  | { type: 'capture'; record: SavedCapture }
  | { type: 'diagnostic'; record: SavedDiagnosticAnnotation };

export const projectAnnotations = (
  projectId: string,
  elementComments: readonly SavedElementComment[],
  captures: readonly SavedCapture[],
  diagnostics: readonly SavedDiagnosticAnnotation[],
): ProjectAnnotation[] =>
  [
    ...elementComments
      .filter((record) => record.projectId === projectId)
      .map((record) => ({ type: 'element' as const, record })),
    ...captures
      .filter((record) => record.projectId === projectId)
      .map((record) => ({ type: 'capture' as const, record })),
    ...diagnostics
      .filter((record) => record.projectId === projectId)
      .map((record) => ({ type: 'diagnostic' as const, record })),
  ].sort((left, right) => right.record.updatedAt.localeCompare(left.record.updatedAt));

export const annotationCounts = (annotations: readonly ProjectAnnotation[]) => ({
  total: annotations.length,
  draft: annotations.filter(({ record }) => record.status === 'draft').length,
  submitted: annotations.filter(({ record }) => record.status === 'submitted').length,
  rejected: annotations.filter(({ record }) => record.status === 'rejected').length,
});

function MarkFixGlyph(): React.JSX.Element {
  return (
    <span className="markfix-glyph" aria-hidden="true">
      <MessageSquareText />
    </span>
  );
}

export function WebsiteLogo({ project }: { project: WebsiteProject }): React.JSX.Element {
  const [failed, setFailed] = useState(false);
  useEffect(() => setFailed(false), [project.faviconUrl]);
  return (
    <span className="website-logo" aria-hidden="true">
      {!failed && project.faviconUrl ? (
        <img src={project.faviconUrl} alt="" onError={() => setFailed(true)} />
      ) : (
        <MarkFixGlyph />
      )}
    </span>
  );
}

export function HeaderNavigationControls({
  expanded,
  onToggle,
  onNew,
}: {
  expanded: boolean;
  onToggle: () => void;
  onNew: () => void;
}): React.JSX.Element {
  return (
    <div className="header-navigation-controls" aria-label="项目快捷操作">
      <Button
        type="button"
        variant="ghost"
        size="icon"
        aria-label={expanded ? '收起项目侧边栏' : '展开项目侧边栏'}
        aria-keyshortcuts="Meta+B"
        title={`${expanded ? '收起' : '展开'}侧边栏（⌘B）`}
        onClick={onToggle}
      >
        {expanded ? <PanelLeftClose /> : <PanelLeftOpen />}
      </Button>
      <Button
        type="button"
        variant="ghost"
        size="icon"
        aria-label="新标注"
        aria-keyshortcuts="Meta+N"
        title="新标注（⌘N）"
        onClick={onNew}
      >
        <SquarePen />
      </Button>
    </div>
  );
}

export function ProjectSidebar({
  expanded,
  user,
  projects,
  selectedProjectId,
  activeView,
  annotationCount,
  onNew,
  onHistory,
  onProject,
  onDeleteProject,
  onOpenSettings,
  onLogout,
}: {
  expanded: boolean;
  user: { id: string; email: string; displayName: string };
  projects: WebsiteProject[];
  selectedProjectId: string | undefined;
  activeView: 'workspace' | 'new';
  annotationCount: (projectId: string) => number;
  onNew: () => void;
  onHistory: () => void;
  onProject: (project: WebsiteProject) => void;
  onDeleteProject: (project: WebsiteProject) => void;
  onOpenSettings: () => void;
  onLogout: () => Promise<void>;
}): React.JSX.Element | null {
  const [accountMenuOpen, setAccountMenuOpen] = useState(false);
  const accountAreaRef = useRef<HTMLDivElement>(null);
  const accountMenuRef = useRef<HTMLDivElement>(null);
  const initials = Array.from(user.displayName.trim() || user.email)
    .slice(0, 2)
    .join('')
    .toUpperCase();

  useEffect(() => {
    if (!accountMenuOpen) return;
    const closeOnOutsideClick = (event: PointerEvent): void => {
      if (!accountAreaRef.current?.contains(event.target as Node)) setAccountMenuOpen(false);
    };
    const closeOnEscape = (event: KeyboardEvent): void => {
      if (event.key !== 'Escape') return;
      event.preventDefault();
      event.stopPropagation();
      setAccountMenuOpen(false);
    };
    document.addEventListener('pointerdown', closeOnOutsideClick);
    document.addEventListener('keydown', closeOnEscape);
    return () => {
      document.removeEventListener('pointerdown', closeOnOutsideClick);
      document.removeEventListener('keydown', closeOnEscape);
    };
  }, [accountMenuOpen]);

  useEffect(() => {
    if (!accountMenuOpen) return;
    const frame = window.requestAnimationFrame(() => {
      accountMenuRef.current?.querySelector<HTMLButtonElement>('[role="menuitem"]')?.focus();
    });
    return () => window.cancelAnimationFrame(frame);
  }, [accountMenuOpen]);

  if (!expanded) return null;

  return (
    <nav className="project-sidebar expanded" aria-label="项目导航">
      <div className="project-sidebar-brand">
        <MarkFixGlyph />
        <strong>MarkFix</strong>
      </div>

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
                  <small>{new URL(project.origin).hostname}</small>
                </span>
                <i>{annotationCount(project.id)}</i>
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

      <div className="project-sidebar-account-area" ref={accountAreaRef}>
        {accountMenuOpen && (
          <div
            ref={accountMenuRef}
            className="account-menu"
            role="menu"
            aria-label="账号菜单"
            onKeyDown={(event) => {
              const items = Array.from(
                event.currentTarget.querySelectorAll<HTMLButtonElement>('[role="menuitem"]'),
              );
              const index = items.indexOf(document.activeElement as HTMLButtonElement);
              const direction = event.key === 'ArrowDown' ? 1 : event.key === 'ArrowUp' ? -1 : 0;
              if (!direction || items.length === 0) return;
              event.preventDefault();
              items[(index + direction + items.length) % items.length]?.focus();
            }}
          >
            <div className="account-menu-profile">
              <span className="account-avatar">{initials}</span>
              <span>
                <strong>{user.displayName}</strong>
                <small>{user.email}</small>
              </span>
            </div>
            <div className="account-menu-separator" />
            <Button
              type="button"
              role="menuitem"
              onClick={() => {
                setAccountMenuOpen(false);
                onOpenSettings();
              }}
            >
              <Settings2 />
              <span>设置</span>
              <kbd>⌘,</kbd>
            </Button>
            <Button
              type="button"
              role="menuitem"
              className="account-menu-logout"
              onClick={() => {
                setAccountMenuOpen(false);
                void onLogout();
              }}
            >
              <LogOut />
              <span>退出登录</span>
            </Button>
          </div>
        )}
        <Button
          type="button"
          className="project-sidebar-account"
          aria-label={`账号：${user.displayName}`}
          aria-haspopup="menu"
          aria-expanded={accountMenuOpen}
          onClick={() => setAccountMenuOpen((open) => !open)}
        >
          <span className="account-avatar">{initials}</span>
          <span className="project-sidebar-account-copy">
            <strong>{user.displayName}</strong>
            <small>{user.email}</small>
          </span>
          <ChevronUp className={accountMenuOpen ? 'open' : ''} />
        </Button>
      </div>
    </nav>
  );
}

export function NewProjectPage({
  initialValue,
  busy,
  error,
  onSubmit,
}: {
  initialValue: string;
  busy: boolean;
  error: string | undefined;
  onSubmit: (url: string) => void;
}): React.JSX.Element {
  const [value, setValue] = useState(initialValue);
  useEffect(() => setValue(initialValue), [initialValue]);
  const submit = (event: FormEvent): void => {
    event.preventDefault();
    if (value.trim() && !busy) onSubmit(value.trim());
  };
  return (
    <main className="navigation-page new-project-page">
      <Card>
        <form aria-label="新建标注" onSubmit={submit}>
          <Label htmlFor="new-project-url">网站地址</Label>
          <div>
            <Input
              id="new-project-url"
              autoFocus
              value={value}
              placeholder="example.com 或 https://example.com/page"
              aria-describedby={error ? 'new-project-error' : undefined}
              onChange={(event) => setValue(event.target.value)}
            />
            <Button type="submit" disabled={!value.trim() || busy}>
              {busy ? '正在加载…' : '进入标注'}
            </Button>
          </div>
          {error && (
            <p id="new-project-error" role="alert">
              {error}
            </p>
          )}
        </form>
      </Card>
    </main>
  );
}

function StatusBadge({ status }: { status: ProjectAnnotation['record']['status'] }) {
  const text = status === 'draft' ? '未提交' : status === 'submitted' ? '已提交' : '驳回';
  return (
    <Badge variant="outline" className={`annotation-status ${status}`}>
      {text}
    </Badge>
  );
}

export function ProjectHistoryDetail({
  project,
  annotations,
  onSelect,
}: {
  project: WebsiteProject;
  annotations: ProjectAnnotation[];
  onSelect: (annotation: ProjectAnnotation) => void;
}): React.JSX.Element {
  const counts = annotationCounts(annotations);
  return (
    <main className="project-history-page">
      <header>
        <div>
          <WebsiteLogo project={project} />
          <span>
            <h1>{project.title}</h1>
            <p>
              {new URL(project.origin).hostname} · {counts.total} 条标注
            </p>
          </span>
        </div>
      </header>
      <div className="project-history-stats">
        <span className="draft">
          <b>{counts.draft}</b>未提交
        </span>
        <span className="submitted">
          <b>{counts.submitted}</b>已提交
        </span>
        <span className="rejected">
          <b>{counts.rejected}</b>驳回
        </span>
      </div>
      <div className="project-history-list">
        {annotations.map((annotation) => (
          <Button
            type="button"
            key={`${annotation.type}-${annotation.record.id}`}
            onClick={() => onSelect(annotation)}
          >
            <span className="history-record-icon">
              {annotation.type === 'capture' ? (
                <Camera />
              ) : annotation.type === 'diagnostic' ? (
                <Terminal />
              ) : (
                <MessageSquareText />
              )}
            </span>
            <span className="history-record-copy">
              <span>
                <strong>
                  {annotation.type === 'capture'
                    ? '截图批注'
                    : annotation.type === 'diagnostic'
                      ? '调试标注'
                      : '元素批注'}
                </strong>
                <StatusBadge status={annotation.record.status} />
              </span>
              <small>{annotation.record.pageTitle || annotation.record.pageUrl}</small>
              <p>
                {annotation.type === 'diagnostic'
                  ? annotation.record.evidence.title
                  : annotation.record.note}
              </p>
            </span>
            <time>{new Date(annotation.record.updatedAt).toLocaleString()}</time>
          </Button>
        ))}
      </div>
    </main>
  );
}

export function HistoryPage({
  projects,
  elementComments,
  captures,
  diagnostics,
  onSelectProject,
}: {
  projects: WebsiteProject[];
  elementComments: SavedElementComment[];
  captures: SavedCapture[];
  diagnostics: SavedDiagnosticAnnotation[];
  onSelectProject: (project: WebsiteProject) => void;
}): React.JSX.Element {
  const entries = useMemo(
    () =>
      projects
        .map((project) => ({
          project,
          annotations: projectAnnotations(project.id, elementComments, captures, diagnostics),
        }))
        .filter(({ annotations }) => annotations.length > 0)
        .sort((left, right) => {
          const leftDate = left.annotations[0]?.record.updatedAt ?? '';
          const rightDate = right.annotations[0]?.record.updatedAt ?? '';
          return rightDate.localeCompare(leftDate);
        }),
    [captures, diagnostics, elementComments, projects],
  );
  return (
    <main className="navigation-page history-page">
      <header>
        <span>
          <History />
        </span>
        <div>
          <h1>历史标注</h1>
          <p>按项目查看已保存的元素、截图和调试标注。</p>
        </div>
      </header>
      {entries.length === 0 ? (
        <div className="history-empty">
          <MessageSquareText />
          <strong>暂无历史标注</strong>
          <span>完成第一条批注后会显示在这里。</span>
        </div>
      ) : (
        <div className="history-project-grid">
          {entries.map(({ project, annotations }) => {
            const counts = annotationCounts(annotations);
            return (
              <Button
                type="button"
                key={project.id}
                className="history-project-card"
                onClick={() => onSelectProject(project)}
              >
                <WebsiteLogo project={project} />
                <span className="history-project-title">
                  <strong>{project.title}</strong>
                  <small>{new URL(project.origin).hostname}</small>
                </span>
                <b>{counts.total}</b>
                <span className="history-project-counts">
                  <i className="draft">{counts.draft} 未提交</i>
                  <i className="submitted">{counts.submitted} 已提交</i>
                  <i className="rejected">{counts.rejected} 驳回</i>
                </span>
              </Button>
            );
          })}
        </div>
      )}
    </main>
  );
}
