import { contextBridge, ipcRenderer } from 'electron';
import {
  ipcChannels,
  type Annotation,
  type AnnotationTool,
  type BrowserMode,
  type CreateReport,
} from '@markfix/contracts';

const subscribe = (channel: string, listener: (payload: unknown) => void): (() => void) => {
  const handler = (_event: Electron.IpcRendererEvent, payload: unknown) => listener(payload);
  ipcRenderer.on(channel, handler);
  return () => ipcRenderer.removeListener(channel, handler);
};

contextBridge.exposeInMainWorld('markfix', {
  navigate: (url: string) => ipcRenderer.invoke(ipcChannels.navigate, { url }),
  back: () => ipcRenderer.invoke(ipcChannels.goBack),
  forward: () => ipcRenderer.invoke(ipcChannels.goForward),
  reload: () => ipcRenderer.invoke(ipcChannels.reload),
  setMode: (mode: BrowserMode) => ipcRenderer.invoke(ipcChannels.setMode, mode),
  setAnnotationTool: (tool: AnnotationTool) =>
    ipcRenderer.invoke(ipcChannels.setAnnotationTool, tool),
  syncAnnotations: (annotations: Annotation[]) =>
    ipcRenderer.invoke(ipcChannels.syncAnnotations, annotations),
  capture: () => ipcRenderer.invoke(ipcChannels.capture),
  saveDraft: (draft: unknown) => ipcRenderer.invoke(ipcChannels.saveDraft, draft),
  loadDraft: () => ipcRenderer.invoke(ipcChannels.loadDraft),
  submitReport: (report: CreateReport) => ipcRenderer.invoke(ipcChannels.submitReport, report),
  onBrowserState: (listener: (payload: unknown) => void) =>
    subscribe(ipcChannels.browserState, listener),
  onSelection: (listener: (payload: unknown) => void) => subscribe(ipcChannels.selection, listener),
  onRegion: (listener: (payload: unknown) => void) => subscribe(ipcChannels.region, listener),
  onRecorderEvent: (listener: (payload: unknown) => void) =>
    subscribe(ipcChannels.recorderEvent, listener),
  onAnnotationCreated: (listener: (payload: unknown) => void) =>
    subscribe(ipcChannels.annotationCreated, listener),
});
