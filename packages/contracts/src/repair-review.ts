import { z } from 'zod';

export const repairReviewStatuses = { verify: 'RESOLVED', reject: 'OPEN' } as const;
export const repairReviewSchema = z
  .object({
    projectId: z.uuid(),
    reportId: z.uuid(),
    expectedVersion: z.number().int().positive(),
    action: z.enum(['verify', 'reject']),
    reason: z.string().trim().max(2000).optional(),
  })
  .refine((value) => value.action !== 'reject' || Boolean(value.reason), '请说明仍未解决的问题');
export type RepairReview = z.infer<typeof repairReviewSchema>;
