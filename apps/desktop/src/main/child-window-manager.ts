import { join } from 'node:path';
import { BrowserWindow } from 'electron';

type ChildWindowManagerOptions = {
  mainWindow: () => BrowserWindow | undefined;
  captureExists: (projectId: string, captureId: string) => Promise<boolean>;
  registerShortcuts: (window: BrowserWindow) => void;
};

const macWindowMaterial =
  process.platform === 'darwin'
    ? ({ vibrancy: 'under-window', visualEffectState: 'followWindow' } as const)
    : {};

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

const childWebPreferences = () => ({
  preload: join(__dirname, '../preload/shell.cjs'),
  contextIsolation: true,
  nodeIntegration: false,
  sandbox: true,
});

export class ChildWindowManager {
  private settingsWindow: BrowserWindow | undefined;
  private annotationReviewWindow: BrowserWindow | undefined;
  private annotationReviewProjectId: string | undefined;
  private annotationHistoryWindow: BrowserWindow | undefined;
  private projectAnnotationHistoryWindow: BrowserWindow | undefined;
  private projectAnnotationHistoryProjectId: string | undefined;
  private capturePreviewWindow: BrowserWindow | undefined;

  constructor(private readonly options: ChildWindowManagerOptions) {}

  isTrustedSender(webContentsId: number): boolean {
    return [
      this.annotationReviewWindow,
      this.annotationHistoryWindow,
      this.projectAnnotationHistoryWindow,
      this.capturePreviewWindow,
    ].some((window) => window?.webContents.id === webContentsId);
  }

  isSettingsSender(webContentsId: number): boolean {
    return this.settingsWindow?.webContents.id === webContentsId;
  }

  closeSettings(): void {
    this.settingsWindow?.close();
  }

  closeProjectWindows(projectId: string): void {
    if (this.annotationReviewProjectId === projectId) this.annotationReviewWindow?.close();
    if (this.projectAnnotationHistoryProjectId === projectId)
      this.projectAnnotationHistoryWindow?.close();
  }

  closeAnnotationReview(): void {
    this.annotationReviewWindow?.close();
  }

  focusMainFromHistory(): void {
    this.projectAnnotationHistoryWindow?.hide();
    this.annotationHistoryWindow?.hide();
    const mainWindow = this.options.mainWindow();
    mainWindow?.show();
    mainWindow?.focus();
    mainWindow?.moveTop();
  }

  async openSettings(): Promise<void> {
    const mainWindow = this.requireMainWindow();
    if (this.settingsWindow && !this.settingsWindow.isDestroyed()) {
      this.settingsWindow.show();
      this.settingsWindow.focus();
      return;
    }
    const settings = this.createWindow({
      ...macWindowMaterial,
      parent: mainWindow,
      titleBarStyle: 'default',
      width: 760,
      height: 520,
      minWidth: 680,
      minHeight: 460,
      title: '设置 - MarkFix',
      backgroundColor: process.platform === 'darwin' ? '#00000000' : '#f4f5f7',
    });
    this.settingsWindow = settings;
    settings.on('closed', () => {
      if (this.settingsWindow === settings) this.settingsWindow = undefined;
    });
    await this.showWhenReady(settings, 'settings');
  }

  async openAnnotationReview(projectId: string, storageMode: 'LOCAL' | 'CLOUD'): Promise<void> {
    const mainWindow = this.requireMainWindow();
    if (this.annotationReviewWindow && !this.annotationReviewWindow.isDestroyed()) {
      if (this.annotationReviewProjectId === projectId) {
        this.annotationReviewWindow.show();
        this.annotationReviewWindow.focus();
        return;
      }
      this.annotationReviewWindow.close();
    }
    const bounds = mainWindow.getBounds();
    const reviewWindow = this.createWindow({
      ...macWindowMaterial,
      parent: mainWindow,
      width: Math.max(760, Math.min(1040, bounds.width - 80)),
      height: Math.max(620, Math.min(780, bounds.height - 80)),
      minWidth: 760,
      minHeight: 620,
      title: '保存标注 - MarkFix',
      backgroundColor: process.platform === 'darwin' ? '#00000000' : '#f4f5f7',
    });
    this.annotationReviewWindow = reviewWindow;
    this.annotationReviewProjectId = projectId;
    reviewWindow.on('closed', () => {
      if (this.annotationReviewWindow !== reviewWindow) return;
      this.annotationReviewWindow = undefined;
      this.annotationReviewProjectId = undefined;
    });
    await this.showWhenReady(reviewWindow, 'annotation-save', { projectId, storageMode });
  }

  async openCapturePreview(projectId: string, captureId: string): Promise<void> {
    if (!(await this.options.captureExists(projectId, captureId)))
      throw new Error('截图不存在或已被删除');
    if (this.capturePreviewWindow && !this.capturePreviewWindow.isDestroyed())
      this.capturePreviewWindow.close();
    const parent =
      this.annotationReviewWindow && !this.annotationReviewWindow.isDestroyed()
        ? this.annotationReviewWindow
        : this.requireMainWindow();
    const bounds = parent.getBounds();
    const previewWindow = this.createWindow({
      parent,
      width: Math.max(720, Math.min(1180, bounds.width - 40)),
      height: Math.max(560, Math.min(820, bounds.height - 40)),
      minWidth: 640,
      minHeight: 480,
      title: '截图预览 - MarkFix',
      backgroundColor: '#202127',
    });
    this.capturePreviewWindow = previewWindow;
    previewWindow.on('closed', () => {
      if (this.capturePreviewWindow === previewWindow) this.capturePreviewWindow = undefined;
    });
    await this.showWhenReady(previewWindow, 'capture-preview', { projectId, captureId });
  }

  async openAnnotationHistory(): Promise<void> {
    const mainWindow = this.requireMainWindow();
    if (this.annotationHistoryWindow && !this.annotationHistoryWindow.isDestroyed()) {
      this.annotationHistoryWindow.setParentWindow(mainWindow);
      this.annotationHistoryWindow.reload();
      this.annotationHistoryWindow.show();
      this.annotationHistoryWindow.focus();
      return;
    }
    const bounds = mainWindow.getBounds();
    const historyWindow = this.createWindow({
      ...macWindowMaterial,
      parent: mainWindow,
      width: Math.max(760, Math.min(1040, bounds.width - 80)),
      height: Math.max(560, Math.min(780, bounds.height - 80)),
      minWidth: 720,
      minHeight: 520,
      title: '历史标注 - MarkFix',
      backgroundColor: process.platform === 'darwin' ? '#00000000' : '#f4f5f7',
    });
    this.annotationHistoryWindow = historyWindow;
    historyWindow.on('closed', () => {
      if (this.annotationHistoryWindow === historyWindow) this.annotationHistoryWindow = undefined;
    });
    await this.showWhenReady(historyWindow, 'annotation-history');
  }

  async openProjectAnnotationHistory(projectId: string): Promise<void> {
    const parent =
      this.annotationHistoryWindow && !this.annotationHistoryWindow.isDestroyed()
        ? this.annotationHistoryWindow
        : this.requireMainWindow();
    if (this.projectAnnotationHistoryWindow && !this.projectAnnotationHistoryWindow.isDestroyed()) {
      if (this.projectAnnotationHistoryProjectId === projectId) {
        this.projectAnnotationHistoryWindow.setParentWindow(parent);
        this.projectAnnotationHistoryWindow.show();
        this.projectAnnotationHistoryWindow.focus();
        return;
      }
      this.projectAnnotationHistoryWindow.close();
    }
    const bounds = parent.getBounds();
    const projectHistoryWindow = this.createWindow({
      ...macWindowMaterial,
      parent,
      x: bounds.x,
      y: bounds.y,
      width: bounds.width,
      height: bounds.height,
      minWidth: 720,
      minHeight: 520,
      title: '项目历史 - MarkFix',
      backgroundColor: process.platform === 'darwin' ? '#00000000' : '#f4f5f7',
    });
    this.projectAnnotationHistoryWindow = projectHistoryWindow;
    this.projectAnnotationHistoryProjectId = projectId;
    projectHistoryWindow.on('closed', () => {
      if (this.projectAnnotationHistoryWindow !== projectHistoryWindow) return;
      this.projectAnnotationHistoryWindow = undefined;
      this.projectAnnotationHistoryProjectId = undefined;
    });
    await this.showWhenReady(projectHistoryWindow, 'project-annotation-history', { projectId });
  }

  private requireMainWindow(): BrowserWindow {
    const mainWindow = this.options.mainWindow();
    if (!mainWindow || mainWindow.isDestroyed()) throw new Error('Main window is unavailable');
    return mainWindow;
  }

  private createWindow(options: Electron.BrowserWindowConstructorOptions): BrowserWindow {
    const titleBarStyle = options.titleBarStyle ?? 'hiddenInset';
    const window = new BrowserWindow({
      ...options,
      show: false,
      titleBarStyle,
      ...(titleBarStyle === 'default' ? {} : { trafficLightPosition: { x: 16, y: 16 } }),
      autoHideMenuBar: true,
      webPreferences: childWebPreferences(),
    });
    this.options.registerShortcuts(window);
    return window;
  }

  private async showWhenReady(
    window: BrowserWindow,
    view: string,
    query?: Record<string, string>,
  ): Promise<void> {
    window.once('ready-to-show', () => window.show());
    try {
      await loadRendererView(window, view, query);
    } catch (error) {
      if (!window.isDestroyed()) throw error;
    }
  }
}
