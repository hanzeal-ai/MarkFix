import { randomUUID } from 'node:crypto';
import { join } from 'node:path';
import {
  app,
  BrowserWindow,
  dialog,
  ipcMain,
  Menu,
  session,
  WebContentsView,
  type IpcMainInvokeEvent,
  type WebContents,
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
  type SavedElementComment,
  type WebsiteProject,
} from '@markfix/contracts';
import { MarkFixApi, MarkFixApiError } from '@markfix/api-client';
import { anchorsEqual } from './anchor-state.js';
import { CdpInspector } from './cdp-inspector.js';
import { CaptureService } from './capture-service.js';
import { DraftStore } from './draft-store.js';
import { DiagnosticConsole } from './diagnostic-console.js';
import { normalizeWebsiteUrl } from './url.js';
import { subscriptionIpcChannels } from '../subscription.js';
import { modeForShortcut } from './mode-shortcuts.js';
import { windowActionForShortcut, type WindowShortcutAction } from './window-shortcuts.js';
import { DesktopSessionManager } from './session-manager.js';
import { websiteLoadFailure } from './website-load-error.js';
import { registerAnnotationStoreIpc } from './ipc/register-annotation-store-ipc.js';
import { ChildWindowManager } from './child-window-manager.js';
import { registerCaptureIpc } from './ipc/register-capture-ipc.js';
import { registerDiagnosticsIpc } from './ipc/register-diagnostics-ipc.js';
import { ReportOutbox } from './report-outbox.js';

const toolbarHeight = 56;
const panelWidth = 360;
const diagnosticsPanelHeight = 300;
const macWindowMaterial =
  process.platform === 'darwin'
    ? ({
        vibrancy: 'under-window',
        visualEffectState: 'followWindow',
      } as const)
    : {};
const api = new MarkFixApi(process.env.MARKFIX_API_URL ?? 'http://localhost:4310');
const desktopSession = new DesktopSessionManager(api);
let mainWindow: BrowserWindow | undefined;
let websiteView: WebContentsView | undefined;
let inspector: CdpInspector | undefined;
let captureService: CaptureService | undefined;
let diagnosticConsole: DiagnosticConsole | undefined;
let draftStore: DraftStore | undefined;
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

const loadClientPolicy = (force = false) => desktopSession.loadPolicy(force);
const assertSupportedClient = (policy: Awaited<ReturnType<typeof loadClientPolicy>>) =>
  desktopSession.assertSupported(policy);
const saveRefreshToken = (refreshToken: string) => desktopSession.saveRefreshToken(refreshToken);
const clearRefreshToken = () => desktopSession.clearRefreshToken();

const restoreSession = async () => {
  if (authenticatedUser) return authenticatedUser;
  const user = await desktopSession.restore();
  if (user) {
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

const assertWorkspaceListSender = (event: IpcMainInvokeEvent): void => {
  if (childWindows.isSettingsSender(event.sender.id)) return;
  assertShellSender(event);
};

const sendShell = (channel: string, payload: unknown): void => {
  if (!mainWindow?.isDestroyed()) mainWindow?.webContents.send(channel, payload);
};

const reportOutbox = new ReportOutbox(
  api,
  () => draftStore,
  () => Boolean(authenticatedUser),
  async () => assertSupportedClient(await loadClientPolicy()),
  async () => {
    const refreshToken = api.currentRefreshToken();
    if (refreshToken) await saveRefreshToken(refreshToken);
  },
  sendShell,
);

const sendBrowserState = (payload: Record<string, unknown> = {}): void => {
  const contents = websiteView?.webContents;
  sendShell(ipcChannels.browserState, {
    loading: contents?.isLoading() ?? false,
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

const registerMainShortcuts = (browserWindow: BrowserWindow, webContents: WebContents): void => {
  webContents.on('before-input-event', (event, input) => {
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
    const action = windowActionForShortcut(input, 'child');
    if (!action) return;
    event.preventDefault();
    performWindowShortcut(action, browserWindow);
  });
};

const childWindows = new ChildWindowManager({
  mainWindow: () => mainWindow,
  draftStore: () => draftStore,
  registerShortcuts: registerChildShortcuts,
});

const updatePageRevision = (): void => {
  pageRevision = randomUUID();
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

const layoutWebsite = (): void => {
  if (!mainWindow || !websiteView) return;
  const [width = 1060, height = 680] = mainWindow.getContentSize();
  const sidebarWidth = currentBrowserMode === 'browse' ? 0 : panelWidth;
  const bottomPanelHeight = diagnosticsOpen ? diagnosticsPanelHeight : 0;
  websiteView.setBounds({
    x: navigationSidebarWidth,
    y: toolbarHeight,
    width: Math.max(320, width - navigationSidebarWidth - sidebarWidth),
    height: Math.max(200, height - toolbarHeight - bottomPanelHeight),
  });
  websiteView.setVisible(Boolean(authenticatedUser) && workspaceViewVisible && websiteContentReady);
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
  const url = normalizeWebsiteUrl(input, process.env.MARKFIX_ALLOW_HTTP === 'true');
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

const ensureWebsiteProjects = async (
  availableWorkspaces?: Awaited<ReturnType<MarkFixApi['listWorkspaces']>>,
): Promise<WebsiteProject[]> => {
  if (!draftStore || !authenticatedUser) return [];
  const workspaces = availableWorkspaces ?? (await api.listWorkspaces());
  const accessibleProjectIds = new Set<string>();
  for (const workspace of workspaces) {
    for (const project of workspace.projects) {
      if (!project.baseUrl) continue;
      try {
        const entryUrl = normalizeWebsiteUrl(
          project.baseUrl,
          process.env.MARKFIX_ALLOW_HTTP === 'true',
        );
        const origin = new URL(entryUrl).origin;
        const now = new Date().toISOString();
        const existingById = draftStore.getWebsiteProject(project.id);
        const existingByOrigin = draftStore.findWebsiteProjectByOrigin(origin);
        const existing = existingById ?? existingByOrigin;
        const preservedProject = existing?.origin === origin ? existing : undefined;
        const websiteProject = websiteProjectSchema.parse({
          id: project.id,
          workspaceId: workspace.id,
          title: preservedProject?.title ?? project.name,
          origin,
          entryUrl: preservedProject?.entryUrl ?? entryUrl,
          faviconUrl: preservedProject?.faviconUrl ?? new URL('/favicon.ico', entryUrl).href,
          faviconSource: preservedProject?.faviconSource ?? 'root',
          currentPageSessionId: preservedProject?.currentPageSessionId ?? randomUUID(),
          currentUrl: preservedProject?.currentUrl ?? entryUrl,
          createdAt: project.createdAt,
          updatedAt: preservedProject?.updatedAt ?? project.updatedAt ?? now,
        });
        if (existing && existing.id !== project.id) {
          draftStore.migrateWebsiteProject(existing.id, websiteProject);
          if (activeWebsiteProjectId === existing.id) activeWebsiteProjectId = project.id;
          if (navigationWebsiteProjectId === existing.id) navigationWebsiteProjectId = project.id;
        } else {
          draftStore.saveWebsiteProject(websiteProject);
        }
        if (!preservedProject) draftStore.recordProjectPage(project.id, entryUrl, project.name);
        accessibleProjectIds.add(project.id);
      } catch {
        // Projects without a usable HTTP(S) URL are not website annotation projects.
      }
    }
  }
  return draftStore.listWebsiteProjects().filter(({ id }) => accessibleProjectIds.has(id));
};

const activateWebsiteProject = (projectId: string, switchGeneration: number): WebsiteProject => {
  if (!draftStore) throw new Error('本地项目存储不可用');
  if (!websiteView) throw new Error('网站视图不可用');
  const project = draftStore.getWebsiteProject(projectId);
  if (!project) throw new Error('项目不存在或已被移除');
  const targetUrl = project.currentUrl || project.entryUrl;
  if (
    activeWebsiteProjectId === project.id &&
    websiteContentReady &&
    websiteView.webContents.getURL() === targetUrl
  )
    return project;

  activeWebsiteProjectId = project.id;
  navigationWebsiteProjectId = project.id;
  websiteContentReady = false;
  layoutWebsite();
  websiteView.webContents.stop();
  void websiteView.webContents
    .loadURL(targetUrl)
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
    backgroundColor: process.platform === 'darwin' ? '#00000000' : '#f4f4ef',
    webPreferences: {
      preload: join(__dirname, '../preload/shell.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });
  shellWebContentsId = mainWindow.webContents.id;
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
    void websiteView?.webContents.loadURL(url);
    return { action: 'deny' };
  });
  websiteView.webContents.on('did-start-loading', () => {
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
    if (!navigationWebsiteProjectId || navigationWebsiteProjectId !== activeWebsiteProjectId)
      return;
    websiteContentReady = true;
    layoutWebsite();
  });
  websiteView.webContents.on('did-stop-loading', () => {
    sendBrowserState({
      loading: Boolean(navigationWebsiteProjectId) && !websiteContentReady,
    });
  });
  websiteView.webContents.on('will-navigate', (_event, url) => sendBrowserState({ url }));
  websiteView.webContents.on('did-navigate', (_event, url) => {
    const navigationProjectId = navigationWebsiteProjectId ?? activeWebsiteProjectId;
    const project = navigationProjectId
      ? draftStore?.recordProjectPage(
          navigationProjectId,
          url,
          websiteView?.webContents.getTitle() ?? '',
        )
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
      ? draftStore?.recordProjectPage(
          navigationProjectId,
          url,
          websiteView?.webContents.getTitle() ?? '',
        )
      : undefined;
    sendBrowserState({
      url,
      ...(project ? { pageSessionId: project.currentPageSessionId } : {}),
    });
    updatePageRevision();
  });
  websiteView.webContents.on('page-title-updated', (_event, title) => {
    currentPageTitle = title.trim();
    const url = websiteView?.webContents.getURL();
    const navigationProjectId = navigationWebsiteProjectId ?? activeWebsiteProjectId;
    const project =
      navigationProjectId && url
        ? draftStore?.recordProjectPage(navigationProjectId, url, currentPageTitle)
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
    if (navigationProjectId && draftStore) {
      const project = draftStore.getWebsiteProject(navigationProjectId);
      if (project && project.faviconUrl !== faviconUrl) {
        draftStore.saveWebsiteProject({
          ...project,
          faviconUrl,
          faviconSource: 'page',
          updatedAt: new Date().toISOString(),
        });
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
        ? draftStore?.recordProjectPage(navigationProjectId, url, pageTitle)
        : undefined;
    if (url)
      sendBrowserState({
        url,
        pageTitle,
        ...(project ? { pageSessionId: project.currentPageSessionId } : {}),
      });
    websiteView?.webContents.send('markfix:set-mode', currentBrowserMode);
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
    draftStore: () => draftStore,
    websiteView: () => websiteView,
    elementComments: () => currentElementComments,
    setElementComments: (comments) => {
      currentElementComments = comments;
    },
    sendShell,
  });
  registerCaptureIpc({
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
      layoutWebsite();
    },
  });
  reportOutbox.registerIpc(assertShellSender);
  ipcMain.handle(ipcChannels.authStatus, async (event) => {
    assertShellSender(event);
    const policy = await loadClientPolicy(true).catch(() => undefined);
    if (policy?.status === 'upgrade-required') {
      websiteView?.setVisible(false);
      return { authenticated: false, policy };
    }
    const user = await restoreSession();
    return {
      authenticated: Boolean(user),
      ...(user ? { user } : {}),
      ...(policy ? { policy } : {}),
    };
  });
  ipcMain.handle(ipcChannels.authLogin, async (event, input: unknown) => {
    assertShellSender(event);
    const payload = input as { email?: unknown; password?: unknown };
    if (typeof payload.email !== 'string' || typeof payload.password !== 'string') {
      throw new Error('Email and password are required');
    }
    assertSupportedClient(await loadClientPolicy(true));
    const tokens = await api.loginWithTokens(payload.email, payload.password, 'MarkFix desktop');
    api.setTokens(tokens);
    await saveRefreshToken(tokens.refreshToken);
    authenticatedUser = await api.me();
    layoutWebsite();
    void reportOutbox.flush();
    return authenticatedUser;
  });
  ipcMain.handle(ipcChannels.authLogout, async (event) => {
    assertShellSender(event);
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
      api.setTokens();
      websiteView?.setVisible(false);
      childWindows.closeSettings();
      await clearRefreshToken();
    }
    return true;
  });
  ipcMain.handle(ipcChannels.listWorkspaces, async (event) => {
    assertWorkspaceListSender(event);
    if (!authenticatedUser) throw new Error('Sign in to load workspaces');
    return api.listWorkspaces();
  });
  ipcMain.handle(ipcChannels.desktopBootstrap, async (event) => {
    assertShellSender(event);
    if (!authenticatedUser) throw new Error('Sign in to load the workspace');
    const workspaces = await api.listWorkspaces();
    const websiteProjects = await ensureWebsiteProjects(workspaces);
    return { workspaces, websiteProjects };
  });
  ipcMain.handle(subscriptionIpcChannels.get, async (event, input: unknown) => {
    assertSubscriptionSender(event);
    if (!authenticatedUser) throw new Error('Sign in to load the subscription');
    if (typeof input !== 'string') throw new Error('Invalid workspace ID');
    return api.getSubscription(input);
  });
  ipcMain.handle(subscriptionIpcChannels.upgrade, async (event, input: unknown) => {
    assertSubscriptionSender(event);
    if (!authenticatedUser) throw new Error('Sign in to manage the subscription');
    if (typeof input !== 'string') throw new Error('Invalid workspace ID');
    return api.requestSubscriptionUpgrade(input);
  });
  ipcMain.handle(ipcChannels.listEnvironments, async (event, input: unknown) => {
    assertShellSender(event);
    if (!authenticatedUser) throw new Error('Sign in to load environments');
    if (typeof input !== 'string') throw new Error('Invalid project ID');
    return api.listEnvironments(input);
  });
  ipcMain.handle(ipcChannels.listWebsiteProjects, async (event) => {
    assertShellSender(event);
    return ensureWebsiteProjects();
  });
  ipcMain.handle(ipcChannels.createWebsiteProject, async (event, input: unknown) => {
    assertShellSender(event);
    if (!authenticatedUser) throw new Error('请先登录后再新建标注项目');
    if (!draftStore) throw new Error('本地项目存储不可用');
    const payload = input as { workspaceId?: unknown; url?: unknown };
    if (typeof payload.workspaceId !== 'string' || typeof payload.url !== 'string')
      throw new Error('请选择工作区并输入网站地址');
    const normalized = normalizeWebsiteUrl(payload.url, process.env.MARKFIX_ALLOW_HTTP === 'true');
    const origin = new URL(normalized).origin;
    const existing = draftStore.findWebsiteProjectByOrigin(origin);
    if (existing) {
      try {
        await api.getProject(existing.id);
        return { project: existing, created: false };
      } catch (error) {
        if (!(error instanceof MarkFixApiError) || error.status !== 404) throw error;
      }
    }

    activeWebsiteProjectId = undefined;
    const metadata = await resolveWebsiteMetadata(normalized);
    const project = await api.createProject(payload.workspaceId, {
      name: metadata.title.slice(0, 120),
      baseUrl: origin,
    });
    const now = new Date().toISOString();
    const websiteProject = websiteProjectSchema.parse({
      id: project.id,
      workspaceId: project.workspaceId,
      title: (currentPageTitle || metadata.title).slice(0, 120),
      origin,
      entryUrl: metadata.url,
      faviconUrl: currentPageFaviconUrl ?? metadata.faviconUrl,
      faviconSource: currentPageFaviconUrl ? 'page' : metadata.faviconSource,
      currentPageSessionId: randomUUID(),
      currentUrl: metadata.url,
      createdAt: project.createdAt || now,
      updatedAt: now,
    });
    if (existing) draftStore.migrateWebsiteProject(existing.id, websiteProject);
    else draftStore.saveWebsiteProject(websiteProject);
    activeWebsiteProjectId = websiteProject.id;
    const current = draftStore.recordProjectPage(websiteProject.id, metadata.url, metadata.title);
    workspaceViewVisible = true;
    websiteContentReady = true;
    layoutWebsite();
    return { project: current ?? websiteProject, created: true };
  });
  ipcMain.handle(ipcChannels.listProjectAnnotationReports, async (event, input: unknown) => {
    assertShellSender(event);
    if (!authenticatedUser) throw new Error('请先登录后再加载标注');
    const payload = input as { projectId?: unknown; pageUrl?: unknown };
    if (typeof payload.projectId !== 'string' || typeof payload.pageUrl !== 'string')
      throw new Error('无效的项目或页面地址');
    return api.listAllReports(payload.projectId, { pageUrl: payload.pageUrl });
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
    const project = draftStore.getWebsiteProject(input);
    if (!project) throw new Error('项目不存在或已被移除');
    const { response } = await dialog.showMessageBox(mainWindow, {
      type: 'warning',
      title: '删除项目',
      message: `确定删除“${project.title}”吗？`,
      detail: '该项目及其服务端报告、本地标注和浏览历史将被永久删除，无法撤销。',
      buttons: ['取消', '删除项目'],
      defaultId: 0,
      cancelId: 0,
      noLink: true,
    });
    if (response !== 1) return { deleted: false };
    await api.deleteProject(project.id);
    draftStore.deleteWebsiteProject(project.id);
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
  ipcMain.handle(ipcChannels.setWorkspaceLayout, (event, input: unknown) => {
    assertShellSender(event);
    const payload = input as { sidebarWidth?: unknown; visible?: unknown };
    if (payload.sidebarWidth !== 0 && payload.sidebarWidth !== 228)
      throw new Error('无效的侧边栏宽度');
    if (typeof payload.visible !== 'boolean') throw new Error('无效的工作区显示状态');
    navigationSidebarWidth = payload.sidebarWidth;
    workspaceViewVisible = payload.visible;
    layoutWebsite();
  });
  ipcMain.handle(ipcChannels.openMoreMenu, (event, input: unknown) => {
    assertShellSender(event);
    if (!mainWindow) throw new Error('Desktop window is unavailable');
    const payload = input as { x?: unknown; y?: unknown };
    if (
      typeof payload.x !== 'number' ||
      !Number.isFinite(payload.x) ||
      typeof payload.y !== 'number' ||
      !Number.isFinite(payload.y)
    ) {
      throw new Error('无效的菜单位置');
    }
    const menu = Menu.buildFromTemplate([
      {
        label: '控制台',
        type: 'checkbox',
        checked: diagnosticsOpen,
        accelerator: 'Command+Shift+C',
        click: () => sendShell(ipcChannels.modeShortcut, 'diagnostics'),
      },
    ]);
    menu.popup({
      window: mainWindow,
      x: Math.round(payload.x),
      y: Math.round(payload.y),
    });
  });
  ipcMain.handle(ipcChannels.openSettings, async (event) => {
    assertShellSender(event);
    await childWindows.openSettings();
  });
  ipcMain.handle(ipcChannels.submitProjectAnnotations, async (event, input: unknown) => {
    assertShellSender(event);
    if (typeof input !== 'string') throw new Error('无效的项目 ID');
    if (!draftStore) throw new Error('本地批注存储不可用');
    await api.getProject(input);
    return draftStore.submitProjectAnnotations(input);
  });
  ipcMain.handle(ipcChannels.navigate, async (event, input: unknown) => {
    assertShellSender(event);
    const { url } = navigateInputSchema.parse(input);
    const normalized = normalizeWebsiteUrl(url, process.env.MARKFIX_ALLOW_HTTP === 'true');
    navigationWebsiteProjectId = activeWebsiteProjectId;
    websiteContentReady = false;
    layoutWebsite();
    await websiteView?.webContents.loadURL(normalized);
    return normalized;
  });
  ipcMain.handle(ipcChannels.goBack, async (event) => {
    assertShellSender(event);
    if (!activeWebsiteProjectId || !draftStore) return;
    const entry = draftStore.stepProjectHistory(activeWebsiteProjectId, -1);
    if (entry) {
      navigationWebsiteProjectId = activeWebsiteProjectId;
      websiteContentReady = false;
      layoutWebsite();
      await websiteView?.webContents.loadURL(entry.url);
    }
  });
  ipcMain.handle(ipcChannels.goForward, async (event) => {
    assertShellSender(event);
    if (!activeWebsiteProjectId || !draftStore) return;
    const entry = draftStore.stepProjectHistory(activeWebsiteProjectId, 1);
    if (entry) {
      navigationWebsiteProjectId = activeWebsiteProjectId;
      websiteContentReady = false;
      layoutWebsite();
      await websiteView?.webContents.loadURL(entry.url);
    }
  });
  ipcMain.handle(ipcChannels.reload, (event) => {
    assertShellSender(event);
    navigationWebsiteProjectId = activeWebsiteProjectId;
    websiteContentReady = false;
    layoutWebsite();
    websiteView?.webContents.reload();
  });
  ipcMain.handle(ipcChannels.setMode, async (event, input: unknown) => {
    assertShellSender(event);
    const mode = browserModeSchema.parse(input);
    if (currentBrowserMode === 'comment') await inspector?.stop();
    currentBrowserMode = mode;
    layoutWebsite();
    websiteView?.webContents.send('markfix:set-mode', mode);
    if (mode === 'comment') await inspector?.start();
  });
  ipcMain.handle(ipcChannels.openAnnotationReview, async (event, input: unknown) => {
    assertShellSender(event);
    if (typeof input !== 'string') throw new Error('无效的项目 ID');
    if (!draftStore?.getWebsiteProject(input)) throw new Error('项目不存在或已被移除');
    await childWindows.openAnnotationReview(input);
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
    if (!draftStore?.getWebsiteProject(input)) throw new Error('项目不存在或已被移除');
    await childWindows.openProjectAnnotationHistory(input);
  });
  ipcMain.handle(ipcChannels.selectAnnotationHistory, (event, input: unknown) => {
    assertShellSender(event);
    const reference = historyAnnotationReferenceSchema.parse(input);
    const exists =
      reference.type === 'element'
        ? draftStore?.listElementComments().some(({ id }) => id === reference.id)
        : reference.type === 'capture'
          ? draftStore?.listCaptures().some(({ id }) => id === reference.id)
          : draftStore?.listDiagnosticAnnotations().some(({ id }) => id === reference.id);
    if (!exists) throw new Error('标注不存在或已被删除');
    sendShell(ipcChannels.annotationHistorySelected, reference);
    childWindows.focusMainFromHistory();
  });
  ipcMain.handle(ipcChannels.openCapturePreview, async (event, input: unknown) => {
    assertShellSender(event);
    if (typeof input !== 'string') throw new Error('Invalid capture ID');
    await childWindows.openCapturePreview(input);
  });
  ipcMain.handle(ipcChannels.loadCapturePreview, (event, input: unknown) => {
    assertShellSender(event);
    if (typeof input !== 'string') throw new Error('Invalid capture ID');
    const capture = draftStore?.getCapture(input);
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

app.whenReady().then(async () => {
  const websiteSession = session.fromPartition('persist:markfix-profile-default');
  websiteSession.setPermissionRequestHandler((_webContents, permission, callback) => {
    callback(['clipboard-sanitized-write'].includes(permission));
  });
  draftStore = new DraftStore(join(app.getPath('userData'), 'markfix.sqlite'));
  draftStore.recoverInterrupted();
  registerIpc();
  await createWindow();
  void reportOutbox.flush();
  syncTimer = setInterval(() => void reportOutbox.flush(), 15_000);
});

app.on('before-quit', () => {
  if (syncTimer) clearInterval(syncTimer);
  inspector?.detach();
  draftStore?.close();
});
app.on('window-all-closed', () => app.quit());
