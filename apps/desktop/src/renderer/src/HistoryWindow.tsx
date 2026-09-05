import { useEffect, useState } from 'react';
import { Alert, AlertDescription } from '@markfix/ui';
import { History } from '@markfix/ui/icons';
import type {
  SavedCapture,
  SavedDiagnosticAnnotation,
  SavedElementComment,
  WebsiteProject,
} from '@markfix/contracts';
import { HistoryPage } from './ProjectNavigation';

export function HistoryWindow(): React.JSX.Element {
  const [projects, setProjects] = useState<WebsiteProject[]>([]);
  const [captures, setCaptures] = useState<SavedCapture[]>([]);
  const [diagnostics, setDiagnostics] = useState<SavedDiagnosticAnnotation[]>([]);
  const [elementComments, setElementComments] = useState<SavedElementComment[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string>();

  useEffect(() => {
    let active = true;
    void Promise.all([
      window.markfix.listWebsiteProjects(),
      window.markfix.listCaptureRecords(),
      window.markfix.listElementComments(),
      window.markfix.listDiagnosticAnnotations(),
    ])
      .then(([savedProjects, savedCaptures, savedComments, savedDiagnostics]) => {
        if (!active) return;
        setProjects(savedProjects);
        setCaptures(savedCaptures);
        setElementComments(savedComments);
        setDiagnostics(savedDiagnostics);
      })
      .catch((cause: unknown) => {
        if (active) setError(cause instanceof Error ? cause.message : '无法读取历史标注。');
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, []);

  const openProject = async (projectId: string): Promise<void> => {
    setError(undefined);
    try {
      await window.markfix.openProjectAnnotationHistory(projectId);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : '无法打开项目历史。');
    }
  };

  return (
    <main className="annotation-history-window">
      <div className="annotation-history-titlebar">
        <span>
          <History />
        </span>
        <strong>MarkFix</strong>
        <i>历史标注</i>
      </div>
      {error && (
        <Alert className="annotation-history-error" variant="destructive">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}
      {loading ? (
        <div className="annotation-history-loading">正在加载历史标注…</div>
      ) : (
        <HistoryPage
          projects={projects}
          captures={captures}
          diagnostics={diagnostics}
          elementComments={elementComments}
          onSelectProject={(project) => void openProject(project.id)}
        />
      )}
    </main>
  );
}
