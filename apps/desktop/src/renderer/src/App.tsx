import { useCallback, useEffect, useRef, useState } from 'react';
import {
  ArrowLeft,
  ArrowRight,
  Camera,
  Check,
  ChevronDown,
  ChevronUp,
  CircleStop,
  Crosshair,
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
  type ReproductionStep,
} from '@markfix/contracts';
import { describeTrustedEvent, mergeAdjacentInputSteps } from '@markfix/reproduction-model';

type Draft = {
  title: string;
  description: string;
  url: string;
  anchor: Anchor | undefined;
  annotations: Annotation[];
  reproduction: ReproductionStep[];
  pendingOutboxId?: string;
};
type BrowserState = { url?: string; loading?: boolean; error?: string };

export function App() {
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
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isRecording, setIsRecording] = useState(false);
  const [notice, setNotice] = useState<string>();
  const [pendingOutboxId, setPendingOutboxId] = useState<string>();
  const pendingOutboxIdRef = useRef<string | undefined>(undefined);

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
    void window.markfix.syncAnnotations(annotations);
  }, [annotations]);

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
          ...(pendingOutboxId ? { pendingOutboxId } : {}),
        } satisfies Draft);
      }
    }, 400);
    return () => window.clearTimeout(timer);
  }, [title, description, url, anchor, annotations, reproduction, pendingOutboxId]);

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
    const result = await window.markfix.capture();
    setScreenshot(result.dataUrl);
    setNotice('Visible page captured.');
    return result;
  };

  const submit = async (): Promise<void> => {
    if (!anchor || !title.trim() || !description.trim()) return;
    setIsSubmitting(true);
    setNotice(undefined);
    try {
      const captureResult = await capture();
      const result = (await window.markfix.submitReport({
        projectId: '00000000-0000-0000-0000-000000000000',
        title: title.trim(),
        description: description.trim(),
        priority: 'MEDIUM',
        screenshotDataUrl: captureResult.dataUrl,
        captureBundle: {
          schemaVersion: 1,
          page: {
            url: captureResult.url,
            title: captureResult.title,
            viewportWidthCssPx: captureResult.width / captureResult.deviceScaleFactor,
            viewportHeightCssPx: captureResult.height / captureResult.deviceScaleFactor,
            deviceScaleFactor: captureResult.deviceScaleFactor,
            capturedAt: new Date().toISOString(),
          },
          anchor,
          annotations,
          reproduction,
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
          <button
            className={isRecording ? 'active recording' : ''}
            onClick={() => void toggleRecording()}
          >
            <CircleStop /> {isRecording ? 'Stop' : 'Record'}
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
