import { describe, expect, it, vi } from 'vitest';
import { CommercialService } from '../src/commercial.service.js';

const managerMembership = { role: 'ADMIN', status: 'ACTIVE' };
const report = (overrides: Record<string, unknown> = {}) => ({
  id: crypto.randomUUID(),
  projectId: crypto.randomUUID(),
  reporterId: 'reporter-1',
  reporter: { id: 'reporter-1', displayName: 'Lin', email: 'lin@example.test' },
  title: 'Header overlaps navigation',
  description: 'The issue appears below 768px.',
  status: 'OPEN',
  rejectionReason: null,
  captureBundle: {
    page: { url: 'https://example.test/pricing' },
    anchor: { kind: 'element' },
    annotations: [],
  },
  createdAt: new Date('2026-09-05T00:00:00.000Z'),
  updatedAt: new Date('2026-09-05T01:00:00.000Z'),
  ...overrides,
});

const managerDatabase = (workspaceId: string, projectId: string) => ({
  membership: { findUnique: vi.fn().mockResolvedValue(managerMembership) },
  project: { findUnique: vi.fn().mockResolvedValue({ id: projectId, workspaceId }) },
});

describe('commercial annotation management', () => {
  it('aggregates standalone annotations and reports without mirrored rows', async () => {
    const workspaceId = crypto.randomUUID();
    const userId = crypto.randomUUID();
    const project = {
      id: crypto.randomUUID(), workspaceId, name: 'Marketing site',
      baseUrl: 'https://example.test', category: '品牌官网',
      createdAt: new Date(), updatedAt: new Date(),
    };
    const service = new CommercialService({
      membership: {
        findUnique: vi.fn().mockResolvedValue(managerMembership),
        findMany: vi.fn().mockResolvedValue([{
          role: 'ADMIN', user: { id: userId, displayName: 'Lin', email: 'lin@example.test' },
        }]),
      },
      project: { findMany: vi.fn().mockResolvedValue([project]) },
      managedAnnotation: { groupBy: vi.fn().mockResolvedValue([{
        projectId: project.id, authorId: userId, status: 'REJECTED', _count: { _all: 1 },
      }]) },
      report: { groupBy: vi.fn().mockResolvedValue([{
        projectId: project.id, reporterId: userId, status: 'OPEN',
        rejectionReason: null, _count: { _all: 2 },
      }]) },
    } as never);

    const result = await service.overview(userId, workspaceId);

    expect(result.metrics).toEqual({ projects: 1, annotations: 3, pending: 2, rejected: 1 });
    expect(result.projects[0]).toEqual(
      expect.objectContaining({ annotationCount: 3, pendingCount: 2, rejectedCount: 1 }),
    );
    expect(result.users[0]?.projectCategories).toEqual([{ category: '品牌官网', count: 3 }]);
  });

  it('projects reports directly and derives element annotations correctly', async () => {
    const workspaceId = crypto.randomUUID();
    const projectId = crypto.randomUUID();
    const source = report({ projectId });
    const findMany = vi.fn().mockResolvedValue([]);
    const service = new CommercialService({
      ...managerDatabase(workspaceId, projectId),
      managedAnnotation: { findMany },
      report: { findMany: vi.fn().mockResolvedValue([source]) },
    } as never);

    const result = await service.annotations('admin-1', projectId);

    expect(result.items).toEqual([
      expect.objectContaining({ id: source.id, sourceReportId: source.id, kind: 'ELEMENT' }),
    ]);
    expect(findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { projectId, sourceReportId: null } }),
    );
  });

  it('filters and paginates the combined annotation source', async () => {
    const workspaceId = crypto.randomUUID();
    const projectId = crypto.randomUUID();
    const service = new CommercialService({
      ...managerDatabase(workspaceId, projectId),
      managedAnnotation: { findMany: vi.fn().mockResolvedValue([{
        id: 'managed-1', projectId, title: 'Footer note', note: 'Unrelated',
        pageUrl: 'https://example.test', status: 'OPEN',
        updatedAt: new Date('2026-09-05T00:00:00.000Z'),
      }]) },
      report: { findMany: vi.fn().mockResolvedValue([
        report({ projectId, title: 'Header one' }), report({ projectId, title: 'Header two' }),
      ]) },
    } as never);

    const result = await service.annotations('admin-1', projectId, {
      page: '2', pageSize: '1', status: 'OPEN', query: 'header',
    });

    expect(result.total).toBe(2);
    expect(result.items).toHaveLength(1);
    expect(result.page).toBe(2);
    await expect(service.annotations('admin-1', projectId, { pageSize: '101' })).rejects.toThrow();
  });

  it('updates report-backed annotations on the Report source only', async () => {
    const workspaceId = crypto.randomUUID();
    const projectId = crypto.randomUUID();
    const source = report({ projectId });
    const reportUpdate = vi.fn().mockImplementation(({ data }) => Promise.resolve(report({
      ...source, title: data.title, status: data.status, captureBundle: data.captureBundle,
    })));
    const managedUpdate = vi.fn();
    const service = new CommercialService({
      ...managerDatabase(workspaceId, projectId),
      managedAnnotation: { findFirst: vi.fn().mockResolvedValue(null), update: managedUpdate },
      report: { findUnique: vi.fn().mockResolvedValue(source), update: reportUpdate },
    } as never);

    const result = await service.updateAnnotation('admin-1', source.id, {
      title: 'Updated title', kind: 'COMMENT', pageUrl: 'https://example.test/new',
      status: 'IN_REVIEW',
    });

    expect(reportUpdate).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: source.id },
      data: expect.objectContaining({
        title: 'Updated title', status: 'IN_PROGRESS', version: { increment: 1 },
        captureBundle: expect.objectContaining({
          annotationKind: 'COMMENT', page: expect.objectContaining({ url: 'https://example.test/new' }),
        }),
      }),
    }));
    expect(result).toEqual(expect.objectContaining({ title: 'Updated title', kind: 'COMMENT' }));
    expect(managedUpdate).not.toHaveBeenCalled();
  });

  it('rejects report-backed annotations on the Report source and keeps them immutable', async () => {
    const workspaceId = crypto.randomUUID();
    const projectId = crypto.randomUUID();
    const source = report({ projectId });
    const reportUpdate = vi.fn().mockImplementation(({ data }) => Promise.resolve(report({
      ...source, status: data.status, rejectionReason: data.rejectionReason,
    })));
    const remove = vi.fn();
    const service = new CommercialService({
      ...managerDatabase(workspaceId, projectId),
      managedAnnotation: { findFirst: vi.fn().mockResolvedValue(null), delete: remove },
      report: { findUnique: vi.fn().mockResolvedValue(source), update: reportUpdate },
    } as never);

    const result = await service.rejectAnnotation('admin-1', source.id, {
      reason: 'Not part of this release',
    });

    expect(result).toEqual(expect.objectContaining({ status: 'REJECTED' }));
    expect(reportUpdate).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: source.id },
      data: { status: 'CLOSED', rejectionReason: 'Not part of this release', version: { increment: 1 } },
    }));
    await expect(service.deleteAnnotation('admin-1', source.id)).rejects.toThrow(
      'Submitted annotations cannot be deleted',
    );
    expect(remove).not.toHaveBeenCalled();
  });

  it('creates, updates, rejects and deletes standalone annotations', async () => {
    const workspaceId = crypto.randomUUID();
    const projectId = crypto.randomUUID();
    const annotationId = crypto.randomUUID();
    const stored = { id: annotationId, projectId, sourceReportId: null, project: {} };
    const create = vi.fn().mockImplementation(({ data }) => Promise.resolve(data));
    const update = vi.fn().mockImplementation(({ data }) => Promise.resolve(data));
    const remove = vi.fn().mockResolvedValue({ id: annotationId });
    const service = new CommercialService({
      ...managerDatabase(workspaceId, projectId),
      managedAnnotation: {
        create, findFirst: vi.fn().mockResolvedValue(stored), update, delete: remove,
      },
      report: { findUnique: vi.fn().mockResolvedValue(null) },
    } as never);

    await service.createAnnotation('admin-1', projectId, {
      title: 'Button label', note: 'Use a clearer action.', kind: 'COMMENT',
      pageUrl: 'https://example.test/pricing',
    });
    await service.updateAnnotation('admin-1', annotationId, {
      title: 'Updated annotation', status: 'RESOLVED',
    });
    await service.rejectAnnotation('admin-1', annotationId, {
      reason: 'Not part of this release.',
    });
    await expect(service.deleteAnnotation('admin-1', annotationId)).resolves.toEqual({ deleted: true });

    expect(create).toHaveBeenCalled();
    expect(update).toHaveBeenNthCalledWith(1, expect.objectContaining({
      data: expect.objectContaining({ status: 'RESOLVED' }),
    }));
    expect(update).toHaveBeenNthCalledWith(2, expect.objectContaining({
      data: { status: 'REJECTED', rejectionReason: 'Not part of this release.' },
    }));
    expect(remove).toHaveBeenCalledWith({ where: { id: annotationId } });
  });

  it('rejects writes from regular members', async () => {
    const workspaceId = crypto.randomUUID();
    const projectId = crypto.randomUUID();
    const create = vi.fn();
    const service = new CommercialService({
      project: { findUnique: vi.fn().mockResolvedValue({ id: projectId, workspaceId }) },
      membership: { findUnique: vi.fn().mockResolvedValue({ role: 'MEMBER', status: 'ACTIVE' }) },
      managedAnnotation: { create },
    } as never);

    await expect(service.createAnnotation('member-1', projectId, {
      title: 'Button label', note: 'Use a clearer action.', kind: 'COMMENT',
      pageUrl: 'https://example.test',
    })).rejects.toThrow('Only workspace managers');
    expect(create).not.toHaveBeenCalled();
  });
});
