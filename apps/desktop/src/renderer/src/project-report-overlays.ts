import type { Annotation, Report, SavedElementComment } from '@markfix/contracts';

export type ProjectReportOverlays = {
  annotations: Annotation[];
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
  if (!projectId || !pageSessionId || !pageUrl) return { annotations: [], elementComments: [] };

  const annotations = new Map<string, Annotation>();
  const elementComments: SavedElementComment[] = [];
  for (const report of reports) {
    const bundle = report.captureBundle;
    if (report.projectId !== projectId || !samePage(bundle.page.url, pageUrl)) continue;

    if (bundle.anchor?.kind === 'element') {
      elementComments.push({
        id: bundle.sourceAnnotationId ?? report.id,
        projectId,
        pageSessionId,
        pageTitle: bundle.page.title,
        pageUrl: bundle.page.url,
        status: 'submitted',
        submittedAt: report.createdAt,
        anchor: bundle.anchor,
        note: report.description,
        createdAt: report.createdAt,
        updatedAt: report.updatedAt,
      });
    }

    if (bundle.anchor?.kind === 'region' && bundle.annotations.length === 0) {
      const annotationId = bundle.sourceAnnotationId ?? report.id;
      annotations.set(annotationId, {
        id: annotationId,
        type: 'rectangle',
        color: '#5b52e8',
        start: { x: bundle.anchor.xCssPx, y: bundle.anchor.yCssPx },
        end: {
          x: bundle.anchor.xCssPx + bundle.anchor.widthCssPx,
          y: bundle.anchor.yCssPx + bundle.anchor.heightCssPx,
        },
        createdAt: report.createdAt,
      });
    }
    for (const annotation of bundle.annotations) annotations.set(annotation.id, annotation);
  }

  return { annotations: [...annotations.values()], elementComments };
};
