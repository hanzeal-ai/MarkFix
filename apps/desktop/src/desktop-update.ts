import type { SavedCapture, SavedElementComment } from '@markfix/contracts';

export const desktopUpdateChannels = {
  prepare: 'desktop:update-prepare',
  start: 'desktop:update-start',
  status: 'desktop:update-status',
  changed: 'desktop:update-changed',
} as const;

export type DesktopUpdateStatus = {
  phase:
    | 'preparing'
    | 'idle'
    | 'checking'
    | 'downloading'
    | 'installing'
    | 'current'
    | 'manual'
    | 'error';
  message: string;
};

export const desktopUpdateActive = (status: DesktopUpdateStatus): boolean =>
  ['preparing', 'checking', 'downloading', 'installing'].includes(status.phase);

export function desktopUpdateFeedUrl(apiUrl: string, version: string, arch: string): string {
  const url = new URL(apiUrl);
  if (url.protocol !== 'https:' || url.username || url.password || url.search || url.hash) {
    throw new Error('自动更新需要 HTTPS 服务地址，请联系管理员。');
  }
  url.pathname = `${url.pathname.replace(/\/$/, '')}/v1/desktop-updates`;
  url.search = new URLSearchParams({ version, platform: 'darwin', arch }).toString();
  return url.href;
}

type UpdateEditorContent = Pick<SavedElementComment, 'note' | 'evidence'> &
  Partial<Pick<SavedCapture, 'marks'>>;

export function hasDesktopUpdateEdits(
  current: UpdateEditorContent,
  saved?: UpdateEditorContent,
): boolean {
  return (
    current.note.trim() !== (saved?.note ?? '') ||
    JSON.stringify(current.evidence ?? []) !== JSON.stringify(saved?.evidence ?? []) ||
    JSON.stringify(current.marks ?? []) !== JSON.stringify(saved?.marks ?? [])
  );
}

export function windowsDesktopUpdateFeedUrl(apiUrl: string): string {
  const url = new URL(apiUrl);
  if (url.protocol !== 'https:' || url.username || url.password || url.search || url.hash)
    throw new Error('自动更新需要 HTTPS 服务地址，请联系管理员。');
  url.pathname = `${url.pathname.replace(/\/$/, '')}/v1/desktop-updates/windows/x64/`;
  return url.href;
}
