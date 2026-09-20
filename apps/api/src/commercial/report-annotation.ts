import { captureBundleSchema, createReportSchema } from '@markfix/contracts';
import type { Prisma } from '@markfix/database';

import type {
  AnnotationKind as CommercialAnnotationKind,
  AnnotationStatus as CommercialAnnotationStatus,
} from '@markfix/contracts';
export type {
  AnnotationKind as CommercialAnnotationKind,
  AnnotationStatus as CommercialAnnotationStatus,
} from '@markfix/contracts';

export type ReportAnnotationSource = {
  id: string;
  projectId: string;
  reporterId: string | null;
  reporter?: { id: string; displayName: string; email: string } | null;
  title: string;
  description: string;
  status: 'OPEN' | 'IN_PROGRESS' | 'READY_FOR_VERIFY' | 'RESOLVED' | 'CLOSED' | 'FIX_FAILED';
  rejectionReason: string | null;
  fixAttempts?: Array<{
    id: string;
    status: string;
    summary: string | null;
    reason: string | null;
    stage: string | null;
    evidence: unknown;
    createdAt: Date;
    finishedAt: Date | null;
  }>;
  captureBundle: unknown;
  screenshotPath?: string | null;
  createdAt: Date;
  updatedAt: Date;
};

export type ReportActivitySource = {
  id: string;
  type: string;
  payload: unknown;
  actor?: { id: string; displayName: string; email: string } | null;
  createdAt: Date;
};

export type CommercialAnnotationHistoryItem = {
  id: string;
  action: 'SUBMITTED' | 'REJECTED' | 'RESUBMITTED' | 'STATUS_CHANGED';
  status: CommercialAnnotationStatus;
  note: string | null;
  screenshotUrl: string | null;
  reason: string | null;
  actor: { id: string; displayName: string; email: string } | null;
  createdAt: Date;
};

export type ReportSubmissionSource = {
  id: string;
  payload: unknown;
  artifact?: { id: string } | null;
  createdBy?: { id: string; displayName: string; email: string } | null;
  createdAt: Date;
};

const bundleOf = (report: Pick<ReportAnnotationSource, 'captureBundle'>) =>
  captureBundleSchema.parse(report.captureBundle);

const artifactUrl = (id: string | null | undefined): string | null =>
  id ? `/v1/artifacts/${encodeURIComponent(id)}` : null;

const storedSubmissionSchema = createReportSchema.omit({ screenshotDataUrl: true });
const submissionPayload = (submission: ReportSubmissionSource) =>
  storedSubmissionSchema.parse(submission.payload);

export const submissionSourceAnnotationId = (
  submission: ReportSubmissionSource,
): string | undefined => submissionPayload(submission).captureBundle.sourceAnnotationId;

const submissionHistoryContent = (submission: ReportSubmissionSource) => ({
  note: submissionPayload(submission).description,
  screenshotUrl: artifactUrl(submission.artifact?.id),
});

export const reportAnnotationReferenceCode = (report: Pick<ReportAnnotationSource, 'id'>): string =>
  `#MF-${report.id.replaceAll('-', '').slice(0, 8).toUpperCase()}`;

const activityPayload = (activity: ReportActivitySource): Record<string, unknown> =>
  typeof activity.payload === 'object' && activity.payload !== null
    ? (activity.payload as Record<string, unknown>)
    : {};

const historyStatus = (value: unknown): CommercialAnnotationStatus | undefined =>
  value === 'OPEN' || value === 'RESOLVED' || value === 'REJECTED' || value === 'FIX_FAILED'
    ? value
    : undefined;

export const annotationHistoryForReport = (
  report: ReportAnnotationSource & { activities?: ReportActivitySource[] },
  submissions: readonly ReportSubmissionSource[],
): CommercialAnnotationHistoryItem[] => {
  const history: CommercialAnnotationHistoryItem[] = [...submissions]
    .sort((left, right) => left.createdAt.getTime() - right.createdAt.getTime())
    .map((submission, index) => ({
      id: submission.id,
      action: index === 0 ? 'SUBMITTED' : 'RESUBMITTED',
      status: 'OPEN',
      ...submissionHistoryContent(submission),
      reason: null,
      actor: submission.createdBy ?? report.reporter ?? null,
      createdAt: submission.createdAt,
    }));

  for (const activity of report.activities ?? []) {
    const payload = activityPayload(activity);
    if (activity.type === 'ANNOTATION_REJECTED') {
      history.push({
        id: activity.id,
        action: 'REJECTED',
        status: 'REJECTED',
        note: null,
        screenshotUrl: null,
        reason: typeof payload.reason === 'string' ? payload.reason : null,
        actor: activity.actor ?? null,
        createdAt: activity.createdAt,
      });
    } else if (activity.type === 'ANNOTATION_STATUS_CHANGED') {
      const status = historyStatus(payload.status);
      if (!status) continue;
      history.push({
        id: activity.id,
        action: 'STATUS_CHANGED',
        status,
        note: null,
        screenshotUrl: null,
        reason: null,
        actor: activity.actor ?? null,
        createdAt: activity.createdAt,
      });
    }
  }

  return history.sort((left, right) => right.createdAt.getTime() - left.createdAt.getTime());
};

export const reportAnnotationStatus = (
  report: Pick<ReportAnnotationSource, 'status' | 'rejectionReason'>,
): CommercialAnnotationStatus => {
  if (report.rejectionReason) return 'REJECTED';
  if (report.status === 'FIX_FAILED') return 'FIX_FAILED';
  if (report.status === 'IN_PROGRESS' || report.status === 'READY_FOR_VERIFY') return 'OPEN';
  if (report.status === 'RESOLVED' || report.status === 'CLOSED') return 'RESOLVED';
  return 'OPEN';
};

export const reportAnnotationKind = (
  report: Pick<ReportAnnotationSource, 'captureBundle'>,
): CommercialAnnotationKind => bundleOf(report).annotationKind;

export const reportAnnotationPageUrl = (
  report: Pick<ReportAnnotationSource, 'captureBundle'>,
): string => bundleOf(report).page.url;

export const reportToCommercialAnnotation = (
  report: ReportAnnotationSource,
  history: CommercialAnnotationHistoryItem[] = [],
) => ({
  id: report.id,
  referenceCode: reportAnnotationReferenceCode(report),
  projectId: report.projectId,
  authorId: report.reporterId,
  author: report.reporter ?? null,
  title: report.title,
  note: report.description,
  kind: reportAnnotationKind(report),
  pageUrl: reportAnnotationPageUrl(report),
  screenshotUrl: artifactUrl(report.screenshotPath),
  status: reportAnnotationStatus(report),
  rejectionReason: report.rejectionReason,
  history,
  evidence: bundleOf(report).evidence ?? [],
  fixAttempts: report.fixAttempts ?? [],
  createdAt: report.createdAt,
  updatedAt: report.updatedAt,
});

export const reportStatusForAnnotation = (
  status: Exclude<CommercialAnnotationStatus, 'REJECTED'>,
) => status;

export const updateReportBundle = (
  captureBundle: unknown,
  update: { kind?: CommercialAnnotationKind; pageUrl?: string },
): Prisma.InputJsonValue => {
  const bundle = bundleOf({ captureBundle });
  return {
    ...bundle,
    ...(update.kind ? { annotationKind: update.kind } : {}),
    ...(update.pageUrl ? { page: { ...bundle.page, url: update.pageUrl } } : {}),
  } as Prisma.InputJsonValue;
};
