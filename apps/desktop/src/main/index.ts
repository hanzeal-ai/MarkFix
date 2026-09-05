import { createHash, randomUUID } from 'node:crypto';
import { readFile, unlink, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import {
  app,
  BrowserWindow,
  clipboard,
  ClipboardItem,
  dialog,
  ipcMain,
  Menu,
  safeStorage,
  session,
  WebContentsView,
  type IpcMainInvokeEvent,
  type WebContents,
} from 'electron';
import {
  anchorSchema,
  annotationSubmissionSchema,
  annotationSchema,
  annotationToolSchema,
  browserModeSchema,
  captureRequestSchema,
  desktopDraftSchema,
  captureBundleSchema,
  createReportSchema,
  historyAnnotationReferenceSchema,
  ipcChannels,
  navigateInputSchema,
  recorderEventSchema,
  regionAnchorSchema,
  screenshotMarkSchema,
  savedCaptureSchema,
  savedDiagnosticAnnotationSchema,
  savedElementCommentSchema,
  screenshotStyleSchema,
  screenshotToolSchema,
  websiteProjectSchema,
  type Anchor,
  type Annotation,
  type ClientPolicy,
  type CreateReport,
  type BrowserMode,
  type SavedElementComment,
  type WebsiteProject,
} from '@markfix/contracts';
import { MarkFixApi } from '@markfix/api-client';
import { anchorsEqual } from './anchor-state.js';
import { CdpInspector } from './cdp-inspector.js';
import { CaptureService } from './capture-service.js';
import { DraftStore } from './draft-store.js';
import type { OutboxEntry } from './draft-store.js';
import { DiagnosticConsole } from './diagnostic-console.js';
import { normalizeWebsiteUrl } from './url.js';
import { subscriptionIpcChannels } from '../subscription.js';
import { decodeScreenshotDataUrl, safeScreenshotFilename } from './image-export.js';
import { modeForShortcut } from './mode-shortcuts.js';
import { windowActionForShortcut, type WindowShortcutAction } from './window-shortcuts.js';

const toolbarHeight = 56;
const panelWidth = 360;
const workspaceMargin = 14;
const diagnosticsPanelHeight = 300;
const macWindowMaterial =
  process.platform === 'darwin'
    ? ({
        vibrancy: 'under-window',
        visualEffectState: 'followWindow',
      } as const)
    : {};
const api = new MarkFixApi(process.env.MARKFIX_API_URL ?? 'http://localhost:4310');
let mainWindow: BrowserWindow | undefined;
let annotationReviewWindow: BrowserWindow | undefined;
let annotationReviewProjectId: string | undefined;
let annotationHistoryWindow: BrowserWindow | undefined;
let projectAnnotationHistoryWindow: BrowserWindow | undefined;
let projectAnnotationHistoryProjectId: string | undefined;
let capturePreviewWindow: BrowserWindow | undefined;
let settingsWindow: BrowserWindow | undefined;
let websiteView: WebContentsView | undefined;
let inspector: CdpInspector | undefined;
let captureService: CaptureService | undefined;
let diagnosticConsole: DiagnosticConsole | undefined;
let draftStore: DraftStore | undefined;
let shellWebContentsId: number | undefined;
let currentAnnotations: Annotation[] = [];
let currentElementComments: SavedElementComment[] = [];
let currentAnchor: Anchor | undefined;
let isSyncing = false;
let syncTimer: ReturnType<typeof setInterval> | undefined;
let recording = false;
let pageRevision = randomUUID();
let authenticatedUser: { id: string; email: string; displayName: string } | undefined;
let policyCache: { value: ClientPolicy; checkedAtMs: number } | undefined;
let currentBrowserMode: BrowserMode = 'browse';
let diagnosticsOpen = false;
let navigationSidebarWidth = 228;
let workspaceViewVisible = false;
let activeWebsiteProjectId: string | undefined;
let navigationWebsiteProjectId: string | undefined;
let websiteProjectSwitchQueue: Promise<void> = Promise.resolve();
let websiteProjectSwitchGeneration = 0;
let currentPageTitle = '';
let currentPageFaviconUrl: string | null = null;
const mainRecorderRuntimeId = randomUUID();
const overlayVisibilityWaiters = new Map<string, () => void>();

const loadClientPolicy = async (force = false): Promise<ClientPolicy> => {
  if (!force && policyCache && Date.now() - policyCache.checkedAtMs < 5 * 60 * 1000) {
    return policyCache.value;
  }
  const value = await api.clientPolicy(app.getVersion(), process.platform, process.arch);
  policyCache = { value, checkedAtMs: Date.now() };
  return value;
};

const assertSupportedClient = (policy: ClientPolicy): void => {
  if (policy.status === 'upgrade-required') {
    throw new Error(
      `MarkFix ${policy.minimumVersion} or newer is required. Install the latest desktop release.`,
    );
  }
};

const credentialPath = (): string => join(app.getPath('userData'), 'refresh-token.secure');

const saveRefreshToken = async (refreshToken: string): Promise<void> => {
  if (!safeStorage.isEncryptionAvailable()) {
    throw new Error('The operating system credential vault is unavailable');
  }
  await writeFile(credentialPath(), safeStorage.encryptString(refreshToken), { mode: 0o600 });
};

const clearRefreshToken = async (): Promise<void> => {
  await unlink(credentialPath()).catch((error: unknown) => {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
  });
};

const restoreSession = async () => {
  if (authenticatedUser) return authenticatedUser;
  if (!safeStorage.isEncryptionAvailable()) return undefined;
  try {
    const refreshToken = safeStorage.decryptString(await readFile(credentialPath()));
    api.setTokens({ accessToken: '', refreshToken });
    const tokens = await api.refreshWithToken();
    api.setTokens(tokens);
    await saveRefreshToken(tokens.refreshToken);
    authenticatedUser = await api.me();
    layoutWebsite();
    return authenticatedUser;
  } catch {
    api.setTokens();
    await clearRefreshToken();
    return undefined;
  }
};

const assertShellSender = (event: IpcMainInvokeEvent): void => {
  const annotationReviewWebContentsId = annotationReviewWindow?.webContents.id;
  const annotationHistoryWebContentsId = annotationHistoryWindow?.webContents.id;
  const projectAnnotationHistoryWebContentsId = projectAnnotationHistoryWindow?.webContents.id;
  const capturePreviewWebContentsId = capturePreviewWindow?.webContents.id;
  if (
    event.sender.id !== shellWebContentsId &&
    event.sender.id !== annotationReviewWebContentsId &&
    event.sender.id !== annotationHistoryWebContentsId &&
    event.sender.id !== projectAnnotationHistoryWebContentsId &&
    event.sender.id !== capturePreviewWebContentsId
  )
    throw new Error('Untrusted IPC sender');
};

const assertSubscriptionSender = (event: IpcMainInvokeEvent): void => {
  if (event.sender.id === shellWebContentsId || event.sender.id === settingsWindow?.webContents.id)
    return;
  throw new Error('Untrusted subscription IPC sender');
};

const assertWorkspaceListSender = (event: IpcMainInvokeEvent): void => {
  if (event.sender.id === settingsWindow?.webContents.id) return;
  assertShellSender(event);
};

const sendShell = (channel: string, payload: unknown): void => {
  if (!mainWindow?.isDestroyed()) mainWindow?.webContents.send(channel, payload);
};

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
    void openSettingsWindow();
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

const updatePageRevision = (url: string): void => {
  pageRevision = randomUUID();
  websiteView?.webContents.send('markfix:set-recorder', { enabled: recording, pageRevision });
  if (recording) {
    sendShell(ipcChannels.recorderEvent, {
      protocolVersion: 1,
      runtimeId: mainRecorderRuntimeId,
      pageRevision,
      type: 'navigation',
      timestampMs: Date.now(),
      url,
    });
  }
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

const syncEntry = async (entry: OutboxEntry): Promise<void> => {
  if (!draftStore) return;
  try {
    assertSupportedClient(await loadClientPolicy());
    const candidate = createReportSchema.parse(entry.payload);
    const report = await api.submitReport(candidate, entry.idempotencyKey);
    draftStore.markCompleted(entry.id, report.id);
    sendShell(ipcChannels.syncStatus, {
      status: 'completed',
      outboxId: entry.id,
      reportId: report.id,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown synchronization failure';
    draftStore.markFailed(entry.id, entry.attempts + 1, message);
    sendShell(ipcChannels.syncStatus, { status: 'pending', outboxId: entry.id, message });
  } finally {
    const refreshToken = api.currentRefreshToken();
    if (refreshToken) await saveRefreshToken(refreshToken);
  }
};

const flushOutbox = async (): Promise<void> => {
  if (isSyncing || !draftStore || !authenticatedUser) return;
  isSyncing = true;
  try {
    for (const entry of draftStore.claimDue()) await syncEntry(entry);
  } finally {
    isSyncing = false;
  }
};

const layoutWebsite = (): void => {
  if (!mainWindow || !websiteView) return;
  const [width = 1060, height = 680] = mainWindow.getContentSize();
  const sidebarWidth = currentBrowserMode === 'browse' ? 0 : panelWidth;
  const bottomPanelHeight = diagnosticsOpen ? diagnosticsPanelHeight + workspaceMargin : 0;
  websiteView.setBounds({
    x: navigationSidebarWidth + workspaceMargin,
    y: toolbarHeight + workspaceMargin,
    width: Math.max(
      320,
      width -
        navigationSidebarWidth -
        sidebarWidth -
        (currentBrowserMode === 'browse' ? workspaceMargin * 2 : workspaceMargin),
    ),
    height: Math.max(200, height - toolbarHeight - workspaceMargin * 2 - bottomPanelHeight),
  });
  websiteView.setVisible(Boolean(authenticatedUser) && workspaceViewVisible);
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

const ensureWebsiteProjects = async (): Promise<WebsiteProject[]> => {
  if (!draftStore || !authenticatedUser) return [];
  const workspaces = await api.listWorkspaces();
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
          ...(preservedProject?.metadataResolvedAt
            ? { metadataResolvedAt: preservedProject.metadataResolvedAt }
            : {}),
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

const websiteLoadError = (error: unknown, url: string): Error => {
  const hostname = new URL(url).hostname;
  const code = (error as { code?: unknown }).code;
  if (code === 'ERR_NAME_NOT_RESOLVED')
    return new Error(`无法打开 ${hostname}：域名无法解析，请检查项目地址或删除该项目。`);
  if (code === 'ERR_CONNECTION_REFUSED')
    return new Error(`无法打开 ${hostname}：目标服务拒绝连接，请确认服务已启动。`);
  return new Error(`无法打开 ${hostname}，已保留当前项目。`);
};

const activateWebsiteProject = async (
  projectId: string,
  switchGeneration: number,
): Promise<WebsiteProject> => {
  if (!draftStore) throw new Error('本地项目存储不可用');
  if (!websiteView) throw new Error('网站视图不可用');
  let project = draftStore.getWebsiteProject(projectId);
  if (!project) throw new Error('项目不存在或已被移除');
  await api.getProject(project.id);
  const targetUrl = project.currentUrl || project.entryUrl;
  if (activeWebsiteProjectId === project.id && websiteView.webContents.getURL() === targetUrl)
    return project;

  const previousProject = activeWebsiteProjectId
    ? draftStore.getWebsiteProject(activeWebsiteProjectId)
    : undefined;
  navigationWebsiteProjectId = project.id;
  workspaceViewVisible = Boolean(previousProject);
  layoutWebsite();
  try {
    if (!project.metadataResolvedAt) {
      const metadata = await resolveWebsiteMetadata(targetUrl);
      const resolvedAt = new Date().toISOString();
      project = {
        ...project,
        title: metadata.title.slice(0, 120),
        faviconUrl: metadata.faviconUrl,
        faviconSource: metadata.faviconSource,
        metadataResolvedAt: resolvedAt,
        updatedAt: resolvedAt,
      };
      draftStore.saveWebsiteProject(project);
      draftStore.recordProjectPage(project.id, metadata.url, metadata.title);
    } else {
      await websiteView.webContents.loadURL(targetUrl);
    }
  } catch (error) {
    if (switchGeneration !== websiteProjectSwitchGeneration) {
      navigationWebsiteProjectId = undefined;
      workspaceViewVisible = Boolean(previousProject);
      layoutWebsite();
      throw new Error('项目切换已被新的操作取代', { cause: error });
    }
    navigationWebsiteProjectId = previousProject?.id;
    if (previousProject) {
      const previousUrl = previousProject.currentUrl || previousProject.entryUrl;
      if (websiteView.webContents.getURL() !== previousUrl)
        await websiteView.webContents.loadURL(previousUrl).catch(() => undefined);
    }
    navigationWebsiteProjectId = undefined;
    workspaceViewVisible = Boolean(previousProject);
    layoutWebsite();
    throw websiteLoadError(error, targetUrl);
  }

  activeWebsiteProjectId = project.id;
  navigationWebsiteProjectId = undefined;
  workspaceViewVisible = true;
  layoutWebsite();
  return draftStore.getWebsiteProject(project.id) ?? project;
};

const loadRendererView = async (
  browserWindow: BrowserWindow,
  view: string,
  query: Record<string, string> = {},
): Promise<void> => {
  if (process.env.ELECTRON_RENDERER_URL) {
    const rendererUrl = new URL(process.env.ELECTRON_RENDERER_URL);
    rendererUrl.searchParams.set('view', view);
    for (const [name, value] of Object.entries(query)) rendererUrl.searchParams.set(name, value);
    await browserWindow.loadURL(rendererUrl.toString());
    return;
  }
  await browserWindow.loadFile(join(__dirname, '../renderer/index.html'), {
    query: { view, ...query },
  });
};

async function openSettingsWindow(): Promise<void> {
  if (!mainWindow || mainWindow.isDestroyed()) throw new Error('Main window is unavailable');
  if (settingsWindow && !settingsWindow.isDestroyed()) {
    settingsWindow.show();
    settingsWindow.focus();
    return;
  }
  const settings = new BrowserWindow({
    ...macWindowMaterial,
    parent: mainWindow,
    show: false,
    width: 760,
    height: 520,
    minWidth: 680,
    minHeight: 460,
    title: '设置 - MarkFix',
    titleBarStyle: 'hiddenInset',
    trafficLightPosition: { x: 16, y: 16 },
    backgroundColor: process.platform === 'darwin' ? '#00000000' : '#f4f5f7',
    autoHideMenuBar: true,
    webPreferences: {
      preload: join(__dirname, '../preload/shell.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });
  registerChildShortcuts(settings);
  settingsWindow = settings;
  settings.on('closed', () => {
    if (settingsWindow === settings) settingsWindow = undefined;
  });
  settings.once('ready-to-show', () => settings.show());
  try {
    await loadRendererView(settings, 'settings');
  } catch (error) {
    if (!settings.isDestroyed()) throw error;
  }
}

const openAnnotationReviewWindow = async (projectId: string): Promise<void> => {
  if (!mainWindow || mainWindow.isDestroyed()) throw new Error('Main window is unavailable');
  if (annotationReviewWindow && !annotationReviewWindow.isDestroyed()) {
    if (annotationReviewProjectId === projectId) {
      annotationReviewWindow.show();
      annotationReviewWindow.focus();
      return;
    }
    annotationReviewWindow.close();
  }
  const parentBounds = mainWindow.getBounds();
  const reviewWindow = new BrowserWindow({
    ...macWindowMaterial,
    parent: mainWindow,
    show: false,
    width: Math.max(760, Math.min(1040, parentBounds.width - 80)),
    height: Math.max(620, Math.min(780, parentBounds.height - 80)),
    minWidth: 760,
    minHeight: 620,
    title: '保存标注 - MarkFix',
    titleBarStyle: 'hiddenInset',
    trafficLightPosition: { x: 16, y: 16 },
    backgroundColor: process.platform === 'darwin' ? '#00000000' : '#f4f5f7',
    autoHideMenuBar: true,
    webPreferences: {
      preload: join(__dirname, '../preload/shell.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });
  registerChildShortcuts(reviewWindow);
  annotationReviewWindow = reviewWindow;
  annotationReviewProjectId = projectId;
  reviewWindow.on('closed', () => {
    if (annotationReviewWindow !== reviewWindow) return;
    annotationReviewWindow = undefined;
    annotationReviewProjectId = undefined;
  });
  reviewWindow.once('ready-to-show', () => reviewWindow.show());
  try {
    await loadRendererView(reviewWindow, 'annotation-save', { projectId });
  } catch (error) {
    if (!reviewWindow.isDestroyed()) throw error;
  }
};

const openCapturePreviewWindow = async (captureId: string): Promise<void> => {
  const capture = draftStore?.getCapture(captureId);
  if (!capture) throw new Error('截图不存在或已被删除');
  if (capturePreviewWindow && !capturePreviewWindow.isDestroyed()) capturePreviewWindow.close();
  const parent =
    annotationReviewWindow && !annotationReviewWindow.isDestroyed()
      ? annotationReviewWindow
      : mainWindow;
  if (!parent || parent.isDestroyed()) throw new Error('Parent window is unavailable');
  const parentBounds = parent.getBounds();
  const previewWindow = new BrowserWindow({
    parent,
    show: false,
    width: Math.max(720, Math.min(1180, parentBounds.width - 40)),
    height: Math.max(560, Math.min(820, parentBounds.height - 40)),
    minWidth: 640,
    minHeight: 480,
    title: '截图预览 - MarkFix',
    titleBarStyle: 'hiddenInset',
    trafficLightPosition: { x: 16, y: 16 },
    backgroundColor: '#202127',
    autoHideMenuBar: true,
    webPreferences: {
      preload: join(__dirname, '../preload/shell.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });
  registerChildShortcuts(previewWindow);
  capturePreviewWindow = previewWindow;
  previewWindow.on('closed', () => {
    if (capturePreviewWindow === previewWindow) capturePreviewWindow = undefined;
  });
  previewWindow.once('ready-to-show', () => previewWindow.show());
  try {
    await loadRendererView(previewWindow, 'capture-preview', { captureId });
  } catch (error) {
    if (!previewWindow.isDestroyed()) throw error;
  }
};

const openAnnotationHistoryWindow = async (): Promise<void> => {
  if (!mainWindow || mainWindow.isDestroyed()) throw new Error('Main window is unavailable');
  if (annotationHistoryWindow && !annotationHistoryWindow.isDestroyed()) {
    annotationHistoryWindow.setParentWindow(mainWindow);
    annotationHistoryWindow.reload();
    annotationHistoryWindow.show();
    annotationHistoryWindow.focus();
    return;
  }
  const parentBounds = mainWindow.getBounds();
  const historyWindow = new BrowserWindow({
    ...macWindowMaterial,
    parent: mainWindow,
    show: false,
    width: Math.max(760, Math.min(1040, parentBounds.width - 80)),
    height: Math.max(560, Math.min(780, parentBounds.height - 80)),
    minWidth: 720,
    minHeight: 520,
    title: '历史标注 - MarkFix',
    titleBarStyle: 'hiddenInset',
    trafficLightPosition: { x: 16, y: 16 },
    backgroundColor: process.platform === 'darwin' ? '#00000000' : '#f4f5f7',
    autoHideMenuBar: true,
    webPreferences: {
      preload: join(__dirname, '../preload/shell.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });
  registerChildShortcuts(historyWindow);
  annotationHistoryWindow = historyWindow;
  historyWindow.on('closed', () => {
    if (annotationHistoryWindow === historyWindow) annotationHistoryWindow = undefined;
  });
  historyWindow.once('ready-to-show', () => historyWindow.show());
  try {
    await loadRendererView(historyWindow, 'annotation-history');
  } catch (error) {
    if (!historyWindow.isDestroyed()) throw error;
  }
};

const openProjectAnnotationHistoryWindow = async (projectId: string): Promise<void> => {
  const parent =
    annotationHistoryWindow && !annotationHistoryWindow.isDestroyed()
      ? annotationHistoryWindow
      : mainWindow;
  if (!parent || parent.isDestroyed()) throw new Error('Parent window is unavailable');
  if (projectAnnotationHistoryWindow && !projectAnnotationHistoryWindow.isDestroyed()) {
    if (projectAnnotationHistoryProjectId === projectId) {
      projectAnnotationHistoryWindow.setParentWindow(parent);
      projectAnnotationHistoryWindow.show();
      projectAnnotationHistoryWindow.focus();
      return;
    }
    projectAnnotationHistoryWindow.close();
  }
  const parentBounds = parent.getBounds();
  const projectHistoryWindow = new BrowserWindow({
    ...macWindowMaterial,
    parent,
    show: false,
    x: parentBounds.x,
    y: parentBounds.y,
    width: parentBounds.width,
    height: parentBounds.height,
    minWidth: 720,
    minHeight: 520,
    title: '项目历史 - MarkFix',
    titleBarStyle: 'hiddenInset',
    trafficLightPosition: { x: 16, y: 16 },
    backgroundColor: process.platform === 'darwin' ? '#00000000' : '#f4f5f7',
    autoHideMenuBar: true,
    webPreferences: {
      preload: join(__dirname, '../preload/shell.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });
  registerChildShortcuts(projectHistoryWindow);
  projectAnnotationHistoryWindow = projectHistoryWindow;
  projectAnnotationHistoryProjectId = projectId;
  projectHistoryWindow.on('closed', () => {
    if (projectAnnotationHistoryWindow !== projectHistoryWindow) return;
    projectAnnotationHistoryWindow = undefined;
    projectAnnotationHistoryProjectId = undefined;
  });
  projectHistoryWindow.once('ready-to-show', () => projectHistoryWindow.show());
  try {
    await loadRendererView(projectHistoryWindow, 'project-annotation-history', { projectId });
  } catch (error) {
    if (!projectHistoryWindow.isDestroyed()) throw error;
  }
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
    sendBrowserState({ loading: true, pageTitle: '', faviconUrl: null });
  });
  websiteView.webContents.on('did-stop-loading', () => sendBrowserState({ loading: false }));
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
    updatePageRevision(url);
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
    updatePageRevision(url);
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
    websiteView?.webContents.send('markfix:render-annotations', currentAnnotations);
    websiteView?.webContents.send('markfix:render-element-comments', currentElementComments);
    if (currentAnchor?.kind === 'element')
      websiteView?.webContents.send('markfix:resolve-anchor', {
        anchor: currentAnchor,
        force: true,
      });
    websiteView?.webContents.send('markfix:set-recorder', { enabled: recording, pageRevision });
  });
  websiteView.webContents.on('did-fail-load', (_event, code, description, url, isMainFrame) => {
    if (isMainFrame)
      sendBrowserState({
        url,
        loading: false,
        error: `${description} (${code})`,
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
      sendBrowserState({ error: `${message}. Switched to region selection.` });
      websiteView?.webContents.send('markfix:set-mode', 'region');
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
    void flushOutbox();
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
      settingsWindow?.close();
      await clearRefreshToken();
    }
    return true;
  });
  ipcMain.handle(ipcChannels.listWorkspaces, async (event) => {
    assertWorkspaceListSender(event);
    if (!authenticatedUser) throw new Error('Sign in to load workspaces');
    return api.listWorkspaces();
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
        if (!(error instanceof Error) || error.message !== 'Project not found') throw error;
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
      metadataResolvedAt: now,
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
    layoutWebsite();
    return { project: current ?? websiteProject, created: true };
  });
  ipcMain.handle(ipcChannels.switchWebsiteProject, async (event, input: unknown) => {
    assertShellSender(event);
    if (typeof input !== 'string') throw new Error('无效的项目 ID');
    const switchGeneration = ++websiteProjectSwitchGeneration;
    if (navigationWebsiteProjectId && navigationWebsiteProjectId !== input)
      websiteView?.webContents.stop();
    const operation = websiteProjectSwitchQueue.then(() => {
      if (switchGeneration !== websiteProjectSwitchGeneration)
        throw new Error('项目切换已被新的操作取代');
      return activateWebsiteProject(input, switchGeneration);
    });
    websiteProjectSwitchQueue = operation.then(
      () => undefined,
      () => undefined,
    );
    return operation;
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
    await websiteProjectSwitchQueue;
    await api.deleteProject(project.id);
    draftStore.deleteWebsiteProject(project.id);
    if (activeWebsiteProjectId === project.id) {
      activeWebsiteProjectId = undefined;
      navigationWebsiteProjectId = undefined;
      workspaceViewVisible = false;
      currentAnnotations = [];
      currentElementComments = [];
      currentAnchor = undefined;
      layoutWebsite();
      void websiteView?.webContents.loadURL('about:blank');
    }
    if (annotationReviewProjectId === project.id) annotationReviewWindow?.close();
    if (projectAnnotationHistoryProjectId === project.id) projectAnnotationHistoryWindow?.close();
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
    await openSettingsWindow();
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
    await websiteView?.webContents.loadURL(normalized);
    return normalized;
  });
  ipcMain.handle(ipcChannels.goBack, async (event) => {
    assertShellSender(event);
    if (!activeWebsiteProjectId || !draftStore) return;
    const entry = draftStore.stepProjectHistory(activeWebsiteProjectId, -1);
    if (entry) await websiteView?.webContents.loadURL(entry.url);
  });
  ipcMain.handle(ipcChannels.goForward, async (event) => {
    assertShellSender(event);
    if (!activeWebsiteProjectId || !draftStore) return;
    const entry = draftStore.stepProjectHistory(activeWebsiteProjectId, 1);
    if (entry) await websiteView?.webContents.loadURL(entry.url);
  });
  ipcMain.handle(ipcChannels.reload, (event) => {
    assertShellSender(event);
    websiteView?.webContents.reload();
  });
  ipcMain.handle(ipcChannels.diagnosticsSetOpen, (event, input: unknown) => {
    assertShellSender(event);
    if (typeof input !== 'boolean') throw new Error('Invalid diagnostics panel state');
    diagnosticsOpen = input;
    layoutWebsite();
  });
  ipcMain.handle(ipcChannels.diagnosticsList, (event) => {
    assertShellSender(event);
    return diagnosticConsole?.list() ?? [];
  });
  ipcMain.handle(ipcChannels.diagnosticsClear, (event, input: unknown) => {
    assertShellSender(event);
    if (input !== 'console' && input !== 'network' && input !== 'all')
      throw new Error('Invalid diagnostics clear scope');
    diagnosticConsole?.clear(input);
  });
  ipcMain.handle(ipcChannels.diagnosticsEvaluate, async (event, input: unknown) => {
    assertShellSender(event);
    if (typeof input !== 'string' || input.length > 20_000) throw new Error('Invalid JavaScript');
    if (!diagnosticConsole) throw new Error('Website diagnostics are unavailable');
    return diagnosticConsole.evaluate(input);
  });
  ipcMain.handle(ipcChannels.diagnosticsRunCurl, async (event, input: unknown) => {
    assertShellSender(event);
    if (typeof input !== 'string' || input.length > 20_000) throw new Error('Invalid cURL command');
    if (!diagnosticConsole) throw new Error('Website diagnostics are unavailable');
    return diagnosticConsole.runCurl(input);
  });
  ipcMain.handle(ipcChannels.setMode, async (event, input: unknown) => {
    assertShellSender(event);
    const mode = browserModeSchema.parse(input);
    if (currentBrowserMode === 'comment' || currentBrowserMode === 'inspect') {
      await inspector?.stop();
    }
    currentBrowserMode = mode;
    layoutWebsite();
    websiteView?.webContents.send('markfix:set-mode', mode);
    if (mode === 'comment' || mode === 'inspect') await inspector?.start();
  });
  ipcMain.handle(ipcChannels.setAnnotationTool, (event, input: unknown) => {
    assertShellSender(event);
    const tool = annotationToolSchema.parse(input);
    websiteView?.webContents.send('markfix:set-tool', tool);
  });
  ipcMain.handle(ipcChannels.setCaptureTool, (event, input: unknown) => {
    assertShellSender(event);
    websiteView?.webContents.send('markfix:set-capture-tool', screenshotToolSchema.parse(input));
  });
  ipcMain.handle(ipcChannels.setCaptureStyle, (event, input: unknown) => {
    assertShellSender(event);
    websiteView?.webContents.send('markfix:set-capture-style', screenshotStyleSchema.parse(input));
  });
  ipcMain.handle(ipcChannels.syncCaptureMarks, (event, input: unknown) => {
    assertShellSender(event);
    websiteView?.webContents.send(
      'markfix:sync-capture-marks',
      screenshotMarkSchema.array().max(500).parse(input),
    );
  });
  ipcMain.handle(ipcChannels.clearCaptureSelection, (event) => {
    assertShellSender(event);
    websiteView?.webContents.send('markfix:clear-capture-selection');
  });
  ipcMain.handle(ipcChannels.restoreCaptureSelection, (event, input: unknown) => {
    assertShellSender(event);
    const payload = input as { selection?: unknown; marks?: unknown };
    websiteView?.webContents.send('markfix:restore-capture-selection', {
      selection: regionAnchorSchema.parse(payload.selection),
      marks: screenshotMarkSchema.array().max(500).parse(payload.marks),
    });
  });
  ipcMain.handle(ipcChannels.copyCaptureImage, async (event, input: unknown) => {
    assertShellSender(event);
    const image = decodeScreenshotDataUrl(input);
    await clipboard.write([
      new ClipboardItem({
        'image/png': new Blob([new Uint8Array(image)], { type: 'image/png' }),
      }),
    ]);
  });
  ipcMain.handle(ipcChannels.saveCaptureImage, async (event, input: unknown) => {
    assertShellSender(event);
    if (!mainWindow) throw new Error('Desktop window is unavailable');
    const payload = input as { dataUrl?: unknown; suggestedName?: unknown };
    const image = decodeScreenshotDataUrl(payload.dataUrl);
    const result = await dialog.showSaveDialog(mainWindow, {
      title: '保存 MarkFix 截图',
      defaultPath: safeScreenshotFilename(payload.suggestedName),
      filters: [{ name: 'PNG image', extensions: ['png'] }],
    });
    if (result.canceled || !result.filePath) return { canceled: true };
    await writeFile(result.filePath, image);
    return { canceled: false, filePath: result.filePath };
  });
  ipcMain.handle(ipcChannels.listCaptureRecords, (event) => {
    assertShellSender(event);
    return draftStore?.listCaptures() ?? [];
  });
  ipcMain.handle(ipcChannels.saveCaptureRecord, (event, input: unknown) => {
    assertShellSender(event);
    const capture = savedCaptureSchema.parse(input);
    decodeScreenshotDataUrl(capture.dataUrl);
    draftStore?.saveCapture(capture);
  });
  ipcMain.handle(ipcChannels.deleteCaptureRecord, (event, input: unknown) => {
    assertShellSender(event);
    if (typeof input !== 'string') throw new Error('Invalid capture ID');
    draftStore?.deleteCapture(input);
  });
  ipcMain.handle(ipcChannels.listElementComments, (event) => {
    assertShellSender(event);
    return draftStore?.listElementComments() ?? [];
  });
  ipcMain.handle(ipcChannels.saveElementComment, (event, input: unknown) => {
    assertShellSender(event);
    const comment = savedElementCommentSchema.parse(input);
    draftStore?.saveElementComment(comment);
  });
  ipcMain.handle(ipcChannels.deleteElementComment, (event, input: unknown) => {
    assertShellSender(event);
    if (typeof input !== 'string') throw new Error('Invalid element comment ID');
    draftStore?.deleteElementComment(input);
  });
  ipcMain.handle(ipcChannels.listDiagnosticAnnotations, (event) => {
    assertShellSender(event);
    return draftStore?.listDiagnosticAnnotations() ?? [];
  });
  ipcMain.handle(ipcChannels.saveDiagnosticAnnotation, (event, input: unknown) => {
    assertShellSender(event);
    const annotation = savedDiagnosticAnnotationSchema.parse(input);
    draftStore?.saveDiagnosticAnnotation(annotation);
  });
  ipcMain.handle(ipcChannels.deleteDiagnosticAnnotation, (event, input: unknown) => {
    assertShellSender(event);
    if (typeof input !== 'string') throw new Error('Invalid diagnostic annotation ID');
    draftStore?.deleteDiagnosticAnnotation(input);
  });
  ipcMain.handle(ipcChannels.syncElementComments, (event, input: unknown) => {
    assertShellSender(event);
    currentElementComments = savedElementCommentSchema.array().max(500).parse(input);
    websiteView?.webContents.send('markfix:render-element-comments', currentElementComments);
  });
  ipcMain.handle(ipcChannels.saveAnnotationSubmission, (event, input: unknown) => {
    assertShellSender(event);
    const submission = annotationSubmissionSchema.parse(input);
    for (const capture of submission.captures) decodeScreenshotDataUrl(capture.dataUrl);
    draftStore?.saveAnnotationSubmission(submission);
    const submittedElementCommentIds = submission.elementComments.map(({ id }) => id);
    currentElementComments = currentElementComments.filter(
      ({ id }) => !submittedElementCommentIds.includes(id),
    );
    websiteView?.webContents.send('markfix:render-element-comments', currentElementComments);
    sendShell(ipcChannels.annotationSubmissionSaved, {
      elementCommentCount: submission.elementComments.length,
      captureCount: submission.captures.length,
      diagnosticAnnotationCount: submission.diagnostics.length,
      elementCommentIds: submittedElementCommentIds,
      captureIds: submission.captures.map(({ id }) => id),
      diagnosticAnnotationIds: submission.diagnostics.map(({ id }) => id),
      submittedAt: submission.submittedAt,
    });
  });
  ipcMain.handle(ipcChannels.openAnnotationReview, async (event, input: unknown) => {
    assertShellSender(event);
    if (typeof input !== 'string') throw new Error('无效的项目 ID');
    if (!draftStore?.getWebsiteProject(input)) throw new Error('项目不存在或已被移除');
    await openAnnotationReviewWindow(input);
  });
  ipcMain.handle(ipcChannels.closeAnnotationReview, (event) => {
    assertShellSender(event);
    annotationReviewWindow?.close();
  });
  ipcMain.handle(ipcChannels.openAnnotationHistory, async (event) => {
    assertShellSender(event);
    await openAnnotationHistoryWindow();
  });
  ipcMain.handle(ipcChannels.openProjectAnnotationHistory, async (event, input: unknown) => {
    assertShellSender(event);
    if (typeof input !== 'string') throw new Error('无效的项目 ID');
    if (!draftStore?.getWebsiteProject(input)) throw new Error('项目不存在或已被移除');
    await openProjectAnnotationHistoryWindow(input);
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
    projectAnnotationHistoryWindow?.setParentWindow(null);
    annotationHistoryWindow?.setParentWindow(null);
    mainWindow?.show();
    mainWindow?.focus();
    mainWindow?.moveTop();
  });
  ipcMain.handle(ipcChannels.openCapturePreview, async (event, input: unknown) => {
    assertShellSender(event);
    if (typeof input !== 'string') throw new Error('Invalid capture ID');
    await openCapturePreviewWindow(input);
  });
  ipcMain.handle(ipcChannels.loadCapturePreview, (event, input: unknown) => {
    assertShellSender(event);
    if (typeof input !== 'string') throw new Error('Invalid capture ID');
    const capture = draftStore?.getCapture(input);
    if (!capture) throw new Error('截图不存在或已被删除');
    return capture;
  });
  ipcMain.handle(ipcChannels.setRecording, (event, input: unknown) => {
    assertShellSender(event);
    if (typeof input !== 'boolean') throw new Error('Invalid recorder state');
    recording = input;
    websiteView?.webContents.send('markfix:set-recorder', { enabled: recording, pageRevision });
    if (recording) {
      const url = websiteView?.webContents.getURL();
      if (url) {
        sendShell(ipcChannels.recorderEvent, {
          protocolVersion: 1,
          runtimeId: mainRecorderRuntimeId,
          pageRevision,
          type: 'navigation',
          timestampMs: Date.now(),
          url,
        });
      }
    }
  });
  ipcMain.handle(ipcChannels.syncAnnotations, (event, input: unknown) => {
    assertShellSender(event);
    const annotations = annotationSchema.array().max(500).parse(input);
    currentAnnotations = annotations;
    websiteView?.webContents.send('markfix:render-annotations', annotations);
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
  ipcMain.handle(ipcChannels.focusAnnotation, (event, input: unknown) => {
    assertShellSender(event);
    if (typeof input !== 'string' || !currentAnnotations.some(({ id }) => id === input)) {
      throw new Error('Unknown annotation');
    }
    websiteView?.webContents.send('markfix:focus-annotation', input);
  });
  ipcMain.handle(ipcChannels.capture, async (event, input: unknown) => {
    assertShellSender(event);
    if (!captureService) throw new Error('Capture service is unavailable');
    return captureService.capture(captureRequestSchema.parse(input));
  });
  ipcMain.handle(ipcChannels.saveDraft, (event, input: unknown) => {
    assertShellSender(event);
    draftStore?.save(desktopDraftSchema.parse(input));
  });
  ipcMain.handle(ipcChannels.loadDraft, (event) => {
    assertShellSender(event);
    const draft = draftStore?.load();
    if (draft?.pendingOutboxId) {
      const status = draftStore?.outboxStatus(draft.pendingOutboxId);
      if (status?.status === 'COMPLETED') {
        draftStore?.clear();
        return undefined;
      }
    }
    return draft;
  });
  ipcMain.handle(ipcChannels.clearDraft, (event) => {
    assertShellSender(event);
    draftStore?.clear();
  });
  ipcMain.handle(ipcChannels.loadSyncStatus, (event, input: unknown) => {
    assertShellSender(event);
    if (typeof input !== 'string') throw new Error('Invalid outbox ID');
    return draftStore?.outboxStatus(input);
  });
  ipcMain.handle(ipcChannels.submitReport, async (event, input: unknown) => {
    assertShellSender(event);
    assertSupportedClient(await loadClientPolicy(true));
    const candidate = createReportSchema.parse(input) as CreateReport;
    captureBundleSchema.parse(candidate.captureBundle);
    if (!draftStore) throw new Error('Local outbox is unavailable');
    const requestHash = createHash('sha256').update(JSON.stringify(candidate)).digest('hex');
    const entry = draftStore.enqueue(candidate, requestHash);
    await flushOutbox();
    const status = draftStore.outboxStatus(entry.id);
    if (status?.status === 'COMPLETED') draftStore.clear();
    return status?.status === 'COMPLETED'
      ? { disposition: 'submitted', reportId: status.reportId }
      : { disposition: 'queued', outboxId: entry.id };
  });
  ipcMain.on('markfix:target-region', (event, input: unknown) => {
    if (event.sender.id !== websiteView?.webContents.id) return;
    const parsed = anchorSchema.safeParse(input);
    if (!parsed.success || parsed.data.kind !== 'region') return;
    currentAnchor = parsed.data;
    sendShell(ipcChannels.region, parsed.data);
  });
  ipcMain.on('markfix:capture-selection', (event, input: unknown) => {
    if (event.sender.id !== websiteView?.webContents.id) return;
    if (input === null) {
      sendShell(ipcChannels.captureSelection, null);
      return;
    }
    const parsed = anchorSchema.safeParse(input);
    if (!parsed.success || parsed.data.kind !== 'region') return;
    sendShell(ipcChannels.captureSelection, parsed.data);
  });
  ipcMain.on('markfix:capture-marks-changed', (event, input: unknown) => {
    if (event.sender.id !== websiteView?.webContents.id) return;
    const parsed = screenshotMarkSchema.array().max(500).safeParse(input);
    if (!parsed.success) return;
    sendShell(ipcChannels.captureMarksChanged, parsed.data);
  });
  ipcMain.on('markfix:capture-action', (event, input: unknown) => {
    if (event.sender.id !== websiteView?.webContents.id) return;
    if (!['copy', 'save', 'finish'].includes(String(input))) return;
    sendShell(ipcChannels.captureAction, input);
  });
  ipcMain.on('markfix:recorder-event', (event, input: unknown) => {
    if (event.sender.id !== websiteView?.webContents.id) return;
    const parsed = recorderEventSchema.safeParse(input);
    if (!recording || !parsed.success || parsed.data.pageRevision !== pageRevision) return;
    sendShell(ipcChannels.recorderEvent, parsed.data);
  });
  ipcMain.on('markfix:target-annotation', (event, input: unknown) => {
    if (event.sender.id !== websiteView?.webContents.id) return;
    const parsed = annotationSchema.safeParse(input);
    if (!parsed.success || currentAnnotations.some(({ id }) => id === parsed.data.id)) return;
    currentAnnotations = [...currentAnnotations, parsed.data];
    sendShell(ipcChannels.annotationCreated, parsed.data);
    websiteView?.webContents.send('markfix:render-annotations', currentAnnotations);
  });
  ipcMain.on('markfix:target-annotation-selected', (event, input: unknown) => {
    if (event.sender.id !== websiteView?.webContents.id || typeof input !== 'string') return;
    if (!currentAnnotations.some(({ id }) => id === input)) return;
    sendShell(ipcChannels.annotationSelected, input);
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
  void flushOutbox();
  syncTimer = setInterval(() => void flushOutbox(), 15_000);
});

app.on('before-quit', () => {
  if (syncTimer) clearInterval(syncTimer);
  inspector?.detach();
  draftStore?.close();
});
app.on('window-all-closed', () => app.quit());
