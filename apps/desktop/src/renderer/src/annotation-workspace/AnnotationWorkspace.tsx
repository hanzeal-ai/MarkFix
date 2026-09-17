import { flushSync } from 'react-dom';
import { ProjectAgentDialog } from '../ProjectAgentDialog';
import {
  sidebarMinWidth,
  isSidebarWidth,
  annotationPanelDefaultWidth,
  annotationPanelWidth,
} from '../../../sidebar-layout';
import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
} from 'react';
import { toast } from '@markfix/ui';
import { WorkspaceResizeLayout } from './WorkspaceResizeLayout';
import {
  diagnosticEvidenceSchema,
  historyAnnotationReferenceSchema,
  reportSchema,
  type BrowserMode,
  type ClientPolicy,
  type DiagnosticEvidence,
  type HistoryAnnotationReference,
  type ProjectStorageMode,
  type Report,
  type SavedDiagnosticAnnotation,
  type WebsiteProject,
} from '@markfix/contracts';
import { hasDesktopUpdateEdits } from '../../../desktop-update';
import { selectEditableProjectPageRecords } from '../page-records';
import { projectReportOverlays } from '../project-report-overlays';
import { latestReportRejections, rejectedRecordUpdates } from '../report-reconciliation';
import { DiagnosticsPanel } from '../DiagnosticsPanel';
import { AnnotationPreview } from './AnnotationPreview';
import { BrowserToolbar } from './BrowserToolbar';
import { HistoryRestoreDialog } from './HistoryRestoreDialog';
import { DeleteProjectDialog } from './DeleteProjectDialog';
import { projectErrorMessage } from '../project-error';
import { ProjectLoadState } from './ProjectLoadState';
import { useCaptureEditor } from './useCaptureEditor';
import { useElementCommentEditor } from './useElementCommentEditor';
import { type BrowserState, type DesktopUser } from './model';
import {
  browserModeFromSession,
  browserModeSessionKey,
  shouldCollapseSidebarForMode,
  shouldRestoreCaptureAfterPageLoad,
} from './workspace-session';
import { HeaderNavigationControls } from '../project-navigation/HeaderNavigationControls';
import { NewProjectPage } from '../project-navigation/NewProjectPage';
import { ProjectSidebar } from '../project-navigation/ProjectSidebar';
import {
  previewAnnotations,
  projectAnnotations,
  type ProjectAnnotation,
} from '../project-navigation/model';
import { desktopPreferenceKeys, startupProjectPreference } from '../desktop-preferences';

const firstAnnotationGuideKeys = {
  comment: 'markfix:first-annotation-guide:comment:v1',
  capture: 'markfix:first-annotation-guide:capture:v1',
} as const;

export function AnnotationWorkspace({
  policy,
  user,
  localMode = false,
  onLoggedOut,
}: {
  policy: ClientPolicy | undefined;
  user: DesktopUser;
  localMode?: boolean;
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
    () =>
      !shouldCollapseSidebarForMode(
        browserModeFromSession(window.sessionStorage.getItem(browserModeSessionKey)),
      ) && window.localStorage.getItem('markfix:sidebar-expanded') !== 'false',
  );
  const [sidebarPeek, setSidebarPeek] = useState(false);
  const [sidebarMenuOpen, setSidebarMenuOpen] = useState(false);
  const peekTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const showSidebarPeek = () => {
    clearTimeout(peekTimer.current);
    if (!sidebarExpanded) setSidebarPeek(true);
  };
  const endSidebarPeek = () => {
    clearTimeout(peekTimer.current);
    peekTimer.current = setTimeout(() => setSidebarPeek(false), 180);
  };
  useEffect(() => () => clearTimeout(peekTimer.current), []);
  useEffect(() => {
    if (sidebarExpanded) setSidebarPeek(false);
  }, [sidebarExpanded]);
  const [sidebarWidth, setSidebarWidth] = useState(() => {
    const saved = Number(window.localStorage.getItem('markfix:sidebar-width'));
    return isSidebarWidth(saved) && saved > 0 && saved !== 228 ? saved : sidebarMinWidth;
  });
  const [newProjectInput, setNewProjectInput] = useState('');
  const [rightPanelWidth, setRightPanelWidth] = useState(() => {
    const saved = Number(window.localStorage.getItem('markfix:annotation-panel-width'));
    return isSidebarWidth(saved) && saved > 0 ? saved : annotationPanelDefaultWidth;
  });
  const [viewportWidth, setViewportWidth] = useState(window.innerWidth);
  useEffect(() => {
    const onResize = () => setViewportWidth(window.innerWidth);
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);
  const [previewOpen, setPreviewOpen] = useState(false);
  const [pendingDeleteProject, setPendingDeleteProject] = useState<WebsiteProject>();
  const [deletingProject, setDeletingProject] = useState(false);
  const [creatingProject, setCreatingProject] = useState(false);
  const [mode, setModeState] = useState<BrowserMode>(() =>
    browserModeFromSession(window.sessionStorage.getItem(browserModeSessionKey)),
  );
  const [diagnosticAnnotations, setDiagnosticAnnotations] = useState<SavedDiagnosticAnnotation[]>(
    [],
  );
  const [diagnosticsOpen, setDiagnosticsOpenState] = useState(false);
  const [diagnosticEntries, setDiagnosticEntries] = useState<DiagnosticEvidence[]>([]);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [firstAnnotationGuides, setFirstAnnotationGuides] = useState({
    comment: false,
    capture: false,
  });
  const setNotice = useCallback((message: string | undefined): void => {
    if (message) toast(message, { id: message });
  }, []);
  const mergeProjectReport = useCallback((report: Report): void => {
    setProjectReports((current) => [report, ...current.filter(({ id }) => id !== report.id)]);
  }, []);
  const [pendingHistoricalAnnotation, setPendingHistoricalAnnotation] =
    useState<ProjectAnnotation>();
  const [agentProject, setAgentProject] = useState<WebsiteProject>();
  const [selectedProjectId, setSelectedProjectId] = useState<string>();
  useEffect(() => setPreviewOpen(false), [selectedProjectId]);
  const {
    beginCaptureMode,
    resetCaptureDraft,
    cancelCapture,
    captureEvidence,
    captureLoading,
    captureMarks,
    captureNote,
    captureRendering,
    captureSelection,
    completeCapture,
    copyCapture,
    deleteSavedCapture,
    editingCaptureId,
    markSubmitted: markCapturesSubmitted,
    syncReportRejections: syncCaptureReportRejections,
    resetAfterSubmission: resetCaptureAfterSubmission,
    restoreActiveCapture,
    saveCapture,
    savedCaptures,
    savedCapturesRef,
    screenshot,
    selectSavedCapture,
    setCaptureEvidence,
    setCaptureNote,
  } = useCaptureEditor({ pageSessionId, pageTitle, projectId: selectedProjectId, setNotice });
  const {
    anchor,
    clearElementSelection,
    completeElementComment,
    deleteElementComment,
    editingElementCommentId,
    elementCommentNote,
    elementComments,
    elementCommentsRef,
    elementEvidence,
    markSubmitted: markElementCommentsSubmitted,
    syncReportRejections: syncElementReportRejections,
    selectElementComment,
    setElementCommentNote,
    setElementEvidence,
  } = useElementCommentEditor({
    mode,
    pageSessionId,
    pageTitle,
    projectId: selectedProjectId,
    setNotice,
  });
  const selectedProjectIdRef = useRef<string | undefined>(undefined);
  const projectSwitchRequestRef = useRef(0);
  const projectReportRequestRef = useRef(0);
  const addressInputRef = useRef<HTMLInputElement>(null);
  const modeRef = useRef<BrowserMode>('browse');
  const browserLoadingRef = useRef(false);
  const diagnosticsOpenRef = useRef(false);
  const diagnosticAnnotationsRef = useRef<SavedDiagnosticAnnotation[]>([]);
  const editHistoricalAnnotationRef = useRef<(annotation: ProjectAnnotation) => Promise<void>>(
    async () => undefined,
  );
  modeRef.current = mode;
  diagnosticsOpenRef.current = diagnosticsOpen;
  diagnosticAnnotationsRef.current = diagnosticAnnotations;
  selectedProjectIdRef.current = selectedProjectId;

  useEffect(() => {
    const restoreWorkspaceState = async (): Promise<void> => {
      if (modeRef.current === 'capture') await window.markfix.clearCaptureSelection();
      await window.markfix.setMode(modeRef.current);
      await window.markfix.setDiagnosticsOpen(diagnosticsOpenRef.current);
    };
    void restoreWorkspaceState().catch((error: unknown) =>
      setNotice(error instanceof Error ? error.message : '无法恢复标注界面状态。'),
    );
  }, [setNotice]);

  const dismissFirstAnnotationGuide = useCallback((guideMode: 'comment' | 'capture'): void => {
    window.localStorage.setItem(firstAnnotationGuideKeys[guideMode], 'complete');
    setFirstAnnotationGuides((guides) => ({ ...guides, [guideMode]: false }));
  }, []);

  useEffect(() => {
    let active = true;
    void Promise.all([window.markfix.listElementComments(), window.markfix.listCaptureRecords()])
      .then(([comments, captures]) => {
        if (!active) return;
        setFirstAnnotationGuides({
          comment:
            comments.length === 0 &&
            window.localStorage.getItem(firstAnnotationGuideKeys.comment) !== 'complete',
          capture:
            captures.length === 0 &&
            window.localStorage.getItem(firstAnnotationGuideKeys.capture) !== 'complete',
        });
      })
      .catch(() => undefined);
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    if (elementComments.length > 0 && firstAnnotationGuides.comment)
      dismissFirstAnnotationGuide('comment');
  }, [dismissFirstAnnotationGuide, elementComments.length, firstAnnotationGuides.comment]);

  useEffect(() => {
    if (savedCaptures.length > 0 && firstAnnotationGuides.capture)
      dismissFirstAnnotationGuide('capture');
  }, [dismissFirstAnnotationGuide, firstAnnotationGuides.capture, savedCaptures.length]);
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
  const selectedWebsiteProject = useMemo(
    () => websiteProjects.find(({ id }) => id === selectedProjectId),
    [selectedProjectId, websiteProjects],
  );
  const currentPageUrl = browserState.url ?? url;
  const pageElementComments = useMemo(
    () => selectEditableProjectPageRecords(elementComments, selectedProjectId, pageSessionId),
    [elementComments, pageSessionId, selectedProjectId],
  );
  const previewVisible = previewOpen && activeView === 'workspace';
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
    () => projectReportOverlays(projectReports, selectedProjectId, pageSessionId, currentPageUrl),
    [currentPageUrl, pageSessionId, projectReports, selectedProjectId],
  );
  const reportRejections = useMemo(() => latestReportRejections(projectReports), [projectReports]);

  useEffect(() => {
    void syncElementReportRejections(reportRejections);
    void syncCaptureReportRejections(reportRejections);
    const updates = rejectedRecordUpdates(diagnosticAnnotationsRef.current, reportRejections);
    if (updates.length === 0) return;
    void Promise.all(
      updates.map((annotation) => window.markfix.saveDiagnosticAnnotation(annotation)),
    )
      .then(() => {
        const byId = new Map(updates.map((annotation) => [annotation.id, annotation]));
        setDiagnosticAnnotations((annotations) =>
          annotations.map((annotation) =>
            annotation.status === 'submitted'
              ? (byId.get(annotation.id) ?? annotation)
              : annotation,
          ),
        );
      })
      .catch((error: unknown) =>
        setNotice(error instanceof Error ? error.message : '无法同步调试标注的驳回状态。'),
      );
  }, [
    diagnosticAnnotations,
    elementComments,
    reportRejections,
    savedCaptures,
    setNotice,
    syncCaptureReportRejections,
    syncElementReportRejections,
  ]);
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
  const currentPreviewAnnotations = useMemo(
    () => previewAnnotations(currentProjectAnnotations),
    [currentProjectAnnotations],
  );
  const unsubmittedCount = useMemo(
    () => currentProjectAnnotations.filter(({ record }) => record.status === 'draft').length,
    [currentProjectAnnotations],
  );

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
        if (payload === 'clear-diagnostics') {
          void clearDiagnostics('all');
          return;
        }
        if (payload === 'toggle-sidebar') {
          setSidebarExpanded((expanded) => !expanded);
          return;
        }
        if (payload === 'new-annotation') {
          setActiveView('new');
          return;
        }
        if (payload === 'preview') {
          modeRef.current = 'browse';
          setModeState('browse');
          void window.markfix.setMode('browse');
          setPreviewOpen((open) => !open);
          return;
        }
        if (payload === 'diagnostics') {
          void setDiagnosticsVisibility(!diagnosticsOpenRef.current);
          return;
        }
        if (payload !== 'capture' && payload !== 'comment') return;
        const destination = modeRef.current === payload ? 'browse' : payload;
        flushSync(() => {
          if (destination !== 'browse') setPreviewOpen(false);
          if (destination === 'comment') {
            resetCaptureDraft();
            clearElementSelection();
          } else if (destination === 'capture') {
            clearElementSelection();
            beginCaptureMode();
          }
          if (shouldCollapseSidebarForMode(destination)) setSidebarExpanded(false);
          modeRef.current = destination;
          setModeState(destination);
        });
        void window.markfix.setMode(destination);
      }),
      window.markfix.onSyncStatus((payload) => {
        const report = reportSchema.safeParse((payload as { report?: unknown }).report);
        if (report.success && report.data.projectId === selectedProjectIdRef.current)
          mergeProjectReport(report.data);
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
        markElementCommentsSubmitted(elementCommentIds, submittedAt);
        markCapturesSubmitted(captureIds, submittedAt);
        setDiagnosticAnnotations((annotations) =>
          annotations.map((annotation) =>
            diagnosticAnnotationIds.includes(annotation.id)
              ? { ...annotation, status: 'submitted', submittedAt, updatedAt: submittedAt }
              : annotation,
          ),
        );
        clearElementSelection();
        resetCaptureAfterSubmission();
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
  }, [
    beginCaptureMode,
    resetCaptureDraft,
    clearElementSelection,
    markCapturesSubmitted,
    markElementCommentsSubmitted,
    mergeProjectReport,
    resetCaptureAfterSubmission,
    setDiagnosticsVisibility,
  ]);

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
    void window.markfix
      .desktopBootstrap()
      .then(async ({ websiteProjects: projects }) => {
        if (!active || requestId !== projectSwitchRequestRef.current) return;
        setWebsiteProjects(projects);
        const selected = startupProjectPreference(window.localStorage, projects);
        if (!selected) return;
        selectedProjectIdRef.current = selected.id;
        setSelectedProjectId(selected.id);
        setActiveView('workspace');
        setUrl(selected.currentUrl);
        setPageSessionId(selected.currentPageSessionId);
        setBrowserState((current) => ({
          ...current,
          url: selected.currentUrl,
          loading: true,
          error: null,
          loadFailure: null,
        }));
        const current = await window.markfix.switchWebsiteProject(selected.id);
        if (!active || requestId !== projectSwitchRequestRef.current) return;
        setUrl(current.currentUrl);
        setPageSessionId(current.currentPageSessionId);
      })
      .catch((error: unknown) => {
        if (active && requestId === projectSwitchRequestRef.current)
          toast.error(error instanceof Error ? error.message : '无法读取项目。');
      });
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    let active = true;
    setProjectReports([]);
    if (!selectedProjectId || !currentPageUrl) return () => undefined;
    const refresh = (): void => {
      const requestId = ++projectReportRequestRef.current;
      void window.markfix
        .listProjectAnnotationReports(selectedProjectId, currentPageUrl)
        .then((reports) => {
          if (
            active &&
            requestId === projectReportRequestRef.current &&
            selectedProjectIdRef.current === selectedProjectId
          )
            setProjectReports(reports);
        })
        .catch((error: unknown) => {
          if (
            active &&
            requestId === projectReportRequestRef.current &&
            selectedProjectIdRef.current === selectedProjectId
          )
            setNotice(
              error instanceof Error
                ? `网站已开始加载，但服务端标注加载失败：${error.message}`
                : '网站已开始加载，但服务端标注加载失败。',
            );
        });
    };
    const refreshOnFocus = (): void => refresh();
    refresh();
    window.addEventListener('focus', refreshOnFocus);
    const refreshTimer = window.setInterval(refresh, 30_000);
    return () => {
      active = false;
      window.removeEventListener('focus', refreshOnFocus);
      window.clearInterval(refreshTimer);
    };
  }, [currentPageUrl, selectedProjectId]);

  useLayoutEffect(() => {
    window.localStorage.setItem('markfix:sidebar-expanded', String(sidebarExpanded));
    window.localStorage.setItem('markfix:sidebar-width', String(sidebarWidth));
    window.localStorage.setItem('markfix:annotation-panel-width', String(rightPanelWidth));
    void window.markfix.setWorkspaceLayout(
      sidebarExpanded ? sidebarWidth : 0,
      activeView === 'workspace' && !pendingDeleteProject && !agentProject,
      sidebarMenuOpen || (!sidebarExpanded && sidebarPeek) ? sidebarWidth : 0,
      previewVisible ? rightPanelWidth : 0,
    );
  }, [
    activeView,
    sidebarExpanded,
    sidebarWidth,
    sidebarPeek,
    sidebarMenuOpen,
    pendingDeleteProject,
    agentProject,
    rightPanelWidth,
    previewVisible,
  ]);

  useEffect(() => {
    window.sessionStorage.setItem(browserModeSessionKey, mode);
  }, [mode]);

  useEffect(() => {
    const wasLoading = browserLoadingRef.current;
    const isLoading = Boolean(browserState.loading);
    browserLoadingRef.current = isLoading;
    if (
      !shouldRestoreCaptureAfterPageLoad({
        currentUrl: browserState.url,
        hasSelection: Boolean(captureSelection),
        isLoading,
        mode,
        selectionUrl: captureSelection?.documentUrl,
        wasLoading,
      })
    )
      return;
    void restoreActiveCapture().catch((error: unknown) =>
      setNotice(error instanceof Error ? error.message : '无法恢复截图选区。'),
    );
  }, [
    browserState.loading,
    browserState.url,
    captureSelection,
    mode,
    restoreActiveCapture,
    setNotice,
  ]);

  useEffect(() => {
    let active = true;
    setDiagnosticAnnotations([]);
    if (!selectedProjectId) return () => undefined;
    void window.markfix
      .listDiagnosticAnnotations(selectedProjectId)
      .then((diagnostics) => {
        if (!active) return;
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
    void window.markfix.syncElementComments(renderedElementComments);
  }, [renderedElementComments]);

  const setMode = async (nextMode: BrowserMode): Promise<void> => {
    // Commit the native-view layout before the main process takes the entry snapshot.
    flushSync(() => {
      if (nextMode !== 'browse') setPreviewOpen(false);
      if (nextMode === 'comment') resetCaptureDraft();
      if (nextMode === 'capture') clearElementSelection();
      if (shouldCollapseSidebarForMode(nextMode)) setSidebarExpanded(false);
      modeRef.current = nextMode;
      setModeState(nextMode);
    });
    await window.markfix.setMode(nextMode);
  };

  const toggleMode = (nextMode: 'comment' | 'capture'): Promise<void> => {
    const destination = !previewOpen && mode === nextMode ? 'browse' : nextMode;
    if (destination === 'comment') clearElementSelection();
    if (destination === 'capture') beginCaptureMode();
    return setMode(destination);
  };

  const toggleDiagnostics = async (): Promise<void> => {
    await setDiagnosticsVisibility(!diagnosticsOpenRef.current);
  };

  const clearDiagnostics = async (scope: 'all' | 'console' | 'network'): Promise<void> => {
    try {
      await window.markfix.clearDiagnostics(scope);
      setDiagnosticEntries((entries) =>
        scope === 'all'
          ? []
          : entries.filter((entry) =>
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
      return;
    }
    if (mode === 'capture' && captureSelection) {
      setCaptureEvidence(add);
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
  const inlineSubmitting = useRef(false);
  const completeElementCommentWithGuide = async (note = elementCommentNote): Promise<void> => {
    if (inlineSubmitting.current) return;
    inlineSubmitting.current = true;
    try {
      if (await completeElementComment(note)) {
        dismissFirstAnnotationGuide('comment');
        await setMode('browse');
        setPreviewOpen(true);
      }
    } finally {
      inlineSubmitting.current = false;
    }
  };
  const completeCaptureWithGuide = async (note = captureNote): Promise<void> => {
    if (inlineSubmitting.current) return;
    inlineSubmitting.current = true;
    try {
      if (await completeCapture(note)) {
        dismissFirstAnnotationGuide('capture');
        await setMode('browse');
        setPreviewOpen(true);
      }
    } finally {
      inlineSubmitting.current = false;
    }
  };
  useEffect(() => {
    const selection =
      mode === 'comment' ? anchor : mode === 'capture' ? captureSelection : undefined;
    void window.markfix.syncInlineNote(
      selection && mode !== 'browse'
        ? {
            mode,
            anchor: selection,
            note: mode === 'comment' ? elementCommentNote : captureNote,
            ready:
              mode === 'comment' || Boolean(screenshot && !captureLoading && !captureRendering),
          }
        : null,
    );
  }, [
    mode,
    anchor,
    captureSelection,
    elementCommentNote,
    captureNote,
    screenshot,
    captureLoading,
    captureRendering,
  ]);
  useEffect(() =>
    window.markfix.onInlineNoteAction((payload) => {
      if (payload.mode !== mode || payload.documentUrl !== browserState.url) return;
      if (payload.action === 'change') {
        if (mode === 'comment') setElementCommentNote(payload.note);
        else setCaptureNote(payload.note);
      } else if (payload.action === 'submit') {
        void (mode === 'comment'
          ? completeElementCommentWithGuide(payload.note)
          : completeCaptureWithGuide(payload.note));
      } else {
        if (mode === 'comment') clearElementSelection();
        else void cancelCapture();
        void setMode('browse');
      }
    }),
  );

  const deleteDiagnosticAnnotation = async (id: string): Promise<void> => {
    await window.markfix.deleteDiagnosticAnnotation(id);
    setDiagnosticAnnotations((annotations) =>
      annotations.filter((annotation) => annotation.id !== id),
    );
  };

  const hasUnsavedDraft = (): boolean =>
    Boolean(elementCommentNote.trim() || captureNote.trim() || captureMarks.length > 0);

  const resetTransientDraft = async (): Promise<void> => {
    clearElementSelection();
    if (captureSelection) await cancelCapture();
    await setMode('browse');
  };

  const switchProject = async (project: WebsiteProject): Promise<boolean> => {
    if (selectedProjectId && selectedProjectId !== project.id && hasUnsavedDraft()) {
      const confirmed = await window.markfix.confirmDiscardDraft('switch-project');
      if (!confirmed) return false;
    }
    const requestId = ++projectSwitchRequestRef.current;
    const previousProjectId = selectedProjectIdRef.current;
    const previousActiveView = activeView;
    const previousUrl = url;
    const previousPageSessionId = pageSessionId;
    const changingProject = previousProjectId !== project.id;
    if (changingProject) {
      selectedProjectIdRef.current = project.id;
      setSelectedProjectId(project.id);
      setActiveView('workspace');
      setUrl(project.currentUrl);
      setPageSessionId(project.currentPageSessionId);
      setBrowserState((current) => ({
        ...current,
        url: project.currentUrl,
        loading: true,
        error: null,
        loadFailure: null,
      }));
    }
    try {
      const projectSwitch = window.markfix.switchWebsiteProject(project.id);
      if (changingProject) await resetTransientDraft();
      const current = await projectSwitch;
      if (requestId !== projectSwitchRequestRef.current) return false;
      setSelectedProjectId(project.id);
      selectedProjectIdRef.current = project.id;
      setActiveView('workspace');
      setUrl(current.currentUrl);
      setPageSessionId(current.currentPageSessionId);
      setWebsiteProjects((projects) =>
        projects.map((item) => (item.id === current.id ? current : item)),
      );
      window.localStorage.setItem(desktopPreferenceKeys.lastProjectId, project.id);
      return true;
    } catch (error) {
      if (requestId === projectSwitchRequestRef.current) {
        selectedProjectIdRef.current = previousProjectId;
        setSelectedProjectId(previousProjectId);
        setActiveView(previousActiveView);
        setUrl(previousUrl);
        setPageSessionId(previousPageSessionId);
        setBrowserState((current) => ({ ...current, url: previousUrl, loading: false }));
        setNotice(error instanceof Error ? error.message : '项目切换失败。');
      }
      return false;
    }
  };

  const deleteWebsiteProject = async (project: WebsiteProject): Promise<void> => {
    if (deletingProject) return;
    setDeletingProject(true);
    try {
      const result = await window.markfix.deleteWebsiteProject(project.id);
      if (!result.deleted) return;
      setPendingDeleteProject(undefined);
      projectSwitchRequestRef.current += 1;
      setWebsiteProjects((projects) => projects.filter(({ id }) => id !== project.id));
      setDiagnosticAnnotations((records) =>
        records.filter(({ projectId }) => projectId !== project.id),
      );
      if (selectedProjectIdRef.current === project.id) {
        selectedProjectIdRef.current = undefined;
        setSelectedProjectId(undefined);
        setPageSessionId(undefined);
        setUrl('');
        setActiveView('new');
        await resetTransientDraft();
      }
      setNotice(`已删除项目：${project.title}`);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : '项目删除失败。');
    } finally {
      setDeletingProject(false);
    }
  };

  const createWebsiteProject = async (
    input: string,
    storageMode: ProjectStorageMode,
    prefillInput = true,
  ): Promise<void> => {
    const hadUnsavedDraft = hasUnsavedDraft();
    if (hadUnsavedDraft && !(await window.markfix.confirmDiscardDraft('new-annotation'))) return;
    if (hadUnsavedDraft) await resetTransientDraft();
    setCreatingProject(true);
    if (prefillInput) setNewProjectInput(input);
    try {
      const result = await window.markfix.createWebsiteProject(storageMode, input);
      setWebsiteProjects((projects) => [
        result.project,
        ...projects.filter(({ id }) => id !== result.project.id),
      ]);
      if (!(await switchProject(result.project))) return;
      if (result.created) setNotice(`已创建项目：${result.project.title}`);
    } catch (error) {
      toast.error(projectErrorMessage(error));
    } finally {
      setCreatingProject(false);
    }
  };

  const openWebsiteShortcut = async (
    shortcutId: string,
    shortcutUrl: string,
    storageMode: ProjectStorageMode,
  ): Promise<void> => {
    const linkedProject = websiteProjects.find(({ id }) => id === shortcutId);
    if (linkedProject) {
      await switchProject(linkedProject);
      return;
    }
    let shortcutOrigin: string;
    try {
      shortcutOrigin = new URL(shortcutUrl).origin;
    } catch {
      toast.error('快捷方式的网址无效，请修改后重试。');
      return;
    }
    const matchingProjects = websiteProjects.filter(({ origin }) => origin === shortcutOrigin);
    const project =
      matchingProjects.find(({ storageMode: projectMode }) => projectMode === storageMode) ??
      matchingProjects[0];
    if (!project) {
      await createWebsiteProject(shortcutUrl, storageMode, false);
      return;
    }
    await switchProject(project);
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
    if (annotation.record.pageUrl !== browserState.url)
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
  };

  const editHistoricalAnnotation = async (annotation: ProjectAnnotation): Promise<void> => {
    if (hasUnsavedDraft()) {
      setPendingHistoricalAnnotation(annotation);
      return;
    }
    await restoreHistoricalAnnotation(annotation);
  };
  editHistoricalAnnotationRef.current = editHistoricalAnnotation;

  useEffect(() => {
    const handleShortcut = (event: KeyboardEvent): void => {
      if (document.querySelector('[data-desktop-update-active]')) return;
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
    setActiveView('new');
    requestAnimationFrame(() => document.getElementById('new-project-url')?.focus());
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
      updateAvailable={
        policy?.status === 'upgrade-recommended' || policy?.status === 'upgrade-required'
      }
      beforeUpdate={async () => {
        if (
          isSubmitting ||
          creatingProject ||
          deletingProject ||
          captureLoading ||
          captureRendering
        )
          throw new Error('当前操作尚未完成，请稍后更新。');
        const savedElement = elementComments.find(({ id }) => id === editingElementCommentId);
        const elementChanged = hasDesktopUpdateEdits(
          { note: elementCommentNote, evidence: elementEvidence },
          savedElement,
        );
        const savedCapture = savedCaptures.find(({ id }) => id === editingCaptureId);
        const captureChanged = hasDesktopUpdateEdits(
          { note: captureNote, marks: captureMarks, evidence: captureEvidence },
          savedCapture,
        );
        if (elementChanged && !(await completeElementComment()))
          throw new Error('当前元素批注未能保存，已停止更新以保留编辑内容。');
        if (captureChanged && !(await completeCapture()))
          throw new Error('当前截图批注未能保存，已停止更新以保留编辑内容。');
      }}
      expanded={sidebarExpanded || sidebarPeek}
      user={user}
      projects={websiteProjects}
      selectedProjectId={selectedProjectId}
      activeView={activeView}
      onNew={openNewAnnotation}
      onHistory={() => {
        void window.markfix
          .openAnnotationHistory()
          .catch((error: unknown) =>
            setNotice(error instanceof Error ? error.message : '无法打开历史标注窗口。'),
          );
      }}
      onProject={(project) => void switchProject(project)}
      onAgentProject={setAgentProject}
      onDeleteProject={setPendingDeleteProject}
      onOpenSettings={() => {
        void window.markfix
          .openSettings()
          .catch((error: unknown) =>
            setNotice(error instanceof Error ? error.message : '无法打开设置窗口。'),
          );
      }}
      onMenuOpenChange={setSidebarMenuOpen}
      onLogout={onLoggedOut}
    />
  );
  const headerNavigation = (
    <HeaderNavigationControls
      expanded={sidebarExpanded}
      onToggle={toggleSidebar}
      onPeek={showSidebarPeek}
      onEndPeek={endSidebarPeek}
      onNew={openNewAnnotation}
    />
  );
  const historyRestoreDialog = (
    <HistoryRestoreDialog
      annotation={pendingHistoricalAnnotation}
      onCancel={() => setPendingHistoricalAnnotation(undefined)}
      onConfirm={(annotation) => {
        setPendingHistoricalAnnotation(undefined);
        void (async () => {
          await resetTransientDraft();
          await restoreHistoricalAnnotation(annotation);
        })();
      }}
    />
  );

  const deleteProjectDialog = (
    <DeleteProjectDialog
      project={pendingDeleteProject}
      busy={deletingProject}
      onCancel={() => setPendingDeleteProject(undefined)}
      onConfirm={(project) => void deleteWebsiteProject(project)}
    />
  );

  const resizeLayout = (
    <WorkspaceResizeLayout
      key="workspace-resize-layout"
      leftWidth={sidebarExpanded ? sidebarWidth : 0}
      rightWidth={previewVisible ? rightPanelWidth : 0}
      workspaceVisible={activeView === 'workspace'}
      onLeftResize={(width, dragStartWidth) => {
        setSidebarExpanded(width > 0);
        if (width > 0) setSidebarWidth(width);
        else if (dragStartWidth) setSidebarWidth(dragStartWidth);
      }}
      onRightResize={(width, dragStartWidth) => {
        if (activeView !== 'workspace') return;
        if (width === 0) {
          if (dragStartWidth) setRightPanelWidth(dragStartWidth);
          setPreviewOpen(false);
        } else {
          setRightPanelWidth(width);
          setPreviewOpen(true);
        }
      }}
    />
  );
  const shellStyle = {
    '--annotation-panel-width': `${previewVisible ? annotationPanelWidth(rightPanelWidth, sidebarExpanded ? sidebarWidth : 0, viewportWidth) : 0}px`,
    '--sidebar-peek-width': `${sidebarWidth}px`,
    '--sidebar-width': `${sidebarExpanded ? sidebarWidth : 0}px`,
  } as CSSProperties;

  if (activeView === 'new') {
    return (
      <div
        style={shellStyle}
        className={`shell ${sidebarExpanded ? 'sidebar-expanded' : 'sidebar-collapsed'} ${sidebarPeek && !sidebarExpanded ? 'sidebar-peeking' : ''}`}
        onKeyDown={(event) => {
          if (event.key === 'Escape') {
            clearTimeout(peekTimer.current);
            setSidebarPeek(false);
          }
        }}
      >
        <div
          onMouseEnter={showSidebarPeek}
          onMouseLeave={endSidebarPeek}
          onFocus={showSidebarPeek}
          onBlur={endSidebarPeek}
        >
          {navigation}
        </div>
        {resizeLayout}
        <header className="navigation-header" />
        <div className="window-controls">{headerNavigation}</div>
        {historyRestoreDialog}
        {deleteProjectDialog}
        <ProjectAgentDialog project={agentProject} onClose={() => setAgentProject(undefined)} />
        <NewProjectPage
          localOnly={localMode}
          initialValue={newProjectInput}
          busy={creatingProject}
          projects={websiteProjects}
          onSubmit={(input, storageMode) => void createWebsiteProject(input, storageMode)}
          onShortcut={(shortcutId, shortcutUrl, storageMode) =>
            void openWebsiteShortcut(shortcutId, shortcutUrl, storageMode)
          }
        />
      </div>
    );
  }

  return (
    <div
      style={shellStyle}
      className={`shell ${sidebarExpanded ? 'sidebar-expanded' : 'sidebar-collapsed'} ${sidebarPeek && !sidebarExpanded ? 'sidebar-peeking' : ''}`}
      onKeyDown={(event) => {
        if (event.key === 'Escape') {
          clearTimeout(peekTimer.current);
          setSidebarPeek(false);
        }
      }}
    >
      <div
        onMouseEnter={showSidebarPeek}
        onMouseLeave={endSidebarPeek}
        onFocus={showSidebarPeek}
        onBlur={endSidebarPeek}
      >
        {navigation}
      </div>
      {resizeLayout}
      {historyRestoreDialog}
      {deleteProjectDialog}
      <ProjectAgentDialog project={agentProject} onClose={() => setAgentProject(undefined)} />
      <header className="browser-bar">
        <BrowserToolbar
          addressInputRef={addressInputRef}
          browserState={browserState}
          previewOpen={previewVisible}
          onTogglePreview={() => {
            void setMode('browse');
            setPreviewOpen((open) => !open);
          }}
          isSubmitting={isSubmitting}
          mode={mode}
          unsubmittedCount={unsubmittedCount}
          url={url}
          onError={setNotice}
          onOpenReview={() => void openCurrentProjectAnnotationReview()}
          onToggleMode={(nextMode) => void toggleMode(nextMode)}
          onUrlChange={setUrl}
        />
      </header>
      <div className="window-controls">{headerNavigation}</div>
      {selectedWebsiteProject && (browserState.loading || browserState.loadFailure) && (
        <ProjectLoadState
          browserState={browserState}
          project={selectedWebsiteProject}
          onChangeUrl={openNewAnnotation}
          onRetry={retryProjectLoad}
        />
      )}
      {previewVisible && (
        <aside className="comment-panel capture-panel" aria-label="批注预览">
          <div className="capture-panel-body annotation-preview-body">
            <AnnotationPreview
              annotations={currentPreviewAnnotations}
              onSelect={editHistoricalAnnotation}
              onDelete={async (annotation) => {
                if (annotation.type === 'capture') await deleteSavedCapture(annotation.record.id);
                else if (annotation.type === 'element')
                  await deleteElementComment(annotation.record.id);
                else await deleteDiagnosticAnnotation(annotation.record.id);
              }}
              copyCapture={copyCapture}
              saveCapture={saveCapture}
            />
          </div>
        </aside>
      )}
      {diagnosticsOpen && (
        <DiagnosticsPanel
          entries={diagnosticEntries}
          selectedEvidenceIds={selectedEvidenceIds}
          withSidebar={previewVisible}
          onClear={clearDiagnostics}
          onClose={() => void toggleDiagnostics()}
          onQuote={quoteDiagnostic}
        />
      )}
    </div>
  );
}
