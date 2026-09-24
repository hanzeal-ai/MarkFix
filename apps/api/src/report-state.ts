import type { ReportStatus, ReportTransition } from '@markfix/contracts';

export type TransitionAction = ReportTransition['action'];

const transitions: Record<ReportStatus, Partial<Record<TransitionAction, ReportStatus>>> = {
  FIX_FAILED: { start: 'IN_PROGRESS', reopen: 'OPEN' },
  OPEN: { start: 'IN_PROGRESS' },
  IN_PROGRESS: { submit_for_verification: 'READY_FOR_VERIFY' },
  READY_FOR_VERIFY: { verify: 'RESOLVED', reject: 'IN_PROGRESS' },
  RESOLVED: { close: 'CLOSED', reopen: 'OPEN' },
  CLOSED: { reopen: 'OPEN' },
};

export const transitionReport = (status: ReportStatus, action: TransitionAction): ReportStatus => {
  const next = transitions[status][action];
  if (!next) throw new Error(`Transition ${action} is not allowed from ${status}`);
  return next;
};
