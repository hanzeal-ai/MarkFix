import { useEffect, useMemo, useState } from 'react';
import { Camera, Check, MessageSquareText, X } from 'lucide-react';
import type { SavedCapture, SavedElementComment } from '@markfix/contracts';

type AnnotationSaveDialogProps = {
  captures: SavedCapture[];
  elementComments: SavedElementComment[];
  busy: boolean;
  onCancel: () => void;
  onSubmit: (selection: {
    captures: SavedCapture[];
    elementComments: SavedElementComment[];
  }) => void;
};

type ReviewItem =
  | { key: string; kind: 'comment'; record: SavedElementComment; createdAt: string }
  | { key: string; kind: 'capture'; record: SavedCapture; createdAt: string };

const commentKey = (id: string): string => `comment:${id}`;
const captureKey = (id: string): string => `capture:${id}`;

export function AnnotationSaveDialog({
  captures,
  elementComments,
  busy,
  onCancel,
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
      ].sort((left, right) => left.createdAt.localeCompare(right.createdAt)),
    [captures, elementComments],
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
    });
  };

  return (
    <div className="annotation-save-backdrop">
      <section
        className="annotation-save-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="annotation-save-title"
      >
        <header>
          <div>
            <h2 id="annotation-save-title">保存标注</h2>
            <p>确认需要提交入库的批注和截图。</p>
          </div>
          <button type="button" aria-label="关闭" title="关闭" disabled={busy} onClick={onCancel}>
            <X />
          </button>
        </header>

        <div className="annotation-save-summary">
          <label>
            <input
              type="checkbox"
              checked={allSelected}
              disabled={items.length === 0 || busy}
              onChange={() =>
                setSelectedKeys(allSelected ? new Set() : new Set(items.map(({ key }) => key)))
              }
            />
            全选
          </label>
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
                <label
                  className={`annotation-save-item ${selected ? 'selected' : ''}`}
                  key={item.key}
                >
                  <input
                    type="checkbox"
                    checked={selected}
                    disabled={busy}
                    onChange={() => toggleItem(item.key)}
                  />
                  {item.kind === 'capture' ? (
                    <img src={item.record.dataUrl} alt={item.record.note} />
                  ) : (
                    <span className="annotation-save-item-icon">
                      <MessageSquareText />
                    </span>
                  )}
                  <span className="annotation-save-item-content">
                    <span className="annotation-save-item-heading">
                      <strong>{item.kind === 'capture' ? '截图标注' : '元素批注'}</strong>
                      <time>
                        {new Date(item.createdAt).toLocaleString([], {
                          month: '2-digit',
                          day: '2-digit',
                          hour: '2-digit',
                          minute: '2-digit',
                        })}
                      </time>
                    </span>
                    <span className="annotation-save-item-note">{item.record.note}</span>
                    <span className="annotation-save-item-meta">
                      {item.kind === 'capture' ? (
                        <>
                          <Camera /> {Math.round(item.record.widthCssPx)} ×{' '}
                          {Math.round(item.record.heightCssPx)} px · {item.record.marks.length}{' '}
                          个标记
                        </>
                      ) : (
                        item.record.anchor.cssSelector
                      )}
                    </span>
                    <span className="annotation-save-item-url">{item.record.pageUrl}</span>
                  </span>
                </label>
              );
            })
          )}
        </div>

        <footer>
          <button type="button" disabled={busy} onClick={onCancel}>
            取消
          </button>
          <button
            type="button"
            className="primary"
            disabled={busy || selectedKeys.size === 0}
            onClick={submit}
          >
            <Check /> {busy ? '提交中…' : '提交'}
          </button>
        </footer>
      </section>
    </div>
  );
}
