import { useEffect, useMemo, useState } from 'react';
import { Button, Card, Checkbox, Label } from '@markfix/ui';
import { Camera, Check, MessageSquareText, Terminal, ZoomIn } from '@markfix/ui/icons';
import type {
  SavedCapture,
  SavedDiagnosticAnnotation,
  SavedElementComment,
} from '@markfix/contracts';

type AnnotationSaveDialogProps = {
  captures: SavedCapture[];
  diagnostics: SavedDiagnosticAnnotation[];
  elementComments: SavedElementComment[];
  busy: boolean;
  onCancel: () => void;
  onPreviewCapture: (capture: SavedCapture) => void;
  onSubmit: (selection: {
    captures: SavedCapture[];
    diagnostics: SavedDiagnosticAnnotation[];
    elementComments: SavedElementComment[];
  }) => void;
};

type ReviewItem =
  | { key: string; kind: 'comment'; record: SavedElementComment; createdAt: string }
  | { key: string; kind: 'capture'; record: SavedCapture; createdAt: string }
  | {
      key: string;
      kind: 'diagnostic';
      record: SavedDiagnosticAnnotation;
      createdAt: string;
    };

const commentKey = (id: string): string => `comment:${id}`;
const captureKey = (id: string): string => `capture:${id}`;
const diagnosticKey = (id: string): string => `diagnostic:${id}`;

export function AnnotationSaveDialog({
  captures,
  diagnostics,
  elementComments,
  busy,
  onCancel,
  onPreviewCapture,
  onSubmit,
}: AnnotationSaveDialogProps): React.JSX.Element {
  const items = useMemo<ReviewItem[]>(
    () =>
      [
        ...elementComments.map(
          (record): ReviewItem => ({
            key: commentKey(record.id),
            kind: 'comment',
            record,
            createdAt: record.createdAt,
          }),
        ),
        ...captures.map(
          (record): ReviewItem => ({
            key: captureKey(record.id),
            kind: 'capture',
            record,
            createdAt: record.createdAt,
          }),
        ),
        ...diagnostics.map(
          (record): ReviewItem => ({
            key: diagnosticKey(record.id),
            kind: 'diagnostic',
            record,
            createdAt: record.createdAt,
          }),
        ),
      ].sort((left, right) => left.createdAt.localeCompare(right.createdAt)),
    [captures, diagnostics, elementComments],
  );
  const [selectedKeys, setSelectedKeys] = useState<Set<string>>(
    () => new Set(items.map(({ key }) => key)),
  );
  const allSelected = items.length > 0 && selectedKeys.size === items.length;

  useEffect(() => {
    setSelectedKeys(new Set(items.map(({ key }) => key)));
  }, [items]);

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent): void => {
      if (event.key !== 'Escape' || busy) return;
      event.preventDefault();
      onCancel();
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [busy, onCancel]);

  const toggleItem = (key: string): void => {
    setSelectedKeys((current) => {
      const next = new Set(current);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  const submit = (): void => {
    onSubmit({
      elementComments: elementComments.filter(({ id }) => selectedKeys.has(commentKey(id))),
      captures: captures.filter(({ id }) => selectedKeys.has(captureKey(id))),
      diagnostics: diagnostics.filter(({ id }) => selectedKeys.has(diagnosticKey(id))),
    });
  };

  return (
    <Card className="annotation-save-dialog" aria-label="保存标注">
      <div className="annotation-save-summary">
        <Label>
          <Checkbox
            checked={allSelected}
            disabled={items.length === 0 || busy}
            onCheckedChange={() =>
              setSelectedKeys(allSelected ? new Set() : new Set(items.map(({ key }) => key)))
            }
          />
          全选
        </Label>
        <span>
          已选择 {selectedKeys.size} / {items.length} 项
        </span>
      </div>

      <div className="annotation-save-list">
        {items.length === 0 ? (
          <div className="annotation-save-empty">
            <MessageSquareText />
            <strong>暂无可保存的标注</strong>
            <span>完成批注或截图后再提交。</span>
          </div>
        ) : (
          items.map((item) => {
            const selected = selectedKeys.has(item.key);
            return (
              <article
                className={`annotation-save-item ${selected ? 'selected' : ''}`}
                key={item.key}
              >
                <Checkbox
                  checked={selected}
                  disabled={busy}
                  onCheckedChange={() => toggleItem(item.key)}
                />
                {item.kind === 'capture' ? (
                  <Button
                    type="button"
                    className="annotation-save-preview-button"
                    aria-label={`预览截图：${item.record.note}`}
                    title="点击预览"
                    onClick={() => onPreviewCapture(item.record)}
                  >
                    <img src={item.record.dataUrl} alt={item.record.note} />
                    <span>
                      <ZoomIn /> 预览
                    </span>
                  </Button>
                ) : item.kind === 'comment' ? (
                  <span className="annotation-save-item-icon">
                    <MessageSquareText />
                  </span>
                ) : (
                  <span className="annotation-save-item-icon">
                    <Terminal />
                  </span>
                )}
                <span className="annotation-save-item-content">
                  <span className="annotation-save-item-heading">
                    <strong>
                      {item.kind === 'capture'
                        ? '截图标注'
                        : item.kind === 'comment'
                          ? '元素批注'
                          : '调试标注'}
                    </strong>
                    <time>
                      {new Date(item.createdAt).toLocaleString([], {
                        month: '2-digit',
                        day: '2-digit',
                        hour: '2-digit',
                        minute: '2-digit',
                      })}
                    </time>
                  </span>
                  <span className="annotation-save-item-note">
                    {item.kind === 'diagnostic' ? item.record.evidence.title : item.record.note}
                  </span>
                  <span className="annotation-save-item-meta">
                    {item.kind === 'capture' ? (
                      <>
                        <Camera /> {Math.round(item.record.widthCssPx)} ×{' '}
                        {Math.round(item.record.heightCssPx)} px · {item.record.marks.length} 个标记
                        {(item.record.evidence?.length ?? 0) > 0
                          ? ` · ${item.record.evidence?.length ?? 0} 条调试证据`
                          : ''}
                      </>
                    ) : item.kind === 'comment' ? (
                      `${item.record.anchor.cssSelector}${
                        (item.record.evidence?.length ?? 0) > 0
                          ? ` · ${item.record.evidence?.length ?? 0} 条调试证据`
                          : ''
                      }`
                    ) : (
                      item.record.evidence.message || item.record.evidence.source || '调试记录'
                    )}
                  </span>
                  <span className="annotation-save-item-url">{item.record.pageUrl}</span>
                </span>
              </article>
            );
          })
        )}
      </div>

      <footer>
        <Button
          type="button"
          className="primary"
          disabled={busy || selectedKeys.size === 0}
          onClick={submit}
        >
          <Check /> {busy ? '提交中…' : '提交'}
        </Button>
      </footer>
    </Card>
  );
}
