import { useEffect, useRef, useState, type Dispatch, type SetStateAction } from 'react';
import { Camera, Check, Copy, Download, Trash2, X } from '@markfix/ui/icons';
import { Button, Card, Input, Label, Textarea } from '@markfix/ui';
import type { DiagnosticEvidence, SavedCapture, ScreenshotMark } from '@markfix/contracts';
import { EvidenceReferences } from './EvidenceReferences';
import { FirstAnnotationGuide, type FirstAnnotationGuideStep } from './FirstAnnotationGuide';
import { numberedVisibleRecords, type CaptureSelection } from './model';

export function CapturePanel({
  pageCaptures,
  captureSelection,
  captureLoading,
  screenshot,
  captureMarks,
  captureNote,
  captureEvidence,
  captureRendering,
  editingCaptureId,
  setCaptureNote,
  setCaptureEvidence,
  updateCaptureText,
  cancelCapture,
  completeCapture,
  deleteSavedCapture,
  selectSavedCapture,
  copyCapture,
  saveCapture,
  guideStep,
  dismissGuide,
}: {
  pageCaptures: SavedCapture[];
  captureSelection: CaptureSelection | undefined;
  captureLoading: boolean;
  screenshot: string | undefined;
  captureMarks: ScreenshotMark[];
  captureNote: string;
  captureEvidence: DiagnosticEvidence[];
  captureRendering: boolean;
  editingCaptureId: string | undefined;
  setCaptureNote: Dispatch<SetStateAction<string>>;
  setCaptureEvidence: Dispatch<SetStateAction<DiagnosticEvidence[]>>;
  updateCaptureText: (id: string, text: string) => void;
  cancelCapture: () => Promise<void>;
  completeCapture: () => Promise<void>;
  deleteSavedCapture: (id: string) => Promise<void>;
  selectSavedCapture: (capture: SavedCapture) => Promise<void>;
  copyCapture: (dataUrl?: string, note?: string) => Promise<boolean>;
  saveCapture: (dataUrl?: string, note?: string) => Promise<void>;
  guideStep: FirstAnnotationGuideStep | undefined;
  dismissGuide: () => void;
}) {
  const [copiedCaptureId, setCopiedCaptureId] = useState<string>();
  const copiedFeedbackTimerRef = useRef<number | undefined>(undefined);
  const visibleCaptures = numberedVisibleRecords(pageCaptures, editingCaptureId);

  useEffect(
    () => () => {
      if (copiedFeedbackTimerRef.current) window.clearTimeout(copiedFeedbackTimerRef.current);
    },
    [],
  );

  const copyWithFeedback = async (capture: SavedCapture): Promise<void> => {
    if (!(await copyCapture(capture.dataUrl, capture.note))) return;
    setCopiedCaptureId(capture.id);
    if (copiedFeedbackTimerRef.current) window.clearTimeout(copiedFeedbackTimerRef.current);
    copiedFeedbackTimerRef.current = window.setTimeout(() => {
      setCopiedCaptureId((current) => (current === capture.id ? undefined : current));
    }, 1500);
  };

  return (
    <aside className="comment-panel capture-panel">
      <div className="capture-panel-header">
        <span>截图批注</span>
        <small>{pageCaptures.length} 张</small>
      </div>
      <div className="capture-panel-body">
        {captureSelection && (
          <Card className="capture-selection-card">
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
                    <Label key={mark.id}>
                      文字 {index + 1}
                      <Input
                        value={mark.text}
                        maxLength={200}
                        onChange={(event) => updateCaptureText(mark.id, event.target.value)}
                      />
                    </Label>
                  ) : null,
                )}
              </div>
            )}
            {guideStep === 'describe' && (
              <FirstAnnotationGuide mode="capture" step="describe" onDismiss={dismissGuide} />
            )}
            <Textarea
              className={`capture-note-input ${guideStep === 'describe' ? 'first-annotation-guide-target' : ''}`}
              data-capture-note
              value={captureNote}
              maxLength={2000}
              placeholder="说明截图中的问题…"
              onChange={(event) => setCaptureNote(event.target.value)}
            />
            <EvidenceReferences
              items={captureEvidence}
              onRemove={(id) =>
                setCaptureEvidence((items) => items.filter((item) => item.id !== id))
              }
            />
            {guideStep === 'complete' && (
              <FirstAnnotationGuide mode="capture" step="complete" onDismiss={dismissGuide} />
            )}
            <div className="capture-draft-actions">
              <Button
                type="button"
                aria-label="取消截图"
                title="取消截图"
                onClick={() => void cancelCapture()}
              >
                <X />
              </Button>
              <Button
                type="button"
                className={`primary ${guideStep === 'complete' ? 'first-annotation-guide-target' : ''}`}
                aria-label={editingCaptureId ? '保存截图修改' : '完成截图'}
                title={editingCaptureId ? '保存截图修改' : '完成截图'}
                disabled={!captureNote.trim() || !screenshot || captureLoading || captureRendering}
                onClick={() => void completeCapture()}
              >
                <Check />
              </Button>
            </div>
          </Card>
        )}
        {!captureSelection && pageCaptures.length === 0 && (
          <section
            className={`capture-empty ${guideStep === 'select' ? 'first-annotation-guide-target' : ''}`}
          >
            <span className="capture-empty-icon">
              <Camera />
            </span>
            <strong>框选一个页面区域</strong>
            <p>
              拖拽建立截图选区。选区可以移动、缩放，并支持矩形、椭圆、箭头、画笔、文字、马赛克和序号。
            </p>
            {guideStep === 'select' && (
              <FirstAnnotationGuide mode="capture" step="select" onDismiss={dismissGuide} />
            )}
          </section>
        )}
        {visibleCaptures.length > 0 && (
          <section className="capture-notes-list">
            {visibleCaptures.map(({ comment: item, number }) => (
              <article className="capture-note-card" key={item.id}>
                <div className="capture-note-head">
                  <span>
                    <i>{number}</i> 截图批注
                  </span>
                  <span>
                    {new Date(item.createdAt).toLocaleTimeString([], {
                      hour: '2-digit',
                      minute: '2-digit',
                    })}
                    <Button
                      type="button"
                      title="删除"
                      onClick={() => void deleteSavedCapture(item.id)}
                    >
                      <Trash2 />
                    </Button>
                  </span>
                </div>
                <Button
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
                    <span>
                      {item.marks.length} 个标记
                      {(item.evidence?.length ?? 0) > 0
                        ? ` · ${item.evidence?.length ?? 0} 条证据`
                        : ''}
                    </span>
                  </div>
                  <p>{item.note}</p>
                </Button>
                <div className="capture-note-actions">
                  <Button type="button" onClick={() => void copyWithFeedback(item)}>
                    {copiedCaptureId === item.id ? <Check /> : <Copy />}
                    <span aria-live="polite">
                      {copiedCaptureId === item.id ? '已复制' : '复制'}
                    </span>
                  </Button>
                  <Button type="button" onClick={() => void saveCapture(item.dataUrl, item.note)}>
                    <Download /> 保存
                  </Button>
                </div>
              </article>
            ))}
          </section>
        )}
      </div>
    </aside>
  );
}
