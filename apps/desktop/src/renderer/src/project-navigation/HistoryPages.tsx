import { useMemo } from 'react';
import type { AnnotationHistorySummary, WebsiteProject } from '@markfix/contracts';
import { Badge, Button } from '@markfix/ui';
import { Camera, History, MessageSquareText, Terminal } from '@markfix/ui/icons';
import { WebsiteLogo } from './WebsiteLogo';
import { annotationCounts, type ProjectAnnotation } from './model';

function StatusBadge({ status }: { status: ProjectAnnotation['record']['status'] }) {
  const text = status === 'draft' ? '未提交' : status === 'submitted' ? '已提交' : '驳回';
  return (
    <Badge variant="outline" className={`annotation-status ${status}`}>
      {text}
    </Badge>
  );
}

export function ProjectHistoryDetail({
  project,
  annotations,
  onSelect,
}: {
  project: WebsiteProject;
  annotations: ProjectAnnotation[];
  onSelect: (annotation: ProjectAnnotation) => void;
}): React.JSX.Element {
  const counts = annotationCounts(annotations);
  return (
    <main className="project-history-page">
      <header>
        <div>
          <WebsiteLogo project={project} />
          <span>
            <h1>{project.title}</h1>
            <p>
              {new URL(project.origin).hostname} · {counts.total} 条标注
            </p>
          </span>
        </div>
      </header>
      <div className="project-history-stats">
        <span className="draft">
          <b>{counts.draft}</b>未提交
        </span>
        <span className="submitted">
          <b>{counts.submitted}</b>已提交
        </span>
        <span className="rejected">
          <b>{counts.rejected}</b>驳回
        </span>
      </div>
      <div className="project-history-list">
        {annotations.map((annotation) => (
          <Button
            type="button"
            key={`${annotation.type}-${annotation.record.id}`}
            onClick={() => onSelect(annotation)}
          >
            <span className="history-record-icon">
              {annotation.type === 'capture' ? (
                <Camera />
              ) : annotation.type === 'diagnostic' ? (
                <Terminal />
              ) : (
                <MessageSquareText />
              )}
            </span>
            <span className="history-record-copy">
              <span>
                <strong>
                  {annotation.type === 'capture'
                    ? '截图批注'
                    : annotation.type === 'diagnostic'
                      ? '调试标注'
                      : '元素批注'}
                </strong>
                <StatusBadge status={annotation.record.status} />
              </span>
              <small>{annotation.record.pageTitle || annotation.record.pageUrl}</small>
              <p>
                {annotation.type === 'diagnostic'
                  ? annotation.record.evidence.title
                  : annotation.record.note}
              </p>
            </span>
            <time>{new Date(annotation.record.updatedAt).toLocaleString()}</time>
          </Button>
        ))}
      </div>
    </main>
  );
}

export function HistoryPage({
  projects,
  summaries,
  onSelectProject,
}: {
  projects: WebsiteProject[];
  summaries: AnnotationHistorySummary[];
  onSelectProject: (project: WebsiteProject) => void;
}): React.JSX.Element {
  const entries = useMemo(
    () =>
      projects
        .map((project) => ({
          project,
          summary: summaries.find(({ projectId }) => projectId === project.id),
        }))
        .filter((entry): entry is { project: WebsiteProject; summary: AnnotationHistorySummary } =>
          Boolean(entry.summary),
        )
        .sort((left, right) => right.summary.updatedAt.localeCompare(left.summary.updatedAt)),
    [projects, summaries],
  );
  return (
    <main className="navigation-page history-page">
      <header>
        <span>
          <History />
        </span>
        <div>
          <h1>历史标注</h1>
          <p>按项目查看已保存的元素、截图和调试标注。</p>
        </div>
      </header>
      {entries.length === 0 ? (
        <div className="history-empty">
          <MessageSquareText />
          <strong>暂无历史标注</strong>
          <span>完成第一条批注后会显示在这里。</span>
        </div>
      ) : (
        <div className="history-project-grid">
          {entries.map(({ project, summary }) => (
            <Button
              type="button"
              key={project.id}
              className="history-project-card"
              onClick={() => onSelectProject(project)}
            >
              <WebsiteLogo project={project} />
              <span className="history-project-title">
                <strong>{project.title}</strong>
                <small>{new URL(project.origin).hostname}</small>
              </span>
              <b>{summary.total}</b>
              <span className="history-project-counts">
                <i className="draft">{summary.draft} 未提交</i>
                <i className="submitted">{summary.submitted} 已提交</i>
                <i className="rejected">{summary.rejected} 驳回</i>
              </span>
            </Button>
          ))}
        </div>
      )}
    </main>
  );
}
