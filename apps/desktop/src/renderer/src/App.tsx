import { useCallback, useEffect, useRef, useState, type FormEvent } from 'react';
import {
  ArrowLeft,
  ArrowRight,
  Camera,
  Check,
  ChevronDown,
  ChevronUp,
  Circle,
  Crosshair,
  Eye,
  EyeOff,
  Globe2,
  Grid2X2,
  Hash,
  LoaderCircle,
  MessageSquareText,
  MousePointer2,
  MoveUpRight,
  PenLine,
  Redo2,
  RefreshCw,
  Send,
  Sparkles,
  Square,
  Trash2,
  Type,
  Undo2,
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
  type ScreenshotMark,
  type ScreenshotTool,
  type WorkspaceSummary,
} from '@markfix/contracts';
import { describeTrustedEvent, mergeAdjacentInputSteps } from '@markfix/reproduction-model';
import { composeScreenshot } from './screenshot-compositor';

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

function AnnotationWorkspace({
  user,
  policy,
  onLogout,
}: {
  user: DesktopUser;
  policy: ClientPolicy | undefined;
  onLogout: () => void;
}) {
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
  const [captureRedoStack, setCaptureRedoStack] = useState<ScreenshotMark[]>([]);
  const [captureTool, setCaptureTool] = useState<ScreenshotTool>('select');
  const [captureColor, setCaptureColor] = useState('#ef4444');
  const [captureStrokeWidth, setCaptureStrokeWidth] = useState<2 | 4 | 6>(4);
  const [captureLoading, setCaptureLoading] = useState(false);
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
  const selectedWorkspace = workspaces.find(({ id }) => id === selectedWorkspaceId);
  const selectedProject = selectedWorkspace?.projects.find(({ id }) => id === selectedProjectId);
  const selectedEnvironment = environments.find(({ id }) => id === selectedEnvironmentId);

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
      window.markfix.onSelection((payload) => {
        const parsed = anchorSchema.safeParse(payload);
        if (parsed.success) {
          setAnchor(parsed.data);
          setNotice('Element selected. Add your comment.');
        }
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
          setCaptureSelection(undefined);
          setCaptureSource(undefined);
          setScreenshot(undefined);
          return;
        }
        const parsed = anchorSchema.safeParse(payload);
        if (!parsed.success || parsed.data.kind !== 'region') return;
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
        setCaptureRedoStack([]);
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
    void window.markfix.syncAnchor(anchor ?? null);
  }, [anchor]);

  useEffect(() => {
    void window.markfix.syncCaptureMarks(captureMarks);
  }, [captureMarks]);

  useEffect(() => {
    if (!captureSelection || !captureSource) return;
    let active = true;
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
    if (destination === 'capture') {
      captureRequestIdRef.current = undefined;
      setCaptureSelection(undefined);
      setCaptureSource(undefined);
      setCaptureMarks([]);
      setCaptureRedoStack([]);
      setCaptureTool('select');
      setScreenshot(undefined);
      void window.markfix.setCaptureTool('select');
    }
    return setMode(destination);
  };

  const beginAnnotation = async (nextTool: AnnotationTool): Promise<void> => {
    setActiveTool(nextTool);
    await window.markfix.setAnnotationTool(nextTool);
    await setMode('draw');
    setNotice(`Draw a ${nextTool} annotation on the page.`);
  };

  const chooseCaptureTool = (nextTool: ScreenshotTool): void => {
    setCaptureTool(nextTool);
    void window.markfix.setCaptureTool(nextTool);
  };

  const chooseCaptureColor = (color: string): void => {
    setCaptureColor(color);
    void window.markfix.setCaptureStyle({ color, strokeWidth: captureStrokeWidth });
  };

  const chooseCaptureStroke = (strokeWidth: 2 | 4 | 6): void => {
    setCaptureStrokeWidth(strokeWidth);
    void window.markfix.setCaptureStyle({ color: captureColor, strokeWidth });
  };

  const undoCaptureMark = (): void => {
    setCaptureMarks((current) => {
      const removed = current.at(-1);
      if (!removed) return current;
      setCaptureRedoStack((redo) => [...redo, removed]);
      return current.slice(0, -1);
    });
  };

  const redoCaptureMark = (): void => {
    setCaptureRedoStack((current) => {
      const restored = current.at(-1);
      if (!restored) return current;
      setCaptureMarks((marks) => [...marks, restored]);
      return current.slice(0, -1);
    });
  };

  const clearCaptureMarks = (): void => {
    setCaptureMarks([]);
    setCaptureRedoStack([]);
  };

  const updateCaptureText = (id: string, text: string): void => {
    setCaptureMarks((marks) =>
      marks.map((mark) => (mark.id === id && mark.type === 'text' ? { ...mark, text } : mark)),
    );
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

  return (
    <div className="shell">
      <header className="browser-bar">
        <div className="traffic-space" />
        <div className="brand">
          <span>m</span>
        </div>
        <div className="nav-buttons">
          <button onClick={() => void window.markfix.back()}>
            <ArrowLeft />
          </button>
          <button onClick={() => void window.markfix.forward()}>
            <ArrowRight />
          </button>
          <button onClick={() => void window.markfix.reload()}>
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
          <Globe2 />
          <input value={url} onChange={(event) => setUrl(event.target.value)} />
        </form>
        <div className="tools">
          <button
            className={mode === 'comment' ? 'active' : ''}
            onClick={() => void toggleMode('comment')}
          >
            <MessageSquareText /> 批注
          </button>
          <button
            className={mode === 'capture' ? 'active' : ''}
            onClick={() => void toggleMode('capture')}
          >
            <Camera /> 截图
          </button>
          <button
            title={`Sign out ${user.email}`}
            onClick={() => void window.markfix.logout().finally(onLogout)}
          >
            {user.displayName.slice(0, 2).toUpperCase()}
          </button>
        </div>
      </header>
      {mode === 'capture' ? (
        <aside className="comment-panel capture-panel">
          <div className="panel-heading">
            <div>
              <span className="eyebrow">SCREENSHOT</span>
              <h1>截图批注</h1>
            </div>
            <Camera />
          </div>
          {captureSelection ? (
            <section className="capture-selection-summary">
              <span>{captureLoading ? '正在生成截图…' : '实时截图预览'}</span>
              {screenshot && <img src={screenshot} alt="截图选区预览" />}
              <strong>
                {Math.round(captureSelection.widthCssPx)} ×{' '}
                {Math.round(captureSelection.heightCssPx)} px
              </strong>
              <small>拖动选区可以移动，拖动八个控制点可以调整大小。</small>
            </section>
          ) : (
            <section className="capture-empty">
              <Crosshair />
              <strong>框选需要截图的区域</strong>
              <span>在左侧页面按住鼠标拖动创建选区。</span>
            </section>
          )}
          {captureSelection && (
            <section className="capture-editor">
              <div className="capture-tool-grid" aria-label="截图标记工具">
                <button
                  className={captureTool === 'select' ? 'active' : ''}
                  title="移动选区"
                  onClick={() => chooseCaptureTool('select')}
                >
                  <MousePointer2 />
                </button>
                <button
                  className={captureTool === 'rectangle' ? 'active' : ''}
                  title="矩形"
                  onClick={() => chooseCaptureTool('rectangle')}
                >
                  <Square />
                </button>
                <button
                  className={captureTool === 'ellipse' ? 'active' : ''}
                  title="椭圆"
                  onClick={() => chooseCaptureTool('ellipse')}
                >
                  <Circle />
                </button>
                <button
                  className={captureTool === 'arrow' ? 'active' : ''}
                  title="箭头"
                  onClick={() => chooseCaptureTool('arrow')}
                >
                  <MoveUpRight />
                </button>
                <button
                  className={captureTool === 'pen' ? 'active' : ''}
                  title="画笔"
                  onClick={() => chooseCaptureTool('pen')}
                >
                  <PenLine />
                </button>
                <button
                  className={captureTool === 'text' ? 'active' : ''}
                  title="文字"
                  onClick={() => chooseCaptureTool('text')}
                >
                  <Type />
                </button>
                <button
                  className={captureTool === 'mosaic' ? 'active' : ''}
                  title="马赛克"
                  onClick={() => chooseCaptureTool('mosaic')}
                >
                  <Grid2X2 />
                </button>
                <button
                  className={captureTool === 'number' ? 'active' : ''}
                  title="序号"
                  onClick={() => chooseCaptureTool('number')}
                >
                  <Hash />
                </button>
              </div>
              <div className="capture-style-row">
                <div className="capture-colors" aria-label="标记颜色">
                  {['#ef4444', '#f97316', '#2563eb', '#111827'].map((color) => (
                    <button
                      key={color}
                      className={captureColor === color ? 'active' : ''}
                      style={{ background: color }}
                      title={color}
                      onClick={() => chooseCaptureColor(color)}
                    />
                  ))}
                </div>
                <div className="capture-widths" aria-label="线宽">
                  {([2, 4, 6] as const).map((width) => (
                    <button
                      key={width}
                      className={captureStrokeWidth === width ? 'active' : ''}
                      onClick={() => chooseCaptureStroke(width)}
                    >
                      {width}
                    </button>
                  ))}
                </div>
              </div>
              <div className="capture-history-actions">
                <button disabled={captureMarks.length === 0} onClick={undoCaptureMark}>
                  <Undo2 /> 撤销
                </button>
                <button disabled={captureRedoStack.length === 0} onClick={redoCaptureMark}>
                  <Redo2 /> 重做
                </button>
                <button disabled={captureMarks.length === 0} onClick={clearCaptureMarks}>
                  <Trash2 /> 清除
                </button>
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
            </section>
          )}
          {notice && <div className="notice">{notice}</div>}
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
  return (
    <AnnotationWorkspace
      user={state.user}
      policy={policy}
      onLogout={() => setState({ status: 'anonymous' })}
    />
  );
}
