import { createHash } from 'node:crypto';
import type { Prisma } from '@markfix/database';
import type { DatabaseService } from '../database.service.js';
import {
  reportStatusForAnnotation,
  type CommercialAnnotationKind,
  type CommercialAnnotationStatus,
} from './report-annotation.js';

export type CommercialReportInput = {
  id?: string;
  projectId: string;
  authorId: string | null;
  title: string;
  note: string;
  kind: CommercialAnnotationKind;
  pageUrl: string;
  status?: CommercialAnnotationStatus;
  rejectionReason?: string | null;
  createdAt?: Date;
  updatedAt?: Date;
};

const reportPayload = (input: CommercialReportInput, reportId: string) => ({
  projectId: input.projectId,
  title: input.title,
  description: input.note,
  priority: 'MEDIUM' as const,
  captureBundle: {
    schemaVersion: 1 as const,
    page: {
      url: input.pageUrl,
      title: input.title,
      viewportWidthCssPx: 1,
      viewportHeightCssPx: 1,
      deviceScaleFactor: 1,
      capturedAt: (input.createdAt ?? new Date()).toISOString(),
    },
    annotationKind: input.kind,
    sourceAnnotationId: reportId,
    annotations: [],
    reproduction: [],
  },
});

export const createCommercialReport = async (
  database: DatabaseService,
  input: CommercialReportInput,
  legacyAnnotationId?: string,
) => {
  const reportId = input.id ?? crypto.randomUUID();
  const submissionId = crypto.randomUUID();
  const payload = reportPayload(input, reportId);
  const status = input.status ?? 'OPEN';
  const reportStatus = status === 'REJECTED' ? 'CLOSED' : reportStatusForAnnotation(status);
  const requestHash = createHash('sha256').update(JSON.stringify(payload)).digest('hex');
  const createdAt = input.createdAt ?? new Date();
  const updatedAt = input.updatedAt ?? createdAt;

  return database.$transaction(async (transaction) => {
    if (legacyAnnotationId) {
      // Claim in the same transaction as creation: concurrent migration workers wait here.
      const claimed = await transaction.managedAnnotation.deleteMany({
        where: { id: legacyAnnotationId, sourceReportId: null },
      });
      if (claimed.count === 0) {
        const existing = await transaction.report.findUnique({
          where: { id: reportId },
          include: {
            reporter: { select: { id: true, displayName: true, email: true } },
            submission: { select: { idempotencyKey: true } },
          },
        });
        if (
          !existing ||
          existing.projectId !== input.projectId ||
          existing.submission.idempotencyKey !== `commercial:${reportId}`
        )
          throw new Error(`Legacy annotation migration invariant failed: ${legacyAnnotationId}`);
        const { submission, ...report } = existing;
        void submission;
        return report;
      }
    }
    await transaction.reportSubmission.create({
      data: {
        id: submissionId,
        projectId: input.projectId,
        createdById: input.authorId,
        idempotencyKey: `commercial:${reportId}`,
        requestHash,
        payload: payload as unknown as Prisma.InputJsonValue,
        status: 'FINALIZED',
        expiresAt: new Date(createdAt.getTime() + 24 * 60 * 60 * 1000),
        createdAt,
        updatedAt,
      },
    });
    const report = await transaction.report.create({
      data: {
        id: reportId,
        projectId: input.projectId,
        submissionId,
        title: input.title,
        description: input.note,
        status: reportStatus,
        rejectionReason: status === 'REJECTED' ? (input.rejectionReason ?? null) : null,
        priority: 'MEDIUM',
        captureBundle: payload.captureBundle as unknown as Prisma.InputJsonValue,
        reporterId: input.authorId,
        createdAt,
        updatedAt,
        activities: {
          create: { type: 'REPORT_CREATED', payload: {}, actorId: input.authorId },
        },
      },
      include: { reporter: { select: { id: true, displayName: true, email: true } } },
    });
    return report;
  });
};

export const migrateLegacyManagedAnnotations = async (database: DatabaseService): Promise<void> => {
  const legacy = await database.managedAnnotation.findMany({ where: { sourceReportId: null } });
  for (const annotation of legacy) {
    await createCommercialReport(
      database,
      {
        id: annotation.id,
        projectId: annotation.projectId,
        authorId: annotation.authorId,
        title: annotation.title,
        note: annotation.note,
        kind: annotation.kind,
        pageUrl: annotation.pageUrl,
        status: annotation.status,
        rejectionReason: annotation.rejectionReason,
        createdAt: annotation.createdAt,
        updatedAt: annotation.updatedAt,
      },
      annotation.id,
    );
  }
  await database.managedAnnotation.deleteMany({ where: { sourceReportId: { not: null } } });
};
