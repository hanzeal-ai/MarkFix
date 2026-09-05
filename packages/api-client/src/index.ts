import {
  clientPolicySchema,
  createEnvironmentSchema,
  createProjectSchema,
  createReportSchema,
  createWorkspaceSchema,
  environmentSchema,
  projectSchema,
  reportSchema,
  updateEnvironmentSchema,
  updateProjectSchema,
  workspaceSummarySchema,
  type Comment,
  type ClientPolicy,
  type CreateEnvironment,
  type CreateProject,
  type CreateReport,
  type Environment,
  type Membership,
  type Project,
  type Report,
  type UpdateEnvironment,
  type UpdateProject,
  type WorkspaceSummary,
} from '@markfix/contracts';

type Bootstrap = {
  id: string;
  name: string;
  projects: Array<{ id: string; name: string }>;
  memberships: Membership[];
};
type DetailedReport = Report & { comments: Comment[]; activities: Array<Record<string, unknown>> };
export type AuthTokens = { accessToken: string; refreshToken: string; expiresIn: number };
export type AuthUser = {
  id: string;
  email: string;
  displayName: string;
  emailVerified: boolean;
};
export type WorkspaceSubscription = {
  plan: 'FREE' | 'TEAM';
  planName: string;
  projectLimit: number | null;
  memberLimit: number | null;
  usage: { projects: number; members: number };
  upgradeRequestedAt: string | null;
};
export type SubscriptionUpgradeResult = WorkspaceSubscription & {
  upgraded: boolean;
  alreadyUpgraded: boolean;
  upgradeRequested?: boolean;
  upgradeUrl?: string;
};

const dataUrlBytes = (dataUrl: string): Uint8Array => {
  const base64 = dataUrl.slice(dataUrl.indexOf(',') + 1);
  const nodeBuffer = (
    globalThis as unknown as {
      Buffer?: { from(value: string, encoding: string): Uint8Array };
    }
  ).Buffer;
  if (nodeBuffer) return new Uint8Array(nodeBuffer.from(base64, 'base64'));
  const binary = atob(base64);
  return Uint8Array.from(binary, (character) => character.charCodeAt(0));
};

const digestHex = async (bytes: Uint8Array): Promise<string> => {
  const digest = await crypto.subtle.digest('SHA-256', bytes as BufferSource);
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, '0')).join('');
};

export class MarkFixApi {
  private accessToken: string | undefined;
  private refreshToken: string | undefined;

  constructor(private readonly baseUrl = 'http://localhost:4310') {}

  setTokens(tokens?: { accessToken: string; refreshToken?: string }): void {
    this.accessToken = tokens?.accessToken;
    this.refreshToken = tokens?.refreshToken;
  }

  currentRefreshToken(): string | undefined {
    return this.refreshToken;
  }

  private async request<T>(path: string, init?: RequestInit, retry = true): Promise<T> {
    const response = await fetch(`${this.baseUrl}${path}`, {
      ...init,
      credentials: 'include',
      headers: {
        'content-type': 'application/json',
        ...(this.accessToken ? { authorization: `Bearer ${this.accessToken}` } : {}),
        ...init?.headers,
      },
    });
    if (response.status === 401 && retry && !path.startsWith('/v1/auth/')) {
      await this.refreshSession();
      return this.request(path, init, false);
    }
    if (!response.ok) {
      const body = (await response.json().catch(() => undefined)) as
        | { message?: string }
        | undefined;
      throw new Error(body?.message ?? `Request failed with ${response.status}`);
    }
    return (await response.json()) as T;
  }

  async register(input: {
    email: string;
    password: string;
    displayName: string;
    workspaceName?: string;
  }): Promise<{ user: AuthUser; verificationRequired: boolean; verificationToken?: string }> {
    return this.request('/v1/auth/register', { method: 'POST', body: JSON.stringify(input) });
  }

  verifyEmail(token: string): Promise<{ verified: boolean }> {
    return this.request('/v1/auth/verify-email', {
      method: 'POST',
      body: JSON.stringify({ token }),
    });
  }

  forgotPassword(email: string): Promise<{ accepted: boolean; resetToken?: string }> {
    return this.request('/v1/auth/forgot-password', {
      method: 'POST',
      body: JSON.stringify({ email }),
    });
  }

  resetPassword(token: string, password: string): Promise<{ reset: boolean }> {
    return this.request('/v1/auth/reset-password', {
      method: 'POST',
      body: JSON.stringify({ token, password }),
    });
  }

  async login(email: string, password: string, deviceName = 'Web dashboard'): Promise<void> {
    await this.request<{ expiresIn: number }>('/v1/auth/login', {
      method: 'POST',
      body: JSON.stringify({ email, password, deviceName }),
    });
  }

  async loginWithTokens(email: string, password: string, deviceName: string): Promise<AuthTokens> {
    const tokens = await this.request<AuthTokens>('/v1/auth/login', {
      method: 'POST',
      body: JSON.stringify({ email, password, deviceName, clientType: 'desktop' }),
    });
    this.setTokens(tokens);
    return tokens;
  }

  async refreshWithToken(): Promise<AuthTokens> {
    if (!this.refreshToken) throw new Error('No desktop refresh token is available');
    const tokens = await this.refreshSession();
    if (!('accessToken' in tokens) || !tokens.accessToken || !tokens.refreshToken) {
      throw new Error('The API did not return desktop session credentials');
    }
    return tokens as AuthTokens;
  }

  private async refreshSession(): Promise<AuthTokens | { expiresIn: number }> {
    const tokens = await this.request<AuthTokens | { expiresIn: number }>(
      '/v1/auth/refresh',
      {
        method: 'POST',
        body: JSON.stringify({ ...(this.refreshToken ? { refreshToken: this.refreshToken } : {}) }),
      },
      false,
    );
    if ('accessToken' in tokens && tokens.accessToken && tokens.refreshToken)
      this.setTokens(tokens);
    return tokens;
  }

  async logout(): Promise<void> {
    await this.request('/v1/auth/logout', { method: 'POST', body: '{}' });
    this.setTokens();
  }

  me(): Promise<AuthUser> {
    return this.request('/v1/me');
  }

  async clientPolicy(version: string, platform: string, arch: string): Promise<ClientPolicy> {
    const query = new URLSearchParams({ version, platform, arch });
    return clientPolicySchema.parse(await this.request(`/v1/client-policy?${query}`));
  }

  bootstrap(): Promise<Bootstrap> {
    return this.request('/v1/bootstrap');
  }

  async listWorkspaces(): Promise<WorkspaceSummary[]> {
    return workspaceSummarySchema.array().parse(await this.request('/v1/workspaces'));
  }

  getSubscription(workspaceId: string): Promise<WorkspaceSubscription> {
    return this.request(`/v1/workspaces/${workspaceId}/subscription`);
  }

  requestSubscriptionUpgrade(workspaceId: string): Promise<SubscriptionUpgradeResult> {
    return this.request(`/v1/workspaces/${workspaceId}/subscription/upgrade`, {
      method: 'POST',
      body: '{}',
    });
  }

  async createWorkspace(name: string): Promise<WorkspaceSummary> {
    const input = createWorkspaceSchema.parse({ name });
    return workspaceSummarySchema.parse(
      await this.request('/v1/workspaces', {
        method: 'POST',
        body: JSON.stringify(input),
      }),
    );
  }

  async listProjects(workspaceId: string): Promise<Project[]> {
    return projectSchema
      .array()
      .parse(await this.request(`/v1/workspaces/${workspaceId}/projects`));
  }

  async createProject(workspaceId: string, input: CreateProject): Promise<Project> {
    const parsed = createProjectSchema.parse(input);
    return projectSchema.parse(
      await this.request(`/v1/workspaces/${workspaceId}/projects`, {
        method: 'POST',
        body: JSON.stringify(parsed),
      }),
    );
  }

  async getProject(projectId: string): Promise<Project> {
    return projectSchema.parse(await this.request(`/v1/projects/${projectId}`));
  }

  async updateProject(projectId: string, update: UpdateProject): Promise<Project> {
    const parsed = updateProjectSchema.parse(update);
    return projectSchema.parse(
      await this.request(`/v1/projects/${projectId}`, {
        method: 'PATCH',
        body: JSON.stringify(parsed),
      }),
    );
  }

  async listEnvironments(projectId: string): Promise<Environment[]> {
    return environmentSchema
      .array()
      .parse(await this.request(`/v1/projects/${projectId}/environments`));
  }

  async createEnvironment(projectId: string, input: CreateEnvironment): Promise<Environment> {
    const parsed = createEnvironmentSchema.parse(input);
    return environmentSchema.parse(
      await this.request(`/v1/projects/${projectId}/environments`, {
        method: 'POST',
        body: JSON.stringify(parsed),
      }),
    );
  }

  async updateEnvironment(environmentId: string, update: UpdateEnvironment): Promise<Environment> {
    const parsed = updateEnvironmentSchema.parse(update);
    return environmentSchema.parse(
      await this.request(`/v1/environments/${environmentId}`, {
        method: 'PATCH',
        body: JSON.stringify(parsed),
      }),
    );
  }

  async submitReport(
    input: CreateReport,
    idempotencyKey: string = crypto.randomUUID(),
  ): Promise<Report> {
    const parsed = createReportSchema.parse(input);
    const { screenshotDataUrl, ...payload } = parsed;
    const submission = await this.request<{
      id: string;
      artifact?: { id: string; uploadStatus: string } | null;
      report?: Record<string, unknown> | null;
    }>(`/v1/projects/${parsed.projectId}/report-submissions`, {
      method: 'POST',
      headers: { 'idempotency-key': idempotencyKey },
      body: JSON.stringify(payload),
    });
    if (submission.report) {
      return reportSchema.parse({
        ...submission.report,
        screenshotUrl: `${this.baseUrl}/v1/artifacts/${String(submission.report.screenshotPath)}`,
      });
    }
    const bytes = dataUrlBytes(screenshotDataUrl);
    const presigned = await this.request<{ artifactId: string; uploadUrl: string }>(
      `/v1/report-submissions/${submission.id}/artifacts/presign`,
      {
        method: 'POST',
        body: JSON.stringify({
          mimeType: 'image/png',
          size: bytes.byteLength,
          sha256: await digestHex(bytes),
        }),
      },
    );
    await this.request(presigned.uploadUrl, {
      method: 'PUT',
      body: JSON.stringify({ dataUrl: screenshotDataUrl }),
    });
    const report = await this.request<Record<string, unknown>>(
      `/v1/report-submissions/${submission.id}/finalize`,
      {
        method: 'POST',
        body: '{}',
      },
    );
    return reportSchema.parse({
      ...report,
      screenshotUrl: `${this.baseUrl}/v1/artifacts/${(report as { screenshotPath: string }).screenshotPath}`,
    });
  }

  async listReports(
    projectId: string,
    filters: { status?: string; priority?: string; assigneeId?: string; cursor?: string } = {},
  ): Promise<Report[]> {
    const query = new URLSearchParams(
      Object.entries(filters).filter((entry): entry is [string, string] => Boolean(entry[1])),
    );
    const page = await this.request<{
      items: Array<Record<string, unknown>>;
      nextCursor?: string;
    }>(`/v1/projects/${projectId}/reports?${query}`);
    return page.items.map((report) =>
      reportSchema.parse({
        ...report,
        screenshotUrl: `${this.baseUrl}/v1/artifacts/${String(report.screenshotPath)}`,
      }),
    );
  }

  listMembers(workspaceId: string): Promise<Membership[]> {
    return this.request(`/v1/workspaces/${workspaceId}/members`);
  }

  createInvitation(workspaceId: string, email: string, role: string) {
    return this.request<{ id: string; email: string; role: string; token: string }>(
      `/v1/workspaces/${workspaceId}/invitations`,
      { method: 'POST', body: JSON.stringify({ email, role }) },
    );
  }

  acceptInvitation(token: string, displayName: string): Promise<Membership> {
    return this.request(`/v1/invitations/${encodeURIComponent(token)}/accept`, {
      method: 'POST',
      body: JSON.stringify({ displayName }),
    });
  }

  updateReport(
    reportId: string,
    update: { assigneeId?: string | null; priority?: string; expectedVersion: number },
  ): Promise<Report> {
    return this.request(`/v1/reports/${reportId}`, {
      method: 'PATCH',
      body: JSON.stringify(update),
    });
  }

  async getReport(id: string): Promise<DetailedReport> {
    const report = await this.request<Record<string, unknown>>(`/v1/reports/${id}`);
    return {
      ...reportSchema.parse({
        ...report,
        screenshotUrl: `${this.baseUrl}/v1/artifacts/${String(report.screenshotPath)}`,
      }),
      comments: (report.comments ?? []) as Comment[],
      activities: (report.activities ?? []) as Array<Record<string, unknown>>,
    };
  }

  addComment(reportId: string, body: string): Promise<Comment> {
    return this.request(`/v1/reports/${reportId}/comments`, {
      method: 'POST',
      body: JSON.stringify({ body }),
    });
  }

  transition(
    reportId: string,
    action: string,
    expectedVersion: number,
    detail?: { reason?: string; resolutionSummary?: string },
  ): Promise<Report> {
    return this.request(`/v1/reports/${reportId}/transitions`, {
      method: 'POST',
      body: JSON.stringify({ action, expectedVersion, ...detail }),
    });
  }
}
