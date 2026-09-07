import type { Prisma } from '@markfix/database';

export type CommercialAnnotationStatus = 'OPEN' | 'IN_REVIEW' | 'RESOLVED' | 'REJECTED';
export type CommercialAnnotationKind = 'ELEMENT' | 'SCREENSHOT' | 'COMMENT';

export type ReportAnnotationSource = {
  id: string;
  projectId: string;
  reporterId: string | null;
  reporter?: { id: string; displayName: string; email: string } | null;
  title: string;
  description: string;
  status: 'OPEN' | 'IN_PROGRESS' | 'READY_FOR_VERIFY' | 'RESOLVED' | 'CLOSED';
  rejectionReason: string | null;
  captureBundle: unknown;
  createdAt: Date;
  updatedAt: Date;
};

type ReportBundle = {
  page?: { url?: unknown };
  anchor?: { kind?: unknown };
  annotations?: unknown[];
  annotationKind?: unknown;
};

const bundleOf = (report: Pick<ReportAnnotationSource, 'captureBundle'>): ReportBundle =>
  report.captureBundle as ReportBundle;

export const reportAnnotationStatus = (
  report: Pick<ReportAnnotationSource, 'status' | 'rejectionReason'>,
): CommercialAnnotationStatus => {
  if (report.rejectionReason) return 'REJECTED';
  if (report.status === 'IN_PROGRESS' || report.status === 'READY_FOR_VERIFY') return 'IN_REVIEW';
  if (report.status === 'RESOLVED' || report.status === 'CLOSED') return 'RESOLVED';
  return 'OPEN';
};

export const reportAnnotationKind = (
  report: Pick<ReportAnnotationSource, 'captureBundle'>,
): CommercialAnnotationKind => {
  const bundle = bundleOf(report);
  if (
    bundle.annotationKind === 'ELEMENT' ||
    bundle.annotationKind === 'SCREENSHOT' ||
    bundle.annotationKind === 'COMMENT'
  )
    return bundle.annotationKind;
  if (bundle.anchor?.kind === 'element') return 'ELEMENT';
  if (bundle.anchor?.kind === 'region' || bundle.annotations?.length) return 'SCREENSHOT';
  return 'COMMENT';
};

export const reportAnnotationPageUrl = (
  report: Pick<ReportAnnotationSource, 'captureBundle'>,
): string => {
  const value = bundleOf(report).page?.url;
  return typeof value === 'string' ? value : 'https://markfix.local';
};

export const reportToCommercialAnnotation = (report: ReportAnnotationSource) => ({
  id: report.id,
  projectId: report.projectId,
  authorId: report.reporterId,
  author: report.reporter ?? null,
  title: report.title,
  note: report.description,
  kind: reportAnnotationKind(report),
  pageUrl: reportAnnotationPageUrl(report),
  status: reportAnnotationStatus(report),
  rejectionReason: report.rejectionReason,
  createdAt: report.createdAt,
  updatedAt: report.updatedAt,
});

export const reportStatusForAnnotation = (
  status: Exclude<CommercialAnnotationStatus, 'REJECTED'>,
) => (status === 'IN_REVIEW' ? ('IN_PROGRESS' as const) : status);

export const updateReportBundle = (
  captureBundle: unknown,
  update: { kind?: CommercialAnnotationKind; pageUrl?: string },
): Prisma.InputJsonValue => {
  const bundle = bundleOf({ captureBundle });
  return {
    ...bundle,
    ...(update.kind ? { annotationKind: update.kind } : {}),
    ...(update.pageUrl ? { page: { ...(bundle.page ?? {}), url: update.pageUrl } } : {}),
  } as Prisma.InputJsonValue;
};
