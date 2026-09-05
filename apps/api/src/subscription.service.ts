import { ConflictException, ForbiddenException, Inject, Injectable } from '@nestjs/common';
import { DatabaseService } from './database.service.js';

const planLimits = {
  FREE: { projectLimit: 3, memberLimit: 1 },
  TEAM: { projectLimit: null, memberLimit: null },
} as const;

@Injectable()
export class SubscriptionService {
  constructor(@Inject(DatabaseService) private readonly database: DatabaseService) {}

  async getSubscription(userId: string, workspaceId: string) {
    await this.requireMembership(userId, workspaceId);
    return this.subscription(workspaceId);
  }

  async requestUpgrade(userId: string, workspaceId: string) {
    const membership = await this.requireMembership(userId, workspaceId);
    if (membership.role !== 'OWNER') {
      throw new ForbiddenException('Only the workspace owner can manage the subscription');
    }
    const current = await this.subscription(workspaceId);
    if (current.plan === 'TEAM') return { ...current, upgraded: false, alreadyUpgraded: true };

    if (process.env.MARKFIX_ALLOW_SELF_SERVICE_PLAN_UPGRADE === 'true') {
      await this.database.workspace.update({
        where: { id: workspaceId },
        data: { plan: 'TEAM', upgradeRequestedAt: null },
      });
      return { ...(await this.subscription(workspaceId)), upgraded: true, alreadyUpgraded: false };
    }

    await this.database.workspace.update({
      where: { id: workspaceId },
      data: { upgradeRequestedAt: new Date() },
    });
    return {
      ...current,
      upgraded: false,
      alreadyUpgraded: false,
      upgradeRequested: true,
      upgradeUrl: `${process.env.MARKFIX_DASHBOARD_ORIGIN ?? 'http://localhost:4311'}/pricing`,
    };
  }

  async assertCanCreateProject(userId: string, workspaceId: string) {
    await this.requireMembership(userId, workspaceId);
    const subscription = await this.subscription(workspaceId);
    if (
      subscription.projectLimit !== null &&
      subscription.usage.projects >= subscription.projectLimit
    ) {
      throw new ConflictException('Project limit reached; upgrade to the Team plan');
    }
  }

  async assertCanInviteMember(userId: string, workspaceId: string) {
    await this.requireMembership(userId, workspaceId);
    const subscription = await this.subscription(workspaceId);
    if (
      subscription.memberLimit !== null &&
      subscription.usage.members >= subscription.memberLimit
    ) {
      throw new ConflictException('Member limit reached; upgrade to the Team plan');
    }
  }

  private async subscription(workspaceId: string) {
    const workspace = await this.database.workspace.findUnique({
      where: { id: workspaceId },
      select: {
        plan: true,
        upgradeRequestedAt: true,
        _count: {
          select: {
            projects: true,
            memberships: { where: { status: 'ACTIVE' } },
          },
        },
      },
    });
    if (!workspace) throw new ForbiddenException('Workspace is unavailable');
    const limits = planLimits[workspace.plan];
    return {
      plan: workspace.plan,
      planName: workspace.plan === 'TEAM' ? '团队版' : '个人版',
      ...limits,
      usage: { projects: workspace._count.projects, members: workspace._count.memberships },
      upgradeRequestedAt: workspace.upgradeRequestedAt?.toISOString() ?? null,
    };
  }

  private async requireMembership(userId: string, workspaceId: string) {
    const membership = await this.database.membership.findUnique({
      where: { workspaceId_userId: { workspaceId, userId } },
    });
    if (!membership || membership.status !== 'ACTIVE') {
      throw new ForbiddenException('You do not have access to this workspace');
    }
    return membership;
  }
}
