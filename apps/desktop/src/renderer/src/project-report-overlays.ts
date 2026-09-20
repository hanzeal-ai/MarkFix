import type { Report, SavedElementComment } from '@markfix/contracts';
import { latestAnnotationReports } from './report-reconciliation';

export type ProjectReportOverlays = {
  elementComments: SavedElementComment[];
};

const samePage = (left: string, right: string): boolean =>
  URL.canParse(left) && URL.canParse(right) && new URL(left).href === new URL(right).href;

export const projectReportOverlays = (
  reports: readonly Report[],
  projectId: string | undefined,
  pageSessionId: string | undefined,
  pageUrl: string,
): ProjectReportOverlays => {
  if (!projectId || !pageSessionId || !pageUrl) return { elementComments: [] };

  const elementComments: SavedElementComment[] = [];
  for (const report of latestAnnotationReports(reports)) {
    const bundle = report.captureBundle;
    if (report.projectId !== projectId || !samePage(bundle.page.url, pageUrl)) continue;

    if (bundle.anchor?.kind === 'element') {
      elementComments.push({
        id: bundle.sourceAnnotationId ?? report.id,
        projectId,
        pageSessionId,
        pageTitle: bundle.page.title,
        pageUrl: bundle.page.url,
        status: report.rejectionReason ? 'rejected' : 'submitted',
        ...(report.rejectionReason ? { rejectionReason: report.rejectionReason } : {}),
        submittedAt: report.createdAt,
        anchor: bundle.anchor,
        note: report.description,
        createdAt: report.createdAt,
        updatedAt: report.updatedAt,
      });
    }
  }

  return { elementComments };
};
