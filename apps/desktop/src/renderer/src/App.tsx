import { useCallback, useEffect, useRef, useState, type FormEvent } from 'react';
import {
  ArrowLeft,
  ArrowRight,
  Camera,
  Check,
  ChevronDown,
  ChevronUp,
  CircleStop,
  Crosshair,
  Eye,
  EyeOff,
  Globe2,
  LoaderCircle,
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
  type Anchor,
  type Annotation,
  type AnnotationTool,
  type BrowserMode,
  type ClientPolicy,
  type CaptureContext,
  type CaptureRequest,
  type Environment,
  type ReproductionStep,
  type WorkspaceSummary,
} from '@markfix/contracts';
import { describeTrustedEvent, mergeAdjacentInputSteps } from '@markfix/reproduction-model';

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
type CaptureMode = CaptureRequest['mode'];
type DesktopUser = { id: string; email: string; displayName: string };

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
  const [reproduction, setReproduction] = useState<ReproductionStep[]>([]);
  const [screenshot, setScreenshot] = useState<string>();
  const [captureMode, setCaptureMode] = useState<CaptureMode>('visible');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isRecording, setIsRecording] = useState(false);
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
          setModeState('browse');
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
        setModeState('browse');
        setNotice(`${parsed.data.type} annotation added.`);
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
  }, [annotations]);

  useEffect(() => {
    void window.markfix.syncAnchor(anchor ?? null);
  }, [anchor]);

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
      nextMode === 'inspect'
        ? 'Hover and click an element on the page.'
        : nextMode === 'region'
          ? 'Drag a rectangle on the page.'
          : undefined,
    );
    await window.markfix.setMode(nextMode);
  };

  const beginAnnotation = async (nextTool: AnnotationTool): Promise<void> => {
    setActiveTool(nextTool);
    await window.markfix.setAnnotationTool(nextTool);
    await setMode('draw');
    setNotice(`Draw a ${nextTool} annotation on the page.`);
  };

  const toggleRecording = async (): Promise<void> => {
    const enabled = !isRecording;
    await window.markfix.setRecording(enabled);
    setIsRecording(enabled);
    setNotice(enabled ? 'Recording trusted page interactions.' : 'Recording stopped.');
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
      mode: captureMode,
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
            className={mode === 'inspect' ? 'active' : ''}
            onClick={() => void setMode('inspect')}
          >
            <MousePointer2 /> Select
          </button>
          <button
            className={mode === 'region' ? 'active' : ''}
            onClick={() => void setMode('region')}
          >
            <Crosshair /> Region
          </button>
          <button onClick={() => void capture()}>
            <Camera />
          </button>
          <select
            className="capture-mode"
            value={captureMode}
            aria-label="Capture mode"
            onChange={(event) => setCaptureMode(event.target.value as CaptureMode)}
          >
            <option value="visible">Visible</option>
            <option value="element" disabled={anchor?.kind !== 'element'}>
              Element
            </option>
            <option value="full-page">Full page</option>
          </select>
          <button
            className={isRecording ? 'active recording' : ''}
            onClick={() => void toggleRecording()}
          >
            <CircleStop /> {isRecording ? 'Stop' : 'Record'}
          </button>
          <button
            title={`Sign out ${user.email}`}
            onClick={() => void window.markfix.logout().finally(onLogout)}
          >
            {user.displayName.slice(0, 2).toUpperCase()}
          </button>
        </div>
      </header>
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
