import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  AlertCircle,
  ArrowLeft,
  ArrowRight,
  Camera,
  Check,
  ChevronDown,
  ChevronUp,
  Copy,
  Crosshair,
  Download,
  LoaderCircle,
  MessageSquareText,
  MoreHorizontal,
  MousePointer2,
  MoveUpRight,
  Paperclip,
  PenLine,
  Redo2,
  RefreshCw,
  Send,
  Sparkles,
  Square,
  Terminal,
  Trash2,
  Type,
  Undo2,
  X,
} from '@markfix/ui/icons';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  Button,
  Card,
  Input,
  Label,
  NativeSelect,
  Textarea,
  ToggleGroup,
  ToggleGroupItem,
  toast,
} from '@markfix/ui';
import {
  anchorSchema,
  annotationSchema,
  desktopDraftSchema,
  diagnosticEvidenceSchema,
  historyAnnotationReferenceSchema,
  recorderEventSchema,
  reportSchema,
  screenshotMarkSchema,
  type Anchor,
  type Annotation,
  type AnnotationTool,
  type BrowserMode,
  type ClientPolicy,
  type CaptureContext,
  type DiagnosticEvidence,
  type DesktopDraft,
  type Environment,
  type HistoryAnnotationReference,
  type ReproductionStep,
  type Report,
  type SavedCapture,
  type SavedDiagnosticAnnotation,
  type SavedElementComment,
  type ScreenshotMark,
  type WebsiteProject,
  type WorkspaceSummary,
} from '@markfix/contracts';
import { describeTrustedEvent, mergeAdjacentInputSteps } from '@markfix/reproduction-model';
import { composeScreenshot } from '../screenshot-compositor';
import { selectProjectPageRecords } from '../page-records';
import { projectReportOverlays } from '../project-report-overlays';
import { DiagnosticsPanel } from '../DiagnosticsPanel';
import { EvidenceReferences } from './EvidenceReferences';
import {
  annotationName,
  elementAnchorsEqual,
  type BrowserState,
  type CaptureSelection,
  type CaptureSource,
  type DesktopUser,
} from './model';
import {
  HeaderNavigationControls,
  NewProjectPage,
  ProjectSidebar,
  projectAnnotations,
  type ProjectAnnotation,
} from '../ProjectNavigation';

export function AnnotationWorkspace({
  policy,
  user,
  onLoggedOut,
}: {
  policy: ClientPolicy | undefined;
  user: DesktopUser;
  onLoggedOut: () => Promise<void>;
}) {
  const [url, setUrl] = useState('');
  const [browserState, setBrowserState] = useState<BrowserState>({ loading: false });
  const [pageSessionId, setPageSessionId] = useState<string>();
  const [pageTitle, setPageTitle] = useState('');
  const [websiteProjects, setWebsiteProjects] = useState<WebsiteProject[]>([]);
  const [projectReports, setProjectReports] = useState<Report[]>([]);
  const [activeView, setActiveView] = useState<'workspace' | 'new'>('new');
  const [sidebarExpanded, setSidebarExpanded] = useState(
    () => window.localStorage.getItem('markfix:sidebar-expanded') !== 'false',
  );
  const [newProjectInput, setNewProjectInput] = useState('');
  const [newProjectError, setNewProjectError] = useState<string>();
  const [creatingProject, setCreatingProject] = useState(false);
  const [mode, setModeState] = useState<BrowserMode>('browse');
  const [anchor, setAnchor] = useState<Anchor>();
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [annotations, setAnnotations] = useState<Annotation[]>([]);
  const [redoStack, setRedoStack] = useState<Annotation[]>([]);
  const [activeTool, setActiveTool] = useState<AnnotationTool>('pin');
  const [selectedAnnotationId, setSelectedAnnotationId] = useState<string>();
  const [reproduction, setReproduction] = useState<ReproductionStep[]>([]);
  const [screenshot, setScreenshot] = useState<string>();
  const [captureSelection, setCaptureSelection] = useState<CaptureSelection>();
  const [captureSource, setCaptureSource] = useState<CaptureSource>();
  const [captureMarks, setCaptureMarks] = useState<ScreenshotMark[]>([]);
  const [captureLoading, setCaptureLoading] = useState(false);
  const [captureRendering, setCaptureRendering] = useState(false);
  const [captureNote, setCaptureNote] = useState('');
  const [captureEvidence, setCaptureEvidence] = useState<DiagnosticEvidence[]>([]);
  const [savedCaptures, setSavedCaptures] = useState<SavedCapture[]>([]);
  const [editingCaptureId, setEditingCaptureId] = useState<string>();
  const [elementComments, setElementComments] = useState<SavedElementComment[]>([]);
  const [diagnosticAnnotations, setDiagnosticAnnotations] = useState<SavedDiagnosticAnnotation[]>(
    [],
  );
  const [elementCommentNote, setElementCommentNote] = useState('');
  const [elementEvidence, setElementEvidence] = useState<DiagnosticEvidence[]>([]);
  const [editingElementCommentId, setEditingElementCommentId] = useState<string>();
  const [diagnosticsOpen, setDiagnosticsOpenState] = useState(false);
  const [diagnosticEntries, setDiagnosticEntries] = useState<DiagnosticEvidence[]>([]);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const setNotice = useCallback((message: string | undefined): void => {
    if (message) toast(message);
  }, []);
  const mergeProjectReport = useCallback((report: Report): void => {
    setProjectReports((current) => [report, ...current.filter(({ id }) => id !== report.id)]);
  }, []);
  const [pendingHistoricalAnnotation, setPendingHistoricalAnnotation] =
    useState<ProjectAnnotation>();
  const [pendingOutboxId, setPendingOutboxId] = useState<string>();
  const [workspaces, setWorkspaces] = useState<WorkspaceSummary[]>([]);
  const [environments, setEnvironments] = useState<Environment[]>([]);
  const [selectedWorkspaceId, setSelectedWorkspaceId] = useState<string>();
  const [selectedProjectId, setSelectedProjectId] = useState<string>();
  const [switchingProjectId, setSwitchingProjectId] = useState<string>();
  const [selectedEnvironmentId, setSelectedEnvironmentId] = useState<string>();
  const [contextLoading, setContextLoading] = useState(true);
  const pendingOutboxIdRef = useRef<string | undefined>(undefined);
  const selectedProjectIdRef = useRef<string | undefined>(undefined);
  const projectSwitchRequestRef = useRef(0);
  const projectReportRequestRef = useRef(0);
  const addressInputRef = useRef<HTMLInputElement>(null);
  const modeRef = useRef<BrowserMode>('browse');
  const diagnosticsOpenRef = useRef(false);
  const captureRequestIdRef = useRef<string | undefined>(undefined);
  const captureRestoreRef = useRef<
    | {
        capture: SavedCapture;
        selection: CaptureSelection;
        marks: ScreenshotMark[];
      }
    | undefined
  >(undefined);
  const screenshotRef = useRef<string | undefined>(undefined);
  const elementCommentsRef = useRef<SavedElementComment[]>([]);
  const savedCapturesRef = useRef<SavedCapture[]>([]);
  const diagnosticAnnotationsRef = useRef<SavedDiagnosticAnnotation[]>([]);
  const editHistoricalAnnotationRef = useRef<(annotation: ProjectAnnotation) => Promise<void>>(
    async () => undefined,
  );
  modeRef.current = mode;
  diagnosticsOpenRef.current = diagnosticsOpen;
  screenshotRef.current = screenshot;
  elementCommentsRef.current = elementComments;
  savedCapturesRef.current = savedCaptures;
  diagnosticAnnotationsRef.current = diagnosticAnnotations;
  selectedProjectIdRef.current = selectedProjectId;
  useEffect(() => {
    if (policy?.status === 'upgrade-recommended') {
      setNotice(`MarkFix ${policy.recommendedVersion} is available. Update when convenient.`);
    }
  }, [policy, setNotice]);
  const setDiagnosticsVisibility = useCallback(async (open: boolean): Promise<void> => {
    try {
      await window.markfix.setDiagnosticsOpen(open);
      diagnosticsOpenRef.current = open;
      setDiagnosticsOpenState(open);
    } catch (error) {
      setNotice(error instanceof Error ? error.message : '无法切换网站控制台。');
    }
  }, []);
  const selectedWorkspace = useMemo(
    () => workspaces.find(({ id }) => id === selectedWorkspaceId),
    [selectedWorkspaceId, workspaces],
  );
  const selectedProject = useMemo(
    () => selectedWorkspace?.projects.find(({ id }) => id === selectedProjectId),
    [selectedProjectId, selectedWorkspace],
  );
  const selectedWebsiteProject = useMemo(
    () => websiteProjects.find(({ id }) => id === selectedProjectId),
    [selectedProjectId, websiteProjects],
  );
  const selectedEnvironment = useMemo(
    () => environments.find(({ id }) => id === selectedEnvironmentId),
    [environments, selectedEnvironmentId],
  );
  const pageCaptures = useMemo(
    () => selectProjectPageRecords(savedCaptures, selectedProjectId, pageSessionId),
    [pageSessionId, savedCaptures, selectedProjectId],
  );
  const pageElementComments = useMemo(
    () => selectProjectPageRecords(elementComments, selectedProjectId, pageSessionId),
    [elementComments, pageSessionId, selectedProjectId],
  );
  const pageDiagnosticAnnotations = useMemo(
    () => selectProjectPageRecords(diagnosticAnnotations, selectedProjectId, pageSessionId),
    [diagnosticAnnotations, pageSessionId, selectedProjectId],
  );
  const currentProjectAnnotations = useMemo(
    () =>
      selectedProjectId
        ? projectAnnotations(
            selectedProjectId,
            elementComments,
            savedCaptures,
            diagnosticAnnotations,
          )
        : [],
    [diagnosticAnnotations, elementComments, savedCaptures, selectedProjectId],
  );
  const serverOverlays = useMemo(
    () => projectReportOverlays(projectReports, selectedProjectId, pageSessionId, url),
    [pageSessionId, projectReports, selectedProjectId, url],
  );
  const renderedAnnotations = useMemo(
    () => [
      ...new Map(
        [...serverOverlays.annotations, ...annotations].map((annotation) => [
          annotation.id,
          annotation,
        ]),
      ).values(),
    ],
    [annotations, serverOverlays.annotations],
  );
  const renderedElementComments = useMemo(
    () => [
      ...new Map(
        [...serverOverlays.elementComments, ...pageElementComments].map((comment) => [
          comment.id,
          comment,
        ]),
      ).values(),
    ],
    [pageElementComments, serverOverlays.elementComments],
  );
  const unsubmittedCount = useMemo(
    () => currentProjectAnnotations.filter(({ record }) => record.status === 'draft').length,
    [currentProjectAnnotations],
  );

  const clearReport = useCallback((outboxId?: string): boolean => {
    if (outboxId && pendingOutboxIdRef.current !== outboxId) return false;
    pendingOutboxIdRef.current = undefined;
    setPendingOutboxId(undefined);
    setTitle('');
    setDescription('');
    setAnchor(undefined);
    setAnnotations([]);
    setSelectedAnnotationId(undefined);
    setRedoStack([]);
    setScreenshot(undefined);
    setReproduction([]);
    void window.markfix.clearDraft();
    return true;
  }, []);

  useEffect(() => {
    const cleanups = [
      window.markfix.onBrowserState((payload) => {
        const state = payload as BrowserState;
        setBrowserState((current) => ({ ...current, ...state }));
        if (state.url) setUrl(state.url);
        if (state.pageSessionId) setPageSessionId(state.pageSessionId);
        if (state.pageTitle !== undefined) setPageTitle(state.pageTitle);
        if (state.faviconUrl && selectedProjectIdRef.current) {
          setWebsiteProjects((projects) =>
            projects.map((project) =>
              project.id === selectedProjectIdRef.current
                ? { ...project, faviconUrl: state.faviconUrl ?? null, faviconSource: 'page' }
                : project,
            ),
          );
        }
        if (state.error) setNotice(state.error);
      }),
      window.markfix.onModeShortcut((payload) => {
        if (payload === 'toggle-sidebar') {
          setSidebarExpanded((expanded) => !expanded);
          return;
        }
        if (payload === 'new-annotation') {
          setNewProjectError(undefined);
          setActiveView('new');
          return;
        }
        if (payload === 'diagnostics') {
          void setDiagnosticsVisibility(!diagnosticsOpenRef.current);
          return;
        }
        if (payload !== 'capture' && payload !== 'comment') return;
        const destination = modeRef.current === payload ? 'browse' : payload;
        if (destination === 'comment') {
          setAnchor(undefined);
          setElementCommentNote('');
          setElementEvidence([]);
          setEditingElementCommentId(undefined);
        } else if (destination === 'capture') {
          captureRequestIdRef.current = undefined;
          captureRestoreRef.current = undefined;
          setCaptureSelection(undefined);
          setCaptureSource(undefined);
          setCaptureMarks([]);
          setCaptureNote('');
          setCaptureEvidence([]);
          setEditingCaptureId(undefined);
          setScreenshot(undefined);
          void window.markfix.setCaptureTool('select');
        }
        modeRef.current = destination;
        setModeState(destination);
        setNotice(
          destination === 'capture'
            ? 'Drag over the area you want to capture.'
            : destination === 'comment'
              ? 'Hover and click an element on the page.'
              : undefined,
        );
        void window.markfix.setMode(destination);
      }),
      window.markfix.onSelection((payload) => {
        const parsed = anchorSchema.safeParse(payload);
        if (!parsed.success || parsed.data.kind !== 'element') return;
        const nextAnchor = parsed.data;
        const existing = elementCommentsRef.current.find(
          ({ projectId, anchor: savedAnchor }) =>
            projectId === selectedProjectIdRef.current &&
            elementAnchorsEqual(savedAnchor, nextAnchor),
        );
        setAnchor(nextAnchor);
        setEditingElementCommentId(existing?.id);
        setElementCommentNote(existing?.note ?? '');
        setElementEvidence(existing?.evidence ?? []);
        setNotice(existing ? '已加载这个元素的批注。' : '已选择元素，请填写批注。');
        window.requestAnimationFrame(() => {
          document.querySelector<HTMLTextAreaElement>('[data-element-comment-note]')?.focus();
        });
      }),
      window.markfix.onRegion((payload) => {
        const parsed = anchorSchema.safeParse(payload);
        if (parsed.success) {
          setAnchor(parsed.data);
          setModeState('browse');
          setNotice('Region selected. Add your comment.');
        }
      }),
      window.markfix.onCaptureSelection((payload) => {
        if (payload === null) {
          captureRequestIdRef.current = undefined;
          captureRestoreRef.current = undefined;
          setCaptureSelection(undefined);
          setCaptureSource(undefined);
          setScreenshot(undefined);
          setCaptureEvidence([]);
          return;
        }
        const parsed = anchorSchema.safeParse(payload);
        if (!parsed.success || parsed.data.kind !== 'region') return;
        const restore = captureRestoreRef.current;
        if (restore) {
          captureRestoreRef.current = undefined;
          setCaptureSelection(parsed.data);
          setCaptureMarks(restore.marks);
          setCaptureNote(restore.capture.note);
          setCaptureEvidence(restore.capture.evidence ?? []);
          setCaptureSource({
            dataUrl: restore.capture.sourceDataUrl,
            captureScale: restore.capture.captureScale,
          });
          setScreenshot(restore.capture.dataUrl);
          setCaptureLoading(false);
          return;
        }
        setCaptureSelection(parsed.data);
        setCaptureEvidence([]);
        setCaptureLoading(true);
        setCaptureSource(undefined);
        setScreenshot(undefined);
        const captureRequestId = crypto.randomUUID();
        captureRequestIdRef.current = captureRequestId;
        void window.markfix
          .capture({ mode: 'region', anchor: parsed.data })
          .then((result) => {
            if (captureRequestIdRef.current !== captureRequestId) return;
            setCaptureSource({ dataUrl: result.dataUrl, captureScale: result.captureScale });
            setScreenshot(result.dataUrl);
            setNotice(result.warning ?? 'Selection captured. Move or resize it to capture again.');
          })
          .catch((error: unknown) => {
            if (captureRequestIdRef.current !== captureRequestId) return;
            setNotice(error instanceof Error ? error.message : 'Could not capture this selection.');
          })
          .finally(() => {
            if (captureRequestIdRef.current === captureRequestId) setCaptureLoading(false);
          });
      }),
      window.markfix.onCaptureMarksChanged((payload) => {
        const parsed = screenshotMarkSchema.array().max(500).safeParse(payload);
        if (!parsed.success) return;
        setCaptureMarks(parsed.data);
      }),
      window.markfix.onCaptureAction((payload) => {
        if (payload === 'finish') {
          document.querySelector<HTMLTextAreaElement>('[data-capture-note]')?.focus();
          setNotice('截图已确认，请填写备注。');
          return;
        }
        const dataUrl = screenshotRef.current;
        if (!dataUrl) return;
        if (payload === 'copy') {
          void window.markfix
            .copyCaptureImage(dataUrl)
            .then(() => setNotice('截图已复制到剪贴板。'));
        }
        if (payload === 'save') {
          void window.markfix
            .saveCaptureImage(dataUrl, `markfix-${new Date().toISOString().slice(0, 19)}`)
            .then((result) => {
              if (!result.canceled) setNotice(`截图已保存到 ${result.filePath ?? '本地文件'}`);
            });
        }
      }),
      window.markfix.onRecorderEvent((payload) => {
        const parsed = recorderEventSchema.safeParse(payload);
        if (!parsed.success) return;
        const event = parsed.data;
        const metadata = {
          ...(event.mouseButton !== undefined ? { mouseButton: event.mouseButton } : {}),
          ...(event.valueLength !== undefined ? { valueLength: event.valueLength } : {}),
          ...(event.inputKind ? { inputKind: event.inputKind } : {}),
          ...(event.selectedCount !== undefined ? { selectedCount: event.selectedCount } : {}),
          ...(event.scrollXCssPx !== undefined ? { scrollXCssPx: event.scrollXCssPx } : {}),
          ...(event.scrollYCssPx !== undefined ? { scrollYCssPx: event.scrollYCssPx } : {}),
          ...(event.url ? { url: event.url } : {}),
        };
        const step: ReproductionStep = {
          id: crypto.randomUUID(),
          type: event.type,
          description: describeTrustedEvent(event),
          timestampMs: event.timestampMs,
          runtimeId: event.runtimeId,
          pageRevision: event.pageRevision,
          ...(event.anchor ? { anchor: event.anchor } : {}),
          ...(event.endAnchor ? { endAnchor: event.endAnchor } : {}),
          ...(Object.keys(metadata).length > 0 ? { metadata } : {}),
        };
        setReproduction((steps) => mergeAdjacentInputSteps([...steps, step]).slice(-100));
      }),
      window.markfix.onAnnotationCreated((payload) => {
        const parsed = annotationSchema.safeParse(payload);
        if (!parsed.success) return;
        setAnnotations((current) =>
          current.some(({ id }) => id === parsed.data.id) ? current : [...current, parsed.data],
        );
        setRedoStack([]);
        setSelectedAnnotationId(parsed.data.id);
        setModeState('browse');
        setNotice(`${parsed.data.type} annotation added.`);
      }),
      window.markfix.onAnnotationSelected((payload) => {
        if (typeof payload !== 'string') return;
        setSelectedAnnotationId(payload);
        setNotice('Annotation selected on the page.');
      }),
      window.markfix.onAnchorRecovery((payload) => {
        const recovery = payload as {
          status?: unknown;
          anchor?: unknown;
          confidence?: unknown;
          score?: unknown;
        };
        if (recovery.status === 'lost') {
          setNotice('The selected element moved or disappeared. Select it again or use a region.');
          return;
        }
        const parsed = anchorSchema.safeParse(recovery.anchor);
        if (!parsed.success || parsed.data.kind !== 'element') return;
        setAnchor(parsed.data);
        setNotice(
          `Element restored with ${String(recovery.confidence)} confidence (${Math.round(Number(recovery.score) * 100)}%).`,
        );
      }),
      window.markfix.onSyncStatus((payload) => {
        const status = payload as {
          status?: unknown;
          outboxId?: unknown;
          message?: unknown;
          report?: unknown;
        };
        const report = reportSchema.safeParse(status.report);
        if (report.success && report.data.projectId === selectedProjectIdRef.current)
          mergeProjectReport(report.data);
        if (status.status === 'pending' && status.outboxId === pendingOutboxIdRef.current) {
          setNotice(`Queued locally — ${String(status.message ?? 'waiting for the API')}`);
        }
        if (status.status !== 'completed' || status.outboxId !== pendingOutboxIdRef.current) return;
        if (clearReport(String(status.outboxId)))
          setNotice('Queued report synchronized successfully.');
      }),
      window.markfix.onAnnotationSubmissionSaved((payload) => {
        const counts = payload as {
          elementCommentCount?: unknown;
          captureCount?: unknown;
          diagnosticAnnotationCount?: unknown;
          elementCommentIds?: unknown;
          captureIds?: unknown;
          diagnosticAnnotationIds?: unknown;
          submittedAt?: unknown;
        };
        const elementCommentIds = Array.isArray(counts.elementCommentIds)
          ? counts.elementCommentIds.filter((id): id is string => typeof id === 'string')
          : [];
        const captureIds = Array.isArray(counts.captureIds)
          ? counts.captureIds.filter((id): id is string => typeof id === 'string')
          : [];
        const diagnosticAnnotationIds = Array.isArray(counts.diagnosticAnnotationIds)
          ? counts.diagnosticAnnotationIds.filter((id): id is string => typeof id === 'string')
          : [];
        if (typeof counts.submittedAt !== 'string') return;
        const submittedAt = counts.submittedAt;
        setElementComments((comments) =>
          comments.map((comment) =>
            elementCommentIds.includes(comment.id)
              ? { ...comment, status: 'submitted', submittedAt }
              : comment,
          ),
        );
        setSavedCaptures((captures) =>
          captures.map((capture) =>
            captureIds.includes(capture.id)
              ? { ...capture, status: 'submitted', submittedAt }
              : capture,
          ),
        );
        setDiagnosticAnnotations((annotations) =>
          annotations.map((annotation) =>
            diagnosticAnnotationIds.includes(annotation.id)
              ? { ...annotation, status: 'submitted', submittedAt, updatedAt: submittedAt }
              : annotation,
          ),
        );
        captureRequestIdRef.current = undefined;
        captureRestoreRef.current = undefined;
        setAnchor(undefined);
        setElementCommentNote('');
        setElementEvidence([]);
        setEditingElementCommentId(undefined);
        setCaptureSelection(undefined);
        setCaptureSource(undefined);
        setCaptureMarks([]);
        setCaptureNote('');
        setCaptureEvidence([]);
        setEditingCaptureId(undefined);
        setScreenshot(undefined);
        void window.markfix.clearCaptureSelection();
        void window.markfix.setCaptureTool('select');
        setNotice(
          `已提交 ${Number(counts.elementCommentCount ?? 0)} 条元素批注、${Number(counts.captureCount ?? 0)} 张截图和 ${Number(counts.diagnosticAnnotationCount ?? 0)} 条调试标注。`,
        );
      }),
      window.markfix.onHistoricalAnnotationSelected((payload: HistoryAnnotationReference) => {
        const parsed = historyAnnotationReferenceSchema.safeParse(payload);
        if (!parsed.success) return;
        let annotation: ProjectAnnotation | undefined;
        if (parsed.data.type === 'element') {
          const record = elementCommentsRef.current.find(({ id }) => id === parsed.data.id);
          if (record) annotation = { type: 'element', record };
        } else if (parsed.data.type === 'capture') {
          const record = savedCapturesRef.current.find(({ id }) => id === parsed.data.id);
          if (record) annotation = { type: 'capture', record };
        } else {
          const record = diagnosticAnnotationsRef.current.find(({ id }) => id === parsed.data.id);
          if (record) annotation = { type: 'diagnostic', record };
        }
        if (!annotation) {
          setNotice('这条历史标注已不存在，请重新打开历史窗口。');
          return;
        }
        void editHistoricalAnnotationRef.current(annotation);
      }),
      window.markfix.onDiagnostic((payload) => {
        const parsed = diagnosticEvidenceSchema.safeParse(payload);
        if (!parsed.success) return;
        setDiagnosticEntries((entries) =>
          entries.some(({ id }) => id === parsed.data.id)
            ? entries
            : [...entries, parsed.data].slice(-500),
        );
      }),
    ];
    return () => cleanups.forEach((cleanup) => cleanup());
  }, [clearReport, mergeProjectReport, setDiagnosticsVisibility]);

  useEffect(() => {
    let active = true;
    void window.markfix
      .listDiagnostics()
      .then((entries) => {
        if (!active) return;
        const parsed = diagnosticEvidenceSchema.array().safeParse(entries);
        if (!parsed.success) return;
        setDiagnosticEntries((current) => {
          const merged = new Map([...parsed.data, ...current].map((entry) => [entry.id, entry]));
          return [...merged.values()].sort((left, right) =>
            left.timestamp.localeCompare(right.timestamp),
          );
        });
      })
      .catch((error: unknown) => {
        if (active) setNotice(error instanceof Error ? error.message : '无法读取网站控制台记录。');
      });
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    let active = true;
    const requestId = ++projectSwitchRequestRef.current;
    setContextLoading(true);
    void window.markfix
      .desktopBootstrap()
      .then(
        async ({ workspaces: workspaceItems, websiteProjects: projects, draft: draftPayload }) => {
          if (!active) return;
          setWorkspaces(workspaceItems);
          setWebsiteProjects(projects);
          const parsedDraft =
            draftPayload === undefined ? undefined : desktopDraftSchema.safeParse(draftPayload);
          if (parsedDraft && !parsedDraft.success) setNotice('本地草稿不是当前版本，已停止恢复。');
          const draft = parsedDraft?.success ? parsedDraft.data : undefined;
          if (draft) {
            setTitle(draft.title);
            setDescription(draft.description);
            setUrl(draft.url);
            setAnchor(draft.anchor);
            setAnnotations(draft.annotations);
            setReproduction(draft.reproduction);
            setSelectedWorkspaceId(draft.workspaceId);
            setSelectedEnvironmentId(draft.environmentId);
            setPendingOutboxId(draft.pendingOutboxId);
            pendingOutboxIdRef.current = draft.pendingOutboxId;
            if (draft.pendingOutboxId) {
              void window.markfix.loadSyncStatus(draft.pendingOutboxId).then((status) => {
                if (status?.status === 'COMPLETED' && clearReport(draft.pendingOutboxId))
                  setNotice('Queued report synchronized successfully.');
              });
            }
            setNotice('Restored your local draft.');
          }
          const draftProjectId = draft?.projectId;
          const selected =
            projects.find(({ id }) => id === draftProjectId) ??
            projects.find(({ id }) => id === selectedProjectIdRef.current) ??
            projects[0];
          if (!selected) return;
          selectedProjectIdRef.current = selected.id;
          setSelectedProjectId(selected.id);
          setSelectedWorkspaceId(selected.workspaceId);
          setActiveView('workspace');
          setUrl(selected.currentUrl);
          setPageSessionId(selected.currentPageSessionId);
          setBrowserState((current) => ({
            ...current,
            loading: true,
            error: null,
            loadFailure: null,
          }));
          const current = await window.markfix.switchWebsiteProject(selected.id);
          if (!active || requestId !== projectSwitchRequestRef.current) return;
          setUrl(current.currentUrl);
          setPageSessionId(current.currentPageSessionId);
        },
      )
      .catch((error: unknown) => {
        if (active && requestId === projectSwitchRequestRef.current)
          setNewProjectError(error instanceof Error ? error.message : '无法读取项目。');
      })
      .finally(() => {
        if (active) setContextLoading(false);
      });
    return () => {
      active = false;
    };
  }, [clearReport]);

  useEffect(() => {
    const requestId = ++projectReportRequestRef.current;
    setProjectReports([]);
    if (!selectedProjectId) return;
    void window.markfix
      .listProjectAnnotationReports(selectedProjectId)
      .then((reports) => {
        if (
          requestId === projectReportRequestRef.current &&
          selectedProjectIdRef.current === selectedProjectId
        )
          setProjectReports(reports);
      })
      .catch((error: unknown) => {
        if (
          requestId === projectReportRequestRef.current &&
          selectedProjectIdRef.current === selectedProjectId
        )
          setNotice(
            error instanceof Error
              ? `网站已开始加载，但服务端标注加载失败：${error.message}`
              : '网站已开始加载，但服务端标注加载失败。',
          );
      });
  }, [selectedProjectId]);

  useEffect(() => {
    window.localStorage.setItem('markfix:sidebar-expanded', String(sidebarExpanded));
    void window.markfix.setWorkspaceLayout(sidebarExpanded ? 228 : 0, activeView === 'workspace');
  }, [activeView, sidebarExpanded]);

  useEffect(() => {
    let active = true;
    setSavedCaptures([]);
    setElementComments([]);
    setDiagnosticAnnotations([]);
    if (!selectedProjectId) return () => undefined;
    void Promise.all([
      window.markfix.listCaptureRecords(selectedProjectId),
      window.markfix.listElementComments(selectedProjectId),
      window.markfix.listDiagnosticAnnotations(selectedProjectId),
    ])
      .then(([captures, comments, diagnostics]) => {
        if (!active) return;
        setSavedCaptures(captures);
        setElementComments(comments);
        setDiagnosticAnnotations(diagnostics);
      })
      .catch((error: unknown) => {
        if (active) setNotice(error instanceof Error ? error.message : '无法读取本机批注。');
      });
    return () => {
      active = false;
    };
  }, [selectedProjectId]);

  useEffect(() => {
    if (workspaces.length === 0) return;
    if (workspaces.some(({ id }) => id === selectedWorkspaceId)) return;
    setSelectedWorkspaceId(workspaces[0]?.id);
  }, [selectedWorkspaceId, workspaces]);

  useEffect(() => {
    let active = true;
    if (!selectedProjectId || switchingProjectId === selectedProjectId) {
      setEnvironments([]);
      setSelectedEnvironmentId(undefined);
      return () => {
        active = false;
      };
    }
    setContextLoading(true);
    void window.markfix
      .listEnvironments(selectedProjectId)
      .then((items) => {
        if (!active) return;
        setEnvironments(items);
        setSelectedEnvironmentId((current) =>
          items.some(({ id }) => id === current) ? current : items[0]?.id,
        );
      })
      .catch((error: unknown) => {
        if (!active) return;
        setEnvironments([]);
        setSelectedEnvironmentId(undefined);
        setNotice(error instanceof Error ? error.message : 'Could not load environments.');
      })
      .finally(() => {
        if (active) setContextLoading(false);
      });
    return () => {
      active = false;
    };
  }, [selectedProjectId, switchingProjectId]);

  useEffect(() => {
    void window.markfix.syncAnnotations(renderedAnnotations);
    setSelectedAnnotationId((current) =>
      current && renderedAnnotations.some(({ id }) => id === current) ? current : undefined,
    );
  }, [renderedAnnotations]);

  useEffect(() => {
    if (selectedAnnotationId) void window.markfix.focusAnnotation(selectedAnnotationId);
  }, [selectedAnnotationId]);

  useEffect(() => {
    void window.markfix.syncAnchor(mode === 'comment' ? (anchor ?? null) : null);
  }, [anchor, mode]);

  useEffect(() => {
    void window.markfix.syncElementComments(renderedElementComments);
  }, [renderedElementComments]);

  useEffect(() => {
    void window.markfix.syncCaptureMarks(captureMarks);
  }, [captureMarks]);

  useEffect(() => {
    if (!captureSelection || !captureSource) return;
    let active = true;
    setCaptureRendering(true);
    void composeScreenshot(
      captureSource.dataUrl,
      captureMarks,
      captureSelection,
      captureSource.captureScale,
    )
      .then((dataUrl) => {
        if (active) setScreenshot(dataUrl);
      })
      .catch((error: unknown) => {
        if (active)
          setNotice(error instanceof Error ? error.message : 'Could not render screenshot marks.');
      })
      .finally(() => {
        if (active) setCaptureRendering(false);
      });
    return () => {
      active = false;
    };
  }, [captureMarks, captureSelection, captureSource]);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      if (!title && !description && !anchor && annotations.length === 0 && !pendingOutboxId) {
        void window.markfix.clearDraft();
      } else {
        void window.markfix.saveDraft({
          title,
          description,
          url,
          anchor,
          annotations,
          reproduction,
          ...(selectedWorkspaceId ? { workspaceId: selectedWorkspaceId } : {}),
          ...(selectedProjectId ? { projectId: selectedProjectId } : {}),
          ...(selectedEnvironmentId ? { environmentId: selectedEnvironmentId } : {}),
          ...(pendingOutboxId ? { pendingOutboxId } : {}),
        } satisfies DesktopDraft);
      }
    }, 400);
    return () => window.clearTimeout(timer);
  }, [
    title,
    description,
    url,
    anchor,
    annotations,
    reproduction,
    selectedWorkspaceId,
    selectedProjectId,
    selectedEnvironmentId,
    pendingOutboxId,
  ]);

  const setMode = async (nextMode: BrowserMode): Promise<void> => {
    modeRef.current = nextMode;
    setModeState(nextMode);
    setNotice(
      nextMode === 'comment' || nextMode === 'inspect'
        ? 'Hover and click an element on the page.'
        : nextMode === 'capture'
          ? 'Drag over the area you want to capture.'
          : nextMode === 'region'
            ? 'Drag a rectangle on the page.'
            : undefined,
    );
    await window.markfix.setMode(nextMode);
  };

  const toggleMode = (nextMode: 'comment' | 'capture'): Promise<void> => {
    const destination = mode === nextMode ? 'browse' : nextMode;
    if (destination === 'comment') {
      setAnchor(undefined);
      setElementCommentNote('');
      setElementEvidence([]);
      setEditingElementCommentId(undefined);
    }
    if (destination === 'capture') {
      captureRequestIdRef.current = undefined;
      setCaptureSelection(undefined);
      setCaptureSource(undefined);
      setCaptureMarks([]);
      setCaptureNote('');
      setCaptureEvidence([]);
      setEditingCaptureId(undefined);
      setScreenshot(undefined);
      void window.markfix.setCaptureTool('select');
    }
    return setMode(destination);
  };

  const toggleDiagnostics = async (): Promise<void> => {
    await setDiagnosticsVisibility(!diagnosticsOpenRef.current);
  };

  const clearDiagnostics = async (scope: 'console' | 'network'): Promise<void> => {
    try {
      await window.markfix.clearDiagnostics(scope);
      setDiagnosticEntries((entries) =>
        entries.filter((entry) =>
          scope === 'network' ? entry.kind !== 'network' : entry.kind === 'network',
        ),
      );
    } catch (error) {
      setNotice(error instanceof Error ? error.message : '无法清空网站控制台。');
    }
  };

  const quoteDiagnostic = async (entry: DiagnosticEvidence): Promise<void> => {
    const add = (items: DiagnosticEvidence[]): DiagnosticEvidence[] =>
      items.some(({ id }) => id === entry.id) ? items : [...items, entry].slice(-50);
    if (mode === 'comment' && anchor?.kind === 'element') {
      setElementEvidence(add);
      setNotice('调试证据已引用到当前元素批注。');
      return;
    }
    if (mode === 'capture' && captureSelection) {
      setCaptureEvidence(add);
      setNotice('调试证据已引用到当前截图批注。');
      return;
    }
    if (!selectedProjectId || !pageSessionId) {
      setNotice('请先打开一个标注项目。');
      return;
    }
    if (diagnosticAnnotations.some((annotation) => annotation.evidence.id === entry.id)) return;
    const now = new Date().toISOString();
    const annotation: SavedDiagnosticAnnotation = {
      id: crypto.randomUUID(),
      projectId: selectedProjectId,
      pageSessionId,
      pageUrl: entry.pageUrl,
      pageTitle: pageTitle || entry.pageUrl,
      status: 'draft',
      evidence: entry,
      createdAt: now,
      updatedAt: now,
    };
    try {
      await window.markfix.saveDiagnosticAnnotation(annotation);
      setDiagnosticAnnotations((items) => [...items, annotation]);
      if (mode !== 'comment') await setMode('comment');
      setNotice('已创建调试标注。');
    } catch (error) {
      setNotice(error instanceof Error ? error.message : '无法创建调试标注。');
    }
  };

  const activeEvidence =
    mode === 'comment'
      ? elementEvidence
      : mode === 'capture' && captureSelection
        ? captureEvidence
        : [];
  const selectedEvidenceIds = new Set([
    ...activeEvidence.map(({ id }) => id),
    ...diagnosticAnnotations.map(({ evidence }) => evidence.id),
  ]);
  const diagnosticErrorCount = diagnosticEntries.filter(({ level }) => level === 'error').length;

  const beginAnnotation = async (nextTool: AnnotationTool): Promise<void> => {
    setActiveTool(nextTool);
    await window.markfix.setAnnotationTool(nextTool);
    await setMode('draw');
    setNotice(`Draw a ${nextTool} annotation on the page.`);
  };

  const updateCaptureText = (id: string, text: string): void => {
    setCaptureMarks((marks) =>
      marks.map((mark) => (mark.id === id && mark.type === 'text' ? { ...mark, text } : mark)),
    );
  };

  const copyCapture = async (dataUrl = screenshot): Promise<void> => {
    if (!dataUrl) return;
    await window.markfix.copyCaptureImage(dataUrl);
    setNotice('截图已复制到剪贴板。');
  };

  const saveCapture = async (dataUrl = screenshot): Promise<void> => {
    if (!dataUrl) return;
    const result = await window.markfix.saveCaptureImage(
      dataUrl,
      `markfix-${new Date().toISOString().slice(0, 19)}`,
    );
    if (!result.canceled) setNotice(`截图已保存到 ${result.filePath ?? '本地文件'}`);
  };

  const completeCapture = async (): Promise<void> => {
    if (
      !captureSelection ||
      !screenshot ||
      !captureSource ||
      !captureNote.trim() ||
      captureRendering ||
      !selectedProjectId ||
      !pageSessionId
    )
      return;
    const existing = savedCaptures.find(({ id }) => id === editingCaptureId);
    const now = new Date().toISOString();
    const capture: SavedCapture = {
      id: existing?.id ?? crypto.randomUUID(),
      projectId: selectedProjectId,
      pageSessionId,
      pageUrl: captureSelection.documentUrl,
      pageTitle: pageTitle || captureSelection.documentUrl,
      note: captureNote.trim(),
      status: 'draft',
      dataUrl: screenshot,
      widthCssPx: captureSelection.widthCssPx,
      heightCssPx: captureSelection.heightCssPx,
      marks: captureMarks,
      ...(captureEvidence.length > 0 ? { evidence: captureEvidence } : {}),
      selection: captureSelection,
      sourceDataUrl: captureSource.dataUrl,
      captureScale: captureSource.captureScale,
      createdAt: existing?.createdAt ?? now,
      updatedAt: now,
    };
    await window.markfix.saveCaptureRecord(capture);
    setSavedCaptures((captures) =>
      captures.some(({ id }) => id === capture.id)
        ? captures.map((item) => (item.id === capture.id ? capture : item))
        : [...captures, capture],
    );
    setCaptureNote('');
    setCaptureEvidence([]);
    setCaptureMarks([]);
    setEditingCaptureId(undefined);
    await window.markfix.clearCaptureSelection();
    await window.markfix.setCaptureTool('select');
    setNotice('截图批注已保存到本机。');
  };

  const cancelCapture = async (): Promise<void> => {
    setCaptureNote('');
    setCaptureEvidence([]);
    setCaptureMarks([]);
    setEditingCaptureId(undefined);
    await window.markfix.clearCaptureSelection();
    await window.markfix.setCaptureTool('select');
  };

  const deleteSavedCapture = async (id: string): Promise<void> => {
    await window.markfix.deleteCaptureRecord(id);
    setSavedCaptures((captures) => captures.filter((capture) => capture.id !== id));
    if (editingCaptureId === id) await cancelCapture();
    setNotice('截图批注已删除。');
  };

  const selectSavedCapture = async (capture: SavedCapture): Promise<void> => {
    const selection = capture.selection;
    const marks = capture.marks;
    captureRestoreRef.current = { capture, selection, marks };
    setEditingCaptureId(capture.id);
    setCaptureNote(capture.note);
    setCaptureEvidence(capture.evidence ?? []);
    setScreenshot(capture.dataUrl);
    await window.markfix.restoreCaptureSelection(selection, marks);
    window.requestAnimationFrame(() => {
      document.querySelector<HTMLTextAreaElement>('[data-capture-note]')?.focus();
    });
  };

  const clearElementSelection = (): void => {
    setAnchor(undefined);
    setElementCommentNote('');
    setElementEvidence([]);
    setEditingElementCommentId(undefined);
  };

  const completeElementComment = async (): Promise<void> => {
    if (
      anchor?.kind !== 'element' ||
      !elementCommentNote.trim() ||
      !selectedProjectId ||
      !pageSessionId
    )
      return;
    const now = new Date().toISOString();
    const existing = elementComments.find(
      (comment) =>
        comment.projectId === selectedProjectId &&
        (comment.id === editingElementCommentId || elementAnchorsEqual(comment.anchor, anchor)),
    );
    const comment: SavedElementComment = {
      id: existing?.id ?? crypto.randomUUID(),
      projectId: selectedProjectId,
      pageSessionId,
      pageUrl: anchor.documentUrl,
      pageTitle: pageTitle || anchor.documentUrl,
      anchor,
      note: elementCommentNote.trim(),
      status: 'draft',
      ...(elementEvidence.length > 0 ? { evidence: elementEvidence } : {}),
      createdAt: existing?.createdAt ?? now,
      updatedAt: now,
    };
    await window.markfix.saveElementComment(comment);
    setElementComments((comments) =>
      comments.some(({ id }) => id === comment.id)
        ? comments.map((item) => (item.id === comment.id ? comment : item))
        : [...comments, comment],
    );
    clearElementSelection();
    setNotice(existing ? '元素批注已更新。' : '元素批注已保存到本机。');
  };

  const selectElementComment = (comment: SavedElementComment): void => {
    setAnchor(comment.anchor);
    setEditingElementCommentId(comment.id);
    setElementCommentNote(comment.note);
    setElementEvidence(comment.evidence ?? []);
    window.requestAnimationFrame(() => {
      document.querySelector<HTMLTextAreaElement>('[data-element-comment-note]')?.focus();
    });
  };

  const deleteElementComment = async (id: string): Promise<void> => {
    await window.markfix.deleteElementComment(id);
    setElementComments((comments) => comments.filter((comment) => comment.id !== id));
    if (editingElementCommentId === id) clearElementSelection();
    setNotice('元素批注已删除。');
  };

  const deleteDiagnosticAnnotation = async (id: string): Promise<void> => {
    await window.markfix.deleteDiagnosticAnnotation(id);
    setDiagnosticAnnotations((annotations) =>
      annotations.filter((annotation) => annotation.id !== id),
    );
    setNotice('调试标注已删除。');
  };

  const hasUnsavedDraft = (): boolean =>
    Boolean(
      elementCommentNote.trim() ||
      captureNote.trim() ||
      captureMarks.length > 0 ||
      title.trim() ||
      description.trim() ||
      annotations.length > 0,
    );

  const resetTransientDraft = async (): Promise<void> => {
    clearElementSelection();
    if (captureSelection) await cancelCapture();
    setTitle('');
    setDescription('');
    setAnnotations([]);
    setRedoStack([]);
    setReproduction([]);
    await setMode('browse');
  };

  const switchProject = async (project: WebsiteProject): Promise<boolean> => {
    if (selectedProjectId && selectedProjectId !== project.id && hasUnsavedDraft()) {
      const confirmed = await window.markfix.confirmDiscardDraft('switch-project');
      if (!confirmed) return false;
    }
    const requestId = ++projectSwitchRequestRef.current;
    const previousProjectId = selectedProjectIdRef.current;
    const previousWorkspaceId = selectedWorkspaceId;
    const previousEnvironmentId = selectedEnvironmentId;
    const previousActiveView = activeView;
    const previousUrl = url;
    const previousPageSessionId = pageSessionId;
    const changingProject = previousProjectId !== project.id;
    setNewProjectError(undefined);
    if (changingProject) {
      setSwitchingProjectId(project.id);
      selectedProjectIdRef.current = project.id;
      setSelectedProjectId(project.id);
      setSelectedWorkspaceId(project.workspaceId);
      setSelectedEnvironmentId(undefined);
      setActiveView('workspace');
      setUrl(project.currentUrl);
      setPageSessionId(project.currentPageSessionId);
      setBrowserState((current) => ({
        ...current,
        loading: true,
        error: null,
        loadFailure: null,
      }));
      setNotice(`正在切换到 ${project.title}…`);
    }
    try {
      const projectSwitch = window.markfix.switchWebsiteProject(project.id);
      if (changingProject) await resetTransientDraft();
      const current = await projectSwitch;
      if (requestId !== projectSwitchRequestRef.current) return false;
      setSelectedProjectId(project.id);
      selectedProjectIdRef.current = project.id;
      setSelectedWorkspaceId(project.workspaceId);
      setSelectedEnvironmentId(undefined);
      setActiveView('workspace');
      setUrl(current.currentUrl);
      setPageSessionId(current.currentPageSessionId);
      setSwitchingProjectId(undefined);
      setWebsiteProjects((projects) =>
        projects.map((item) => (item.id === current.id ? current : item)),
      );
      return true;
    } catch (error) {
      if (requestId === projectSwitchRequestRef.current) {
        setSwitchingProjectId(undefined);
        selectedProjectIdRef.current = previousProjectId;
        setSelectedProjectId(previousProjectId);
        setSelectedWorkspaceId(previousWorkspaceId);
        setSelectedEnvironmentId(previousEnvironmentId);
        setActiveView(previousActiveView);
        setUrl(previousUrl);
        setPageSessionId(previousPageSessionId);
        setBrowserState((current) => ({ ...current, loading: false }));
        setNotice(error instanceof Error ? error.message : '项目切换失败。');
      }
      return false;
    }
  };

  const deleteWebsiteProject = async (project: WebsiteProject): Promise<void> => {
    try {
      const result = await window.markfix.deleteWebsiteProject(project.id);
      if (!result.deleted) return;
      projectSwitchRequestRef.current += 1;
      setWebsiteProjects((projects) => projects.filter(({ id }) => id !== project.id));
      setElementComments((records) => records.filter(({ projectId }) => projectId !== project.id));
      setSavedCaptures((records) => records.filter(({ projectId }) => projectId !== project.id));
      setDiagnosticAnnotations((records) =>
        records.filter(({ projectId }) => projectId !== project.id),
      );
      if (selectedProjectIdRef.current === project.id) {
        selectedProjectIdRef.current = undefined;
        setSelectedProjectId(undefined);
        setSelectedEnvironmentId(undefined);
        setEnvironments([]);
        setPageSessionId(undefined);
        setUrl('');
        setActiveView('new');
        await resetTransientDraft();
        await window.markfix.clearDraft();
      }
      void window.markfix
        .listWorkspaces()
        .then(setWorkspaces)
        .catch(() => undefined);
      setNotice(`已删除项目：${project.title}`);
    } catch (error) {
      setNotice(error instanceof Error ? error.message : '项目删除失败。');
    }
  };

  const createWebsiteProject = async (input: string): Promise<void> => {
    const hadUnsavedDraft = hasUnsavedDraft();
    if (hadUnsavedDraft && !(await window.markfix.confirmDiscardDraft('new-annotation'))) return;
    if (hadUnsavedDraft) await resetTransientDraft();
    const workspaceId = selectedWorkspaceId ?? workspaces[0]?.id;
    if (!workspaceId) {
      setNewProjectError('当前账号没有可用工作区，请先在管理端创建工作区。');
      return;
    }
    setCreatingProject(true);
    setNewProjectError(undefined);
    setNewProjectInput(input);
    try {
      const result = await window.markfix.createWebsiteProject(workspaceId, input);
      setWebsiteProjects((projects) => [
        result.project,
        ...projects.filter(({ id }) => id !== result.project.id),
      ]);
      setWorkspaces((items) =>
        items.map((workspace) =>
          workspace.id !== result.project.workspaceId ||
          workspace.projects.some(({ id }) => id === result.project.id)
            ? workspace
            : {
                ...workspace,
                projects: [
                  ...workspace.projects,
                  {
                    id: result.project.id,
                    workspaceId: result.project.workspaceId,
                    name: result.project.title,
                    baseUrl: result.project.origin,
                    createdAt: result.project.createdAt,
                    updatedAt: result.project.updatedAt,
                  },
                ],
              },
        ),
      );
      if (!(await switchProject(result.project))) return;
      setNotice(
        result.created ? `已创建项目：${result.project.title}` : '该网站已存在，已切换到原项目。',
      );
    } catch (error) {
      setNewProjectError(
        error instanceof Error ? error.message : '网站加载或解析失败，请检查地址后重试。',
      );
    } finally {
      setCreatingProject(false);
    }
  };

  const openWebsiteShortcut = async (shortcutUrl: string): Promise<void> => {
    let shortcutOrigin: string;
    try {
      shortcutOrigin = new URL(shortcutUrl).origin;
    } catch {
      setNewProjectError('快捷方式的网址无效，请修改后重试。');
      return;
    }
    const project = websiteProjects.find(({ origin }) => origin === shortcutOrigin);
    if (!project) {
      await createWebsiteProject(shortcutUrl);
      return;
    }
    if (!(await switchProject(project))) return;
    try {
      const normalized = await window.markfix.navigate(shortcutUrl);
      setUrl(normalized);
    } catch (shortcutError) {
      setNotice(shortcutError instanceof Error ? shortcutError.message : '快捷方式打开失败。');
    }
  };

  const openCurrentProjectAnnotationReview = async (): Promise<void> => {
    if (!selectedProjectId || unsubmittedCount === 0 || isSubmitting) return;
    setIsSubmitting(true);
    try {
      await window.markfix.openAnnotationReview(selectedProjectId);
    } catch (error) {
      setNotice(error instanceof Error ? error.message : '无法打开标注确认窗口。');
    } finally {
      setIsSubmitting(false);
    }
  };

  const restoreHistoricalAnnotation = async (annotation: ProjectAnnotation): Promise<void> => {
    const project = websiteProjects.find(({ id }) => id === annotation.record.projectId);
    if (!project || !(await switchProject(project))) return;
    await window.markfix.navigate(annotation.record.pageUrl);
    setUrl(annotation.record.pageUrl);
    setPageSessionId(annotation.record.pageSessionId);
    if (annotation.type === 'element') {
      await setMode('comment');
      selectElementComment(annotation.record);
    } else if (annotation.type === 'capture') {
      await setMode('capture');
      await selectSavedCapture(annotation.record);
    } else {
      await setMode('comment');
    }
    setNotice('已恢复标注上下文，可继续编辑。');
  };

  const editHistoricalAnnotation = async (annotation: ProjectAnnotation): Promise<void> => {
    if (hasUnsavedDraft()) {
      setPendingHistoricalAnnotation(annotation);
      return;
    }
    await restoreHistoricalAnnotation(annotation);
  };
  editHistoricalAnnotationRef.current = editHistoricalAnnotation;

  const updateStep = (id: string, description: string): void => {
    setReproduction((steps) =>
      steps.map((step) => (step.id === id ? { ...step, description } : step)),
    );
  };

  const moveStep = (index: number, offset: -1 | 1): void => {
    setReproduction((steps) => {
      const destination = index + offset;
      if (destination < 0 || destination >= steps.length) return steps;
      const reordered = [...steps];
      const [step] = reordered.splice(index, 1);
      if (!step) return steps;
      reordered.splice(destination, 0, step);
      return reordered;
    });
  };

  const addManualStep = (): void => {
    setReproduction((steps) => [
      ...steps,
      {
        id: crypto.randomUUID(),
        type: 'manual',
        description: 'Describe this step',
        timestampMs: Date.now(),
      },
    ]);
  };

  const undo = (): void => {
    setAnnotations((current) => {
      const removed = current.at(-1);
      if (!removed) return current;
      setRedoStack((redo) => [...redo, removed]);
      return current.slice(0, -1);
    });
  };

  const redo = (): void => {
    setRedoStack((current) => {
      const restored = current.at(-1);
      if (!restored) return current;
      setAnnotations((annotations) => [...annotations, restored]);
      return current.slice(0, -1);
    });
  };

  const capture = async () => {
    const result = await window.markfix.capture({
      mode: 'visible',
      ...(anchor ? { anchor } : {}),
    });
    setScreenshot(result.dataUrl);
    setNotice(result.warning ?? `${result.mode} capture completed.`);
    return result;
  };

  const submit = async (): Promise<void> => {
    if (!selectedProjectId || !anchor || !title.trim() || !description.trim()) return;
    setIsSubmitting(true);
    setNotice(undefined);
    try {
      const captureResult = await capture();
      const captureContext: CaptureContext = {
        mode: captureResult.mode,
        imageWidthPx: captureResult.imageWidthPx,
        imageHeightPx: captureResult.imageHeightPx,
        widthCssPx: captureResult.widthCssPx,
        heightCssPx: captureResult.heightCssPx,
        originCssPx: captureResult.originCssPx,
        captureScale: captureResult.captureScale,
        truncated: captureResult.truncated,
        ...(captureResult.warning ? { warning: captureResult.warning } : {}),
      };
      const result = (await window.markfix.submitReport({
        projectId: selectedProjectId,
        ...(selectedEnvironmentId ? { environmentId: selectedEnvironmentId } : {}),
        title: title.trim(),
        description: description.trim(),
        priority: 'MEDIUM',
        screenshotDataUrl: captureResult.dataUrl,
        captureBundle: {
          schemaVersion: 1,
          page: {
            url: captureResult.pageUrl,
            title: captureResult.pageTitle,
            viewportWidthCssPx: captureResult.viewportWidthCssPx,
            viewportHeightCssPx: captureResult.viewportHeightCssPx,
            deviceScaleFactor: captureResult.deviceScaleFactor,
            capturedAt: new Date().toISOString(),
          },
          anchor,
          annotations,
          reproduction,
          capture: captureContext,
        },
      })) as {
        disposition: 'submitted' | 'queued';
        outboxId?: string;
        report?: unknown;
      };
      if (result.disposition === 'queued' && result.outboxId) {
        pendingOutboxIdRef.current = result.outboxId;
        setPendingOutboxId(result.outboxId);
        setNotice('Saved to the local outbox. MarkFix will retry automatically.');
        const status = await window.markfix.loadSyncStatus(result.outboxId);
        if (status?.status === 'COMPLETED' && clearReport(result.outboxId))
          setNotice('Queued report synchronized successfully.');
        return;
      }
      const report = reportSchema.safeParse(result.report);
      if (report.success) mergeProjectReport(report.data);
      setNotice('Report submitted. It is now visible in the dashboard.');
      clearReport();
    } catch (error) {
      setNotice(
        error instanceof Error
          ? `Saved locally — ${error.message}`
          : 'Submission failed; the draft is safe locally.',
      );
    } finally {
      setIsSubmitting(false);
    }
  };

  useEffect(() => {
    const handleShortcut = (event: KeyboardEvent): void => {
      if ((event.metaKey || event.ctrlKey) && !event.shiftKey && event.key.toLowerCase() === 'l') {
        event.preventDefault();
        addressInputRef.current?.focus();
        addressInputRef.current?.select();
        return;
      }
      if ((event.metaKey || event.ctrlKey) && event.key === 'Enter') {
        if (mode === 'comment' && anchor?.kind === 'element' && elementCommentNote.trim()) {
          event.preventDefault();
          void completeElementComment();
        } else if (mode === 'capture' && captureSelection && captureNote.trim()) {
          event.preventDefault();
          void completeCapture();
        }
      }
      if (event.key !== 'Escape') return;
      if (mode === 'comment' && anchor) {
        clearElementSelection();
      } else if (mode === 'capture' && captureSelection) {
        void cancelCapture();
      } else if (mode !== 'browse') {
        void setMode('browse');
      }
    };
    window.addEventListener('keydown', handleShortcut);
    return () => window.removeEventListener('keydown', handleShortcut);
  });

  const toggleSidebar = (): void => setSidebarExpanded((expanded) => !expanded);
  const openNewAnnotation = (): void => {
    setNewProjectError(undefined);
    setActiveView('new');
  };
  const retryProjectLoad = (): void => {
    if (!selectedWebsiteProject) return;
    setBrowserState((current) => ({
      ...current,
      loading: true,
      error: null,
      loadFailure: null,
    }));
    void window.markfix
      .switchWebsiteProject(selectedWebsiteProject.id)
      .catch((error: unknown) =>
        setNotice(error instanceof Error ? error.message : '无法重新加载项目。'),
      );
  };
  const navigation = (
    <ProjectSidebar
      expanded={sidebarExpanded}
      user={user}
      projects={websiteProjects}
      selectedProjectId={selectedProjectId}
      activeView={activeView}
      annotationCount={(projectId) =>
        projectAnnotations(projectId, elementComments, savedCaptures, diagnosticAnnotations).length
      }
      onNew={openNewAnnotation}
      onHistory={() => {
        void window.markfix
          .openAnnotationHistory()
          .catch((error: unknown) =>
            setNotice(error instanceof Error ? error.message : '无法打开历史标注窗口。'),
          );
      }}
      onProject={(project) => void switchProject(project)}
      onDeleteProject={(project) => void deleteWebsiteProject(project)}
      onOpenSettings={() => {
        void window.markfix
          .openSettings()
          .catch((error: unknown) =>
            setNotice(error instanceof Error ? error.message : '无法打开设置窗口。'),
          );
      }}
      onLogout={onLoggedOut}
    />
  );
  const headerNavigation = (
    <HeaderNavigationControls
      expanded={sidebarExpanded}
      onToggle={toggleSidebar}
      onNew={openNewAnnotation}
    />
  );
  const historyRestoreDialog = (
    <AlertDialog
      open={Boolean(pendingHistoricalAnnotation)}
      onOpenChange={(open) => {
        if (!open) setPendingHistoricalAnnotation(undefined);
      }}
    >
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>放弃当前编辑内容？</AlertDialogTitle>
          <AlertDialogDescription>
            当前有未保存的编辑内容。恢复历史标注将放弃这些内容，此操作无法撤销。
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>取消</AlertDialogCancel>
          <AlertDialogAction
            className="bg-destructive text-white hover:bg-destructive/90"
            onClick={() => {
              const annotation = pendingHistoricalAnnotation;
              setPendingHistoricalAnnotation(undefined);
              if (!annotation) return;
              void (async () => {
                await resetTransientDraft();
                await restoreHistoricalAnnotation(annotation);
              })();
            }}
          >
            放弃并恢复
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );

  if (activeView === 'new') {
    return (
      <div className={`shell ${sidebarExpanded ? 'sidebar-expanded' : 'sidebar-collapsed'}`}>
        {navigation}
        <header className="navigation-header">{headerNavigation}</header>
        {historyRestoreDialog}
        <NewProjectPage
          initialValue={newProjectInput}
          busy={creatingProject}
          error={newProjectError}
          projects={websiteProjects}
          onSubmit={(input) => void createWebsiteProject(input)}
          onShortcut={(shortcutUrl) => void openWebsiteShortcut(shortcutUrl)}
        />
      </div>
    );
  }

  return (
    <div className={`shell ${sidebarExpanded ? 'sidebar-expanded' : 'sidebar-collapsed'}`}>
      {navigation}
      {historyRestoreDialog}
      <header className="browser-bar">
        {headerNavigation}
        <div className="prototype-browser-bar">
          <div className="nav-buttons">
            <Button
              aria-label="后退"
              title="后退"
              disabled={!browserState.canGoBack}
              onClick={() => void window.markfix.back()}
            >
              <ArrowLeft />
            </Button>
            <Button
              aria-label="前进"
              title="前进"
              disabled={!browserState.canGoForward}
              onClick={() => void window.markfix.forward()}
            >
              <ArrowRight />
            </Button>
            <Button aria-label="刷新" title="刷新" onClick={() => void window.markfix.reload()}>
              <RefreshCw className={browserState.loading ? 'spin' : ''} />
            </Button>
          </div>
          <form
            className="address"
            onSubmit={(event) => {
              event.preventDefault();
              void window.markfix
                .navigate(url)
                .catch((error: unknown) =>
                  setNotice(error instanceof Error ? error.message : 'Invalid URL'),
                );
            }}
          >
            <span className="secure-dot" />
            <Input
              ref={addressInputRef}
              value={url}
              aria-label="网站地址"
              aria-keyshortcuts="Meta+L"
              spellCheck={false}
              onFocus={(event) => event.currentTarget.select()}
              onKeyDown={(event) => {
                if (event.key !== 'Escape') return;
                event.preventDefault();
                event.stopPropagation();
                setUrl(browserState.url ?? '');
                event.currentTarget.blur();
              }}
              onChange={(event) => setUrl(event.target.value)}
            />
          </form>
        </div>
        <div className="tools">
          <ToggleGroup
            className="annotation-mode-control"
            type="single"
            value={mode === 'comment' || mode === 'capture' ? mode : ''}
            aria-label="标注工具"
            onValueChange={(value) => {
              if (value === 'comment' || value === 'capture') {
                void toggleMode(value);
              } else if (mode === 'comment' || mode === 'capture') {
                void toggleMode(mode);
              }
            }}
          >
            <ToggleGroupItem value="comment" aria-keyshortcuts="Alt+W" title="批注（⌥W）">
              <MessageSquareText /> 批注 <kbd>⌥W</kbd>
            </ToggleGroupItem>
            <ToggleGroupItem value="capture" aria-keyshortcuts="Alt+A" title="截图（⌥A）">
              <Camera /> 截图 <kbd>⌥A</kbd>
            </ToggleGroupItem>
          </ToggleGroup>
          <Button
            className="more-menu-trigger diagnostics-button"
            aria-label="更多"
            title="更多"
            aria-haspopup="menu"
            onClick={(event) => {
              const rect = event.currentTarget.getBoundingClientRect();
              void window.markfix
                .openMoreMenu(rect.left, rect.bottom)
                .catch((error: unknown) =>
                  setNotice(error instanceof Error ? error.message : '无法打开更多菜单。'),
                );
            }}
          >
            <MoreHorizontal />
            {diagnosticErrorCount > 0 && <i>{Math.min(99, diagnosticErrorCount)}</i>}
          </Button>
          <Button
            className="save-annotations-button"
            disabled={unsubmittedCount === 0 || isSubmitting}
            onClick={() => void openCurrentProjectAnnotationReview()}
          >
            {isSubmitting ? <LoaderCircle className="spin" /> : <Send />}
            提交标注{unsubmittedCount > 0 ? ` ${unsubmittedCount}` : ''}
          </Button>
        </div>
      </header>
      {selectedWebsiteProject && (browserState.loading || browserState.loadFailure) && (
        <main
          className="project-loading-page"
          role={browserState.loadFailure ? 'alert' : 'status'}
          aria-live="polite"
          aria-label={browserState.loadFailure ? '项目加载失败' : '正在加载项目'}
        >
          {browserState.loadFailure ? (
            <section className="project-load-failure">
              <span className="project-load-failure-icon" aria-hidden="true">
                <AlertCircle />
              </span>
              <h1>无法访问此网站</h1>
              <p>{browserState.loadFailure.message}</p>
              <small>{browserState.loadFailure.description.replace(/^net::/, '')}</small>
              <div className="project-load-failure-actions">
                <Button type="button" onClick={retryProjectLoad}>
                  <RefreshCw /> 重新加载
                </Button>
                <Button type="button" variant="outline" onClick={openNewAnnotation}>
                  更换网址
                </Button>
              </div>
            </section>
          ) : (
            <section className="project-load-progress">
              <LoaderCircle className="spin" />
              <strong>正在加载“{selectedWebsiteProject.title}”</strong>
              <span>{selectedWebsiteProject.currentUrl}</span>
            </section>
          )}
        </main>
      )}
      {mode === 'capture' ? (
        <aside className="comment-panel capture-panel">
          <div className="capture-panel-header">
            <span>截图批注</span>
            <small>{pageCaptures.length} 张</small>
          </div>
          <div className="capture-panel-body">
            {captureSelection && (
              <Card className="capture-selection-card">
                <div className="capture-selection-kicker">
                  <Camera /> {captureLoading ? '正在生成截图…' : '实时截图预览'}
                </div>
                {screenshot && (
                  <div className="capture-thumbnail">
                    <img src={screenshot} alt="截图选区预览" />
                  </div>
                )}
                <div className="capture-meta">
                  <span>
                    {Math.round(captureSelection.widthCssPx)} ×{' '}
                    {Math.round(captureSelection.heightCssPx)} px
                  </span>
                  <span>{captureMarks.length} 个标记</span>
                </div>
                {captureMarks.some(({ type }) => type === 'text') && (
                  <div className="capture-text-list">
                    {captureMarks.map((mark, index) =>
                      mark.type === 'text' ? (
                        <Label key={mark.id}>
                          文字 {index + 1}
                          <Input
                            value={mark.text}
                            maxLength={200}
                            onChange={(event) => updateCaptureText(mark.id, event.target.value)}
                          />
                        </Label>
                      ) : null,
                    )}
                  </div>
                )}
                <Textarea
                  className="capture-note-input"
                  data-capture-note
                  value={captureNote}
                  maxLength={2000}
                  placeholder="说明截图中的问题…"
                  onChange={(event) => setCaptureNote(event.target.value)}
                />
                <EvidenceReferences
                  items={captureEvidence}
                  onRemove={(id) =>
                    setCaptureEvidence((items) => items.filter((item) => item.id !== id))
                  }
                />
                <div className="capture-draft-actions">
                  <Button
                    type="button"
                    aria-label="取消截图"
                    title="取消截图"
                    onClick={() => void cancelCapture()}
                  >
                    <X />
                  </Button>
                  <Button
                    type="button"
                    className="primary"
                    aria-label={editingCaptureId ? '保存截图修改' : '完成截图'}
                    title={editingCaptureId ? '保存截图修改' : '完成截图'}
                    disabled={
                      !captureNote.trim() || !screenshot || captureLoading || captureRendering
                    }
                    onClick={() => void completeCapture()}
                  >
                    <Check />
                  </Button>
                </div>
              </Card>
            )}
            {!captureSelection && pageCaptures.length === 0 && (
              <section className="capture-empty">
                <span className="capture-empty-icon">
                  <Camera />
                </span>
                <strong>框选一个页面区域</strong>
                <p>
                  拖拽建立截图选区。选区可以移动、缩放，并支持矩形、椭圆、箭头、画笔、文字、马赛克和序号。
                </p>
              </section>
            )}
            {pageCaptures.length > 0 && (
              <section className="capture-notes-list">
                {[...pageCaptures].reverse().map((item, index) => (
                  <article className="capture-note-card" key={item.id}>
                    <div className="capture-note-head">
                      <span>
                        <i>{pageCaptures.length - index}</i> 截图批注
                      </span>
                      <span>
                        {new Date(item.createdAt).toLocaleTimeString([], {
                          hour: '2-digit',
                          minute: '2-digit',
                        })}
                        <Button
                          type="button"
                          title="删除"
                          onClick={() => void deleteSavedCapture(item.id)}
                        >
                          <Trash2 />
                        </Button>
                      </span>
                    </div>
                    <Button
                      type="button"
                      className="capture-history-select"
                      onClick={() => void selectSavedCapture(item)}
                    >
                      <div className="capture-thumbnail">
                        <img src={item.dataUrl} alt={item.note} />
                      </div>
                      <div className="capture-meta">
                        <span>
                          {Math.round(item.widthCssPx)} × {Math.round(item.heightCssPx)} px
                        </span>
                        <span>
                          {item.marks.length} 个标记
                          {(item.evidence?.length ?? 0) > 0
                            ? ` · ${item.evidence?.length ?? 0} 条证据`
                            : ''}
                        </span>
                      </div>
                      <p>{item.note}</p>
                    </Button>
                    <div className="capture-note-actions">
                      <Button type="button" onClick={() => void copyCapture(item.dataUrl)}>
                        <Copy /> 复制
                      </Button>
                      <Button type="button" onClick={() => void saveCapture(item.dataUrl)}>
                        <Download /> 保存
                      </Button>
                    </div>
                  </article>
                ))}
              </section>
            )}
          </div>
        </aside>
      ) : mode === 'comment' ? (
        <aside className="comment-panel capture-panel element-comment-panel">
          <div className="capture-panel-header">
            <span>批注</span>
            <small>{pageElementComments.length + pageDiagnosticAnnotations.length} 条</small>
          </div>
          <div className="capture-panel-body">
            {anchor?.kind === 'element' && (
              <Card className="element-selection-card">
                <div className="element-selection-kicker">
                  <MousePointer2 />
                  <strong>{editingElementCommentId ? '编辑已有批注' : '已选择元素'}</strong>
                </div>
                <code>{anchor.cssSelector}</code>
                <div className="element-preview">{anchor.textQuote || `<${anchor.tagName}>`}</div>
                <Textarea
                  data-element-comment-note
                  value={elementCommentNote}
                  maxLength={2000}
                  placeholder="描述这里需要修改什么…"
                  onChange={(event) => setElementCommentNote(event.target.value)}
                />
                <EvidenceReferences
                  items={elementEvidence}
                  onRemove={(id) =>
                    setElementEvidence((items) => items.filter((item) => item.id !== id))
                  }
                />
                <div className="capture-draft-actions">
                  <Button
                    type="button"
                    aria-label="取消批注"
                    title="取消批注"
                    onClick={clearElementSelection}
                  >
                    <X />
                  </Button>
                  <Button
                    type="button"
                    className="primary"
                    aria-label={editingElementCommentId ? '保存批注修改' : '完成批注'}
                    title={editingElementCommentId ? '保存批注修改' : '完成批注'}
                    disabled={!elementCommentNote.trim()}
                    onClick={() => void completeElementComment()}
                  >
                    <Check />
                  </Button>
                </div>
              </Card>
            )}
            {!anchor && pageElementComments.length + pageDiagnosticAnnotations.length === 0 && (
              <section className="capture-empty element-comment-empty">
                <span className="capture-empty-icon">
                  <MousePointer2 />
                </span>
                <strong>选择页面中的元素</strong>
                <p>点击页面中的任意元素添加批注，批注会保留元素位置和页面上下文。</p>
              </section>
            )}
            {pageDiagnosticAnnotations.length > 0 && (
              <section className="capture-notes-list diagnostic-notes-list">
                {[...pageDiagnosticAnnotations].reverse().map((item, index) => (
                  <article className="capture-note-card diagnostic-note-card" key={item.id}>
                    <div className="capture-note-head">
                      <span>
                        <i>{pageDiagnosticAnnotations.length - index}</i>
                        {item.evidence.kind === 'network'
                          ? 'Network 标注'
                          : item.evidence.kind === 'command'
                            ? '命令标注'
                            : 'Console 标注'}
                      </span>
                      <span>
                        {new Date(item.updatedAt).toLocaleTimeString([], {
                          hour: '2-digit',
                          minute: '2-digit',
                        })}
                        <Button
                          type="button"
                          title="删除"
                          onClick={() => void deleteDiagnosticAnnotation(item.id)}
                        >
                          <Trash2 />
                        </Button>
                      </span>
                    </div>
                    <div className={`diagnostic-annotation-content ${item.evidence.level}`}>
                      <span>
                        <Terminal />
                        <strong>{item.evidence.title}</strong>
                      </span>
                      <p>{item.evidence.message}</p>
                      <small>
                        {item.evidence.source ?? item.evidence.request?.url ?? item.pageUrl}
                      </small>
                    </div>
                  </article>
                ))}
              </section>
            )}
            {pageElementComments.length > 0 && (
              <section className="capture-notes-list element-notes-list">
                {[...pageElementComments].reverse().map((item, index) => (
                  <article
                    className={`capture-note-card element-note-card ${editingElementCommentId === item.id ? 'selected' : ''}`}
                    key={item.id}
                  >
                    <div className="capture-note-head">
                      <span>
                        <i>{pageElementComments.length - index}</i> 元素批注
                      </span>
                      <span>
                        {new Date(item.updatedAt).toLocaleTimeString([], {
                          hour: '2-digit',
                          minute: '2-digit',
                        })}
                        <Button
                          type="button"
                          title="删除"
                          onClick={() => void deleteElementComment(item.id)}
                        >
                          <Trash2 />
                        </Button>
                      </span>
                    </div>
                    <Button
                      type="button"
                      className="element-note-select"
                      onClick={() => selectElementComment(item)}
                    >
                      <code>{item.anchor.cssSelector}</code>
                      <p>{item.note}</p>
                      {(item.evidence?.length ?? 0) > 0 && (
                        <small className="saved-evidence-count">
                          <Paperclip /> {item.evidence?.length ?? 0} 条调试证据
                        </small>
                      )}
                    </Button>
                  </article>
                ))}
              </section>
            )}
          </div>
        </aside>
      ) : mode !== 'browse' ? (
        <aside className="comment-panel">
          <div className="panel-heading">
            <div>
              <span className="eyebrow">NEW REPORT</span>
              <h1>Leave a mark</h1>
            </div>
            <Sparkles />
          </div>
          <section className="report-context">
            <div className="context-pair">
              <Label>
                <span>Workspace</span>
                <NativeSelect
                  aria-label="Workspace"
                  value={selectedWorkspaceId ?? ''}
                  disabled={contextLoading || workspaces.length === 0 || Boolean(pendingOutboxId)}
                  onChange={(event) => {
                    setSelectedWorkspaceId(event.target.value || undefined);
                    setSelectedProjectId(undefined);
                    setSelectedEnvironmentId(undefined);
                  }}
                >
                  {workspaces.map((workspace) => (
                    <option key={workspace.id} value={workspace.id}>
                      {workspace.name}
                    </option>
                  ))}
                </NativeSelect>
              </Label>
              <Label>
                <span>Project</span>
                <NativeSelect
                  aria-label="Project"
                  value={selectedProjectId ?? ''}
                  disabled={
                    contextLoading ||
                    !selectedWorkspace ||
                    selectedWorkspace.projects.length === 0 ||
                    Boolean(pendingOutboxId)
                  }
                  onChange={(event) => {
                    setSelectedProjectId(event.target.value || undefined);
                    setSelectedEnvironmentId(undefined);
                  }}
                >
                  {selectedWorkspace?.projects.map((project) => (
                    <option key={project.id} value={project.id}>
                      {project.name}
                    </option>
                  ))}
                </NativeSelect>
              </Label>
            </div>
            <Label>
              <span>Environment</span>
              <NativeSelect
                aria-label="Environment"
                value={selectedEnvironmentId ?? ''}
                disabled={
                  contextLoading ||
                  !selectedProject ||
                  environments.length === 0 ||
                  Boolean(pendingOutboxId)
                }
                onChange={(event) => setSelectedEnvironmentId(event.target.value || undefined)}
              >
                {environments.map((environment) => (
                  <option key={environment.id} value={environment.id}>
                    {environment.name}
                  </option>
                ))}
              </NativeSelect>
            </Label>
            <small>
              {contextLoading
                ? 'Loading report destination…'
                : selectedEnvironment
                  ? selectedEnvironment.baseUrl
                  : selectedProject
                    ? 'No environment configured; this report will still be saved.'
                    : 'Create a project in the dashboard before submitting.'}
            </small>
          </section>
          <section className={`anchor-summary ${anchor ? 'selected' : ''}`}>
            {anchor ? (
              <>
                <div className="anchor-icon">
                  <Check />
                </div>
                <div>
                  <strong>{anchor.kind === 'element' ? anchor.tagName : 'Selected region'}</strong>
                  <small>
                    {anchor.kind === 'element'
                      ? anchor.textQuote || anchor.cssSelector
                      : `${Math.round(anchor.widthCssPx)} × ${Math.round(anchor.heightCssPx)} px`}
                  </small>
                </div>
              </>
            ) : (
              <>
                <div className="anchor-icon">
                  <MousePointer2 />
                </div>
                <div>
                  <strong>Select something</strong>
                  <small>Pick an element or drag over a region.</small>
                </div>
              </>
            )}
          </section>
          <section className="annotation-toolbar">
            <div className="annotation-tools">
              <Button
                className={activeTool === 'pin' && mode === 'draw' ? 'active' : ''}
                title="Pin"
                onClick={() => void beginAnnotation('pin')}
              >
                <Crosshair />
              </Button>
              <Button
                className={activeTool === 'rectangle' && mode === 'draw' ? 'active' : ''}
                title="Rectangle"
                onClick={() => void beginAnnotation('rectangle')}
              >
                <Square />
              </Button>
              <Button
                className={activeTool === 'arrow' && mode === 'draw' ? 'active' : ''}
                title="Arrow"
                onClick={() => void beginAnnotation('arrow')}
              >
                <MoveUpRight />
              </Button>
              <Button
                className={activeTool === 'text' && mode === 'draw' ? 'active' : ''}
                title="Text"
                onClick={() => void beginAnnotation('text')}
              >
                <Type />
              </Button>
              <Button
                className={activeTool === 'pen' && mode === 'draw' ? 'active' : ''}
                title="Pen"
                onClick={() => void beginAnnotation('pen')}
              >
                <PenLine />
              </Button>
            </div>
            <div className="history-tools">
              <Button title="Undo" disabled={annotations.length === 0} onClick={undo}>
                <Undo2 />
              </Button>
              <Button title="Redo" disabled={redoStack.length === 0} onClick={redo}>
                <Redo2 />
              </Button>
            </div>
            <span>{annotations.length}</span>
          </section>
          {annotations.length > 0 && (
            <section className="annotation-list" aria-label="Annotations">
              {annotations.map((annotation, index) => (
                <Button
                  type="button"
                  key={annotation.id}
                  className={annotation.id === selectedAnnotationId ? 'selected' : ''}
                  onClick={() => setSelectedAnnotationId(annotation.id)}
                >
                  <span style={{ background: annotation.color }}>{index + 1}</span>
                  <span>
                    <strong>{annotationName(annotation)}</strong>
                    <small>{annotation.type}</small>
                  </span>
                </Button>
              ))}
            </section>
          )}
          <Label className="field">
            <span>Title</span>
            <Input
              value={title}
              maxLength={200}
              onChange={(event) => setTitle(event.target.value)}
              placeholder="What needs fixing?"
            />
          </Label>
          <Label className="field grow">
            <span>Comment</span>
            <Textarea
              value={description}
              maxLength={20000}
              onChange={(event) => setDescription(event.target.value)}
              placeholder="Describe what you expected and what happened…"
            />
          </Label>
          {screenshot && (
            <div className="thumbnail">
              <img src={screenshot} alt="Latest capture" />
              <span>Latest capture</span>
            </div>
          )}
          <section className="steps">
            <div className="steps-heading">
              <strong>Reproduction trail</strong>
              <Button type="button" onClick={addManualStep}>
                + Manual
              </Button>
            </div>
            {reproduction.length === 0 ? (
              <span className="steps-empty">Record page actions or add a manual step.</span>
            ) : (
              <ol>
                {reproduction.map((step, index) => (
                  <li key={step.id}>
                    <span className="step-number">{index + 1}</span>
                    <Input
                      value={step.description}
                      maxLength={2000}
                      aria-label={`Step ${index + 1}`}
                      onChange={(event) => updateStep(step.id, event.target.value)}
                    />
                    <div className="step-actions">
                      <Button
                        type="button"
                        title="Move up"
                        disabled={index === 0}
                        onClick={() => moveStep(index, -1)}
                      >
                        <ChevronUp />
                      </Button>
                      <Button
                        type="button"
                        title="Move down"
                        disabled={index === reproduction.length - 1}
                        onClick={() => moveStep(index, 1)}
                      >
                        <ChevronDown />
                      </Button>
                      <Button
                        type="button"
                        title="Delete step"
                        onClick={() =>
                          setReproduction((steps) => steps.filter(({ id }) => id !== step.id))
                        }
                      >
                        <Trash2 />
                      </Button>
                    </div>
                  </li>
                ))}
              </ol>
            )}
          </section>
          <Button
            className="submit"
            disabled={
              !anchor ||
              !selectedProjectId ||
              !title.trim() ||
              !description.trim() ||
              isSubmitting ||
              Boolean(pendingOutboxId)
            }
            onClick={() => void submit()}
          >
            {isSubmitting ? <LoaderCircle className="spin" /> : <Send />}{' '}
            {pendingOutboxId ? 'Queued for sync' : 'Submit report'}
          </Button>
          <p className="draft-state">Draft saved locally</p>
        </aside>
      ) : null}
      {diagnosticsOpen && (
        <DiagnosticsPanel
          entries={diagnosticEntries}
          selectedEvidenceIds={selectedEvidenceIds}
          withSidebar={mode !== 'browse'}
          onClear={clearDiagnostics}
          onClose={() => void toggleDiagnostics()}
          onQuote={quoteDiagnostic}
        />
      )}
    </div>
  );
}
