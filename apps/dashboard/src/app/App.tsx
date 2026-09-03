import { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ArrowRight, CheckCircle2, CircleDot, MessageSquare, Search, Sparkles } from 'lucide-react';
import { MarkFixApi } from '@markfix/api-client';
import type { Report, ReportStatus } from '@markfix/contracts';

const api = new MarkFixApi(import.meta.env.VITE_API_URL ?? 'http://localhost:4310');

const statusLabel: Record<ReportStatus, string> = {
  OPEN: 'Open',
  IN_PROGRESS: 'In progress',
  READY_FOR_VERIFY: 'Ready to verify',
  RESOLVED: 'Resolved',
  CLOSED: 'Closed',
};

const nextAction: Partial<Record<ReportStatus, { action: string; label: string }>> = {
  OPEN: { action: 'start', label: 'Start working' },
  IN_PROGRESS: { action: 'submit_for_verification', label: 'Send to verify' },
  READY_FOR_VERIFY: { action: 'verify', label: 'Verify fix' },
  RESOLVED: { action: 'close', label: 'Close report' },
  CLOSED: { action: 'reopen', label: 'Reopen' },
};

function ReportDetail({ reportId, onBack }: { reportId: string; onBack: () => void }) {
  const queryClient = useQueryClient();
  const [comment, setComment] = useState('');
  const reportQuery = useQuery({
    queryKey: ['report', reportId],
    queryFn: () => api.getReport(reportId),
  });
  const commentMutation = useMutation({
    mutationFn: () => api.addComment(reportId, comment),
    onSuccess: async () => {
      setComment('');
      await queryClient.invalidateQueries({ queryKey: ['report', reportId] });
    },
  });
  const transitionMutation = useMutation({
    mutationFn: ({ report, action }: { report: Report; action: string }) => {
      const detail =
        action === 'reopen'
          ? { reason: 'Needs more work' }
          : action === 'submit_for_verification'
            ? { resolutionSummary: 'Implementation completed' }
            : undefined;
      return api.transition(report.id, action, report.version, detail);
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['report', reportId] });
      await queryClient.invalidateQueries({ queryKey: ['reports'] });
    },
  });
  const report = reportQuery.data;
  if (!report) return <main className="loading">Loading report…</main>;
  const action = nextAction[report.status];

  return (
    <main className="detail-shell">
      <button className="back" onClick={onBack}>
        ← Back to reports
      </button>
      <section className="detail-header">
        <div>
          <div className="eyebrow">MF-{report.id.slice(0, 6).toUpperCase()}</div>
          <h1>{report.title}</h1>
          <p>{report.description}</p>
        </div>
        {action && (
          <button
            className="primary"
            disabled={transitionMutation.isPending}
            onClick={() => transitionMutation.mutate({ report, action: action.action })}
          >
            {action.label} <ArrowRight size={16} />
          </button>
        )}
      </section>
      <div className="detail-grid">
        <section className="capture-card">
          <img src={report.screenshotUrl} alt="Captured website with annotation" />
          <span className="capture-pill">
            <CircleDot size={14} /> {report.captureBundle.annotations.length} annotations
          </span>
        </section>
        <aside className="discussion-card">
          <div className="status-row">
            <span className={`status ${report.status.toLocaleLowerCase()}`}>
              {statusLabel[report.status]}
            </span>
            <span className="priority">{report.priority}</span>
          </div>
          <h2>
            <MessageSquare size={18} /> Discussion
          </h2>
          <div className="comments">
            {report.comments.length === 0 && <p className="empty">No comments yet.</p>}
            {report.comments.map((item) => (
              <article className="comment" key={item.id}>
                <strong>{item.authorName}</strong>
                <p>{item.body}</p>
              </article>
            ))}
          </div>
          <form
            onSubmit={(event) => {
              event.preventDefault();
              if (comment.trim()) commentMutation.mutate();
            }}
          >
            <textarea
              value={comment}
              onChange={(event) => setComment(event.target.value)}
              placeholder="Write a comment…"
            />
            <button className="primary" type="submit" disabled={!comment.trim()}>
              Comment
            </button>
          </form>
        </aside>
      </div>
    </main>
  );
}

export function App() {
  const [selectedReportId, setSelectedReportId] = useState<string>();
  const [search, setSearch] = useState('');
  const bootstrap = useQuery({ queryKey: ['bootstrap'], queryFn: () => api.bootstrap() });
  const projectId = bootstrap.data?.projects[0]?.id;
  const reports = useQuery({
    queryKey: ['reports', projectId],
    queryFn: () => api.listReports(projectId as string),
    enabled: Boolean(projectId),
  });
  const visibleReports = useMemo(
    () =>
      reports.data?.filter((report) =>
        report.title.toLocaleLowerCase().includes(search.toLocaleLowerCase()),
      ) ?? [],
    [reports.data, search],
  );

  if (selectedReportId)
    return (
      <ReportDetail reportId={selectedReportId} onBack={() => setSelectedReportId(undefined)} />
    );

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div className="brand">
          <span>m</span> MarkFix
        </div>
        <nav>
          <a className="active">
            <CircleDot size={17} /> Reports
          </a>
          <a>
            <CheckCircle2 size={17} /> Resolved
          </a>
        </nav>
        <div className="workspace">
          <small>WORKSPACE</small>
          <strong>{bootstrap.data?.name ?? 'Loading…'}</strong>
          <span>Website feedback</span>
        </div>
      </aside>
      <main className="content">
        <header>
          <div>
            <span className="eyebrow">PRODUCT FEEDBACK</span>
            <h1>Reports</h1>
            <p>See exactly what happened, where it happened.</p>
          </div>
          <div className="avatar">DU</div>
        </header>
        <div className="toolbar">
          <label>
            <Search size={17} />
            <input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Search reports"
            />
          </label>
          <button>All statuses</button>
        </div>
        <section className="report-list">
          {visibleReports.length === 0 && (
            <div className="empty-state">
              <Sparkles />
              <h2>No reports yet</h2>
              <p>Create your first visual report from the MarkFix desktop app.</p>
            </div>
          )}
          {visibleReports.map((report) => (
            <button
              className="report-row"
              key={report.id}
              onClick={() => setSelectedReportId(report.id)}
            >
              <span className={`dot ${report.priority.toLocaleLowerCase()}`} />
              <span className="report-main">
                <strong>{report.title}</strong>
                <small>
                  {new URL(report.captureBundle.page.url).hostname} ·{' '}
                  {new Date(report.createdAt).toLocaleString()}
                </small>
              </span>
              <span className={`status ${report.status.toLocaleLowerCase()}`}>
                {statusLabel[report.status]}
              </span>
              <span className="annotation-count">
                <MessageSquare size={15} /> {report.captureBundle.annotations.length}
              </span>
              <ArrowRight size={17} />
            </button>
          ))}
        </section>
      </main>
    </div>
  );
}
