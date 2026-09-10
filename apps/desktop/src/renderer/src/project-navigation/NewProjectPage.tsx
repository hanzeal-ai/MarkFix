import type { ProjectStorageMode, WebsiteProject } from '@markfix/contracts';
import { Button, Input, Label, MarkFixStackedLogo, RadioGroup, RadioGroupItem } from '@markfix/ui';
import { CornerDownLeft, Search } from '@markfix/ui/icons';
import { useEffect, useState, type FormEvent } from 'react';
import { desktopPreferenceKeys, newAnnotationStorageModePreference } from '../desktop-preferences';

import { WebsiteShortcuts } from './WebsiteShortcuts';
export function NewProjectPage({
  initialValue,
  localOnly = false,
  busy,
  projects,
  onSubmit,
  onShortcut,
}: {
  initialValue: string;
  localOnly?: boolean;
  busy: boolean;
  projects: WebsiteProject[];
  onSubmit: (url: string, storageMode: ProjectStorageMode) => void;
  onShortcut: (shortcutId: string, url: string, storageMode: ProjectStorageMode) => void;
}): React.JSX.Element {
  const [value, setValue] = useState(initialValue);
  const [storageMode, setStorageMode] = useState<ProjectStorageMode>(() =>
    localOnly ? 'LOCAL' : newAnnotationStorageModePreference(window.localStorage),
  );
  useEffect(() => setValue(initialValue), [initialValue]);
  useEffect(() => {
    const syncDefaultStorageMode = (event: StorageEvent): void => {
      if (!localOnly && event.key === desktopPreferenceKeys.newAnnotationStorageMode)
        setStorageMode(newAnnotationStorageModePreference(window.localStorage));
    };
    window.addEventListener('storage', syncDefaultStorageMode);
    return () => window.removeEventListener('storage', syncDefaultStorageMode);
  }, [localOnly]);
  const submit = (event: FormEvent): void => {
    event.preventDefault();
    if (value.trim() && !busy) onSubmit(value.trim(), storageMode);
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
          <RadioGroup
            className="new-project-storage-mode"
            aria-label="项目数据存储"
            value={storageMode}
            onValueChange={(value) => {
              if (value === 'LOCAL' || value === 'CLOUD') setStorageMode(value);
            }}
          >
            {(localOnly ? (['LOCAL'] as const) : (['LOCAL', 'CLOUD'] as const)).map((mode) => (
              <Label key={mode}>
                <RadioGroupItem
                  value={mode}
                  data-value={mode}
                  aria-label={mode === 'LOCAL' ? '仅本机' : '云端协作'}
                />
                <span>{mode === 'LOCAL' ? '仅本机' : '云端协作'}</span>
              </Label>
            ))}
          </RadioGroup>
        </form>

        <section className="new-project-recents" aria-label="快捷入口">
          <WebsiteShortcuts projects={projects} onShortcut={onShortcut} />
        </section>
      </section>
    </main>
  );
}
