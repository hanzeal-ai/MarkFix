import { useEffect, useRef, useState } from 'react';
import { Button, DiagnosticDetails } from '@markfix/ui';
import { Check, Copy, Download, Paperclip, Terminal, Trash2 } from '@markfix/ui/icons';
import { diagnosticEvidenceSections, type SavedCapture } from '@markfix/contracts';
import type { ProjectAnnotation } from '../project-navigation/model';

export function AnnotationPreview({
  annotations,
  onSelect,
  onDelete,
  copyCapture,
  saveCapture,
}: {
  annotations: ProjectAnnotation[];
  onSelect: (annotation: ProjectAnnotation) => Promise<void>;
  onDelete: (annotation: ProjectAnnotation) => Promise<void>;
  copyCapture: (dataUrl?: string, note?: string) => Promise<boolean>;
  saveCapture: (dataUrl?: string, note?: string) => Promise<void>;
}) {
  const [copiedId, setCopiedId] = useState<string>();
  const timer = useRef<number | undefined>(undefined);
  useEffect(() => () => window.clearTimeout(timer.current), []);
  const copy = async (capture: SavedCapture) => {
    if (!(await copyCapture(capture.dataUrl, capture.note))) return;
    setCopiedId(capture.id);
    window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => setCopiedId(undefined), 1500);
  };

  return (
    <section className="capture-notes-list" aria-label="全部批注">
      {annotations.length === 0 && <p className="capture-empty">暂无批注</p>}
      {annotations.map((annotation, index) => {
        const { record } = annotation;
        return (
          <article className="capture-note-card" key={`${annotation.type}:${record.id}`}>
            <div className="capture-note-head">
              <span>
                <i>{index + 1}</i>
                {annotation.type === 'capture'
                  ? '截图批注'
                  : annotation.type === 'element'
                    ? '文字批注'
                    : '调试标注'}
              </span>
              <span>
                {new Date(record.updatedAt).toLocaleTimeString([], {
                  hour: '2-digit',
                  minute: '2-digit',
                })}
                <Button
                  type="button"
                  title="删除"
                  aria-label="删除批注"
                  onClick={() => void onDelete(annotation)}
                >
                  <Trash2 />
                </Button>
              </span>
            </div>
            <small className="capture-note-page" title={record.pageUrl}>
              {record.pageUrl}
            </small>
            {record.status === 'rejected' && (
              <p className="annotation-rejection">驳回原因：{record.rejectionReason ?? '未提供'}</p>
            )}
            {annotation.type === 'diagnostic' ? (
              <div className={`diagnostic-annotation-content ${annotation.record.evidence.level}`}>
                <span>
                  <Terminal />
                  <strong>{annotation.record.evidence.title}</strong>
                </span>
                <p>{annotation.record.evidence.message}</p>
                <small>
                  {annotation.record.evidence.source ??
                    annotation.record.evidence.request?.url ??
                    record.pageUrl}
                </small>
              </div>
            ) : (
              <Button
                type="button"
                className={
                  annotation.type === 'capture' ? 'capture-history-select' : 'element-note-select'
                }
                onClick={() => void onSelect(annotation)}
              >
                {annotation.type === 'capture' ? (
                  <div className="capture-thumbnail">
                    <img src={annotation.record.dataUrl} alt={annotation.record.note} />
                  </div>
                ) : (
                  <code>{annotation.record.anchor.cssSelector}</code>
                )}
                <p>{annotation.record.note}</p>
                {(annotation.record.evidence?.length ?? 0) > 0 && (
                  <small className="saved-evidence-count">
                    <Paperclip /> {annotation.record.evidence?.length} 条调试证据
                  </small>
                )}
              </Button>
            )}
            {(annotation.type === 'diagnostic'
              ? [annotation.record.evidence]
              : (annotation.record.evidence ?? [])
            ).map((entry) => (
              <DiagnosticDetails
                key={entry.id}
                title={entry.title}
                sections={diagnosticEvidenceSections(entry)}
              />
            ))}
            {annotation.type === 'capture' && (
              <div className="capture-note-actions">
                <Button type="button" onClick={() => void copy(annotation.record)}>
                  {copiedId === record.id ? <Check /> : <Copy />}
                  <span aria-live="polite">{copiedId === record.id ? '已复制' : '复制'}</span>
                </Button>
                <Button
                  type="button"
                  onClick={() =>
                    void saveCapture(annotation.record.dataUrl, annotation.record.note)
                  }
                >
                  <Download /> 保存
                </Button>
              </div>
            )}
          </article>
        );
      })}
    </section>
  );
}
