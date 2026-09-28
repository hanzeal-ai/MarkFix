import { expect, it, vi } from 'vitest';
import { AgentAuthService } from '../src/agent/agent-auth.service.js';
import { AgentController } from '../src/agent/agent.controller.js';
import { AuthRateLimitService } from '../src/auth-rate-limit.service.js';

const owner = '11111111-1111-4111-8111-111111111111';
const project = '22222222-2222-4222-8222-222222222222';
function fixture(target: string | null = owner) {
  const request = {
    id: 'request',
    userCode: 'ABCD1234',
    targetUserId: target,
    deviceName: 'repair device',
    agentType: 'codex',
    status: 'PENDING',
    expiresAt: new Date(Date.now() + 60000),
    grantId: null as string | null,
  };
  const grant = {
    id: 'grant',
    userId: owner,
    revokedAt: null as Date | null,
    expiresAt: new Date(Date.now() + 60000),
  };
  const db = {
    user: { findUnique: vi.fn().mockResolvedValue(target ? { id: target } : null) },
    membership: { count: vi.fn().mockResolvedValue(1) },
    agentDeviceRequest: {
      create: vi.fn(),
      findUnique: vi.fn(async ({ where }) =>
        where.targetUserId && where.targetUserId !== request.targetUserId ? null : request,
      ),
      findMany: vi.fn(async ({ where }) =>
        where.targetUserId === request.targetUserId ? [request] : [],
      ),
      updateMany: vi.fn(async ({ where, data }) => {
        if (
          where.status !== request.status ||
          (where.targetUserId && where.targetUserId !== request.targetUserId) ||
          (where.expiresAt && request.expiresAt <= where.expiresAt.gt)
        )
          return { count: 0 };
        Object.assign(request, data);
        return { count: 1 };
      }),
      update: vi.fn(async ({ data }) => Object.assign(request, data)),
    },
    agentGrant: {
      create: vi.fn().mockResolvedValue(grant),
      findUnique: vi.fn().mockResolvedValue(grant),
      update: vi.fn(),
    },
    $transaction: async (fn: (tx: unknown) => unknown): Promise<unknown> => fn(db),
  };
  return { request, grant, db, service: new AgentAuthService(db as never) };
}
it('binds requests to normalized target accounts without revealing existence', async () => {
  const known = fixture();
  const missing = fixture(null);
  const input = { account: ' OWNER@Example.test ', deviceName: 'repair', agentType: 'codex' };
  const a = await known.service.begin(input);
  const b = await missing.service.begin(input);
  expect(Object.keys(a)).toEqual(Object.keys(b));
  expect(known.db.user.findUnique).toHaveBeenCalledWith({
    where: { email: 'owner@example.test' },
    select: { id: true },
  });
  expect(known.db.agentDeviceRequest.create.mock.calls[0]?.[0].data.targetUserId).toBe(owner);
  expect(missing.db.agentDeviceRequest.create.mock.calls[0]?.[0].data.targetUserId).toBeNull();
  await expect(
    missing.service.decide(owner, { userCode: 'ABCD1234', approve: false }),
  ).rejects.toThrow();
});
it('only the target can preview, receive or decide a pending request', async () => {
  const f = fixture();
  expect(await f.service.pending('other')).toEqual([]);
  expect(await f.service.pending(owner)).toHaveLength(1);
  await expect(f.service.preview('other', 'ABCD1234')).rejects.toThrow('not found');
  for (const approve of [true, false])
    await expect(
      f.service.decide('other', { userCode: 'ABCD1234', approve, projectIds: [project] }),
    ).rejects.toThrow();
  expect(f.db.agentGrant.create).not.toHaveBeenCalled();
  expect(f.request.status).toBe('PENDING');
  await f.service.decide(owner, { userCode: 'ABCD1234', approve: true, projectIds: [project] });
  expect(f.db.agentGrant.create).toHaveBeenCalledWith(
    expect.objectContaining({
      data: expect.objectContaining({ userId: owner, projectIds: [project] }),
    }),
  );
  await expect(f.service.decide(owner, { userCode: 'ABCD1234', approve: false })).rejects.toThrow();
});
it('does not authorize empty, inaccessible, expired or legacy unbound requests', async () => {
  const f = fixture();
  await expect(f.service.decide(owner, { userCode: 'ABCD1234', approve: true })).rejects.toThrow(
    'Select',
  );
  f.db.membership.count.mockResolvedValue(0);
  await expect(
    f.service.decide(owner, { userCode: 'ABCD1234', approve: true, projectIds: [project] }),
  ).rejects.toThrow('Project access is required');
  f.request.expiresAt = new Date(0);
  await expect(f.service.decide(owner, { userCode: 'ABCD1234', approve: false })).rejects.toThrow();
  expect(f.db.agentGrant.create).not.toHaveBeenCalled();
});
it('consumes approved tokens once and refuses pending, denied, expired and revoked access', async () => {
  const input = { deviceCode: 'a'.repeat(40) };
  const f = fixture();
  expect(await f.service.poll(input)).toEqual({ status: 'PENDING' });
  await f.service.decide(owner, { userCode: 'ABCD1234', approve: true, projectIds: [project] });
  expect(await f.service.poll(input)).toMatchObject({ status: 'AUTHORIZED', grantId: 'grant' });
  await expect(f.service.poll(input)).rejects.toThrow();
  f.request.status = 'DENIED';
  await expect(f.service.poll(input)).rejects.toThrow();
  f.request.status = 'APPROVED';
  f.grant.revokedAt = new Date();
  await expect(f.service.poll(input)).rejects.toThrow('revoked');
  f.request.expiresAt = new Date(0);
  await expect(f.service.poll(input)).rejects.toThrow('expired');
});
it('limits targeted requests identically across source IPs and never logs raw account keys', async () => {
  const begin = vi.fn().mockResolvedValue({});
  const limits = new AuthRateLimitService();
  const controller = new AgentController(
    { begin } as never,
    {} as never,
    {} as never,
    limits,
    {} as never,
  );
  const input = { account: 'unknown@example.test', deviceName: 'repair', agentType: 'codex' };
  for (let i = 0; i < 5; i++) await controller.begin({ ip: `client-${i}` } as never, input);
  expect(() => controller.begin({ ip: 'another' } as never, input)).toThrow('Too many');
  expect(begin).toHaveBeenCalledTimes(5);
});
