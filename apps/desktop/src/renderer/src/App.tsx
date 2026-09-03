import { useEffect, useState } from 'react';
import {
  ArrowLeft,
  ArrowRight,
  Camera,
  Check,
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
  Type,
  Undo2,
} from 'lucide-react';
import {
  anchorSchema,
  annotationSchema,
  type Anchor,
  type Annotation,
  type AnnotationTool,
  type BrowserMode,
  type ReproductionStep,
} from '@markfix/contracts';

type Draft = {
  title: string;
  description: string;
  url: string;
  anchor: Anchor | undefined;
  annotations: Annotation[];
  reproduction: ReproductionStep[];
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
  const [notice, setNotice] = useState<string>();

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
        const event = payload as { type?: unknown; elementName?: unknown; timestampMs?: unknown };
        if (event.type !== 'click' || typeof event.timestampMs !== 'number') return;
        const timestampMs = event.timestampMs;
        setReproduction((steps) =>
          [
            ...steps,
            {
              id: crypto.randomUUID(),
              type: 'click' as const,
              description: `Click ${String(event.elementName ?? 'element')}`,
              timestampMs,
            },
          ].slice(-50),
        );
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
      if (draft.url) void window.markfix.navigate(draft.url);
      setNotice('Restored your local draft.');
    });
    return () => cleanups.forEach((cleanup) => cleanup());
  }, []);

  useEffect(() => {
    void window.markfix.syncAnnotations(annotations);
  }, [annotations]);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      void window.markfix.saveDraft({
        title,
        description,
        url,
        anchor,
        annotations,
        reproduction,
      } satisfies Draft);
    }, 400);
    return () => window.clearTimeout(timer);
  }, [title, description, url, anchor, annotations, reproduction]);

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
      await window.markfix.submitReport({
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
      });
      setNotice('Report submitted. It is now visible in the dashboard.');
      setTitle('');
      setDescription('');
      setAnchor(undefined);
      setAnnotations([]);
      setRedoStack([]);
      setScreenshot(undefined);
      setReproduction([]);
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
        {reproduction.length > 0 && (
          <div className="steps">
            <strong>Reproduction trail</strong>
            <span>{reproduction.length} trusted clicks recorded</span>
          </div>
        )}
        {notice && <div className="notice">{notice}</div>}
        <button
          className="submit"
          disabled={!anchor || !title.trim() || !description.trim() || isSubmitting}
          onClick={() => void submit()}
        >
          {isSubmitting ? <LoaderCircle className="spin" /> : <Send />} Submit report
        </button>
        <p className="draft-state">Draft saved locally</p>
      </aside>
    </div>
  );
}
