import type { ProjectStorageMode, WebsiteProject } from '@markfix/contracts';
import {
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  Input,
  Label,
  RadioGroup,
  RadioGroupItem,
} from '@markfix/ui';
import { EllipsisVertical, Pencil, Plus, Trash2 } from '@markfix/ui/icons';
import { useEffect, useMemo, useRef, useState, type FormEvent } from 'react';
import { MarkFixGlyph } from './WebsiteLogo';

import {
  defaultWebsiteShortcuts,
  loadWebsiteShortcuts,
  maximumWebsiteShortcuts,
  normalizeShortcutUrl,
  websiteShortcutsStorageKey,
  type WebsiteShortcut,
} from './website-shortcuts';
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

export function WebsiteShortcuts({
  projects,
  onShortcut,
}: {
  projects: WebsiteProject[];
  onShortcut: (shortcutId: string, url: string, mode: ProjectStorageMode) => void;
}) {
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
    <>
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
      </div>{' '}
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
            <RadioGroup
              className="shortcut-storage-mode"
              aria-label="项目数据存储"
              value={shortcutStorageMode}
              onValueChange={(value) => {
                if (value === 'LOCAL' || value === 'CLOUD') setShortcutStorageMode(value);
              }}
            >
              {(['CLOUD', 'LOCAL'] as const).map((mode) => (
                <Label key={mode}>
                  <RadioGroupItem
                    value={mode}
                    data-value={mode}
                    aria-label={mode === 'LOCAL' ? '仅本机' : '云端协作'}
                  />
                  <span>{mode === 'CLOUD' ? '云端协作' : '仅本机'}</span>
                </Label>
              ))}
            </RadioGroup>
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
    </>
  );
}
