import { useEffect, useMemo, useRef, useState, type FormEvent } from 'react';
import {
  CircleHelp,
  Gift,
  CornerDownLeft,
  EllipsisVertical,
  History,
  LogOut,
  PanelLeftClose,
  PanelLeftOpen,
  Pencil,
  Plus,
  Search,
  Settings2,
  SquarePen,
  Trash2,
} from '@markfix/ui/icons';
import {
  toast,
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
  Input,
  MarkFixLogo,
  MarkFixStackedLogo,
} from '@markfix/ui';
import type { ProjectStorageMode, WebsiteProject } from '@markfix/contracts';
import { desktopPreferenceKeys, newAnnotationStorageModePreference } from './desktop-preferences';
import { DesktopUpdateButton } from './DesktopUpdateButton';
import { MarkFixGlyph, WebsiteLogo } from './project-navigation/WebsiteLogo';

export { HistoryPage, ProjectHistoryDetail } from './project-navigation/HistoryPages';
export {
  annotationCounts,
  projectAnnotations,
  type ProjectAnnotation,
} from './project-navigation/model';

export type WebsiteShortcut = {
  id: string;
  name: string;
  url: string;
  storageMode: ProjectStorageMode;
};

const websiteShortcutsStorageKey = 'markfix.website-shortcuts.v1';
const maximumWebsiteShortcuts = 12;

const normalizeShortcutUrl = (input: string): string => {
  if (!input.trim()) throw new Error('请输入网站地址');
  const candidate = /^[a-z][a-z\d+.-]*:/i.test(input.trim())
    ? input.trim()
    : `https://${input.trim()}`;
  const parsed = new URL(candidate);
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:')
    throw new Error('仅支持 HTTP 或 HTTPS 网站地址');
  return parsed.href;
};

const defaultWebsiteShortcuts = (projects: readonly WebsiteProject[]): WebsiteShortcut[] =>
  projects.slice(0, maximumWebsiteShortcuts).map((project) => ({
    id: project.id,
    name: project.title,
    url: project.entryUrl,
    storageMode: project.storageMode,
  }));

export const normalizeWebsiteShortcuts = (value: unknown): WebsiteShortcut[] => {
  if (!Array.isArray(value)) return [];
  return value
    .filter(
      (
        shortcut,
      ): shortcut is Omit<WebsiteShortcut, 'storageMode'> & {
        storageMode?: unknown;
      } =>
        typeof shortcut === 'object' &&
        shortcut !== null &&
        typeof (shortcut as WebsiteShortcut).id === 'string' &&
        typeof (shortcut as WebsiteShortcut).name === 'string' &&
        typeof (shortcut as WebsiteShortcut).url === 'string',
    )
    .map((shortcut): WebsiteShortcut => ({
      id: shortcut.id,
      name: shortcut.name,
      url: shortcut.url,
      storageMode: shortcut.storageMode === 'LOCAL' ? 'LOCAL' : 'CLOUD',
    }))
    .slice(0, maximumWebsiteShortcuts);
};

const loadWebsiteShortcuts = (projects: readonly WebsiteProject[]): WebsiteShortcut[] => {
  try {
    const stored = window.localStorage.getItem(websiteShortcutsStorageKey);
    if (stored === null) return defaultWebsiteShortcuts(projects);
    return normalizeWebsiteShortcuts(JSON.parse(stored) as unknown);
  } catch {
    return defaultWebsiteShortcuts(projects);
  }
};

function ShortcutLogo({ shortcut }: { shortcut: WebsiteShortcut }): React.JSX.Element {
  const [failed, setFailed] = useState(false);
  const faviconUrl = useMemo(() => new URL('/favicon.ico', shortcut.url).href, [shortcut.url]);
  useEffect(() => setFailed(false), [faviconUrl]);
  return (
    <span className="website-logo" aria-hidden="true">
      {!failed ? <img src={faviconUrl} alt="" onError={() => setFailed(true)} /> : <MarkFixGlyph />}
    </span>
  );
}

export function HeaderNavigationControls({
  expanded,
  onToggle,
  onNew,
  onPeek,
  onEndPeek,
}: {
  expanded: boolean;
  onToggle: () => void;
  onNew: () => void;
  onPeek: () => void;
  onEndPeek: () => void;
}): React.JSX.Element {
  return (
    <div className="header-navigation-controls" aria-label="项目快捷操作">
      <Button
        type="button"
        variant="ghost"
        size="icon"
        aria-label={expanded ? '收起项目侧边栏' : '展开项目侧边栏'}
        aria-keyshortcuts="Meta+B"
        title={expanded ? '收起侧边栏（⌘B）' : '展开侧边栏（⌘B）'}
        onClick={onToggle}
        onMouseEnter={expanded ? undefined : onPeek}
        onMouseLeave={onEndPeek}
        onFocus={expanded ? undefined : onPeek}
        onBlur={onEndPeek}
      >
        {expanded ? <PanelLeftClose /> : <PanelLeftOpen />}
      </Button>
      {!expanded && (
        <Button
          type="button"
          variant="ghost"
          size="icon"
          aria-label="新标注"
          title="新标注（⌘N）"
          aria-keyshortcuts="Meta+N"
          onClick={onNew}
          onMouseEnter={onPeek}
          onMouseLeave={onEndPeek}
          onFocus={onPeek}
          onBlur={onEndPeek}
        >
          <SquarePen />
        </Button>
      )}
    </div>
  );
}

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
  onOpenSettings,
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
  onDeleteProject: (project: WebsiteProject) => void;
  onOpenSettings: () => void;
  beforeUpdate: () => Promise<void>;
  updateAvailable: boolean;
  onLogout: () => Promise<void>;
}): React.JSX.Element | null {
  const [accountMenuOpen, setAccountMenuOpen] = useState(false);
  const initials = Array.from(user.displayName.trim() || user.email)
    .slice(0, 2)
    .join('')
    .toUpperCase();

  if (!expanded) return null;

  return (
    <nav className="project-sidebar expanded" aria-label="项目导航">
      <div className="project-sidebar-brand">
        <MarkFixLogo />
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
                  <small>
                    {new URL(project.origin).hostname} ·{' '}
                    {project.storageMode === 'LOCAL' ? '本地' : '云端'}
                  </small>
                </span>
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
              <span className="account-avatar">{initials}</span>
              <span>
                <strong>{user.displayName}</strong>
                <small>{user.email}</small>
              </span>
            </DropdownMenuLabel>
            <DropdownMenuSeparator className="account-menu-separator" />
            <DropdownMenuItem onSelect={onOpenSettings}>
              <Settings2 />
              <span>设置</span>
              <kbd>⌘,</kbd>
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
              <span className="account-avatar">{initials}</span>
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
            <DropdownMenu>
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

export function NewProjectPage({
  initialValue,
  busy,
  projects,
  onSubmit,
  onShortcut,
}: {
  initialValue: string;
  busy: boolean;
  projects: WebsiteProject[];
  onSubmit: (url: string, storageMode: ProjectStorageMode) => void;
  onShortcut: (shortcutId: string, url: string, storageMode: ProjectStorageMode) => void;
}): React.JSX.Element {
  const [value, setValue] = useState(initialValue);
  const [storageMode, setStorageMode] = useState<ProjectStorageMode>(() =>
    newAnnotationStorageModePreference(window.localStorage),
  );
  const [shortcuts, setShortcuts] = useState<WebsiteShortcut[]>(() =>
    loadWebsiteShortcuts(projects),
  );
  const shortcutPreferenceExistsRef = useRef(
    window.localStorage.getItem(websiteShortcutsStorageKey) !== null,
  );
  const [openMenuId, setOpenMenuId] = useState<string>();
  const [shortcutDialogMode, setShortcutDialogMode] = useState<'add' | 'edit'>();
  const [editingShortcutId, setEditingShortcutId] = useState<string>();
  const [shortcutName, setShortcutName] = useState('');
  const [shortcutUrl, setShortcutUrl] = useState('');
  const [shortcutStorageMode, setShortcutStorageMode] = useState<ProjectStorageMode>('CLOUD');
  const [shortcutError, setShortcutError] = useState<string>();
  const [pendingDelete, setPendingDelete] = useState<WebsiteShortcut>();

  useEffect(() => setValue(initialValue), [initialValue]);
  useEffect(() => {
    const syncDefaultStorageMode = (event: StorageEvent): void => {
      if (event.key === desktopPreferenceKeys.newAnnotationStorageMode)
        setStorageMode(newAnnotationStorageModePreference(window.localStorage));
    };
    window.addEventListener('storage', syncDefaultStorageMode);
    return () => window.removeEventListener('storage', syncDefaultStorageMode);
  }, []);
  useEffect(() => {
    if (shortcutPreferenceExistsRef.current || shortcuts.length > 0 || projects.length === 0)
      return;
    setShortcuts(defaultWebsiteShortcuts(projects));
  }, [projects, shortcuts.length]);
  useEffect(() => {
    if (!shortcutPreferenceExistsRef.current && shortcuts.length === 0) return;
    window.localStorage.setItem(websiteShortcutsStorageKey, JSON.stringify(shortcuts));
    shortcutPreferenceExistsRef.current = true;
  }, [shortcuts]);
  const submit = (event: FormEvent): void => {
    event.preventDefault();
    if (value.trim() && !busy) onSubmit(value.trim(), storageMode);
  };

  const openShortcutDialog = (shortcut?: WebsiteShortcut): void => {
    setOpenMenuId(undefined);
    setShortcutError(undefined);
    setEditingShortcutId(shortcut?.id);
    setShortcutName(shortcut?.name ?? '');
    setShortcutUrl(shortcut?.url ?? '');
    setShortcutStorageMode(shortcut?.storageMode ?? 'CLOUD');
    setShortcutDialogMode(shortcut ? 'edit' : 'add');
  };

  const saveShortcut = (event: FormEvent): void => {
    event.preventDefault();
    const name = shortcutName.trim();
    if (!name) {
      setShortcutError('请输入快捷方式名称');
      return;
    }
    let normalizedUrl: string;
    try {
      normalizedUrl = normalizeShortcutUrl(shortcutUrl);
    } catch (shortcutValidationError) {
      setShortcutError(
        shortcutValidationError instanceof Error
          ? shortcutValidationError.message
          : '请输入有效的网站地址',
      );
      return;
    }
    if (
      shortcuts.some(
        (shortcut) => shortcut.id !== editingShortcutId && shortcut.url === normalizedUrl,
      )
    ) {
      setShortcutError('该网址已存在于快捷方式中');
      return;
    }
    if (shortcutDialogMode === 'edit' && editingShortcutId) {
      setShortcuts((current) =>
        current.map((shortcut) =>
          shortcut.id === editingShortcutId
            ? {
                ...shortcut,
                name: name.slice(0, 120),
                url: normalizedUrl,
                storageMode: shortcutStorageMode,
              }
            : shortcut,
        ),
      );
    } else {
      if (shortcuts.length >= maximumWebsiteShortcuts) {
        setShortcutError(`快捷方式最多只能添加 ${maximumWebsiteShortcuts} 个`);
        return;
      }
      setShortcuts((current) => [
        ...current,
        {
          id: crypto.randomUUID(),
          name: name.slice(0, 120),
          url: normalizedUrl,
          storageMode: shortcutStorageMode,
        },
      ]);
    }
    setShortcutDialogMode(undefined);
  };

  const deleteShortcut = (): void => {
    if (!pendingDelete) return;
    setShortcuts((current) => current.filter(({ id }) => id !== pendingDelete.id));
    setOpenMenuId(undefined);
    setPendingDelete(undefined);
  };

  return (
    <main className="navigation-page new-project-page">
      <section className="new-project-home">
        <header className="new-project-hero">
          <MarkFixStackedLogo />
        </header>

        <form className="new-project-form" aria-label="新建标注" onSubmit={submit}>
          <label className="new-project-visually-hidden" htmlFor="new-project-url">
            网站地址
          </label>
          <div className="new-project-search">
            <Search aria-hidden="true" />
            <Input
              id="new-project-url"
              autoFocus
              value={value}
              placeholder="输入网站地址，例如 example.com"
              onChange={(event) => setValue(event.target.value)}
            />
            <Button
              className="new-project-submit"
              type="submit"
              aria-label={busy ? '正在打开网站' : '进入标注'}
              title={busy ? '正在打开…' : '进入标注（回车）'}
              disabled={!value.trim() || busy}
            >
              <CornerDownLeft aria-hidden="true" />
            </Button>
          </div>
          <fieldset className="new-project-storage-mode">
            <legend>项目数据存储</legend>
            {(['LOCAL', 'CLOUD'] as const).map((mode) => (
              <label key={mode}>
                <input
                  type="radio"
                  name="project-storage-mode"
                  value={mode}
                  checked={storageMode === mode}
                  onChange={() => setStorageMode(mode)}
                />
                <span>{mode === 'LOCAL' ? '仅本机' : '云端协作'}</span>
              </label>
            ))}
          </fieldset>
        </form>

        <section className="new-project-recents" aria-label="快捷入口">
          <div className="new-project-shortcuts">
            {shortcuts.map((shortcut) => (
              <DropdownMenu
                key={shortcut.id}
                open={openMenuId === shortcut.id}
                onOpenChange={(open) => setOpenMenuId(open ? shortcut.id : undefined)}
              >
                <div className="new-project-shortcut-card">
                  <Button
                    className="new-project-shortcut"
                    type="button"
                    variant="ghost"
                    title={shortcut.name}
                    onClick={() => onShortcut(shortcut.id, shortcut.url, shortcut.storageMode)}
                  >
                    <ShortcutLogo shortcut={shortcut} />
                    <strong>{shortcut.name}</strong>
                  </Button>
                  <DropdownMenuTrigger asChild>
                    <Button
                      className="new-project-shortcut-menu-trigger"
                      type="button"
                      variant="ghost"
                      size="icon"
                      aria-label={`管理快捷方式：${shortcut.name}`}
                    >
                      <EllipsisVertical />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent
                    className="new-project-shortcut-menu"
                    side="bottom"
                    align="center"
                    sideOffset={8}
                    avoidCollisions={false}
                  >
                    <DropdownMenuItem onSelect={() => openShortcutDialog(shortcut)}>
                      <Pencil /> 修改
                    </DropdownMenuItem>
                    <DropdownMenuItem
                      className="danger"
                      onSelect={() => {
                        setOpenMenuId(undefined);
                        setPendingDelete(shortcut);
                      }}
                    >
                      <Trash2 /> 删除
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </div>
              </DropdownMenu>
            ))}
            {shortcuts.length < maximumWebsiteShortcuts && (
              <Button
                className="new-project-shortcut new-project-shortcut-add"
                type="button"
                variant="ghost"
                onClick={() => openShortcutDialog()}
              >
                <span className="website-logo" aria-hidden="true">
                  <Plus />
                </span>
                <strong>添加快捷方式</strong>
              </Button>
            )}
          </div>
        </section>
      </section>

      <Dialog
        open={Boolean(shortcutDialogMode)}
        onOpenChange={(open) => {
          if (!open) setShortcutDialogMode(undefined);
        }}
      >
        <DialogContent className="shortcut-dialog">
          <DialogHeader>
            <DialogTitle>
              {shortcutDialogMode === 'edit' ? '修改快捷方式' : '添加快捷方式'}
            </DialogTitle>
          </DialogHeader>
          <form onSubmit={saveShortcut}>
            <label htmlFor="shortcut-name">
              名称
              <Input
                id="shortcut-name"
                autoFocus
                maxLength={120}
                value={shortcutName}
                onChange={(event) => setShortcutName(event.target.value)}
              />
            </label>
            <label htmlFor="shortcut-url">
              网址
              <Input
                id="shortcut-url"
                value={shortcutUrl}
                placeholder="https://example.com"
                onChange={(event) => setShortcutUrl(event.target.value)}
              />
            </label>
            <fieldset className="shortcut-storage-mode">
              <legend>模式</legend>
              {(['CLOUD', 'LOCAL'] as const).map((mode) => (
                <label key={mode}>
                  <input
                    type="radio"
                    name="shortcut-storage-mode"
                    value={mode}
                    checked={shortcutStorageMode === mode}
                    onChange={() => setShortcutStorageMode(mode)}
                  />
                  <span>{mode === 'CLOUD' ? '云端协作' : '仅本机'}</span>
                </label>
              ))}
            </fieldset>
            {shortcutError && <p role="alert">{shortcutError}</p>}
            <footer>
              <Button
                type="button"
                variant="outline"
                onClick={() => setShortcutDialogMode(undefined)}
              >
                取消
              </Button>
              <Button type="submit">完成</Button>
            </footer>
          </form>
        </DialogContent>
      </Dialog>

      <Dialog
        open={Boolean(pendingDelete)}
        onOpenChange={(open) => !open && setPendingDelete(undefined)}
      >
        <DialogContent className="shortcut-dialog shortcut-delete-dialog">
          <DialogHeader>
            <DialogTitle>删除快捷方式？</DialogTitle>
            <DialogDescription>
              将从首页移除“{pendingDelete?.name}”，不会删除对应的项目及标注数据。
            </DialogDescription>
          </DialogHeader>
          <footer>
            <Button type="button" variant="outline" onClick={() => setPendingDelete(undefined)}>
              取消
            </Button>
            <Button type="button" variant="destructive" onClick={deleteShortcut}>
              删除
            </Button>
          </footer>
        </DialogContent>
      </Dialog>
    </main>
  );
}
