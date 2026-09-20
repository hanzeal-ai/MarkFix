import { expect, it } from 'vitest';
import type { SavedCapture } from '@markfix/contracts';
import {
  previewAnnotations,
  projectAnnotations,
} from '../src/renderer/src/project-navigation/model';

const capture = (id: string, status: SavedCapture['status'], pageUrl: string): SavedCapture => ({
  page: {
    url: 'https://example.test',
    title: 'Fixture page',
    viewportWidthCssPx: 1200,
    viewportHeightCssPx: 800,
    deviceScaleFactor: 1,
    capturedAt: '2026-09-17T00:00:00.000Z',
  },
  capture: {
    mode: 'region',
    imageWidthPx: 1200,
    imageHeightPx: 800,
    widthCssPx: 1200,
    heightCssPx: 800,
    originCssPx: { x: 0, y: 0 },
    captureScale: 1,
    truncated: false,
  },
  id,
  status,
  pageUrl,
  projectId: 'project',
  pageSessionId: id,
  pageTitle: 'Page',
  note: 'Fix this',
  dataUrl: 'data:image/png;base64,AA==',
  sourceDataUrl: 'data:image/png;base64,AA==',
  widthCssPx: 100,
  heightCssPx: 100,
  captureScale: 1,
  marks: [],
  selection: {
    kind: 'region',
    xCssPx: 0,
    yCssPx: 0,
    widthCssPx: 100,
    heightCssPx: 100,
    documentUrl: pageUrl,
    scrollXCssPx: 0,
    scrollYCssPx: 0,
  },
  createdAt: '2026-09-17T00:00:00.000Z',
  updatedAt: '2026-09-17T00:00:00.000Z',
});

it('keeps project-wide drafts and rejections in preview without removing submitted history', () => {
  const draft = capture('draft', 'draft', 'https://example.test/a');
  const rejected = capture('rejected', 'rejected', 'https://example.test/b');
  const captures = [
    draft,
    rejected,
    capture('submitted', 'submitted', 'https://example.test/a'),
    { ...capture('other', 'draft', 'https://example.test/b'), projectId: 'other' },
  ];
  rejected.rejectionReason = '补充复现步骤';
  const history = projectAnnotations('project', [], captures, []);
  expect(previewAnnotations(history).map(({ record }) => record.id)).toEqual(['draft', 'rejected']);
  expect(
    previewAnnotations(history).find(({ record }) => record.id === rejected.id)?.record
      .rejectionReason,
  ).toBe('补充复现步骤');
  expect(history).toHaveLength(3);
  draft.status = 'submitted';
  rejected.status = 'submitted';
  expect(previewAnnotations(projectAnnotations('project', [], captures, []))).toEqual([]);
});
