import type { InlineNote, InlineNoteAction } from '../../inline-note';
import type { AgentRepository } from '@markfix/contracts';
import type { DesktopUpdateStatus } from '../../desktop-update';
import type { AccountPage } from '../../account-pages';
import type {
  AnnotationHistorySummary,
  AnnotationSubmission,
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
  Report,
  ScreenshotMark,
  ScreenshotStyle,
  ScreenshotTool,
  SavedCapture,
  SavedDiagnosticAnnotation,
  SavedElementComment,
  WebsiteProject,
} from '@markfix/contracts';

declare global {
  interface Window {
    markfix: {
      startUpdate(): Promise<DesktopUpdateStatus>;
      updateStatus(): Promise<DesktopUpdateStatus>;
      onUpdateStatus(listener: (status: DesktopUpdateStatus) => void): () => void;
      openAccountPage(page: AccountPage): Promise<void>;
      enterLocalMode(): Promise<void>;
      authStatus(): Promise<{
        authenticated: boolean;
        user?: { id: string; email: string; displayName: string };
        policy?: ClientPolicy;
      }>;
      register(
        displayName: string,
        email: string,
        password: string,
      ): Promise<
        | { authenticated: true; user: { id: string; email: string; displayName: string } }
        | { authenticated: false; verificationRequired: true; email: string }
      >;
      login(
        email: string,
        password: string,
      ): Promise<{ id: string; email: string; displayName: string }>;
      changePassword(currentPassword: string, newPassword: string): Promise<{ changed: boolean }>;
      logout(): Promise<boolean>;
      desktopBootstrap(): Promise<{
        websiteProjects: WebsiteProject[];
      }>;
      listEnvironments(projectId: string): Promise<Environment[]>;
      getProjectAgentData(projectId: string): Promise<{
        binding: { repositoryId: string | null; repositoryName: string | null };
        repositories: AgentRepository[];
        canManage: boolean;
      }>;
      setProjectRepository(
        projectId: string,
        binding: { repositoryId: string | null; repositoryName: string | null },
      ): Promise<unknown>;
      listWebsiteProjects(): Promise<WebsiteProject[]>;
      listProjectAnnotationReports(projectId: string, pageUrl: string): Promise<Report[]>;
      createWebsiteProject(
        storageMode: 'LOCAL' | 'CLOUD',
        url: string,
      ): Promise<{ project: WebsiteProject; created: boolean }>;
      switchWebsiteProject(projectId: string): Promise<WebsiteProject>;
      deleteWebsiteProject(projectId: string): Promise<{ deleted: boolean }>;
      confirmDiscardDraft(reason: 'switch-project' | 'new-annotation'): Promise<boolean>;
      setWorkspaceLayout(
        sidebarWidth: number,
        visible: boolean,
        peekWidth: number,
        panelWidth: number,
      ): Promise<void>;
      openMoreMenu(x: number, y: number): Promise<void>;
      openSettings(): Promise<void>;
      openOfficialWebsite(): Promise<void>;
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
      setCaptureTool(tool: ScreenshotTool): Promise<void>;
      setCaptureStyle(style: ScreenshotStyle): Promise<void>;
      syncCaptureMarks(marks: ScreenshotMark[]): Promise<void>;
      clearCaptureSelection(): Promise<void>;
      restoreCaptureSelection(selection: RegionAnchor, marks: ScreenshotMark[]): Promise<void>;
      copyCaptureImage(dataUrl: string, note: string): Promise<void>;
      saveCaptureImage(
        dataUrl: string,
        suggestedName: string,
      ): Promise<{ canceled: boolean; filePath?: string }>;
      listCaptureRecords(projectId?: string): Promise<SavedCapture[]>;
      listAnnotationHistorySummaries(): Promise<AnnotationHistorySummary[]>;
      saveCaptureRecord(capture: SavedCapture): Promise<void>;
      deleteCaptureRecord(id: string): Promise<void>;
      listElementComments(projectId?: string): Promise<SavedElementComment[]>;
      saveElementComment(comment: SavedElementComment): Promise<void>;
      deleteElementComment(id: string): Promise<void>;
      syncElementComments(comments: SavedElementComment[]): Promise<void>;
      listDiagnosticAnnotations(projectId?: string): Promise<SavedDiagnosticAnnotation[]>;
      saveDiagnosticAnnotation(annotation: SavedDiagnosticAnnotation): Promise<void>;
      deleteDiagnosticAnnotation(id: string): Promise<void>;
      saveAnnotationSubmission(submission: AnnotationSubmission): Promise<void>;
      openAnnotationReview(projectId: string): Promise<void>;
      closeAnnotationReview(): Promise<void>;
      openAnnotationHistory(): Promise<void>;
      openProjectAnnotationHistory(projectId: string): Promise<void>;
      selectHistoricalAnnotation(reference: HistoryAnnotationReference): Promise<void>;
      openCapturePreview(projectId: string, captureId: string): Promise<void>;
      loadCapturePreview(projectId: string, captureId: string): Promise<SavedCapture>;
      syncAnchor(anchor: Anchor | null): Promise<void>;
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
      loadSyncStatus(outboxId: string): Promise<{ status: string; reportId?: string } | undefined>;
      submitReport(report: CreateReport, idempotencyKey?: string): Promise<unknown>;
      onBrowserState(listener: (payload: unknown) => void): () => void;
      onDiagnostic(listener: (payload: DiagnosticEvidence) => void): () => void;
      onModeShortcut(listener: (payload: unknown) => void): () => void;
      onSelection(listener: (payload: unknown) => void): () => void;
      onCaptureSelection(listener: (payload: unknown) => void): () => void;
      onCaptureMarksChanged(listener: (payload: unknown) => void): () => void;
      syncInlineNote(payload: InlineNote | null): Promise<void>;
      onInlineNoteAction(listener: (payload: InlineNoteAction) => void): () => void;
      onCaptureAction(listener: (payload: unknown) => void): () => void;
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
