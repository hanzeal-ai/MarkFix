import { useEffect, useMemo, useState, type FormEvent } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  ArrowRight,
  ArrowLeft,
  CircleDot,
  Eye,
  EyeOff,
  MessageSquare,
  Search,
  Settings2,
  Sparkles,
  Users,
} from '@markfix/ui/icons';
import {
  Alert,
  AlertDescription,
  Badge,
  Button,
  Card,
  Input,
  Label,
  NativeSelect,
  Textarea,
} from '@markfix/ui';
import { MarkFixApi } from '@markfix/api-client';
import type {
  Annotation,
  CaptureContext,
  Environment,
  Project,
  Report,
  ReportStatus,
  WorkspaceSummary,
} from '@markfix/contracts';

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
  const initialToken = new URLSearchParams(window.location.search).get('token') ?? '';
  const [mode, setMode] = useState<'login' | 'register' | 'forgot' | 'reset'>(
    window.location.pathname.endsWith('/reset-password') && initialToken ? 'reset' : 'login',
  );
  const [resetToken, setResetToken] = useState(initialToken);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [displayName, setDisplayName] = useState('');
  const [workspaceName, setWorkspaceName] = useState('');
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!window.location.pathname.endsWith('/verify-email') || !initialToken) return;
    setBusy(true);
    void api
      .verifyEmail(initialToken)
      .then(() => {
        window.history.replaceState({}, '', '/');
        setMessage('Email verified. You can now sign in.');
      })
      .catch((error: unknown) =>
        setMessage(error instanceof Error ? error.message : 'Email verification failed'),
      )
      .finally(() => setBusy(false));
  }, [initialToken]);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setBusy(true);
    setMessage('');
    try {
      if (mode === 'forgot') {
        const result = await api.forgotPassword(email);
        if (result.resetToken) {
          setResetToken(result.resetToken);
          setMode('reset');
          setMessage('Choose a new password.');
        } else {
          setMessage('If that account exists, a password reset link has been sent.');
        }
        return;
      }
      if (mode === 'reset') {
        await api.resetPassword(resetToken, password);
        window.history.replaceState({}, '', '/');
        setPassword('');
        setMode('login');
        setMessage('Password updated. Sign in with your new password.');
        return;
      }
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

  const title =
    mode === 'login'
      ? 'Welcome back'
      : mode === 'register'
        ? 'Create your workspace'
        : mode === 'forgot'
          ? 'Reset your password'
          : 'Choose a new password';
  const submitLabel =
    mode === 'login'
      ? 'Sign in'
      : mode === 'register'
        ? 'Create account'
        : mode === 'forgot'
          ? 'Send reset link'
          : 'Update password';

  return (
    <main className="auth-shell">
      <Card className="auth-card">
        <div className="auth-brand">
          <span>m</span>
          <strong>MarkFix</strong>
        </div>
        <p className="eyebrow">VISUAL WEBSITE FEEDBACK</p>
        <h1>{title}</h1>
        <p>Turn website issues into precise, actionable reports.</p>
        <form onSubmit={(event) => void submit(event)}>
          {mode === 'register' && (
            <>
              <Label>
                Your name
                <Input
                  value={displayName}
                  onChange={(event) => setDisplayName(event.target.value)}
                  required
                />
              </Label>
              <Label>
                Workspace name
                <Input
                  value={workspaceName}
                  onChange={(event) => setWorkspaceName(event.target.value)}
                />
              </Label>
            </>
          )}
          {mode !== 'reset' && (
            <Label>
              {mode === 'login' ? 'Username or email' : 'Email'}
              <Input
                type={mode === 'login' ? 'text' : 'email'}
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                required
              />
            </Label>
          )}
          {mode !== 'forgot' && (
            <Label>
              {mode === 'reset' ? 'New password' : 'Password'}
              <span className="password-field">
                <Input
                  type={showPassword ? 'text' : 'password'}
                  minLength={mode === 'login' ? undefined : 10}
                  maxLength={200}
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                  required
                />
                <Button
                  className="password-toggle"
                  type="button"
                  variant="ghost"
                  size="icon"
                  aria-label={showPassword ? 'Hide password' : 'Show password'}
                  title={showPassword ? 'Hide password' : 'Show password'}
                  onClick={() => setShowPassword((visible) => !visible)}
                >
                  {showPassword ? <EyeOff size={17} /> : <Eye size={17} />}
                </Button>
              </span>
            </Label>
          )}
          {message && (
            <Alert className="auth-message">
              <AlertDescription>{message}</AlertDescription>
            </Alert>
          )}
          <Button className="primary" type="submit" disabled={busy}>
            {busy ? 'Please wait…' : submitLabel}
          </Button>
        </form>
        <Button
          className="auth-switch"
          type="button"
          variant="ghost"
          onClick={() => {
            setMessage('');
            setMode(mode === 'login' ? 'register' : 'login');
          }}
        >
          {mode === 'login' ? 'New to MarkFix? Create an account' : 'Back to sign in'}
        </Button>
        {mode === 'login' && (
          <Button
            className="auth-switch"
            type="button"
            variant="ghost"
            onClick={() => {
              setMessage('');
              setMode('forgot');
            }}
          >
            Forgot password?
          </Button>
        )}
      </Card>
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
      <Button className="back" variant="ghost" onClick={onBack}>
        <ArrowLeft /> Back to reports
      </Button>
      <section className="detail-header">
        <div>
          <div className="eyebrow">MF-{report.id.slice(0, 6).toUpperCase()}</div>
          <h1>{report.title}</h1>
          <p>{report.description}</p>
        </div>
        {action && canTransition && (
          <Button
            className="primary"
            disabled={transitionMutation.isPending}
            onClick={() => transitionMutation.mutate({ report, action: action.action })}
          >
            {action.label} <ArrowRight size={16} />
          </Button>
        )}
      </section>
      <div className="detail-grid">
        <Card className="capture-card">
          <CaptureViewer report={report} />
          <span className="capture-pill">
            <CircleDot size={14} /> {report.captureBundle.annotations.length} annotations
          </span>
        </Card>
        <aside className="discussion-card">
          <div className="status-row">
            <Badge variant="outline" className={`status ${report.status.toLocaleLowerCase()}`}>
              {statusLabel[report.status]}
            </Badge>
            <span className="priority">{report.priority}</span>
          </div>
          <div className="assignment-row">
            <Label>
              <span>Assignee</span>
              <NativeSelect
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
              </NativeSelect>
            </Label>
            <Label>
              <span>Priority</span>
              <NativeSelect
                value={report.priority}
                disabled={!canManage || updateMutation.isPending}
                onChange={(event) => updateMutation.mutate({ priority: event.target.value })}
              >
                {['LOW', 'MEDIUM', 'HIGH', 'URGENT'].map((priority) => (
                  <option key={priority}>{priority}</option>
                ))}
              </NativeSelect>
            </Label>
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
            <Textarea
              value={comment}
              onChange={(event) => setComment(event.target.value)}
              placeholder="Write a comment…"
            />
            <Button className="primary" type="submit" disabled={!comment.trim()}>
              Comment
            </Button>
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
          <Input
            type="email"
            required
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            placeholder="teammate@company.com"
          />
          <NativeSelect value={role} onChange={(event) => setRole(event.target.value)}>
            <option value="ADMIN">Admin</option>
            <option value="MEMBER">Member</option>
            <option value="REPORTER">Reporter</option>
          </NativeSelect>
          <Button className="primary" type="submit" disabled={invitation.isPending}>
            Send invite
          </Button>
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

type DashboardView = 'reports' | 'team' | 'projects';

function WorkspaceNavigation({
  view,
  workspaces,
  workspaceId,
  projectId,
  onView,
  onWorkspace,
  onProject,
}: {
  view: DashboardView;
  workspaces: WorkspaceSummary[];
  workspaceId: string | undefined;
  projectId: string | undefined;
  onView: (view: DashboardView) => void;
  onWorkspace: (workspaceId: string) => void;
  onProject: (projectId: string) => void;
}) {
  const workspace = workspaces.find((candidate) => candidate.id === workspaceId);
  return (
    <aside className="sidebar">
      <div className="brand">
        <span>m</span> MarkFix
      </div>
      <nav>
        <Button className={view === 'reports' ? 'active' : ''} onClick={() => onView('reports')}>
          <CircleDot size={17} /> Reports
        </Button>
        <Button className={view === 'team' ? 'active' : ''} onClick={() => onView('team')}>
          <Users size={17} /> Team
        </Button>
        <Button className={view === 'projects' ? 'active' : ''} onClick={() => onView('projects')}>
          <Settings2 size={17} /> Projects
        </Button>
      </nav>
      <div className="workspace">
        <Label htmlFor="workspace-select">WORKSPACE</Label>
        <NativeSelect
          id="workspace-select"
          value={workspaceId ?? ''}
          onChange={(event) => onWorkspace(event.target.value)}
        >
          {workspaces.map((candidate) => (
            <option key={candidate.id} value={candidate.id}>
              {candidate.name}
            </option>
          ))}
        </NativeSelect>
        <Label htmlFor="project-select">PROJECT</Label>
        <NativeSelect
          id="project-select"
          value={projectId ?? ''}
          onChange={(event) => onProject(event.target.value)}
          disabled={!workspace?.projects.length}
        >
          {!workspace?.projects.length && <option value="">No projects yet</option>}
          {workspace?.projects.map((project) => (
            <option key={project.id} value={project.id}>
              {project.name}
            </option>
          ))}
        </NativeSelect>
      </div>
    </aside>
  );
}

function EnvironmentEditor({
  environment,
  canManage,
}: {
  environment: Environment;
  canManage: boolean;
}) {
  const queryClient = useQueryClient();
  const [name, setName] = useState(environment.name);
  const [baseUrl, setBaseUrl] = useState(environment.baseUrl);
  const update = useMutation({
    mutationFn: () => api.updateEnvironment(environment.id, { name, baseUrl }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['environments', environment.projectId] });
    },
  });

  useEffect(() => {
    setName(environment.name);
    setBaseUrl(environment.baseUrl);
  }, [environment]);

  return (
    <form
      className="environment-row"
      onSubmit={(event) => {
        event.preventDefault();
        if (canManage && name.trim() && baseUrl) update.mutate();
      }}
    >
      <Label>
        Name
        <Input
          required
          maxLength={120}
          value={name}
          onChange={(event) => setName(event.target.value)}
          disabled={!canManage}
        />
      </Label>
      <Label>
        Base URL
        <Input
          required
          type="url"
          value={baseUrl}
          onChange={(event) => setBaseUrl(event.target.value)}
          disabled={!canManage}
        />
      </Label>
      <Button className="primary" type="submit" disabled={!canManage || update.isPending}>
        Save
      </Button>
      {update.error instanceof Error && <small>{update.error.message}</small>}
    </form>
  );
}

function ProjectsPanel({
  workspace,
  project,
  onWorkspaceCreated,
  onProjectCreated,
}: {
  workspace: WorkspaceSummary | undefined;
  project: Project | undefined;
  onWorkspaceCreated: (workspaceId: string) => void;
  onProjectCreated: (projectId: string) => void;
}) {
  const queryClient = useQueryClient();
  const [workspaceName, setWorkspaceName] = useState('');
  const [projectName, setProjectName] = useState('');
  const [editName, setEditName] = useState(project?.name ?? '');
  const [environmentName, setEnvironmentName] = useState('');
  const [environmentBaseUrl, setEnvironmentBaseUrl] = useState('');
  const [message, setMessage] = useState('');
  const canManage = workspace?.role === 'OWNER' || workspace?.role === 'ADMIN';
  const environments = useQuery({
    queryKey: ['environments', project?.id],
    queryFn: () => api.listEnvironments(project?.id as string),
    enabled: Boolean(project),
  });

  useEffect(() => {
    setEditName(project?.name ?? '');
  }, [project]);

  const createWorkspace = useMutation({
    mutationFn: () => api.createWorkspace(workspaceName),
    onSuccess: async (created) => {
      setWorkspaceName('');
      setMessage('Workspace created. Add its first project below.');
      await queryClient.invalidateQueries({ queryKey: ['workspaces'] });
      onWorkspaceCreated(created.id);
    },
  });
  const createProject = useMutation({
    mutationFn: () => api.createProject(workspace?.id as string, { name: projectName }),
    onSuccess: async (created) => {
      setProjectName('');
      setMessage('Project created.');
      await queryClient.invalidateQueries({ queryKey: ['workspaces'] });
      onProjectCreated(created.id);
    },
  });
  const updateProject = useMutation({
    mutationFn: () => api.updateProject(project?.id as string, { name: editName }),
    onSuccess: async () => {
      setMessage('Project settings saved.');
      await queryClient.invalidateQueries({ queryKey: ['workspaces'] });
    },
  });
  const createEnvironment = useMutation({
    mutationFn: () =>
      api.createEnvironment(project?.id as string, {
        name: environmentName,
        baseUrl: environmentBaseUrl,
      }),
    onSuccess: async () => {
      setEnvironmentName('');
      setEnvironmentBaseUrl('');
      setMessage('Environment created.');
      await queryClient.invalidateQueries({ queryKey: ['environments', project?.id] });
    },
  });

  const mutationError =
    createWorkspace.error ?? createProject.error ?? updateProject.error ?? createEnvironment.error;
  return (
    <main className="content projects-page">
      <header>
        <div>
          <span className="eyebrow">ORGANIZATION</span>
          <h1>Workspaces & projects</h1>
          <p>Create a separate boundary for each team and configure the websites they review.</p>
        </div>
      </header>
      {(message || mutationError) && (
        <Alert className="settings-message">
          <AlertDescription>
            {mutationError instanceof Error ? mutationError.message : message}
          </AlertDescription>
        </Alert>
      )}
      <section className="settings-grid">
        <form
          className="settings-card"
          onSubmit={(event) => {
            event.preventDefault();
            if (workspaceName.trim()) createWorkspace.mutate();
          }}
        >
          <span className="eyebrow">NEW WORKSPACE</span>
          <h2>Create a workspace</h2>
          <Label>
            Workspace name
            <Input
              required
              maxLength={120}
              value={workspaceName}
              onChange={(event) => setWorkspaceName(event.target.value)}
            />
          </Label>
          <Button className="primary" type="submit" disabled={createWorkspace.isPending}>
            Create workspace
          </Button>
        </form>
        <form
          className="settings-card"
          onSubmit={(event) => {
            event.preventDefault();
            if (workspace && projectName.trim()) createProject.mutate();
          }}
        >
          <span className="eyebrow">CURRENT WORKSPACE</span>
          <h2>Add a project</h2>
          <Label>
            Project name
            <Input
              required
              maxLength={120}
              value={projectName}
              onChange={(event) => setProjectName(event.target.value)}
              disabled={!canManage}
            />
          </Label>
          <Button
            className="primary"
            type="submit"
            disabled={!canManage || createProject.isPending}
          >
            Create project
          </Button>
          {!canManage && <small>Only workspace owners and admins can create projects.</small>}
        </form>
        {project && (
          <form
            className="settings-card"
            onSubmit={(event) => {
              event.preventDefault();
              if (editName.trim()) updateProject.mutate();
            }}
          >
            <span className="eyebrow">SELECTED PROJECT</span>
            <h2>Project settings</h2>
            <Label>
              Project name
              <Input
                required
                maxLength={120}
                value={editName}
                onChange={(event) => setEditName(event.target.value)}
                disabled={!canManage}
              />
            </Label>
            <Button
              className="primary"
              type="submit"
              disabled={!canManage || updateProject.isPending}
            >
              Save project
            </Button>
          </form>
        )}
        {project && (
          <form
            className="settings-card"
            onSubmit={(event) => {
              event.preventDefault();
              if (environmentName.trim() && environmentBaseUrl) createEnvironment.mutate();
            }}
          >
            <span className="eyebrow">SELECTED PROJECT</span>
            <h2>Add an environment</h2>
            <Label>
              Environment name
              <Input
                required
                maxLength={120}
                placeholder="Production"
                value={environmentName}
                onChange={(event) => setEnvironmentName(event.target.value)}
                disabled={!canManage}
              />
            </Label>
            <Label>
              Base URL
              <Input
                required
                type="url"
                placeholder="https://example.com"
                value={environmentBaseUrl}
                onChange={(event) => setEnvironmentBaseUrl(event.target.value)}
                disabled={!canManage}
              />
            </Label>
            <Button
              className="primary"
              type="submit"
              disabled={!canManage || createEnvironment.isPending}
            >
              Add environment
            </Button>
          </form>
        )}
      </section>
      {project && (
        <section className="environment-section">
          <div>
            <span className="eyebrow">ENVIRONMENTS</span>
            <h2>{project.name}</h2>
          </div>
          {environments.isPending && <p>Loading environments…</p>}
          {environments.data?.length === 0 && (
            <p>No environments yet. Add Production, Staging, or another website target above.</p>
          )}
          <div className="environment-list">
            {environments.data?.map((environment) => (
              <EnvironmentEditor
                key={environment.id}
                environment={environment}
                canManage={canManage}
              />
            ))}
          </div>
        </section>
      )}
    </main>
  );
}

export function App() {
  const queryClient = useQueryClient();
  const [selectedReportId, setSelectedReportId] = useState<string>();
  const [selectedWorkspaceId, setSelectedWorkspaceId] = useState<string>();
  const [selectedProjectId, setSelectedProjectId] = useState<string>();
  const [view, setView] = useState<DashboardView>('reports');
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
  const workspaces = useQuery({
    queryKey: ['workspaces'],
    queryFn: () => api.listWorkspaces(),
    enabled: bootstrap.isSuccess,
  });
  const currentWorkspace = workspaces.data?.find(
    (workspace) => workspace.id === selectedWorkspaceId,
  );
  const currentProject = currentWorkspace?.projects.find(
    (project) => project.id === selectedProjectId,
  );

  useEffect(() => {
    if (!workspaces.data?.length) return;
    if (workspaces.data.some((workspace) => workspace.id === selectedWorkspaceId)) return;
    const initial =
      workspaces.data.find((workspace) => workspace.id === bootstrap.data?.id) ??
      workspaces.data[0];
    if (!initial) return;
    setSelectedWorkspaceId(initial.id);
  }, [bootstrap.data?.id, selectedWorkspaceId, workspaces.data]);

  useEffect(() => {
    if (!currentWorkspace) return;
    if (currentWorkspace.projects.some((project) => project.id === selectedProjectId)) return;
    setSelectedProjectId(currentWorkspace.projects[0]?.id);
  }, [currentWorkspace, selectedProjectId]);

  const reports = useQuery({
    queryKey: ['reports', selectedProjectId, statusFilter, priorityFilter],
    queryFn: () =>
      api.listReports(selectedProjectId as string, {
        ...(statusFilter ? { status: statusFilter } : {}),
        ...(priorityFilter ? { priority: priorityFilter } : {}),
      }),
    enabled: Boolean(selectedProjectId),
  });
  const visibleReports = useMemo(
    () =>
      reports.data?.filter((report) =>
        report.title.toLocaleLowerCase().includes(search.toLocaleLowerCase()),
      ) ?? [],
    [reports.data, search],
  );
  const isAuthenticationAction =
    window.location.pathname.endsWith('/verify-email') ||
    window.location.pathname.endsWith('/reset-password');

  if (isAuthenticationAction) {
    return (
      <AuthScreen
        onAuthenticated={async () => {
          await queryClient.invalidateQueries({ queryKey: ['bootstrap'] });
        }}
      />
    );
  }

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

  if (workspaces.isPending || (workspaces.data?.length && !currentWorkspace)) {
    return <main className="loading">Loading workspaces…</main>;
  }

  if (selectedReportId && currentWorkspace)
    return (
      <ReportDetail
        reportId={selectedReportId}
        workspaceId={currentWorkspace.id}
        userId={currentUser.data?.id}
        role={currentWorkspace.role}
        onBack={() => setSelectedReportId(undefined)}
      />
    );

  return (
    <div className="app-shell">
      <WorkspaceNavigation
        view={view}
        workspaces={workspaces.data ?? []}
        workspaceId={currentWorkspace?.id}
        projectId={currentProject?.id}
        onView={setView}
        onWorkspace={(workspaceId) => {
          setSelectedReportId(undefined);
          setSelectedWorkspaceId(workspaceId);
          setSelectedProjectId(undefined);
        }}
        onProject={(projectId) => {
          setSelectedReportId(undefined);
          setSelectedProjectId(projectId);
        }}
      />
      {view === 'team' && currentWorkspace && (
        <TeamPanel
          workspaceId={currentWorkspace.id}
          canManage={currentWorkspace.role === 'OWNER' || currentWorkspace.role === 'ADMIN'}
        />
      )}
      {view === 'projects' && (
        <ProjectsPanel
          workspace={currentWorkspace}
          project={currentProject}
          onWorkspaceCreated={(workspaceId) => {
            setSelectedWorkspaceId(workspaceId);
            setSelectedProjectId(undefined);
          }}
          onProjectCreated={setSelectedProjectId}
        />
      )}
      {view === 'reports' && (
        <main className="content">
          <header>
            <div>
              <span className="eyebrow">PRODUCT FEEDBACK</span>
              <h1>Reports</h1>
              <p>See exactly what happened, where it happened.</p>
            </div>
            <Button
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
            </Button>
          </header>
          <div className="toolbar">
            <Label>
              <Search size={17} />
              <Input
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="Search reports"
              />
            </Label>
            <NativeSelect
              value={statusFilter}
              onChange={(event) => setStatusFilter(event.target.value)}
            >
              <option value="">All statuses</option>
              {Object.entries(statusLabel).map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </NativeSelect>
            <NativeSelect
              value={priorityFilter}
              onChange={(event) => setPriorityFilter(event.target.value)}
            >
              <option value="">All priorities</option>
              {['LOW', 'MEDIUM', 'HIGH', 'URGENT'].map((priority) => (
                <option key={priority}>{priority}</option>
              ))}
            </NativeSelect>
          </div>
          <section className="report-list">
            {!currentProject && (
              <div className="empty-state">
                <Settings2 />
                <h2>No project selected</h2>
                <p>Create a project before collecting website feedback.</p>
                <Button className="primary" onClick={() => setView('projects')}>
                  Manage projects
                </Button>
              </div>
            )}
            {currentProject && visibleReports.length === 0 && (
              <div className="empty-state">
                <Sparkles />
                <h2>No reports yet</h2>
                <p>Create your first visual report from the MarkFix desktop app.</p>
              </div>
            )}
            {currentProject &&
              visibleReports.map((report) => (
                <Button
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
                  <Badge
                    variant="outline"
                    className={`status ${report.status.toLocaleLowerCase()}`}
                  >
                    {statusLabel[report.status]}
                  </Badge>
                  <span className="annotation-count">
                    <MessageSquare size={15} /> {report.captureBundle.annotations.length}
                  </span>
                  <ArrowRight size={17} />
                </Button>
              ))}
          </section>
        </main>
      )}
    </div>
  );
}
