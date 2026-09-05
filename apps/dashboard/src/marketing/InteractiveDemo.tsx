import { useRef, useState, type ReactNode } from 'react';
import {
  ArrowLeft,
  ArrowRight,
  Camera,
  MessageSquareText,
  MousePointer2,
  RefreshCw,
  Trash2,
} from '@markfix/ui/icons';
import { Badge, Button, Textarea, ToggleGroup, ToggleGroupItem, toast } from '@markfix/ui';
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
  note: string;
};

type AnnotatableProps = {
  annotationNumber?: number | undefined;
  children: ReactNode;
  className?: string;
  mode: DemoMode;
  onSelect: (target: DemoTarget) => void;
  target: DemoTarget;
};

function Annotatable({
  annotationNumber,
  children,
  className = '',
  mode,
  onSelect,
  target,
}: AnnotatableProps) {
  return (
    <div
      className={`mf-demo-annotatable ${mode === 'comment' ? 'is-enabled' : ''} ${className}`}
      onClick={(event) => {
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
  const [draftNote, setDraftNote] = useState('');
  const [annotations, setAnnotations] = useState<DemoAnnotation[]>([]);
  const [captureResetKey, setCaptureResetKey] = useState(0);

  const showToast = (message: string) => {
    toast(message, { duration: 2600 });
  };

  const annotationNumberFor = (targetId: string) => {
    const index = annotations.findIndex((annotation) => annotation.id === targetId);
    return index >= 0 ? index + 1 : undefined;
  };

  const chooseMode = (nextMode: DemoMode) => {
    setMode(nextMode);
    setDraftTarget(null);
    setDraftNote('');
  };

  const selectTarget = (nextTarget: DemoTarget) => {
    setDraftTarget(nextTarget);
    setDraftNote('');
  };

  const saveAnnotation = () => {
    const note = draftNote.trim();
    if (!draftTarget || !note) return;

    const annotationId = nextAnnotationId.current;
    nextAnnotationId.current += 1;
    setAnnotations((current) => [
      ...current,
      {
        ...draftTarget,
        annotationId,
        note,
      },
    ]);
    if (draftTarget.kind === 'capture') setCaptureResetKey((current) => current + 1);
    setDraftTarget(null);
    setDraftNote('');
    showToast('演示批注已添加，仅在当前页面有效');
  };

  const resetDemo = () => {
    setAnnotations([]);
    setDraftTarget(null);
    setDraftNote('');
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
    setCaptureResetKey((current) => current + 1);
  };

  return (
    <div className="mf-demo-shell">
      <aside className="mf-demo-projects" aria-label="演示项目">
        <span className="mf-demo-app-mark">M</span>
        <button className="is-active" type="button" aria-label="Momentum 项目">
          M
        </button>
        <button
          type="button"
          aria-label="Atlas 项目"
          onClick={() => showToast('体验版仅开放一个示例项目')}
        >
          A
        </button>
        <button
          type="button"
          aria-label="Linear 项目"
          onClick={() => showToast('体验版仅开放一个示例项目')}
        >
          L
        </button>
      </aside>

      <div className="mf-demo-workspace">
        <header className="mf-demo-toolbar">
          <div className="mf-demo-browser-controls">
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
            <span /> demo.markfix.app/{page === 'home' ? '' : page}
          </div>
          <ToggleGroup
            className="mf-demo-modes"
            type="single"
            value={mode}
            aria-label="体验模式"
            onValueChange={(value) => {
              if (value === 'browse' || value === 'comment' || value === 'capture')
                chooseMode(value);
            }}
          >
            <ToggleGroupItem value="browse">
              <MousePointer2 /> 浏览
            </ToggleGroupItem>
            <ToggleGroupItem value="comment">
              <MessageSquareText /> 批注
            </ToggleGroupItem>
            <ToggleGroupItem value="capture">
              <Camera /> 截图
            </ToggleGroupItem>
          </ToggleGroup>
          <Button size="sm" disabled={!annotations.length} onClick={submitDemo}>
            完成体验 <span>{annotations.length}</span>
          </Button>
        </header>

        <div className="mf-demo-body">
          <div className="mf-demo-page">
            <header className="mf-demo-site-header">
              <button
                className="mf-demo-site-brand"
                type="button"
                onClick={() => switchPage('home')}
              >
                <span>M</span> Momentum
              </button>
              <nav aria-label="示例网站导航">
                <button type="button" onClick={() => mode === 'browse' && switchPage('home')}>
                  首页
                </button>
                <button type="button" onClick={() => mode === 'browse' && switchPage('pricing')}>
                  价格
                </button>
                <button type="button" onClick={() => showToast('这是体验页面中的示例按钮')}>
                  更新日志
                </button>
                <button
                  className="mf-demo-site-cta"
                  type="button"
                  onClick={() => showToast('这是体验页面中的示例按钮')}
                >
                  开始使用
                </button>
              </nav>
            </header>

            {page === 'home' ? (
              <div className="mf-demo-site-home">
                <div className="mf-demo-site-copy">
                  <Annotatable
                    mode={mode}
                    target={target('eyebrow', '引导标签', '[data-id="eyebrow"]')}
                    onSelect={selectTarget}
                    annotationNumber={annotationNumberFor('eyebrow')}
                  >
                    <span className="mf-demo-site-eyebrow">团队反馈，终于有上下文了</span>
                  </Annotatable>
                  <Annotatable
                    className="mf-demo-headline-target"
                    mode={mode}
                    target={target('headline', '页面主标题', 'h1[data-id="headline"]')}
                    onSelect={selectTarget}
                    annotationNumber={annotationNumberFor('headline')}
                  >
                    <h3>把网页反馈变成开发者能直接修复的任务</h3>
                  </Annotatable>
                  <Annotatable
                    mode={mode}
                    target={target('description', '产品说明', 'p[data-id="description"]')}
                    onSelect={selectTarget}
                    annotationNumber={annotationNumberFor('description')}
                  >
                    <p>
                      直接选择页面元素、标记问题并留下批注。每条反馈都带上页面位置和视觉上下文。
                    </p>
                  </Annotatable>
                  <Annotatable
                    mode={mode}
                    target={target(
                      'primary-action',
                      '主要操作按钮',
                      'button[data-id="primary-action"]',
                    )}
                    onSelect={selectTarget}
                    annotationNumber={annotationNumberFor('primary-action')}
                  >
                    <div className="mf-demo-site-actions">
                      <button type="button">免费开始</button>
                      <button type="button">观看演示</button>
                    </div>
                  </Annotatable>
                </div>
                <Annotatable
                  className="mf-demo-visual-target"
                  mode={mode}
                  target={target('product-visual', '产品示意图', '[data-id="product-visual"]')}
                  onSelect={selectTarget}
                  annotationNumber={annotationNumberFor('product-visual')}
                >
                  <div className="mf-demo-product-visual">
                    <div className="mf-demo-mini-window">
                      <i />
                      <i />
                      <i />
                    </div>
                    <div className="mf-demo-mini-content">
                      <span className="is-strong" />
                      <span />
                      <span className="is-short" />
                      <div>
                        <span />
                        <span />
                      </div>
                    </div>
                    <div className="mf-demo-mini-panel">
                      <b />
                      <span />
                      <span className="is-short" />
                    </div>
                  </div>
                </Annotatable>
              </div>
            ) : (
              <div className="mf-demo-pricing-page">
                <Annotatable
                  mode={mode}
                  target={target(
                    'pricing-headline',
                    '价格页标题',
                    'h1[data-id="pricing-headline"]',
                  )}
                  onSelect={selectTarget}
                  annotationNumber={annotationNumberFor('pricing-headline')}
                >
                  <span>简单透明</span>
                  <h3>从一次清晰的反馈开始</h3>
                </Annotatable>
                <div className="mf-demo-plan-row">
                  {['个人', '团队', '企业'].map((name, index) => (
                    <Annotatable
                      key={name}
                      mode={mode}
                      target={target(`plan-${index}`, `${name}版方案`, `[data-plan="${name}"]`)}
                      onSelect={selectTarget}
                      annotationNumber={annotationNumberFor(`plan-${index}`)}
                    >
                      <div className={index === 1 ? 'mf-demo-plan is-featured' : 'mf-demo-plan'}>
                        <span>{name}</span>
                        <strong>{index === 0 ? '免费' : index === 1 ? '¥39' : '联系销售'}</strong>
                        <small>{index === 1 ? '每位成员 / 月' : '适合不同规模的团队'}</small>
                      </div>
                    </Annotatable>
                  ))}
                </div>
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

          <aside className="mf-demo-comments">
            <div className="mf-demo-comments-header">
              <div>
                <strong>体验批注</strong>
                <Badge variant="secondary">{annotations.length} 条</Badge>
              </div>
              <button type="button" onClick={resetDemo}>
                重置
              </button>
            </div>

            <div className="mf-demo-privacy-note">
              <span /> 仅为产品体验，不保存或上传任何数据
            </div>

            {draftTarget ? (
              <div className="mf-demo-draft">
                <span>{draftTarget.kind === 'capture' ? '截图批注' : '元素批注'}</span>
                <strong>{draftTarget.label}</strong>
                <code>{draftTarget.selector}</code>
                <Textarea
                  aria-label="批注内容"
                  autoFocus
                  placeholder="描述问题或修改建议…"
                  value={draftNote}
                  onChange={(event) => setDraftNote(event.target.value)}
                />
                <div>
                  <Button size="sm" variant="ghost" onClick={() => setDraftTarget(null)}>
                    取消
                  </Button>
                  <Button size="sm" disabled={!draftNote.trim()} onClick={saveAnnotation}>
                    添加批注
                  </Button>
                </div>
              </div>
            ) : null}

            <div className="mf-demo-comment-list">
              {annotations.map((annotation, index) => (
                <article key={annotation.annotationId}>
                  <div>
                    <span className="mf-demo-comment-number">{index + 1}</span>
                    <strong>{annotation.kind === 'capture' ? '截图批注' : '元素批注'}</strong>
                    <button
                      type="button"
                      aria-label={`删除第 ${index + 1} 条批注`}
                      onClick={() =>
                        setAnnotations((current) =>
                          current.filter((item) => item.annotationId !== annotation.annotationId),
                        )
                      }
                    >
                      <Trash2 />
                    </button>
                  </div>
                  <code>{annotation.selector}</code>
                  <p>{annotation.note}</p>
                </article>
              ))}
              {!annotations.length && !draftTarget ? (
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
        </div>
      </div>
    </div>
  );
}
