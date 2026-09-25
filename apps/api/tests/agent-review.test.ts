import { expect, it, vi } from 'vitest';
import { AgentFixService } from '../src/agent/agent-fix.service.js';

it('AI completion persists pending verification and repeat receipts do not overwrite human review', async () => {
  const run = {
    id: 'run',
    reportId: 'report',
    grantId: 'grant',
    status: 'RUNNING',
    reportVersion: 2,
    leaseExpiresAt: new Date(Date.now() + 60000),
    resultHash: null as string | null,
  };
  const updateMany = vi.fn().mockResolvedValue({ count: 1 });
  const tx = {
    $queryRaw: vi.fn(),
    report: { updateMany },
    agentFixAttempt: {
      findUniqueOrThrow: vi.fn(async () => run),
      update: vi.fn(async ({ data }) => Object.assign(run, data)),
    },
    activity: { create: vi.fn() },
  };
  const db = {
    $transaction: async (callback: (tx: unknown) => unknown) => callback(tx),
    agentFixAttempt: { findUnique: vi.fn(async () => run) },
    report: {
      findUniqueOrThrow: vi.fn().mockResolvedValue({ projectId: 'project', assigneeId: null }),
    },
  };
  const access = vi.fn().mockResolvedValue({ role: 'OWNER' });
  const service = new AgentFixService(db as never, { access } as never);
  const grant = { id: 'grant', userId: 'user' } as never;
  const result = {
    summary: 'Fixed spacing',
    checks: [{ command: 'test', outcome: 'passed', details: 'Verified' }],
  };
  await service.finish(grant, 'run', 'SUCCEEDED', result);
  expect(updateMany).toHaveBeenCalledWith(
    expect.objectContaining({
      where: { id: 'report', version: 2, status: 'IN_PROGRESS' },
      data: expect.objectContaining({ status: 'READY_FOR_VERIFY' }),
    }),
  );
  expect(tx.activity.create).toHaveBeenCalledWith(
    expect.objectContaining({
      data: expect.objectContaining({
        payload: expect.objectContaining({ status: 'READY_FOR_VERIFY' }),
      }),
    }),
  );
  await service.finish(grant, 'run', 'SUCCEEDED', result);
  expect(updateMany).toHaveBeenCalledTimes(1);
  await expect(
    service.finish(grant, 'run', 'SUCCEEDED', { ...result, summary: 'different' }),
  ).rejects.toThrow('different result');
  access.mockRejectedValue(new Error('revoked'));
  await expect(service.finish(grant, 'run', 'SUCCEEDED', result)).rejects.toThrow('revoked');
});
