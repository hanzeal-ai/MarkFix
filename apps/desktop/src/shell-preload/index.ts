import { contextBridge, ipcRenderer } from 'electron';
import {
  ipcChannels,
  type Annotation,
  type AnnotationTool,
  type Anchor,
  type BrowserMode,
  type CaptureRequest,
  type CreateReport,
  type ScreenshotMark,
  type ScreenshotStyle,
  type ScreenshotTool,
  type SavedCapture,
} from '@markfix/contracts';

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
  listWorkspaces: () => ipcRenderer.invoke(ipcChannels.listWorkspaces),
  listEnvironments: (projectId: string) =>
    ipcRenderer.invoke(ipcChannels.listEnvironments, projectId),
  navigate: (url: string) => ipcRenderer.invoke(ipcChannels.navigate, { url }),
  back: () => ipcRenderer.invoke(ipcChannels.goBack),
  forward: () => ipcRenderer.invoke(ipcChannels.goForward),
  reload: () => ipcRenderer.invoke(ipcChannels.reload),
  setMode: (mode: BrowserMode) => ipcRenderer.invoke(ipcChannels.setMode, mode),
  setAnnotationTool: (tool: AnnotationTool) =>
    ipcRenderer.invoke(ipcChannels.setAnnotationTool, tool),
  setCaptureTool: (tool: ScreenshotTool) => ipcRenderer.invoke(ipcChannels.setCaptureTool, tool),
  setCaptureStyle: (style: ScreenshotStyle) =>
    ipcRenderer.invoke(ipcChannels.setCaptureStyle, style),
  syncCaptureMarks: (marks: ScreenshotMark[]) =>
    ipcRenderer.invoke(ipcChannels.syncCaptureMarks, marks),
  clearCaptureSelection: () => ipcRenderer.invoke(ipcChannels.clearCaptureSelection),
  copyCaptureImage: (dataUrl: string) => ipcRenderer.invoke(ipcChannels.copyCaptureImage, dataUrl),
  saveCaptureImage: (dataUrl: string, suggestedName: string) =>
    ipcRenderer.invoke(ipcChannels.saveCaptureImage, { dataUrl, suggestedName }),
  listCaptureRecords: () => ipcRenderer.invoke(ipcChannels.listCaptureRecords),
  saveCaptureRecord: (capture: SavedCapture) =>
    ipcRenderer.invoke(ipcChannels.saveCaptureRecord, capture),
  deleteCaptureRecord: (id: string) => ipcRenderer.invoke(ipcChannels.deleteCaptureRecord, id),
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
  submitReport: (report: CreateReport) => ipcRenderer.invoke(ipcChannels.submitReport, report),
  onBrowserState: (listener: (payload: unknown) => void) =>
    subscribe(ipcChannels.browserState, listener),
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
});
