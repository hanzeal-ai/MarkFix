import type {
  Annotation,
  AnnotationSubmission,
  AnnotationTool,
  Anchor,
  BrowserMode,
  CaptureContext,
  CaptureRequest,
  ClientPolicy,
  CreateReport,
  Environment,
  RegionAnchor,
  ScreenshotMark,
  ScreenshotStyle,
  ScreenshotTool,
  SavedCapture,
  SavedElementComment,
  WorkspaceSummary,
} from '@markfix/contracts';

declare global {
  interface Window {
    markfix: {
      authStatus(): Promise<{
        authenticated: boolean;
        user?: { id: string; email: string; displayName: string };
        policy?: ClientPolicy;
      }>;
      login(
        email: string,
        password: string,
      ): Promise<{ id: string; email: string; displayName: string }>;
      logout(): Promise<void>;
      listWorkspaces(): Promise<WorkspaceSummary[]>;
      listEnvironments(projectId: string): Promise<Environment[]>;
      navigate(url: string): Promise<string>;
      back(): Promise<void>;
      forward(): Promise<void>;
      reload(): Promise<void>;
      setMode(mode: BrowserMode): Promise<void>;
      setAnnotationTool(tool: AnnotationTool): Promise<void>;
      setCaptureTool(tool: ScreenshotTool): Promise<void>;
      setCaptureStyle(style: ScreenshotStyle): Promise<void>;
      syncCaptureMarks(marks: ScreenshotMark[]): Promise<void>;
      clearCaptureSelection(): Promise<void>;
      restoreCaptureSelection(selection: RegionAnchor, marks: ScreenshotMark[]): Promise<void>;
      copyCaptureImage(dataUrl: string): Promise<void>;
      saveCaptureImage(
        dataUrl: string,
        suggestedName: string,
      ): Promise<{ canceled: boolean; filePath?: string }>;
      listCaptureRecords(): Promise<SavedCapture[]>;
      saveCaptureRecord(capture: SavedCapture): Promise<void>;
      deleteCaptureRecord(id: string): Promise<void>;
      listElementComments(): Promise<SavedElementComment[]>;
      saveElementComment(comment: SavedElementComment): Promise<void>;
      deleteElementComment(id: string): Promise<void>;
      syncElementComments(comments: SavedElementComment[]): Promise<void>;
      saveAnnotationSubmission(submission: AnnotationSubmission): Promise<void>;
      openAnnotationReview(): Promise<void>;
      closeAnnotationReview(): Promise<void>;
      openCapturePreview(captureId: string): Promise<void>;
      loadCapturePreview(captureId: string): Promise<SavedCapture>;
      setRecording(enabled: boolean): Promise<void>;
      syncAnnotations(annotations: Annotation[]): Promise<void>;
      syncAnchor(anchor: Anchor | null): Promise<void>;
      focusAnnotation(annotationId: string): Promise<void>;
      capture(request: CaptureRequest): Promise<
        CaptureContext & {
          dataUrl: string;
          pageUrl: string;
          pageTitle: string;
          viewportWidthCssPx: number;
          viewportHeightCssPx: number;
          deviceScaleFactor: number;
        }
      >;
      saveDraft(draft: unknown): Promise<void>;
      loadDraft(): Promise<unknown>;
      clearDraft(): Promise<void>;
      loadSyncStatus(outboxId: string): Promise<{ status: string; reportId?: string } | undefined>;
      submitReport(report: CreateReport): Promise<unknown>;
      onBrowserState(listener: (payload: unknown) => void): () => void;
      onSelection(listener: (payload: unknown) => void): () => void;
      onRegion(listener: (payload: unknown) => void): () => void;
      onCaptureSelection(listener: (payload: unknown) => void): () => void;
      onCaptureMarksChanged(listener: (payload: unknown) => void): () => void;
      onCaptureAction(listener: (payload: unknown) => void): () => void;
      onRecorderEvent(listener: (payload: unknown) => void): () => void;
      onAnnotationCreated(listener: (payload: unknown) => void): () => void;
      onAnnotationSelected(listener: (payload: unknown) => void): () => void;
      onAnchorRecovery(listener: (payload: unknown) => void): () => void;
      onSyncStatus(listener: (payload: unknown) => void): () => void;
      onAnnotationSubmissionSaved(listener: (payload: unknown) => void): () => void;
    };
  }
}

export {};
