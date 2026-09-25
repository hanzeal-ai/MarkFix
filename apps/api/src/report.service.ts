import { reportStatuses, transitionSchema, type ReportStatus } from '@markfix/contracts';
import {
  ConflictException,
  ForbiddenException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { join, resolve } from 'node:path';
import { canTransitionReport, requireMembership, requireProjectAccess } from './authorization.js';
import { DatabaseService, publicUserSelect } from './database.service.js';
import { transitionReport } from './report-state.js';

@Injectable()
export class ReportService {
  constructor(@Inject(DatabaseService) private readonly database: DatabaseService) {}

  private readonly artifactDirectory = resolve(process.env.ARTIFACT_DIR ?? './data/artifacts');
  async listReports(
    userId: string,
    projectId: string,
    filters: {
      status?: string;
      priority?: string;
      assigneeId?: string;
      pageUrl?: string;
      cursor?: string;
      limit?: string;
    },
  ) {
    await requireProjectAccess(this.database, userId, projectId);
    const limit = Math.min(100, Math.max(1, Number(filters.limit) || 30));
    if (filters.pageUrl && !URL.canParse(filters.pageUrl))
      throw new ConflictException('Invalid page URL');
    const pageUrl = filters.pageUrl ? new URL(filters.pageUrl).href : undefined;
    const statuses = reportStatuses;
    const priorities = ['LOW', 'MEDIUM', 'HIGH', 'URGENT'] as const;
    const items = await this.database.report.findMany({
      where: {
        projectId,
        ...(statuses.includes(filters.status as (typeof statuses)[number])
          ? { status: filters.status as (typeof statuses)[number] }
          : {}),
        ...(priorities.includes(filters.priority as (typeof priorities)[number])
          ? { priority: filters.priority as (typeof priorities)[number] }
          : {}),
        ...(filters.assigneeId ? { assigneeId: filters.assigneeId } : {}),
        ...(pageUrl ? { captureBundle: { path: ['page', 'url'], equals: pageUrl } } : {}),
      },
      include: {
        fixAttempts: { orderBy: { createdAt: 'desc' }, take: 10 },
        assignee: { select: publicUserSelect },
        reporter: { select: publicUserSelect },
      },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      ...(filters.cursor ? { cursor: { id: filters.cursor }, skip: 1 } : {}),
      take: limit + 1,
    });
    const hasMore = items.length > limit;
    const page = hasMore ? items.slice(0, limit) : items;
    return { items: page, nextCursor: hasMore ? page.at(-1)?.id : undefined };
  }

  async getReport(userId: string, id: string) {
    await this.requireReportAccess(userId, id);
    return this.getReportRecord(id);
  }

  private async getReportRecord(id: string) {
    const report = await this.database.report.findUnique({
      where: { id },
      include: {
        fixAttempts: { orderBy: { createdAt: 'desc' }, take: 10 },
        assignee: { select: publicUserSelect },
        reporter: { select: publicUserSelect },
        comments: {
          include: { author: { select: publicUserSelect } },
          orderBy: { createdAt: 'asc' },
        },
        activities: {
          include: { actor: { select: publicUserSelect } },
          orderBy: { createdAt: 'asc' },
        },
      },
    });
    if (!report) throw new NotFoundException('Report not found');
    return report;
  }

  async getArtifact(userId: string, id: string): Promise<{ path: string; etag: string }> {
    const artifact = await this.database.artifact.findUnique({
      where: { id },
      include: { submission: { include: { project: true } } },
    });
    if (!artifact) throw new NotFoundException('Artifact not found');
    await requireMembership(this.database, userId, artifact.submission.project.id);
    return {
      path: join(this.artifactDirectory, `${artifact.id}.png`),
      etag: `"${artifact.sha256}"`,
    };
  }

  async addComment(userId: string, reportId: string, input: unknown) {
    await this.requireReportAccess(userId, reportId);
    const payload = input as { body?: unknown };
    if (typeof payload.body !== 'string' || !payload.body.trim()) {
      throw new ConflictException('Invalid comment');
    }
    const user = await this.database.user.findUnique({ where: { id: userId } });
    if (!user) throw new NotFoundException('User not found');
    return this.database.comment.create({
      data: {
        reportId,
        authorName: user.displayName,
        authorId: userId,
        body: payload.body.trim(),
      },
    });
  }

  async updateReport(userId: string, id: string, input: unknown) {
    const payload = input as {
      assigneeId?: unknown;
      priority?: unknown;
      expectedVersion?: unknown;
    };
    const priorities = ['LOW', 'MEDIUM', 'HIGH', 'URGENT'] as const;
    if (typeof payload.expectedVersion !== 'number')
      throw new ConflictException('Expected version is required');
    const current = await this.database.report.findUnique({
      where: { id },
      include: { project: true },
    });
    if (!current) throw new NotFoundException('Report not found');
    await requireMembership(this.database, userId, current.project.id, ['OWNER', 'ADMIN']);
    if (typeof payload.assigneeId === 'string') {
      const member = await this.database.membership.findUnique({
        where: {
          projectId_userId: {
            projectId: current.project.id,
            userId: payload.assigneeId,
          },
        },
      });
      if (!member || member.status !== 'ACTIVE')
        throw new ConflictException('Assignee is not an active project member');
    }
    const priority = priorities.includes(payload.priority as (typeof priorities)[number])
      ? (payload.priority as (typeof priorities)[number])
      : undefined;
    const assigneeId =
      payload.assigneeId === null || typeof payload.assigneeId === 'string'
        ? payload.assigneeId
        : undefined;
    const updated = await this.database.report.updateMany({
      where: { id, version: payload.expectedVersion },
      data: {
        ...(priority ? { priority } : {}),
        ...(assigneeId !== undefined ? { assigneeId } : {}),
        version: { increment: 1 },
      },
    });
    if (updated.count !== 1)
      throw new ConflictException('Report has changed; refresh before retrying');
    await this.database.activity.create({
      data: {
        reportId: id,
        type: 'REPORT_UPDATED',
        actorId: userId,
        payload: {
          ...(priority ? { priority } : {}),
          ...(assigneeId !== undefined ? { assigneeId } : {}),
        },
      },
    });
    return this.getReportRecord(id);
  }

  async transition(userId: string, id: string, input: unknown) {
    const parsed = transitionSchema.safeParse(input);
    if (!parsed.success) throw new ConflictException('Invalid transition');
    const payload = parsed.data;
    const current = await this.getReportRecord(id);
    const project = await this.database.project.findUnique({ where: { id: current.projectId } });
    if (!project) throw new NotFoundException('Project not found');
    const membership = await requireMembership(this.database, userId, project.id);
    if (!canTransitionReport(userId, membership.role, current, payload.action)) {
      throw new ForbiddenException('Your role cannot perform this report transition');
    }
    if (current.version !== payload.expectedVersion) {
      throw new ConflictException('Report has changed; refresh before retrying');
    }
    if (payload.action === 'reject' && !payload.reason)
      throw new ConflictException('Reason is required');
    if (payload.action === 'submit_for_verification' && !payload.resolutionSummary) {
      throw new ConflictException('Resolution summary is required');
    }
    const nextStatus = transitionReport(current.status as ReportStatus, payload.action);
    const updated = await this.database.report.update({
      where: { id, version: current.version },
      data: {
        status: nextStatus,
        version: { increment: 1 },
        activities: {
          create: {
            type: `REPORT_${payload.action.toLocaleUpperCase()}`,
            payload: {
              status: nextStatus,
              reason: payload.reason,
              resolutionSummary: payload.resolutionSummary,
            },
            actorId: userId,
          },
        },
      },
    });
    return updated;
  }

  private async requireReportAccess(userId: string, reportId: string) {
    const report = await this.database.report.findUnique({
      where: { id: reportId },
      include: { project: true },
    });
    if (!report) throw new NotFoundException('Report not found');
    await requireMembership(this.database, userId, report.project.id);
    return report;
  }
}
