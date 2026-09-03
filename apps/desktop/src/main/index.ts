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
  ipcChannels,
  navigateInputSchema,
  type Annotation,
  type CreateReport,
  type RegionAnchor,
} from '@markfix/contracts';
import { MarkFixApi } from '@markfix/api-client';
import { CdpInspector } from './cdp-inspector.js';
import { DraftStore } from './draft-store.js';
import { normalizeWebsiteUrl } from './url.js';

const toolbarHeight = 68;
const panelWidth = 392;
let mainWindow: BrowserWindow | undefined;
let websiteView: WebContentsView | undefined;
let inspector: CdpInspector | undefined;
let draftStore: DraftStore | undefined;
let shellWebContentsId: number | undefined;
let currentAnnotations: Annotation[] = [];

const assertShellSender = (event: IpcMainInvokeEvent): void => {
  if (event.sender.id !== shellWebContentsId) throw new Error('Untrusted IPC sender');
};

const sendShell = (channel: string, payload: unknown): void => {
  if (!mainWindow?.isDestroyed()) mainWindow?.webContents.send(channel, payload);
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
    return draftStore?.load();
  });
  ipcMain.handle(ipcChannels.submitReport, async (event, input: unknown) => {
    assertShellSender(event);
    const candidate = input as CreateReport;
    captureBundleSchema.parse(candidate.captureBundle);
    const api = new MarkFixApi(process.env.MARKFIX_API_URL ?? 'http://localhost:4310');
    const bootstrap = await api.bootstrap();
    const projectId = bootstrap.projects[0]?.id;
    if (!projectId) throw new Error('No MarkFix project is available');
    const report = await api.submitReport({ ...candidate, projectId });
    draftStore?.clear();
    return report;
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
  registerIpc();
  await createWindow();
});

app.on('before-quit', () => {
  inspector?.detach();
  draftStore?.close();
});
app.on('window-all-closed', () => app.quit());
