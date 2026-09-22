import { previewAnnotationPins } from '../src/renderer/src/preview-annotation-pins';
import { expect, it } from 'vitest';
import type {
  SavedCapture,
  SavedElementComment,
  SavedDiagnosticAnnotation,
} from '@markfix/contracts';
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
  expect(
    previewAnnotationPins(previewAnnotations(history)).captures.map(({ id, previewNumber }) => ({
      id,
      previewNumber,
    })),
  ).toEqual([
    { id: 'draft', previewNumber: 1 },
    { id: 'rejected', previewNumber: 2 },
  ]);
  draft.status = 'submitted';
  rejected.status = 'submitted';
  expect(
    previewAnnotationPins(previewAnnotations(projectAnnotations('project', [], captures, []))),
  ).toEqual({ elementComments: [], captures: [] });
});

it('preserves preview numbering across annotation types and pages', () => {
  const pins = previewAnnotationPins([
    { type: 'capture', record: capture('capture', 'draft', 'https://example.test/a') },
    { type: 'diagnostic', record: { id: 'diagnostic' } as SavedDiagnosticAnnotation },
    {
      type: 'element',
      record: { id: 'element', pageUrl: 'https://example.test/b' } as SavedElementComment,
    },
    { type: 'capture', record: capture('other-page', 'rejected', 'https://example.test/b') },
  ]);
  expect(pins.elementComments.map(({ id, previewNumber }) => [id, previewNumber])).toEqual([
    ['element', 3],
  ]);
  expect(pins.captures.map(({ id, previewNumber }) => [id, previewNumber])).toEqual([
    ['capture', 1],
    ['other-page', 4],
  ]);
});
