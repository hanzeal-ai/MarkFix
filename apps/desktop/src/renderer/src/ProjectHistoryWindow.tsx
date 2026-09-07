import { useEffect, useMemo, useState } from 'react';
import { Alert, AlertDescription } from '@markfix/ui';
import { History } from '@markfix/ui/icons';
import type {
  SavedCapture,
  SavedDiagnosticAnnotation,
  SavedElementComment,
  WebsiteProject,
} from '@markfix/contracts';
import {
  ProjectHistoryDetail,
  projectAnnotations,
  type ProjectAnnotation,
} from './ProjectNavigation';

export function ProjectHistoryWindow(): React.JSX.Element {
  const projectId = new URLSearchParams(window.location.search).get('projectId');
  const [project, setProject] = useState<WebsiteProject>();
  const [captures, setCaptures] = useState<SavedCapture[]>([]);
  const [diagnostics, setDiagnostics] = useState<SavedDiagnosticAnnotation[]>([]);
  const [elementComments, setElementComments] = useState<SavedElementComment[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string>();

  useEffect(() => {
    let active = true;
    if (!projectId) {
      setError('缺少项目信息。');
      setLoading(false);
      return () => {
        active = false;
      };
    }
    void Promise.all([
      window.markfix.listWebsiteProjects(),
      window.markfix.listCaptureRecords(projectId),
      window.markfix.listElementComments(projectId),
      window.markfix.listDiagnosticAnnotations(projectId),
    ])
      .then(([projects, savedCaptures, savedComments, savedDiagnostics]) => {
        if (!active) return;
        const selectedProject = projects.find(({ id }) => id === projectId);
        if (!selectedProject) throw new Error('项目不存在或已被移除');
        setProject(selectedProject);
        setCaptures(savedCaptures);
        setElementComments(savedComments);
        setDiagnostics(savedDiagnostics);
      })
      .catch((cause: unknown) => {
        if (active) setError(cause instanceof Error ? cause.message : '无法读取项目历史。');
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [projectId]);

  const annotations = useMemo(
    () => (projectId ? projectAnnotations(projectId, elementComments, captures, diagnostics) : []),
    [captures, diagnostics, elementComments, projectId],
  );

  const selectAnnotation = async (annotation: ProjectAnnotation): Promise<void> => {
    setError(undefined);
    try {
      if (!projectId) throw new Error('缺少项目信息。');
      await window.markfix.selectHistoricalAnnotation({
        type: annotation.type,
        projectId,
        id: annotation.record.id,
      });
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : '无法打开这条历史标注。');
    }
  };

  return (
    <main className="project-history-window">
      <div className="project-history-titlebar">
        <span>
          <History />
        </span>
        <strong>MarkFix</strong>
        <i>{project?.title ?? '项目历史'}</i>
      </div>
      {error && (
        <Alert className="project-history-error" variant="destructive">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}
      {loading ? (
        <div className="project-history-loading">正在加载项目历史…</div>
      ) : project ? (
        <ProjectHistoryDetail
          project={project}
          annotations={annotations}
          onSelect={(annotation) => void selectAnnotation(annotation)}
        />
      ) : null}
    </main>
  );
}
