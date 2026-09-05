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
  DiagnosticEvidence,
  Environment,
  HistoryAnnotationReference,
  RegionAnchor,
  ScreenshotMark,
  ScreenshotStyle,
  ScreenshotTool,
  SavedCapture,
  SavedDiagnosticAnnotation,
  SavedElementComment,
  WorkspaceSummary,
  WebsiteProject,
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
      logout(): Promise<boolean>;
      listWorkspaces(): Promise<WorkspaceSummary[]>;
      listEnvironments(projectId: string): Promise<Environment[]>;
      listWebsiteProjects(): Promise<WebsiteProject[]>;
      createWebsiteProject(
        workspaceId: string,
        url: string,
      ): Promise<{ project: WebsiteProject; created: boolean }>;
      switchWebsiteProject(projectId: string): Promise<WebsiteProject>;
      deleteWebsiteProject(projectId: string): Promise<{ deleted: boolean }>;
      confirmDiscardDraft(reason: 'switch-project' | 'new-annotation'): Promise<boolean>;
      setWorkspaceLayout(sidebarWidth: 0 | 228, visible: boolean): Promise<void>;
      openMoreMenu(x: number, y: number): Promise<void>;
      openSettings(): Promise<void>;
      submitProjectAnnotations(projectId: string): Promise<{
        elementCommentIds: string[];
        captureIds: string[];
        diagnosticAnnotationIds: string[];
        submittedAt: string;
      }>;
      navigate(url: string): Promise<string>;
      back(): Promise<void>;
      forward(): Promise<void>;
      reload(): Promise<void>;
      setDiagnosticsOpen(open: boolean): Promise<void>;
      listDiagnostics(): Promise<DiagnosticEvidence[]>;
      clearDiagnostics(scope?: 'all' | 'console' | 'network'): Promise<void>;
      evaluateJavaScript(input: string): Promise<DiagnosticEvidence>;
      runCurl(input: string): Promise<DiagnosticEvidence>;
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
      listDiagnosticAnnotations(): Promise<SavedDiagnosticAnnotation[]>;
      saveDiagnosticAnnotation(annotation: SavedDiagnosticAnnotation): Promise<void>;
      deleteDiagnosticAnnotation(id: string): Promise<void>;
      saveAnnotationSubmission(submission: AnnotationSubmission): Promise<void>;
      openAnnotationReview(projectId: string): Promise<void>;
      closeAnnotationReview(): Promise<void>;
      openAnnotationHistory(): Promise<void>;
      openProjectAnnotationHistory(projectId: string): Promise<void>;
      selectHistoricalAnnotation(reference: HistoryAnnotationReference): Promise<void>;
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
      onDiagnostic(listener: (payload: DiagnosticEvidence) => void): () => void;
      onModeShortcut(listener: (payload: unknown) => void): () => void;
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
      onHistoricalAnnotationSelected(
        listener: (payload: HistoryAnnotationReference) => void,
      ): () => void;
    };
  }
}

export {};
