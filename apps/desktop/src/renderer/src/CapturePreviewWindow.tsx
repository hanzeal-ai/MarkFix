import { useEffect, useState } from 'react';
import { Alert, AlertDescription } from '@markfix/ui';
import { Camera } from '@markfix/ui/icons';
import type { SavedCapture } from '@markfix/contracts';

export function CapturePreviewWindow(): React.JSX.Element {
  const captureId = new URLSearchParams(window.location.search).get('captureId');
  const projectId = new URLSearchParams(window.location.search).get('projectId');
  const [capture, setCapture] = useState<SavedCapture>();
  const [error, setError] = useState<string>();

  useEffect(() => {
    if (!projectId || !captureId) {
      setError('缺少截图信息');
      return;
    }
    let active = true;
    void window.markfix
      .loadCapturePreview(projectId, captureId)
      .then((savedCapture) => {
        if (active) setCapture(savedCapture);
      })
      .catch((cause: unknown) => {
        if (active) setError(cause instanceof Error ? cause.message : '无法加载截图预览。');
      });
    return () => {
      active = false;
    };
  }, [captureId, projectId]);

  return (
    <main className="capture-preview-window">
      <div className="capture-preview-titlebar">
        <span>
          <Camera />
        </span>
        <strong>MarkFix</strong>
        <i>截图预览</i>
      </div>
      {error ? (
        <Alert className="capture-preview-error" variant="destructive">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      ) : capture ? (
        <figure>
          <img src={capture.dataUrl} alt={capture.note} />
          <figcaption>
            <strong>{capture.note}</strong>
            <span>
              {Math.round(capture.widthCssPx)} × {Math.round(capture.heightCssPx)} px ·{' '}
              {capture.pageUrl}
            </span>
          </figcaption>
        </figure>
      ) : (
        <div className="capture-preview-loading">正在加载截图…</div>
      )}
    </main>
  );
}
