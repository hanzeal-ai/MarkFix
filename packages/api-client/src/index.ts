import {
  clientPolicySchema,
  cloudProjectStateSchema,
  createEnvironmentSchema,
  createProjectSchema,
  createReportSchema,
  environmentSchema,
  projectSchema,
  reportSchema,
  savedCaptureSchema,
  savedDiagnosticAnnotationSchema,
  savedElementCommentSchema,
  updateEnvironmentSchema,
  updateProjectSchema,
  type Comment,
  type ClientPolicy,
  type CloudProjectState,
  type CreateEnvironment,
  type CreateProject,
  type CreateReport,
  type Environment,
  type Membership,
  type Project,
  type Report,
  type ReportTransition,
  type SavedCapture,
  type SavedDiagnosticAnnotation,
  type SavedElementComment,
  type AnnotationSubmission,
  type UpdateEnvironment,
  type UpdateProject,
} from '@markfix/contracts';

type Bootstrap = { projects: Project[] };
type DetailedReport = Report & { comments: Comment[]; activities: Array<Record<string, unknown>> };
type ReportPage = { items: Report[]; nextCursor?: string };
export type AuthTokens = { accessToken: string; refreshToken: string; expiresIn: number };
export type AuthUser = {
  id: string;
  email: string;
  displayName: string;
  emailVerified: boolean;
};
export type AccountSubscription = {
  plan: 'FREE' | 'TEAM';
  planName: string;
  projectLimit: number | null;
  memberLimit: number | null;
  usage: { projects: number; members: number };
  upgradeRequestedAt: string | null;
};
export type SubscriptionUpgradeResult = AccountSubscription & {
  upgraded: boolean;
  alreadyUpgraded: boolean;
  upgradeRequested?: boolean;
  upgradeUrl?: string;
};
export type AccountExport = {
  exportedAt: string;
  account: {
    id: string;
    email: string;
    displayName: string;
    emailVerifiedAt: string | null;
    createdAt: string;
    updatedAt: string;
  };
  memberships: unknown[];
  reports: unknown[];
  comments: unknown[];
  activities: unknown[];
  sessions: unknown[];
};

export class MarkFixApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
    this.name = 'MarkFixApiError';
  }
}

const dataUrlBytes = (dataUrl: string): Uint8Array<ArrayBuffer> => {
  const base64 = dataUrl.slice(dataUrl.indexOf(',') + 1);
  const nodeBuffer = (
    globalThis as unknown as {
      Buffer?: { from(value: string, encoding: string): Uint8Array<ArrayBuffer> };
    }
  ).Buffer;
  if (nodeBuffer) return nodeBuffer.from(base64, 'base64');
  const binary = atob(base64);
  return Uint8Array.from(binary, (character) => character.charCodeAt(0));
};

const digestHex = async (bytes: Uint8Array): Promise<string> => {
  const digest = await crypto.subtle.digest('SHA-256', bytes as BufferSource);
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, '0')).join('');
};

const reportWithScreenshotUrl = (baseUrl: string, report: Record<string, unknown>): Report =>
  reportSchema.parse({
    ...report,
    ...(typeof report.screenshotPath === 'string'
      ? { screenshotUrl: `${baseUrl}/v1/artifacts/${report.screenshotPath}` }
      : {}),
  });

export class MarkFixApi {
  private sessionGeneration = 0;
  private accessToken: string | undefined;
  private refreshToken: string | undefined;
  private refreshInFlight: Promise<AuthTokens | { expiresIn: number }> | undefined;

  constructor(private readonly baseUrl: string) {}

  setTokens(tokens?: { accessToken: string; refreshToken?: string }): void {
    this.sessionGeneration++;
    this.refreshInFlight = undefined;
    this.accessToken = tokens?.accessToken;
    this.refreshToken = tokens?.refreshToken;
  }

  get sessionRevision(): number {
    return this.sessionGeneration;
  }

  currentRefreshToken(): string | undefined {
    return this.refreshToken;
  }

  private async request<T>(
    path: string,
    init?: RequestInit,
    retry = true,
    generation = this.sessionGeneration,
  ): Promise<T> {
    this.assertSession(generation);
    const requestAccessToken = this.accessToken;
    const response = await fetch(`${this.baseUrl}${path}`, {
      ...init,
      credentials: 'include',
      headers: {
        ...(init?.body !== undefined ? { 'content-type': 'application/json' } : {}),
        ...(this.accessToken ? { authorization: `Bearer ${this.accessToken}` } : {}),
        ...init?.headers,
      },
    });
    this.assertSession(generation);
    if (response.status === 401 && retry && !path.startsWith('/v1/auth/')) {
      if (this.accessToken && this.accessToken !== requestAccessToken) {
        return this.request(path, init, false, generation);
      }
      await this.refreshSession();
      return this.request(path, init, false, generation);
    }
    if (!response.ok) {
      const body = (await response.json().catch(() => undefined)) as
        { message?: string } | undefined;
      throw new MarkFixApiError(
        body?.message ?? `Request failed with ${response.status}`,
        response.status,
      );
    }
    const result = (await response.json()) as T;
    this.assertSession(generation);
    return result;
  }

  private assertSession(generation: number): void {
    if (generation !== this.sessionGeneration) throw new Error('Session changed during request');
  }

  requestJson<T>(path: string, init?: RequestInit): Promise<T> {
    return this.request(path, init);
  }

  async register(input: {
    email: string;
    password: string;
    displayName: string;
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
    if (this.refreshInFlight) return this.refreshInFlight;
    const generation = this.sessionGeneration;
    const refresh = this.request<AuthTokens | { expiresIn: number }>(
      '/v1/auth/refresh',
      {
        method: 'POST',
        body: JSON.stringify({ ...(this.refreshToken ? { refreshToken: this.refreshToken } : {}) }),
      },
      false,
    ).then((tokens) => {
      this.assertSession(generation);
      if ('accessToken' in tokens && tokens.accessToken && tokens.refreshToken) {
        this.accessToken = tokens.accessToken;
        this.refreshToken = tokens.refreshToken;
      }
      return tokens;
    });
    this.refreshInFlight = refresh;
    try {
      return await refresh;
    } finally {
      if (this.refreshInFlight === refresh) this.refreshInFlight = undefined;
    }
  }

  async logout(): Promise<void> {
    await this.request('/v1/auth/logout', { method: 'POST', body: '{}' });
    this.setTokens();
  }

  me(): Promise<AuthUser> {
    return this.request('/v1/me');
  }

  changePassword(currentPassword: string, newPassword: string): Promise<{ changed: boolean }> {
    return this.request('/v1/me/password', {
      method: 'PATCH',
      body: JSON.stringify({ currentPassword, newPassword }),
    });
  }

  exportAccountData(): Promise<AccountExport> {
    return this.request('/v1/me/export');
  }

  deleteAccount(password: string): Promise<{ deleted: boolean }> {
    return this.request('/v1/me', { method: 'DELETE', body: JSON.stringify({ password }) });
  }

  async clientPolicy(version: string, platform: string, arch: string): Promise<ClientPolicy> {
    const query = new URLSearchParams({ version, platform, arch });
    return clientPolicySchema.parse(await this.request(`/v1/client-policy?${query}`));
  }

  bootstrap(): Promise<Bootstrap> {
    return this.request('/v1/bootstrap');
  }

  getSubscription(): Promise<AccountSubscription> {
    return this.request('/v1/me/subscription');
  }
  requestSubscriptionUpgrade(): Promise<SubscriptionUpgradeResult> {
    return this.request('/v1/me/subscription/upgrade', { method: 'POST', body: '{}' });
  }

  async listProjects(): Promise<Project[]> {
    return projectSchema.array().parse(await this.request('/v1/projects'));
  }

  async createProject(input: CreateProject): Promise<Project> {
    const parsed = createProjectSchema.parse(input);
    return projectSchema.parse(
      await this.request('/v1/projects', {
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

  async deleteProject(projectId: string): Promise<{ deleted: boolean }> {
    return this.request(`/v1/projects/${projectId}`, { method: 'DELETE' });
  }

  async getCloudProjectState(projectId: string): Promise<CloudProjectState | undefined> {
    const state = await this.request<unknown>(`/v1/projects/${projectId}/data/state`);
    return state === undefined || state === null ? undefined : cloudProjectStateSchema.parse(state);
  }

  async saveCloudProjectState(state: CloudProjectState): Promise<CloudProjectState> {
    const parsed = cloudProjectStateSchema.parse(state);
    return cloudProjectStateSchema.parse(
      await this.request(`/v1/projects/${parsed.project.id}/data/state`, {
        method: 'PUT',
        body: JSON.stringify(parsed),
      }),
    );
  }

  async listCloudCaptures(projectId: string): Promise<SavedCapture[]> {
    return savedCaptureSchema
      .array()
      .parse(await this.request(`/v1/projects/${projectId}/data/captures`));
  }

  async saveCloudCapture(capture: SavedCapture): Promise<SavedCapture> {
    const parsed = savedCaptureSchema.parse(capture);
    const { dataUrl, sourceDataUrl, ...metadata } = parsed;
    const basePath = `/v1/projects/${parsed.projectId}/data/captures/${parsed.id}`;
    const imageRevision = `?updatedAt=${encodeURIComponent(parsed.updatedAt)}`;
    await this.request(basePath, { method: 'PUT', body: JSON.stringify(metadata) });
    await Promise.all([
      this.request(`${basePath}/images/rendered${imageRevision}`, {
        method: 'PUT',
        headers: { 'content-type': 'image/png' },
        body: dataUrlBytes(dataUrl) as BodyInit,
      }),
      this.request(`${basePath}/images/source${imageRevision}`, {
        method: 'PUT',
        headers: { 'content-type': 'image/png' },
        body: dataUrlBytes(sourceDataUrl) as BodyInit,
      }),
    ]);
    return parsed;
  }

  async listCloudElementComments(projectId: string): Promise<SavedElementComment[]> {
    return savedElementCommentSchema
      .array()
      .parse(await this.request(`/v1/projects/${projectId}/data/element-comments`));
  }

  async saveCloudElementComment(comment: SavedElementComment): Promise<SavedElementComment> {
    const parsed = savedElementCommentSchema.parse(comment);
    const { screenshotDataUrl, ...metadata } = parsed;
    const basePath = `/v1/projects/${parsed.projectId}/data/element-comments/${parsed.id}`;
    await this.request(basePath, {
      method: 'PUT',
      body: JSON.stringify({ ...metadata, hasScreenshot: Boolean(screenshotDataUrl) }),
    });
    if (screenshotDataUrl)
      await this.request(
        `${basePath}/images/rendered?updatedAt=${encodeURIComponent(parsed.updatedAt)}`,
        {
          method: 'PUT',
          headers: { 'content-type': 'image/png' },
          body: dataUrlBytes(screenshotDataUrl) as BodyInit,
        },
      );
    return parsed;
  }

  async listCloudDiagnostics(projectId: string): Promise<SavedDiagnosticAnnotation[]> {
    return savedDiagnosticAnnotationSchema
      .array()
      .parse(await this.request(`/v1/projects/${projectId}/data/diagnostics`));
  }

  async saveCloudDiagnostic(
    annotation: SavedDiagnosticAnnotation,
  ): Promise<SavedDiagnosticAnnotation> {
    const parsed = savedDiagnosticAnnotationSchema.parse(annotation);
    await this.request(`/v1/projects/${parsed.projectId}/data/diagnostics/${parsed.id}`, {
      method: 'PUT',
      body: JSON.stringify(parsed),
    });
    return parsed;
  }

  deleteCloudRecord(
    projectId: string,
    kind: 'captures' | 'element-comments' | 'diagnostics',
    recordId: string,
  ): Promise<{ deleted: true }> {
    return this.request(`/v1/projects/${projectId}/data/${kind}/${recordId}`, {
      method: 'DELETE',
    });
  }

  saveCloudAnnotationSubmission(submission: AnnotationSubmission): Promise<{ saved: true }> {
    return this.request(`/v1/projects/${submission.projectId}/data/submission`, {
      method: 'PUT',
      body: JSON.stringify(submission),
    });
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
    const generation = this.sessionGeneration;
    const request = <T>(path: string, init?: RequestInit) =>
      this.request<T>(path, init, true, generation);
    const parsed = createReportSchema.parse(input);
    const { screenshotDataUrl, ...payload } = parsed;
    const submission = await request<{
      id: string;
      artifact?: { id: string; uploadStatus: string } | null;
      report?: Record<string, unknown> | null;
    }>(`/v1/projects/${parsed.projectId}/report-submissions`, {
      method: 'POST',
      headers: { 'idempotency-key': idempotencyKey },
      body: JSON.stringify(payload),
    });
    if (submission.report) {
      return reportWithScreenshotUrl(this.baseUrl, submission.report);
    }
    if (screenshotDataUrl) {
      const bytes = dataUrlBytes(screenshotDataUrl);
      const presigned = await request<{ artifactId: string; uploadUrl: string }>(
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
      await request(presigned.uploadUrl, {
        method: 'PUT',
        headers: { 'content-type': 'image/png' },
        body: bytes,
      });
    }
    const report = await request<Record<string, unknown>>(
      `/v1/report-submissions/${submission.id}/finalize`,
      {
        method: 'POST',
        body: '{}',
      },
    );
    return reportWithScreenshotUrl(this.baseUrl, report);
  }

  private async listReportPage(
    projectId: string,
    filters: {
      status?: string;
      priority?: string;
      assigneeId?: string;
      pageUrl?: string;
      cursor?: string;
      limit?: string;
    } = {},
  ): Promise<ReportPage> {
    const query = new URLSearchParams(
      Object.entries(filters).filter((entry): entry is [string, string] => Boolean(entry[1])),
    );
    const page = await this.request<{
      items: Array<Record<string, unknown>>;
      nextCursor?: string;
    }>(`/v1/projects/${projectId}/reports?${query}`);
    return {
      items: page.items.map((report) => reportWithScreenshotUrl(this.baseUrl, report)),
      ...(page.nextCursor ? { nextCursor: page.nextCursor } : {}),
    };
  }

  async listReports(
    projectId: string,
    filters: { status?: string; priority?: string; assigneeId?: string; cursor?: string } = {},
  ): Promise<Report[]> {
    return (await this.listReportPage(projectId, filters)).items;
  }

  async listAllReports(projectId: string, filters: { pageUrl?: string } = {}): Promise<Report[]> {
    const reports: Report[] = [];
    const seenCursors = new Set<string>();
    let cursor: string | undefined;
    do {
      const page = await this.listReportPage(projectId, {
        limit: '100',
        ...filters,
        ...(cursor ? { cursor } : {}),
      });
      reports.push(...page.items);
      cursor = page.nextCursor;
      if (cursor && seenCursors.has(cursor)) throw new Error('Report pagination returned a cycle');
      if (cursor) seenCursors.add(cursor);
    } while (cursor);
    return reports;
  }

  listMembers(projectId: string): Promise<Membership[]> {
    return this.request(`/v1/projects/${projectId}/members`);
  }

  createInvitation(projectId: string, email: string, role: string) {
    return this.request<{ id: string; email: string; role: string; token: string }>(
      `/v1/projects/${projectId}/invitations`,
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
    if (!Array.isArray(report.comments) || !Array.isArray(report.activities)) {
      throw new Error('Invalid report detail response');
    }
    return {
      ...reportWithScreenshotUrl(this.baseUrl, report),
      comments: report.comments as Comment[],
      activities: report.activities as Array<Record<string, unknown>>,
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
    action: ReportTransition['action'],
    expectedVersion: number,
    detail?: { reason?: string; resolutionSummary?: string },
  ): Promise<Report> {
    return this.request(`/v1/reports/${reportId}/transitions`, {
      method: 'POST',
      body: JSON.stringify({ action, expectedVersion, ...detail }),
    });
  }
}
