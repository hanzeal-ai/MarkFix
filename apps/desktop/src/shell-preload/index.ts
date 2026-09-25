import {
  annotationSaveFeedbackChannel,
  type AnnotationSaveFeedback,
} from '../annotation-save-feedback';
import type { CapturePin, ElementCommentPin } from '../capture-pin';
import type { InlineNote, InlineNoteAction } from '../inline-note';
import { contextBridge, ipcRenderer } from 'electron';
import {
  ipcChannels,
  type AnnotationSubmission,
  type Anchor,
  type BrowserMode,
  type CaptureRequest,
  type CreateReport,
  type DiagnosticEvidence,
  type HistoryAnnotationReference,
  type RegionAnchor,
  type ScreenshotMark,
  type ScreenshotStyle,
  type ScreenshotTool,
  type SavedCapture,
  type SavedDiagnosticAnnotation,
  type SavedElementComment,
} from '@markfix/contracts';
import { subscriptionIpcChannels } from '../subscription.js';
import { accountPageChannel, type AccountPage } from '../account-pages.js';
import { desktopUpdateChannels } from '../desktop-update.js';

const subscribe = (channel: string, listener: (payload: unknown) => void): (() => void) => {
  const handler = (_event: Electron.IpcRendererEvent, payload: unknown) => listener(payload);
  ipcRenderer.on(channel, handler);
  return () => ipcRenderer.removeListener(channel, handler);
};

ipcRenderer.on('window:fullscreen-changed', (_event, fullscreen: unknown) => {
  document.documentElement.classList.toggle('window-fullscreen', fullscreen === true);
});

let sidebarPreviewImage: HTMLImageElement | undefined;
ipcRenderer.on(
  'window:sidebar-preview',
  (
    _event,
    preview: {
      version: number;
      dataUrl: string;
      bounds: { x: number; y: number; width: number; height: number };
    } | null,
  ) => {
    sidebarPreviewImage?.remove();
    sidebarPreviewImage = undefined;
    if (!preview) return;
    const image = document.createElement('img');
    image.alt = '';
    image.setAttribute('aria-hidden', 'true');
    Object.assign(image.style, {
      position: 'fixed',
      pointerEvents: 'none',
      zIndex: '0',
      left: `${preview.bounds.x}px`,
      top: `${preview.bounds.y}px`,
      width: `${preview.bounds.width}px`,
      height: `${preview.bounds.height}px`,
    });
    image.onload = () => {
      if (sidebarPreviewImage === image)
        ipcRenderer.send('window:sidebar-preview-ready', preview.version);
    };
    sidebarPreviewImage = image;
    image.src = preview.dataUrl;
    document.body.append(image);
  },
);

window.addEventListener('DOMContentLoaded', () => {
  document.documentElement.dataset.platform = process.platform;
});

contextBridge.exposeInMainWorld('markfix', {
  annotationSaveFeedback: (code: AnnotationSaveFeedback) =>
    ipcRenderer.invoke(annotationSaveFeedbackChannel, code),
  platform: process.platform,
  manualUpdates:
    process.platform !== 'win32' && Boolean(import.meta.env.PRELOAD_VITE_MANUAL_UPDATES),
  prepareUpdate: (preparing: boolean) =>
    ipcRenderer.invoke(desktopUpdateChannels.prepare, preparing),
  openOfficialWebsite: () => ipcRenderer.invoke('website:open-official'),
  startUpdate: () => ipcRenderer.invoke(desktopUpdateChannels.start),
  updateStatus: () => ipcRenderer.invoke(desktopUpdateChannels.status),
  onUpdateStatus: (listener: (payload: unknown) => void) =>
    subscribe(desktopUpdateChannels.changed, listener),
  openAccountPage: (page: AccountPage) => ipcRenderer.invoke(accountPageChannel, page),
  enterLocalMode: () => ipcRenderer.invoke(ipcChannels.enterLocalMode),
  authStatus: () => ipcRenderer.invoke(ipcChannels.authStatus),
  register: (displayName: string, email: string, password: string) =>
    ipcRenderer.invoke(ipcChannels.authRegister, { displayName, email, password }),
  login: (email: string, password: string) =>
    ipcRenderer.invoke(ipcChannels.authLogin, { email, password }),
  changePassword: (currentPassword: string, newPassword: string) =>
    ipcRenderer.invoke(ipcChannels.authChangePassword, { currentPassword, newPassword }),
  logout: () => ipcRenderer.invoke(ipcChannels.authLogout),
  desktopBootstrap: () => ipcRenderer.invoke(ipcChannels.desktopBootstrap),
  getSubscription: () => ipcRenderer.invoke(subscriptionIpcChannels.get),
  requestSubscriptionUpgrade: () => ipcRenderer.invoke(subscriptionIpcChannels.upgrade),
  listEnvironments: (projectId: string) =>
    ipcRenderer.invoke(ipcChannels.listEnvironments, projectId),
  getProjectAgentData: (projectId: string) =>
    ipcRenderer.invoke(ipcChannels.getProjectAgentData, projectId),
  setProjectRepository: (
    projectId: string,
    binding: { repositoryId: string | null; repositoryName: string | null },
  ) => ipcRenderer.invoke(ipcChannels.setProjectRepository, { projectId, binding }),
  listWebsiteProjects: () => ipcRenderer.invoke(ipcChannels.listWebsiteProjects),
  listProjectAnnotationReports: (projectId: string, pageUrl: string) =>
    ipcRenderer.invoke(ipcChannels.listProjectAnnotationReports, { projectId, pageUrl }),
  createWebsiteProject: (storageMode: 'LOCAL' | 'CLOUD', url: string) =>
    ipcRenderer.invoke(ipcChannels.createWebsiteProject, { storageMode, url }),
  switchWebsiteProject: (projectId: string) =>
    ipcRenderer.invoke(ipcChannels.switchWebsiteProject, projectId),
  deleteWebsiteProject: (projectId: string) =>
    ipcRenderer.invoke(ipcChannels.deleteWebsiteProject, projectId),
  confirmDiscardDraft: (reason: 'switch-project' | 'new-annotation') =>
    ipcRenderer.invoke(ipcChannels.confirmDiscardDraft, reason),
  setWorkspaceLayout: (
    sidebarWidth: number,
    visible: boolean,
    peekWidth: number,
    panelWidth: number,
  ) =>
    ipcRenderer.invoke(ipcChannels.setWorkspaceLayout, {
      sidebarWidth,
      visible,
      peekWidth: peekWidth ?? 0,
      panelWidth,
    }),
  openSettings: () => ipcRenderer.invoke(ipcChannels.openSettings),
  navigate: (url: string) => ipcRenderer.invoke(ipcChannels.navigate, { url }),
  back: () => ipcRenderer.invoke(ipcChannels.goBack),
  forward: () => ipcRenderer.invoke(ipcChannels.goForward),
  reload: () => ipcRenderer.invoke(ipcChannels.reload),
  setDiagnosticsOpen: (open: boolean) => ipcRenderer.invoke(ipcChannels.diagnosticsSetOpen, open),
  listDiagnostics: () => ipcRenderer.invoke(ipcChannels.diagnosticsList),
  clearDiagnostics: (scope: 'all' | 'console' | 'network' = 'all') =>
    ipcRenderer.invoke(ipcChannels.diagnosticsClear, scope),
  evaluateJavaScript: (input: string) => ipcRenderer.invoke(ipcChannels.diagnosticsEvaluate, input),
  runCurl: (input: string) => ipcRenderer.invoke(ipcChannels.diagnosticsRunCurl, input),
  setMode: (mode: BrowserMode) => ipcRenderer.invoke(ipcChannels.setMode, mode),
  setCaptureTool: (tool: ScreenshotTool) => ipcRenderer.invoke(ipcChannels.setCaptureTool, tool),
  setCaptureStyle: (style: ScreenshotStyle) =>
    ipcRenderer.invoke(ipcChannels.setCaptureStyle, style),
  syncCaptureMarks: (marks: ScreenshotMark[]) =>
    ipcRenderer.invoke(ipcChannels.syncCaptureMarks, marks),
  clearCaptureSelection: () => ipcRenderer.invoke(ipcChannels.clearCaptureSelection),
  restoreCaptureSelection: (selection: RegionAnchor, marks: ScreenshotMark[]) =>
    ipcRenderer.invoke(ipcChannels.restoreCaptureSelection, { selection, marks }),
  copyCaptureImage: (dataUrl: string, note: string) =>
    ipcRenderer.invoke(ipcChannels.copyCaptureImage, { dataUrl, note }),
  saveCaptureImage: (dataUrl: string, suggestedName: string) =>
    ipcRenderer.invoke(ipcChannels.saveCaptureImage, { dataUrl, suggestedName }),
  listCaptureRecords: (projectId?: string) =>
    ipcRenderer.invoke(ipcChannels.listCaptureRecords, projectId),
  listAnnotationHistorySummaries: () =>
    ipcRenderer.invoke(ipcChannels.listAnnotationHistorySummaries),
  saveCaptureRecord: (capture: SavedCapture) =>
    ipcRenderer.invoke(ipcChannels.saveCaptureRecord, capture),
  deleteCaptureRecord: (id: string) => ipcRenderer.invoke(ipcChannels.deleteCaptureRecord, id),
  listElementComments: (projectId?: string) =>
    ipcRenderer.invoke(ipcChannels.listElementComments, projectId),
  saveElementComment: (comment: SavedElementComment) =>
    ipcRenderer.invoke(ipcChannels.saveElementComment, comment),
  deleteElementComment: (id: string) => ipcRenderer.invoke(ipcChannels.deleteElementComment, id),
  syncCapturePins: (pins: CapturePin[]) => ipcRenderer.invoke('annotation:sync-capture-pins', pins),
  syncElementComments: (comments: ElementCommentPin[]) =>
    ipcRenderer.invoke(ipcChannels.syncElementComments, comments),
  listDiagnosticAnnotations: (projectId?: string) =>
    ipcRenderer.invoke(ipcChannels.listDiagnosticAnnotations, projectId),
  saveDiagnosticAnnotation: (annotation: SavedDiagnosticAnnotation) =>
    ipcRenderer.invoke(ipcChannels.saveDiagnosticAnnotation, annotation),
  deleteDiagnosticAnnotation: (id: string) =>
    ipcRenderer.invoke(ipcChannels.deleteDiagnosticAnnotation, id),
  saveAnnotationSubmission: (submission: AnnotationSubmission) =>
    ipcRenderer.invoke(ipcChannels.saveAnnotationSubmission, submission),
  openAnnotationReview: (projectId: string) =>
    ipcRenderer.invoke(ipcChannels.openAnnotationReview, projectId),
  closeAnnotationReview: () => ipcRenderer.invoke(ipcChannels.closeAnnotationReview),
  openAnnotationHistory: () => ipcRenderer.invoke(ipcChannels.openAnnotationHistory),
  openProjectAnnotationHistory: (projectId: string) =>
    ipcRenderer.invoke(ipcChannels.openProjectAnnotationHistory, projectId),
  selectHistoricalAnnotation: (reference: HistoryAnnotationReference) =>
    ipcRenderer.invoke(ipcChannels.selectAnnotationHistory, reference),
  openCapturePreview: (projectId: string, captureId: string) =>
    ipcRenderer.invoke(ipcChannels.openCapturePreview, { projectId, captureId }),
  loadCapturePreview: (projectId: string, captureId: string) =>
    ipcRenderer.invoke(ipcChannels.loadCapturePreview, { projectId, captureId }),
  syncAnchor: (anchor: Anchor | null) => ipcRenderer.invoke(ipcChannels.syncAnchor, anchor),
  capture: (request: CaptureRequest) => ipcRenderer.invoke(ipcChannels.capture, request),
  loadSyncStatus: (outboxId: string) => ipcRenderer.invoke(ipcChannels.loadSyncStatus, outboxId),
  submitReport: (report: CreateReport, idempotencyKey?: string) =>
    ipcRenderer.invoke(ipcChannels.submitReport, { report, idempotencyKey }),
  onBrowserState: (listener: (payload: unknown) => void) =>
    subscribe(ipcChannels.browserState, listener),
  onDiagnostic: (listener: (payload: DiagnosticEvidence) => void) =>
    subscribe(ipcChannels.diagnosticsEvent, (payload) => listener(payload as DiagnosticEvidence)),
  onModeShortcut: (listener: (payload: unknown) => void) =>
    subscribe(ipcChannels.modeShortcut, listener),
  onSelection: (listener: (payload: unknown) => void) => subscribe(ipcChannels.selection, listener),
  onCaptureSelection: (listener: (payload: unknown) => void) =>
    subscribe(ipcChannels.captureSelection, listener),
  onCaptureMarksChanged: (listener: (payload: unknown) => void) =>
    subscribe(ipcChannels.captureMarksChanged, listener),
  syncInlineNote: (payload: InlineNote | null) =>
    ipcRenderer.invoke('annotation:sync-inline-note', payload),
  onInlineNoteAction: (listener: (payload: InlineNoteAction) => void) =>
    subscribe('annotation:inline-note-action', (payload) => listener(payload as InlineNoteAction)),
  onCaptureAction: (listener: (payload: unknown) => void) =>
    subscribe(ipcChannels.captureAction, listener),
  onAnchorRecovery: (listener: (payload: unknown) => void) =>
    subscribe(ipcChannels.anchorRecovery, listener),
  onSyncStatus: (listener: (payload: unknown) => void) =>
    subscribe(ipcChannels.syncStatus, listener),
  onAnnotationSubmissionSaved: (listener: (payload: unknown) => void) =>
    subscribe(ipcChannels.annotationSubmissionSaved, listener),
  onHistoricalAnnotationSelected: (listener: (payload: HistoryAnnotationReference) => void) =>
    subscribe(ipcChannels.annotationHistorySelected, (payload) =>
      listener(payload as HistoryAnnotationReference),
    ),
});
