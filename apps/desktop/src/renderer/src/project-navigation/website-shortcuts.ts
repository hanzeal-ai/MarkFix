import type { ProjectStorageMode, WebsiteProject } from '@markfix/contracts';
export type WebsiteShortcut = {
  id: string;
  name: string;
  url: string;
  storageMode: ProjectStorageMode;
};

export const websiteShortcutsStorageKey = 'markfix.website-shortcuts.v1';
export const maximumWebsiteShortcuts = 12;

export const normalizeShortcutUrl = (input: string): string => {
  if (!input.trim()) throw new Error('请输入网站地址');
  const candidate = /^[a-z][a-z\d+.-]*:/i.test(input.trim())
    ? input.trim()
    : `https://${input.trim()}`;
  const parsed = new URL(candidate);
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:')
    throw new Error('仅支持 HTTP 或 HTTPS 网站地址');
  return parsed.href;
};

export const defaultWebsiteShortcuts = (projects: readonly WebsiteProject[]): WebsiteShortcut[] =>
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
    .flatMap((shortcut): WebsiteShortcut[] => {
      try {
        const normalizedUrl = normalizeShortcutUrl(shortcut.url);
        return [
          {
            id: shortcut.id,
            name: shortcut.name,
            url: /^[a-z][a-z\d+.-]*:/i.test(shortcut.url) ? shortcut.url : normalizedUrl,
            storageMode: shortcut.storageMode === 'LOCAL' ? 'LOCAL' : 'CLOUD',
          },
        ];
      } catch {
        return [];
      }
    })
    .slice(0, maximumWebsiteShortcuts);
};

export const loadWebsiteShortcuts = (projects: readonly WebsiteProject[]): WebsiteShortcut[] => {
  try {
    const stored = window.localStorage.getItem(websiteShortcutsStorageKey);
    if (stored === null) return defaultWebsiteShortcuts(projects);
    return normalizeWebsiteShortcuts(JSON.parse(stored) as unknown);
  } catch {
    return defaultWebsiteShortcuts(projects);
  }
};
