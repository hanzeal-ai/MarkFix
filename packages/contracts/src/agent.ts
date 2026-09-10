import { z } from 'zod';

export const agentPolicy = {
  accessTokenMs: 15 * 60_000,
  leaseMs: 15 * 60_000,
  grantMs: 30 * 86400_000,
} as const;
export const agentTypeSchema = z.literal('codex');
export const deviceAuthorizationSchema = z.object({
  deviceName: z.string().trim().min(1).max(120),
  agentType: agentTypeSchema,
});
export const deviceDecisionSchema = z.object({
  userCode: z.string().regex(/^[A-F0-9]{8}$/),
  approve: z.boolean(),
  projectIds: z.array(z.uuid()).max(100).default([]),
});
export const agentTokenSchema = z.object({ deviceCode: z.string().min(32).max(128) });
export const agentRefreshSchema = z.object({ refreshToken: z.string().min(32).max(128) });
export const repositoryRegistrationSchema = z.object({
  localId: z.uuid(),
  name: z.string().trim().min(1).max(120),
});
export const repositoryBindingSchema = z.object({
  repositoryId: z.uuid().nullable(),
  repositoryName: z.string().trim().min(1).max(120).nullable(),
});
export const fixClaimSchema = z.object({
  runId: z.uuid(),
  expectedVersion: z.number().int().positive(),
  retry: z.boolean().default(false),
});
export const fixCheckSchema = z.object({
  command: z.string().trim().min(1).max(1000),
  outcome: z.enum(['passed', 'failed', 'unverified']),
  details: z.string().trim().min(1).max(4000),
});
export const fixSuccessSchema = z.object({
  summary: z.string().trim().min(1).max(4000),
  checks: z
    .array(fixCheckSchema.extend({ outcome: z.literal('passed') }))
    .min(1)
    .max(30),
});
export const fixFailureSchema = z.object({
  summary: z.string().trim().min(1).max(4000),
  reason: z.string().trim().min(1).max(4000),
  stage: z.string().trim().min(1).max(120),
  checks: z.array(fixCheckSchema).max(30).default([]),
});
export const agentIssueQuerySchema = z.object({
  projectId: z.uuid(),
  status: z.enum(['OPEN', 'FIX_FAILED', 'IN_PROGRESS', 'RESOLVED']).default('OPEN'),
  cursor: z.uuid().optional(),
  limit: z.coerce.number().int().min(1).max(100).default(30),
});
export type AgentRepository = {
  id: string;
  name: string;
  deviceName: string;
  agentType: string;
  updatedAt: string;
};
export type AgentGrantSummary = {
  id: string;
  deviceName: string;
  agentType: string;
  projectIds: string[];
  revokedAt: string | null;
  expiresAt: string;
  lastUsedAt: string;
};
export type FixAttempt = {
  id: string;
  status: string;
  summary: string | null;
  reason: string | null;
  stage: string | null;
  evidence: unknown;
  createdAt: string;
  finishedAt: string | null;
};
