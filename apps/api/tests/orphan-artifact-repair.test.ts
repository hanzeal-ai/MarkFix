import { describe, expect, it, vi, beforeEach } from 'vitest';
import { readdir, rm } from 'node:fs/promises';
import { repairOrphanArtifacts } from '../src/orphan-artifact-repair.js';

vi.mock('node:fs/promises', () => ({ readdir: vi.fn(), rm: vi.fn() }));
beforeEach(() => vi.resetAllMocks());
const ids = Array.from({ length: 3 }, () => crypto.randomUUID());
const entries = ids.map((id) => ({ name: `${id}.png`, isFile: () => true }));
const database = () => ({
  artifact: { findUnique: vi.fn().mockResolvedValue(null) },
  report: { findFirst: vi.fn().mockResolvedValue(null) },
});

describe('offline orphan repair', () => {
  it('defaults to dry-run and preserves both artifact and report-only references', async () => {
    vi.mocked(readdir).mockResolvedValue(entries as never);
    const db = database();
    db.artifact.findUnique.mockResolvedValueOnce({ id: ids[0] });
    db.report.findFirst.mockResolvedValueOnce(null).mockResolvedValueOnce({ id: 'report' });
    const result = await repairOrphanArtifacts(db as never, '/unused');
    expect(result.candidates).toEqual([`${ids[2]}.png`]);
    expect(result.preserved).toEqual([`${ids[0]}.png`, `${ids[1]}.png`]);
    expect(rm).not.toHaveBeenCalled();
  });
  it('does not delete any file if a later database query fails', async () => {
    vi.mocked(readdir).mockResolvedValue(entries as never);
    const db = database();
    db.report.findFirst.mockResolvedValueOnce(null).mockRejectedValueOnce(new Error('offline'));
    await expect(repairOrphanArtifacts(db as never, '/unused', true)).rejects.toThrow('offline');
    expect(rm).not.toHaveBeenCalled();
  });
  it('ignores other names and symlinks and reports deletion failures for retry', async () => {
    vi.mocked(readdir).mockResolvedValue([
      ...entries.slice(0, 2),
      { name: 'unknown.png', isFile: () => true },
      { name: `${ids[2]}.png`, isFile: () => false },
    ] as never);
    vi.mocked(rm).mockRejectedValueOnce(new Error('permission denied')).mockResolvedValueOnce();
    const result = await repairOrphanArtifacts(database() as never, '/unused', true);
    expect(result.removed).toEqual([`${ids[1]}.png`]);
    expect(result.failed).toEqual([{ file: `${ids[0]}.png`, error: 'permission denied' }]);
    expect(rm).toHaveBeenCalledTimes(2);
    expect(rm).toHaveBeenLastCalledWith(`/unused/${ids[1]}.png`, { force: true });
  });
});
