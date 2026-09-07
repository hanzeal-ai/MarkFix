import { describe, expect, it, vi } from 'vitest';
import type { SavedDiagnosticAnnotation } from '@markfix/contracts';
import { ProjectDataService } from '../src/project-data.service.js';

const projectId = '90e2a0c5-0755-49b9-9d5d-41534ed41b41';
const workspaceId = 'bb0ee545-59c0-427f-ad9c-fb976ef266d5';

const diagnostic = (): SavedDiagnosticAnnotation => ({
  id: crypto.randomUUID(),
  projectId,
  pageSessionId: crypto.randomUUID(),
  pageUrl: 'https://example.test/page',
  pageTitle: 'Example',
  status: 'draft',
  evidence: {
    id: crypto.randomUUID(),
    kind: 'console',
    level: 'error',
    timestamp: new Date().toISOString(),
    pageUrl: 'https://example.test/page',
    title: 'Error',
    message: 'Failure',
    redactions: [],
  },
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
});

const database = (overrides: Record<string, unknown> = {}) => {
  const value = {
    project: {
      findUnique: vi.fn().mockResolvedValue({
        id: projectId,
        workspaceId,
        name: 'Example',
        baseUrl: 'https://example.test',
        createdAt: new Date('2026-09-07T00:00:00.000Z'),
      }),
    },
    membership: { findUnique: vi.fn().mockResolvedValue({ status: 'ACTIVE' }) },
    projectAnnotationRecord: {
      findUnique: vi.fn().mockResolvedValue(null),
      upsert: vi.fn(),
      findMany: vi.fn().mockResolvedValue([]),
      deleteMany: vi.fn(),
      count: vi.fn(),
      update: vi.fn(),
      updateMany: vi.fn(),
    },
    projectDesktopState: {
      findUnique: vi.fn(),
      create: vi.fn(),
      updateMany: vi.fn(),
    },
    projectAnnotationBatch: { findUnique: vi.fn().mockResolvedValue(null), create: vi.fn() },
    ...overrides,
  };
  return {
    ...value,
    $transaction: vi.fn(async (operation: (transaction: typeof value) => unknown) =>
      operation(value),
    ),
  };
};

describe('ProjectDataService', () => {
  it('rejects cloud record access without an active project membership', async () => {
    const db = database({
      membership: { findUnique: vi.fn().mockResolvedValue({ status: 'SUSPENDED' }) },
    });
    const service = new ProjectDataService(db as never);

    await expect(service.listRecords('user-1', projectId, 'DIAGNOSTIC')).rejects.toThrow(
      'access to this project',
    );
  });

  it('does not let an annotation identity move between projects', async () => {
    const record = diagnostic();
    const db = database();
    db.projectAnnotationRecord.findUnique.mockResolvedValue({
      id: record.id,
      projectId: crypto.randomUUID(),
      kind: 'DIAGNOSTIC',
    });
    const service = new ProjectDataService(db as never);

    await expect(service.saveRecord('user-1', projectId, 'DIAGNOSTIC', record)).rejects.toThrow(
      'belongs to another project',
    );
    expect(db.projectAnnotationRecord.upsert).not.toHaveBeenCalled();
  });

  it('rejects stale cloud navigation revisions', async () => {
    const db = database();
    db.projectDesktopState.findUnique.mockResolvedValue({ revision: 2 });
    const service = new ProjectDataService(db as never);
    const now = new Date().toISOString();

    await expect(
      service.saveState('user-1', projectId, {
        project: {
          id: projectId,
          storageMode: 'CLOUD',
          workspaceId,
          title: 'Example',
          origin: 'https://example.test',
          entryUrl: 'https://example.test/start',
          faviconUrl: null,
          faviconSource: 'markfix',
          currentPageSessionId: crypto.randomUUID(),
          currentUrl: 'https://example.test/start',
          createdAt: now,
          updatedAt: now,
        },
        navigation: { entries: [], currentIndex: -1 },
        revision: 1,
      }),
    ).rejects.toThrow('has changed');
  });

  it('rejects a stale binary upload before it can replace a newer screenshot', async () => {
    const db = database();
    db.projectAnnotationRecord.findUnique.mockResolvedValue({
      id: '1d04602d-c0cb-4aac-bf5b-066b33273a03',
      projectId,
      kind: 'CAPTURE',
      updatedAt: new Date('2026-09-07T10:00:00.000Z'),
    });
    const service = new ProjectDataService(db as never);

    await expect(
      service.saveRecordImage(
        'user-1',
        projectId,
        'CAPTURE',
        '1d04602d-c0cb-4aac-bf5b-066b33273a03',
        'rendered',
        '2026-09-07T09:00:00.000Z',
        Uint8Array.from([1]),
      ),
    ).rejects.toThrow('changed before its image upload completed');
    expect(db.projectAnnotationRecord.updateMany).not.toHaveBeenCalled();
  });

  it('guards the binary write with the annotation revision', async () => {
    const updatedAt = new Date('2026-09-07T10:00:00.000Z');
    const db = database();
    db.projectAnnotationRecord.findUnique.mockResolvedValue({
      id: '1d04602d-c0cb-4aac-bf5b-066b33273a03',
      projectId,
      kind: 'CAPTURE',
      updatedAt,
      renderedPng: null,
      sourcePng: null,
    });
    db.projectAnnotationRecord.updateMany.mockResolvedValue({ count: 1 });
    const service = new ProjectDataService(db as never);

    await service.saveRecordImage(
      'user-1',
      projectId,
      'CAPTURE',
      '1d04602d-c0cb-4aac-bf5b-066b33273a03',
      'rendered',
      updatedAt.toISOString(),
      Uint8Array.from([1]),
    );

    expect(db.projectAnnotationRecord.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ updatedAt }),
      }),
    );
  });

  it('does not submit a record identity under a different annotation kind', async () => {
    const record = diagnostic();
    const db = database();
    db.projectAnnotationRecord.findMany.mockResolvedValue([{ id: record.id, kind: 'CAPTURE' }]);
    const service = new ProjectDataService(db as never);

    await expect(
      service.saveSubmission('user-1', projectId, {
        id: crypto.randomUUID(),
        projectId,
        captures: [],
        elementComments: [],
        diagnostics: [record],
        submittedAt: new Date().toISOString(),
      }),
    ).rejects.toThrow('cloud annotations are missing');
    expect(db.projectAnnotationBatch.create).not.toHaveBeenCalled();
  });
});
