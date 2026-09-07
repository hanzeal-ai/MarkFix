import type {
  CreateReport,
  SavedCapture,
  SavedDiagnosticAnnotation,
  SavedElementComment,
} from '@markfix/contracts';

export type AnnotationSelection = {
  captures: SavedCapture[];
  diagnostics: SavedDiagnosticAnnotation[];
  elementComments: SavedElementComment[];
};

export type ReportSubmissionInput = {
  idempotencyKey: string;
  report: CreateReport;
};

const pageSnapshot = (
  pageUrl: string,
  pageTitle: string,
  capturedAt: string,
  widthCssPx = 1,
  heightCssPx = 1,
  deviceScaleFactor = 1,
) => ({
  url: pageUrl,
  title: pageTitle,
  viewportWidthCssPx: Math.max(1, widthCssPx),
  viewportHeightCssPx: Math.max(1, heightCssPx),
  deviceScaleFactor: Math.max(0.01, deviceScaleFactor),
  capturedAt,
});

const titleFor = (prefix: string, pageTitle: string): string =>
  `${prefix} · ${pageTitle || '未命名页面'}`.slice(0, 200);

const submissionKey = (record: { id: string; updatedAt: string }): string =>
  `${record.id}@${record.updatedAt}`;

export const annotationSelectionReportInputs = (
  projectId: string,
  selection: AnnotationSelection,
): ReportSubmissionInput[] => [
  ...selection.elementComments.map((record) => ({
    idempotencyKey: submissionKey(record),
    report: {
      projectId,
      title: titleFor('元素批注', record.pageTitle),
      description: record.note,
      priority: 'MEDIUM' as const,
      ...(record.screenshotDataUrl ? { screenshotDataUrl: record.screenshotDataUrl } : {}),
      captureBundle: {
        schemaVersion: 1 as const,
        page: pageSnapshot(record.pageUrl, record.pageTitle, record.updatedAt),
        anchor: record.anchor,
        annotationKind: 'ELEMENT' as const,
        sourceAnnotationId: record.id,
        evidence: record.evidence,
        annotations: [],
        reproduction: [],
        ...(record.capture ? { capture: record.capture } : {}),
      },
    },
  })),
  ...selection.captures.map((record) => ({
    idempotencyKey: submissionKey(record),
    report: {
      projectId,
      title: titleFor('截图批注', record.pageTitle),
      description: record.note,
      priority: 'MEDIUM' as const,
      screenshotDataUrl: record.dataUrl,
      captureBundle: {
        schemaVersion: 1 as const,
        page: record.page ?? pageSnapshot(record.pageUrl, record.pageTitle, record.updatedAt),
        anchor: record.selection,
        annotationKind: 'SCREENSHOT' as const,
        sourceAnnotationId: record.id,
        evidence: record.evidence,
        annotations: [],
        reproduction: [],
        ...(record.capture ? { capture: record.capture } : {}),
      },
    },
  })),
  ...selection.diagnostics.map((record) => ({
    idempotencyKey: submissionKey(record),
    report: {
      projectId,
      title: record.evidence.title.slice(0, 200),
      description: record.evidence.message || record.evidence.title,
      priority: record.evidence.level === 'error' ? ('HIGH' as const) : ('MEDIUM' as const),
      captureBundle: {
        schemaVersion: 1 as const,
        page: pageSnapshot(record.pageUrl, record.pageTitle, record.updatedAt),
        annotationKind: 'COMMENT' as const,
        sourceAnnotationId: record.id,
        evidence: [record.evidence],
        annotations: [],
        reproduction: [],
      },
    },
  })),
];
