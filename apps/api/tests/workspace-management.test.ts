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
    const service = new AppService(
      {
        membership: {
          findUnique: vi.fn().mockResolvedValue({ role: 'OWNER', status: 'ACTIVE' }),
        },
        project: { create },
      } as never,
    );

    await service.createProject('user-1', 'workspace-1', {
      name: '  Storefront  ',
      baseUrl: '',
    });

    expect(create).toHaveBeenCalledWith({
      data: { workspaceId: 'workspace-1', name: 'Storefront', baseUrl: null },
    });
  });

  it('allows owners to permanently delete a project', async () => {
    const remove = vi.fn().mockResolvedValue({ id: 'project-1' });
    const service = new AppService(
      {
        membership: {
          findUnique: vi.fn().mockResolvedValue({ role: 'OWNER', status: 'ACTIVE' }),
        },
        project: {
          findUnique: vi.fn().mockResolvedValue({ id: 'project-1', workspaceId: 'workspace-1' }),
          delete: remove,
        },
        artifact: { findMany: vi.fn().mockResolvedValue([]) },
      } as never,
    );

    await expect(service.deleteProject('user-1', 'project-1')).resolves.toEqual({
      deleted: true,
    });
    expect(remove).toHaveBeenCalledWith({ where: { id: 'project-1' } });
  });

  it('rejects project creation by regular workspace members', async () => {
    const create = vi.fn();
    const service = new AppService(
      {
        membership: {
          findUnique: vi.fn().mockResolvedValue({ role: 'MEMBER', status: 'ACTIVE' }),
        },
        project: { create },
      } as never,
    );

    await expect(
      service.createProject('user-1', 'workspace-1', { name: 'Forbidden' }),
    ).rejects.toThrow('access to this workspace action');
    expect(create).not.toHaveBeenCalled();
  });

  it('allows members to list project environments', async () => {
    const findMany = vi.fn().mockResolvedValue([{ id: 'environment-1' }]);
    const service = new AppService(
      {
        membership: {
          findUnique: vi.fn().mockResolvedValue({ role: 'MEMBER', status: 'ACTIVE' }),
        },
        project: {
          findUnique: vi.fn().mockResolvedValue({ id: 'project-1', workspaceId: 'workspace-1' }),
        },
        environment: { findMany },
      } as never,
    );

    await expect(service.listEnvironments('user-1', 'project-1')).resolves.toEqual([
      { id: 'environment-1' },
    ]);
    expect(findMany).toHaveBeenCalledWith({
      where: { projectId: 'project-1' },
      orderBy: { createdAt: 'asc' },
    });
  });

  it('allows owners to create normalized web environments', async () => {
    const create = vi.fn().mockResolvedValue({ id: 'environment-1' });
    const service = new AppService(
      {
        membership: {
          findUnique: vi.fn().mockResolvedValue({ role: 'OWNER', status: 'ACTIVE' }),
        },
        project: {
          findUnique: vi.fn().mockResolvedValue({ id: 'project-1', workspaceId: 'workspace-1' }),
        },
        environment: { create },
      } as never,
    );

    await service.createEnvironment('user-1', 'project-1', {
      name: '  Staging  ',
      baseUrl: 'https://staging.example.test/app',
    });

    expect(create).toHaveBeenCalledWith({
      data: {
        projectId: 'project-1',
        name: 'Staging',
        baseUrl: 'https://staging.example.test/app',
      },
    });
  });

  it('rejects environment updates by regular members', async () => {
    const update = vi.fn();
    const service = new AppService(
      {
        membership: {
          findUnique: vi.fn().mockResolvedValue({ role: 'MEMBER', status: 'ACTIVE' }),
        },
        project: {
          findUnique: vi.fn().mockResolvedValue({ id: 'project-1', workspaceId: 'workspace-1' }),
        },
        environment: {
          findUnique: vi.fn().mockResolvedValue({ id: 'environment-1', projectId: 'project-1' }),
          update,
        },
      } as never,
    );

    await expect(
      service.updateEnvironment('user-1', 'environment-1', { name: 'Production' }),
    ).rejects.toThrow('access to this workspace action');
    expect(update).not.toHaveBeenCalled();
  });

  it('binds report submissions to an environment in the selected project', async () => {
    const projectId = crypto.randomUUID();
    const environmentId = crypto.randomUUID();
    const create = vi.fn().mockResolvedValue({ id: 'submission-1' });
    const service = new AppService(
      {
        membership: {
          findUnique: vi.fn().mockResolvedValue({ role: 'REPORTER', status: 'ACTIVE' }),
        },
        project: {
          findUnique: vi.fn().mockResolvedValue({ id: projectId, workspaceId: 'workspace-1' }),
        },
        environment: {
          findUnique: vi.fn().mockResolvedValue({ id: environmentId, projectId }),
        },
        reportSubmission: { findUnique: vi.fn().mockResolvedValue(null), create },
      } as never,
    );

    await service.createSubmission('user-1', projectId, 'request-1', {
      projectId,
      environmentId,
      title: 'Broken menu',
      description: 'The menu overlaps the page.',
      priority: 'MEDIUM',
      captureBundle: {
        schemaVersion: 1,
        page: {
          url: 'https://example.test',
          title: 'Example',
          viewportWidthCssPx: 1280,
          viewportHeightCssPx: 720,
          deviceScaleFactor: 1,
          capturedAt: new Date().toISOString(),
        },
        anchor: {
          kind: 'region',
          xCssPx: 10,
          yCssPx: 10,
          widthCssPx: 100,
          heightCssPx: 80,
          documentUrl: 'https://example.test',
          scrollXCssPx: 0,
          scrollYCssPx: 0,
        },
        annotations: [],
        reproduction: [],
      },
    });

    expect(create).toHaveBeenCalledWith({
      data: expect.objectContaining({ projectId, environmentId, createdById: 'user-1' }),
    });
  });

  it('rejects a report whose payload project differs from the route project', async () => {
    const routeProjectId = crypto.randomUUID();
    const payloadProjectId = crypto.randomUUID();
    const create = vi.fn();
    const service = new AppService(
      {
        membership: {
          findUnique: vi.fn().mockResolvedValue({ role: 'REPORTER', status: 'ACTIVE' }),
        },
        project: {
          findUnique: vi.fn().mockResolvedValue({ id: routeProjectId, workspaceId: 'workspace-1' }),
        },
        reportSubmission: { create },
      } as never,
    );

    await expect(
      service.createSubmission('user-1', routeProjectId, 'request-mismatch', {
        projectId: payloadProjectId,
        title: 'Wrong project',
        description: 'This payload must not cross the project boundary.',
        priority: 'MEDIUM',
        captureBundle: {
          schemaVersion: 1,
          page: {
            url: 'https://example.test',
            title: 'Example',
            viewportWidthCssPx: 1280,
            viewportHeightCssPx: 720,
            deviceScaleFactor: 1,
            capturedAt: new Date().toISOString(),
          },
          anchor: {
            kind: 'region',
            xCssPx: 10,
            yCssPx: 10,
            widthCssPx: 100,
            heightCssPx: 80,
            documentUrl: 'https://example.test',
            scrollXCssPx: 0,
            scrollYCssPx: 0,
          },
          annotations: [],
          reproduction: [],
        },
      }),
    ).rejects.toThrow('Project ID mismatch');
    expect(create).not.toHaveBeenCalled();
  });

  it('rejects a report environment owned by another project', async () => {
    const projectId = crypto.randomUUID();
    const environmentId = crypto.randomUUID();
    const create = vi.fn();
    const service = new AppService(
      {
        membership: {
          findUnique: vi.fn().mockResolvedValue({ role: 'REPORTER', status: 'ACTIVE' }),
        },
        project: {
          findUnique: vi.fn().mockResolvedValue({ id: projectId, workspaceId: 'workspace-1' }),
        },
        environment: {
          findUnique: vi.fn().mockResolvedValue({
            id: environmentId,
            projectId: crypto.randomUUID(),
          }),
        },
        reportSubmission: { create },
      } as never,
    );

    await expect(
      service.createSubmission('user-1', projectId, 'request-1', {
        projectId,
        environmentId,
        title: 'Broken menu',
        description: 'The menu overlaps the page.',
        priority: 'MEDIUM',
        captureBundle: {
          schemaVersion: 1,
          page: {
            url: 'https://example.test',
            title: 'Example',
            viewportWidthCssPx: 1280,
            viewportHeightCssPx: 720,
            deviceScaleFactor: 1,
            capturedAt: new Date().toISOString(),
          },
          anchor: {
            kind: 'region',
            xCssPx: 10,
            yCssPx: 10,
            widthCssPx: 100,
            heightCssPx: 80,
            documentUrl: 'https://example.test',
            scrollXCssPx: 0,
            scrollYCssPx: 0,
          },
          annotations: [],
          reproduction: [],
        },
      }),
    ).rejects.toThrow('Environment does not belong to this project');
    expect(create).not.toHaveBeenCalled();
  });

  it('finalizes an element report without requiring a screenshot artifact', async () => {
    const projectId = crypto.randomUUID();
    const submissionId = crypto.randomUUID();
    const capturedAt = new Date().toISOString();
    const payload = {
      projectId,
      title: 'Element note',
      description: 'Fix this element',
      priority: 'MEDIUM',
      captureBundle: {
        schemaVersion: 1,
        page: {
          url: 'https://example.test',
          title: 'Example',
          viewportWidthCssPx: 1,
          viewportHeightCssPx: 1,
          deviceScaleFactor: 1,
          capturedAt,
        },
        annotationKind: 'ELEMENT',
        annotations: [],
        reproduction: [],
      },
    };
    const accessSubmission = {
      id: submissionId,
      projectId,
      createdById: 'user-1',
      project: { workspaceId: 'workspace-1' },
    };
    const reportCreate = vi.fn().mockResolvedValue({ id: 'report-1' });
    const submissionUpdate = vi.fn().mockResolvedValue({ id: submissionId });
    const transaction = {
      reportSubmission: {
        findUnique: vi.fn().mockResolvedValue({
          ...accessSubmission,
          payload,
          artifact: null,
          report: null,
        }),
        update: submissionUpdate,
      },
      report: { create: reportCreate },
    };
    const service = new AppService({
      membership: {
        findUnique: vi.fn().mockResolvedValue({ role: 'REPORTER', status: 'ACTIVE' }),
      },
      reportSubmission: { findUnique: vi.fn().mockResolvedValue(accessSubmission) },
      $transaction: vi.fn((callback) => callback(transaction)),
    } as never);

    await expect(service.finalizeSubmission('user-1', submissionId)).resolves.toEqual({
      id: 'report-1',
    });
    expect(reportCreate).toHaveBeenCalledWith({
      data: expect.objectContaining({ screenshotPath: null, captureBundle: payload.captureBundle }),
    });
    expect(submissionUpdate).toHaveBeenCalledWith({
      where: { id: submissionId },
      data: { status: 'FINALIZED' },
    });
  });
});
