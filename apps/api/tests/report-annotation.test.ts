import { describe, expect, it } from 'vitest';
import {
  annotationHistoryForReport,
  reportAnnotationReferenceCode,
} from '../src/commercial/report-annotation.js';

const sourceAnnotationId = '12345678-1234-4234-8234-123456789abc';

const currentBundle = {
  schemaVersion: 2,
  annotationKind: 'COMMENT',
  sourceAnnotationId,
  reproduction: [],
  page: {
    url: 'https://example.test',
    title: 'Example',
    viewportWidthCssPx: 1200,
    viewportHeightCssPx: 800,
    deviceScaleFactor: 1,
    capturedAt: '2026-09-07T08:00:00.000Z',
  },
};
const report = (overrides: Record<string, unknown> = {}) => ({
  id: sourceAnnotationId,
  projectId: crypto.randomUUID(),
  reporterId: 'reporter-1',
  reporter: { id: 'reporter-1', displayName: 'Lin', email: 'lin@example.test' },
  title: 'Annotation',
  description: 'Description',
  status: 'OPEN' as const,
  rejectionReason: null,
  captureBundle: currentBundle,
  screenshotPath: null,
  activities: [],
  createdAt: new Date('2026-09-07T08:00:00Z'),
  updatedAt: new Date('2026-09-07T08:00:00Z'),
  ...overrides,
});

const submission = (overrides: Record<string, unknown> = {}) => ({
  id: crypto.randomUUID(),
  payload: {
    projectId: crypto.randomUUID(),
    title: 'Annotation',
    priority: 'MEDIUM',
    description: 'Original note',
    captureBundle: currentBundle,
  },
  artifact: { id: 'original-image' },
  createdBy: { id: 'reporter-1', displayName: 'Lin', email: 'lin@example.test' },
  createdAt: new Date('2026-09-07T08:00:00Z'),
  ...overrides,
});

describe('commercial annotation identity and history', () => {
  it('derives a prefixed reference code from the report id', () => {
    expect(reportAnnotationReferenceCode(report())).toBe('#MF-12345678');
  });

  it('returns submission snapshots newest first with their own screenshot and note', () => {
    const current = report();
    const submissions = [
      submission(),
      submission({
        payload: {
          projectId: crypto.randomUUID(),
          title: 'Annotation',
          priority: 'MEDIUM',
          description: 'Revised note',
          captureBundle: currentBundle,
        },
        artifact: { id: 'revised-image' },
        createdAt: new Date('2026-09-07T10:00:00Z'),
      }),
    ];

    expect(annotationHistoryForReport(current, submissions)).toEqual([
      expect.objectContaining({
        action: 'RESUBMITTED',
        note: 'Revised note',
        screenshotUrl: '/v1/artifacts/revised-image',
      }),
      expect.objectContaining({
        action: 'SUBMITTED',
        note: 'Original note',
        screenshotUrl: '/v1/artifacts/original-image',
      }),
    ]);
  });

  it('combines submission and activity events in reverse chronological order', () => {
    const current = report({
      activities: [
        {
          id: 'created',
          type: 'REPORT_CREATED',
          payload: {},
          actor: { id: 'reporter-1', displayName: 'Lin', email: 'lin@example.test' },
          createdAt: new Date('2026-09-07T08:00:00Z'),
        },
        {
          id: 'rejected',
          type: 'ANNOTATION_REJECTED',
          payload: { reason: 'Please revise' },
          actor: { id: 'admin-1', displayName: 'Admin', email: 'admin@example.test' },
          createdAt: new Date('2026-09-07T09:00:00Z'),
        },
      ],
    });

    expect(annotationHistoryForReport(current, [submission()]).map(({ action }) => action)).toEqual(
      ['REJECTED', 'SUBMITTED'],
    );
  });
});

it('preserves AI pending-verification and human-review history', () => {
  const current = report({
    activities: [
      {
        id: 'repair',
        type: 'AGENT_FIX_SUCCEEDED',
        payload: { status: 'READY_FOR_VERIFY' },
        createdAt: new Date('2026-09-07T10:00:00Z'),
      },
      {
        id: 'review',
        type: 'REPORT_VERIFY',
        payload: { status: 'RESOLVED' },
        createdAt: new Date('2026-09-07T11:00:00Z'),
      },
    ],
  });
  expect(annotationHistoryForReport(current, []).map((item) => item.status)).toEqual([
    'RESOLVED',
    'READY_FOR_VERIFY',
  ]);
});

it('projects repair rejection reasons without replacing the original annotation', () => {
  const current = report({
    activities: [
      {
        id: 'review-reject',
        type: 'REPORT_REJECT',
        payload: { status: 'OPEN', reason: 'Mobile submit button remains obscured' },
        createdAt: new Date('2026-09-07T12:00:00Z'),
      },
    ],
  });
  const history = annotationHistoryForReport(current, [submission()]);
  expect(history[0]).toMatchObject({
    status: 'OPEN',
    reason: 'Mobile submit button remains obscured',
    note: null,
  });
  expect(history[1]).toMatchObject({ note: 'Original note', reason: null });
  expect(current.description).toBe('Description');
});
