import type { Dispatch, SetStateAction } from 'react';
import { Check, MousePointer2, Paperclip, Terminal, Trash2, X } from '@markfix/ui/icons';
import { Button, Card, Textarea } from '@markfix/ui';
import type {
  Anchor,
  DiagnosticEvidence,
  SavedDiagnosticAnnotation,
  SavedElementComment,
} from '@markfix/contracts';
import { EvidenceReferences } from './EvidenceReferences';
import { FirstAnnotationGuide, type FirstAnnotationGuideStep } from './FirstAnnotationGuide';
import { numberedVisibleRecords } from './model';

export function ElementCommentPanel({
  anchor,
  editingElementCommentId,
  elementCommentNote,
  elementEvidence,
  pageElementComments,
  pageDiagnosticAnnotations,
  setElementCommentNote,
  setElementEvidence,
  clearElementSelection,
  completeElementComment,
  deleteDiagnosticAnnotation,
  deleteElementComment,
  selectElementComment,
  guideStep,
  dismissGuide,
}: {
  anchor: Anchor | undefined;
  editingElementCommentId: string | undefined;
  elementCommentNote: string;
  elementEvidence: DiagnosticEvidence[];
  pageElementComments: SavedElementComment[];
  pageDiagnosticAnnotations: SavedDiagnosticAnnotation[];
  setElementCommentNote: Dispatch<SetStateAction<string>>;
  setElementEvidence: Dispatch<SetStateAction<DiagnosticEvidence[]>>;
  clearElementSelection: () => void;
  completeElementComment: () => Promise<void>;
  deleteDiagnosticAnnotation: (id: string) => Promise<void>;
  deleteElementComment: (id: string) => Promise<void>;
  selectElementComment: (comment: SavedElementComment) => void;
  guideStep: FirstAnnotationGuideStep | undefined;
  dismissGuide: () => void;
}) {
  const visibleElementComments = numberedVisibleRecords(
    pageElementComments,
    editingElementCommentId,
  );
  const editingComment = pageElementComments.find(({ id }) => id === editingElementCommentId);

  return (
    <aside className="comment-panel capture-panel element-comment-panel">
      <div className="capture-panel-header">
        <span>批注</span>
        <small>{pageElementComments.length + pageDiagnosticAnnotations.length} 条</small>
      </div>
      <div className="capture-panel-body">
        {anchor?.kind === 'element' && (
          <Card className="element-selection-card">
            <div className="element-selection-kicker">
              <MousePointer2 />
              <strong>{editingElementCommentId ? '编辑已有批注' : '已选择元素'}</strong>
            </div>
            {editingComment?.status === 'rejected' && (
              <p className="annotation-rejection">
                驳回原因：{editingComment.rejectionReason ?? '未提供'}
              </p>
            )}
            <code>{anchor.cssSelector}</code>
            {guideStep === 'describe' && (
              <FirstAnnotationGuide mode="comment" step="describe" onDismiss={dismissGuide} />
            )}
            <Textarea
              data-element-comment-note
              className={guideStep === 'describe' ? 'first-annotation-guide-target' : undefined}
              value={elementCommentNote}
              maxLength={2000}
              placeholder="描述这里需要修改什么…"
              onChange={(event) => setElementCommentNote(event.target.value)}
            />
            <EvidenceReferences
              items={elementEvidence}
              onRemove={(id) =>
                setElementEvidence((items) => items.filter((item) => item.id !== id))
              }
            />
            {guideStep === 'complete' && (
              <FirstAnnotationGuide mode="comment" step="complete" onDismiss={dismissGuide} />
            )}
            <div className="capture-draft-actions">
              <Button
                type="button"
                aria-label="取消批注"
                title="取消批注"
                onClick={clearElementSelection}
              >
                <X />
              </Button>
              <Button
                type="button"
                className={`primary ${guideStep === 'complete' ? 'first-annotation-guide-target' : ''}`}
                aria-label={editingElementCommentId ? '保存批注修改' : '完成批注'}
                title={editingElementCommentId ? '保存批注修改' : '完成批注'}
                disabled={!elementCommentNote.trim()}
                onClick={() => void completeElementComment()}
              >
                <Check />
              </Button>
            </div>
          </Card>
        )}
        {!anchor &&
          (pageElementComments.length + pageDiagnosticAnnotations.length === 0 ||
            guideStep === 'select') && (
            <section
              className={`capture-empty element-comment-empty ${guideStep === 'select' ? 'first-annotation-guide-target' : ''}`}
            >
              <span className="capture-empty-icon">
                <MousePointer2 />
              </span>
              <strong>选择页面中的元素</strong>
              <p>点击页面中的任意元素添加批注，批注会保留元素位置和页面上下文。</p>
              {guideStep === 'select' && (
                <FirstAnnotationGuide mode="comment" step="select" onDismiss={dismissGuide} />
              )}
            </section>
          )}
        {pageDiagnosticAnnotations.length > 0 && (
          <section className="capture-notes-list diagnostic-notes-list">
            {[...pageDiagnosticAnnotations].reverse().map((item, index) => (
              <article className="capture-note-card diagnostic-note-card" key={item.id}>
                <div className="capture-note-head">
                  <span>
                    <i>{pageDiagnosticAnnotations.length - index}</i>
                    {item.evidence.kind === 'network'
                      ? 'Network 标注'
                      : item.evidence.kind === 'command'
                        ? '命令标注'
                        : 'Console 标注'}
                  </span>
                  <span>
                    {new Date(item.updatedAt).toLocaleTimeString([], {
                      hour: '2-digit',
                      minute: '2-digit',
                    })}
                    <Button
                      type="button"
                      title="删除"
                      onClick={() => void deleteDiagnosticAnnotation(item.id)}
                    >
                      <Trash2 />
                    </Button>
                  </span>
                </div>
                {item.status === 'rejected' && (
                  <p className="annotation-rejection">
                    驳回原因：{item.rejectionReason ?? '未提供'}
                  </p>
                )}
                <div className={`diagnostic-annotation-content ${item.evidence.level}`}>
                  <span>
                    <Terminal />
                    <strong>{item.evidence.title}</strong>
                  </span>
                  <p>{item.evidence.message}</p>
                  <small>
                    {item.evidence.source ?? item.evidence.request?.url ?? item.pageUrl}
                  </small>
                </div>
              </article>
            ))}
          </section>
        )}
        {visibleElementComments.length > 0 && (
          <section className="capture-notes-list element-notes-list">
            {visibleElementComments.map(({ comment: item, number }) => (
              <article className="capture-note-card element-note-card" key={item.id}>
                <div className="capture-note-head">
                  <span>
                    <i>{number}</i> 元素批注
                  </span>
                  <span>
                    {new Date(item.updatedAt).toLocaleTimeString([], {
                      hour: '2-digit',
                      minute: '2-digit',
                    })}
                    <Button
                      type="button"
                      title="删除"
                      onClick={() => void deleteElementComment(item.id)}
                    >
                      <Trash2 />
                    </Button>
                  </span>
                </div>
                {item.status === 'rejected' && (
                  <p className="annotation-rejection">
                    驳回原因：{item.rejectionReason ?? '未提供'}
                  </p>
                )}
                <Button
                  type="button"
                  className="element-note-select"
                  onClick={() => selectElementComment(item)}
                >
                  <code>{item.anchor.cssSelector}</code>
                  <p>{item.note}</p>
                  {(item.evidence?.length ?? 0) > 0 && (
                    <small className="saved-evidence-count">
                      <Paperclip /> {item.evidence?.length ?? 0} 条调试证据
                    </small>
                  )}
                </Button>
              </article>
            ))}
          </section>
        )}
      </div>
    </aside>
  );
}
