import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';
import { ForbiddenException, Inject, Injectable, UnauthorizedException } from '@nestjs/common';
import { annotationFeedQuerySchema, annotationFeedSchema } from '@markfix/contracts';
import { DatabaseService } from './database.service.js';
import { AgentProjectService } from './agent/agent-project.service.js';
import { parseAgent } from './agent/agent-auth.service.js';
import { apiServiceUrls } from './service-config.js';

const hash = (token: string) => createHash('sha256').update(token).digest('hex');
@Injectable()
export class AnnotationFeedService {
  constructor(
    @Inject(DatabaseService) private readonly db: DatabaseService,
    @Inject(AgentProjectService) private readonly projects: AgentProjectService,
  ) {}

  async status(userId: string, projectId: string) {
    await this.projects.membership(userId, projectId);
    const grant = await this.db.annotationReadGrant.findUnique({
      where: { userId_projectId: { userId, projectId } },
    });
    return {
      active: Boolean(grant && !grant.revokedAt && grant.expiresAt > new Date()),
      expiresAt: grant?.expiresAt ?? null,
    };
  }

  async authorize(userId: string, projectId: string) {
    await this.projects.membership(userId, projectId);
    const token = randomBytes(32).toString('base64url');
    const data = {
      tokenHash: hash(token),
      expiresAt: new Date(Date.now() + 90 * 86400_000),
      revokedAt: null,
    };
    const grant = await this.db.annotationReadGrant.upsert({
      where: { userId_projectId: { userId, projectId } },
      create: { userId, projectId, ...data },
      update: data,
    });
    const url = new URL(`/v1/annotation-feed/${grant.id}`, apiServiceUrls().origin);
    // Fragments never reach HTTP access logs. Consumers move this token to Authorization.
    url.hash = new URLSearchParams({ token }).toString();
    return { active: true, expiresAt: grant.expiresAt, authorizationUrl: url.href };
  }

  async revoke(userId: string, projectId: string) {
    // The owner may revoke their own grant even after losing project membership.
    await this.db.annotationReadGrant.updateMany({
      where: { userId, projectId },
      data: { revokedAt: new Date() },
    });
    return { active: false, expiresAt: null };
  }

  async read(id: string, authorization: string | undefined, input: unknown) {
    const query = parseAgent(annotationFeedQuerySchema, input);
    const token = /^Bearer ([A-Za-z0-9_-]{43})$/.exec(authorization ?? '')?.[1];
    if (!token) throw new UnauthorizedException('Read authorization is required');
    const grant = await this.db.annotationReadGrant.findUnique({ where: { id } });
    if (
      !grant ||
      grant.revokedAt ||
      grant.expiresAt <= new Date() ||
      !timingSafeEqual(Buffer.from(hash(token)), Buffer.from(grant.tokenHash))
    )
      throw new UnauthorizedException('Read authorization expired or revoked');
    await this.projects.membership(grant.userId, grant.projectId);
    const rows = await this.db.report.findMany({
      where: {
        projectId: grant.projectId,
        reporterId: grant.userId,
        status: { in: ['OPEN', 'FIX_FAILED'] },
        rejectionReason: null,
        ...(query.cursor ? { id: { gt: query.cursor } } : {}),
      },
      select: { id: true, title: true, description: true, captureBundle: true },
      orderBy: { id: 'asc' },
      take: 51,
    });
    const current = await this.db.annotationReadGrant.findUnique({ where: { id } });
    if (
      !current ||
      current.revokedAt ||
      current.expiresAt <= new Date() ||
      current.tokenHash !== grant.tokenHash
    )
      throw new ForbiddenException('Read authorization changed');
    const items = rows.slice(0, 50).map((row) => {
      const url = new URL(`/app/projects/${grant.projectId}`, apiServiceUrls().origin);
      url.searchParams.set('query', `#MF-${row.id.replaceAll('-', '').slice(0, 8).toUpperCase()}`);
      return {
        id: row.id,
        title: row.title.slice(0, 120),
        content: `标题：${row.title}\n\n说明：${row.description}\n\n标注上下文：\n${JSON.stringify(row.captureBundle)}`,
        url: url.href,
      };
    });
    // Reject oversized records rather than silently discard their reproduction context.
    return annotationFeedSchema.parse({
      items,
      nextCursor: rows.length > 50 ? items.at(-1)?.id : null,
    });
  }
}
