import { randomUUID } from 'node:crypto';
import { expect, it, vi } from 'vitest';
import { AgentFixService } from '../src/agent/agent-fix.service.js';

it('preserves every task and the raw cursor while grouping a page; only reads source records', async () => {
  const projectId = randomUUID();
  const first = {
    id: randomUUID(),
    projectId,
    title: 'Same annotation',
    description: 'Fix the label',
    status: 'OPEN',
    priority: 'MEDIUM',
    version: 1,
    updatedAt: new Date(),
    environmentId: null,
    reporterId: null,
    assigneeId: null,
    screenshotPath: randomUUID(),
    submission: { artifact: { sha256: 'a'.repeat(64) } },
    captureBundle: {
      schemaVersion: 2,
      annotationKind: 'SCREENSHOT',
      page: { url: 'https://example.test/page', capturedAt: '2026-09-17T02:16:00.000Z' },

      reproduction: [],
      anchor: { x: 10 },
    },
  };
  const rows = [first, { ...first, id: randomUUID() }, { ...first, id: randomUUID() }];
  const before = structuredClone(rows);
  const findMany = vi.fn().mockResolvedValue(rows);
  const artifacts = vi
    .fn()
    .mockResolvedValue([{ id: first.screenshotPath, sha256: 'a'.repeat(64) }]);
  const access = vi.fn().mockResolvedValue({});
  const service = new AgentFixService(
    {
      report: { findMany },
      artifact: { findMany: artifacts },
      agentFixAttempt: { findMany: vi.fn().mockResolvedValue([]) },
    } as never,
    { access } as never,
  );
  const result = await service.list({ id: randomUUID() } as never, { projectId, limit: 2 });
  expect(result.items.map((item) => item.id)).toEqual(rows.slice(0, 2).map((row) => row.id));
  expect(result.nextCursor).toBe(rows[1]?.id);
  expect(result.delivery.groups).toHaveLength(1);
  expect(result.delivery.groups[0]?.memberIds).toEqual(result.items.map((item) => item.id));
  expect(result.items[0]).not.toHaveProperty('captureBundle');
  expect(rows).toEqual(before);
  expect(findMany).toHaveBeenCalledWith(
    expect.objectContaining({
      where: { projectId, status: 'OPEN', rejectionReason: null },
      take: 3,
    }),
  );

  expect(artifacts).toHaveBeenCalledWith({
    where: { id: { in: [first.screenshotPath] } },
    select: { id: true, sha256: true },
  });
  // Both reports retain the same original submission hash, but the current images differ.
  const currentScreenshot = randomUUID();
  const changed = { ...first, id: randomUUID(), screenshotPath: currentScreenshot };
  findMany.mockResolvedValue([first, changed]);
  artifacts.mockResolvedValue([
    { id: first.screenshotPath, sha256: 'a'.repeat(64) },
    { id: currentScreenshot, sha256: 'b'.repeat(64) },
  ]);
  const updated = await service.list({} as never, { projectId });
  expect(updated.delivery.groups).toHaveLength(2);
  artifacts.mockRejectedValueOnce(new Error('Optional artifact lookup unavailable'));
  const fallback = await service.list({} as never, { projectId });
  expect(fallback.items.map((item) => item.id)).toEqual([first.id, changed.id]);
  expect(fallback.delivery.groups).toHaveLength(2);
  artifacts.mockResolvedValue([]);
  const missing = await service.list({} as never, { projectId });
  expect(missing.delivery.groups).toHaveLength(2);

  findMany.mockResolvedValue([{ ...first, id: randomUUID(), captureBundle: null }]);
  const next = await service.list({ id: randomUUID() } as never, {
    projectId,
    cursor: result.nextCursor,
    limit: 2,
  });
  expect(next.items).toHaveLength(1);
  expect(next.nextCursor).toBeNull();
  expect(next.delivery.groups[0]?.reason).toBe('individual');
  expect(findMany).toHaveBeenLastCalledWith(
    expect.objectContaining({ cursor: { id: result.nextCursor }, skip: 1 }),
  );

  access.mockRejectedValueOnce(new Error('Forbidden'));
  findMany.mockClear();
  await expect(service.list({} as never, { projectId })).rejects.toThrow('Forbidden');
  expect(findMany).not.toHaveBeenCalled();
});
