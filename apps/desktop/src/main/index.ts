import { createHash } from 'node:crypto';
import { join } from 'node:path';
import {
  app,
  BrowserWindow,
  ipcMain,
  session,
  WebContentsView,
  type IpcMainInvokeEvent,
} from 'electron';
import {
  annotationSchema,
  annotationToolSchema,
  browserModeSchema,
  captureBundleSchema,
  createReportSchema,
  ipcChannels,
  navigateInputSchema,
  type Annotation,
  type CreateReport,
  type RegionAnchor,
} from '@markfix/contracts';
import { MarkFixApi } from '@markfix/api-client';
import { CdpInspector } from './cdp-inspector.js';
import { DraftStore } from './draft-store.js';
import type { OutboxEntry } from './draft-store.js';
import { normalizeWebsiteUrl } from './url.js';

const toolbarHeight = 68;
const panelWidth = 392;
let mainWindow: BrowserWindow | undefined;
let websiteView: WebContentsView | undefined;
let inspector: CdpInspector | undefined;
let draftStore: DraftStore | undefined;
let shellWebContentsId: number | undefined;
let currentAnnotations: Annotation[] = [];
let isSyncing = false;
let syncTimer: ReturnType<typeof setInterval> | undefined;

const assertShellSender = (event: IpcMainInvokeEvent): void => {
  if (event.sender.id !== shellWebContentsId) throw new Error('Untrusted IPC sender');
};

const sendShell = (channel: string, payload: unknown): void => {
  if (!mainWindow?.isDestroyed()) mainWindow?.webContents.send(channel, payload);
};

const syncEntry = async (entry: OutboxEntry): Promise<void> => {
  if (!draftStore) return;
  try {
    const candidate = createReportSchema.parse(entry.payload);
    const api = new MarkFixApi(process.env.MARKFIX_API_URL ?? 'http://localhost:4310');
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
  }
};

const flushOutbox = async (): Promise<void> => {
  if (isSyncing || !draftStore) return;
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
      preload: join(__dirname, '../preload/shell.mjs'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });
  shellWebContentsId = mainWindow.webContents.id;
  websiteView = new WebContentsView({
    webPreferences: {
      preload: join(__dirname, '../preload/target.mjs'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      webSecurity: true,
      partition: 'persist:markfix-profile-default',
    },
  });
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
  websiteView.webContents.on('did-navigate', (_event, url) =>
    sendShell(ipcChannels.browserState, { url, loading: false }),
  );
  websiteView.webContents.on('did-navigate-in-page', (_event, url) =>
    sendShell(ipcChannels.browserState, { url, loading: false }),
  );
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
      sendShell(ipcChannels.selection, anchor);
      websiteView?.webContents.send('markfix:show-anchor', anchor);
    },
    (message) => {
      sendShell(ipcChannels.browserState, { error: `${message}. Switched to region selection.` });
      websiteView?.webContents.send('markfix:set-mode', 'region');
    },
  );

  if (process.env.ELECTRON_RENDERER_URL)
    await mainWindow.loadURL(process.env.ELECTRON_RENDERER_URL);
  else await mainWindow.loadFile(join(__dirname, '../renderer/index.html'));
  await websiteView.webContents.loadURL('https://example.com');
};

const registerIpc = (): void => {
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
  ipcMain.handle(ipcChannels.syncAnnotations, (event, input: unknown) => {
    assertShellSender(event);
    const annotations = annotationSchema.array().max(500).parse(input);
    currentAnnotations = annotations;
    websiteView?.webContents.send('markfix:render-annotations', annotations);
  });
  ipcMain.handle(ipcChannels.capture, async (event) => {
    assertShellSender(event);
    const image = await websiteView?.webContents.capturePage();
    if (!image) throw new Error('Website view is unavailable');
    return {
      dataUrl: image.toDataURL(),
      width: image.getSize().width,
      height: image.getSize().height,
      deviceScaleFactor: websiteView?.webContents.getZoomFactor() ?? 1,
      url: websiteView?.webContents.getURL() ?? '',
      title: websiteView?.webContents.getTitle() ?? '',
    };
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
    const candidate = input as RegionAnchor;
    sendShell(ipcChannels.region, candidate);
  });
  ipcMain.on('markfix:recorder-event', (event, input: unknown) => {
    if (event.sender.id !== websiteView?.webContents.id) return;
    sendShell(ipcChannels.recorderEvent, input);
  });
  ipcMain.on('markfix:target-annotation', (event, input: unknown) => {
    if (event.sender.id !== websiteView?.webContents.id) return;
    const parsed = annotationSchema.safeParse(input);
    if (!parsed.success || currentAnnotations.some(({ id }) => id === parsed.data.id)) return;
    currentAnnotations = [...currentAnnotations, parsed.data];
    sendShell(ipcChannels.annotationCreated, parsed.data);
    websiteView?.webContents.send('markfix:render-annotations', currentAnnotations);
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
