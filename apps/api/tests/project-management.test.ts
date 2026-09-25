import { describe, expect, it, vi } from 'vitest';
import { ReportService } from '../src/report.service.js';
import { ProjectService } from '../src/project.service.js';
import { SubmissionService } from '../src/submission.service.js';

it.each([null, { role: 'REPORTER', status: 'SUSPENDED' }])(
  'rejects finalization after membership revocation, including completed submissions',
  async (membership) => {
    const report = { id: 'completed-report' };
    const transaction = {
      membership: { findUnique: vi.fn().mockResolvedValue(membership) },
      reportSubmission: {
        findUnique: vi
          .fn()
          .mockResolvedValue({ createdById: 'user-1', projectId: 'project-1', report }),
      },
    };
    const service = new SubmissionService({
      $transaction: vi.fn((callback) => callback(transaction)),
    } as never);
    await expect(service.finalizeSubmission('user-1', 'submission-1')).rejects.toThrow('access');
  },
);

describe('project membership and management', () => {
  it('lists only active memberships and exposes the current user role', async () => {
    const project = {
      id: crypto.randomUUID(),
      name: 'Product',
      memberships: [{ role: 'OWNER' }],
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    const findMany = vi.fn().mockResolvedValue([project]);
    const service = new ProjectService({ project: { findMany } } as never);

    const result = await service.listProjects('user-1');

    expect(findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { memberships: { some: { userId: 'user-1', status: 'ACTIVE' } } },
      }),
    );
    expect(result).toEqual([
      {
        id: project.id,
        name: project.name,
        createdAt: project.createdAt,
        updatedAt: project.updatedAt,
        role: 'OWNER',
      },
    ]);
  });

  it('allows owners to create normalized projects', async () => {
    const create = vi.fn().mockResolvedValue({ id: 'project-1' });
    const service = new ProjectService({
      membership: {
        findUnique: vi.fn().mockResolvedValue({ role: 'OWNER', status: 'ACTIVE' }),
      },
      project: { create },
    } as never);

    await service.createProject('user-1', {
      name: '  Storefront  ',
      baseUrl: '',
    });

    expect(create).toHaveBeenCalledWith({
      data: {
        ownerId: 'user-1',
        name: 'Storefront',
        baseUrl: null,
        memberships: { create: { userId: 'user-1', role: 'OWNER' } },
      },
    });
  });

  it('allows owners to permanently delete a project', async () => {
    const remove = vi.fn().mockResolvedValue({ id: 'project-1' });
    const service = new ProjectService({
      membership: {
        findUnique: vi.fn().mockResolvedValue({ role: 'OWNER', status: 'ACTIVE' }),
      },
      project: {
        findUnique: vi.fn().mockResolvedValue({ id: 'project-1' }),
        delete: remove,
      },
      artifact: { findMany: vi.fn().mockResolvedValue([]) },
    } as never);

    await expect(service.deleteProject('user-1', 'project-1')).resolves.toEqual({
      deleted: true,
    });
    expect(remove).toHaveBeenCalledWith({ where: { id: 'project-1' } });
  });

  it('rejects project updates by regular members', async () => {
    const update = vi.fn();
    const service = new ProjectService({
      membership: { findUnique: vi.fn().mockResolvedValue({ role: 'MEMBER', status: 'ACTIVE' }) },
      project: { findUnique: vi.fn().mockResolvedValue({ id: 'project-1' }), update },
    } as never);
    await expect(
      service.updateProject('user-1', 'project-1', { name: 'Forbidden' }),
    ).rejects.toThrow('access to this project action');
    expect(update).not.toHaveBeenCalled();
  });

  it('allows members to list project environments', async () => {
    const findMany = vi.fn().mockResolvedValue([{ id: 'environment-1' }]);
    const service = new ProjectService({
      membership: {
        findUnique: vi.fn().mockResolvedValue({ role: 'MEMBER', status: 'ACTIVE' }),
      },
      project: {
        findUnique: vi.fn().mockResolvedValue({ id: 'project-1' }),
      },
      environment: { findMany },
    } as never);

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
    const service = new ProjectService({
      membership: {
        findUnique: vi.fn().mockResolvedValue({ role: 'OWNER', status: 'ACTIVE' }),
      },
      project: {
        findUnique: vi.fn().mockResolvedValue({ id: 'project-1' }),
      },
      environment: { create },
    } as never);

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
    const service = new ProjectService({
      membership: {
        findUnique: vi.fn().mockResolvedValue({ role: 'MEMBER', status: 'ACTIVE' }),
      },
      project: {
        findUnique: vi.fn().mockResolvedValue({ id: 'project-1' }),
      },
      environment: {
        findUnique: vi.fn().mockResolvedValue({ id: 'environment-1', projectId: 'project-1' }),
        update,
      },
    } as never);

    await expect(
      service.updateEnvironment('user-1', 'environment-1', { name: 'Production' }),
    ).rejects.toThrow('access to this project action');
    expect(update).not.toHaveBeenCalled();
  });

  it('binds report submissions to an environment in the selected project', async () => {
    const projectId = crypto.randomUUID();
    const environmentId = crypto.randomUUID();
    const create = vi.fn().mockResolvedValue({ id: 'submission-1' });
    const service = new SubmissionService({
      membership: {
        findUnique: vi.fn().mockResolvedValue({ role: 'REPORTER', status: 'ACTIVE' }),
      },
      project: {
        findUnique: vi.fn().mockResolvedValue({ id: projectId }),
      },
      environment: {
        findUnique: vi.fn().mockResolvedValue({ id: environmentId, projectId }),
      },
      reportSubmission: { findUnique: vi.fn().mockResolvedValue(null), create },
    } as never);

    await service.createSubmission('user-1', projectId, 'request-1', {
      projectId,
      environmentId,
      title: 'Broken menu',
      description: 'The menu overlaps the page.',
      priority: 'MEDIUM',
      captureBundle: {
        annotationKind: 'SCREENSHOT',
        schemaVersion: 2,
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
    const service = new SubmissionService({
      membership: {
        findUnique: vi.fn().mockResolvedValue({ role: 'REPORTER', status: 'ACTIVE' }),
      },
      project: {
        findUnique: vi.fn().mockResolvedValue({ id: routeProjectId }),
      },
      reportSubmission: { create },
    } as never);

    await expect(
      service.createSubmission('user-1', routeProjectId, 'request-mismatch', {
        projectId: payloadProjectId,
        title: 'Wrong project',
        description: 'This payload must not cross the project boundary.',
        priority: 'MEDIUM',
        captureBundle: {
          annotationKind: 'SCREENSHOT',
          schemaVersion: 2,
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
    const service = new SubmissionService({
      membership: {
        findUnique: vi.fn().mockResolvedValue({ role: 'REPORTER', status: 'ACTIVE' }),
      },
      project: {
        findUnique: vi.fn().mockResolvedValue({ id: projectId }),
      },
      environment: {
        findUnique: vi.fn().mockResolvedValue({
          id: environmentId,
          projectId: crypto.randomUUID(),
        }),
      },
      reportSubmission: { create },
    } as never);

    await expect(
      service.createSubmission('user-1', projectId, 'request-1', {
        projectId,
        environmentId,
        title: 'Broken menu',
        description: 'The menu overlaps the page.',
        priority: 'MEDIUM',
        captureBundle: {
          annotationKind: 'SCREENSHOT',
          schemaVersion: 2,
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
        schemaVersion: 2,
        page: {
          url: 'https://example.test',
          title: 'Example',
          viewportWidthCssPx: 1,
          viewportHeightCssPx: 1,
          deviceScaleFactor: 1,
          capturedAt,
        },
        annotationKind: 'ELEMENT',

        reproduction: [],
      },
    };
    const accessSubmission = {
      id: submissionId,
      projectId,
      createdById: 'user-1',
      project: { id: 'project-1' },
    };
    const reportCreate = vi.fn().mockResolvedValue({ id: 'report-1' });
    const submissionUpdate = vi.fn().mockResolvedValue({ id: submissionId });
    const transaction = {
      membership: { findUnique: vi.fn().mockResolvedValue({ role: 'REPORTER', status: 'ACTIVE' }) },
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
    const service = new SubmissionService({
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

  it('updates the same report when a rejected annotation is resubmitted', async () => {
    const projectId = crypto.randomUUID();
    const submissionId = crypto.randomUUID();
    const sourceAnnotationId = crypto.randomUUID();
    const existingReport = {
      id: crypto.randomUUID(),
      projectId,
      status: 'CLOSED',
      rejectionReason: 'Please add more detail',
      createdAt: new Date('2026-09-07T08:00:00Z'),
      updatedAt: new Date('2026-09-07T09:00:00Z'),
    };
    const updatedReport = { ...existingReport, status: 'OPEN', rejectionReason: null };
    const reportUpdate = vi.fn().mockResolvedValue(updatedReport);
    const reportCreate = vi.fn();
    const transaction = {
      membership: { findUnique: vi.fn().mockResolvedValue({ role: 'REPORTER', status: 'ACTIVE' }) },
      reportSubmission: {
        findUnique: vi.fn().mockResolvedValue({
          id: submissionId,
          projectId,
          createdById: 'user-1',
          status: 'PENDING',
          artifact: null,
          report: null,
          payload: {
            projectId,
            title: 'Updated annotation',
            description: 'More detail',
            priority: 'MEDIUM',
            captureBundle: {
              annotationKind: 'COMMENT',
              schemaVersion: 2,
              sourceAnnotationId,
              page: {
                url: 'https://example.test',
                title: 'Example',
                viewportWidthCssPx: 1280,
                viewportHeightCssPx: 720,
                deviceScaleFactor: 1,
                capturedAt: new Date().toISOString(),
              },

              reproduction: [],
            },
          },
        }),
        update: vi.fn().mockResolvedValue({}),
      },
      report: {
        findFirst: vi.fn().mockResolvedValue(existingReport),
        create: reportCreate,
        update: reportUpdate,
      },
    };
    const service = new SubmissionService({
      membership: {
        findUnique: vi.fn().mockResolvedValue({ role: 'REPORTER', status: 'ACTIVE' }),
      },
      reportSubmission: {
        findUnique: vi.fn().mockResolvedValue({
          id: submissionId,
          projectId,
          createdById: 'user-1',
          project: { id: 'project-1' },
        }),
      },
      $transaction: vi.fn((callback) => callback(transaction)),
    } as never);

    await expect(service.finalizeSubmission('user-1', submissionId)).resolves.toEqual(
      updatedReport,
    );
    expect(reportCreate).not.toHaveBeenCalled();
    expect(reportUpdate).toHaveBeenCalledWith({
      where: { id: existingReport.id },
      data: expect.objectContaining({
        status: 'OPEN',
        rejectionReason: null,
        version: { increment: 1 },
        activities: {
          create: expect.objectContaining({
            type: 'ANNOTATION_RESUBMITTED',
            actorId: 'user-1',
          }),
        },
      }),
    });
    expect(reportUpdate.mock.calls[0]?.[0]?.data).not.toHaveProperty('submissionId');
  });

  it('returns the current report when a finalized resubmission is retried', async () => {
    const projectId = crypto.randomUUID();
    const submissionId = crypto.randomUUID();
    const sourceAnnotationId = crypto.randomUUID();
    const existingReport = {
      id: crypto.randomUUID(),
      projectId,
      status: 'OPEN',
      rejectionReason: null,
      createdAt: new Date('2026-09-07T08:00:00Z'),
      updatedAt: new Date('2026-09-07T10:00:00Z'),
    };
    const reportUpdate = vi.fn();
    const submissionUpdate = vi.fn();
    const transaction = {
      membership: { findUnique: vi.fn().mockResolvedValue({ role: 'REPORTER', status: 'ACTIVE' }) },
      reportSubmission: {
        findUnique: vi.fn().mockResolvedValue({
          id: submissionId,
          projectId,
          createdById: 'user-1',
          status: 'FINALIZED',
          artifact: null,
          report: null,
          payload: {
            projectId,
            title: 'Updated annotation',
            description: 'More detail',
            priority: 'MEDIUM',
            captureBundle: {
              annotationKind: 'COMMENT',
              schemaVersion: 2,
              sourceAnnotationId,
              page: {
                url: 'https://example.test',
                title: 'Example',
                viewportWidthCssPx: 1280,
                viewportHeightCssPx: 720,
                deviceScaleFactor: 1,
                capturedAt: new Date().toISOString(),
              },

              reproduction: [],
            },
          },
        }),
        update: submissionUpdate,
      },
      report: {
        findFirst: vi.fn().mockResolvedValue(existingReport),
        create: vi.fn(),
        update: reportUpdate,
      },
    };
    const service = new SubmissionService({
      membership: {
        findUnique: vi.fn().mockResolvedValue({ role: 'REPORTER', status: 'ACTIVE' }),
      },
      reportSubmission: {
        findUnique: vi.fn().mockResolvedValue({
          id: submissionId,
          projectId,
          createdById: 'user-1',
          project: { id: 'project-1' },
        }),
      },
      $transaction: vi.fn((callback) => callback(transaction)),
    } as never);

    await expect(service.finalizeSubmission('user-1', submissionId)).resolves.toEqual(
      existingReport,
    );
    expect(reportUpdate).not.toHaveBeenCalled();
    expect(submissionUpdate).not.toHaveBeenCalled();
  });

  it('rejects the removed JSON image envelope instead of keeping a second upload protocol', async () => {
    const findUnique = vi.fn();
    const service = new SubmissionService({ artifact: { findUnique } } as never);

    await expect(
      service.uploadArtifact('user-1', 'artifact-1', {
        dataUrl: 'data:image/png;base64,bGVnYWN5',
      }),
    ).rejects.toThrow('Expected PNG bytes');
    expect(findUnique).not.toHaveBeenCalled();
  });

  it('filters report overlays by the active page at the database boundary', async () => {
    const findMany = vi.fn().mockResolvedValue([]);
    const service = new ReportService({
      project: { findUnique: vi.fn().mockResolvedValue({ id: 'project-1' }) },
      membership: {
        findUnique: vi.fn().mockResolvedValue({ role: 'REPORTER', status: 'ACTIVE' }),
      },
      report: { findMany },
    } as never);

    await service.listReports('user-1', 'project-1', {
      pageUrl: 'https://example.test/page?a=1',
    });

    expect(findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          captureBundle: {
            path: ['page', 'url'],
            equals: 'https://example.test/page?a=1',
          },
        }),
      }),
    );
  });
});
