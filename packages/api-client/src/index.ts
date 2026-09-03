import {
  createReportSchema,
  reportSchema,
  type Comment,
  type CreateReport,
  type Membership,
  type Report,
} from '@markfix/contracts';

type Bootstrap = {
  id: string;
  name: string;
  projects: Array<{ id: string; name: string }>;
  memberships: Membership[];
};
type DetailedReport = Report & { comments: Comment[]; activities: Array<Record<string, unknown>> };

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
  constructor(private readonly baseUrl = 'http://localhost:4310') {}

  private async request<T>(path: string, init?: RequestInit): Promise<T> {
    const response = await fetch(`${this.baseUrl}${path}`, {
      ...init,
      headers: { 'content-type': 'application/json', ...init?.headers },
    });
    if (!response.ok) {
      const body = (await response.json().catch(() => undefined)) as
        | { message?: string }
        | undefined;
      throw new Error(body?.message ?? `Request failed with ${response.status}`);
    }
    return (await response.json()) as T;
  }

  bootstrap(): Promise<Bootstrap> {
    return this.request('/v1/bootstrap');
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

  addComment(reportId: string, body: string, authorName = 'Demo user'): Promise<Comment> {
    return this.request(`/v1/reports/${reportId}/comments`, {
      method: 'POST',
      body: JSON.stringify({ body, authorName }),
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
