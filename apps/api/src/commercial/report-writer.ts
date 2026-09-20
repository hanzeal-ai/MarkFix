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
    schemaVersion: 2 as const,
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

    reproduction: [],
  },
});

export const createCommercialReport = async (
  database: DatabaseService,
  input: CommercialReportInput,
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
