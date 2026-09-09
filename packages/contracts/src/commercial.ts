import { z } from 'zod';
import type { FixAttempt } from './agent.js';

export const commercialAnnotationInputSchema = z.object({
  title: z.string().trim().min(1).max(160),
  note: z.string().trim().min(1).max(4000),
  kind: z.enum(['ELEMENT', 'SCREENSHOT', 'COMMENT']),
  pageUrl: z.url(),
  authorId: z.uuid().optional(),
});

export const commercialAnnotationUpdateSchema = commercialAnnotationInputSchema
  .partial()
  .extend({ status: z.enum(['OPEN', 'IN_REVIEW', 'RESOLVED']).optional() })
  .refine((value) => Object.keys(value).length > 0, 'At least one field is required');

export const commercialRejectionSchema = z.object({ reason: z.string().trim().min(3).max(1000) });
export const commercialCategorySchema = z.object({ category: z.string().trim().min(1).max(40) });
export const commercialAnnotationListQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(50),
  status: z.enum(['OPEN', 'IN_REVIEW', 'RESOLVED', 'REJECTED', 'FIX_FAILED']).optional(),
  query: z.string().trim().max(200).optional(),
});

export type AnnotationStatus = z.infer<typeof commercialAnnotationListQuerySchema>['status'] &
  string;
export type AnnotationKind = z.infer<typeof commercialAnnotationInputSchema>['kind'];

export type CommercialAnnotation = {
  id: string;
  referenceCode: string;
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
  fixAttempts?: FixAttempt[];
  history: Array<{
    id: string;
    action: 'SUBMITTED' | 'REJECTED' | 'RESUBMITTED' | 'STATUS_CHANGED';
    status: AnnotationStatus;
    note: string | null;
    screenshotUrl: string | null;
    reason: string | null;
    actor: { id: string; displayName: string; email: string } | null;
    createdAt: string;
  }>;
  createdAt: string;
  updatedAt: string;
};

export type OverviewProject = {
  id: string;
  ownerId: string;
  role?: string;
  name: string;
  baseUrl: string | null;
  category: string;
  annotationCount: number;
  pendingCount: number;
  rejectedCount: number;
  resolvedCount: number;
  failedCount: number;
  memberCount: number;
  createdAt: string;
  updatedAt: string;
};

export type OverviewUser = {
  projectIds?: string[];
  id: string;
  displayName: string;
  email: string;
  projectRoles: Record<string, string>;
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
  overview: CommercialOverview;
};

export type PaginatedAnnotations = {
  items: CommercialAnnotation[];
  total: number;
  page: number;
  pageSize: number;
};
