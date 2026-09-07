import type { Report } from '@markfix/contracts';

export type ReportRejection = { reason: string; updatedAt: string };

const isNewerAttempt = (candidate: Report, current: Report): boolean =>
  candidate.createdAt > current.createdAt ||
  (candidate.createdAt === current.createdAt && candidate.updatedAt > current.updatedAt);

export const latestAnnotationReports = (reports: readonly Report[]): Report[] => {
  const latest = new Map<string, Report>();
  for (const report of reports) {
    const sourceId = report.captureBundle.sourceAnnotationId ?? report.id;
    const current = latest.get(sourceId);
    if (!current || isNewerAttempt(report, current)) latest.set(sourceId, report);
  }
  return [...latest.values()];
};

export const latestReportRejections = (
  reports: readonly Report[],
): ReadonlyMap<string, ReportRejection> => {
  const rejections = new Map<string, ReportRejection>();
  for (const report of latestAnnotationReports(reports)) {
    const reason = report.rejectionReason?.trim();
    if (!reason) continue;
    rejections.set(report.captureBundle.sourceAnnotationId ?? report.id, {
      reason,
      updatedAt: report.updatedAt,
    });
  }
  return rejections;
};

export const rejectedRecordUpdates = <
  T extends {
    id: string;
    status: 'draft' | 'submitted' | 'rejected';
    updatedAt: string;
    rejectionReason?: string | undefined;
  },
>(
  records: readonly T[],
  rejections: ReadonlyMap<string, ReportRejection>,
): T[] =>
  records.flatMap((record) => {
    const rejection = rejections.get(record.id);
    if (!rejection || record.status !== 'submitted' || rejection.updatedAt <= record.updatedAt)
      return [];
    return [
      {
        ...record,
        status: 'rejected',
        rejectionReason: rejection.reason,
        updatedAt: rejection.updatedAt,
      } as T,
    ];
  });
