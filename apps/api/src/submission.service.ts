import { createReportSchema, type CreateReport } from '@markfix/contracts';
import { Prisma } from '@markfix/database';
import {
  ConflictException,
  ForbiddenException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { createHash } from 'node:crypto';
import { mkdir, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { maximumArtifactBytes, pngUploadBytes } from './artifact-upload.js';
import { requireMembership, requireProjectAccess } from './authorization.js';
import { DatabaseService } from './database.service.js';
import { cleanupExpiredSubmissions } from './expired-submission-cleanup.js';

type SubmissionPayload = Omit<CreateReport, 'screenshotDataUrl'>;
const sha256 = (value: string | Buffer): string => createHash('sha256').update(value).digest('hex');

@Injectable()
export class SubmissionService {
  constructor(@Inject(DatabaseService) private readonly database: DatabaseService) {}

  private readonly artifactDirectory = resolve(process.env.ARTIFACT_DIR ?? './data/artifacts');
  private cleanupTimer?: NodeJS.Timeout;
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
  }

  onModuleDestroy(): void {
    if (this.cleanupTimer) clearInterval(this.cleanupTimer);
  }

  async createSubmission(
    userId: string,
    projectId: string,
    idempotencyKey: string,
    input: unknown,
  ) {
    await requireProjectAccess(this.database, userId, projectId);
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
    const finalize = () =>
      this.database.$transaction(
        async (transaction) => {
          const submission = await transaction.reportSubmission.findUnique({
            where: { id: submissionId },
            include: { artifact: true, report: true },
          });
          if (!submission) throw new NotFoundException('Submission not found');
          await this.requireSubmissionActor(
            userId,
            submission.createdById,
            submission.projectId,
            transaction,
          );
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
    database: Pick<Prisma.TransactionClient, 'membership'> = this.database,
  ) {
    const membership = await requireMembership(database, userId, projectId);
    if (createdById !== userId && !['OWNER', 'ADMIN'].includes(membership.role)) {
      throw new ForbiddenException('Only the submission owner or an administrator may continue it');
    }
  }
}
