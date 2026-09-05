import { useEffect, useState } from 'react';
import { Alert, AlertDescription } from '@markfix/ui';
import { History } from '@markfix/ui/icons';
import type { AnnotationHistorySummary, WebsiteProject } from '@markfix/contracts';
import { HistoryPage } from './ProjectNavigation';

export function HistoryWindow(): React.JSX.Element {
  const [projects, setProjects] = useState<WebsiteProject[]>([]);
  const [summaries, setSummaries] = useState<AnnotationHistorySummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string>();

  useEffect(() => {
    let active = true;
    void Promise.all([
      window.markfix.listWebsiteProjects(),
      window.markfix.listAnnotationHistorySummaries(),
    ])
      .then(([savedProjects, savedSummaries]) => {
        if (!active) return;
        setProjects(savedProjects);
        setSummaries(savedSummaries);
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
          summaries={summaries}
          onSelectProject={(project) => void openProject(project.id)}
        />
      )}
    </main>
  );
}
