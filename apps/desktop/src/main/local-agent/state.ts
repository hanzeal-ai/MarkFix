import type { Report, AgentRepository } from '@markfix/contracts';
export type Run = {
  id: string;
  reportId: string;
  version: number;
  leaseUntil: number;
  status: string;
  result?: string;
};
type Issue = { revision: string; report: Report };
export type State = {
  identity: string;
  repositories: Array<AgentRepository & { localId: string }>;
  issues: Record<string, Issue>;
  runs: Record<string, Run>;
};

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
