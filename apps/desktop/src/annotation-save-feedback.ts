import { z } from 'zod';

export const annotationSaveMessages = {
  'missing-context': '项目或页面尚未准备好，请重新打开项目后再保存。',
  'missing-selection': '标注选区已失效，请重新选择后再保存。',
  'empty-note': '请先填写标注备注。',
  'capture-not-ready': '截图还未准备好，请稍候再保存。',
  'stale-page': '页面或标注模式已变化，请重新选择标注后再保存。',
  'save-failed': '标注保存失败，编辑内容已保留。请检查网络后重试。',
  'preview-failed': '标注已保存，但预览未能打开。请从预览列表查看。',
} as const;
export const annotationSaveFeedbackSchema = z.enum([
  'missing-context',
  'missing-selection',
  'empty-note',
  'capture-not-ready',
  'stale-page',
  'save-failed',
  'preview-failed',
  'submit-received',
  'preview-opened',
]);
export type AnnotationSaveFeedback = z.infer<typeof annotationSaveFeedbackSchema>;
export const annotationSaveFeedbackChannel = 'annotation:save-feedback';
