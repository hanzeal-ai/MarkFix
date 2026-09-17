import type {
  AnnotationKind,
  AnnotationStatus,
  CommercialAnnotation,
  OverviewProject,
} from '@markfix/contracts';
export type {
  AnnotationKind,
  AnnotationStatus,
  CommercialAnnotation,
  CommercialBootstrap,
  CommercialOverview,
  OverviewProject,
  OverviewUser,
  PaginatedAnnotations,
} from '@markfix/contracts';
export type AdminView = 'overview' | 'projects' | 'users';
export type EditorState =
  | { mode: 'create'; annotation?: undefined }
  | { mode: 'view' | 'edit' | 'reject'; annotation: CommercialAnnotation };

export const statusText: Record<AnnotationStatus, string> = {
  OPEN: '未处理',
  RESOLVED: '已完成',
  FIX_FAILED: '失败',
  REJECTED: '已驳回',
};

export const kindText: Record<AnnotationKind, string> = {
  ELEMENT: '元素标注',
  SCREENSHOT: '截图标注',
  COMMENT: '文字批注',
};

const dateFormatter = new Intl.DateTimeFormat('zh-CN', {
  month: 'numeric',
  day: 'numeric',
  hour: '2-digit',
  minute: '2-digit',
});

export const formatDate = (value: string) => dateFormatter.format(new Date(value));

export const projectProgress = (project: OverviewProject) =>
  project.annotationCount ? Math.round((project.resolvedCount / project.annotationCount) * 100) : 0;
