import { ForbiddenException, NotFoundException } from '@nestjs/common';
import type { Prisma } from '@markfix/database';
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

export const requireMembership = async (
  database: Pick<Prisma.TransactionClient, 'membership'>,
  userId: string,
  projectId: string,
  roles?: ProjectRole[],
) => {
  const membership = await database.membership.findUnique({
    where: { projectId_userId: { projectId, userId } },
  });
  if (!membership || membership.status !== 'ACTIVE' || (roles && !roles.includes(membership.role)))
    throw new ForbiddenException('You do not have access to this project action');
  return membership;
};

export const requireProjectAccess = async (
  database: Pick<Prisma.TransactionClient, 'project' | 'membership'>,
  userId: string,
  projectId: string,
) => {
  const project = await database.project.findUnique({ where: { id: projectId } });
  if (!project) throw new NotFoundException('Project not found');
  await requireMembership(database, userId, project.id);
  return project;
};
