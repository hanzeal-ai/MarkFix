import { beforeEach, describe, expect, it, vi } from 'vitest';
import { rm } from 'node:fs/promises';
import { cleanupExpiredSubmissions } from '../src/expired-submission-cleanup.js';

vi.mock('node:fs/promises', () => ({ rm: vi.fn().mockResolvedValue(undefined) }));
beforeEach(() => vi.clearAllMocks());

describe('expired submission cleanup ownership', () => {
  const candidate = { id: 'submission', artifact: { id: 'artifact' } };
  it('preserves the artifact when finalization or another worker wins after candidate selection', async () => {
    const deleteMany = vi.fn().mockResolvedValue({ count: 0 });
    await cleanupExpiredSubmissions(
      {
        reportSubmission: {
          findMany: vi.fn().mockResolvedValue([candidate]),
          deleteMany,
        },
      } as never,
      '/unused',
    );
    expect(deleteMany).toHaveBeenCalledWith({
      where: {
        id: 'submission',
        status: { not: 'FINALIZED' },
        expiresAt: { lt: expect.any(Date) },
      },
    });
    expect(rm).not.toHaveBeenCalled();
  });
  it('removes the artifact only after a successful conditional database deletion', async () => {
    const deleteMany = vi.fn().mockImplementation(async () => {
      expect(rm).not.toHaveBeenCalled();
      return { count: 1 };
    });
    await cleanupExpiredSubmissions(
      {
        reportSubmission: {
          findMany: vi.fn().mockResolvedValue([candidate]),
          deleteMany,
        },
      } as never,
      '/unused',
    );
    expect(rm).toHaveBeenCalledWith('/unused/artifact.png', { force: true });
  });
  it('leaves files intact if a database constraint or connection failure rejects deletion', async () => {
    await expect(
      cleanupExpiredSubmissions(
        {
          reportSubmission: {
            findMany: vi.fn().mockResolvedValue([candidate]),
            deleteMany: vi.fn().mockRejectedValue(new Error('database unavailable')),
          },
        } as never,
        '/unused',
      ),
    ).rejects.toThrow('database unavailable');
    expect(rm).not.toHaveBeenCalled();
  });
});
