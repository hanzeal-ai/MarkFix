import { useCallback, useEffect, useState } from 'react';
import { Alert, AlertDescription } from '@markfix/ui';
import type {
  AnnotationSubmission,
  SavedCapture,
  SavedDiagnosticAnnotation,
  SavedElementComment,
} from '@markfix/contracts';
import { AnnotationSaveDialog } from './AnnotationSaveDialog';
import {
  annotationSelectionReportInputs,
  type AnnotationSelection,
} from '@markfix/annotation-model';

export function AnnotationSaveWindow(): React.JSX.Element {
  const projectId = new URLSearchParams(window.location.search).get('projectId');
  const storageMode = new URLSearchParams(window.location.search).get('storageMode');
  const [projectName, setProjectName] = useState<string>();
  const [captures, setCaptures] = useState<SavedCapture[]>([]);
  const [diagnostics, setDiagnostics] = useState<SavedDiagnosticAnnotation[]>([]);
  const [elementComments, setElementComments] = useState<SavedElementComment[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();

  useEffect(() => {
    let active = true;
    if (!projectId || (storageMode !== 'LOCAL' && storageMode !== 'CLOUD')) {
      setError('缺少标注项目。');
      setLoading(false);
      return () => {
        active = false;
      };
    }
    void Promise.all([
      window.markfix.listCaptureRecords(projectId),
      window.markfix.listWebsiteProjects(),
      window.markfix.listElementComments(projectId),
      window.markfix.listDiagnosticAnnotations(projectId),
    ])
      .then(([savedCaptures, projects, savedComments, savedDiagnostics]) => {
        if (!active) return;
        setProjectName(projects.find((project) => project.id === projectId)?.title);
        setCaptures(savedCaptures.filter((capture) => capture.status === 'draft'));
        setElementComments(savedComments.filter((comment) => comment.status === 'draft'));
        setDiagnostics(savedDiagnostics.filter((diagnostic) => diagnostic.status === 'draft'));
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
  }, [projectId, storageMode]);

  const cancel = useCallback((): void => {
    void window.markfix.closeAnnotationReview();
  }, []);

  const previewCapture = useCallback((capture: SavedCapture): void => {
    setError(undefined);
    void window.markfix
      .openCapturePreview(projectId ?? '', capture.id)
      .catch((cause: unknown) =>
        setError(cause instanceof Error ? cause.message : '无法打开截图预览。'),
      );
  }, []);

  const submit = async (selection: AnnotationSelection): Promise<void> => {
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
      if (storageMode === 'CLOUD') {
        const reports = annotationSelectionReportInputs(projectId, selection);
        await Promise.all(
          reports.map(({ report, idempotencyKey }) =>
            window.markfix.submitReport(report, idempotencyKey),
          ),
        );
      }
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
      setError(cause instanceof Error ? cause.message : '提交标注失败，已保存的标注仍保留。');
      setBusy(false);
    }
  };

  return (
    <main className="annotation-review-window">
      <header className="annotation-review-heading">
        <h1>提交标注</h1>
        <p>
          {projectName ?? '当前项目'} ·{' '}
          {storageMode === 'LOCAL'
            ? '仅本机'
            : storageMode === 'CLOUD'
              ? '云端协作'
              : '存储范围待确认'}
        </p>
        <p>
          {storageMode === 'LOCAL'
            ? '提交后可供本机处理，标注不会上传到云端。'
            : storageMode === 'CLOUD'
              ? '仅提交勾选的标注，项目内有权限的成员可以查看。'
              : '请关闭窗口并重新选择项目。'}
        </p>
      </header>
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
