import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { toast } from '@markfix/ui';
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
  type WorkspaceSummary,
} from '@markfix/contracts';
import { selectEditableProjectPageRecords } from '../page-records';
import { projectReportOverlays } from '../project-report-overlays';
import { latestReportRejections, rejectedRecordUpdates } from '../report-reconciliation';
import { DiagnosticsPanel } from '../DiagnosticsPanel';
import { CapturePanel } from './CapturePanel';
import { BrowserToolbar } from './BrowserToolbar';
import { ElementCommentPanel } from './ElementCommentPanel';
import { firstAnnotationGuideStep } from './FirstAnnotationGuide';
import { HistoryRestoreDialog } from './HistoryRestoreDialog';
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
import {
  HeaderNavigationControls,
  NewProjectPage,
  ProjectSidebar,
  projectAnnotations,
  type ProjectAnnotation,
} from '../ProjectNavigation';

const firstAnnotationGuideKeys = {
  comment: 'markfix:first-annotation-guide:comment:v1',
  capture: 'markfix:first-annotation-guide:capture:v1',
} as const;

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
    () =>
      !shouldCollapseSidebarForMode(
        browserModeFromSession(window.sessionStorage.getItem(browserModeSessionKey)),
      ) && window.localStorage.getItem('markfix:sidebar-expanded') !== 'false',
  );
  const [newProjectInput, setNewProjectInput] = useState('');
  const [newProjectError, setNewProjectError] = useState<string>();
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
  const [workspaces, setWorkspaces] = useState<WorkspaceSummary[]>([]);
  const [selectedWorkspaceId, setSelectedWorkspaceId] = useState<string>();
  const [selectedProjectId, setSelectedProjectId] = useState<string>();
  const {
    beginCaptureMode,
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
    updateCaptureText,
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
    const restoreMode = async (): Promise<void> => {
      if (modeRef.current === 'capture') await window.markfix.clearCaptureSelection();
      await window.markfix.setMode(modeRef.current);
    };
    void restoreMode().catch((error: unknown) =>
      setNotice(error instanceof Error ? error.message : '无法恢复标注模式。'),
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
  const pageCaptures = useMemo(
    () => selectEditableProjectPageRecords(savedCaptures, selectedProjectId, pageSessionId),
    [pageSessionId, savedCaptures, selectedProjectId],
  );
  const pageElementComments = useMemo(
    () => selectEditableProjectPageRecords(elementComments, selectedProjectId, pageSessionId),
    [elementComments, pageSessionId, selectedProjectId],
  );
  const pageDiagnosticAnnotations = useMemo(
    () => selectEditableProjectPageRecords(diagnosticAnnotations, selectedProjectId, pageSessionId),
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
        if (destination === 'comment') clearElementSelection();
        else if (destination === 'capture') {
          beginCaptureMode();
        }
        if (shouldCollapseSidebarForMode(destination)) setSidebarExpanded(false);
        modeRef.current = destination;
        setModeState(destination);
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
      .then(async ({ workspaces: workspaceItems, websiteProjects: projects }) => {
        if (!active) return;
        setWorkspaces(workspaceItems);
        setWebsiteProjects(projects);
        const selected =
          projects.find(({ id }) => id === selectedProjectIdRef.current) ?? projects[0];
        if (!selected) return;
        selectedProjectIdRef.current = selected.id;
        setSelectedProjectId(selected.id);
        if (selected.storageMode === 'CLOUD') setSelectedWorkspaceId(selected.workspaceId);
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
          setNewProjectError(error instanceof Error ? error.message : '无法读取项目。');
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

  useEffect(() => {
    window.localStorage.setItem('markfix:sidebar-expanded', String(sidebarExpanded));
    void window.markfix.setWorkspaceLayout(sidebarExpanded ? 228 : 0, activeView === 'workspace');
  }, [activeView, sidebarExpanded]);

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
    if (workspaces.length === 0) return;
    if (workspaces.some(({ id }) => id === selectedWorkspaceId)) return;
    setSelectedWorkspaceId(workspaces[0]?.id);
  }, [selectedWorkspaceId, workspaces]);

  useEffect(() => {
    void window.markfix.syncElementComments(renderedElementComments);
  }, [renderedElementComments]);

  const setMode = async (nextMode: BrowserMode): Promise<void> => {
    if (shouldCollapseSidebarForMode(nextMode)) setSidebarExpanded(false);
    modeRef.current = nextMode;
    setModeState(nextMode);
    await window.markfix.setMode(nextMode);
  };

  const toggleMode = (nextMode: 'comment' | 'capture'): Promise<void> => {
    const destination = mode === nextMode ? 'browse' : nextMode;
    if (destination === 'comment') clearElementSelection();
    if (destination === 'capture') beginCaptureMode();
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
  const diagnosticErrorCount = diagnosticEntries.filter(({ level }) => level === 'error').length;
  const commentGuideStep = firstAnnotationGuideStep({
    active: mode === 'comment',
    editing: Boolean(editingElementCommentId),
    enabled: firstAnnotationGuides.comment,
    hasDescription: Boolean(elementCommentNote.trim()),
    hasSelection: Boolean(anchor),
  });
  const captureGuideStep = firstAnnotationGuideStep({
    active: mode === 'capture',
    editing: Boolean(editingCaptureId),
    enabled: firstAnnotationGuides.capture,
    hasDescription: Boolean(captureNote.trim()),
    hasSelection: Boolean(captureSelection),
  });
  const completeElementCommentWithGuide = async (): Promise<void> => {
    if ((await completeElementComment()) && commentGuideStep)
      dismissFirstAnnotationGuide('comment');
  };
  const completeCaptureWithGuide = async (): Promise<void> => {
    if ((await completeCapture()) && captureGuideStep) dismissFirstAnnotationGuide('capture');
  };

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
    const previousWorkspaceId = selectedWorkspaceId;
    const previousActiveView = activeView;
    const previousUrl = url;
    const previousPageSessionId = pageSessionId;
    const changingProject = previousProjectId !== project.id;
    setNewProjectError(undefined);
    if (changingProject) {
      selectedProjectIdRef.current = project.id;
      setSelectedProjectId(project.id);
      if (project.storageMode === 'CLOUD') setSelectedWorkspaceId(project.workspaceId);
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
      if (project.storageMode === 'CLOUD') setSelectedWorkspaceId(project.workspaceId);
      setActiveView('workspace');
      setUrl(current.currentUrl);
      setPageSessionId(current.currentPageSessionId);
      setWebsiteProjects((projects) =>
        projects.map((item) => (item.id === current.id ? current : item)),
      );
      return true;
    } catch (error) {
      if (requestId === projectSwitchRequestRef.current) {
        selectedProjectIdRef.current = previousProjectId;
        setSelectedProjectId(previousProjectId);
        setSelectedWorkspaceId(previousWorkspaceId);
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
    try {
      const result = await window.markfix.deleteWebsiteProject(project.id);
      if (!result.deleted) return;
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
      if (project.storageMode === 'CLOUD')
        void window.markfix
          .listWorkspaces()
          .then(setWorkspaces)
          .catch(() => undefined);
      setNotice(`已删除项目：${project.title}`);
    } catch (error) {
      setNotice(error instanceof Error ? error.message : '项目删除失败。');
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
    const workspaceId = selectedWorkspaceId ?? workspaces[0]?.id;
    if (storageMode === 'CLOUD' && !workspaceId) {
      setNewProjectError('当前账号没有可用工作区，请先在管理端创建工作区。');
      return;
    }
    setCreatingProject(true);
    setNewProjectError(undefined);
    if (prefillInput) setNewProjectInput(input);
    try {
      const result = await window.markfix.createWebsiteProject(storageMode, workspaceId, input);
      setWebsiteProjects((projects) => [
        result.project,
        ...projects.filter(({ id }) => id !== result.project.id),
      ]);
      if (result.project.storageMode === 'CLOUD') {
        const cloudProject = result.project;
        setWorkspaces((items) =>
          items.map((workspace) =>
            workspace.id !== cloudProject.workspaceId ||
            workspace.projects.some(({ id }) => id === cloudProject.id)
              ? workspace
              : {
                  ...workspace,
                  projects: [
                    ...workspace.projects,
                    {
                      id: cloudProject.id,
                      workspaceId: cloudProject.workspaceId,
                      name: cloudProject.title,
                      baseUrl: cloudProject.origin,
                      createdAt: cloudProject.createdAt,
                      updatedAt: cloudProject.updatedAt,
                    },
                  ],
                },
          ),
        );
      }
      if (!(await switchProject(result.project))) return;
      if (result.created) setNotice(`已创建项目：${result.project.title}`);
    } catch (error) {
      setNewProjectError(
        error instanceof Error ? error.message : '网站加载或解析失败，请检查地址后重试。',
      );
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
      setNewProjectError('快捷方式的网址无效，请修改后重试。');
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
          onSubmit={(input, storageMode) => void createWebsiteProject(input, storageMode)}
          onShortcut={(shortcutId, shortcutUrl, storageMode) =>
            void openWebsiteShortcut(shortcutId, shortcutUrl, storageMode)
          }
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
        <BrowserToolbar
          addressInputRef={addressInputRef}
          browserState={browserState}
          diagnosticErrorCount={diagnosticErrorCount}
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
      {selectedWebsiteProject && (browserState.loading || browserState.loadFailure) && (
        <ProjectLoadState
          browserState={browserState}
          project={selectedWebsiteProject}
          onChangeUrl={openNewAnnotation}
          onRetry={retryProjectLoad}
        />
      )}
      {mode === 'capture' ? (
        <CapturePanel
          pageCaptures={pageCaptures}
          captureSelection={captureSelection}
          captureLoading={captureLoading}
          screenshot={screenshot}
          captureMarks={captureMarks}
          captureNote={captureNote}
          captureEvidence={captureEvidence}
          captureRendering={captureRendering}
          editingCaptureId={editingCaptureId}
          setCaptureNote={setCaptureNote}
          setCaptureEvidence={setCaptureEvidence}
          updateCaptureText={updateCaptureText}
          cancelCapture={cancelCapture}
          completeCapture={completeCaptureWithGuide}
          deleteSavedCapture={deleteSavedCapture}
          selectSavedCapture={selectSavedCapture}
          copyCapture={copyCapture}
          saveCapture={saveCapture}
          guideStep={captureGuideStep}
          dismissGuide={() => dismissFirstAnnotationGuide('capture')}
        />
      ) : mode === 'comment' ? (
        <ElementCommentPanel
          anchor={anchor}
          editingElementCommentId={editingElementCommentId}
          elementCommentNote={elementCommentNote}
          elementEvidence={elementEvidence}
          pageElementComments={pageElementComments}
          pageDiagnosticAnnotations={pageDiagnosticAnnotations}
          setElementCommentNote={setElementCommentNote}
          setElementEvidence={setElementEvidence}
          clearElementSelection={clearElementSelection}
          completeElementComment={completeElementCommentWithGuide}
          deleteDiagnosticAnnotation={deleteDiagnosticAnnotation}
          deleteElementComment={deleteElementComment}
          selectElementComment={selectElementComment}
          guideStep={commentGuideStep}
          dismissGuide={() => dismissFirstAnnotationGuide('comment')}
        />
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
