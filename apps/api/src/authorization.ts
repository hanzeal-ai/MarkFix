import type { TransitionAction } from './report-state.js';
import type { ProjectRole } from '@markfix/contracts';
export type { ProjectRole } from '@markfix/contracts';

export const canTransitionReport = (
  userId: string,
  role: ProjectRole,
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

export const canRepairReport = (
  userId: string,
  role: ProjectRole,
  report: { assigneeId: string | null },
): boolean =>
  role === 'OWNER' ||
  role === 'ADMIN' ||
  (role === 'MEMBER' && (!report.assigneeId || report.assigneeId === userId));
