import type { AnnotationSaveFeedback } from '../../../annotation-save-feedback';

export const saveFeedback = (code: AnnotationSaveFeedback): void => {
  void window.markfix.annotationSaveFeedback(code).catch(() => {
    console.error('Annotation save feedback unavailable:', code);
  });
};
