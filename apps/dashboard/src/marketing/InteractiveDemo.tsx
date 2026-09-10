import { dashboardServiceUrls } from '../service-config';
import { useRef, useState, type ReactNode } from 'react';
import {
  ArrowLeft,
  ArrowRight,
  Camera,
  MessageSquareText,
  MousePointer2,
  RefreshCw,
  Check,
  X,
  Send,
  PanelLeftClose,
  Plus,
  Trash2,
} from '@markfix/ui/icons';
import { Button, MarkFixMark, Textarea, ToggleGroup, ToggleGroupItem, toast } from '@markfix/ui';
import {
  MarketingHeroContent,
  MarketingPricingContent,
  type RenderMarketingTarget,
} from './MarketingContent';
import { SiteHeader } from './SiteChrome';
import { CaptureDemo } from './CaptureDemo';

type DemoMode = 'browse' | 'comment' | 'capture';
type DemoPage = 'home' | 'pricing';

type DemoTarget = {
  id: string;
  label: string;
  selector: string;
  kind?: 'element' | 'capture';
};

type DemoAnnotation = DemoTarget & {
  annotationId: number;
  page: DemoPage;
  note: string;
};

type AnnotatableProps = {
  activeTarget?: string | undefined;
  annotationNumber?: number | undefined;
  children: ReactNode;
  className?: string;
  mode: DemoMode;
  onSelect: (target: DemoTarget) => void;
  target: DemoTarget;
};

function Annotatable({
  activeTarget,
  annotationNumber,
  children,
  className = '',
  mode,
  onSelect,
  target,
}: AnnotatableProps) {
  return (
    <div
      className={`mf-demo-annotatable ${mode === 'comment' ? 'is-enabled' : ''} ${activeTarget === target.id ? 'is-selected' : ''} ${className}`}
      role={mode === 'comment' ? 'button' : undefined}
      tabIndex={mode === 'comment' ? 0 : undefined}
      aria-label={mode === 'comment' ? `标注${target.label}` : undefined}
      onKeyDown={(event) => {
        if (mode === 'comment' && (event.key === 'Enter' || event.key === ' ')) {
          event.preventDefault();
          onSelect(target);
        }
      }}
      onClickCapture={(event) => {
        if (mode !== 'comment') return;
        event.preventDefault();
        event.stopPropagation();
        onSelect(target);
      }}
    >
      {annotationNumber ? <span className="mf-demo-pin">{annotationNumber}</span> : null}
      {children}
    </div>
  );
}

const target = (id: string, label: string, selector: string): DemoTarget => ({
  id,
  label,
  selector,
});

export function InteractiveDemo() {
  const nextAnnotationId = useRef(1);
  const [mode, setMode] = useState<DemoMode>('comment');
  const [page, setPage] = useState<DemoPage>('home');
  const [draftTarget, setDraftTarget] = useState<DemoTarget | null>(null);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [projectsOpen, setProjectsOpen] = useState(false);
  const [draftNote, setDraftNote] = useState('');
  const [annotations, setAnnotations] = useState<DemoAnnotation[]>([]);
  const [captureResetKey, setCaptureResetKey] = useState(0);

  const showToast = (message: string) => {
    toast(message, { duration: 2600 });
  };

  const pageAnnotations = annotations.filter((annotation) => annotation.page === page);

  const annotationNumberFor = (targetId: string) => {
    const index = pageAnnotations.findIndex((annotation) => annotation.id === targetId);
    return index >= 0 ? index + 1 : undefined;
  };

  const chooseMode = (nextMode: DemoMode) => {
    setMode(nextMode);
    setDraftTarget(null);
    setDraftNote('');
    setEditingId(null);
  };

  const selectTarget = (nextTarget: DemoTarget) => {
    setDraftTarget(nextTarget);
    setDraftNote('');
    setEditingId(null);
  };

  const saveAnnotation = () => {
    const note = draftNote.trim();
    if (!draftTarget || !note) return;

    const annotationId = editingId ?? nextAnnotationId.current++;
    const updated = { ...draftTarget, annotationId, note, page };
    setAnnotations((current) =>
      editingId === null
        ? [...current, updated]
        : current.map((item) => (item.annotationId === editingId ? updated : item)),
    );
    if (draftTarget.kind === 'capture') setCaptureResetKey((current) => current + 1);
    setDraftTarget(null);
    setDraftNote('');
    setEditingId(null);
    showToast('演示批注已添加，仅在当前页面有效');
  };

  const resetDemo = () => {
    setAnnotations([]);
    setDraftTarget(null);
    setDraftNote('');
    setEditingId(null);
    setCaptureResetKey((current) => current + 1);
    setPage('home');
    nextAnnotationId.current = 1;
    showToast('体验内容已重置');
  };

  const finishCapture = (selection: { width: number; height: number }) => {
    setDraftTarget({
      id: `capture-${nextAnnotationId.current}`,
      label: '截图区域',
      selector: `区域 ${Math.round(selection.width)} × ${Math.round(selection.height)} px`,
      kind: 'capture',
    });
    showToast('截图区域已框选，请补充说明');
  };

  const submitDemo = () => {
    if (!annotations.length) return;
    showToast(`体验完成：已模拟提交 ${annotations.length} 条标注，不会保存数据`);
  };

  const switchPage = (nextPage: DemoPage) => {
    setPage(nextPage);
    setDraftTarget(null);
    setDraftNote('');
    setEditingId(null);
    setCaptureResetKey((current) => current + 1);
  };

  const renderTarget: RenderMarketingTarget = (id, label, selector, content) => (
    <Annotatable
      key={id}
      activeTarget={draftTarget?.id}
      mode={mode}
      target={target(id, label, selector)}
      onSelect={selectTarget}
      annotationNumber={annotationNumberFor(id)}
    >
      {content}
    </Annotatable>
  );

  return (
    <div className="mf-demo-shell">
      <div className="mf-demo-workspace">
        <header className="mf-demo-toolbar">
          <div className="mf-demo-browser-controls">
            <button
              type="button"
              aria-label="切换项目侧栏"
              aria-expanded={projectsOpen}
              onClick={() => setProjectsOpen(!projectsOpen)}
            >
              <PanelLeftClose />
            </button>
            <button type="button" aria-label="后退" disabled>
              <ArrowLeft />
            </button>
            <button type="button" aria-label="前进" disabled>
              <ArrowRight />
            </button>
            <button type="button" aria-label="刷新演示" onClick={resetDemo}>
              <RefreshCw />
            </button>
          </div>
          <div className="mf-demo-address">
            <span /> {new URL(dashboardServiceUrls().origin).host}/{page === 'home' ? '' : page}
          </div>
          <ToggleGroup
            className="mf-demo-modes"
            type="single"
            value={mode === 'browse' ? '' : mode}
            aria-label="体验模式"
            onValueChange={(value) => {
              chooseMode(value === 'comment' || value === 'capture' ? value : 'browse');
            }}
          >
            <ToggleGroupItem value="comment" aria-label="批注模式">
              <MessageSquareText /> 批注
            </ToggleGroupItem>
            <ToggleGroupItem value="capture" aria-label="截图模式">
              <Camera /> 截图
            </ToggleGroupItem>
          </ToggleGroup>
          <Button
            className="mf-demo-submit"
            size="icon"
            aria-label={`模拟提交 ${annotations.length} 条标注`}
            title="模拟提交"
            disabled={!annotations.length}
            onClick={submitDemo}
          >
            <Send />
          </Button>
        </header>

        <div
          className={`mf-demo-body ${projectsOpen ? 'has-projects' : ''} ${mode === 'browse' ? 'is-browsing' : ''}`}
        >
          {projectsOpen && (
            <aside className="mf-demo-projects" aria-label="演示项目">
              <button type="button" onClick={resetDemo}>
                <Plus /> 新标注
              </button>
              <small>项目</small>
              <button className="is-active" type="button" onClick={() => switchPage('home')}>
                <MarkFixMark size={24} />
                <span>
                  MarkFix<small>官网 · 在线体验</small>
                </span>
              </button>
            </aside>
          )}
          <div className="mf-demo-page">
            <div
              className="mf-demo-site-header"
              onClickCapture={(event) => {
                const link = (event.target as Element).closest('a');
                const href = link?.getAttribute('href');
                if (href === '/pricing' || href === '/' || href?.startsWith('/#')) {
                  event.preventDefault();
                  event.stopPropagation();
                  switchPage(href === '/pricing' ? 'pricing' : 'home');
                  if (href === '/#experience') chooseMode('comment');
                }
              }}
            >
              <SiteHeader />
            </div>

            {page === 'home' ? (
              <section className="premium-hero mf-demo-home">
                <MarketingHeroContent
                  onExperience={() => chooseMode('comment')}
                  renderTarget={renderTarget}
                />
              </section>
            ) : (
              <div className="mf-demo-pricing-page">
                <MarketingPricingContent renderTarget={renderTarget} />
              </div>
            )}

            {mode === 'comment' ? (
              <div className="mf-demo-hint">
                <span /> 点击页面元素添加批注
              </div>
            ) : null}

            <CaptureDemo
              active={mode === 'capture'}
              resetKey={captureResetKey}
              showToast={showToast}
              onComplete={finishCapture}
            />
          </div>

          {mode !== 'browse' && (
            <aside className="mf-demo-comments" aria-label="标注预览">
              {draftTarget ? (
                <div className="mf-demo-draft">
                  <strong className="mf-demo-draft-kicker">
                    <MousePointer2 />
                    {editingId !== null
                      ? '编辑已有批注'
                      : draftTarget.kind === 'capture'
                        ? '已选择截图'
                        : '已选择元素'}
                  </strong>
                  <code>{draftTarget.selector}</code>
                  <Textarea
                    aria-label="批注内容"
                    autoFocus
                    maxLength={2000}
                    value={draftNote}
                    onChange={(event) => setDraftNote(event.target.value)}
                  />
                  <div>
                    <Button
                      size="icon"
                      variant="outline"
                      aria-label="取消批注"
                      onClick={() => {
                        setDraftTarget(null);
                        setEditingId(null);
                      }}
                    >
                      <X />
                    </Button>
                    <Button
                      className="mf-demo-confirm"
                      size="icon"
                      aria-label="保存批注"
                      disabled={!draftNote.trim()}
                      onClick={saveAnnotation}
                    >
                      <Check />
                    </Button>
                  </div>
                </div>
              ) : null}

              <div className="mf-demo-comment-list">
                {pageAnnotations
                  .filter((annotation) => annotation.annotationId !== editingId)
                  .map((annotation, index) => (
                    <article key={annotation.annotationId}>
                      <div>
                        <span className="mf-demo-comment-number">{index + 1}</span>
                        <strong>{annotation.kind === 'capture' ? '截图批注' : '元素批注'}</strong>
                        <button
                          type="button"
                          aria-label={`删除第 ${index + 1} 条批注`}
                          onClick={() =>
                            setAnnotations((current) =>
                              current.filter(
                                (item) => item.annotationId !== annotation.annotationId,
                              ),
                            )
                          }
                        >
                          <Trash2 />
                        </button>
                      </div>
                      <button
                        className="mf-demo-replay"
                        type="button"
                        aria-label={`编辑批注：${annotation.note}`}
                        onClick={() => {
                          setDraftTarget(annotation);
                          setDraftNote(annotation.note);
                          setEditingId(annotation.annotationId);
                        }}
                      >
                        <code>{annotation.selector}</code>
                        <p>{annotation.note}</p>
                      </button>
                    </article>
                  ))}
                {!pageAnnotations.length && !draftTarget ? (
                  <div className="mf-demo-empty">
                    <MessageSquareText />
                    <strong>亲手留下一条反馈</strong>
                    <p>
                      {mode === 'capture'
                        ? '在左侧页面拖拽框选一个区域。'
                        : '点击左侧页面里的标题、按钮或卡片。'}
                    </p>
                  </div>
                ) : null}
              </div>
            </aside>
          )}
        </div>
      </div>
    </div>
  );
}
