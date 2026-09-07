import type { BrowserMode } from '@markfix/contracts';

export const browserModeSessionKey = 'markfix:browser-mode';

export const browserModeFromSession = (value: string | null): BrowserMode =>
  value === 'comment' || value === 'capture' ? value : 'browse';

export const shouldCollapseSidebarForMode = (mode: BrowserMode): boolean => mode !== 'browse';

export const shouldRestoreCaptureAfterPageLoad = ({
  currentUrl,
  hasSelection,
  isLoading,
  mode,
  selectionUrl,
  wasLoading,
}: {
  currentUrl: string | undefined;
  hasSelection: boolean;
  isLoading: boolean;
  mode: BrowserMode;
  selectionUrl: string | undefined;
  wasLoading: boolean;
}): boolean =>
  wasLoading &&
  !isLoading &&
  mode === 'capture' &&
  hasSelection &&
  Boolean(currentUrl) &&
  currentUrl === selectionUrl;
