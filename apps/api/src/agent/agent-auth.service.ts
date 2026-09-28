import { agentPolicy } from '@markfix/contracts';
import { apiServiceUrls } from '../service-config.js';
import {
  agentRefreshSchema,
  agentTokenSchema,
  deviceAuthorizationSchema,
  deviceDecisionSchema,
} from '@markfix/contracts';
import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Inject,
  Injectable,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { randomBytes } from 'node:crypto';
import { z } from 'zod';
import { DatabaseService } from '../database.service.js';
import { createOpaqueToken, hashOpaqueToken } from '../auth-crypto.js';

export function parseAgent<T>(schema: z.ZodType<T>, input: unknown): T {
  const parsed = schema.safeParse(input);
  if (!parsed.success)
    throw new BadRequestException(parsed.error.issues[0]?.message ?? 'Invalid input');
  return parsed.data;
}
export const grantSummary = {
  id: true,
  deviceName: true,
  agentType: true,
  projectIds: true,
  revokedAt: true,
  expiresAt: true,
  lastUsedAt: true,
} as const;
@Injectable()
export class AgentAuthService {
  constructor(@Inject(DatabaseService) private readonly db: DatabaseService) {}
  async begin(input: unknown) {
    const data = parseAgent(deviceAuthorizationSchema, input);
    const target = await this.db.user.findUnique({
      where: { email: data.account },
      select: { id: true },
    });
    const deviceCode = createOpaqueToken();
    const userCode = randomBytes(4).toString('hex').toUpperCase();
    const expiresAt = new Date(Date.now() + 10 * 60_000);
    await this.db.agentDeviceRequest.create({
      data: {
        deviceName: data.deviceName,
        agentType: data.agentType,
        targetUserId: target?.id ?? null,
        deviceCodeHash: hashOpaqueToken(deviceCode),
        userCode,
        expiresAt,
      },
    });
    const origin = apiServiceUrls().origin;
    return {
      deviceCode,
      userCode,
      expiresAt,
      interval: 5,
      verificationUrl: `${origin}/agent/authorize?code=${userCode}`,
    };
  }
  async preview(userId: string, userCode: string) {
    if (!/^[A-F0-9]{8}$/.test(userCode))
      throw new BadRequestException('Invalid authorization code');
    const request = await this.db.agentDeviceRequest.findUnique({
      where: { userCode, targetUserId: userId },
      select: {
        userCode: true,
        deviceName: true,
        agentType: true,
        status: true,
        expiresAt: true,
        createdAt: true,
      },
    });
    if (!request || request.expiresAt <= new Date())
      throw new NotFoundException('Authorization request expired or not found');
    return request;
  }
  pending(userId: string) {
    return this.db.agentDeviceRequest.findMany({
      where: { targetUserId: userId, status: 'PENDING', expiresAt: { gt: new Date() } },
      select: {
        userCode: true,
        deviceName: true,
        agentType: true,
        status: true,
        expiresAt: true,
        createdAt: true,
      },
      orderBy: { createdAt: 'desc' },
      take: 100,
    });
  }
  async account(userId: string) {
    return this.db.user.findUniqueOrThrow({
      where: { id: userId },
      select: { email: true, displayName: true },
    });
  }
  async decide(userId: string, input: unknown) {
    const data = parseAgent(deviceDecisionSchema, input);
    const projectIds = [...new Set(data.projectIds)];
    if (data.approve) {
      if (!projectIds.length) throw new BadRequestException('Select at least one project');
      const count = await this.db.membership.count({
        where: { userId, projectId: { in: projectIds }, status: 'ACTIVE' },
      });
      if (count !== projectIds.length) throw new ForbiddenException('Project access is required');
    }
    return this.db.$transaction(async (tx) => {
      const request = await tx.agentDeviceRequest.findUnique({
        where: { userCode: data.userCode, targetUserId: userId },
      });
      if (!request || request.status !== 'PENDING' || request.expiresAt <= new Date())
        throw new ConflictException('Authorization request is no longer pending');
      const claimed = await tx.agentDeviceRequest.updateMany({
        where: {
          id: request.id,
          targetUserId: userId,
          status: 'PENDING',
          expiresAt: { gt: new Date() },
        },
        data: { status: data.approve ? 'APPROVED' : 'DENIED' },
      });
      if (claimed.count !== 1) throw new ConflictException('Authorization was already decided');
      if (data.approve) {
        const grant = await tx.agentGrant.create({
          data: {
            userId,
            projectIds,
            deviceName: request.deviceName,
            agentType: request.agentType,
            expiresAt: new Date(Date.now() + agentPolicy.grantMs),
          },
        });
        await tx.agentDeviceRequest.update({
          where: { id: request.id },
          data: { grantId: grant.id },
        });
      }
      return { approved: data.approve };
    });
  }
  private tokens() {
    const accessToken = `mfa_${createOpaqueToken()}`;
    const refreshToken = `mfr_${createOpaqueToken()}`;
    const accessExpiresAt = new Date(Date.now() + agentPolicy.accessTokenMs);
    return { accessToken, refreshToken, accessExpiresAt };
  }
  async poll(input: unknown) {
    const { deviceCode } = parseAgent(agentTokenSchema, input);
    return this.db.$transaction(async (tx) => {
      const request = await tx.agentDeviceRequest.findUnique({
        where: { deviceCodeHash: hashOpaqueToken(deviceCode) },
      });
      if (!request || request.expiresAt <= new Date())
        throw new UnauthorizedException('Authorization expired');
      if (request.status === 'PENDING') return { status: 'PENDING' };
      if (request.status !== 'APPROVED' || !request.grantId)
        throw new UnauthorizedException('Authorization denied or already consumed');
      const claimed = await tx.agentDeviceRequest.updateMany({
        where: { id: request.id, status: 'APPROVED' },
        data: { status: 'CONSUMED' },
      });
      if (claimed.count !== 1) throw new UnauthorizedException('Authorization already consumed');
      const tokens = this.tokens();
      const grant = await tx.agentGrant.findUnique({ where: { id: request.grantId } });
      if (!grant || grant.revokedAt || grant.expiresAt <= new Date())
        throw new UnauthorizedException('Authorization revoked');
      await tx.agentGrant.update({
        where: { id: grant.id },
        data: {
          accessHash: hashOpaqueToken(tokens.accessToken),
          refreshHash: hashOpaqueToken(tokens.refreshToken),
          accessExpiresAt: tokens.accessExpiresAt,
        },
      });
      return { status: 'AUTHORIZED', grantId: grant.id, ...tokens };
    });
  }
  async refresh(input: unknown) {
    const { refreshToken } = parseAgent(agentRefreshSchema, input);
    const hash = hashOpaqueToken(refreshToken);
    const grant = await this.db.agentGrant.findUnique({ where: { refreshHash: hash } });
    if (!grant || grant.revokedAt || grant.expiresAt <= new Date())
      throw new UnauthorizedException('Authorization expired or revoked');
    const tokens = this.tokens();
    const result = await this.db.agentGrant.updateMany({
      where: { id: grant.id, refreshHash: hash, revokedAt: null, expiresAt: { gt: new Date() } },
      data: {
        accessHash: hashOpaqueToken(tokens.accessToken),
        refreshHash: hashOpaqueToken(tokens.refreshToken),
        accessExpiresAt: tokens.accessExpiresAt,
        lastUsedAt: new Date(),
      },
    });
    if (result.count !== 1) throw new UnauthorizedException('Refresh token already used');
    return { grantId: grant.id, ...tokens };
  }
  async authenticate(header: string | undefined) {
    if (!header?.startsWith('Bearer mfa_'))
      throw new UnauthorizedException('Agent authorization required');
    const grant = await this.db.agentGrant.findUnique({
      where: { accessHash: hashOpaqueToken(header.slice(7)) },
    });
    if (
      !grant ||
      grant.revokedAt ||
      grant.expiresAt <= new Date() ||
      !grant.accessExpiresAt ||
      grant.accessExpiresAt <= new Date()
    )
      throw new UnauthorizedException('Agent authorization expired or revoked');
    return grant;
  }
  list(userId: string) {
    return this.db.agentGrant.findMany({
      where: { userId },
      select: grantSummary,
      orderBy: { createdAt: 'desc' },
    });
  }
  async revoke(userId: string, id: string) {
    const result = await this.db.agentGrant.updateMany({
      where: { id, userId },
      data: { revokedAt: new Date(), accessHash: null, refreshHash: null },
    });
    if (!result.count) throw new NotFoundException('Authorization not found');
    return { revoked: true };
  }
}
