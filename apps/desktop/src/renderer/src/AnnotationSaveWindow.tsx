import { useCallback, useEffect, useState } from 'react';
import { Alert, AlertDescription } from '@markfix/ui';
import { MessageSquareText } from '@markfix/ui/icons';
import type {
  AnnotationSubmission,
  SavedCapture,
  SavedDiagnosticAnnotation,
  SavedElementComment,
} from '@markfix/contracts';
import { AnnotationSaveDialog } from './AnnotationSaveDialog';

export function AnnotationSaveWindow(): React.JSX.Element {
  const projectId = new URLSearchParams(window.location.search).get('projectId');
  const [captures, setCaptures] = useState<SavedCapture[]>([]);
  const [diagnostics, setDiagnostics] = useState<SavedDiagnosticAnnotation[]>([]);
  const [elementComments, setElementComments] = useState<SavedElementComment[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();

  useEffect(() => {
    let active = true;
    if (!projectId) {
      setError('缺少标注项目。');
      setLoading(false);
      return () => {
        active = false;
      };
    }
    void Promise.all([
      window.markfix.listCaptureRecords(),
      window.markfix.listElementComments(),
      window.markfix.listDiagnosticAnnotations(),
    ])
      .then(([savedCaptures, savedComments, savedDiagnostics]) => {
        if (!active) return;
        setCaptures(
          savedCaptures.filter(
            (capture) => capture.projectId === projectId && capture.status === 'draft',
          ),
        );
        setElementComments(
          savedComments.filter(
            (comment) => comment.projectId === projectId && comment.status === 'draft',
          ),
        );
        setDiagnostics(
          savedDiagnostics.filter(
            (diagnostic) => diagnostic.projectId === projectId && diagnostic.status === 'draft',
          ),
        );
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
  }, [projectId]);

  const cancel = useCallback((): void => {
    void window.markfix.closeAnnotationReview();
  }, []);

  const previewCapture = useCallback((capture: SavedCapture): void => {
    setError(undefined);
    void window.markfix
      .openCapturePreview(capture.id)
      .catch((cause: unknown) =>
        setError(cause instanceof Error ? cause.message : '无法打开截图预览。'),
      );
  }, []);

  const submit = async (selection: {
    captures: SavedCapture[];
    diagnostics: SavedDiagnosticAnnotation[];
    elementComments: SavedElementComment[];
  }): Promise<void> => {
    setBusy(true);
    setError(undefined);
    try {
      if (
        !projectId ||
        selection.elementComments.length +
          selection.captures.length +
          selection.diagnostics.length ===
          0
      )
        throw new Error('请选择至少一条标注。');
      if (
        [...selection.elementComments, ...selection.captures, ...selection.diagnostics].some(
          (record) => record.projectId !== projectId,
        )
      )
        throw new Error('一次只能提交同一项目的标注。');
      const submission = {
        id: crypto.randomUUID(),
        projectId,
        captures: selection.captures,
        diagnostics: selection.diagnostics,
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
      {error && (
        <Alert className="annotation-review-error" variant="destructive">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}
      {loading ? (
        <div className="annotation-review-loading">正在加载标注…</div>
      ) : (
        <AnnotationSaveDialog
          captures={captures}
          diagnostics={diagnostics}
          elementComments={elementComments}
          busy={busy}
          onCancel={cancel}
          onPreviewCapture={previewCapture}
          onSubmit={(selection) => void submit(selection)}
        />
      )}
    </main>
  );
}
