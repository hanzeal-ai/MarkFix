import type { Annotation, AnnotationTool, BrowserMode, CreateReport } from '@markfix/contracts';

declare global {
  interface Window {
    markfix: {
      navigate(url: string): Promise<string>;
      back(): Promise<void>;
      forward(): Promise<void>;
      reload(): Promise<void>;
      setMode(mode: BrowserMode): Promise<void>;
      setAnnotationTool(tool: AnnotationTool): Promise<void>;
      setRecording(enabled: boolean): Promise<void>;
      syncAnnotations(annotations: Annotation[]): Promise<void>;
      capture(): Promise<{
        dataUrl: string;
        width: number;
        height: number;
        deviceScaleFactor: number;
        url: string;
        title: string;
      }>;
      saveDraft(draft: unknown): Promise<void>;
      loadDraft(): Promise<unknown>;
      clearDraft(): Promise<void>;
      loadSyncStatus(outboxId: string): Promise<{ status: string; reportId?: string } | undefined>;
      submitReport(report: CreateReport): Promise<unknown>;
      onBrowserState(listener: (payload: unknown) => void): () => void;
      onSelection(listener: (payload: unknown) => void): () => void;
      onRegion(listener: (payload: unknown) => void): () => void;
      onRecorderEvent(listener: (payload: unknown) => void): () => void;
      onAnnotationCreated(listener: (payload: unknown) => void): () => void;
      onSyncStatus(listener: (payload: unknown) => void): () => void;
    };
  }
}

export {};
