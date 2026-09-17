import type {
  SavedCapture,
  SavedDiagnosticAnnotation,
  SavedElementComment,
} from '@markfix/contracts';

export type ProjectAnnotation =
  | { type: 'element'; record: SavedElementComment }
  | { type: 'capture'; record: SavedCapture }
  | { type: 'diagnostic'; record: SavedDiagnosticAnnotation };

export const projectAnnotations = (
  projectId: string,
  elementComments: readonly SavedElementComment[],
  captures: readonly SavedCapture[],
  diagnostics: readonly SavedDiagnosticAnnotation[],
): ProjectAnnotation[] =>
  [
    ...elementComments
      .filter((record) => record.projectId === projectId)
      .map((record) => ({ type: 'element' as const, record })),
    ...captures
      .filter((record) => record.projectId === projectId)
      .map((record) => ({ type: 'capture' as const, record })),
    ...diagnostics
      .filter((record) => record.projectId === projectId)
      .map((record) => ({ type: 'diagnostic' as const, record })),
  ].sort((left, right) => right.record.updatedAt.localeCompare(left.record.updatedAt));

export const annotationCounts = (annotations: readonly ProjectAnnotation[]) => ({
  total: annotations.length,
  draft: annotations.filter(({ record }) => record.status === 'draft').length,
  submitted: annotations.filter(({ record }) => record.status === 'submitted').length,
  rejected: annotations.filter(({ record }) => record.status === 'rejected').length,
});

export const previewAnnotations = (
  annotations: readonly ProjectAnnotation[],
): ProjectAnnotation[] =>
  annotations.filter(({ record }) => record.status === 'draft' || record.status === 'rejected');
