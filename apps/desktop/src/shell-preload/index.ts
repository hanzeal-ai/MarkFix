import { contextBridge, ipcRenderer } from 'electron';
import {
  ipcChannels,
  type Annotation,
  type AnnotationTool,
  type Anchor,
  type BrowserMode,
  type CaptureRequest,
  type CreateReport,
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
  navigate: (url: string) => ipcRenderer.invoke(ipcChannels.navigate, { url }),
  back: () => ipcRenderer.invoke(ipcChannels.goBack),
  forward: () => ipcRenderer.invoke(ipcChannels.goForward),
  reload: () => ipcRenderer.invoke(ipcChannels.reload),
  setMode: (mode: BrowserMode) => ipcRenderer.invoke(ipcChannels.setMode, mode),
  setAnnotationTool: (tool: AnnotationTool) =>
    ipcRenderer.invoke(ipcChannels.setAnnotationTool, tool),
  setRecording: (enabled: boolean) => ipcRenderer.invoke(ipcChannels.setRecording, enabled),
  syncAnnotations: (annotations: Annotation[]) =>
    ipcRenderer.invoke(ipcChannels.syncAnnotations, annotations),
  syncAnchor: (anchor: Anchor | null) => ipcRenderer.invoke(ipcChannels.syncAnchor, anchor),
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
  onRecorderEvent: (listener: (payload: unknown) => void) =>
    subscribe(ipcChannels.recorderEvent, listener),
  onAnnotationCreated: (listener: (payload: unknown) => void) =>
    subscribe(ipcChannels.annotationCreated, listener),
  onAnchorRecovery: (listener: (payload: unknown) => void) =>
    subscribe(ipcChannels.anchorRecovery, listener),
  onSyncStatus: (listener: (payload: unknown) => void) =>
    subscribe(ipcChannels.syncStatus, listener),
});
