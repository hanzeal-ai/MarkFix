import { describe, expect, it } from 'vitest';
import type { Report } from '@markfix/contracts';
import { projectReportOverlays } from '../src/renderer/src/project-report-overlays';

const projectId = '90e2a0c5-0755-49b9-9d5d-41534ed41b41';
const pageSessionId = '60bba625-07f2-40f6-8eef-1ddb681f8513';
const createdAt = '2026-09-05T08:00:00.000Z';

const report = (input: Partial<Report> & Pick<Report, 'id' | 'captureBundle'>): Report => ({
  projectId,
  environmentId: null,
  title: 'Layout issue',
  description: 'The headline needs more room.',
  priority: 'MEDIUM',
  status: 'OPEN',
  version: 1,
  screenshotUrl: 'http://localhost:4310/v1/artifacts/example',
  createdAt,
  updatedAt: createdAt,
  ...input,
});

describe('projectReportOverlays', () => {
  it('replays server drawing annotations only on their exact project page', () => {
    const annotationId = '49bbad52-952f-4c45-96e9-5020106f9324';
    const item = report({
      id: '5ec6f949-6cbc-4bd7-9985-5791b8b9ee2b',
      captureBundle: {
        schemaVersion: 1,
        page: {
          url: 'https://example.com/dashboard',
          title: 'Dashboard',
          viewportWidthCssPx: 1440,
          viewportHeightCssPx: 900,
          deviceScaleFactor: 2,
          capturedAt: createdAt,
        },
        anchor: {
          kind: 'region',
          xCssPx: 20,
          yCssPx: 30,
          widthCssPx: 100,
          heightCssPx: 80,
          documentUrl: 'https://example.com/dashboard',
          scrollXCssPx: 0,
          scrollYCssPx: 0,
        },
        annotations: [
          {
            id: annotationId,
            type: 'rectangle',
            color: '#ef4444',
            start: { x: 20, y: 30 },
            end: { x: 120, y: 110 },
            createdAt,
          },
        ],
        reproduction: [],
      },
    });

    expect(
      projectReportOverlays([item], projectId, pageSessionId, 'https://example.com/dashboard')
        .annotations,
    ).toEqual(item.captureBundle.annotations);
    expect(
      projectReportOverlays([item], projectId, pageSessionId, 'https://example.com/other')
        .annotations,
    ).toEqual([]);
    expect(projectReportOverlays([item], projectId, pageSessionId, 'example').annotations).toEqual(
      [],
    );
  });

  it('turns a server element anchor into a replay marker', () => {
    const item = report({
      id: '86c28bc3-a8a0-40df-a4b6-c7f71823d41a',
      captureBundle: {
        schemaVersion: 1,
        sourceAnnotationId: '49bbad52-952f-4c45-96e9-5020106f9324',
        page: {
          url: 'https://example.com/',
          title: 'Example',
          viewportWidthCssPx: 1440,
          viewportHeightCssPx: 900,
          deviceScaleFactor: 2,
          capturedAt: createdAt,
        },
        anchor: {
          kind: 'element',
          cssSelector: '[id="headline"]',
          textQuote: 'A headline',
          tagName: 'h1',
          attributes: { id: 'headline' },
          documentUrl: 'https://example.com/',
          framePath: [],
          quadsCssPx: [[10, 20, 210, 20, 210, 80, 10, 80]],
        },
        annotations: [],
        reproduction: [],
      },
    });

    const overlays = projectReportOverlays([item], projectId, pageSessionId, 'https://example.com');
    expect(overlays.elementComments).toHaveLength(1);
    expect(overlays.elementComments[0]).toMatchObject({
      id: '49bbad52-952f-4c45-96e9-5020106f9324',
      projectId,
      pageSessionId,
      pageUrl: 'https://example.com/',
      note: item.description,
      status: 'submitted',
    });
  });

  it('draws the selected region when a server report has no drawing annotations', () => {
    const item = report({
      id: 'ac1bdf61-542e-4609-93fb-f4fa28b0544c',
      captureBundle: {
        schemaVersion: 1,
        page: {
          url: 'https://example.com/',
          title: 'Example',
          viewportWidthCssPx: 1440,
          viewportHeightCssPx: 900,
          deviceScaleFactor: 2,
          capturedAt: createdAt,
        },
        anchor: {
          kind: 'region',
          xCssPx: 20,
          yCssPx: 30,
          widthCssPx: 100,
          heightCssPx: 80,
          documentUrl: 'https://example.com/',
          scrollXCssPx: 0,
          scrollYCssPx: 0,
        },
        annotations: [],
        reproduction: [],
      },
    });

    expect(
      projectReportOverlays([item], projectId, pageSessionId, 'https://example.com').annotations,
    ).toEqual([expect.objectContaining({ id: item.id, type: 'rectangle', color: '#5b52e8' })]);
  });
});
