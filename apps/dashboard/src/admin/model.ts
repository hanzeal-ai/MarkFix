export type AdminView = 'overview' | 'projects' | 'users';
export type AnnotationStatus = 'OPEN' | 'IN_REVIEW' | 'RESOLVED' | 'REJECTED';
export type AnnotationKind = 'ELEMENT' | 'SCREENSHOT' | 'COMMENT';

export type CommercialAnnotation = {
  id: string;
  projectId: string;
  authorId: string | null;
  author: { id: string; displayName: string; email: string } | null;
  title: string;
  note: string;
  kind: AnnotationKind;
  pageUrl: string;
  screenshotUrl: string | null;
  status: AnnotationStatus;
  rejectionReason: string | null;
  createdAt: string;
  updatedAt: string;
};

export type OverviewProject = {
  id: string;
  workspaceId: string;
  name: string;
  baseUrl: string | null;
  category: string;
  annotationCount: number;
  pendingCount: number;
  rejectedCount: number;
  resolvedCount: number;
  createdAt: string;
  updatedAt: string;
};

export type OverviewUser = {
  id: string;
  displayName: string;
  email: string;
  role: string;
  annotationCount: number;
  rejectedCount: number;
  projectCategories: Array<{ category: string; count: number }>;
};

export type CommercialOverview = {
  metrics: { projects: number; annotations: number; pending: number; rejected: number };
  projects: OverviewProject[];
  users: OverviewUser[];
};

export type CommercialBootstrap = {
  user: {
    id: string;
    email: string;
    displayName: string;
    emailVerified: boolean;
    createdAt: string;
    updatedAt: string;
  };
  workspaces: Array<{
    id: string;
    name: string;
    role: string;
    createdAt: string;
    updatedAt: string;
  }>;
  workspaceId: string;
  overview: CommercialOverview;
};

export type PaginatedAnnotations = {
  items: CommercialAnnotation[];
  total: number;
  page: number;
  pageSize: number;
};

export type EditorState =
  | { mode: 'create'; annotation?: undefined }
  | { mode: 'view' | 'edit' | 'reject'; annotation: CommercialAnnotation };

export const statusText: Record<AnnotationStatus, string> = {
  OPEN: '待处理',
  IN_REVIEW: '处理中',
  RESOLVED: '已解决',
  REJECTED: '已驳回',
};

export const kindText: Record<AnnotationKind, string> = {
  ELEMENT: '元素标注',
  SCREENSHOT: '截图标注',
  COMMENT: '文字批注',
};

export const formatDate = (value: string) =>
  new Intl.DateTimeFormat('zh-CN', {
    month: 'numeric',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(value));

export const projectProgress = (project: OverviewProject) =>
  project.annotationCount ? Math.round((project.resolvedCount / project.annotationCount) * 100) : 0;
