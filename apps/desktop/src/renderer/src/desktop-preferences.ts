import type { ProjectStorageMode, WebsiteProject } from '@markfix/contracts';

export type StartupView = 'new' | 'last-project';

export const desktopPreferenceKeys = {
  startupView: 'markfix:startup-view',
  elementCommentScreenshot: 'markfix:element-comment-screenshot',
  newAnnotationStorageMode: 'markfix:new-annotation-storage-mode',
  lastProjectId: 'markfix:last-project-id',
} as const;

type ReadableStorage = Pick<Storage, 'getItem'>;

export const startupViewPreference = (storage: ReadableStorage): StartupView =>
  storage.getItem(desktopPreferenceKeys.startupView) === 'last-project' ? 'last-project' : 'new';

export const newAnnotationStorageModePreference = (storage: ReadableStorage): ProjectStorageMode =>
  storage.getItem(desktopPreferenceKeys.newAnnotationStorageMode) === 'LOCAL' ? 'LOCAL' : 'CLOUD';

export const startupProjectPreference = (
  storage: ReadableStorage,
  projects: readonly WebsiteProject[],
): WebsiteProject | undefined => {
  if (startupViewPreference(storage) !== 'last-project') return undefined;
  const lastProjectId = storage.getItem(desktopPreferenceKeys.lastProjectId);
  return projects.find(({ id }) => id === lastProjectId) ?? projects[0];
};

export const elementCommentScreenshotPreference = (storage: ReadableStorage): boolean =>
  storage.getItem(desktopPreferenceKeys.elementCommentScreenshot) === 'true';
