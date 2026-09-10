import { removeLocalAgentProject, type State, type Grant, type Run } from './state.js';
import { createHash, randomBytes, randomUUID } from 'node:crypto';
import {
  agentPolicy,
  agentIssueQuerySchema,
  deviceAuthorizationSchema,
  deviceDecisionSchema,
  fixClaimSchema,
  fixSuccessSchema,
  fixFailureSchema,
  repositoryRegistrationSchema,
  repositoryBindingSchema,
  reportSchema,
  type Report,
} from '@markfix/contracts';
import { annotationSelectionReportInputs } from '@markfix/annotation-model';
import type { DraftStore } from '../draft-store.js';

const hash = (value: string) => createHash('sha256').update(value).digest('hex');
const secret = () => randomBytes(32).toString('hex');
const now = () => new Date().toISOString();
const leaseMs = agentPolicy.leaseMs;
export class LocalAgentError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}
const fail = (status: number, message: string): never => {
  throw new LocalAgentError(status, message);
};
type Pending = {
  code: string;
  deviceName: string;
  expires: number;
  csrf: string;
  decision?: boolean;
  grantId?: string;
};

export class LocalAgentService {
  private pending = new Map<string, Pending>();
  private state: State;
  constructor(
    private store: DraftStore,
    private changed: (report: Report) => void = () => {},
  ) {
    const saved = store.readLocalAgentState();
    this.state = saved
      ? JSON.parse(saved)
      : {
          identity: randomUUID(),
          grants: [],
          repositories: [],
          issues: {},
          runs: {},
        };
    this.save();
  }
  get identity() {
    return this.state.identity;
  }
  private save() {
    const projectIds = new Set([
      ...Object.values(this.state.issues).map(({ report }) => report.projectId),
      ...this.state.grants.flatMap((grant) => grant.projectIds),
    ]);
    for (const id of projectIds) if (!this.exists(id)) removeLocalAgentProject(this.state, id);
    this.store.writeLocalAgentState(JSON.stringify(this.state));
  }
  grants() {
    this.save();
    return this.state.grants
      .filter((grant) => !grant.revoked && grant.expires > Date.now())
      .map((grant) => ({
        id: grant.id,
        deviceName: grant.deviceName,
        projectIds: grant.projectIds,
        expiresAt: new Date(grant.expires).toISOString(),
      }));
  }
  revoke(id: string) {
    const grant = this.state.grants.find((item) => item.id === id);
    if (!grant) return fail(404, '设备不存在');
    grant.revoked = true;
    this.save();
  }
  projects() {
    return this.store.listWebsiteProjects('LOCAL');
  }
  private exists(id: string) {
    return this.store.getWebsiteProject(id)?.storageMode === 'LOCAL';
  }
  private allowed(grant: Grant, id: string) {
    if (!this.exists(id) || !grant.projectIds.includes(id)) fail(403, '本机项目未授权或已删除');
  }
  authorize(token: string | undefined): Grant {
    const grant = this.state.grants.find((item) => item.access === hash(token ?? ''));
    if (!grant || grant.revoked || grant.expires <= Date.now() || grant.accessUntil <= Date.now())
      return fail(401, '本机授权已失效');
    return grant;
  }
  private tokens(grant: Grant) {
    const accessToken = secret(),
      refreshToken = secret();
    grant.access = hash(accessToken);
    grant.refresh = hash(refreshToken);
    grant.accessUntil = Date.now() + agentPolicy.accessTokenMs;
    this.save();
    return {
      status: 'AUTHORIZED',
      grantId: grant.id,
      accessToken,
      refreshToken,
      accessExpiresAt: new Date(grant.accessUntil).toISOString(),
    };
  }
  device(input: unknown, origin: string) {
    const parsed = deviceAuthorizationSchema.parse(input);
    for (const [id, pending] of this.pending)
      if (pending.expires < Date.now()) this.pending.delete(id);
    if (this.pending.size >= 20) fail(429, '待授权请求过多');
    const deviceCode = secret(),
      userCode = randomBytes(4).toString('hex').toUpperCase();
    const entry = {
      code: userCode,
      deviceName: parsed.deviceName,
      expires: Date.now() + 10 * 60_000,
      csrf: secret(),
    };
    this.pending.set(deviceCode, entry);
    return {
      deviceCode,
      userCode,
      verificationUrl: `${origin}/authorize?ticket=${deviceCode}`,
      expiresAt: new Date(entry.expires).toISOString(),
      interval: 5,
    };
  }
  page(ticket: string) {
    const pending = this.pending.get(ticket);
    if (!pending || pending.expires <= Date.now() || pending.decision !== undefined)
      return fail(410, '授权链接已失效');
    return { ...pending, projects: this.projects() };
  }
  decide(ticket: string, csrf: string, input: unknown) {
    const pending = this.page(ticket);
    if (csrf !== pending.csrf) fail(403, '无效的授权确认');
    const decision = deviceDecisionSchema.parse(input);
    if (decision.userCode !== pending.code) fail(403, '授权码不匹配');
    if (
      decision.approve &&
      (!decision.projectIds.length || decision.projectIds.some((id) => !this.exists(id)))
    )
      fail(400, '请选择有效的本机项目');
    const entry = this.pending.get(ticket) ?? fail(410, '授权已过期');
    entry.decision = decision.approve;
    if (decision.approve) {
      const grant: Grant = {
        id: randomUUID(),
        deviceName: pending.deviceName,
        projectIds: [...new Set(decision.projectIds)],
        access: '',
        refresh: '',
        accessUntil: 0,
        expires: Date.now() + agentPolicy.grantMs,
        revoked: false,
      };
      this.state.grants.push(grant);
      entry.grantId = grant.id;
      this.save();
    }
    return { approved: decision.approve };
  }
  token(deviceCode: string) {
    const pending = this.pending.get(deviceCode);
    if (!pending || pending.expires <= Date.now()) return fail(410, '授权已过期');
    if (pending.decision === false) {
      this.pending.delete(deviceCode);
      return fail(403, '用户拒绝授权');
    }
    if (pending.decision === undefined) return { status: 'PENDING' };
    this.pending.delete(deviceCode);
    return this.tokens(
      this.state.grants.find(({ id }) => id === pending.grantId) ?? fail(401, '授权不存在'),
    );
  }
  refresh(refreshToken: string) {
    const grant = this.state.grants.find((item) => item.refresh === hash(refreshToken));
    if (!grant || grant.revoked || grant.expires <= Date.now()) return fail(401, '本机授权已失效');
    return this.tokens(grant);
  }
  binding(projectId: string) {
    const project = this.store.getWebsiteProject(projectId);
    if (!project || project.storageMode !== 'LOCAL') return fail(404, '本机项目不存在');
    return {
      repositoryId: project.repositoryId ?? null,
      repositoryName: project.repositoryName ?? null,
    };
  }
  repositories(projectId: string) {
    return this.state.repositories.filter((repo) =>
      this.state.grants.some(
        (grant) =>
          grant.id === repo.grantId &&
          !grant.revoked &&
          grant.expires > Date.now() &&
          grant.projectIds.includes(projectId),
      ),
    );
  }
  bind(projectId: string, input: unknown) {
    this.binding(projectId);
    const binding = repositoryBindingSchema.parse(input);
    const repo = binding.repositoryId
      ? this.repositories(projectId).find(({ id }) => id === binding.repositoryId)
      : undefined;
    if (binding.repositoryId && !repo) fail(400, '仓库未获该项目授权');
    const project = this.store.getWebsiteProject(projectId);
    if (!project || project.storageMode !== 'LOCAL') return fail(404, '本机项目不存在');
    const result = {
      repositoryId: binding.repositoryId,
      repositoryName: repo?.name ?? binding.repositoryName,
    };
    this.store.saveWebsiteProject({ ...project, ...result, updatedAt: now() });
    return result;
  }
  private reconcile() {
    // Submitted snapshots are the input; one local Report per source annotation is the repair authority.
    for (const submission of this.store.listAnnotationSubmissions()) {
      if (!this.exists(submission.projectId)) continue;
      for (const { report: input, idempotencyKey } of annotationSelectionReportInputs(
        submission.projectId,
        submission,
      )) {
        const id = input.captureBundle.sourceAnnotationId ?? fail(500, '标注缺少来源');
        const old = this.state.issues[id];
        if (old && old.report.captureBundle.page.capturedAt >= input.captureBundle.page.capturedAt)
          continue;
        const fields = { ...input };
        delete fields.screenshotDataUrl;
        this.state.issues[id] = {
          revision: idempotencyKey,
          report: reportSchema.parse({
            ...fields,
            id,
            status: 'OPEN',
            version: (old?.report.version ?? 0) + 1,
            environmentId: null,
            ...(input.screenshotDataUrl
              ? { screenshotUrl: `/v1/agent/issues/${id}/screenshot` }
              : {}),
            createdAt: old?.report.createdAt ?? submission.submittedAt,
            updatedAt: submission.submittedAt,
            fixAttempts: old?.report.fixAttempts ?? [],
          }),
        };
      }
    }
    for (const run of Object.values(this.state.runs)) {
      if (run.status !== 'RUNNING' || run.leaseUntil > Date.now()) continue;
      run.status = 'INTERRUPTED';
      const report = this.state.issues[run.reportId]?.report;
      const attempt = report?.fixAttempts?.find(({ id }) => id === run.id);
      if (attempt)
        Object.assign(attempt, {
          status: 'INTERRUPTED',
          reason: 'Execution lease expired',
          finishedAt: now(),
        });
      if (report && report.version === run.version && report.status === 'IN_PROGRESS') {
        report.status = 'OPEN';
        report.version++;
        report.updatedAt = now();
      }
    }
    this.save();
  }
  reports(projectId: string, pageUrl?: string) {
    this.reconcile();
    return Object.values(this.state.issues)
      .map(({ report }) => report)
      .filter(
        (report) =>
          this.exists(projectId) &&
          report.projectId === projectId &&
          (!pageUrl || report.captureBundle.page.url === pageUrl),
      );
  }
  private issue(grant: Grant, id: string) {
    this.reconcile();
    const issue = this.state.issues[id];
    if (!issue) return fail(404, '标注不存在');
    this.allowed(grant, issue.report.projectId);
    return issue.report;
  }
  screenshot(grant: Grant, id: string) {
    const report = this.issue(grant, id);
    let data: string | undefined;
    for (const submission of this.store.listAnnotationSubmissions()) {
      if (submission.projectId !== report.projectId) continue;
      const item = annotationSelectionReportInputs(submission.projectId, submission).find(
        ({ report: candidate }) =>
          candidate.captureBundle.sourceAnnotationId === id &&
          candidate.captureBundle.page.capturedAt === report.captureBundle.page.capturedAt,
      );
      if (item) data = item.report.screenshotDataUrl;
    }
    if (!data?.startsWith('data:image/png;base64,')) return fail(404, '该标注没有 PNG 截图');
    return Buffer.from(data.slice('data:image/png;base64,'.length), 'base64');
  }
  request(grant: Grant, method: string, url: URL, input: unknown): unknown {
    const path = url.pathname.replace('/v1/agent', '');
    if (method === 'GET' && path === '/status')
      return {
        authorized: true,
        storageMode: 'LOCAL',
        grantId: grant.id,
        projectIds: grant.projectIds.filter((id) => this.exists(id)),
      };
    if (method === 'POST' && path === '/logout') {
      grant.revoked = true;
      this.save();
      return { loggedOut: true };
    }
    if (method === 'POST' && path === '/repositories') {
      const parsed = repositoryRegistrationSchema.parse(input);
      let repo = this.state.repositories.find((item) => item.localId === parsed.localId);
      if (!repo) {
        repo = {
          id: randomUUID(),
          localId: parsed.localId,
          name: parsed.name,
          grantId: grant.id,
          deviceName: grant.deviceName,
          agentType: 'codex',
          updatedAt: now(),
        };
        this.state.repositories.push(repo);
      }
      repo.grantId = grant.id;
      repo.name = parsed.name;
      repo.updatedAt = now();
      this.save();
      return repo;
    }
    const projects = this.projects()
      .filter(({ id }) => grant.projectIds.includes(id))
      .map((project) => ({ id: project.id, name: project.title, storageMode: 'LOCAL' }));
    if (method === 'GET' && path === '/projects') return projects;
    const resolve = /^\/repositories\/([^/]+)\/projects$/.exec(path);
    if (method === 'GET' && resolve) {
      const repos = this.state.repositories.filter((repo) => repo.localId === resolve[1]);
      const bound = projects.filter(({ id }) =>
        repos.some((repo) => repo.id === this.binding(id).repositoryId),
      );
      return { selectionRequired: bound.length !== 1, projects: bound };
    }
    if (method === 'GET' && path === '/issues') {
      const query = agentIssueQuerySchema.parse(Object.fromEntries(url.searchParams));
      this.allowed(grant, query.projectId);
      const rows = this.reports(query.projectId)
        .filter(({ status }) => status === query.status)
        .sort((a, b) => a.id.localeCompare(b.id))
        .filter(({ id }) => !query.cursor || id > query.cursor);
      const items = rows.slice(0, query.limit);
      return { items, nextCursor: rows.length > query.limit ? (items.at(-1)?.id ?? null) : null };
    }
    const issueMatch = /^\/issues\/([^/]+)(\/claim)?$/.exec(path);
    if (issueMatch) {
      const report = this.issue(grant, issueMatch[1] ?? '');
      if (method === 'GET' && !issueMatch[2]) return report;
      if (method === 'POST' && issueMatch[2]) {
        const claim = fixClaimSchema.parse(input);
        const previous = this.state.runs[claim.runId];
        if (previous) {
          if (
            previous.grantId !== grant.id ||
            previous.reportId !== report.id ||
            previous.status !== 'RUNNING' ||
            previous.leaseUntil <= Date.now() ||
            previous.version !== report.version
          )
            fail(409, '领取请求冲突');
          return {
            id: previous.id,
            runId: previous.id,
            leaseExpiresAt: new Date(previous.leaseUntil).toISOString(),
          };
        }
        const active = Object.values(this.state.runs).find(
          (run) =>
            run.reportId === report.id &&
            run.status === 'RUNNING' &&
            run.version === report.version,
        );
        if (
          claim.expectedVersion !== report.version ||
          report.status === 'RESOLVED' ||
          (active && active.leaseUntil > Date.now()) ||
          (report.status !== 'OPEN' && !claim.retry)
        )
          fail(409, '标注已变化、被占用或需要显式重试');
        if (active) {
          active.status = 'INTERRUPTED';
          const previousAttempt = report.fixAttempts?.find(({ id }) => id === active.id);
          if (previousAttempt)
            Object.assign(previousAttempt, {
              status: 'INTERRUPTED',
              reason: 'Execution lease expired',
              finishedAt: now(),
            });
        }
        report.status = 'IN_PROGRESS';
        report.version++;
        report.updatedAt = now();
        const run: Run = {
          id: claim.runId,
          reportId: report.id,
          grantId: grant.id,
          version: report.version,
          leaseUntil: Date.now() + leaseMs,
          status: 'RUNNING',
        };
        this.state.runs[run.id] = run;
        report.fixAttempts = [
          {
            id: run.id,
            status: 'RUNNING',
            summary: null,
            reason: null,
            stage: null,
            evidence: [],
            createdAt: now(),
            finishedAt: null,
          },
          ...(report.fixAttempts ?? []),
        ];
        this.save();
        this.changed(report);
        return {
          id: run.id,
          runId: run.id,
          leaseExpiresAt: new Date(run.leaseUntil).toISOString(),
        };
      }
    }
    const fix = /^\/fixes\/([^/]+)\/(renew|release|complete|fail)$/.exec(path);
    if (method === 'POST' && fix) {
      const run = this.state.runs[fix[1] ?? ''];
      if (!run || run.grantId !== grant.id) return fail(404, '任务不存在');
      const report = this.issue(grant, run.reportId);
      const action = fix[2] ?? '';
      const result =
        action === 'complete'
          ? fixSuccessSchema.parse(input)
          : action === 'fail'
            ? fixFailureSchema.parse(input)
            : {};
      const signature = JSON.stringify({ action, result });
      if (run.result) {
        if (run.result !== signature) fail(409, '不能覆盖已有结果');
        return { confirmed: true, report };
      }
      if (
        run.status !== 'RUNNING' ||
        run.version !== report.version ||
        run.leaseUntil <= Date.now()
      )
        fail(409, '任务或标注版本已失效');
      if (action === 'renew') {
        run.leaseUntil = Date.now() + leaseMs;
        this.save();
        return { leaseExpiresAt: new Date(run.leaseUntil).toISOString() };
      }
      run.status =
        action === 'complete' ? 'SUCCEEDED' : action === 'fail' ? 'FAILED' : 'INTERRUPTED';
      run.result = signature;
      report.status =
        action === 'complete' ? 'RESOLVED' : action === 'fail' ? 'FIX_FAILED' : 'OPEN';
      report.version++;
      report.updatedAt = now();
      const attempt =
        report.fixAttempts?.find(({ id }) => id === run.id) ?? fail(500, '任务记录缺失');
      Object.assign(attempt, {
        status: run.status,
        finishedAt: now(),
        ...('summary' in result && 'checks' in result
          ? { summary: result.summary, evidence: result.checks }
          : {}),
        ...('reason' in result && 'stage' in result
          ? { reason: result.reason, stage: result.stage }
          : {}),
      });
      this.save();
      this.changed(report);
      return { confirmed: true, report };
    }
    return fail(404, '接口不存在');
  }
}
