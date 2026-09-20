import { afterEach, describe, expect, it, vi } from 'vitest';
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
  screenshotPath: null,
  captureBundle: {
    schemaVersion: 2,
    annotationKind: 'ELEMENT',
    page: {
      url: 'https://example.test/pricing',
      title: 'Pricing',
      viewportWidthCssPx: 1200,
      viewportHeightCssPx: 800,
      deviceScaleFactor: 1,
      capturedAt: '2026-09-05T00:00:00.000Z',
    },
    reproduction: [],
  },
  createdAt: new Date('2026-09-05T00:00:00.000Z'),
  updatedAt: new Date('2026-09-05T01:00:00.000Z'),
  ...overrides,
});

const managerDatabase = (ownerId: string, projectId: string) => ({
  membership: { findUnique: vi.fn().mockResolvedValue(managerMembership) },
  project: { findUnique: vi.fn().mockResolvedValue({ id: projectId, ownerId }) },
  reportSubmission: { findMany: vi.fn().mockResolvedValue([]) },
});

afterEach(() => {
  delete process.env.MARKFIX_DEMO_PASSWORD;
});

describe('commercial annotation management', () => {
  it('derives overview metrics from Report only', async () => {
    const ownerId = crypto.randomUUID();
    const userId = crypto.randomUUID();
    const project = {
      id: crypto.randomUUID(),
      ownerId,
      name: 'Marketing site',
      baseUrl: 'https://example.test',
      category: '品牌官网',
      memberships: [{ role: 'ADMIN' }],
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    const service = new CommercialService({
      membership: {
        findUnique: vi.fn().mockResolvedValue(managerMembership),
        findMany: vi.fn().mockResolvedValue([
          {
            role: 'ADMIN',
            userId,
            projectId: project.id,
            user: { id: userId, displayName: 'Lin', email: 'lin@example.test' },
          },
        ]),
      },
      project: { findMany: vi.fn().mockResolvedValue([project]) },
      report: {
        findMany: vi.fn().mockResolvedValue([
          report({ projectId: project.id, reporterId: userId }),
          report({
            projectId: project.id,
            reporterId: userId,
            status: 'CLOSED',
            rejectionReason: 'Not planned',
            updatedAt: new Date('2026-09-05T02:00:00Z'),
          }),
        ]),
      },
    } as never);

    const result = await service.overview(userId);

    expect(result.metrics).toEqual({ projects: 1, annotations: 2, pending: 1, rejected: 1 });
    expect(result.projects[0]).toEqual(
      expect.objectContaining({ annotationCount: 2, pendingCount: 1, rejectedCount: 1 }),
    );
    expect(result.users[0]?.projectCategories).toEqual([{ category: '品牌官网', count: 2 }]);
  });

  it('lists, filters and paginates Report projections', async () => {
    const ownerId = crypto.randomUUID();
    const projectId = crypto.randomUUID();
    const sources = [
      report({ projectId, title: 'First match', updatedAt: new Date('2026-09-05T02:00:00Z') }),
      report({
        projectId,
        title: 'Rejected match',
        status: 'CLOSED',
        rejectionReason: 'No',
        updatedAt: new Date('2026-09-05T03:00:00Z'),
      }),
    ];
    const service = new CommercialService({
      ...managerDatabase(ownerId, projectId),
      report: { findMany: vi.fn().mockResolvedValue(sources) },
    } as never);

    const result = await service.annotations('admin-1', projectId, {
      status: 'REJECTED',
      query: 'match',
      page: '1',
      pageSize: '1',
    });

    expect(result).toEqual({
      items: [expect.objectContaining({ id: sources[1]?.id })],
      total: 1,
      page: 1,
      pageSize: 1,
    });
    await expect(service.annotations('admin-1', projectId, { pageSize: '101' })).rejects.toThrow();
  });

  it('returns resubmissions as one annotation with stable history and reference code', async () => {
    const ownerId = crypto.randomUUID();
    const projectId = crypto.randomUUID();
    const sourceAnnotationId = crypto.randomUUID();
    const captureBundle = {
      sourceAnnotationId,
      schemaVersion: 2,
      reproduction: [],
      page: {
        url: 'https://example.test/pricing',
        title: 'Pricing',
        viewportWidthCssPx: 1200,
        viewportHeightCssPx: 800,
        deviceScaleFactor: 1,
        capturedAt: '2026-09-05T00:00:00.000Z',
      },
      annotationKind: 'SCREENSHOT',
    };
    const current = report({
      id: sourceAnnotationId,
      projectId,
      captureBundle,
      title: 'Revised annotation',
      activities: [
        {
          id: 'rejected',
          type: 'ANNOTATION_REJECTED',
          payload: { reason: 'Please revise' },
          actor: { id: 'admin-1', displayName: 'Admin', email: 'admin@example.test' },
          createdAt: new Date('2026-09-07T09:00:00Z'),
        },
      ],
      updatedAt: new Date('2026-09-07T10:00:00Z'),
    });
    const submissions = [
      {
        id: crypto.randomUUID(),
        payload: {
          projectId,
          title: 'Pricing annotation',
          priority: 'MEDIUM',
          description: 'Original note',
          captureBundle,
        },
        artifact: { id: 'original-image' },
        createdBy: current.reporter,
        createdAt: current.createdAt,
      },
      {
        id: crypto.randomUUID(),
        payload: {
          projectId,
          title: 'Pricing annotation',
          priority: 'MEDIUM',
          description: 'Revised note',
          captureBundle,
        },
        artifact: { id: 'revised-image' },
        createdBy: current.reporter,
        createdAt: new Date('2026-09-07T10:00:00Z'),
      },
    ];
    const service = new CommercialService({
      ...managerDatabase(ownerId, projectId),
      report: { findMany: vi.fn().mockResolvedValue([current]) },
      reportSubmission: { findMany: vi.fn().mockResolvedValue(submissions) },
    } as never);

    const result = await service.annotations('admin-1', projectId);

    expect(result.total).toBe(1);
    expect(result.items[0]).toEqual(
      expect.objectContaining({
        id: current.id,
        referenceCode: `#MF-${sourceAnnotationId.replaceAll('-', '').slice(0, 8).toUpperCase()}`,
        title: 'Revised annotation',
        history: [
          expect.objectContaining({
            action: 'RESUBMITTED',
            status: 'OPEN',
            note: 'Revised note',
            screenshotUrl: '/v1/artifacts/revised-image',
          }),
          expect.objectContaining({ action: 'REJECTED', status: 'REJECTED' }),
          expect.objectContaining({
            action: 'SUBMITTED',
            status: 'OPEN',
            note: 'Original note',
            screenshotUrl: '/v1/artifacts/original-image',
          }),
        ],
      }),
    );
  });

  it('exposes an authenticated artifact URL for screenshot reports', async () => {
    const ownerId = crypto.randomUUID();
    const projectId = crypto.randomUUID();
    const screenshotPath = crypto.randomUUID();
    const source = report({ projectId, screenshotPath });
    const service = new CommercialService({
      ...managerDatabase(ownerId, projectId),
      report: { findMany: vi.fn().mockResolvedValue([source]) },
    } as never);

    const result = await service.annotations('admin-1', projectId);

    expect(result.items[0]).toEqual(
      expect.objectContaining({ screenshotUrl: `/v1/artifacts/${screenshotPath}` }),
    );
  });

  it('creates admin annotations as Report records', async () => {
    const ownerId = crypto.randomUUID();
    const projectId = crypto.randomUUID();
    const created = report({ projectId });
    const transaction = {
      reportSubmission: { create: vi.fn().mockResolvedValue({}) },
      report: { create: vi.fn().mockResolvedValue(created) },
    };
    const service = new CommercialService({
      ...managerDatabase(ownerId, projectId),
      $transaction: vi.fn((callback) => callback(transaction)),
    } as never);

    const result = await service.createAnnotation('admin-1', projectId, {
      title: created.title,
      note: created.description,
      kind: 'ELEMENT',
      pageUrl: 'https://example.test/pricing',
    });

    expect(transaction.reportSubmission.create).toHaveBeenCalledOnce();
    expect(transaction.report.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ projectId, description: created.description }),
      }),
    );
    expect(result).toEqual(expect.objectContaining({ id: created.id, kind: 'ELEMENT' }));
  });

  it('updates Report fields and capture metadata directly', async () => {
    const ownerId = crypto.randomUUID();
    const projectId = crypto.randomUUID();
    const source = report({ projectId });
    const updated = report({ ...source, title: 'Updated title', status: 'RESOLVED' });
    const update = vi.fn().mockResolvedValue(updated);
    const service = new CommercialService({
      ...managerDatabase(ownerId, projectId),
      report: { findUnique: vi.fn().mockResolvedValue(source), update },
    } as never);

    const result = await service.updateAnnotation('admin-1', source.id, {
      title: 'Updated title',
      status: 'RESOLVED',
      pageUrl: 'https://example.test/updated',
    });

    expect(update).toHaveBeenCalledWith({
      where: { id: source.id },
      data: expect.objectContaining({
        title: 'Updated title',
        status: 'RESOLVED',
        version: { increment: 1 },
      }),
      include: { reporter: { select: { id: true, displayName: true, email: true } } },
    });
    expect(result.status).toBe('RESOLVED');
  });

  it('rejects Report records without maintaining a second annotation source', async () => {
    const ownerId = crypto.randomUUID();
    const projectId = crypto.randomUUID();
    const source = report({ projectId });
    const update = vi
      .fn()
      .mockResolvedValue(
        report({ ...source, status: 'CLOSED', rejectionReason: 'Not part of this release' }),
      );
    const service = new CommercialService({
      ...managerDatabase(ownerId, projectId),
      report: { findUnique: vi.fn().mockResolvedValue(source), update },
    } as never);

    const result = await service.rejectAnnotation('admin-1', source.id, {
      reason: 'Not part of this release',
    });

    expect(update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: {
          status: 'CLOSED',
          rejectionReason: 'Not part of this release',
          version: { increment: 1 },
          activities: {
            create: {
              type: 'ANNOTATION_REJECTED',
              actorId: 'admin-1',
              payload: { reason: 'Not part of this release' },
            },
          },
        },
      }),
    );
    expect(result.status).toBe('REJECTED');
  });

  it('does not migrate data during normal application startup', async () => {
    const database = { $transaction: vi.fn() };
    const service = new CommercialService(database as never);
    vi.stubEnv('MARKFIX_DEMO_PASSWORD', '');
    try {
      await service.onApplicationBootstrap();
      expect(database.$transaction).not.toHaveBeenCalled();
    } finally {
      vi.unstubAllEnvs();
    }
  });
});
