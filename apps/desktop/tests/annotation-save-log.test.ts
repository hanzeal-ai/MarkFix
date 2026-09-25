import { beforeEach, describe, expect, it, vi } from 'vitest';
import { appendFileSync, renameSync, statSync } from 'node:fs';
vi.mock('node:fs', () => ({
  appendFileSync: vi.fn(),
  mkdirSync: vi.fn(),
  renameSync: vi.fn(),
  statSync: vi.fn(() => ({ size: 0 })),
}));
vi.mock('electron', () => ({ app: { getPath: () => '/logs', getVersion: () => 'test' } }));
import { logAnnotationSave } from '../src/main/annotation-save-log';

describe('annotation save diagnostics', () => {
  beforeEach(() => vi.clearAllMocks());
  it('records stage and HTTP status without private error content', () => {
    logAnnotationSave(
      'saveCaptureRecord:failed',
      Object.assign(new Error('secret token and note'), { status: 403 }),
    );
    const entry = String(vi.mocked(appendFileSync).mock.calls[0]?.[1]);
    expect(JSON.parse(entry)).toMatchObject({
      stage: 'saveCaptureRecord:failed',
      status: 403,
      failed: true,
    });
    expect(entry).not.toContain('secret');
  });
  it('rotates at one MiB and does not interrupt saves when logging fails', () => {
    vi.mocked(statSync).mockReturnValueOnce({ size: 1024 * 1024 } as ReturnType<typeof statSync>);
    logAnnotationSave('preview-opened');
    expect(renameSync).toHaveBeenCalled();
    vi.mocked(appendFileSync).mockImplementationOnce(() => {
      throw new Error('disk unavailable');
    });
    expect(() => logAnnotationSave('preview-opened')).not.toThrow();
  });
});
