import { describe, expect, it, vi } from 'vitest';
import { CommercialService } from '../src/commercial.service.js';

const managerMembership = { role: 'ADMIN', status: 'ACTIVE' };

describe('commercial annotation management', () => {
  it('aggregates workspace metrics and user project categories', async () => {
    const workspaceId = crypto.randomUUID();
    const userId = crypto.randomUUID();
    const project = {
      id: crypto.randomUUID(),
      workspaceId,
      name: 'Marketing site',
      baseUrl: 'https://example.test',
      category: '品牌官网',
      createdAt: new Date(),
      updatedAt: new Date(),
      annotations: [
        {
          id: crypto.randomUUID(),
          projectId: '',
          authorId: userId,
          title: 'Hero spacing',
          note: 'Reduce the empty space.',
          kind: 'ELEMENT',
          pageUrl: 'https://example.test',
          status: 'REJECTED',
          rejectionReason: 'Matches the approved layout.',
          author: { id: userId, displayName: 'Lin', email: 'lin@example.test' },
          createdAt: new Date(),
          updatedAt: new Date(),
        },
      ],
    };
    const service = new CommercialService({
      membership: {
        findUnique: vi.fn().mockResolvedValue(managerMembership),
        findMany: vi.fn().mockResolvedValue([
          {
            role: 'ADMIN',
            user: { id: userId, displayName: 'Lin', email: 'lin@example.test' },
          },
        ]),
      },
      project: { findMany: vi.fn().mockResolvedValue([project]) },
    } as never);

    const result = await service.overview(userId, workspaceId);

    expect(result.metrics).toEqual({ projects: 1, annotations: 1, pending: 0, rejected: 1 });
    expect(result.users[0]?.projectCategories).toEqual([{ category: '品牌官网', count: 1 }]);
  });

  it('allows managers to create an annotation in their project', async () => {
    const workspaceId = crypto.randomUUID();
    const projectId = crypto.randomUUID();
    const userId = crypto.randomUUID();
    const create = vi.fn().mockImplementation(({ data }) => Promise.resolve(data));
    const service = new CommercialService({
      project: { findUnique: vi.fn().mockResolvedValue({ id: projectId, workspaceId }) },
      membership: { findUnique: vi.fn().mockResolvedValue(managerMembership) },
      managedAnnotation: { create },
    } as never);

    await service.createAnnotation(userId, projectId, {
      title: 'Button label',
      note: 'Use a clearer action.',
      kind: 'COMMENT',
      pageUrl: 'https://example.test/pricing',
    });

    expect(create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ projectId, authorId: userId }) }),
    );
  });

  it('rejects write operations from regular members', async () => {
    const workspaceId = crypto.randomUUID();
    const projectId = crypto.randomUUID();
    const create = vi.fn();
    const service = new CommercialService({
      project: { findUnique: vi.fn().mockResolvedValue({ id: projectId, workspaceId }) },
      membership: {
        findUnique: vi.fn().mockResolvedValue({ role: 'MEMBER', status: 'ACTIVE' }),
      },
      managedAnnotation: { create },
    } as never);

    await expect(
      service.createAnnotation('member-1', projectId, {
        title: 'Button label',
        note: 'Use a clearer action.',
        kind: 'COMMENT',
        pageUrl: 'https://example.test',
      }),
    ).rejects.toThrow('Only workspace managers');
    expect(create).not.toHaveBeenCalled();
  });

  it('requires a meaningful rejection reason', async () => {
    const workspaceId = crypto.randomUUID();
    const projectId = crypto.randomUUID();
    const annotationId = crypto.randomUUID();
    const update = vi.fn();
    const service = new CommercialService({
      managedAnnotation: {
        findUnique: vi.fn().mockResolvedValue({
          id: annotationId,
          projectId,
          project: { id: projectId, workspaceId },
        }),
        update,
      },
      project: { findUnique: vi.fn().mockResolvedValue({ id: projectId, workspaceId }) },
      membership: { findUnique: vi.fn().mockResolvedValue(managerMembership) },
    } as never);

    await expect(
      service.rejectAnnotation('admin-1', annotationId, { reason: '  ' }),
    ).rejects.toThrow();
    expect(update).not.toHaveBeenCalled();
  });

  it('updates and rejects an annotation while preserving the project boundary', async () => {
    const workspaceId = crypto.randomUUID();
    const projectId = crypto.randomUUID();
    const annotationId = crypto.randomUUID();
    const update = vi.fn().mockImplementation(({ data }) => Promise.resolve(data));
    const service = new CommercialService({
      managedAnnotation: {
        findUnique: vi.fn().mockResolvedValue({ id: annotationId, projectId, project: {} }),
        update,
      },
      project: { findUnique: vi.fn().mockResolvedValue({ id: projectId, workspaceId }) },
      membership: { findUnique: vi.fn().mockResolvedValue(managerMembership) },
    } as never);

    await service.updateAnnotation('admin-1', annotationId, {
      title: 'Updated annotation',
      status: 'RESOLVED',
    });
    await service.rejectAnnotation('admin-1', annotationId, {
      reason: 'Not part of this release.',
    });

    expect(update).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({
        where: { id: annotationId },
        data: expect.objectContaining({
          title: 'Updated annotation',
          status: 'RESOLVED',
          rejectionReason: null,
        }),
      }),
    );
    expect(update).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({
        where: { id: annotationId },
        data: { status: 'REJECTED', rejectionReason: 'Not part of this release.' },
      }),
    );
  });

  it('deletes only after validating annotation project access', async () => {
    const workspaceId = crypto.randomUUID();
    const projectId = crypto.randomUUID();
    const annotationId = crypto.randomUUID();
    const remove = vi.fn().mockResolvedValue({ id: annotationId });
    const service = new CommercialService({
      managedAnnotation: {
        findUnique: vi.fn().mockResolvedValue({ id: annotationId, projectId, project: {} }),
        delete: remove,
      },
      project: { findUnique: vi.fn().mockResolvedValue({ id: projectId, workspaceId }) },
      membership: { findUnique: vi.fn().mockResolvedValue(managerMembership) },
    } as never);

    await expect(service.deleteAnnotation('admin-1', annotationId)).resolves.toEqual({
      deleted: true,
    });
    expect(remove).toHaveBeenCalledWith({ where: { id: annotationId } });
  });
});
