import 'reflect-metadata';
import { Module, UnauthorizedException } from '@nestjs/common';
import { APP_GUARD, NestFactory } from '@nestjs/core';
import { FastifyAdapter, type NestFastifyApplication } from '@nestjs/platform-fastify';
import { AuthGuard } from '../src/auth.guard.js';
import { AuthService } from '../src/auth.service.js';
import { AuthRateLimitService } from '../src/auth-rate-limit.service.js';
import { createHash } from 'node:crypto';
import { describe, expect, it, vi } from 'vitest';
import { AnnotationFeedService } from '../src/annotation-feed.service.js';
import { AnnotationFeedController } from '../src/annotation-feed.controller.js';
import { apiServiceUrls } from '../src/service-config.js';

const uid = '11111111-1111-4111-8111-111111111111';
const pid = '22222222-2222-4222-8222-222222222222';
const gid = '33333333-3333-4333-8333-333333333333';
const rid = '44444444-4444-4444-8444-444444444444';
const token = 'a'.repeat(43);
function setup() {
  const grant = {
    id: gid,
    userId: uid,
    projectId: pid,
    tokenHash: createHash('sha256').update(token).digest('hex'),
    expiresAt: new Date(Date.now() + 60000),
    revokedAt: null as Date | null,
  };
  const findUnique = vi.fn(async () => ({ ...grant }));
  const upsert = vi.fn(async ({ update }) => Object.assign(grant, update));
  const db = {
    annotationReadGrant: { findUnique, upsert, updateMany: vi.fn() },
    report: {
      findMany: vi.fn(async () => [
        {
          id: rid,
          title: '按钮',
          description: '错位',
          captureBundle: { page: { url: 'https://example.com' } },
        },
      ]),
    },
  };
  const membership = vi.fn();
  return {
    service: new AnnotationFeedService(db as never, { membership } as never),
    db,
    membership,
    grant,
  };
}
describe('user-scoped read authorization', () => {
  it('stores only a hash, rotates the credential and discloses it only in the one-time fragment', async () => {
    const { service, db, grant } = setup();
    const created = await service.authorize(uid, pid);
    const url = new URL(created.authorizationUrl);
    const issued = new URLSearchParams(url.hash.slice(1)).get('token') ?? '';
    expect(url.search).toBe('');
    expect(issued).toHaveLength(43);
    expect(grant.tokenHash).toBe(createHash('sha256').update(issued).digest('hex'));
    expect(JSON.stringify(db.annotationReadGrant.upsert.mock.calls)).not.toContain(issued);
    expect(await service.status(uid, pid)).not.toHaveProperty('authorizationUrl');
    await expect(service.read(gid, 'Bearer ' + token, {})).rejects.toThrow('expired or revoked');
    expect((await service.read(gid, 'Bearer ' + issued, {})).items).toHaveLength(1);
  });
  it('fixes the user and project from the grant; caller cannot choose another identity or scope', async () => {
    const { service, db } = setup();
    const result = await service.read(gid, 'Bearer ' + token, {});
    expect(result.items[0]?.content).toContain('错位');
    expect(db.report.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          reporterId: uid,
          projectId: pid,
          status: { in: ['OPEN', 'FIX_FAILED'] },
        }),
      }),
    );
    await expect(service.read(gid, 'Bearer ' + token, { projectId: rid })).rejects.toThrow();
    await expect(service.read(gid, 'Bearer ' + token, { userId: rid })).rejects.toThrow();
    expect(db.report.findMany).toHaveBeenCalledTimes(1);
  });
  it('rejects missing, wrong, expired, revoked credentials and lost project membership before data access', async () => {
    for (const state of ['missing', 'wrong', 'expired', 'revoked', 'membership']) {
      const { service, db, grant, membership } = setup();
      if (state === 'expired') grant.expiresAt = new Date(0);
      if (state === 'revoked') grant.revokedAt = new Date();
      if (state === 'membership') membership.mockRejectedValue(new Error('membership revoked'));
      await expect(
        service.read(
          gid,
          state === 'missing'
            ? undefined
            : 'Bearer ' + (state === 'wrong' ? 'b'.repeat(43) : token),
          {},
        ),
      ).rejects.toThrow();
      expect(db.report.findMany).not.toHaveBeenCalled();
    }
  });
  it('honors revocation during a read and only allows the owner to revoke their grant', async () => {
    const { service, db, grant } = setup();
    db.report.findMany.mockImplementation(async () => {
      grant.revokedAt = new Date();
      return [];
    });
    await expect(service.read(gid, 'Bearer ' + token, {})).rejects.toThrow('changed');
    await service.revoke('other-user', pid);
    expect(db.annotationReadGrant.updateMany).toHaveBeenCalledWith({
      where: { userId: 'other-user', projectId: pid },
      data: { revokedAt: expect.any(Date) },
    });
  });
  it('paginates in stable identifier order without granting access through a foreign cursor', async () => {
    const { service, db } = setup();
    await service.read(gid, 'Bearer ' + token, { cursor: rid });
    expect(db.report.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ reporterId: uid, projectId: pid, id: { gt: rid } }),
        orderBy: { id: 'asc' },
        take: 51,
      }),
    );
  });
  it('prevents cross-origin creation and revocation', () => {
    const authorize = vi.fn(),
      revoke = vi.fn(),
      limits = { consume: vi.fn() };
    const controller = new AnnotationFeedController(
      { authorize, revoke } as never,
      limits as never,
    );
    expect(() =>
      controller.authorize({ id: uid, sessionId: 's' }, pid, 'https://other.example'),
    ).toThrow();
    expect(() => controller.revoke({ id: uid, sessionId: 's' }, pid, undefined)).toThrow();
    controller.authorize({ id: uid, sessionId: 's' }, pid, apiServiceUrls().origin);
    expect(authorize).toHaveBeenCalledExactlyOnceWith(uid, pid);
    expect(revoke).not.toHaveBeenCalled();
  });
});

it('enforces authentication and scope through real HTTP routes', async () => {
  const { service, db } = setup();
  class FeedTestModule {}
  Module({
    controllers: [AnnotationFeedController],
    providers: [
      { provide: AnnotationFeedService, useValue: service },
      AuthRateLimitService,
      {
        provide: AuthService,
        useValue: {
          authenticate: async (value: string) => {
            if (value !== 'signed-in-user') throw new UnauthorizedException();
            return { sub: uid, sid: 'session' };
          },
        },
      },
      { provide: APP_GUARD, useClass: AuthGuard },
    ],
  })(FeedTestModule);
  const app = await NestFactory.create<NestFastifyApplication>(
    FeedTestModule,
    new FastifyAdapter(),
    { logger: false },
  );
  try {
    await app.init();
    const management = `/v1/projects/${pid}/read-authorization`;
    expect((await app.inject({ method: 'POST', url: management })).statusCode).toBe(401);
    const session = { authorization: 'Bearer signed-in-user', origin: apiServiceUrls().origin };
    const created = await app.inject({ method: 'POST', url: management, headers: session });
    expect(created.statusCode).toBe(201);
    expect(created.headers['cache-control']).toBe('no-store');
    const url = new URL(created.json().authorizationUrl);
    const secret = new URLSearchParams(url.hash.slice(1)).get('token');
    expect(
      (
        await app.inject({
          method: 'GET',
          url: url.pathname,
          headers: { authorization: 'Bearer signed-in-user' },
        })
      ).statusCode,
    ).toBe(401);
    const pulled = await app.inject({
      method: 'GET',
      url: url.pathname,
      headers: { authorization: 'Bearer ' + secret },
    });
    expect(pulled.statusCode).toBe(200);
    expect(pulled.json().items).toHaveLength(1);
    const before = db.report.findMany.mock.calls.length;
    expect(
      (
        await app.inject({
          method: 'GET',
          url: url.pathname + '?userId=someone-else',
          headers: { authorization: 'Bearer ' + secret },
        })
      ).statusCode,
    ).toBe(400);
    expect(db.report.findMany.mock.calls.length).toBe(before);
    expect(
      (
        await app.inject({
          method: 'POST',
          url: url.pathname,
          headers: { authorization: 'Bearer ' + secret },
        })
      ).statusCode,
    ).toBe(404);
    expect(
      (await app.inject({ method: 'GET', url: management, headers: session })).body,
    ).not.toContain(secret);
  } finally {
    await app.close();
  }
});
