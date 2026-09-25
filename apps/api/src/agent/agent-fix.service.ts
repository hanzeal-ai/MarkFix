import { agentPolicy, groupAgentIssueDelivery } from '@markfix/contracts';
import { canRepairReport } from '../authorization.js';
import {
  agentIssueQuerySchema,
  fixClaimSchema,
  fixFailureSchema,
  fixSuccessSchema,
} from '@markfix/contracts';
import { Prisma, type AgentGrant } from '@markfix/database';
import {
  ConflictException,
  ForbiddenException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { createHash } from 'node:crypto';
import { DatabaseService } from '../database.service.js';
import { parseAgent } from './agent-auth.service.js';
import { AgentProjectService } from './agent-project.service.js';
const leaseMs = agentPolicy.leaseMs;
@Injectable()
export class AgentFixService {
  constructor(
    @Inject(DatabaseService) private readonly db: DatabaseService,
    @Inject(AgentProjectService) private readonly projects: AgentProjectService,
  ) {}
  async list(grant: AgentGrant, input: unknown) {
    const query = parseAgent(agentIssueQuerySchema, input);
    await this.projects.access(grant, query.projectId);
    await this.expire(query.projectId);
    const rows = await this.db.report.findMany({
      where: { projectId: query.projectId, status: query.status, rejectionReason: null },
      select: {
        id: true,
        projectId: true,
        title: true,
        status: true,
        version: true,
        updatedAt: true,
        environmentId: true,
        reporterId: true,
        assigneeId: true,
        description: true,
        priority: true,
        captureBundle: true,
        screenshotPath: true,
      },
      orderBy: [{ updatedAt: 'desc' }, { id: 'desc' }],
      take: query.limit + 1,
      ...(query.cursor ? { cursor: { id: query.cursor }, skip: 1 } : {}),
    });
    const page = rows.slice(0, query.limit);
    const screenshotIds = [
      ...new Set(page.flatMap((row) => (row.screenshotPath ? [row.screenshotPath] : []))),
    ];
    const screenshotHashes = new Map<string, string>();
    if (screenshotIds.length) {
      try {
        const artifacts = await this.db.artifact.findMany({
          where: { id: { in: screenshotIds } },
          select: { id: true, sha256: true },
        });
        for (const artifact of artifacts) screenshotHashes.set(artifact.id, artifact.sha256);
      } catch {
        // Optional image comparison cannot prevent delivery of the original task list.
      }
    }
    const items = page.map(({ id, projectId, title, status, version, updatedAt }) => ({
      id,
      projectId,
      title,
      status,
      version,
      updatedAt,
    }));
    return {
      items,
      nextCursor: rows.length > query.limit ? items.at(-1)?.id : null,
      delivery: groupAgentIssueDelivery(
        page.map((row) => ({
          ...row,
          screenshotSha256: row.screenshotPath
            ? (screenshotHashes.get(row.screenshotPath) ?? null)
            : null,
        })),
      ),
    };
  }
  async get(grant: AgentGrant, id: string) {
    const report = await this.db.report.findUnique({
      where: { id },
      include: {
        fixAttempts: { orderBy: { createdAt: 'desc' }, take: 10 },
        activities: { where: { type: 'REPORT_REJECT' }, orderBy: { createdAt: 'desc' }, take: 5 },
      },
    });
    if (!report) throw new NotFoundException('Issue not found');
    await this.projects.access(grant, report.projectId);
    return {
      ...report,
      reviewFeedback: report.activities.flatMap((activity) => {
        const payload = activity.payload as { reason?: unknown } | null;
        return typeof payload?.reason === 'string'
          ? [{ reason: payload.reason, createdAt: activity.createdAt.toISOString() }]
          : [];
      }),
      screenshotUrl: report.screenshotPath ? `/v1/agent/issues/${report.id}/screenshot` : null,
    };
  }
  async claim(grant: AgentGrant, id: string, input: unknown) {
    const data = parseAgent(fixClaimSchema, input);
    const report = await this.get(grant, id);
    const member = await this.projects.access(grant, report.projectId);
    if (!canRepairReport(grant.userId, member.role, report))
      throw new ForbiddenException('Issue must be unassigned or assigned to you');
    return this.db.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM "Report" WHERE id=${id}::uuid FOR UPDATE`;
      const previous = await tx.agentFixAttempt.findUnique({ where: { id: data.runId } });
      if (previous) {
        if (previous.grantId !== grant.id || previous.reportId !== id)
          throw new ConflictException('Run ID already used');
        return previous;
      }
      const current = await tx.report.findUniqueOrThrow({ where: { id } });
      if (!canRepairReport(grant.userId, member.role, current))
        throw new ForbiddenException('Issue assignment changed; reload before claiming');
      if (current.version !== data.expectedVersion || current.rejectionReason)
        throw new ConflictException('Issue changed; reload before claiming');
      const running = await tx.agentFixAttempt.findFirst({
        where: { reportId: id, status: 'RUNNING' },
      });
      if (running && running.leaseExpiresAt > new Date())
        throw new ConflictException('Issue is already claimed');
      if (running)
        await tx.agentFixAttempt.update({
          where: { id: running.id },
          data: {
            status: 'INTERRUPTED',
            finishedAt: new Date(),
            reason: 'Execution lease expired',
          },
        });
      const lastAttempt = await tx.agentFixAttempt.findFirst({
        where: { reportId: id },
        orderBy: { createdAt: 'desc' },
      });
      if (
        current.status !== 'OPEN' &&
        !(current.status === 'FIX_FAILED' && data.retry) &&
        !(
          current.status === 'IN_PROGRESS' &&
          (running || (data.retry && lastAttempt?.status === 'INTERRUPTED'))
        )
      )
        throw new ConflictException(
          'Issue is not available; failed issues require an explicit retry',
        );
      const updated = await tx.report.update({
        where: { id, version: current.version },
        data: {
          status: 'IN_PROGRESS',
          version: { increment: 1 },
          activities: {
            create: {
              type: 'AGENT_FIX_STARTED',
              actorId: grant.userId,
              payload: { runId: data.runId, agentType: grant.agentType },
            },
          },
        },
      });
      return tx.agentFixAttempt.create({
        data: {
          id: data.runId,
          reportId: id,
          grantId: grant.id,
          reportVersion: updated.version,
          leaseExpiresAt: new Date(Date.now() + leaseMs),
        },
      });
    });
  }
  async finish(grant: AgentGrant, id: string, outcome: 'SUCCEEDED' | 'FAILED', input: unknown) {
    const data =
      outcome === 'SUCCEEDED'
        ? parseAgent(fixSuccessSchema, input)
        : parseAgent(fixFailureSchema, input);
    const hash = createHash('sha256').update(JSON.stringify({ outcome, data })).digest('hex');
    const run = await this.requireRun(grant, id);
    return this.db.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM "Report" WHERE id=${run.reportId}::uuid FOR UPDATE`;
      const current = await tx.agentFixAttempt.findUniqueOrThrow({ where: { id } });
      if (current.status !== 'RUNNING') {
        if (current.resultHash === hash) return { confirmed: true, run: current };
        throw new ConflictException('Run already finished with a different result');
      }
      if (current.leaseExpiresAt <= new Date())
        throw new ConflictException('Execution lease expired; reload issue');
      const updated = await tx.report.updateMany({
        where: { id: run.reportId, version: current.reportVersion, status: 'IN_PROGRESS' },
        data: {
          status: outcome === 'SUCCEEDED' ? 'READY_FOR_VERIFY' : 'FIX_FAILED',
          version: { increment: 1 },
        },
      });
      if (updated.count !== 1)
        throw new ConflictException('Issue changed during repair; reload before reporting');
      const result = await tx.agentFixAttempt.update({
        where: { id },
        data: {
          status: outcome,
          summary: data.summary,
          reason: 'reason' in data ? data.reason : null,
          stage: 'stage' in data ? data.stage : null,
          evidence: data.checks as Prisma.InputJsonValue,
          resultHash: hash,
          finishedAt: new Date(),
        },
      });
      await tx.activity.create({
        data: {
          reportId: run.reportId,
          actorId: grant.userId,
          type: `AGENT_FIX_${outcome}`,
          payload: {
            runId: id,
            ...data,
            status: outcome === 'SUCCEEDED' ? 'READY_FOR_VERIFY' : 'FIX_FAILED',
          } as Prisma.InputJsonValue,
        },
      });
      return { confirmed: true, run: result };
    });
  }
  async renew(grant: AgentGrant, id: string) {
    const run = await this.requireRun(grant, id);
    const updated = await this.db.agentFixAttempt.updateMany({
      where: {
        id,
        status: 'RUNNING',
        leaseExpiresAt: { gt: new Date() },
        report: { version: run.reportVersion, status: 'IN_PROGRESS' },
      },
      data: { leaseExpiresAt: new Date(Date.now() + leaseMs) },
    });
    if (!updated.count) throw new ConflictException('Run expired, finished or issue changed');
    return this.db.agentFixAttempt.findUniqueOrThrow({ where: { id } });
  }
  async release(grant: AgentGrant, id: string) {
    const run = await this.requireRun(grant, id);
    return this.db.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM "Report" WHERE id=${run.reportId}::uuid FOR UPDATE`;
      const changed = await tx.agentFixAttempt.updateMany({
        where: { id, status: 'RUNNING' },
        data: { status: 'INTERRUPTED', finishedAt: new Date(), reason: 'Released by agent' },
      });
      if (changed.count)
        await tx.report.updateMany({
          where: { id: run.reportId, version: run.reportVersion, status: 'IN_PROGRESS' },
          data: { status: 'OPEN', version: { increment: 1 } },
        });
      return { released: true };
    });
  }
  private async expire(projectId: string) {
    const expired = await this.db.agentFixAttempt.findMany({
      where: { report: { projectId }, status: 'RUNNING', leaseExpiresAt: { lte: new Date() } },
      take: 100,
    });
    for (const run of expired)
      await this.db.$transaction(async (tx) => {
        await tx.$queryRaw`SELECT id FROM "Report" WHERE id=${run.reportId}::uuid FOR UPDATE`;
        const changed = await tx.agentFixAttempt.updateMany({
          where: { id: run.id, status: 'RUNNING', leaseExpiresAt: { lte: new Date() } },
          data: {
            status: 'INTERRUPTED',
            reason: 'Execution lease expired',
            finishedAt: new Date(),
          },
        });
        if (changed.count)
          await tx.report.updateMany({
            where: { id: run.reportId, version: run.reportVersion, status: 'IN_PROGRESS' },
            data: { status: 'OPEN', version: { increment: 1 } },
          });
      });
  }
  private async requireRun(grant: AgentGrant, id: string) {
    const run = await this.db.agentFixAttempt.findUnique({ where: { id } });
    if (!run || run.grantId !== grant.id) throw new NotFoundException('Repair run not found');
    const report = await this.db.report.findUniqueOrThrow({ where: { id: run.reportId } });
    const member = await this.projects.access(grant, report.projectId);
    if (!canRepairReport(grant.userId, member.role, report))
      throw new ForbiddenException('Repair permission was removed');
    return run;
  }
}
