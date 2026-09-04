import { useCallback, useEffect, useState } from 'react';
import { MessageSquareText } from 'lucide-react';
import type { AnnotationSubmission, SavedCapture, SavedElementComment } from '@markfix/contracts';
import { AnnotationSaveDialog } from './AnnotationSaveDialog';

export function AnnotationSaveWindow(): React.JSX.Element {
  const [captures, setCaptures] = useState<SavedCapture[]>([]);
  const [elementComments, setElementComments] = useState<SavedElementComment[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();

  useEffect(() => {
    let active = true;
    void Promise.all([window.markfix.listCaptureRecords(), window.markfix.listElementComments()])
      .then(([savedCaptures, savedComments]) => {
        if (!active) return;
        setCaptures(savedCaptures);
        setElementComments(savedComments);
      })
      .catch((cause: unknown) => {
        if (active) setError(cause instanceof Error ? cause.message : '无法读取本机标注。');
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, []);

  const cancel = useCallback((): void => {
    void window.markfix.closeAnnotationReview();
  }, []);

  const submit = async (selection: {
    captures: SavedCapture[];
    elementComments: SavedElementComment[];
  }): Promise<void> => {
    setBusy(true);
    setError(undefined);
    try {
      const submission = {
        id: crypto.randomUUID(),
        captures: selection.captures,
        elementComments: selection.elementComments,
        submittedAt: new Date().toISOString(),
      } satisfies AnnotationSubmission;
      await window.markfix.saveAnnotationSubmission(submission);
      await window.markfix.closeAnnotationReview();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : '保存标注失败。');
      setBusy(false);
    }
  };

  return (
    <main className="annotation-review-window">
      <div className="annotation-review-titlebar">
        <span>
          <MessageSquareText />
        </span>
        <strong>MarkFix</strong>
        <i>标注确认</i>
      </div>
      {error && <div className="annotation-review-error">{error}</div>}
      {loading ? (
        <div className="annotation-review-loading">正在加载标注…</div>
      ) : (
        <AnnotationSaveDialog
          captures={captures}
          elementComments={elementComments}
          busy={busy}
          onCancel={cancel}
          onSubmit={(selection) => void submit(selection)}
        />
      )}
    </main>
  );
}
