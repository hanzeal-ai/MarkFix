import { apiServiceUrls } from './service-config.js';
import { ConflictException, ForbiddenException, Inject, Injectable } from '@nestjs/common';
import { DatabaseService } from './database.service.js';

const planLimits = {
  FREE: { projectLimit: 3, memberLimit: 1 },
  TEAM: { projectLimit: null, memberLimit: null },
} as const;

@Injectable()
export class SubscriptionService {
  constructor(@Inject(DatabaseService) private readonly database: DatabaseService) {}

  async getSubscription(userId: string) {
    const user = await this.database.user.findUnique({
      where: { id: userId },
      select: { plan: true, upgradeRequestedAt: true, _count: { select: { ownedProjects: true } } },
    });
    if (!user) throw new ForbiddenException('Account is unavailable');
    const members = await this.database.membership.findMany({
      where: { project: { ownerId: userId }, status: 'ACTIVE' },
      select: { userId: true },
      distinct: ['userId'],
    });
    return {
      plan: user.plan,
      planName: user.plan === 'TEAM' ? '团队版' : '个人版',
      ...planLimits[user.plan],
      usage: { projects: user._count.ownedProjects, members: members.length },
      upgradeRequestedAt: user.upgradeRequestedAt?.toISOString() ?? null,
    };
  }

  async requestUpgrade(userId: string) {
    const current = await this.getSubscription(userId);
    if (current.plan === 'TEAM') return { ...current, upgraded: false, alreadyUpgraded: true };
    if (process.env.MARKFIX_ALLOW_SELF_SERVICE_PLAN_UPGRADE === 'true') {
      await this.database.user.update({
        where: { id: userId },
        data: { plan: 'TEAM', upgradeRequestedAt: null },
      });
      return { ...(await this.getSubscription(userId)), upgraded: true, alreadyUpgraded: false };
    }
    await this.database.user.update({
      where: { id: userId },
      data: { upgradeRequestedAt: new Date() },
    });
    return {
      ...(await this.getSubscription(userId)),
      upgraded: false,
      alreadyUpgraded: false,
      upgradeRequested: true,
      upgradeUrl: `${apiServiceUrls().origin}/pricing`,
    };
  }

  async assertCanCreateProject(userId: string) {
    const subscription = await this.getSubscription(userId);
    if (
      subscription.projectLimit !== null &&
      subscription.usage.projects >= subscription.projectLimit
    )
      throw new ConflictException('Project limit reached; upgrade to the Team plan');
  }

  async assertCanInviteMember(userId: string, projectId: string) {
    const membership = await this.database.membership.findUnique({
      where: { projectId_userId: { projectId, userId } },
    });
    if (
      !membership ||
      membership.status !== 'ACTIVE' ||
      !['OWNER', 'ADMIN'].includes(membership.role)
    )
      throw new ForbiddenException('Only project managers may invite members');
    const project = await this.database.project.findUnique({ where: { id: projectId } });
    if (!project) throw new ForbiddenException('Project is unavailable');
    const subscription = await this.getSubscription(project.ownerId);
    if (subscription.memberLimit !== null && subscription.usage.members >= subscription.memberLimit)
      throw new ConflictException('Member limit reached; ask the project owner to upgrade');
  }
}
