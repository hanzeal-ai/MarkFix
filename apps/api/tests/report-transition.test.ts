import { describe, expect, it, vi } from 'vitest';
import { ReportService } from '../src/report.service.js';

function setup(role = 'ADMIN') {
  const update = vi.fn().mockResolvedValue({ status: 'IN_PROGRESS', version: 2 });
  const findUnique = vi.fn().mockResolvedValue({
    id: 'report',
    projectId: 'project',
    status: 'OPEN',
    version: 1,
    assigneeId: null,
    reporterId: null,
  });
  const service = new ReportService({
    report: { findUnique, update },
    project: { findUnique: vi.fn().mockResolvedValue({ id: 'project' }) },
    membership: { findUnique: vi.fn().mockResolvedValue({ role, status: 'ACTIVE' }) },
  } as never);
  return { service, update, findUnique };
}

describe('report transition input boundary', () => {
  it.each([
    null,
    { action: 'unknown', expectedVersion: 1 },
    { action: 'start', expectedVersion: 0 },
    { action: 'start', expectedVersion: 1.5 },
    { action: 'start', expectedVersion: '1' },
    { action: 'reject', expectedVersion: 1, reason: {} },
    { action: 'reject', expectedVersion: 1, reason: 'x'.repeat(2001) },
    { action: 'submit_for_verification', expectedVersion: 1, resolutionSummary: 'x'.repeat(5001) },
  ])('rejects invalid input before database access: %j', async (input) => {
    const { service, findUnique, update } = setup();
    await expect(service.transition('user', 'report', input)).rejects.toThrow('Invalid transition');
    expect(findUnique).not.toHaveBeenCalled();
    expect(update).not.toHaveBeenCalled();
  });
  it('keeps version and permission checks before writes', async () => {
    const stale = setup();
    await expect(
      stale.service.transition('user', 'report', { action: 'start', expectedVersion: 2 }),
    ).rejects.toThrow('Report has changed');
    expect(stale.update).not.toHaveBeenCalled();
    const denied = setup('REPORTER');
    await expect(
      denied.service.transition('user', 'report', { action: 'start', expectedVersion: 1 }),
    ).rejects.toThrow('Your role');
    expect(denied.update).not.toHaveBeenCalled();
  });
  it('accepts a valid transition using an atomic version predicate', async () => {
    const { service, update } = setup();
    await service.transition('user', 'report', { action: 'start', expectedVersion: 1 });
    expect(update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'report', version: 1 },
        data: expect.objectContaining({ status: 'IN_PROGRESS', version: { increment: 1 } }),
      }),
    );
  });
});

it('rolls back report changes when audit persistence fails', async () => {
  let row = { id: 'report', project: { id: 'project' }, version: 1, priority: 'LOW' };
  const database = {
    report: { findUnique: async () => ({ ...row }) },
    membership: { findUnique: async () => ({ role: 'ADMIN', status: 'ACTIVE' }) },
    $transaction: async (work: (tx: unknown) => Promise<unknown>) => {
      const before = { ...row };
      try {
        return await work({
          report: {
            updateMany: async () => {
              row = { ...row, priority: 'HIGH', version: 2 };
              return { count: 1 };
            },
          },
          activity: {
            create: async () => {
              throw new Error('audit unavailable');
            },
          },
        });
      } catch (error) {
        row = before;
        throw error;
      }
    },
  };
  await expect(
    new ReportService(database as never).updateReport('admin', 'report', {
      priority: 'HIGH',
      expectedVersion: 1,
    }),
  ).rejects.toThrow('audit unavailable');
  expect(row).toMatchObject({ priority: 'LOW', version: 1 });
});
