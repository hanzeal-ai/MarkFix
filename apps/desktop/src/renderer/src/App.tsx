import { useCallback, useEffect, useRef, useState, type FormEvent } from 'react';
import {
  ArrowLeft,
  ArrowRight,
  Camera,
  Check,
  ChevronDown,
  ChevronUp,
  Copy,
  Crosshair,
  Download,
  Eye,
  EyeOff,
  LoaderCircle,
  MessageSquareText,
  MousePointer2,
  MoveUpRight,
  PenLine,
  Redo2,
  RefreshCw,
  Save,
  Send,
  Sparkles,
  Square,
  Trash2,
  Type,
  Undo2,
  X,
} from 'lucide-react';
import {
  anchorSchema,
  annotationSchema,
  recorderEventSchema,
  screenshotMarkSchema,
  type Anchor,
  type Annotation,
  type AnnotationTool,
  type BrowserMode,
  type ClientPolicy,
  type CaptureContext,
  type Environment,
  type ReproductionStep,
  type SavedCapture,
  type SavedElementComment,
  type ScreenshotMark,
  type WorkspaceSummary,
} from '@markfix/contracts';
import { describeTrustedEvent, mergeAdjacentInputSteps } from '@markfix/reproduction-model';
import { composeScreenshot } from './screenshot-compositor';
import { selectPageRecords } from './page-records';

type Draft = {
  title: string;
  description: string;
  url: string;
  anchor: Anchor | undefined;
  annotations: Annotation[];
  reproduction: ReproductionStep[];
  workspaceId?: string;
  projectId?: string;
  environmentId?: string;
  pendingOutboxId?: string;
};
type BrowserState = { url?: string; loading?: boolean; error?: string };
type DesktopUser = { id: string; email: string; displayName: string };
type CaptureSelection = Extract<Anchor, { kind: 'region' }>;
type CaptureSource = { dataUrl: string; captureScale: number };
const annotationName = (annotation: Annotation): string => {
  if (annotation.type === 'pin') return `Pin ${annotation.label}`;
  if (annotation.type === 'text') return annotation.text;
  if (annotation.type === 'pen') return 'Freehand mark';
  return annotation.type === 'arrow' ? 'Arrow' : 'Rectangle';
};

const elementAnchorsEqual = (
  left: Extract<Anchor, { kind: 'element' }>,
  right: Extract<Anchor, { kind: 'element' }>,
): boolean => {
  if (left.documentUrl !== right.documentUrl) return false;
  if (JSON.stringify(left.framePath) !== JSON.stringify(right.framePath)) return false;
  if (left.cssSelector !== right.cssSelector) return false;
  const selectorIsOnlyTag = /^[a-z][a-z0-9-]*$/i.test(left.cssSelector);
  return !selectorIsOnlyTag || left.textQuote === right.textQuote;
};

function DesktopLogin({ onAuthenticated }: { onAuthenticated: (user: DesktopUser) => void }) {
  const [email, setEmail] = useState('admin');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setBusy(true);
    setError('');
    try {
      onAuthenticated(await window.markfix.login(email, password));
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Sign in failed');
    } finally {
      setBusy(false);
    }
  };

  return (
    <main className="desktop-auth">
      <section>
        <div className="desktop-auth-brand">
          <span>m</span> MarkFix
        </div>
        <p className="eyebrow">DESKTOP ANNOTATION</p>
        <h1>Sign in to start marking</h1>
        <p>Your refresh credential stays encrypted in the operating system vault.</p>
        <form onSubmit={(event) => void submit(event)}>
          <label>
            Username
            <input
              type="text"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              required
            />
          </label>
          <label>
            Password
            <span className="password-field">
              <input
                type={showPassword ? 'text' : 'password'}
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                required
              />
              <button
                className="password-toggle"
                type="button"
                aria-label={showPassword ? 'Hide password' : 'Show password'}
                title={showPassword ? 'Hide password' : 'Show password'}
                onClick={() => setShowPassword((visible) => !visible)}
              >
                {showPassword ? <EyeOff size={17} /> : <Eye size={17} />}
              </button>
            </span>
          </label>
          {error && <div className="auth-error">{error}</div>}
          <button type="submit" disabled={busy}>
            {busy ? 'Signing in…' : 'Sign in'}
          </button>
        </form>
      </section>
    </main>
  );
}

function AnnotationWorkspace({ policy }: { policy: ClientPolicy | undefined }) {
  const [url, setUrl] = useState('https://example.com');
  const [browserState, setBrowserState] = useState<BrowserState>({ loading: true });
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
  const [savedCaptures, setSavedCaptures] = useState<SavedCapture[]>([]);
  const [editingCaptureId, setEditingCaptureId] = useState<string>();
  const [elementComments, setElementComments] = useState<SavedElementComment[]>([]);
  const [elementCommentNote, setElementCommentNote] = useState('');
  const [editingElementCommentId, setEditingElementCommentId] = useState<string>();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [notice, setNotice] = useState<string | undefined>(
    policy?.status === 'upgrade-recommended'
      ? `MarkFix ${policy.recommendedVersion} is available. Update when convenient.`
      : undefined,
  );
  const [pendingOutboxId, setPendingOutboxId] = useState<string>();
  const [workspaces, setWorkspaces] = useState<WorkspaceSummary[]>([]);
  const [environments, setEnvironments] = useState<Environment[]>([]);
  const [selectedWorkspaceId, setSelectedWorkspaceId] = useState<string>();
  const [selectedProjectId, setSelectedProjectId] = useState<string>();
  const [selectedEnvironmentId, setSelectedEnvironmentId] = useState<string>();
  const [contextLoading, setContextLoading] = useState(true);
  const pendingOutboxIdRef = useRef<string | undefined>(undefined);
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
  screenshotRef.current = screenshot;
  elementCommentsRef.current = elementComments;
  const selectedWorkspace = workspaces.find(({ id }) => id === selectedWorkspaceId);
  const selectedProject = selectedWorkspace?.projects.find(({ id }) => id === selectedProjectId);
  const selectedEnvironment = environments.find(({ id }) => id === selectedEnvironmentId);
  const pageCaptures = selectPageRecords(savedCaptures, url);
  const pageElementComments = selectPageRecords(elementComments, url);

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
        setBrowserState(state);
        if (state.url) setUrl(state.url);
        if (state.error) setNotice(state.error);
      }),
      window.markfix.onModeShortcut((payload) => {
        if (payload !== 'capture' && payload !== 'comment') return;
        if (payload === 'comment') {
          setAnchor(undefined);
          setElementCommentNote('');
          setEditingElementCommentId(undefined);
        } else {
          captureRequestIdRef.current = undefined;
          captureRestoreRef.current = undefined;
          setCaptureSelection(undefined);
          setCaptureSource(undefined);
          setCaptureMarks([]);
          setCaptureNote('');
          setEditingCaptureId(undefined);
          setScreenshot(undefined);
          void window.markfix.setCaptureTool('select');
        }
        setModeState(payload);
        setNotice(
          payload === 'capture'
            ? 'Drag over the area you want to capture.'
            : 'Hover and click an element on the page.',
        );
        void window.markfix.setMode(payload);
      }),
      window.markfix.onSelection((payload) => {
        const parsed = anchorSchema.safeParse(payload);
        if (!parsed.success || parsed.data.kind !== 'element') return;
        const nextAnchor = parsed.data;
        const existing = elementCommentsRef.current.find(({ anchor: savedAnchor }) =>
          elementAnchorsEqual(savedAnchor, nextAnchor),
        );
        setAnchor(nextAnchor);
        setEditingElementCommentId(existing?.id);
        setElementCommentNote(existing?.note ?? '');
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
          setCaptureSource({
            dataUrl: restore.capture.sourceDataUrl ?? restore.capture.dataUrl,
            captureScale: restore.capture.captureScale ?? 1,
          });
          setScreenshot(restore.capture.dataUrl);
          setCaptureLoading(false);
          return;
        }
        setCaptureSelection(parsed.data);
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
        const status = payload as { status?: unknown; outboxId?: unknown; message?: unknown };
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
          elementCommentIds?: unknown;
          captureIds?: unknown;
        };
        const elementCommentIds = Array.isArray(counts.elementCommentIds)
          ? counts.elementCommentIds.filter((id): id is string => typeof id === 'string')
          : [];
        const captureIds = Array.isArray(counts.captureIds)
          ? counts.captureIds.filter((id): id is string => typeof id === 'string')
          : [];
        setElementComments((comments) =>
          comments.filter(({ id }) => !elementCommentIds.includes(id)),
        );
        setSavedCaptures((captures) => captures.filter(({ id }) => !captureIds.includes(id)));
        captureRequestIdRef.current = undefined;
        captureRestoreRef.current = undefined;
        setAnchor(undefined);
        setElementCommentNote('');
        setEditingElementCommentId(undefined);
        setCaptureSelection(undefined);
        setCaptureSource(undefined);
        setCaptureMarks([]);
        setCaptureNote('');
        setEditingCaptureId(undefined);
        setScreenshot(undefined);
        void window.markfix.clearCaptureSelection();
        void window.markfix.setCaptureTool('select');
        setNotice(
          `已保存 ${Number(counts.elementCommentCount ?? 0)} 条批注和 ${Number(counts.captureCount ?? 0)} 张截图。`,
        );
      }),
    ];
    void window.markfix.loadDraft().then((payload) => {
      const draft = payload as Draft | undefined;
      if (!draft) return;
      setTitle(draft.title);
      setDescription(draft.description);
      setUrl(draft.url);
      setAnchor(draft.anchor);
      setAnnotations(draft.annotations ?? []);
      setReproduction(draft.reproduction ?? []);
      setSelectedWorkspaceId(draft.workspaceId);
      setSelectedProjectId(draft.projectId);
      setSelectedEnvironmentId(draft.environmentId);
      setPendingOutboxId(draft.pendingOutboxId);
      pendingOutboxIdRef.current = draft.pendingOutboxId;
      if (draft.pendingOutboxId) {
        void window.markfix.loadSyncStatus(draft.pendingOutboxId).then((status) => {
          if (status?.status === 'COMPLETED' && clearReport(draft.pendingOutboxId))
            setNotice('Queued report synchronized successfully.');
        });
      }
      if (draft.url) void window.markfix.navigate(draft.url);
      setNotice('Restored your local draft.');
    });
    return () => cleanups.forEach((cleanup) => cleanup());
  }, [clearReport]);

  useEffect(() => {
    let active = true;
    void Promise.all([window.markfix.listCaptureRecords(), window.markfix.listElementComments()])
      .then(([captures, comments]) => {
        if (!active) return;
        setSavedCaptures(captures);
        setElementComments(comments);
      })
      .catch((error: unknown) => {
        if (active) setNotice(error instanceof Error ? error.message : '无法读取本机批注。');
      });
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    let active = true;
    setContextLoading(true);
    void window.markfix
      .listWorkspaces()
      .then((items) => {
        if (active) setWorkspaces(items);
      })
      .catch((error: unknown) => {
        if (active)
          setNotice(error instanceof Error ? error.message : 'Could not load report destinations.');
      })
      .finally(() => {
        if (active) setContextLoading(false);
      });
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    if (workspaces.length === 0) return;
    if (workspaces.some(({ id }) => id === selectedWorkspaceId)) return;
    setSelectedWorkspaceId(workspaces[0]?.id);
  }, [selectedWorkspaceId, workspaces]);

  useEffect(() => {
    if (!selectedWorkspace) return;
    if (selectedWorkspace.projects.some(({ id }) => id === selectedProjectId)) return;
    setSelectedProjectId(selectedWorkspace.projects[0]?.id);
    setSelectedEnvironmentId(undefined);
  }, [selectedProjectId, selectedWorkspace]);

  useEffect(() => {
    let active = true;
    if (!selectedProjectId) {
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
  }, [selectedProjectId]);

  useEffect(() => {
    void window.markfix.syncAnnotations(annotations);
    setSelectedAnnotationId((current) =>
      current && annotations.some(({ id }) => id === current) ? current : undefined,
    );
  }, [annotations]);

  useEffect(() => {
    if (selectedAnnotationId) void window.markfix.focusAnnotation(selectedAnnotationId);
  }, [selectedAnnotationId]);

  useEffect(() => {
    void window.markfix.syncAnchor(mode === 'comment' ? (anchor ?? null) : null);
  }, [anchor, mode]);

  useEffect(() => {
    void window.markfix.syncElementComments(elementComments);
  }, [elementComments]);

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
        } satisfies Draft);
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
      setEditingElementCommentId(undefined);
    }
    if (destination === 'capture') {
      captureRequestIdRef.current = undefined;
      setCaptureSelection(undefined);
      setCaptureSource(undefined);
      setCaptureMarks([]);
      setCaptureNote('');
      setEditingCaptureId(undefined);
      setScreenshot(undefined);
      void window.markfix.setCaptureTool('select');
    }
    return setMode(destination);
  };

  const openAnnotationSave = async (): Promise<void> => {
    try {
      await window.markfix.openAnnotationReview();
    } catch (error) {
      setNotice(error instanceof Error ? error.message : '无法打开标注确认窗口。');
    }
  };

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
    if (!captureSelection || !screenshot || !captureNote.trim() || captureRendering) return;
    const existing = savedCaptures.find(({ id }) => id === editingCaptureId);
    const now = new Date().toISOString();
    const capture: SavedCapture = {
      id: existing?.id ?? crypto.randomUUID(),
      pageUrl: captureSelection.documentUrl,
      note: captureNote.trim(),
      dataUrl: screenshot,
      widthCssPx: captureSelection.widthCssPx,
      heightCssPx: captureSelection.heightCssPx,
      marks: captureMarks,
      selection: captureSelection,
      ...(captureSource ? { sourceDataUrl: captureSource.dataUrl } : {}),
      ...(captureSource ? { captureScale: captureSource.captureScale } : {}),
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
    setCaptureMarks([]);
    setEditingCaptureId(undefined);
    await window.markfix.clearCaptureSelection();
    await window.markfix.setCaptureTool('select');
    setNotice('截图批注已保存到本机。');
  };

  const cancelCapture = async (): Promise<void> => {
    setCaptureNote('');
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
    const selection: CaptureSelection = capture.selection ?? {
      kind: 'region',
      xCssPx: 24,
      yCssPx: 24,
      widthCssPx: capture.widthCssPx,
      heightCssPx: capture.heightCssPx,
      documentUrl: capture.pageUrl,
    };
    const marks = capture.sourceDataUrl ? capture.marks : [];
    captureRestoreRef.current = { capture, selection, marks };
    setEditingCaptureId(capture.id);
    setCaptureNote(capture.note);
    setScreenshot(capture.dataUrl);
    await window.markfix.restoreCaptureSelection(selection, marks);
    window.requestAnimationFrame(() => {
      document.querySelector<HTMLTextAreaElement>('[data-capture-note]')?.focus();
    });
  };

  const clearElementSelection = (): void => {
    setAnchor(undefined);
    setElementCommentNote('');
    setEditingElementCommentId(undefined);
  };

  const completeElementComment = async (): Promise<void> => {
    if (anchor?.kind !== 'element' || !elementCommentNote.trim()) return;
    const now = new Date().toISOString();
    const existing = elementComments.find(
      (comment) =>
        comment.id === editingElementCommentId || elementAnchorsEqual(comment.anchor, anchor),
    );
    const comment: SavedElementComment = {
      id: existing?.id ?? crypto.randomUUID(),
      pageUrl: anchor.documentUrl,
      anchor,
      note: elementCommentNote.trim(),
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
      })) as { disposition: 'submitted' | 'queued'; outboxId?: string };
      if (result.disposition === 'queued' && result.outboxId) {
        pendingOutboxIdRef.current = result.outboxId;
        setPendingOutboxId(result.outboxId);
        setNotice('Saved to the local outbox. MarkFix will retry automatically.');
        const status = await window.markfix.loadSyncStatus(result.outboxId);
        if (status?.status === 'COMPLETED' && clearReport(result.outboxId))
          setNotice('Queued report synchronized successfully.');
        return;
      }
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
    if (!notice) return;
    const timer = window.setTimeout(() => setNotice(undefined), 2400);
    return () => window.clearTimeout(timer);
  }, [notice]);

  useEffect(() => {
    const handleShortcut = (event: KeyboardEvent): void => {
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

  return (
    <div className="shell">
      <header className="browser-bar">
        <div className="traffic-space" />
        <div className="brand">
          <span>
            <MessageSquareText />
          </span>
          <strong>MarkFix</strong>
        </div>
        <div className="prototype-browser-bar">
          <div className="nav-buttons">
            <button aria-label="后退" title="后退" onClick={() => void window.markfix.back()}>
              <ArrowLeft />
            </button>
            <button aria-label="前进" title="前进" onClick={() => void window.markfix.forward()}>
              <ArrowRight />
            </button>
            <button aria-label="刷新" title="刷新" onClick={() => void window.markfix.reload()}>
              <RefreshCw className={browserState.loading ? 'spin' : ''} />
            </button>
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
            <input value={url} onChange={(event) => setUrl(event.target.value)} />
          </form>
        </div>
        <div className="tools">
          <span className="mode-status">
            {mode === 'browse' ? '浏览模式' : mode === 'comment' ? '批注模式' : '截图模式'}
          </span>
          <button
            className={mode === 'comment' ? 'active' : ''}
            aria-pressed={mode === 'comment'}
            aria-keyshortcuts="Alt+W"
            title="批注（⌥W）"
            onClick={() => void toggleMode('comment')}
          >
            <MessageSquareText /> 批注
          </button>
          <button
            className={mode === 'capture' ? 'active' : ''}
            aria-pressed={mode === 'capture'}
            aria-keyshortcuts="Alt+A"
            title="截图（⌥A）"
            onClick={() => void toggleMode('capture')}
          >
            <Camera /> 截图
          </button>
          <button className="save-annotations-button" onClick={() => void openAnnotationSave()}>
            <Save /> 保存标注
          </button>
        </div>
      </header>
      {notice && (
        <div className="app-toast" role="status">
          <Check /> {notice}
        </div>
      )}
      {mode === 'capture' ? (
        <aside className="comment-panel capture-panel">
          <div className="capture-panel-header">
            <span>截图批注</span>
            <small>{pageCaptures.length} 张</small>
          </div>
          <div className="capture-panel-body">
            {captureSelection && (
              <section className="capture-selection-card">
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
                        <label key={mark.id}>
                          文字 {index + 1}
                          <input
                            value={mark.text}
                            maxLength={200}
                            onChange={(event) => updateCaptureText(mark.id, event.target.value)}
                          />
                        </label>
                      ) : null,
                    )}
                  </div>
                )}
                <textarea
                  className="capture-note-input"
                  data-capture-note
                  value={captureNote}
                  maxLength={2000}
                  placeholder="说明截图中的问题…"
                  onChange={(event) => setCaptureNote(event.target.value)}
                />
                <div className="capture-draft-actions">
                  <button
                    type="button"
                    aria-label="取消截图"
                    title="取消截图"
                    onClick={() => void cancelCapture()}
                  >
                    <X />
                  </button>
                  <button
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
                  </button>
                </div>
              </section>
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
                        <button
                          type="button"
                          title="删除"
                          onClick={() => void deleteSavedCapture(item.id)}
                        >
                          <Trash2 />
                        </button>
                      </span>
                    </div>
                    <button
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
                        <span>{item.marks.length} 个标记</span>
                      </div>
                      <p>{item.note}</p>
                    </button>
                    <div className="capture-note-actions">
                      <button type="button" onClick={() => void copyCapture(item.dataUrl)}>
                        <Copy /> 复制
                      </button>
                      <button type="button" onClick={() => void saveCapture(item.dataUrl)}>
                        <Download /> 保存
                      </button>
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
            <span>元素批注</span>
            <small>{pageElementComments.length} 条</small>
          </div>
          <div className="capture-panel-body">
            {anchor?.kind === 'element' && (
              <section className="element-selection-card">
                <div className="element-selection-kicker">
                  <MousePointer2 />
                  <strong>{editingElementCommentId ? '编辑已有批注' : '已选择元素'}</strong>
                </div>
                <code>{anchor.cssSelector}</code>
                <div className="element-preview">{anchor.textQuote || `<${anchor.tagName}>`}</div>
                <textarea
                  data-element-comment-note
                  value={elementCommentNote}
                  maxLength={2000}
                  placeholder="描述这里需要修改什么…"
                  onChange={(event) => setElementCommentNote(event.target.value)}
                />
                <div className="capture-draft-actions">
                  <button
                    type="button"
                    aria-label="取消批注"
                    title="取消批注"
                    onClick={clearElementSelection}
                  >
                    <X />
                  </button>
                  <button
                    type="button"
                    className="primary"
                    aria-label={editingElementCommentId ? '保存批注修改' : '完成批注'}
                    title={editingElementCommentId ? '保存批注修改' : '完成批注'}
                    disabled={!elementCommentNote.trim()}
                    onClick={() => void completeElementComment()}
                  >
                    <Check />
                  </button>
                </div>
              </section>
            )}
            {!anchor && pageElementComments.length === 0 && (
              <section className="capture-empty element-comment-empty">
                <span className="capture-empty-icon">
                  <MousePointer2 />
                </span>
                <strong>选择页面中的元素</strong>
                <p>点击页面中的任意元素添加批注，批注会保留元素位置和页面上下文。</p>
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
                        <button
                          type="button"
                          title="删除"
                          onClick={() => void deleteElementComment(item.id)}
                        >
                          <Trash2 />
                        </button>
                      </span>
                    </div>
                    <button
                      type="button"
                      className="element-note-select"
                      onClick={() => selectElementComment(item)}
                    >
                      <code>{item.anchor.cssSelector}</code>
                      <p>{item.note}</p>
                    </button>
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
              <label>
                <span>Workspace</span>
                <select
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
                </select>
              </label>
              <label>
                <span>Project</span>
                <select
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
                </select>
              </label>
            </div>
            <label>
              <span>Environment</span>
              <select
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
              </select>
            </label>
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
              <button
                className={activeTool === 'pin' && mode === 'draw' ? 'active' : ''}
                title="Pin"
                onClick={() => void beginAnnotation('pin')}
              >
                <Crosshair />
              </button>
              <button
                className={activeTool === 'rectangle' && mode === 'draw' ? 'active' : ''}
                title="Rectangle"
                onClick={() => void beginAnnotation('rectangle')}
              >
                <Square />
              </button>
              <button
                className={activeTool === 'arrow' && mode === 'draw' ? 'active' : ''}
                title="Arrow"
                onClick={() => void beginAnnotation('arrow')}
              >
                <MoveUpRight />
              </button>
              <button
                className={activeTool === 'text' && mode === 'draw' ? 'active' : ''}
                title="Text"
                onClick={() => void beginAnnotation('text')}
              >
                <Type />
              </button>
              <button
                className={activeTool === 'pen' && mode === 'draw' ? 'active' : ''}
                title="Pen"
                onClick={() => void beginAnnotation('pen')}
              >
                <PenLine />
              </button>
            </div>
            <div className="history-tools">
              <button title="Undo" disabled={annotations.length === 0} onClick={undo}>
                <Undo2 />
              </button>
              <button title="Redo" disabled={redoStack.length === 0} onClick={redo}>
                <Redo2 />
              </button>
            </div>
            <span>{annotations.length}</span>
          </section>
          {annotations.length > 0 && (
            <section className="annotation-list" aria-label="Annotations">
              {annotations.map((annotation, index) => (
                <button
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
                </button>
              ))}
            </section>
          )}
          <label className="field">
            <span>Title</span>
            <input
              value={title}
              maxLength={200}
              onChange={(event) => setTitle(event.target.value)}
              placeholder="What needs fixing?"
            />
          </label>
          <label className="field grow">
            <span>Comment</span>
            <textarea
              value={description}
              maxLength={20000}
              onChange={(event) => setDescription(event.target.value)}
              placeholder="Describe what you expected and what happened…"
            />
          </label>
          {screenshot && (
            <div className="thumbnail">
              <img src={screenshot} alt="Latest capture" />
              <span>Latest capture</span>
            </div>
          )}
          <section className="steps">
            <div className="steps-heading">
              <strong>Reproduction trail</strong>
              <button type="button" onClick={addManualStep}>
                + Manual
              </button>
            </div>
            {reproduction.length === 0 ? (
              <span className="steps-empty">Record page actions or add a manual step.</span>
            ) : (
              <ol>
                {reproduction.map((step, index) => (
                  <li key={step.id}>
                    <span className="step-number">{index + 1}</span>
                    <input
                      value={step.description}
                      maxLength={2000}
                      aria-label={`Step ${index + 1}`}
                      onChange={(event) => updateStep(step.id, event.target.value)}
                    />
                    <div className="step-actions">
                      <button
                        type="button"
                        title="Move up"
                        disabled={index === 0}
                        onClick={() => moveStep(index, -1)}
                      >
                        <ChevronUp />
                      </button>
                      <button
                        type="button"
                        title="Move down"
                        disabled={index === reproduction.length - 1}
                        onClick={() => moveStep(index, 1)}
                      >
                        <ChevronDown />
                      </button>
                      <button
                        type="button"
                        title="Delete step"
                        onClick={() =>
                          setReproduction((steps) => steps.filter(({ id }) => id !== step.id))
                        }
                      >
                        <Trash2 />
                      </button>
                    </div>
                  </li>
                ))}
              </ol>
            )}
          </section>
          {notice && <div className="notice">{notice}</div>}
          <button
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
          </button>
          <p className="draft-state">Draft saved locally</p>
        </aside>
      ) : null}
    </div>
  );
}

export function App() {
  const [policy, setPolicy] = useState<ClientPolicy>();
  const [state, setState] = useState<
    { status: 'loading' } | { status: 'anonymous' } | { status: 'authenticated'; user: DesktopUser }
  >({ status: 'loading' });

  useEffect(() => {
    void window.markfix.authStatus().then((result) => {
      setPolicy(result.policy);
      setState(
        result.authenticated && result.user
          ? { status: 'authenticated', user: result.user }
          : { status: 'anonymous' },
      );
    });
  }, []);

  if (policy?.status === 'upgrade-required') {
    return (
      <main className="desktop-auth">
        <section>
          <div className="desktop-auth-brand">
            <span>m</span> MarkFix
          </div>
          <p className="eyebrow">UPDATE REQUIRED</p>
          <h1>This version is no longer supported</h1>
          <p>
            Install MarkFix {policy.minimumVersion} or newer before signing in or submitting
            reports. Recommended version: {policy.recommendedVersion}.
          </p>
        </section>
      </main>
    );
  }

  if (state.status === 'loading') return <main className="desktop-auth">Restoring session…</main>;
  if (state.status === 'anonymous') {
    return <DesktopLogin onAuthenticated={(user) => setState({ status: 'authenticated', user })} />;
  }
  return <AnnotationWorkspace policy={policy} />;
}
