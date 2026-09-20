import { serviceUrls } from '@markfix/contracts';
import { repositoryBindingSchema, type AgentRepository } from '@markfix/contracts';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { isSidebarWidth, annotationPanelWidth, websiteMinWidth } from '../sidebar-layout';
import { randomUUID } from 'node:crypto';
import { join } from 'node:path';
import {
  app,
  autoUpdater,
  BrowserWindow,
  dialog,
  ipcMain,
  Menu,
  session,
  shell,
  WebContentsView,
  type IpcMainInvokeEvent,
  type WebContents,
  type MenuItemConstructorOptions,
} from 'electron';
import {
  anchorSchema,
  browserModeSchema,
  historyAnnotationReferenceSchema,
  ipcChannels,
  navigateInputSchema,
  websiteProjectSchema,
  type Anchor,
  type BrowserMode,
  type CloudProjectState,
  type ProjectStorageMode,
  type SavedElementComment,
  type WebsiteProject,
} from '@markfix/contracts';
import { MarkFixApi, MarkFixApiError } from '@markfix/api-client';
import { anchorsEqual } from './anchor-state.js';
import { CdpInspector } from './cdp-inspector.js';
import { CaptureService } from './capture-service.js';
import { DraftStore } from './draft-store.js';
import { homedir } from 'node:os';
import { LocalAgentService } from './local-agent/service.js';
import { startLocalAgentServer } from './local-agent/server.js';
import { DiagnosticConsole } from './diagnostic-console.js';
import { isWebsiteUrlAllowed, normalizeWebsiteUrl } from './url.js';
import { subscriptionIpcChannels } from '../subscription.js';
import { accountPageChannel, accountPageUrl } from '../account-pages.js';
import {
  desktopUpdateChannels,
  desktopUpdateFeedUrl,
  desktopUpdateActive,
} from '../desktop-update.js';
import { DesktopUpdater } from './desktop-updater.js';
import { projectRefreshForShortcut, routeProjectRefreshMenu } from './project-refresh.js';
import { modeForShortcut } from './mode-shortcuts.js';
import { windowActionForShortcut, type WindowShortcutAction } from './window-shortcuts.js';
import { DesktopSessionManager } from './session-manager.js';
import { websiteLoadFailure } from './website-load-error.js';
import { registerAnnotationStoreIpc } from './ipc/register-annotation-store-ipc.js';
import { ChildWindowManager } from './child-window-manager.js';
import { registerCaptureIpc } from './ipc/register-capture-ipc.js';
import { registerDiagnosticsIpc } from './ipc/register-diagnostics-ipc.js';
import { ReportOutbox } from './report-outbox.js';
import { ProjectDataRouter } from './project-data-router.js';
import { desktopPasswordChangeInput, desktopRegistrationInput } from './desktop-auth-input.js';

const toolbarHeight = 56;
let panelWidth = 0;
const diagnosticsPanelHeight = 300;
const diagnosticsPanelInset = 14;
const macWindowMaterial =
  process.platform === 'darwin'
    ? ({
        vibrancy: 'under-window',
        visualEffectState: 'followWindow',
      } as const)
    : {};
const services = process.env.MARKFIX_SERVICE_ORIGIN
  ? serviceUrls('production', process.env.MARKFIX_SERVICE_ORIGIN)
  : import.meta.env.MAIN_VITE_SERVICE_URLS;
const api = new MarkFixApi(services.apiOrigin);
const desktopSession = new DesktopSessionManager(api);
let mainWindow: BrowserWindow | undefined;
let websiteView: WebContentsView | undefined;
let pageLoading = false;
let sidebarPreviewReady = false;
let sidebarPreviewVersion = 0;
let sidebarPeekWidth = 0;
let inspector: CdpInspector | undefined;
let captureService: CaptureService | undefined;
let diagnosticConsole: DiagnosticConsole | undefined;
let draftStore: DraftStore | undefined;
let localAgent: LocalAgentService | undefined;
let localAgentServer: Awaited<ReturnType<typeof startLocalAgentServer>> | undefined;
let localMode = false;
const requireLocalAgent = () => {
  if (!localAgent) throw new Error('本机 CLI 服务未初始化');
  return localAgent;
};
let shellWebContentsId: number | undefined;
let currentElementComments: SavedElementComment[] = [];
let currentAnchor: Anchor | undefined;
let syncTimer: ReturnType<typeof setInterval> | undefined;
let pageRevision = randomUUID();
let authenticatedUser: { id: string; email: string; displayName: string } | undefined;
let currentBrowserMode: BrowserMode = 'browse';
let diagnosticsOpen = false;
let navigationSidebarWidth = 228;
let workspaceViewVisible = false;
let websiteContentReady = false;
let activeWebsiteProjectId: string | undefined;
let navigationWebsiteProjectId: string | undefined;
let websiteProjectSwitchGeneration = 0;
let currentPageTitle = '';
let currentPageFaviconUrl: string | null = null;
const overlayVisibilityWaiters = new Map<string, () => void>();
const websiteProjectsById = new Map<string, WebsiteProject>();
const cloudProjectStates = new Map<string, CloudProjectState>();
const cloudStateSaveQueues = new Map<string, Promise<void>>();
let cloudSessionGeneration = 0;

const enforceWebsiteNavigationPolicy = (
  event: { preventDefault(): void },
  url: string,
): boolean => {
  if (url === 'about:blank' || isWebsiteUrlAllowed(url)) return true;
  event.preventDefault();
  return false;
};

const loadClientPolicy = (force = false) => desktopSession.loadPolicy(force);
const assertSupportedClient = (policy: Awaited<ReturnType<typeof loadClientPolicy>>) =>
  desktopSession.assertSupported(policy);
const saveRefreshToken = (refreshToken: string) => desktopSession.saveRefreshToken(refreshToken);
const clearRefreshToken = () => desktopSession.clearRefreshToken();

const restoreSession = async () => {
  if (authenticatedUser) return authenticatedUser;
  const user = await desktopSession.restore();
  if (user && !localMode) {
    authenticatedUser = user;
    layoutWebsite();
    return authenticatedUser;
  }
  return undefined;
};

const assertShellSender = (event: IpcMainInvokeEvent): void => {
  if (event.sender.id !== shellWebContentsId && !childWindows.isTrustedSender(event.sender.id))
    throw new Error('Untrusted IPC sender');
};

const assertSubscriptionSender = (event: IpcMainInvokeEvent): void => {
  if (event.sender.id === shellWebContentsId || childWindows.isSettingsSender(event.sender.id))
    return;
  throw new Error('Untrusted subscription IPC sender');
};

const sendShell = (channel: string, payload: unknown): void => {
  if (!mainWindow?.isDestroyed()) mainWindow?.webContents.send(channel, payload);
};

const reportOutbox = new ReportOutbox(
  api,
  () => draftStore,
  () => Boolean(authenticatedUser),
  (projectId) => websiteProjectsById.get(projectId)?.storageMode === 'CLOUD',
  async () => assertSupportedClient(await loadClientPolicy()),
  async () => {
    const refreshToken = api.currentRefreshToken();
    if (refreshToken) await saveRefreshToken(refreshToken);
  },
  sendShell,
);

const projectDataRouter = new ProjectDataRouter(
  api,
  () => draftStore,
  (projectId) => websiteProjectsById.get(projectId),
);

const sendBrowserState = (payload: Record<string, unknown> = {}): void => {
  const contents = websiteView?.webContents;
  sendShell(ipcChannels.browserState, {
    loading: pageLoading,
    canGoBack: contents?.navigationHistory.canGoBack() ?? false,
    canGoForward: contents?.navigationHistory.canGoForward() ?? false,
    ...payload,
  });
};

const performWindowShortcut = (
  action: WindowShortcutAction,
  browserWindow: BrowserWindow,
): void => {
  if (action === 'quit') {
    app.quit();
    return;
  }
  if (action === 'settings') {
    void childWindows.openSettings();
    return;
  }
  if (browserWindow.isDestroyed()) return;
  if (action === 'minimize') browserWindow.minimize();
  else browserWindow.close();
};

const refreshCurrentProject = (ignoreCache = false): void => {
  if (!websiteView || websiteView.webContents.isDestroyed() || !activeWebsiteProjectId) return;
  navigationWebsiteProjectId = activeWebsiteProjectId;
  websiteContentReady = false;
  layoutWebsite();
  if (ignoreCache) websiteView.webContents.reloadIgnoringCache();
  else websiteView.webContents.reload();
};

const registerMainShortcuts = (browserWindow: BrowserWindow, webContents: WebContents): void => {
  webContents.on('before-input-event', (event, input) => {
    if (desktopUpdateActive(desktopUpdater.getStatus())) {
      event.preventDefault();
      return;
    }
    const refresh = projectRefreshForShortcut(input);
    if (refresh) {
      event.preventDefault();
      refreshCurrentProject(refresh === 'ignore-cache');
      return;
    }
    const windowAction = windowActionForShortcut(input, 'main');
    if (windowAction) {
      event.preventDefault();
      performWindowShortcut(windowAction, browserWindow);
      return;
    }
    const mode = modeForShortcut(input);
    if (!mode) return;
    event.preventDefault();
    sendShell(ipcChannels.modeShortcut, mode);
  });
};

const registerChildShortcuts = (browserWindow: BrowserWindow): void => {
  browserWindow.webContents.on('before-input-event', (event, input) => {
    const refresh = projectRefreshForShortcut(input);
    if (refresh) {
      event.preventDefault();
      refreshCurrentProject(refresh === 'ignore-cache');
      return;
    }
    const action = windowActionForShortcut(input, 'child');
    if (!action) return;
    event.preventDefault();
    performWindowShortcut(action, browserWindow);
  });
};

const childWindows = new ChildWindowManager({
  mainWindow: () => mainWindow,
  captureExists: async (projectId, captureId) =>
    (await projectDataRouter.listCaptures(projectId)).some(({ id }) => id === captureId),
  registerShortcuts: registerChildShortcuts,
});

const updatePageRevision = (): void => {
  pageRevision = randomUUID();
  captureService?.clearSnapshot();
};

const setOverlayHidden = async (hidden: boolean): Promise<void> => {
  if (!websiteView) return Promise.reject(new Error('Website view is unavailable'));
  const requestId = randomUUID();
  try {
    await new Promise<void>((resolve, reject) => {
      const timer = setTimeout(() => {
        overlayVisibilityWaiters.delete(requestId);
        reject(new Error('Overlay did not acknowledge the capture transaction'));
      }, 1500);
      overlayVisibilityWaiters.set(requestId, () => {
        clearTimeout(timer);
        resolve();
      });
      websiteView?.webContents.send('markfix:set-overlay-hidden', { requestId, hidden });
    });
  } catch {
    const applied = (await websiteView.webContents.executeJavaScript(
      `(() => {
        const host = document.querySelector('[data-markfix-overlay-host]');
        if (!(host instanceof HTMLElement)) return false;
        host.style.visibility = '${hidden ? 'hidden' : 'visible'}';
        return true;
      })()`,
      true,
    )) as boolean;
    if (!applied && hidden) throw new Error('Screenshot overlay is unavailable');
  }
};

const refreshCaptureSnapshot = async (): Promise<void> => {
  if (currentBrowserMode !== 'capture' || !captureService) return;
  try {
    const snapshot = await captureService.freeze();
    if (currentBrowserMode === 'capture')
      websiteView?.webContents.send('markfix:capture-snapshot', snapshot.dataUrl);
  } catch (error) {
    if (currentBrowserMode === 'capture')
      sendBrowserState({ error: error instanceof Error ? error.message : '无法固定截图画面' });
  }
};

const desktopUpdater = new DesktopUpdater(
  autoUpdater,
  () => {
    if (!app.isPackaged || process.platform !== 'darwin')
      throw new Error('自动更新仅适用于已安装的 macOS 正式版本。');
    return desktopUpdateFeedUrl(services.apiOrigin, app.getVersion(), process.arch);
  },
  (status) => {
    mainWindow?.webContents.send(desktopUpdateChannels.changed, status);
    layoutWebsite();
  },
);

const layoutWebsite = (): void => {
  if (
    !mainWindow ||
    mainWindow.isDestroyed() ||
    !websiteView ||
    websiteView.webContents.isDestroyed()
  )
    return;
  const [width = 1060, height = 680] = mainWindow.getContentSize();
  const sidebarWidth =
    panelWidth === 0 ? 0 : annotationPanelWidth(panelWidth, navigationSidebarWidth, width);
  // Match the renderer panel's bottom inset and leave a gap above its rounded corners.
  const bottomPanelHeight = diagnosticsOpen
    ? diagnosticsPanelHeight + diagnosticsPanelInset * 2
    : 0;
  websiteView.setBounds({
    x: navigationSidebarWidth,
    y: toolbarHeight,
    width: Math.max(websiteMinWidth, width - navigationSidebarWidth - sidebarWidth),
    height: Math.max(200, height - toolbarHeight - bottomPanelHeight),
  });
  websiteView.setVisible(
    (Boolean(authenticatedUser) || localMode) &&
      workspaceViewVisible &&
      websiteContentReady &&
      !sidebarPreviewReady &&
      !desktopUpdateActive(desktopUpdater.getStatus()),
  );
};

const resolveWebsiteMetadata = async (
  input: string,
): Promise<{
  url: string;
  title: string;
  faviconUrl: string | null;
  faviconSource: WebsiteProject['faviconSource'];
}> => {
  if (!websiteView) throw new Error('网站视图不可用');
  const url = normalizeWebsiteUrl(input);
  currentPageTitle = '';
  currentPageFaviconUrl = null;
  await websiteView.webContents.loadURL(url);
  const title =
    currentPageTitle || websiteView.webContents.getTitle().trim() || new URL(url).hostname;
  if (currentPageFaviconUrl)
    return { url, title, faviconUrl: currentPageFaviconUrl, faviconSource: 'page' };
  return {
    url,
    title,
    faviconUrl: new URL('/favicon.ico', url).href,
    faviconSource: 'root',
  };
};

const queueCloudStateSave = (projectId: string): void => {
  const generation = cloudSessionGeneration;
  const previous = cloudStateSaveQueues.get(projectId) ?? Promise.resolve();
  const next = previous
    .catch(() => undefined)
    .then(async () => {
      if (generation !== cloudSessionGeneration) return;
      const snapshot = cloudProjectStates.get(projectId);
      if (!snapshot) return;
      let saved: CloudProjectState;
      try {
        saved = await api.saveCloudProjectState(snapshot);
      } catch (error) {
        if (!(error instanceof MarkFixApiError) || error.status !== 409) throw error;
        const remote = await api.getCloudProjectState(projectId);
        if (!remote) throw error;
        if (generation !== cloudSessionGeneration) return;
        const desired = cloudProjectStates.get(projectId) ?? snapshot;
        if (remote.project.updatedAt > desired.project.updatedAt) {
          cloudProjectStates.set(projectId, remote);
          websiteProjectsById.set(projectId, remote.project);
          return;
        }
        saved = await api.saveCloudProjectState({ ...desired, revision: remote.revision });
      }
      if (generation !== cloudSessionGeneration) return;
      const desired = cloudProjectStates.get(projectId);
      if (!desired || desired === snapshot) {
        cloudProjectStates.set(projectId, saved);
        websiteProjectsById.set(projectId, saved.project);
      } else {
        cloudProjectStates.set(projectId, { ...desired, revision: saved.revision });
      }
    })
    .catch((error: unknown) => {
      sendShell(ipcChannels.syncStatus, {
        status: 'pending',
        projectId,
        message: error instanceof Error ? error.message : '云端项目状态保存失败',
      });
    });
  cloudStateSaveQueues.set(projectId, next);
};

const recordProjectPage = (
  projectId: string,
  pageUrl: string,
  pageTitle: string,
): WebsiteProject | undefined => {
  const project = websiteProjectsById.get(projectId);
  if (!project) return undefined;
  if (project.storageMode === 'LOCAL') {
    const updated = draftStore?.recordProjectPage(projectId, pageUrl, pageTitle);
    if (updated) websiteProjectsById.set(projectId, updated);
    return updated;
  }
  const state = cloudProjectStates.get(projectId);
  if (!state) return undefined;
  const existing = state.navigation.entries.find(({ url }) => url === pageUrl);
  const pageSessionId = existing?.pageSessionId ?? randomUUID();
  const entry = { pageSessionId, url: pageUrl, title: pageTitle };
  const current = state.navigation.entries[state.navigation.currentIndex];
  const entries =
    current?.url === pageUrl
      ? state.navigation.entries.map((item, index) =>
          index === state.navigation.currentIndex ? entry : item,
        )
      : [...state.navigation.entries.slice(0, state.navigation.currentIndex + 1), entry].slice(
          -200,
        );
  const currentIndex =
    current?.url === pageUrl ? state.navigation.currentIndex : entries.length - 1;
  const updatedProject: WebsiteProject = {
    ...project,
    currentPageSessionId: pageSessionId,
    currentUrl: pageUrl,
    updatedAt: new Date().toISOString(),
  };
  cloudProjectStates.set(projectId, {
    ...state,
    project: updatedProject,
    navigation: { entries, currentIndex },
  });
  websiteProjectsById.set(projectId, updatedProject);
  queueCloudStateSave(projectId);
  return updatedProject;
};

const stepProjectHistory = (
  projectId: string,
  offset: -1 | 1,
): { pageSessionId: string; url: string; title: string } | undefined => {
  const project = websiteProjectsById.get(projectId);
  if (!project) return undefined;
  if (project.storageMode === 'LOCAL') return draftStore?.stepProjectHistory(projectId, offset);
  const state = cloudProjectStates.get(projectId);
  if (!state) return undefined;
  const currentIndex = state.navigation.currentIndex + offset;
  const entry = state.navigation.entries[currentIndex];
  if (!entry) return undefined;
  const updatedProject: WebsiteProject = {
    ...project,
    currentPageSessionId: entry.pageSessionId,
    currentUrl: entry.url,
    updatedAt: new Date().toISOString(),
  };
  cloudProjectStates.set(projectId, {
    ...state,
    project: updatedProject,
    navigation: { ...state.navigation, currentIndex },
  });
  websiteProjectsById.set(projectId, updatedProject);
  queueCloudStateSave(projectId);
  return entry;
};

const ensureWebsiteProjects = async (
  availableProjects?: Awaited<ReturnType<MarkFixApi['listProjects']>>,
): Promise<WebsiteProject[]> => {
  if (!draftStore) return [];
  const localProjects = draftStore.listWebsiteProjects('LOCAL');
  for (const project of localProjects) websiteProjectsById.set(project.id, project);
  if (!authenticatedUser) return localProjects;
  for (const [id, project] of websiteProjectsById) {
    if (project.storageMode === 'CLOUD') websiteProjectsById.delete(id);
  }
  cloudProjectStates.clear();
  const projects = availableProjects ?? (await api.listProjects());
  const cloudProjects: WebsiteProject[] = [];
  for (const project of projects) {
    if (!project.baseUrl) continue;
    let entryUrl: string;
    try {
      entryUrl = normalizeWebsiteUrl(project.baseUrl);
    } catch {
      // Projects without a usable HTTP(S) URL are not website annotation projects.
      continue;
    }
    const origin = new URL(entryUrl).origin;
    const now = new Date().toISOString();
    const remoteState = await api.getCloudProjectState(project.id);
    const initialProject = websiteProjectSchema.parse({
      id: project.id,
      storageMode: 'CLOUD',
      title: project.name,
      origin,
      entryUrl,
      faviconUrl: new URL('/favicon.ico', entryUrl).href,
      faviconSource: 'root',
      currentPageSessionId: randomUUID(),
      currentUrl: entryUrl,
      createdAt: project.createdAt,
      updatedAt: project.updatedAt ?? now,
    });
    if (initialProject.storageMode !== 'CLOUD') throw new Error('Invalid cloud project state');
    const state =
      remoteState ??
      (await api.saveCloudProjectState({
        project: initialProject,
        navigation: {
          entries: [
            {
              pageSessionId: initialProject.currentPageSessionId,
              url: entryUrl,
              title: project.name,
            },
          ],
          currentIndex: 0,
        },
        revision: 0,
      }));
    cloudProjectStates.set(project.id, state);
    websiteProjectsById.set(project.id, state.project);
    cloudProjects.push(state.project);
  }
  return [...localProjects, ...cloudProjects].sort((left, right) =>
    right.updatedAt.localeCompare(left.updatedAt),
  );
};

const activateWebsiteProject = (projectId: string, switchGeneration: number): WebsiteProject => {
  if (!draftStore) throw new Error('本地项目存储不可用');
  if (!websiteView) throw new Error('网站视图不可用');
  const project = websiteProjectsById.get(projectId);
  if (!project) throw new Error('项目不存在或已被移除');
  const targetUrl = project.currentUrl || project.entryUrl;
  if (
    activeWebsiteProjectId === project.id &&
    websiteContentReady &&
    websiteView.webContents.getURL() === targetUrl
  ) {
    sendBrowserState({
      url: targetUrl,
      pageTitle: currentPageTitle,
      pageSessionId: project.currentPageSessionId,
    });
    return project;
  }

  activeWebsiteProjectId = project.id;
  navigationWebsiteProjectId = project.id;
  websiteContentReady = false;
  layoutWebsite();
  websiteView.webContents.stop();
  void websiteView.webContents
    .loadURL(normalizeWebsiteUrl(targetUrl))
    .catch((error: unknown) => {
      if (switchGeneration !== websiteProjectSwitchGeneration) return;
      const description =
        typeof (error as { code?: unknown }).code === 'string'
          ? String((error as { code: string }).code)
          : error instanceof Error
            ? error.message
            : 'ERR_FAILED';
      sendBrowserState({
        loading: false,
        loadFailure: websiteLoadFailure(targetUrl, description),
      });
    })
    .finally(() => {
      if (switchGeneration === websiteProjectSwitchGeneration)
        navigationWebsiteProjectId = undefined;
    });
  return project;
};

const createWindow = async (): Promise<void> => {
  mainWindow = new BrowserWindow({
    ...macWindowMaterial,
    width: 1440,
    height: 900,
    minWidth: 1060,
    minHeight: 680,
    titleBarStyle: 'hiddenInset',
    trafficLightPosition: { x: 16, y: 20 },
    title: '',
    backgroundColor: process.platform === 'darwin' ? '#00000000' : '#f4f4ef',
    webPreferences: {
      preload: join(__dirname, '../preload/shell.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });
  shellWebContentsId = mainWindow.webContents.id;
  mainWindow.on('page-title-updated', (event) => event.preventDefault());
  const syncFullscreen = () => {
    mainWindow?.webContents.send('window:fullscreen-changed', mainWindow.isFullScreen());
  };
  mainWindow.on('enter-full-screen', syncFullscreen);
  mainWindow.on('leave-full-screen', syncFullscreen);
  mainWindow.webContents.on('dom-ready', syncFullscreen);
  registerMainShortcuts(mainWindow, mainWindow.webContents);
  websiteView = new WebContentsView({
    webPreferences: {
      preload: join(__dirname, '../preload/target.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      webSecurity: true,
      partition: 'persist:markfix-profile-default',
    },
  });
  registerMainShortcuts(mainWindow, websiteView.webContents);
  websiteView.setVisible(false);
  mainWindow.contentView.addChildView(websiteView);
  layoutWebsite();
  mainWindow.on('resize', layoutWebsite);

  websiteView.webContents.setWindowOpenHandler(({ url }) => {
    if (isWebsiteUrlAllowed(url)) void websiteView?.webContents.loadURL(url);
    return { action: 'deny' };
  });
  websiteView.webContents.on('did-start-navigation', (_event, _url, isInPlace, isMainFrame) => {
    if (!isMainFrame || isInPlace) return;
    pageLoading = true;
    currentPageTitle = '';
    currentPageFaviconUrl = null;
    sendBrowserState({
      loading: true,
      pageTitle: '',
      faviconUrl: null,
      error: null,
      loadFailure: null,
    });
  });
  websiteView.webContents.on('dom-ready', () => {
    pageLoading = false;
    sendBrowserState();
    void websiteView?.webContents
      .insertCSS('html::-webkit-scrollbar, body::-webkit-scrollbar { height: 0 !important; }', {
        cssOrigin: 'user',
      })
      .catch((error: unknown) => console.warn('Unable to hide the horizontal scrollbar', error));
    if (!navigationWebsiteProjectId || navigationWebsiteProjectId !== activeWebsiteProjectId)
      return;
    websiteContentReady = true;
    layoutWebsite();
  });
  websiteView.webContents.on('did-stop-loading', () => {
    pageLoading = false;
    sendBrowserState();
  });
  websiteView.webContents.on('will-navigate', (event, url) => {
    if (enforceWebsiteNavigationPolicy(event, url)) sendBrowserState({ url });
  });
  websiteView.webContents.on('will-redirect', (event, url) => {
    enforceWebsiteNavigationPolicy(event, url);
  });
  websiteView.webContents.on('did-navigate', (_event, url) => {
    const navigationProjectId = navigationWebsiteProjectId ?? activeWebsiteProjectId;
    const project = navigationProjectId
      ? recordProjectPage(navigationProjectId, url, websiteView?.webContents.getTitle() ?? '')
      : undefined;
    sendBrowserState({
      url,
      ...(project ? { pageSessionId: project.currentPageSessionId } : {}),
    });
    updatePageRevision();
  });
  websiteView.webContents.on('did-navigate-in-page', (_event, url) => {
    const navigationProjectId = navigationWebsiteProjectId ?? activeWebsiteProjectId;
    const project = navigationProjectId
      ? recordProjectPage(navigationProjectId, url, websiteView?.webContents.getTitle() ?? '')
      : undefined;
    sendBrowserState({
      url,
      ...(project ? { pageSessionId: project.currentPageSessionId } : {}),
    });
    updatePageRevision();
    void refreshCaptureSnapshot();
  });
  websiteView.webContents.on('page-title-updated', (_event, title) => {
    currentPageTitle = title.trim();
    const url = websiteView?.webContents.getURL();
    const navigationProjectId = navigationWebsiteProjectId ?? activeWebsiteProjectId;
    const project =
      navigationProjectId && url
        ? recordProjectPage(navigationProjectId, url, currentPageTitle)
        : undefined;
    sendBrowserState({
      pageTitle: currentPageTitle,
      ...(project ? { pageSessionId: project.currentPageSessionId } : {}),
    });
  });
  websiteView.webContents.on('page-favicon-updated', (_event, favicons) => {
    const faviconUrl = favicons.find((candidate) => {
      if (candidate.length > 4096) return false;
      try {
        return ['http:', 'https:', 'data:'].includes(new URL(candidate).protocol);
      } catch {
        return false;
      }
    });
    if (!faviconUrl) return;
    currentPageFaviconUrl = faviconUrl;
    const navigationProjectId = navigationWebsiteProjectId ?? activeWebsiteProjectId;
    if (navigationProjectId) {
      const project = websiteProjectsById.get(navigationProjectId);
      if (project && project.faviconUrl !== faviconUrl) {
        const updated: WebsiteProject = {
          ...project,
          faviconUrl,
          faviconSource: 'page',
          updatedAt: new Date().toISOString(),
        };
        websiteProjectsById.set(navigationProjectId, updated);
        if (updated.storageMode === 'LOCAL') draftStore?.saveWebsiteProject(updated);
        else {
          const state = cloudProjectStates.get(navigationProjectId);
          if (state) {
            cloudProjectStates.set(navigationProjectId, { ...state, project: updated });
            queueCloudStateSave(navigationProjectId);
          }
        }
      }
    }
    sendBrowserState({ faviconUrl });
  });
  websiteView.webContents.on('did-finish-load', () => {
    const url = websiteView?.webContents.getURL();
    const pageTitle = currentPageTitle || websiteView?.webContents.getTitle() || '';
    const navigationProjectId = navigationWebsiteProjectId ?? activeWebsiteProjectId;
    const project =
      navigationProjectId && url
        ? recordProjectPage(navigationProjectId, url, pageTitle)
        : undefined;
    if (url)
      sendBrowserState({
        url,
        pageTitle,
        ...(project ? { pageSessionId: project.currentPageSessionId } : {}),
      });
    websiteView?.webContents.send('markfix:set-mode', currentBrowserMode);
    void refreshCaptureSnapshot();
    websiteView?.webContents.send('markfix:render-element-comments', currentElementComments);
    if (currentAnchor?.kind === 'element')
      websiteView?.webContents.send('markfix:resolve-anchor', {
        anchor: currentAnchor,
        force: true,
      });
    navigationWebsiteProjectId = undefined;
  });
  websiteView.webContents.on('did-fail-load', (_event, code, description, url, isMainFrame) => {
    if (!isMainFrame || code === -3) return;
    pageLoading = false;
    websiteContentReady = false;
    navigationWebsiteProjectId = undefined;
    layoutWebsite();
    sendBrowserState({
      url,
      loading: false,
      loadFailure: websiteLoadFailure(url, description, code),
    });
  });

  inspector = new CdpInspector(
    websiteView.webContents,
    (anchor) => {
      currentAnchor = anchor;
      sendShell(ipcChannels.selection, anchor);
      websiteView?.webContents.send('markfix:show-anchor', anchor);
    },
    (message) => {
      currentBrowserMode = 'browse';
      sendBrowserState({ error: `${message}. Element annotation is unavailable.` });
      websiteView?.webContents.send('markfix:set-mode', 'browse');
      void inspector?.stop();
    },
  );
  captureService = new CaptureService(
    websiteView.webContents,
    () => websiteView?.getBounds() ?? { width: 1, height: 1, x: 0, y: 0 },
    () => pageRevision,
    setOverlayHidden,
  );
  diagnosticConsole = new DiagnosticConsole(
    websiteView.webContents,
    () => pageRevision,
    (entry) => sendShell(ipcChannels.diagnosticsEvent, entry),
  );
  void diagnosticConsole.start().catch((error: unknown) => {
    sendBrowserState({
      error: error instanceof Error ? error.message : 'Unable to start website diagnostics',
    });
  });

  if (process.env.ELECTRON_RENDERER_URL)
    await mainWindow.loadURL(process.env.ELECTRON_RENDERER_URL);
  else await mainWindow.loadFile(join(__dirname, '../renderer/index.html'));
};

const registerIpc = (): void => {
  registerAnnotationStoreIpc({
    assertSender: assertShellSender,
    dataRouter: () => projectDataRouter,
    projects: () => [...websiteProjectsById.values()],
    activeProjectId: () => activeWebsiteProjectId,
    websiteView: () => websiteView,
    elementComments: () => currentElementComments,
    setElementComments: (comments) => {
      currentElementComments = comments;
    },
    sendShell,
  });
  registerCaptureIpc({
    reselectElement: (x, y) => {
      if (currentBrowserMode === 'comment') void inspector?.selectAt(x, y);
    },
    assertSender: assertShellSender,
    captureService: () => captureService,
    mainWindow: () => mainWindow,
    sendShell,
    websiteView: () => websiteView,
  });
  registerDiagnosticsIpc({
    assertSender: assertShellSender,
    console: () => diagnosticConsole,
    setOpen: (open) => {
      diagnosticsOpen = open;
      const consoleMenu = Menu.getApplicationMenu()?.getMenuItemById('project-console');
      if (consoleMenu) consoleMenu.checked = open;
      layoutWebsite();
    },
  });
  reportOutbox.registerIpc(assertShellSender);
  ipcMain.handle(desktopUpdateChannels.start, (event) => {
    if (event.sender.id !== shellWebContentsId) throw new Error('Untrusted update sender');
    return desktopUpdater.start();
  });
  ipcMain.handle(desktopUpdateChannels.status, (event) => {
    if (event.sender.id !== shellWebContentsId) throw new Error('Untrusted update sender');
    return desktopUpdater.getStatus();
  });
  ipcMain.handle('website:open-official', async (event) => {
    assertShellSender(event);
    await promisify(execFile)('/usr/bin/open', ['-a', 'Google Chrome', services.origin]);
  });
  ipcMain.handle(accountPageChannel, async (event, page: unknown) => {
    if (event.sender.id !== shellWebContentsId) throw new Error('Untrusted account page sender');
    await shell.openExternal(accountPageUrl(page, services.origin));
  });
  ipcMain.handle(ipcChannels.enterLocalMode, (event) => {
    if (event.sender.id !== shellWebContentsId) throw new Error('Untrusted local mode sender');
    localMode = true;
    authenticatedUser = undefined;
    api.setTokens();
    cloudSessionGeneration++;
    for (const [id, project] of websiteProjectsById)
      if (project.storageMode === 'CLOUD') websiteProjectsById.delete(id);
    cloudProjectStates.clear();
    cloudStateSaveQueues.clear();
    layoutWebsite();
  });
  ipcMain.handle(ipcChannels.authStatus, async (event) => {
    assertSubscriptionSender(event);
    const policy = await loadClientPolicy(true).catch(() => undefined);
    if (localMode) return { authenticated: false };
    if (policy?.status === 'upgrade-required') {
      websiteView?.setVisible(false);
      return { authenticated: false, policy };
    }
    const user = await restoreSession();
    if (localMode) {
      api.setTokens();
      return { authenticated: false };
    }
    return {
      authenticated: Boolean(user),
      ...(user ? { user } : {}),
      ...(policy ? { policy } : {}),
    };
  });
  const authenticateDesktop = async (email: string, password: string) => {
    const tokens = await api.loginWithTokens(email, password, 'MarkFix desktop');
    api.setTokens(tokens);
    await saveRefreshToken(tokens.refreshToken);
    authenticatedUser = await api.me();
    localMode = false;
    layoutWebsite();
    void reportOutbox.flush();
    return authenticatedUser;
  };
  ipcMain.handle(ipcChannels.authRegister, async (event, input: unknown) => {
    assertShellSender(event);
    const payload = desktopRegistrationInput(input);
    assertSupportedClient(await loadClientPolicy(true));
    const result = await api.register(payload);
    if (!result.verificationToken) {
      return { authenticated: false, verificationRequired: true, email: result.user.email };
    }
    await api.verifyEmail(result.verificationToken);
    return {
      authenticated: true,
      user: await authenticateDesktop(payload.email, payload.password),
    };
  });
  ipcMain.handle(ipcChannels.authLogin, async (event, input: unknown) => {
    assertShellSender(event);
    const payload = input as { email?: unknown; password?: unknown };
    if (typeof payload.email !== 'string' || typeof payload.password !== 'string') {
      throw new Error('Email and password are required');
    }
    assertSupportedClient(await loadClientPolicy(true));
    return authenticateDesktop(payload.email, payload.password);
  });
  ipcMain.handle(ipcChannels.authChangePassword, async (event, input: unknown) => {
    assertSubscriptionSender(event);
    if (localMode || !authenticatedUser) throw new Error('Sign in to change the password');
    const payload = desktopPasswordChangeInput(input);
    return api.changePassword(payload.currentPassword, payload.newPassword);
  });
  ipcMain.handle(ipcChannels.authLogout, async (event) => {
    assertShellSender(event);
    if (localMode) {
      localMode = false;
      websiteView?.setVisible(false);
      return true;
    }
    if (!mainWindow || mainWindow.isDestroyed()) throw new Error('Desktop window is unavailable');
    const { response } = await dialog.showMessageBox(mainWindow, {
      type: 'question',
      title: '退出登录',
      message: '确定要退出登录吗？',
      detail: '退出后需要重新登录才能继续使用 MarkFix。',
      buttons: ['取消', '退出登录'],
      defaultId: 0,
      cancelId: 0,
      noLink: true,
    });
    if (response !== 1) return false;
    try {
      await api.logout();
    } catch {
      // A remote logout failure must not retain local credentials.
    } finally {
      authenticatedUser = undefined;
      cloudSessionGeneration += 1;
      for (const [id, project] of websiteProjectsById) {
        if (project.storageMode === 'CLOUD') websiteProjectsById.delete(id);
      }
      cloudProjectStates.clear();
      cloudStateSaveQueues.clear();
      api.setTokens();
      websiteView?.setVisible(false);
      childWindows.closeSettings();
      await clearRefreshToken();
    }
    return true;
  });
  ipcMain.handle(ipcChannels.desktopBootstrap, async (event) => {
    assertShellSender(event);
    if (!authenticatedUser && !localMode) throw new Error('请选择本机模式或登录');
    const websiteProjects = await ensureWebsiteProjects();
    return { websiteProjects };
  });
  ipcMain.handle(subscriptionIpcChannels.get, async (event) => {
    assertSubscriptionSender(event);
    if (!authenticatedUser) throw new Error('Sign in to load the subscription');
    return api.getSubscription();
  });
  ipcMain.handle(subscriptionIpcChannels.upgrade, async (event) => {
    assertSubscriptionSender(event);
    if (!authenticatedUser) throw new Error('Sign in to manage the subscription');
    return api.requestSubscriptionUpgrade();
  });
  ipcMain.handle(ipcChannels.listEnvironments, async (event, input: unknown) => {
    assertShellSender(event);
    if (!authenticatedUser) throw new Error('Sign in to load environments');
    if (typeof input !== 'string') throw new Error('Invalid project ID');
    return api.listEnvironments(input);
  });
  ipcMain.handle(ipcChannels.getProjectAgentData, async (event, projectId: unknown) => {
    assertShellSender(event);
    if (typeof projectId !== 'string') throw new Error('Invalid project ID');
    const project = websiteProjectsById.get(projectId);
    if (!project) throw new Error('Project not found');
    if (project.storageMode === 'LOCAL')
      return {
        binding: requireLocalAgent().binding(projectId),
        repositories: requireLocalAgent().repositories(projectId),
        canManage: true,
      };
    const remote = (await api.listProjects()).find(({ id }) => id === projectId);
    if (!remote) throw new Error('Project access is required');
    const canManage = remote.role === 'OWNER' || remote.role === 'ADMIN';
    const [binding, repositories] = await Promise.all([
      api.requestJson<{ repositoryId: string | null; repositoryName: string | null }>(
        `/v1/agent/projects/${projectId}/binding`,
      ),
      canManage
        ? api.requestJson<AgentRepository[]>(`/v1/agent/projects/${projectId}/repositories`)
        : [],
    ]);
    return { binding, repositories, canManage };
  });
  ipcMain.handle(ipcChannels.setProjectRepository, async (event, input: unknown) => {
    assertShellSender(event);
    const payload = input as { projectId?: unknown; binding?: unknown };
    if (typeof payload.projectId !== 'string') throw new Error('Invalid project ID');
    const binding = repositoryBindingSchema.parse(payload.binding);
    const project = websiteProjectsById.get(payload.projectId);
    if (!project) throw new Error('Project not found');
    if (project.storageMode === 'LOCAL') {
      const result = requireLocalAgent().bind(project.id, binding);
      const updated = draftStore?.getWebsiteProject(project.id);
      if (updated) websiteProjectsById.set(project.id, updated);
      return result;
    }
    return api.requestJson(`/v1/agent/projects/${project.id}/binding`, {
      method: 'PATCH',
      body: JSON.stringify(binding),
    });
  });
  ipcMain.handle(ipcChannels.listWebsiteProjects, (event) => {
    assertShellSender(event);
    return [...websiteProjectsById.values()].sort((left, right) =>
      right.updatedAt.localeCompare(left.updatedAt),
    );
  });
  ipcMain.handle(ipcChannels.createWebsiteProject, async (event, input: unknown) => {
    assertShellSender(event);
    if (!draftStore) throw new Error('本地项目存储不可用');
    const payload = input as { url?: unknown; storageMode?: unknown };
    if (
      typeof payload.url !== 'string' ||
      (payload.storageMode !== 'LOCAL' && payload.storageMode !== 'CLOUD')
    )
      throw new Error('请选择项目存储方式并输入网站地址');
    const storageMode = payload.storageMode satisfies ProjectStorageMode;
    if (storageMode === 'CLOUD' && !authenticatedUser) throw new Error('请先登录后再新建云端项目');
    const normalized = normalizeWebsiteUrl(payload.url);
    const origin = new URL(normalized).origin;
    const existing =
      storageMode === 'LOCAL'
        ? draftStore.findWebsiteProjectByOrigin(origin, 'LOCAL')
        : [...websiteProjectsById.values()].find(
            (project) => project.storageMode === 'CLOUD' && project.origin === origin,
          );
    if (existing) {
      return { project: existing, created: false };
    }

    activeWebsiteProjectId = undefined;
    const metadata = await resolveWebsiteMetadata(normalized);
    const now = new Date().toISOString();
    const remoteProject =
      storageMode === 'CLOUD'
        ? await api.createProject({
            name: metadata.title.slice(0, 120),
            baseUrl: origin,
          })
        : undefined;
    const websiteProject = websiteProjectSchema.parse({
      id: remoteProject?.id ?? randomUUID(),
      storageMode,
      title: (currentPageTitle || metadata.title).slice(0, 120),
      origin,
      entryUrl: metadata.url,
      faviconUrl: currentPageFaviconUrl ?? metadata.faviconUrl,
      faviconSource: currentPageFaviconUrl ? 'page' : metadata.faviconSource,
      currentPageSessionId: randomUUID(),
      currentUrl: metadata.url,
      createdAt: remoteProject?.createdAt ?? now,
      updatedAt: now,
    });
    let current: WebsiteProject;
    if (websiteProject.storageMode === 'LOCAL') {
      draftStore.saveWebsiteProject(websiteProject);
      current =
        draftStore.recordProjectPage(websiteProject.id, metadata.url, metadata.title) ??
        websiteProject;
    } else {
      const state = await api.saveCloudProjectState({
        project: websiteProject,
        navigation: {
          entries: [
            {
              pageSessionId: websiteProject.currentPageSessionId,
              url: metadata.url,
              title: metadata.title,
            },
          ],
          currentIndex: 0,
        },
        revision: 0,
      });
      cloudProjectStates.set(websiteProject.id, state);
      current = state.project;
    }
    websiteProjectsById.set(current.id, current);
    activeWebsiteProjectId = websiteProject.id;
    workspaceViewVisible = true;
    websiteContentReady = true;
    layoutWebsite();
    return { project: current, created: true };
  });
  ipcMain.handle(ipcChannels.listProjectAnnotationReports, async (event, input: unknown) => {
    assertShellSender(event);
    if (!authenticatedUser && !localMode) throw new Error('请选择本机模式或登录');
    const payload = input as { projectId?: unknown; pageUrl?: unknown };
    if (typeof payload.projectId !== 'string' || typeof payload.pageUrl !== 'string')
      throw new Error('无效的项目或页面地址');
    const project = websiteProjectsById.get(payload.projectId);
    if (!project) throw new Error('项目不存在或已被移除');
    return project.storageMode === 'CLOUD'
      ? api.listAllReports(payload.projectId, { pageUrl: payload.pageUrl })
      : requireLocalAgent().reports(payload.projectId, payload.pageUrl);
  });
  ipcMain.handle(ipcChannels.switchWebsiteProject, (event, input: unknown) => {
    assertShellSender(event);
    if (typeof input !== 'string') throw new Error('无效的项目 ID');
    const switchGeneration = ++websiteProjectSwitchGeneration;
    return activateWebsiteProject(input, switchGeneration);
  });
  ipcMain.handle(ipcChannels.deleteWebsiteProject, async (event, input: unknown) => {
    assertShellSender(event);
    if (typeof input !== 'string') throw new Error('无效的项目 ID');
    if (!draftStore) throw new Error('本地项目存储不可用');
    if (!mainWindow || mainWindow.isDestroyed()) throw new Error('Desktop window is unavailable');
    const project = websiteProjectsById.get(input);
    if (!project) throw new Error('项目不存在或已被移除');
    if (project.storageMode === 'CLOUD') await api.deleteProject(project.id);
    else draftStore.deleteWebsiteProject(project.id);
    websiteProjectsById.delete(project.id);
    cloudProjectStates.delete(project.id);
    if (activeWebsiteProjectId === project.id) {
      activeWebsiteProjectId = undefined;
      navigationWebsiteProjectId = undefined;
      workspaceViewVisible = false;
      websiteContentReady = false;
      currentElementComments = [];
      currentAnchor = undefined;
      layoutWebsite();
      void websiteView?.webContents.loadURL('about:blank');
    }
    childWindows.closeProjectWindows(project.id);
    return { deleted: true };
  });
  ipcMain.handle(ipcChannels.confirmDiscardDraft, async (event, input: unknown) => {
    assertShellSender(event);
    if (input !== 'switch-project' && input !== 'new-annotation') throw new Error('无效的确认场景');
    if (!mainWindow || mainWindow.isDestroyed()) throw new Error('Desktop window is unavailable');
    const switchingProject = input === 'switch-project';
    const { response } = await dialog.showMessageBox(mainWindow, {
      type: 'warning',
      title: switchingProject ? '切换项目' : '进入新网站',
      message: '要放弃当前未保存的编辑内容吗？',
      detail: switchingProject
        ? '切换项目后，当前尚未完成的批注编辑不会保留。'
        : '进入新网站后，当前尚未完成的批注编辑不会保留。',
      buttons: ['取消', switchingProject ? '放弃并切换' : '放弃并继续'],
      defaultId: 0,
      cancelId: 0,
      noLink: true,
    });
    return response === 1;
  });
  ipcMain.on('window:sidebar-preview-ready', (event, version: unknown) => {
    if (
      event.sender.id !== shellWebContentsId ||
      version !== sidebarPreviewVersion ||
      sidebarPeekWidth === 0
    )
      return;
    sidebarPreviewReady = true;
    layoutWebsite();
  });
  ipcMain.handle(ipcChannels.setWorkspaceLayout, async (event, input: unknown) => {
    assertShellSender(event);
    const payload = input as {
      sidebarWidth?: unknown;
      visible?: unknown;
      peekWidth?: unknown;
      panelWidth?: unknown;
    };
    if (!isSidebarWidth(payload.sidebarWidth)) throw new Error('无效的侧边栏宽度');
    if (typeof payload.visible !== 'boolean') throw new Error('无效的标注界面显示状态');
    if (!isSidebarWidth(payload.peekWidth ?? 0)) throw new Error('无效的侧边栏预览宽度');
    if (!isSidebarWidth(payload.panelWidth)) throw new Error('无效的批注栏宽度');
    const window = mainWindow;
    const view = websiteView;
    if (!window || window.isDestroyed() || !view || view.webContents.isDestroyed()) return;
    panelWidth = payload.panelWidth;
    const previousPeek = sidebarPeekWidth;
    sidebarPeekWidth = (payload.peekWidth ?? 0) as number;
    navigationSidebarWidth = payload.sidebarWidth;
    workspaceViewVisible = payload.visible;
    if (sidebarPeekWidth === 0 || !workspaceViewVisible) {
      sidebarPreviewVersion++;
      sidebarPreviewReady = false;
      window.webContents.send('window:sidebar-preview', null);
    } else if (previousPeek === 0 && websiteContentReady) {
      layoutWebsite();
      const version = ++sidebarPreviewVersion;
      const contents = view.webContents;
      if (!contents.debugger.isAttached()) contents.debugger.attach('1.3');
      const screenshot = (await contents.debugger
        .sendCommand('Page.captureScreenshot', {
          format: 'png',
          fromSurface: true,
          captureBeyondViewport: false,
        })
        .catch((error: unknown) => {
          if (!contents.isDestroyed() && !window.isDestroyed())
            console.warn('Unable to capture sidebar preview', error);
          return null;
        })) as { data: string } | null;
      if (
        screenshot &&
        version === sidebarPreviewVersion &&
        sidebarPeekWidth > 0 &&
        mainWindow === window &&
        websiteView === view &&
        !window.isDestroyed() &&
        !contents.isDestroyed()
      ) {
        window.webContents.send('window:sidebar-preview', {
          version,
          dataUrl: `data:image/png;base64,${screenshot.data}`,
          bounds: view.getBounds(),
        });
      }
    }
    layoutWebsite();
  });
  ipcMain.handle(ipcChannels.openSettings, async (event) => {
    assertShellSender(event);
    await childWindows.openSettings();
  });
  ipcMain.handle(ipcChannels.navigate, async (event, input: unknown) => {
    assertShellSender(event);
    const { url } = navigateInputSchema.parse(input);
    const normalized = normalizeWebsiteUrl(url);
    navigationWebsiteProjectId = activeWebsiteProjectId;
    websiteContentReady = false;
    layoutWebsite();
    await websiteView?.webContents.loadURL(normalized);
    return normalized;
  });
  ipcMain.handle(ipcChannels.goBack, async (event) => {
    assertShellSender(event);
    if (!activeWebsiteProjectId) return;
    const entry = stepProjectHistory(activeWebsiteProjectId, -1);
    if (entry) {
      navigationWebsiteProjectId = activeWebsiteProjectId;
      websiteContentReady = false;
      layoutWebsite();
      await websiteView?.webContents.loadURL(normalizeWebsiteUrl(entry.url));
    }
  });
  ipcMain.handle(ipcChannels.goForward, async (event) => {
    assertShellSender(event);
    if (!activeWebsiteProjectId) return;
    const entry = stepProjectHistory(activeWebsiteProjectId, 1);
    if (entry) {
      navigationWebsiteProjectId = activeWebsiteProjectId;
      websiteContentReady = false;
      layoutWebsite();
      await websiteView?.webContents.loadURL(normalizeWebsiteUrl(entry.url));
    }
  });
  ipcMain.handle(ipcChannels.reload, (event) => {
    assertShellSender(event);
    refreshCurrentProject();
  });
  ipcMain.handle(ipcChannels.setMode, async (event, input: unknown) => {
    assertShellSender(event);
    const mode = browserModeSchema.parse(input);
    if (currentBrowserMode === 'comment') await inspector?.stop();
    const enteringCapture = mode === 'capture' && currentBrowserMode !== 'capture';
    if (enteringCapture) {
      const snapshot = await captureService?.freeze();
      if (!snapshot) throw new Error('Capture service is unavailable');
      websiteView?.webContents.send('markfix:capture-snapshot', snapshot.dataUrl);
    } else if (mode !== 'capture') {
      captureService?.clearSnapshot();
      websiteView?.webContents.send('markfix:capture-snapshot', null);
    }
    currentBrowserMode = mode;
    layoutWebsite();
    websiteView?.webContents.send('markfix:set-mode', mode);
    if (mode === 'comment') await inspector?.start();
  });
  ipcMain.handle(ipcChannels.openAnnotationReview, async (event, input: unknown) => {
    assertShellSender(event);
    if (typeof input !== 'string') throw new Error('无效的项目 ID');
    const project = websiteProjectsById.get(input);
    if (!project) throw new Error('项目不存在或已被移除');
    await childWindows.openAnnotationReview(input, project.storageMode);
  });
  ipcMain.handle(ipcChannels.closeAnnotationReview, (event) => {
    assertShellSender(event);
    childWindows.closeAnnotationReview();
  });
  ipcMain.handle(ipcChannels.openAnnotationHistory, async (event) => {
    assertShellSender(event);
    await childWindows.openAnnotationHistory();
  });
  ipcMain.handle(ipcChannels.openProjectAnnotationHistory, async (event, input: unknown) => {
    assertShellSender(event);
    if (typeof input !== 'string') throw new Error('无效的项目 ID');
    if (!websiteProjectsById.has(input)) throw new Error('项目不存在或已被移除');
    await childWindows.openProjectAnnotationHistory(input);
  });
  ipcMain.handle(ipcChannels.selectAnnotationHistory, async (event, input: unknown) => {
    assertShellSender(event);
    const reference = historyAnnotationReferenceSchema.parse(input);
    const exists =
      reference.type === 'element'
        ? (await projectDataRouter.listElementComments(reference.projectId)).some(
            ({ id }) => id === reference.id,
          )
        : reference.type === 'capture'
          ? (await projectDataRouter.listCaptures(reference.projectId)).some(
              ({ id }) => id === reference.id,
            )
          : (await projectDataRouter.listDiagnostics(reference.projectId)).some(
              ({ id }) => id === reference.id,
            );
    if (!exists) throw new Error('标注不存在或已被删除');
    sendShell(ipcChannels.annotationHistorySelected, reference);
    childWindows.focusMainFromHistory();
  });
  ipcMain.handle(ipcChannels.openCapturePreview, async (event, input: unknown) => {
    assertShellSender(event);
    const payload = input as { projectId?: unknown; captureId?: unknown };
    if (typeof payload.projectId !== 'string' || typeof payload.captureId !== 'string')
      throw new Error('Invalid project or capture ID');
    await childWindows.openCapturePreview(payload.projectId, payload.captureId);
  });
  ipcMain.handle(ipcChannels.loadCapturePreview, async (event, input: unknown) => {
    assertShellSender(event);
    const payload = input as { projectId?: unknown; captureId?: unknown };
    if (typeof payload.projectId !== 'string' || typeof payload.captureId !== 'string')
      throw new Error('Invalid project or capture ID');
    const capture = (await projectDataRouter.listCaptures(payload.projectId)).find(
      ({ id }) => id === payload.captureId,
    );
    if (!capture) throw new Error('截图不存在或已被删除');
    return capture;
  });
  ipcMain.handle(ipcChannels.syncAnchor, (event, input: unknown) => {
    assertShellSender(event);
    if (input === null) {
      currentAnchor = undefined;
      websiteView?.webContents.send('markfix:clear-anchor');
      return;
    }
    const nextAnchor = anchorSchema.parse(input);
    const alreadyRendered = anchorsEqual(currentAnchor, nextAnchor);
    currentAnchor = nextAnchor;
    if (currentAnchor.kind === 'element' && !alreadyRendered)
      websiteView?.webContents.send('markfix:resolve-anchor', {
        anchor: currentAnchor,
        force: false,
      });
  });
  ipcMain.on('markfix:overlay-visibility-changed', (event, input: unknown) => {
    if (event.sender.id !== websiteView?.webContents.id) return;
    const requestId = (input as { requestId?: unknown }).requestId;
    if (typeof requestId !== 'string') return;
    const resolve = overlayVisibilityWaiters.get(requestId);
    if (!resolve) return;
    overlayVisibilityWaiters.delete(requestId);
    resolve();
  });
  ipcMain.on('markfix:anchor-recovery', (event, input: unknown) => {
    if (event.sender.id !== websiteView?.webContents.id) return;
    const payload = input as {
      status?: unknown;
      anchor?: unknown;
      confidence?: unknown;
      score?: unknown;
      silent?: unknown;
    };
    if (payload.status === 'lost') {
      sendShell(ipcChannels.anchorRecovery, { status: 'lost' });
      return;
    }
    const parsed = anchorSchema.safeParse(payload.anchor);
    if (
      payload.status !== 'resolved' ||
      !parsed.success ||
      parsed.data.kind !== 'element' ||
      !['high', 'medium', 'low'].includes(String(payload.confidence)) ||
      typeof payload.score !== 'number'
    )
      return;
    currentAnchor = parsed.data;
    websiteView?.webContents.send('markfix:show-anchor', parsed.data);
    sendShell(ipcChannels.anchorRecovery, {
      status: 'resolved',
      anchor: parsed.data,
      confidence: payload.confidence,
      score: payload.score,
      silent: payload.silent === true,
    });
  });
};

const singleInstance = app.requestSingleInstanceLock();
if (!singleInstance) app.quit();
app.whenReady().then(async () => {
  if (!singleInstance) return;
  const websiteSession = session.fromPartition('persist:markfix-profile-default');
  websiteSession.setPermissionRequestHandler((_webContents, permission, callback) => {
    callback(['clipboard-sanitized-write'].includes(permission));
  });
  try {
    draftStore = new DraftStore(join(app.getPath('userData'), 'markfix.sqlite'));
  } catch (error) {
    dialog.showErrorBox(
      '无法打开 MarkFix 数据',
      error instanceof Error ? error.message : String(error),
    );
    app.quit();
    return;
  }
  draftStore.recoverInterrupted();
  try {
    localAgent = new LocalAgentService(draftStore, (report) =>
      sendShell(ipcChannels.syncStatus, { status: 'completed', report }),
    );
    localAgentServer = await startLocalAgentServer(
      localAgent,
      process.env.MARKFIX_LOCAL_AGENT_FILE ?? join(homedir(), '.markfix-desktop', 'agent.json'),
    );
  } catch (error) {
    console.error('本机 CLI 接口启动失败', error);
  }

  registerIpc();
  await createWindow();
  const applicationMenu = Menu.getApplicationMenu();
  const menuTemplate = applicationMenu
    ? routeProjectRefreshMenu(applicationMenu.items, refreshCurrentProject)
    : [];
  const consoleItem: MenuItemConstructorOptions = {
    id: 'project-console',
    label: '控制台',
    type: 'checkbox',
    checked: diagnosticsOpen,
    accelerator: 'CommandOrControl+Shift+C',
    click: () => sendShell(ipcChannels.modeShortcut, 'diagnostics'),
  };
  const clearDiagnosticsItem: MenuItemConstructorOptions = {
    label: '清空 Console 和 Network',
    accelerator: 'CommandOrControl+K',
    click: () => sendShell(ipcChannels.modeShortcut, 'clear-diagnostics'),
  };
  const viewMenuIndex =
    applicationMenu?.items.findIndex(
      (item) => item.role === 'viewMenu' || item.label.replaceAll('&', '').toLowerCase() === 'view',
    ) ?? -1;
  const viewMenu = menuTemplate[viewMenuIndex];
  if (viewMenu && Array.isArray(viewMenu.submenu)) {
    viewMenu.submenu.push({ type: 'separator' }, consoleItem, clearDiagnosticsItem);
  } else {
    menuTemplate.push({ label: '视图', submenu: [consoleItem, clearDiagnosticsItem] });
  }
  Menu.setApplicationMenu(Menu.buildFromTemplate(menuTemplate));
  void reportOutbox.flush();
  syncTimer = setInterval(() => void reportOutbox.flush(), 15_000);
});

app.on('before-quit', () => {
  void localAgentServer?.close();
  if (syncTimer) clearInterval(syncTimer);
  inspector?.detach();
  draftStore?.close();
});
app.on('window-all-closed', () => app.quit());
