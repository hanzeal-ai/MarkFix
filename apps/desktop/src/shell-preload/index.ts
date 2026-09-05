import { contextBridge, ipcRenderer } from 'electron';
import {
  ipcChannels,
  type Annotation,
  type AnnotationSubmission,
  type AnnotationTool,
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

const subscribe = (channel: string, listener: (payload: unknown) => void): (() => void) => {
  const handler = (_event: Electron.IpcRendererEvent, payload: unknown) => listener(payload);
  ipcRenderer.on(channel, handler);
  return () => ipcRenderer.removeListener(channel, handler);
};

contextBridge.exposeInMainWorld('markfix', {
  authStatus: () => ipcRenderer.invoke(ipcChannels.authStatus),
  login: (email: string, password: string) =>
    ipcRenderer.invoke(ipcChannels.authLogin, { email, password }),
  logout: () => ipcRenderer.invoke(ipcChannels.authLogout),
  desktopBootstrap: () => ipcRenderer.invoke(ipcChannels.desktopBootstrap),
  listWorkspaces: () => ipcRenderer.invoke(ipcChannels.listWorkspaces),
  getSubscription: (workspaceId: string) =>
    ipcRenderer.invoke(subscriptionIpcChannels.get, workspaceId),
  requestSubscriptionUpgrade: (workspaceId: string) =>
    ipcRenderer.invoke(subscriptionIpcChannels.upgrade, workspaceId),
  listEnvironments: (projectId: string) =>
    ipcRenderer.invoke(ipcChannels.listEnvironments, projectId),
  listWebsiteProjects: () => ipcRenderer.invoke(ipcChannels.listWebsiteProjects),
  listProjectAnnotationReports: (projectId: string) =>
    ipcRenderer.invoke(ipcChannels.listProjectAnnotationReports, projectId),
  createWebsiteProject: (workspaceId: string, url: string) =>
    ipcRenderer.invoke(ipcChannels.createWebsiteProject, { workspaceId, url }),
  switchWebsiteProject: (projectId: string) =>
    ipcRenderer.invoke(ipcChannels.switchWebsiteProject, projectId),
  deleteWebsiteProject: (projectId: string) =>
    ipcRenderer.invoke(ipcChannels.deleteWebsiteProject, projectId),
  confirmDiscardDraft: (reason: 'switch-project' | 'new-annotation') =>
    ipcRenderer.invoke(ipcChannels.confirmDiscardDraft, reason),
  setWorkspaceLayout: (sidebarWidth: 0 | 228, visible: boolean) =>
    ipcRenderer.invoke(ipcChannels.setWorkspaceLayout, { sidebarWidth, visible }),
  openMoreMenu: (x: number, y: number) => ipcRenderer.invoke(ipcChannels.openMoreMenu, { x, y }),
  openSettings: () => ipcRenderer.invoke(ipcChannels.openSettings),
  submitProjectAnnotations: (projectId: string) =>
    ipcRenderer.invoke(ipcChannels.submitProjectAnnotations, projectId),
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
  setAnnotationTool: (tool: AnnotationTool) =>
    ipcRenderer.invoke(ipcChannels.setAnnotationTool, tool),
  setCaptureTool: (tool: ScreenshotTool) => ipcRenderer.invoke(ipcChannels.setCaptureTool, tool),
  setCaptureStyle: (style: ScreenshotStyle) =>
    ipcRenderer.invoke(ipcChannels.setCaptureStyle, style),
  syncCaptureMarks: (marks: ScreenshotMark[]) =>
    ipcRenderer.invoke(ipcChannels.syncCaptureMarks, marks),
  clearCaptureSelection: () => ipcRenderer.invoke(ipcChannels.clearCaptureSelection),
  restoreCaptureSelection: (selection: RegionAnchor, marks: ScreenshotMark[]) =>
    ipcRenderer.invoke(ipcChannels.restoreCaptureSelection, { selection, marks }),
  copyCaptureImage: (dataUrl: string) => ipcRenderer.invoke(ipcChannels.copyCaptureImage, dataUrl),
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
  syncElementComments: (comments: SavedElementComment[]) =>
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
  openCapturePreview: (captureId: string) =>
    ipcRenderer.invoke(ipcChannels.openCapturePreview, captureId),
  loadCapturePreview: (captureId: string) =>
    ipcRenderer.invoke(ipcChannels.loadCapturePreview, captureId),
  setRecording: (enabled: boolean) => ipcRenderer.invoke(ipcChannels.setRecording, enabled),
  syncAnnotations: (annotations: Annotation[]) =>
    ipcRenderer.invoke(ipcChannels.syncAnnotations, annotations),
  syncAnchor: (anchor: Anchor | null) => ipcRenderer.invoke(ipcChannels.syncAnchor, anchor),
  focusAnnotation: (annotationId: string) =>
    ipcRenderer.invoke(ipcChannels.focusAnnotation, annotationId),
  capture: (request: CaptureRequest) => ipcRenderer.invoke(ipcChannels.capture, request),
  saveDraft: (draft: unknown) => ipcRenderer.invoke(ipcChannels.saveDraft, draft),
  loadDraft: () => ipcRenderer.invoke(ipcChannels.loadDraft),
  clearDraft: () => ipcRenderer.invoke(ipcChannels.clearDraft),
  loadSyncStatus: (outboxId: string) => ipcRenderer.invoke(ipcChannels.loadSyncStatus, outboxId),
  submitReport: (report: CreateReport, idempotencyKey?: string, clearDraft = true) =>
    ipcRenderer.invoke(ipcChannels.submitReport, { report, idempotencyKey, clearDraft }),
  onBrowserState: (listener: (payload: unknown) => void) =>
    subscribe(ipcChannels.browserState, listener),
  onDiagnostic: (listener: (payload: DiagnosticEvidence) => void) =>
    subscribe(ipcChannels.diagnosticsEvent, (payload) => listener(payload as DiagnosticEvidence)),
  onModeShortcut: (listener: (payload: unknown) => void) =>
    subscribe(ipcChannels.modeShortcut, listener),
  onSelection: (listener: (payload: unknown) => void) => subscribe(ipcChannels.selection, listener),
  onRegion: (listener: (payload: unknown) => void) => subscribe(ipcChannels.region, listener),
  onCaptureSelection: (listener: (payload: unknown) => void) =>
    subscribe(ipcChannels.captureSelection, listener),
  onCaptureMarksChanged: (listener: (payload: unknown) => void) =>
    subscribe(ipcChannels.captureMarksChanged, listener),
  onCaptureAction: (listener: (payload: unknown) => void) =>
    subscribe(ipcChannels.captureAction, listener),
  onRecorderEvent: (listener: (payload: unknown) => void) =>
    subscribe(ipcChannels.recorderEvent, listener),
  onAnnotationCreated: (listener: (payload: unknown) => void) =>
    subscribe(ipcChannels.annotationCreated, listener),
  onAnnotationSelected: (listener: (payload: unknown) => void) =>
    subscribe(ipcChannels.annotationSelected, listener),
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
