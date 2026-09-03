import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { ConflictException, Injectable, NotFoundException, OnModuleInit } from '@nestjs/common';
import {
  captureBundleSchema,
  createReportSchema,
  type CreateReport,
  type ReportStatus,
} from '@markfix/contracts';
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
    const existingWorkspace = await this.database.workspace.findFirst();
    if (!existingWorkspace) {
      await this.database.workspace.create({
        data: {
          name: 'MarkFix Demo',
          projects: { create: { name: 'Website feedback', baseUrl: 'https://example.com' } },
        },
      });
    }
  }

  async bootstrap() {
    const workspace = await this.database.workspace.findFirst({ include: { projects: true } });
    if (!workspace) throw new NotFoundException('Demo workspace is unavailable');
    return workspace;
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

  async listReports(projectId: string) {
    return this.database.report.findMany({ where: { projectId }, orderBy: { createdAt: 'desc' } });
  }

  async getReport(id: string) {
    const report = await this.database.report.findUnique({
      where: { id },
      include: { comments: { orderBy: { createdAt: 'asc' } }, activities: true },
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
    const payload = input as { authorName?: unknown; body?: unknown };
    if (typeof payload.authorName !== 'string' || typeof payload.body !== 'string') {
      throw new ConflictException('Invalid comment');
    }
    return this.database.comment.create({
      data: { reportId, authorName: payload.authorName, body: payload.body },
    });
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
