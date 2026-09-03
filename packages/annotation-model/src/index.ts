import type { Annotation } from '@markfix/contracts';

export type AnnotationDocument = {
  schemaVersion: 1;
  annotations: Annotation[];
};

export type AnnotationCommand =
  | { type: 'add'; annotation: Annotation }
  | { type: 'remove'; annotationId: string }
  | { type: 'replace'; annotation: Annotation };

export const emptyAnnotationDocument = (): AnnotationDocument => ({
  schemaVersion: 1,
  annotations: [],
});

export const applyAnnotationCommand = (
  document: AnnotationDocument,
  command: AnnotationCommand,
): AnnotationDocument => {
  switch (command.type) {
    case 'add':
      if (document.annotations.some(({ id }) => id === command.annotation.id)) return document;
      return { ...document, annotations: [...document.annotations, command.annotation] };
    case 'remove':
      return {
        ...document,
        annotations: document.annotations.filter(({ id }) => id !== command.annotationId),
      };
    case 'replace':
      return {
        ...document,
        annotations: document.annotations.map((annotation) =>
          annotation.id === command.annotation.id ? command.annotation : annotation,
        ),
      };
  }
};

export const annotationBounds = (
  annotation: Annotation,
): { x: number; y: number; width: number; height: number } => {
  if (annotation.type === 'pin' || annotation.type === 'text') {
    return { x: annotation.position.x, y: annotation.position.y, width: 0, height: 0 };
  }
  const points = annotation.type === 'pen' ? annotation.points : [annotation.start, annotation.end];
  const xValues = points.map(({ x }) => x);
  const yValues = points.map(({ y }) => y);
  const minX = Math.min(...xValues);
  const minY = Math.min(...yValues);
  return {
    x: minX,
    y: minY,
    width: Math.max(...xValues) - minX,
    height: Math.max(...yValues) - minY,
  };
};
