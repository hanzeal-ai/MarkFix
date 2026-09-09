import {
  createEnvironmentSchema,
  createProjectSchema,
  createReportSchema,
  reportStatuses,
  updateEnvironmentSchema,
  updateProjectSchema,
  type CreateReport,
  type ReportStatus,
} from '@markfix/contracts';
import { Prisma } from '@markfix/database';
import {
  ConflictException,
  ForbiddenException,
  Inject,
  Injectable,
  NotFoundException,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import { createHash } from 'node:crypto';
import { mkdir, unlink, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { maximumArtifactBytes, pngUploadBytes } from './artifact-upload.js';
import { hashPassword } from './auth-crypto.js';
import { canTransitionReport } from './authorization.js';
import { DatabaseService } from './database.service.js';
import { cleanupExpiredSubmissions } from './expired-submission-cleanup.js';
import { transitionReport, type TransitionAction } from './report-state.js';

type SubmissionPayload = Omit<CreateReport, 'screenshotDataUrl'>;

const sha256 = (value: string | Buffer): string => createHash('sha256').update(value).digest('hex');
const publicUserSelect = {
  id: true,
  email: true,
  displayName: true,
  createdAt: true,
  updatedAt: true,
} satisfies Prisma.UserSelect;

@Injectable()
export class AppService implements OnModuleInit, OnModuleDestroy {
  private readonly artifactDirectory = resolve(process.env.ARTIFACT_DIR ?? './data/artifacts');
  private cleanupTimer?: NodeJS.Timeout;

  constructor(@Inject(DatabaseService) private readonly database: DatabaseService) {}

  async onModuleInit(): Promise<void> {
    await mkdir(this.artifactDirectory, { recursive: true });
    await cleanupExpiredSubmissions(this.database, this.artifactDirectory);
    this.cleanupTimer = setInterval(
      () =>
        void cleanupExpiredSubmissions(this.database, this.artifactDirectory).catch(
          (error: unknown) => console.error('Expired submission cleanup failed', error),
        ),
      60 * 60 * 1000,
    );
    this.cleanupTimer.unref();
    const demoPassword = process.env.MARKFIX_DEMO_PASSWORD;
    if (!demoPassword) return;
    const demoEmail = process.env.MARKFIX_DEMO_EMAIL ?? 'admin@markfix.local';
    const demoPasswordHash = await hashPassword(demoPassword);
    const existingDemoUser = await this.database.user.findUnique({ where: { email: demoEmail } });
    const demoUser = existingDemoUser
      ? await this.database.user.update({
          where: { id: existingDemoUser.id },
          data: {
            email: demoEmail,
            displayName: 'Admin',
            passwordHash: demoPasswordHash,
            emailVerifiedAt: new Date(),
          },
        })
      : await this.database.user.create({
          data: {
            email: demoEmail,
            displayName: 'Admin',
            passwordHash: demoPasswordHash,
            emailVerifiedAt: new Date(),
          },
        });
    const existingProject = await this.database.project.findFirst({
      where: { ownerId: demoUser.id },
    });
    if (!existingProject)
      await this.createProject(demoUser.id, {
        name: 'Website feedback',
        baseUrl: 'https://example.com',
      });
  }

  onModuleDestroy(): void {
    if (this.cleanupTimer) clearInterval(this.cleanupTimer);
  }

  async bootstrap(userId: string) {
    return { projects: await this.listProjects(userId) };
  }

  async listProjects(userId: string) {
    const projects = await this.database.project.findMany({
      where: { memberships: { some: { userId, status: 'ACTIVE' } } },
      include: { memberships: { where: { userId, status: 'ACTIVE' }, select: { role: true } } },
      orderBy: { createdAt: 'asc' },
    });
    return projects.map(({ memberships, ...project }) => ({
      ...project,
      role: memberships[0]?.role,
    }));
  }

  async createProject(userId: string, input: unknown) {
    const parsed = createProjectSchema.safeParse(input);
    if (!parsed.success)
      throw new ConflictException('A valid project name and base URL are required');
    return this.database.project.create({
      data: {
        ownerId: userId,
        name: parsed.data.name,
        baseUrl: parsed.data.baseUrl || null,
        memberships: { create: { userId, role: 'OWNER' } },
      },
    });
  }

  async getProject(userId: string, projectId: string) {
    return this.requireProjectAccess(userId, projectId);
  }

  async updateProject(userId: string, projectId: string, input: unknown) {
    const project = await this.requireProjectAccess(userId, projectId);
    await this.requireMembership(userId, project.id, ['OWNER', 'ADMIN']);
    const parsed = updateProjectSchema.safeParse(input);
    if (!parsed.success) throw new ConflictException('A valid project update is required');
    return this.database.project.update({
      where: { id: projectId },
      data: {
        ...(parsed.data.name !== undefined ? { name: parsed.data.name } : {}),
        ...(parsed.data.baseUrl !== undefined ? { baseUrl: parsed.data.baseUrl || null } : {}),
      },
    });
  }

  async deleteProject(userId: string, projectId: string) {
    const project = await this.requireProjectAccess(userId, projectId);
    await this.requireMembership(userId, project.id, ['OWNER', 'ADMIN']);
    const artifacts = await this.database.artifact.findMany({
      where: { submission: { projectId } },
      select: { id: true },
    });
    await this.database.project.delete({ where: { id: projectId } });
    await Promise.allSettled(
      artifacts.map(({ id }) => unlink(join(this.artifactDirectory, `${id}.png`))),
    );
    return { deleted: true };
  }

  async listEnvironments(userId: string, projectId: string) {
    await this.requireProjectAccess(userId, projectId);
    return this.database.environment.findMany({
      where: { projectId },
      orderBy: { createdAt: 'asc' },
    });
  }

  async createEnvironment(userId: string, projectId: string, input: unknown) {
    const project = await this.requireProjectAccess(userId, projectId);
    await this.requireMembership(userId, project.id, ['OWNER', 'ADMIN']);
    const parsed = createEnvironmentSchema.safeParse(input);
    if (!parsed.success) {
      throw new ConflictException('A valid environment name and HTTP(S) base URL are required');
    }
    try {
      return await this.database.environment.create({
        data: { projectId, name: parsed.data.name, baseUrl: parsed.data.baseUrl },
      });
    } catch (error) {
      if (this.isUniqueConstraint(error)) {
        throw new ConflictException('An environment with this name already exists');
      }
      throw error;
    }
  }

  async updateEnvironment(userId: string, environmentId: string, input: unknown) {
    const environment = await this.database.environment.findUnique({
      where: { id: environmentId },
    });
    if (!environment) throw new NotFoundException('Environment not found');
    const project = await this.requireProjectAccess(userId, environment.projectId);
    await this.requireMembership(userId, project.id, ['OWNER', 'ADMIN']);
    const parsed = updateEnvironmentSchema.safeParse(input);
    if (!parsed.success) throw new ConflictException('A valid environment update is required');
    try {
      return await this.database.environment.update({
        where: { id: environmentId },
        data: {
          ...(parsed.data.name !== undefined ? { name: parsed.data.name } : {}),
          ...(parsed.data.baseUrl !== undefined ? { baseUrl: parsed.data.baseUrl } : {}),
        },
      });
    } catch (error) {
      if (this.isUniqueConstraint(error)) {
        throw new ConflictException('An environment with this name already exists');
      }
      throw error;
    }
  }

  async listMembers(userId: string, projectId: string) {
    await this.requireMembership(userId, projectId);
    return this.database.membership.findMany({
      where: { projectId },
      include: { user: { select: publicUserSelect } },
      orderBy: { createdAt: 'asc' },
    });
  }

  async listInvitations(userId: string, projectId: string) {
    await this.requireMembership(userId, projectId, ['OWNER', 'ADMIN']);
    return this.database.invitation.findMany({
      where: { projectId },
      select: {
        id: true,
        projectId: true,
        email: true,
        role: true,
        expiresAt: true,
        acceptedAt: true,
        createdAt: true,
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  async createInvitation(userId: string, projectId: string, input: unknown) {
    await this.requireMembership(userId, projectId, ['OWNER', 'ADMIN']);
    const payload = input as { email?: unknown; role?: unknown };
    const email = typeof payload.email === 'string' ? payload.email.trim().toLocaleLowerCase() : '';
    const roles = ['ADMIN', 'MEMBER', 'REPORTER'] as const;
    if (!email.includes('@') || !roles.includes(payload.role as (typeof roles)[number])) {
      throw new ConflictException('Invalid invitation');
    }
    const project = await this.database.project.findUnique({ where: { id: projectId } });
    if (!project) throw new NotFoundException('Project not found');
    const token = crypto.randomUUID();
    const invitation = await this.database.invitation.create({
      data: {
        projectId,
        email,
        role: payload.role as (typeof roles)[number],
        tokenHash: sha256(token),
        expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
      },
    });
    return {
      id: invitation.id,
      projectId: invitation.projectId,
      email: invitation.email,
      role: invitation.role,
      expiresAt: invitation.expiresAt,
      token,
    };
  }

  async acceptInvitation(userId: string, token: string) {
    const invitation = await this.database.invitation.findUnique({
      where: { tokenHash: sha256(token) },
    });
    if (!invitation) throw new NotFoundException('Invitation not found');
    if (invitation.acceptedAt) throw new ConflictException('Invitation has already been accepted');
    if (invitation.expiresAt.getTime() <= Date.now())
      throw new ConflictException('Invitation has expired');
    const user = await this.database.user.findUnique({ where: { id: userId } });
    if (!user || user.email !== invitation.email) {
      throw new ForbiddenException('Invitation email does not match the signed-in account');
    }
    return this.database.$transaction(async (transaction) => {
      const consumed = await transaction.invitation.updateMany({
        where: { id: invitation.id, acceptedAt: null, expiresAt: { gt: new Date() } },
        data: { acceptedAt: new Date() },
      });
      if (consumed.count !== 1) throw new ConflictException('Invitation is no longer available');
      const membership = await transaction.membership.upsert({
        where: {
          projectId_userId: { projectId: invitation.projectId, userId },
        },
        update: {},
        create: {
          projectId: invitation.projectId,
          userId,
          role: invitation.role,
        },
        include: { user: { select: publicUserSelect } },
      });
      return membership;
    });
  }

  async createSubmission(
    userId: string,
    projectId: string,
    idempotencyKey: string,
    input: unknown,
  ) {
    await this.requireProjectAccess(userId, projectId);
    const parsed = createReportSchema.omit({ screenshotDataUrl: true }).parse(input);
    if (parsed.projectId !== projectId) throw new ConflictException('Project ID mismatch');
    if (parsed.environmentId) {
      const environment = await this.database.environment.findUnique({
        where: { id: parsed.environmentId },
      });
      if (!environment || environment.projectId !== projectId) {
        throw new ConflictException('Environment does not belong to this project');
      }
    }
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
        ...(parsed.environmentId ? { environmentId: parsed.environmentId } : {}),
        createdById: userId,
        idempotencyKey,
        requestHash,
        payload: parsed as unknown as Prisma.InputJsonValue,
        expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
      },
    });
  }

  async presignArtifact(userId: string, submissionId: string, input: unknown) {
    await this.requireSubmissionAccess(userId, submissionId);
    const metadata = input as { mimeType?: unknown; size?: unknown; sha256?: unknown };
    if (
      metadata.mimeType !== 'image/png' ||
      typeof metadata.size !== 'number' ||
      !Number.isInteger(metadata.size) ||
      metadata.size <= 0 ||
      metadata.size > maximumArtifactBytes ||
      typeof metadata.sha256 !== 'string' ||
      !/^[a-f\d]{64}$/i.test(metadata.sha256)
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

  async uploadArtifact(userId: string, artifactId: string, input: unknown) {
    const bytes = pngUploadBytes(input);
    const artifact = await this.database.artifact.findUnique({
      where: { id: artifactId },
      include: { submission: { include: { project: true } } },
    });
    if (!artifact) throw new NotFoundException('Artifact not found');
    await this.requireSubmissionActor(
      userId,
      artifact.submission.createdById,
      artifact.submission.project.id,
    );
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

  async finalizeSubmission(userId: string, submissionId: string) {
    await this.requireSubmissionAccess(userId, submissionId);
    const finalize = () =>
      this.database.$transaction(
        async (transaction) => {
          const submission = await transaction.reportSubmission.findUnique({
            where: { id: submissionId },
            include: { artifact: true, report: true },
          });
          if (!submission) throw new NotFoundException('Submission not found');
          if (submission.report) return submission.report;
          if (submission.artifact && submission.artifact.uploadStatus !== 'COMPLETE') {
            throw new ConflictException('Artifact upload is incomplete');
          }
          const payload = createReportSchema
            .omit({ screenshotDataUrl: true })
            .parse(submission.payload) as SubmissionPayload;
          const sourceAnnotationId = payload.captureBundle.sourceAnnotationId;
          const existingReport = sourceAnnotationId
            ? await transaction.report.findFirst({
                where: {
                  projectId: submission.projectId,
                  OR: [
                    { id: sourceAnnotationId },
                    {
                      captureBundle: {
                        path: ['sourceAnnotationId'],
                        equals: sourceAnnotationId,
                      },
                    },
                  ],
                },
                orderBy: [{ updatedAt: 'desc' }, { createdAt: 'desc' }, { id: 'desc' }],
              })
            : null;
          if (submission.status === 'FINALIZED') {
            if (existingReport) return existingReport;
            throw new ConflictException('Finalized submission report is unavailable');
          }
          const currentData = {
            environmentId: payload.environmentId ?? null,
            title: payload.title,
            description: payload.description,
            priority: payload.priority,
            captureBundle: payload.captureBundle as unknown as Prisma.InputJsonValue,
            screenshotPath: submission.artifact?.id ?? null,
            reporterId: submission.createdById,
          };
          const report = existingReport
            ? await transaction.report.update({
                where: { id: existingReport.id },
                data: {
                  ...currentData,
                  status: 'OPEN',
                  rejectionReason: null,
                  version: { increment: 1 },
                  activities: {
                    create: {
                      type: 'ANNOTATION_RESUBMITTED',
                      payload: {
                        previousStatus: existingReport.rejectionReason
                          ? 'REJECTED'
                          : existingReport.status,
                        previousRejectionReason: existingReport.rejectionReason,
                      },
                      actorId: submission.createdById,
                    },
                  },
                },
              })
            : await transaction.report.create({
                data: {
                  ...(sourceAnnotationId ? { id: sourceAnnotationId } : {}),
                  projectId: submission.projectId,
                  submissionId: submission.id,
                  ...currentData,
                  activities: {
                    create: {
                      type: 'REPORT_CREATED',
                      payload: {},
                      actorId: submission.createdById,
                    },
                  },
                },
              });
          await transaction.reportSubmission.update({
            where: { id: submission.id },
            data: { status: 'FINALIZED' },
          });
          return report;
        },
        { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
      );

    try {
      return await finalize();
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        (error.code === 'P2002' || error.code === 'P2034')
      ) {
        return finalize();
      }
      throw error;
    }
  }

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
    await this.requireProjectAccess(userId, projectId);
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
    await this.requireMembership(userId, artifact.submission.project.id);
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
    await this.requireMembership(userId, current.project.id, ['OWNER', 'ADMIN']);
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
    const payload = input as {
      action?: TransitionAction;
      expectedVersion?: number;
      reason?: string;
      resolutionSummary?: string;
    };
    if (!payload.action || typeof payload.expectedVersion !== 'number') {
      throw new ConflictException('Invalid transition');
    }
    const current = await this.getReportRecord(id);
    const project = await this.database.project.findUnique({ where: { id: current.projectId } });
    if (!project) throw new NotFoundException('Project not found');
    const membership = await this.requireMembership(userId, project.id);
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
            payload: { reason: payload.reason, resolutionSummary: payload.resolutionSummary },
            actorId: userId,
          },
        },
      },
    });
    return updated;
  }

  private async requireMembership(
    userId: string,
    projectId: string,
    roles?: Array<'OWNER' | 'ADMIN' | 'MEMBER' | 'REPORTER'>,
  ) {
    const membership = await this.database.membership.findUnique({
      where: { projectId_userId: { projectId, userId } },
    });
    if (
      !membership ||
      membership.status !== 'ACTIVE' ||
      (roles && !roles.includes(membership.role))
    ) {
      throw new ForbiddenException('You do not have access to this project action');
    }
    return membership;
  }

  private async requireProjectAccess(userId: string, projectId: string) {
    const project = await this.database.project.findUnique({ where: { id: projectId } });
    if (!project) throw new NotFoundException('Project not found');
    await this.requireMembership(userId, project.id);
    return project;
  }

  private async requireReportAccess(userId: string, reportId: string) {
    const report = await this.database.report.findUnique({
      where: { id: reportId },
      include: { project: true },
    });
    if (!report) throw new NotFoundException('Report not found');
    await this.requireMembership(userId, report.project.id);
    return report;
  }

  private async requireSubmissionAccess(userId: string, submissionId: string) {
    const submission = await this.database.reportSubmission.findUnique({
      where: { id: submissionId },
      include: { project: true },
    });
    if (!submission) throw new NotFoundException('Submission not found');
    await this.requireSubmissionActor(userId, submission.createdById, submission.project.id);
    return submission;
  }

  private async requireSubmissionActor(
    userId: string,
    createdById: string | null,
    projectId: string,
  ) {
    const membership = await this.requireMembership(userId, projectId);
    if (createdById !== userId && !['OWNER', 'ADMIN'].includes(membership.role)) {
      throw new ForbiddenException('Only the submission owner or an administrator may continue it');
    }
  }

  private isUniqueConstraint(error: unknown): boolean {
    return error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002';
  }
}
