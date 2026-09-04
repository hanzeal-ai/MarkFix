import { describe, expect, it, vi } from 'vitest';
import { AppService } from '../src/app.service.js';

describe('workspace and project management', () => {
  it('lists only active memberships and exposes the current user role', async () => {
    const workspace = {
      id: crypto.randomUUID(),
      name: 'Product',
      projects: [],
      memberships: [{ role: 'OWNER' }],
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    const findMany = vi.fn().mockResolvedValue([workspace]);
    const service = new AppService({ workspace: { findMany } } as never);

    const result = await service.listWorkspaces('user-1');

    expect(findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { memberships: { some: { userId: 'user-1', status: 'ACTIVE' } } },
      }),
    );
    expect(result).toEqual([
      {
        id: workspace.id,
        name: workspace.name,
        projects: [],
        createdAt: workspace.createdAt,
        updatedAt: workspace.updatedAt,
        role: 'OWNER',
      },
    ]);
  });

  it('allows owners to create normalized projects', async () => {
    const create = vi.fn().mockResolvedValue({ id: 'project-1' });
    const service = new AppService({
      membership: {
        findUnique: vi.fn().mockResolvedValue({ role: 'OWNER', status: 'ACTIVE' }),
      },
      project: { create },
    } as never);

    await service.createProject('user-1', 'workspace-1', {
      name: '  Storefront  ',
      baseUrl: '',
    });

    expect(create).toHaveBeenCalledWith({
      data: { workspaceId: 'workspace-1', name: 'Storefront', baseUrl: null },
    });
  });

  it('rejects project creation by regular workspace members', async () => {
    const create = vi.fn();
    const service = new AppService({
      membership: {
        findUnique: vi.fn().mockResolvedValue({ role: 'MEMBER', status: 'ACTIVE' }),
      },
      project: { create },
    } as never);

    await expect(
      service.createProject('user-1', 'workspace-1', { name: 'Forbidden' }),
    ).rejects.toThrow('access to this workspace action');
    expect(create).not.toHaveBeenCalled();
  });
});
