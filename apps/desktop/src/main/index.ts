import { createHash, randomUUID } from 'node:crypto';
import { readFile, unlink, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import {
  app,
  BrowserWindow,
  ipcMain,
  safeStorage,
  session,
  WebContentsView,
  type IpcMainInvokeEvent,
} from 'electron';
import {
  anchorSchema,
  annotationSchema,
  annotationToolSchema,
  browserModeSchema,
  captureRequestSchema,
  captureBundleSchema,
  createReportSchema,
  ipcChannels,
  navigateInputSchema,
  recorderEventSchema,
  type Anchor,
  type Annotation,
  type ClientPolicy,
  type CreateReport,
} from '@markfix/contracts';
import { MarkFixApi } from '@markfix/api-client';
import { anchorsEqual } from './anchor-state.js';
import { CdpInspector } from './cdp-inspector.js';
import { CaptureService } from './capture-service.js';
import { DraftStore } from './draft-store.js';
import type { OutboxEntry } from './draft-store.js';
import { normalizeWebsiteUrl } from './url.js';

const toolbarHeight = 68;
const panelWidth = 392;
const api = new MarkFixApi(process.env.MARKFIX_API_URL ?? 'http://localhost:4310');
let mainWindow: BrowserWindow | undefined;
let websiteView: WebContentsView | undefined;
let inspector: CdpInspector | undefined;
let captureService: CaptureService | undefined;
let draftStore: DraftStore | undefined;
let shellWebContentsId: number | undefined;
let currentAnnotations: Annotation[] = [];
let currentAnchor: Anchor | undefined;
let isSyncing = false;
let syncTimer: ReturnType<typeof setInterval> | undefined;
let recording = false;
let pageRevision = randomUUID();
let authenticatedUser: { id: string; email: string; displayName: string } | undefined;
let policyCache: { value: ClientPolicy; checkedAtMs: number } | undefined;
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
    websiteView?.setVisible(true);
    return authenticatedUser;
  } catch {
    api.setTokens();
    await clearRefreshToken();
    return undefined;
  }
};

const assertShellSender = (event: IpcMainInvokeEvent): void => {
  if (event.sender.id !== shellWebContentsId) throw new Error('Untrusted IPC sender');
};

const sendShell = (channel: string, payload: unknown): void => {
  if (!mainWindow?.isDestroyed()) mainWindow?.webContents.send(channel, payload);
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

const setOverlayHidden = (hidden: boolean): Promise<void> => {
  if (!websiteView) return Promise.reject(new Error('Website view is unavailable'));
  const requestId = randomUUID();
  return new Promise((resolve, reject) => {
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
};

const syncEntry = async (entry: OutboxEntry): Promise<void> => {
  if (!draftStore) return;
  try {
    assertSupportedClient(await loadClientPolicy());
    const candidate = createReportSchema.parse(entry.payload);
    const bootstrap = await api.bootstrap();
    const projectId = bootstrap.projects[0]?.id;
    if (!projectId) throw new Error('No MarkFix project is available');
    const report = await api.submitReport({ ...candidate, projectId }, entry.idempotencyKey);
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
  websiteView.setBounds({
    x: 0,
    y: toolbarHeight,
    width: Math.max(320, width - panelWidth),
    height: Math.max(200, height - toolbarHeight),
  });
};

const createWindow = async (): Promise<void> => {
  mainWindow = new BrowserWindow({
    width: 1440,
    height: 900,
    minWidth: 1060,
    minHeight: 680,
    titleBarStyle: 'hiddenInset',
    backgroundColor: '#f4f4ef',
    webPreferences: {
      preload: join(__dirname, '../preload/shell.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });
  shellWebContentsId = mainWindow.webContents.id;
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
  websiteView.setVisible(false);
  mainWindow.contentView.addChildView(websiteView);
  layoutWebsite();
  mainWindow.on('resize', layoutWebsite);

  websiteView.webContents.setWindowOpenHandler(({ url }) => {
    void websiteView?.webContents.loadURL(url);
    return { action: 'deny' };
  });
  websiteView.webContents.on('will-navigate', (_event, url) =>
    sendShell(ipcChannels.browserState, { url, loading: true }),
  );
  websiteView.webContents.on('did-navigate', (_event, url) => {
    sendShell(ipcChannels.browserState, { url, loading: false });
    updatePageRevision(url);
  });
  websiteView.webContents.on('did-navigate-in-page', (_event, url) => {
    sendShell(ipcChannels.browserState, { url, loading: false });
    updatePageRevision(url);
  });
  websiteView.webContents.on('did-finish-load', () => {
    websiteView?.webContents.send('markfix:render-annotations', currentAnnotations);
    if (currentAnchor?.kind === 'element')
      websiteView?.webContents.send('markfix:resolve-anchor', {
        anchor: currentAnchor,
        force: true,
      });
    websiteView?.webContents.send('markfix:set-recorder', { enabled: recording, pageRevision });
  });
  websiteView.webContents.on('did-fail-load', (_event, code, description, url, isMainFrame) => {
    if (isMainFrame)
      sendShell(ipcChannels.browserState, {
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
      sendShell(ipcChannels.browserState, { error: `${message}. Switched to region selection.` });
      websiteView?.webContents.send('markfix:set-mode', 'region');
    },
  );
  captureService = new CaptureService(
    websiteView.webContents,
    () => websiteView?.getBounds() ?? { width: 1, height: 1, x: 0, y: 0 },
    () => pageRevision,
    setOverlayHidden,
  );

  if (process.env.ELECTRON_RENDERER_URL)
    await mainWindow.loadURL(process.env.ELECTRON_RENDERER_URL);
  else await mainWindow.loadFile(join(__dirname, '../renderer/index.html'));
  await websiteView.webContents.loadURL('https://example.com');
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
    websiteView?.setVisible(true);
    void flushOutbox();
    return authenticatedUser;
  });
  ipcMain.handle(ipcChannels.authLogout, async (event) => {
    assertShellSender(event);
    try {
      await api.logout();
    } finally {
      authenticatedUser = undefined;
      api.setTokens();
      websiteView?.setVisible(false);
      await clearRefreshToken();
    }
  });
  ipcMain.handle(ipcChannels.navigate, async (event, input: unknown) => {
    assertShellSender(event);
    const { url } = navigateInputSchema.parse(input);
    const normalized = normalizeWebsiteUrl(url, process.env.MARKFIX_ALLOW_HTTP === 'true');
    await websiteView?.webContents.loadURL(normalized);
    return normalized;
  });
  ipcMain.handle(ipcChannels.goBack, (event) => {
    assertShellSender(event);
    if (websiteView?.webContents.navigationHistory.canGoBack())
      websiteView.webContents.navigationHistory.goBack();
  });
  ipcMain.handle(ipcChannels.goForward, (event) => {
    assertShellSender(event);
    if (websiteView?.webContents.navigationHistory.canGoForward())
      websiteView.webContents.navigationHistory.goForward();
  });
  ipcMain.handle(ipcChannels.reload, (event) => {
    assertShellSender(event);
    websiteView?.webContents.reload();
  });
  ipcMain.handle(ipcChannels.setMode, async (event, input: unknown) => {
    assertShellSender(event);
    const mode = browserModeSchema.parse(input);
    if (mode === 'inspect') await inspector?.start();
    else websiteView?.webContents.send('markfix:set-mode', mode);
  });
  ipcMain.handle(ipcChannels.setAnnotationTool, (event, input: unknown) => {
    assertShellSender(event);
    const tool = annotationToolSchema.parse(input);
    websiteView?.webContents.send('markfix:set-tool', tool);
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
  ipcMain.handle(ipcChannels.capture, async (event, input: unknown) => {
    assertShellSender(event);
    if (!captureService) throw new Error('Capture service is unavailable');
    return captureService.capture(captureRequestSchema.parse(input));
  });
  ipcMain.handle(ipcChannels.saveDraft, (event, input: unknown) => {
    assertShellSender(event);
    draftStore?.save(input);
  });
  ipcMain.handle(ipcChannels.loadDraft, (event) => {
    assertShellSender(event);
    const draft = draftStore?.load() as { pendingOutboxId?: unknown } | undefined;
    if (typeof draft?.pendingOutboxId === 'string') {
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
