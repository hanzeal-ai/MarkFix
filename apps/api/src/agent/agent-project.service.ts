import { repositoryBindingSchema, repositoryRegistrationSchema } from '@markfix/contracts';
import type { AgentGrant } from '@markfix/database';
import { ForbiddenException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import { DatabaseService } from '../database.service.js';
import { parseAgent } from './agent-auth.service.js';
@Injectable()
export class AgentProjectService {
  constructor(@Inject(DatabaseService) private readonly db: DatabaseService) {}
  async membership(userId: string, projectId: string, manager = false) {
    const member = await this.db.membership.findUnique({
      where: { projectId_userId: { projectId, userId } },
    });
    if (
      !member ||
      member.status !== 'ACTIVE' ||
      (manager && !['OWNER', 'ADMIN'].includes(member.role))
    )
      throw new ForbiddenException('Project permission is required');
    return member;
  }
  async access(grant: AgentGrant, projectId: string) {
    if (!grant.projectIds.includes(projectId))
      throw new ForbiddenException('Project is outside this authorization');
    return this.membership(grant.userId, projectId);
  }
  async register(grant: AgentGrant, input: unknown) {
    const data = parseAgent(repositoryRegistrationSchema, input);
    return this.db.agentRepository.upsert({
      where: { userId_localId: { userId: grant.userId, localId: data.localId } },
      create: {
        ...data,
        userId: grant.userId,
        deviceName: grant.deviceName,
        agentType: grant.agentType,
      },
      update: { name: data.name, deviceName: grant.deviceName, agentType: grant.agentType },
    });
  }
  listProjects(grant: AgentGrant) {
    return this.db.project.findMany({
      where: {
        id: { in: grant.projectIds },
        memberships: { some: { userId: grant.userId, status: 'ACTIVE' } },
      },
      select: { id: true, name: true, repositoryId: true, repositoryName: true },
      orderBy: { name: 'asc' },
    });
  }
  async resolve(grant: AgentGrant, localId: string) {
    const repository = await this.db.agentRepository.findUnique({
      where: { userId_localId: { userId: grant.userId, localId } },
    });
    if (!repository) throw new NotFoundException('Register the current repository first');
    const projects = (await this.listProjects(grant)).filter(
      (project) => project.repositoryId === repository.id,
    );
    return { repository, projects, selectionRequired: projects.length !== 1 };
  }
  async repositories(userId: string, projectId: string) {
    await this.membership(userId, projectId, true);
    return this.db.agentRepository.findMany({
      where: { user: { memberships: { some: { projectId, status: 'ACTIVE' } } } },
      select: { id: true, name: true, deviceName: true, agentType: true, updatedAt: true },
      orderBy: { updatedAt: 'desc' },
    });
  }
  async binding(userId: string, projectId: string) {
    await this.membership(userId, projectId);
    return this.db.project.findUnique({
      where: { id: projectId },
      select: { repositoryId: true, repositoryName: true },
    });
  }
  async bind(userId: string, projectId: string, input: unknown) {
    await this.membership(userId, projectId, true);
    const data = parseAgent(repositoryBindingSchema, input);
    if (data.repositoryId) {
      const repository = await this.db.agentRepository.findUnique({
        where: { id: data.repositoryId },
      });
      if (!repository) throw new NotFoundException('Repository not found');
      await this.membership(repository.userId, projectId);
      data.repositoryName = repository.name;
    }
    return this.db.project.update({
      where: { id: projectId },
      data,
      select: { repositoryId: true, repositoryName: true },
    });
  }
}
