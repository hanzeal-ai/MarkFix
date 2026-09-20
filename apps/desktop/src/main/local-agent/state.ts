import { reportSchema, agentTypeSchema } from '@markfix/contracts';
import { z } from 'zod';

const runSchema = z.strictObject({
  id: z.uuid(),
  reportId: z.uuid(),
  version: z.number().int().positive(),
  leaseUntil: z.number().finite(),
  status: z.string(),
  result: z.string().optional(),
});
export const localAgentStateSchema = z.strictObject({
  identity: z.uuid(),
  repositories: z.array(
    z.strictObject({
      id: z.uuid(),
      localId: z.uuid(),
      name: z.string(),
      deviceName: z.string(),
      agentType: agentTypeSchema,
      updatedAt: z.iso.datetime(),
    }),
  ),
  issues: z.record(
    z.uuid(),
    z.strictObject({ revision: z.string(), report: reportSchema.strict() }),
  ),
  runs: z.record(z.uuid(), runSchema),
});
export type Run = z.infer<typeof runSchema>;
export type State = z.infer<typeof localAgentStateSchema>;

export function removeLocalAgentProject(state: State, projectId: string) {
  const issueIds = new Set(
    Object.values(state.issues)
      .filter(({ report }) => report.projectId === projectId)
      .map(({ report }) => report.id),
  );
  for (const id of issueIds) delete state.issues[id];
  for (const [id, run] of Object.entries(state.runs))
    if (issueIds.has(run.reportId)) delete state.runs[id];
}
