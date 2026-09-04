import type { TransitionAction } from './report-state.js';

export type WorkspaceRole = 'OWNER' | 'ADMIN' | 'MEMBER' | 'REPORTER';

export const canTransitionReport = (
  userId: string,
  role: WorkspaceRole,
  report: { assigneeId: string | null; reporterId: string | null },
  action: TransitionAction,
): boolean => {
  if (role === 'OWNER' || role === 'ADMIN') return true;
  if (action === 'start' || action === 'submit_for_verification') {
    return report.assigneeId === userId;
  }
  if (action === 'verify' || action === 'reject' || action === 'close') {
    return report.reporterId === userId;
  }
  return action === 'reopen' && (report.reporterId === userId || role === 'MEMBER');
};
