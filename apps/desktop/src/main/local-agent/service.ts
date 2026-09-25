import { removeLocalAgentProject, localAgentStateSchema, type State, type Run } from './state.js';
import { randomUUID } from 'node:crypto';
import {
  agentPolicy,
  repairReviewSchema,
  repairReviewStatuses,
  agentIssueQuerySchema,
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
export class LocalAgentService {
  private state: State;
  constructor(
    private store: DraftStore,
    private changed: (report: Report) => void = () => {},
  ) {
    const saved = store.readLocalAgentState();
    this.state = saved
      ? localAgentStateSchema.parse(JSON.parse(saved))
      : {
          identity: randomUUID(),
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
    ]);
    for (const id of projectIds) if (!this.exists(id)) removeLocalAgentProject(this.state, id);
    this.store.writeLocalAgentState(JSON.stringify(this.state));
  }
  projects() {
    return this.store.listWebsiteProjects('LOCAL');
  }
  private exists(id: string) {
    return this.store.getWebsiteProject(id)?.storageMode === 'LOCAL';
  }
  private allowed(id: string) {
    if (!this.exists(id)) fail(403, '本机项目不存在');
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
    this.allowed(projectId);
    return this.state.repositories;
  }
  bind(projectId: string, input: unknown) {
    this.binding(projectId);
    const binding = repositoryBindingSchema.parse(input);
    const repo = binding.repositoryId
      ? this.repositories(projectId).find(({ id }) => id === binding.repositoryId)
      : undefined;
    if (binding.repositoryId && !repo) fail(400, '本机仓库不存在');
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
            reviewFeedback: old?.report.reviewFeedback ?? [],
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
  review(input: unknown) {
    const review = repairReviewSchema.parse(input);
    const report = this.issue(review.reportId);
    if (report.projectId !== review.projectId) fail(403, '标注不属于当前项目');
    if (report.version !== review.expectedVersion || report.status !== 'READY_FOR_VERIFY')
      fail(409, '标注已变化，请刷新后复验');
    report.status = repairReviewStatuses[review.action];
    report.version++;
    report.updatedAt = now();
    if (review.reason) {
      report.reviewFeedback = [
        { reason: review.reason, createdAt: report.updatedAt },
        ...(report.reviewFeedback ?? []),
      ].slice(0, 5);
    }
    this.save();
    this.changed(report);
    return report;
  }
  private issue(id: string) {
    this.reconcile();
    const issue = this.state.issues[id];
    if (!issue) return fail(404, '标注不存在');
    this.allowed(issue.report.projectId);
    return issue.report;
  }
  screenshot(id: string) {
    const report = this.issue(id);
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
  request(method: string, url: URL, input: unknown): unknown {
    const path = url.pathname.replace('/v1/agent', '');
    if (method === 'GET' && path === '/status')
      return {
        authorized: true,
        storageMode: 'LOCAL',
        projectIds: this.projects().map(({ id }) => id),
      };
    if (method === 'POST' && path === '/repositories') {
      const parsed = repositoryRegistrationSchema.parse(input);
      let repo = this.state.repositories.find((item) => item.localId === parsed.localId);
      if (!repo) {
        repo = {
          id: randomUUID(),
          localId: parsed.localId,
          name: parsed.name,
          deviceName: 'Local CLI',
          agentType: 'codex',
          updatedAt: now(),
        };
        this.state.repositories.push(repo);
      }
      repo.name = parsed.name;
      repo.updatedAt = now();
      this.save();
      return repo;
    }
    const projects = this.projects().map((project) => ({
      id: project.id,
      name: project.title,
      storageMode: 'LOCAL',
    }));
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
      this.allowed(query.projectId);
      const rows = this.reports(query.projectId)
        .filter(({ status }) => status === query.status)
        .sort((a, b) => a.id.localeCompare(b.id))
        .filter(({ id }) => !query.cursor || id > query.cursor);
      const items = rows.slice(0, query.limit);
      return { items, nextCursor: rows.length > query.limit ? (items.at(-1)?.id ?? null) : null };
    }
    const issueMatch = /^\/issues\/([^/]+)(\/claim)?$/.exec(path);
    if (issueMatch) {
      const report = this.issue(issueMatch[1] ?? '');
      if (method === 'GET' && !issueMatch[2]) return report;
      if (method === 'POST' && issueMatch[2]) {
        const claim = fixClaimSchema.parse(input);
        const previous = this.state.runs[claim.runId];
        if (previous) {
          if (
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
          ['READY_FOR_VERIFY', 'RESOLVED', 'CLOSED'].includes(report.status) ||
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
      if (!run) return fail(404, '任务不存在');
      const report = this.issue(run.reportId);
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
        action === 'complete' ? 'READY_FOR_VERIFY' : action === 'fail' ? 'FIX_FAILED' : 'OPEN';
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
