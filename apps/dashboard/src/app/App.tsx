import { useMemo, useState, type FormEvent } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ArrowRight, CircleDot, MessageSquare, Search, Sparkles, Users } from 'lucide-react';
import { MarkFixApi } from '@markfix/api-client';
import type { Annotation, CaptureContext, Report, ReportStatus } from '@markfix/contracts';

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

function AuthScreen({ onAuthenticated }: { onAuthenticated: () => Promise<void> }) {
  const [mode, setMode] = useState<'login' | 'register'>('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [workspaceName, setWorkspaceName] = useState('');
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setBusy(true);
    setMessage('');
    try {
      if (mode === 'register') {
        const result = await api.register({
          email,
          password,
          displayName,
          ...(workspaceName ? { workspaceName } : {}),
        });
        if (!result.verificationToken) {
          setMessage('Account created. Verify your email before signing in.');
          return;
        }
        await api.verifyEmail(result.verificationToken);
      }
      await api.login(email, password);
      await onAuthenticated();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Authentication failed');
    } finally {
      setBusy(false);
    }
  };

  return (
    <main className="auth-shell">
      <section className="auth-card">
        <div className="auth-brand">
          <span>m</span>
          <strong>MarkFix</strong>
        </div>
        <p className="eyebrow">VISUAL WEBSITE FEEDBACK</p>
        <h1>{mode === 'login' ? 'Welcome back' : 'Create your workspace'}</h1>
        <p>Turn website issues into precise, actionable reports.</p>
        <form onSubmit={(event) => void submit(event)}>
          {mode === 'register' && (
            <>
              <label>
                Your name
                <input
                  value={displayName}
                  onChange={(event) => setDisplayName(event.target.value)}
                  required
                />
              </label>
              <label>
                Workspace name
                <input
                  value={workspaceName}
                  onChange={(event) => setWorkspaceName(event.target.value)}
                />
              </label>
            </>
          )}
          <label>
            Email
            <input
              type="email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              required
            />
          </label>
          <label>
            Password
            <input
              type="password"
              minLength={10}
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              required
            />
          </label>
          {message && <div className="auth-message">{message}</div>}
          <button className="primary" type="submit" disabled={busy}>
            {busy ? 'Please wait…' : mode === 'login' ? 'Sign in' : 'Create account'}
          </button>
        </form>
        <button
          className="auth-switch"
          type="button"
          onClick={() => {
            setMessage('');
            setMode(mode === 'login' ? 'register' : 'login');
          }}
        >
          {mode === 'login'
            ? 'New to MarkFix? Create an account'
            : 'Already have an account? Sign in'}
        </button>
      </section>
    </main>
  );
}

const annotationShape = (annotation: Annotation, capture: CaptureContext) => {
  const x = (value: number) => value - capture.originCssPx.x;
  const y = (value: number) => value - capture.originCssPx.y;
  if (annotation.type === 'pin')
    return (
      <g key={annotation.id}>
        <circle cx={x(annotation.position.x)} cy={y(annotation.position.y)} r="13" />
        <text x={x(annotation.position.x)} y={y(annotation.position.y) + 4}>
          {annotation.label}
        </text>
      </g>
    );
  if (annotation.type === 'rectangle')
    return (
      <rect
        key={annotation.id}
        x={x(Math.min(annotation.start.x, annotation.end.x))}
        y={y(Math.min(annotation.start.y, annotation.end.y))}
        width={Math.abs(annotation.end.x - annotation.start.x)}
        height={Math.abs(annotation.end.y - annotation.start.y)}
        fill={`${annotation.color}20`}
        stroke={annotation.color}
      />
    );
  if (annotation.type === 'arrow')
    return (
      <line
        key={annotation.id}
        x1={x(annotation.start.x)}
        y1={y(annotation.start.y)}
        x2={x(annotation.end.x)}
        y2={y(annotation.end.y)}
        stroke={annotation.color}
      />
    );
  if (annotation.type === 'pen')
    return (
      <polyline
        key={annotation.id}
        points={annotation.points.map((point) => `${x(point.x)},${y(point.y)}`).join(' ')}
        stroke={annotation.color}
        fill="none"
      />
    );
  return (
    <text
      key={annotation.id}
      className="annotation-text"
      x={x(annotation.position.x)}
      y={y(annotation.position.y)}
      fill={annotation.color}
    >
      {annotation.text}
    </text>
  );
};

function CaptureViewer({ report }: { report: Report }) {
  const capture: CaptureContext = report.captureBundle.capture ?? {
    mode: 'visible',
    imageWidthPx: report.captureBundle.page.viewportWidthCssPx,
    imageHeightPx: report.captureBundle.page.viewportHeightCssPx,
    widthCssPx: report.captureBundle.page.viewportWidthCssPx,
    heightCssPx: report.captureBundle.page.viewportHeightCssPx,
    originCssPx: { x: 0, y: 0 },
    captureScale: 1,
    truncated: false,
  };
  return (
    <div className="capture-visual">
      <img src={report.screenshotUrl} alt="Captured website" />
      <svg
        viewBox={`0 0 ${capture.widthCssPx} ${capture.heightCssPx}`}
        preserveAspectRatio="xMidYMid meet"
        aria-label="Captured annotations"
      >
        {report.captureBundle.annotations.map((annotation) => annotationShape(annotation, capture))}
      </svg>
    </div>
  );
}

function ReportDetail({
  reportId,
  workspaceId,
  userId,
  role,
  onBack,
}: {
  reportId: string;
  workspaceId: string;
  userId: string | undefined;
  role: string | undefined;
  onBack: () => void;
}) {
  const queryClient = useQueryClient();
  const [comment, setComment] = useState('');
  const reportQuery = useQuery({
    queryKey: ['report', reportId],
    queryFn: () => api.getReport(reportId),
  });
  const membersQuery = useQuery({
    queryKey: ['members', workspaceId],
    queryFn: () => api.listMembers(workspaceId),
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
  const updateMutation = useMutation({
    mutationFn: (update: { assigneeId?: string | null; priority?: string }) =>
      api.updateReport(reportId, { ...update, expectedVersion: reportQuery.data?.version ?? 0 }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['report', reportId] });
      await queryClient.invalidateQueries({ queryKey: ['reports'] });
    },
  });
  const report = reportQuery.data;
  if (!report) return <main className="loading">Loading report…</main>;
  const action = nextAction[report.status];
  const canManage = role === 'OWNER' || role === 'ADMIN';
  const canTransition =
    canManage ||
    ((action?.action === 'start' || action?.action === 'submit_for_verification') &&
      report.assignee?.id === userId) ||
    (['verify', 'close'].includes(action?.action ?? '') && report.reporter?.id === userId) ||
    (action?.action === 'reopen' && (report.reporter?.id === userId || role === 'MEMBER'));

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
        {action && canTransition && (
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
          <CaptureViewer report={report} />
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
          <div className="assignment-row">
            <label>
              <span>Assignee</span>
              <select
                value={report.assignee?.id ?? ''}
                disabled={!canManage || updateMutation.isPending}
                onChange={(event) =>
                  updateMutation.mutate({ assigneeId: event.target.value || null })
                }
              >
                <option value="">Unassigned</option>
                {membersQuery.data?.map((membership) => (
                  <option key={membership.userId} value={membership.userId}>
                    {membership.user.displayName}
                  </option>
                ))}
              </select>
            </label>
            <label>
              <span>Priority</span>
              <select
                value={report.priority}
                disabled={!canManage || updateMutation.isPending}
                onChange={(event) => updateMutation.mutate({ priority: event.target.value })}
              >
                {['LOW', 'MEDIUM', 'HIGH', 'URGENT'].map((priority) => (
                  <option key={priority}>{priority}</option>
                ))}
              </select>
            </label>
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

function TeamPanel({ workspaceId, canManage }: { workspaceId: string; canManage: boolean }) {
  const queryClient = useQueryClient();
  const [email, setEmail] = useState('');
  const [role, setRole] = useState('MEMBER');
  const [inviteToken, setInviteToken] = useState<string>();
  const members = useQuery({
    queryKey: ['members', workspaceId],
    queryFn: () => api.listMembers(workspaceId),
  });
  const invitation = useMutation({
    mutationFn: () => api.createInvitation(workspaceId, email, role),
    onSuccess: async (result) => {
      setEmail('');
      setInviteToken(result.token);
      await queryClient.invalidateQueries({ queryKey: ['members', workspaceId] });
    },
  });
  return (
    <main className="content team-page">
      <header>
        <div>
          <span className="eyebrow">WORKSPACE</span>
          <h1>Team</h1>
          <p>Invite collaborators and manage who can work on reports.</p>
        </div>
      </header>
      {canManage && (
        <form
          className="invite-form"
          onSubmit={(event) => {
            event.preventDefault();
            if (email.trim()) invitation.mutate();
          }}
        >
          <input
            type="email"
            required
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            placeholder="teammate@company.com"
          />
          <select value={role} onChange={(event) => setRole(event.target.value)}>
            <option value="ADMIN">Admin</option>
            <option value="MEMBER">Member</option>
            <option value="REPORTER">Reporter</option>
          </select>
          <button className="primary" type="submit" disabled={invitation.isPending}>
            Send invite
          </button>
        </form>
      )}
      {inviteToken && (
        <div className="invite-token">
          Invitation created. Share token: <code>{inviteToken}</code>
        </div>
      )}
      <section className="member-list">
        {members.data?.map((membership) => (
          <article key={membership.userId}>
            <div className="avatar">{membership.user.displayName.slice(0, 2).toUpperCase()}</div>
            <div>
              <strong>{membership.user.displayName}</strong>
              <span>{membership.user.email}</span>
            </div>
            <b>{membership.role}</b>
          </article>
        ))}
      </section>
    </main>
  );
}

export function App() {
  const queryClient = useQueryClient();
  const [selectedReportId, setSelectedReportId] = useState<string>();
  const [view, setView] = useState<'reports' | 'team'>('reports');
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [priorityFilter, setPriorityFilter] = useState('');
  const bootstrap = useQuery({
    queryKey: ['bootstrap'],
    queryFn: () => api.bootstrap(),
    retry: false,
  });
  const currentUser = useQuery({
    queryKey: ['me'],
    queryFn: () => api.me(),
    enabled: bootstrap.isSuccess,
  });
  const projectId = bootstrap.data?.projects[0]?.id;
  const reports = useQuery({
    queryKey: ['reports', projectId, statusFilter, priorityFilter],
    queryFn: () =>
      api.listReports(projectId as string, {
        ...(statusFilter ? { status: statusFilter } : {}),
        ...(priorityFilter ? { priority: priorityFilter } : {}),
      }),
    enabled: Boolean(projectId),
  });
  const visibleReports = useMemo(
    () =>
      reports.data?.filter((report) =>
        report.title.toLocaleLowerCase().includes(search.toLocaleLowerCase()),
      ) ?? [],
    [reports.data, search],
  );
  const currentMembership = bootstrap.data?.memberships.find(
    (membership) => membership.userId === currentUser.data?.id,
  );

  if (bootstrap.isPending) return <main className="loading">Loading MarkFix…</main>;
  if (bootstrap.isError) {
    return (
      <AuthScreen
        onAuthenticated={async () => {
          await queryClient.invalidateQueries({ queryKey: ['bootstrap'] });
        }}
      />
    );
  }

  if (selectedReportId && bootstrap.data)
    return (
      <ReportDetail
        reportId={selectedReportId}
        workspaceId={bootstrap.data.id}
        userId={currentUser.data?.id}
        role={currentMembership?.role}
        onBack={() => setSelectedReportId(undefined)}
      />
    );

  if (view === 'team' && bootstrap.data)
    return (
      <div className="app-shell">
        <aside className="sidebar">
          <div className="brand">
            <span>m</span> MarkFix
          </div>
          <nav>
            <button onClick={() => setView('reports')}>
              <CircleDot size={17} /> Reports
            </button>
            <button className="active">
              <Users size={17} /> Team
            </button>
          </nav>
        </aside>
        <TeamPanel
          workspaceId={bootstrap.data.id}
          canManage={currentMembership?.role === 'OWNER' || currentMembership?.role === 'ADMIN'}
        />
      </div>
    );

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div className="brand">
          <span>m</span> MarkFix
        </div>
        <nav>
          <button className="active">
            <CircleDot size={17} /> Reports
          </button>
          <button onClick={() => setView('team')}>
            <Users size={17} /> Team
          </button>
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
          <button
            className="avatar"
            title="Sign out"
            onClick={() =>
              void api.logout().finally(() => {
                queryClient.clear();
                window.location.reload();
              })
            }
          >
            {(currentUser.data?.displayName ?? 'User').slice(0, 2).toUpperCase()}
          </button>
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
          <select value={statusFilter} onChange={(event) => setStatusFilter(event.target.value)}>
            <option value="">All statuses</option>
            {Object.entries(statusLabel).map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>
          <select
            value={priorityFilter}
            onChange={(event) => setPriorityFilter(event.target.value)}
          >
            <option value="">All priorities</option>
            {['LOW', 'MEDIUM', 'HIGH', 'URGENT'].map((priority) => (
              <option key={priority}>{priority}</option>
            ))}
          </select>
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
