import { describe, expect, it } from 'vitest';
import type { Report } from '@markfix/contracts';
import {
  latestReportRejections,
  rejectedRecordUpdates,
} from '../src/renderer/src/report-reconciliation';

const sourceId = '49bbad52-952f-4c45-96e9-5020106f9324';

const report = (input: Partial<Report> & Pick<Report, 'id' | 'createdAt'>): Report => ({
  projectId: '90e2a0c5-0755-49b9-9d5d-41534ed41b41',
  environmentId: null,
  title: 'Layout issue',
  description: 'Description',
  priority: 'MEDIUM',
  status: 'CLOSED',
  version: 1,
  updatedAt: input.createdAt,
  captureBundle: {
    annotationKind: 'COMMENT',
    schemaVersion: 2,
    sourceAnnotationId: sourceId,
    page: {
      url: 'https://example.com',
      title: 'Example',
      viewportWidthCssPx: 1000,
      viewportHeightCssPx: 500,
      deviceScaleFactor: 2,
      capturedAt: input.createdAt,
    },

    reproduction: [],
  },
  ...input,
});

describe('report rejection reconciliation', () => {
  it('returns the rejection for the latest submission attempt', () => {
    const rejected = report({
      id: '86c28bc3-a8a0-40df-a4b6-c7f71823d41a',
      createdAt: '2026-09-07T08:00:00.000Z',
      rejectionReason: '请补充复现步骤',
    });

    expect(latestReportRejections([rejected]).get(sourceId)).toEqual({
      reason: '请补充复现步骤',
      updatedAt: rejected.updatedAt,
    });
  });

  it('does not resurrect an older rejection after a newer resubmission', () => {
    const rejected = report({
      id: '86c28bc3-a8a0-40df-a4b6-c7f71823d41a',
      createdAt: '2026-09-07T08:00:00.000Z',
      rejectionReason: '请补充复现步骤',
    });
    const resubmitted = report({
      id: '5ec6f949-6cbc-4bd7-9985-5791b8b9ee2b',
      createdAt: '2026-09-07T09:00:00.000Z',
      status: 'OPEN',
      rejectionReason: null,
    });

    expect(latestReportRejections([rejected, resubmitted]).size).toBe(0);
  });

  it('turns only submitted local records into rejected records', () => {
    const rejections = new Map([
      [sourceId, { reason: '请补充复现步骤', updatedAt: '2026-09-07T08:30:00.000Z' }],
    ]);
    const submitted = {
      id: sourceId,
      status: 'submitted' as const,
      updatedAt: '2026-09-07T08:00:00.000Z',
    };
    const draft = {
      id: sourceId,
      status: 'draft' as const,
      updatedAt: '2026-09-07T09:00:00.000Z',
    };

    expect(rejectedRecordUpdates([submitted], rejections)).toEqual([
      {
        ...submitted,
        status: 'rejected',
        rejectionReason: '请补充复现步骤',
        updatedAt: '2026-09-07T08:30:00.000Z',
      },
    ]);
    expect(rejectedRecordUpdates([draft], rejections)).toEqual([]);
  });

  it('ignores an old rejection after the local annotation was edited for resubmission', () => {
    const rejections = new Map([
      [sourceId, { reason: '旧的驳回原因', updatedAt: '2026-09-07T08:30:00.000Z' }],
    ]);
    const resubmitted = {
      id: sourceId,
      status: 'submitted' as const,
      updatedAt: '2026-09-07T09:00:00.000Z',
    };

    expect(rejectedRecordUpdates([resubmitted], rejections)).toEqual([]);
  });
});
