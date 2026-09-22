import type { CapturePin, ElementCommentPin } from '../../capture-pin';
import type { ProjectAnnotation } from './project-navigation/model';

export function previewAnnotationPins(annotations: readonly ProjectAnnotation[]) {
  const elementComments: ElementCommentPin[] = [];
  const captures: CapturePin[] = [];
  annotations.forEach(({ type, record }, index) => {
    const previewNumber = index + 1;
    if (type === 'element') elementComments.push({ ...record, previewNumber });
    if (type === 'capture') {
      const { id, projectId, pageUrl, selection } = record;
      captures.push({ id, projectId, pageUrl, selection, previewNumber });
    }
  });
  return { elementComments, captures };
}
