import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { ConflictException, Injectable, NotFoundException, OnModuleInit } from '@nestjs/common';
import { createReportSchema, type CreateReport, type ReportStatus } from '@markfix/contracts';
import { Prisma } from '@markfix/database';
import { DatabaseService } from './database.service.js';
import { transitionReport, type TransitionAction } from './report-state.js';

type SubmissionPayload = Omit<CreateReport, 'screenshotDataUrl'>;

const sha256 = (value: string | Buffer): string => createHash('sha256').update(value).digest('hex');

@Injectable()
export class AppService implements OnModuleInit {
  private readonly artifactDirectory = resolve(process.env.ARTIFACT_DIR ?? './data/artifacts');

  constructor(private readonly database: DatabaseService) {}

  async onModuleInit(): Promise<void> {
    await mkdir(this.artifactDirectory, { recursive: true });
    const demoUser = await this.database.user.upsert({
      where: { email: 'demo@markfix.local' },
      update: {},
      create: { email: 'demo@markfix.local', displayName: 'Demo user' },
    });
    const existingWorkspace = await this.database.workspace.findFirst();
    if (!existingWorkspace) {
      await this.database.workspace.create({
        data: {
          name: 'MarkFix Demo',
          createdById: demoUser.id,
          memberships: { create: { userId: demoUser.id, role: 'OWNER' } },
          projects: { create: { name: 'Website feedback', baseUrl: 'https://example.com' } },
        },
      });
    } else {
      await this.database.workspace.update({
        where: { id: existingWorkspace.id },
        data: { createdById: existingWorkspace.createdById ?? demoUser.id },
      });
      await this.database.membership.upsert({
        where: {
          workspaceId_userId: { workspaceId: existingWorkspace.id, userId: demoUser.id },
        },
        update: { status: 'ACTIVE' },
        create: { workspaceId: existingWorkspace.id, userId: demoUser.id, role: 'OWNER' },
      });
    }
  }

  async bootstrap() {
    const workspace = await this.database.workspace.findFirst({
      include: { projects: true, memberships: { include: { user: true } } },
    });
    if (!workspace) throw new NotFoundException('Demo workspace is unavailable');
    return workspace;
  }

  async listMembers(workspaceId: string) {
    return this.database.membership.findMany({
      where: { workspaceId },
      include: { user: true },
      orderBy: { createdAt: 'asc' },
    });
  }

  async listInvitations(workspaceId: string) {
    return this.database.invitation.findMany({
      where: { workspaceId },
      select: {
        id: true,
        workspaceId: true,
        email: true,
        role: true,
        expiresAt: true,
        acceptedAt: true,
        createdAt: true,
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  async createInvitation(workspaceId: string, input: unknown) {
    const payload = input as { email?: unknown; role?: unknown };
    const email = typeof payload.email === 'string' ? payload.email.trim().toLocaleLowerCase() : '';
    const roles = ['ADMIN', 'MEMBER', 'REPORTER'] as const;
    if (!email.includes('@') || !roles.includes(payload.role as (typeof roles)[number])) {
      throw new ConflictException('Invalid invitation');
    }
    const workspace = await this.database.workspace.findUnique({ where: { id: workspaceId } });
    if (!workspace) throw new NotFoundException('Workspace not found');
    const token = crypto.randomUUID();
    const invitation = await this.database.invitation.create({
      data: {
        workspaceId,
        email,
        role: payload.role as (typeof roles)[number],
        tokenHash: sha256(token),
        expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
      },
    });
    return {
      id: invitation.id,
      workspaceId: invitation.workspaceId,
      email: invitation.email,
      role: invitation.role,
      expiresAt: invitation.expiresAt,
      token,
    };
  }

  async acceptInvitation(token: string, input: unknown) {
    const payload = input as { displayName?: unknown };
    const invitation = await this.database.invitation.findUnique({
      where: { tokenHash: sha256(token) },
    });
    if (!invitation) throw new NotFoundException('Invitation not found');
    if (invitation.acceptedAt) throw new ConflictException('Invitation has already been accepted');
    if (invitation.expiresAt.getTime() <= Date.now())
      throw new ConflictException('Invitation has expired');
    const displayName =
      typeof payload.displayName === 'string' && payload.displayName.trim()
        ? payload.displayName.trim().slice(0, 120)
        : (invitation.email.split('@')[0] ?? 'Member');
    return this.database.$transaction(async (transaction) => {
      const user = await transaction.user.upsert({
        where: { email: invitation.email },
        update: { displayName },
        create: { email: invitation.email, displayName },
      });
      const membership = await transaction.membership.upsert({
        where: {
          workspaceId_userId: { workspaceId: invitation.workspaceId, userId: user.id },
        },
        update: { role: invitation.role, status: 'ACTIVE' },
        create: {
          workspaceId: invitation.workspaceId,
          userId: user.id,
          role: invitation.role,
        },
        include: { user: true },
      });
      await transaction.invitation.update({
        where: { id: invitation.id },
        data: { acceptedAt: new Date() },
      });
      return membership;
    });
  }

  async createSubmission(projectId: string, idempotencyKey: string, input: unknown) {
    const parsed = createReportSchema.omit({ screenshotDataUrl: true }).parse(input);
    if (parsed.projectId !== projectId) throw new ConflictException('Project ID mismatch');
    const requestHash = sha256(JSON.stringify(parsed));
    const existing = await this.database.reportSubmission.findUnique({
      where: { projectId_idempotencyKey: { projectId, idempotencyKey } },
      include: { artifact: true, report: true },
    });
    if (existing) {
      if (existing.requestHash !== requestHash) {
        throw new ConflictException('Idempotency key already used with another payload');
      }
      return existing;
    }
    return this.database.reportSubmission.create({
      data: {
        projectId,
        idempotencyKey,
        requestHash,
        payload: parsed as unknown as Prisma.InputJsonValue,
        expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
      },
    });
  }

  async presignArtifact(submissionId: string, input: unknown) {
    const metadata = input as { mimeType?: unknown; size?: unknown; sha256?: unknown };
    if (
      metadata.mimeType !== 'image/png' ||
      typeof metadata.size !== 'number' ||
      typeof metadata.sha256 !== 'string'
    ) {
      throw new ConflictException('Invalid artifact metadata');
    }
    const existing = await this.database.artifact.findUnique({ where: { submissionId } });
    if (existing) {
      if (
        existing.mimeType !== metadata.mimeType ||
        existing.size !== metadata.size ||
        existing.sha256 !== metadata.sha256
      ) {
        throw new ConflictException('Submission already has a different artifact');
      }
      return { artifactId: existing.id, uploadUrl: `/v1/uploads/${existing.id}` };
    }
    const objectKey = `${submissionId}/${crypto.randomUUID()}.png`;
    const artifact = await this.database.artifact.create({
      data: {
        submissionId,
        mimeType: metadata.mimeType,
        size: metadata.size,
        sha256: metadata.sha256,
        objectKey,
      },
    });
    return { artifactId: artifact.id, uploadUrl: `/v1/uploads/${artifact.id}` };
  }

  async uploadArtifact(artifactId: string, input: unknown) {
    const payload = input as { dataUrl?: unknown };
    if (
      typeof payload.dataUrl !== 'string' ||
      !payload.dataUrl.startsWith('data:image/png;base64,')
    ) {
      throw new ConflictException('Expected a PNG data URL');
    }
    const artifact = await this.database.artifact.findUnique({ where: { id: artifactId } });
    if (!artifact) throw new NotFoundException('Artifact not found');
    const bytes = Buffer.from(payload.dataUrl.slice('data:image/png;base64,'.length), 'base64');
    if (bytes.byteLength !== artifact.size || sha256(bytes) !== artifact.sha256) {
      throw new ConflictException('Artifact checksum or size mismatch');
    }
    const path = join(this.artifactDirectory, `${artifact.id}.png`);
    await writeFile(path, bytes, { flag: 'wx' }).catch(async (error: unknown) => {
      const nodeError = error as NodeJS.ErrnoException;
      if (nodeError.code !== 'EEXIST') throw error;
    });
    await this.database.artifact.update({
      where: { id: artifact.id },
      data: { uploadStatus: 'COMPLETE' },
    });
    return { uploaded: true };
  }

  async finalizeSubmission(submissionId: string) {
    return this.database.$transaction(async (transaction) => {
      const submission = await transaction.reportSubmission.findUnique({
        where: { id: submissionId },
        include: { artifact: true, report: true },
      });
      if (!submission) throw new NotFoundException('Submission not found');
      if (submission.report) return submission.report;
      if (!submission.artifact || submission.artifact.uploadStatus !== 'COMPLETE') {
        throw new ConflictException('Artifact upload is incomplete');
      }
      const payload = createReportSchema
        .omit({ screenshotDataUrl: true })
        .parse(submission.payload) as SubmissionPayload;
      const report = await transaction.report.create({
        data: {
          projectId: submission.projectId,
          submissionId: submission.id,
          title: payload.title,
          description: payload.description,
          priority: payload.priority,
          captureBundle: payload.captureBundle as unknown as Prisma.InputJsonValue,
          screenshotPath: submission.artifact.id,
          activities: { create: { type: 'REPORT_CREATED', payload: {} } },
        },
      });
      await transaction.reportSubmission.update({
        where: { id: submission.id },
        data: { status: 'FINALIZED' },
      });
      return report;
    });
  }

  async listReports(
    projectId: string,
    filters: {
      status?: string;
      priority?: string;
      assigneeId?: string;
      cursor?: string;
      limit?: string;
    },
  ) {
    const limit = Math.min(100, Math.max(1, Number(filters.limit) || 30));
    const statuses = ['OPEN', 'IN_PROGRESS', 'READY_FOR_VERIFY', 'RESOLVED', 'CLOSED'] as const;
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
      },
      include: { assignee: true, reporter: true },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      ...(filters.cursor ? { cursor: { id: filters.cursor }, skip: 1 } : {}),
      take: limit + 1,
    });
    const hasMore = items.length > limit;
    const page = hasMore ? items.slice(0, limit) : items;
    return { items: page, nextCursor: hasMore ? page.at(-1)?.id : undefined };
  }

  async getReport(id: string) {
    const report = await this.database.report.findUnique({
      where: { id },
      include: {
        assignee: true,
        reporter: true,
        comments: { include: { author: true }, orderBy: { createdAt: 'asc' } },
        activities: { include: { actor: true }, orderBy: { createdAt: 'asc' } },
      },
    });
    if (!report) throw new NotFoundException('Report not found');
    return report;
  }

  async getArtifact(id: string): Promise<Buffer> {
    const artifact = await this.database.artifact.findUnique({ where: { id } });
    if (!artifact) throw new NotFoundException('Artifact not found');
    return readFile(join(this.artifactDirectory, `${artifact.id}.png`));
  }

  async addComment(reportId: string, input: unknown) {
    const payload = input as { authorName?: unknown; authorId?: unknown; body?: unknown };
    if (typeof payload.authorName !== 'string' || typeof payload.body !== 'string') {
      throw new ConflictException('Invalid comment');
    }
    return this.database.comment.create({
      data: {
        reportId,
        authorName: payload.authorName,
        body: payload.body,
        ...(typeof payload.authorId === 'string' ? { authorId: payload.authorId } : {}),
      },
    });
  }

  async updateReport(id: string, input: unknown) {
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
    if (typeof payload.assigneeId === 'string') {
      const member = await this.database.membership.findUnique({
        where: {
          workspaceId_userId: {
            workspaceId: current.project.workspaceId,
            userId: payload.assigneeId,
          },
        },
      });
      if (!member || member.status !== 'ACTIVE')
        throw new ConflictException('Assignee is not an active workspace member');
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
        payload: {
          ...(priority ? { priority } : {}),
          ...(assigneeId !== undefined ? { assigneeId } : {}),
        },
      },
    });
    return this.getReport(id);
  }

  async transition(id: string, input: unknown) {
    const payload = input as {
      action?: TransitionAction;
      expectedVersion?: number;
      reason?: string;
      resolutionSummary?: string;
    };
    if (!payload.action || typeof payload.expectedVersion !== 'number') {
      throw new ConflictException('Invalid transition');
    }
    const current = await this.getReport(id);
    if (current.version !== payload.expectedVersion) {
      throw new ConflictException('Report has changed; refresh before retrying');
    }
    if (payload.action === 'reject' && !payload.reason)
      throw new ConflictException('Reason is required');
    if (payload.action === 'submit_for_verification' && !payload.resolutionSummary) {
      throw new ConflictException('Resolution summary is required');
    }
    const nextStatus = transitionReport(current.status as ReportStatus, payload.action);
    return this.database.report.update({
      where: { id, version: current.version },
      data: {
        status: nextStatus,
        version: { increment: 1 },
        activities: {
          create: {
            type: `REPORT_${payload.action.toLocaleUpperCase()}`,
            payload: { reason: payload.reason, resolutionSummary: payload.resolutionSummary },
          },
        },
      },
    });
  }
}
