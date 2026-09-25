import {
  createEnvironmentSchema,
  createProjectSchema,
  updateEnvironmentSchema,
  updateProjectSchema,
} from '@markfix/contracts';
import { Prisma } from '@markfix/database';
import {
  ConflictException,
  ForbiddenException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { unlink } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { hashOpaqueToken, hashPassword } from './auth-crypto.js';
import { requireMembership, requireProjectAccess } from './authorization.js';
import { DatabaseService, publicUserSelect } from './database.service.js';

@Injectable()
export class ProjectService {
  private readonly artifactDirectory = resolve(process.env.ARTIFACT_DIR ?? './data/artifacts');
  constructor(@Inject(DatabaseService) private readonly database: DatabaseService) {}

  async onModuleInit(): Promise<void> {
    const demoPassword = process.env.MARKFIX_DEMO_PASSWORD;
    if (!demoPassword) return;
    const demoEmail = process.env.MARKFIX_DEMO_EMAIL ?? 'admin@markfix.local';
    const demoPasswordHash = await hashPassword(demoPassword);
    const existingDemoUser = await this.database.user.findUnique({ where: { email: demoEmail } });
    const demoUser = existingDemoUser
      ? await this.database.user.update({
          where: { id: existingDemoUser.id },
          data: {
            email: demoEmail,
            displayName: 'Admin',
            passwordHash: demoPasswordHash,
            emailVerifiedAt: new Date(),
          },
        })
      : await this.database.user.create({
          data: {
            email: demoEmail,
            displayName: 'Admin',
            passwordHash: demoPasswordHash,
            emailVerifiedAt: new Date(),
          },
        });
    const existingProject = await this.database.project.findFirst({
      where: { ownerId: demoUser.id },
    });
    if (!existingProject)
      await this.createProject(demoUser.id, {
        name: 'Website feedback',
        baseUrl: 'https://example.com',
      });
  }
  async bootstrap(userId: string) {
    return { projects: await this.listProjects(userId) };
  }

  async listProjects(userId: string) {
    const projects = await this.database.project.findMany({
      where: { memberships: { some: { userId, status: 'ACTIVE' } } },
      include: { memberships: { where: { userId, status: 'ACTIVE' }, select: { role: true } } },
      orderBy: { createdAt: 'asc' },
    });
    return projects.map(({ memberships, ...project }) => ({
      ...project,
      role: memberships[0]?.role,
    }));
  }

  async createProject(userId: string, input: unknown) {
    const parsed = createProjectSchema.safeParse(input);
    if (!parsed.success)
      throw new ConflictException('A valid project name and base URL are required');
    return this.database.project.create({
      data: {
        ownerId: userId,
        name: parsed.data.name,
        baseUrl: parsed.data.baseUrl || null,
        memberships: { create: { userId, role: 'OWNER' } },
      },
    });
  }

  async getProject(userId: string, projectId: string) {
    return requireProjectAccess(this.database, userId, projectId);
  }

  async updateProject(userId: string, projectId: string, input: unknown) {
    const project = await requireProjectAccess(this.database, userId, projectId);
    await requireMembership(this.database, userId, project.id, ['OWNER', 'ADMIN']);
    const parsed = updateProjectSchema.safeParse(input);
    if (!parsed.success) throw new ConflictException('A valid project update is required');
    return this.database.project.update({
      where: { id: projectId },
      data: {
        ...(parsed.data.name !== undefined ? { name: parsed.data.name } : {}),
        ...(parsed.data.baseUrl !== undefined ? { baseUrl: parsed.data.baseUrl || null } : {}),
      },
    });
  }

  async deleteProject(userId: string, projectId: string) {
    const project = await requireProjectAccess(this.database, userId, projectId);
    await requireMembership(this.database, userId, project.id, ['OWNER', 'ADMIN']);
    const artifacts = await this.database.artifact.findMany({
      where: { submission: { projectId } },
      select: { id: true },
    });
    await this.database.project.delete({ where: { id: projectId } });
    await Promise.allSettled(
      artifacts.map(({ id }) => unlink(join(this.artifactDirectory, `${id}.png`))),
    );
    return { deleted: true };
  }

  async listEnvironments(userId: string, projectId: string) {
    await requireProjectAccess(this.database, userId, projectId);
    return this.database.environment.findMany({
      where: { projectId },
      orderBy: { createdAt: 'asc' },
    });
  }

  async createEnvironment(userId: string, projectId: string, input: unknown) {
    const project = await requireProjectAccess(this.database, userId, projectId);
    await requireMembership(this.database, userId, project.id, ['OWNER', 'ADMIN']);
    const parsed = createEnvironmentSchema.safeParse(input);
    if (!parsed.success) {
      throw new ConflictException('A valid environment name and HTTP(S) base URL are required');
    }
    try {
      return await this.database.environment.create({
        data: { projectId, name: parsed.data.name, baseUrl: parsed.data.baseUrl },
      });
    } catch (error) {
      if (this.isUniqueConstraint(error)) {
        throw new ConflictException('An environment with this name already exists');
      }
      throw error;
    }
  }

  async updateEnvironment(userId: string, environmentId: string, input: unknown) {
    const environment = await this.database.environment.findUnique({
      where: { id: environmentId },
    });
    if (!environment) throw new NotFoundException('Environment not found');
    const project = await requireProjectAccess(this.database, userId, environment.projectId);
    await requireMembership(this.database, userId, project.id, ['OWNER', 'ADMIN']);
    const parsed = updateEnvironmentSchema.safeParse(input);
    if (!parsed.success) throw new ConflictException('A valid environment update is required');
    try {
      return await this.database.environment.update({
        where: { id: environmentId },
        data: {
          ...(parsed.data.name !== undefined ? { name: parsed.data.name } : {}),
          ...(parsed.data.baseUrl !== undefined ? { baseUrl: parsed.data.baseUrl } : {}),
        },
      });
    } catch (error) {
      if (this.isUniqueConstraint(error)) {
        throw new ConflictException('An environment with this name already exists');
      }
      throw error;
    }
  }

  async listMembers(userId: string, projectId: string) {
    await requireMembership(this.database, userId, projectId);
    return this.database.membership.findMany({
      where: { projectId },
      include: { user: { select: publicUserSelect } },
      orderBy: { createdAt: 'asc' },
    });
  }

  async listInvitations(userId: string, projectId: string) {
    await requireMembership(this.database, userId, projectId, ['OWNER', 'ADMIN']);
    return this.database.invitation.findMany({
      where: { projectId },
      select: {
        id: true,
        projectId: true,
        email: true,
        role: true,
        expiresAt: true,
        acceptedAt: true,
        createdAt: true,
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  async createInvitation(userId: string, projectId: string, input: unknown) {
    await requireMembership(this.database, userId, projectId, ['OWNER', 'ADMIN']);
    const payload = input as { email?: unknown; role?: unknown };
    const email = typeof payload.email === 'string' ? payload.email.trim().toLocaleLowerCase() : '';
    const roles = ['ADMIN', 'MEMBER', 'REPORTER'] as const;
    if (!email.includes('@') || !roles.includes(payload.role as (typeof roles)[number])) {
      throw new ConflictException('Invalid invitation');
    }
    const project = await this.database.project.findUnique({ where: { id: projectId } });
    if (!project) throw new NotFoundException('Project not found');
    const token = crypto.randomUUID();
    const invitation = await this.database.invitation.create({
      data: {
        projectId,
        email,
        role: payload.role as (typeof roles)[number],
        tokenHash: hashOpaqueToken(token),
        expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
      },
    });
    return {
      id: invitation.id,
      projectId: invitation.projectId,
      email: invitation.email,
      role: invitation.role,
      expiresAt: invitation.expiresAt,
      token,
    };
  }

  async acceptInvitation(userId: string, token: string) {
    const invitation = await this.database.invitation.findUnique({
      where: { tokenHash: hashOpaqueToken(token) },
    });
    if (!invitation) throw new NotFoundException('Invitation not found');
    if (invitation.acceptedAt) throw new ConflictException('Invitation has already been accepted');
    if (invitation.expiresAt.getTime() <= Date.now())
      throw new ConflictException('Invitation has expired');
    const user = await this.database.user.findUnique({ where: { id: userId } });
    if (!user || user.email !== invitation.email) {
      throw new ForbiddenException('Invitation email does not match the signed-in account');
    }
    return this.database.$transaction(async (transaction) => {
      const consumed = await transaction.invitation.updateMany({
        where: { id: invitation.id, acceptedAt: null, expiresAt: { gt: new Date() } },
        data: { acceptedAt: new Date() },
      });
      if (consumed.count !== 1) throw new ConflictException('Invitation is no longer available');
      const membership = await transaction.membership.upsert({
        where: {
          projectId_userId: { projectId: invitation.projectId, userId },
        },
        update: {},
        create: {
          projectId: invitation.projectId,
          userId,
          role: invitation.role,
        },
        include: { user: { select: publicUserSelect } },
      });
      return membership;
    });
  }

  private isUniqueConstraint(error: unknown): boolean {
    return error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002';
  }
}
