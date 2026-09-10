import type { Report, AgentRepository } from '@markfix/contracts';
export type Grant = {
  id: string;
  deviceName: string;
  projectIds: string[];
  access: string;
  refresh: string;
  accessUntil: number;
  expires: number;
  revoked: boolean;
};
export type Run = {
  id: string;
  reportId: string;
  grantId: string;
  version: number;
  leaseUntil: number;
  status: string;
  result?: string;
};
type Issue = { revision: string; report: Report };
export type State = {
  identity: string;
  grants: Grant[];
  repositories: Array<AgentRepository & { localId: string; grantId: string }>;
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
  for (const grant of state.grants) {
    grant.projectIds = grant.projectIds.filter((id) => id !== projectId);
    if (!grant.projectIds.length) grant.revoked = true;
  }
  state.repositories = state.repositories.filter((repo) =>
    state.grants.some((grant) => grant.id === repo.grantId && grant.projectIds.length),
  );
}
