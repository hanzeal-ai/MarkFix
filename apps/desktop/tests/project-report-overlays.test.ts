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
  it('turns a server element anchor into a replay marker', () => {
    const item = report({
      id: '86c28bc3-a8a0-40df-a4b6-c7f71823d41a',
      captureBundle: {
        annotationKind: 'ELEMENT',
        schemaVersion: 2,
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
          runtimeEvidence: {
            schemaVersion: 1,
            selectorCandidates: [],
            classNames: [],
            ancestorPath: [],
            nearbyText: [],
            pageBuild: {
              scripts: [],
              stylesheets: [],
              sourceMapHints: [],
              metadata: {},
              frameworkHints: [],
            },
          },
          kind: 'element',
          cssSelector: '[id="headline"]',
          textQuote: 'A headline',
          tagName: 'h1',
          attributes: { id: 'headline' },
          documentUrl: 'https://example.com/',
          framePath: [],
          quadsCssPx: [[10, 20, 210, 20, 210, 80, 10, 80]],
        },

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

  it('replays a rejected element with its rejection reason', () => {
    const item = report({
      id: '86c28bc3-a8a0-40df-a4b6-c7f71823d41a',
      rejectionReason: '请补充复现步骤',
      captureBundle: {
        annotationKind: 'ELEMENT',
        schemaVersion: 2,
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
          runtimeEvidence: {
            schemaVersion: 1,
            selectorCandidates: [],
            classNames: [],
            ancestorPath: [],
            nearbyText: [],
            pageBuild: {
              scripts: [],
              stylesheets: [],
              sourceMapHints: [],
              metadata: {},
              frameworkHints: [],
            },
          },
          kind: 'element',
          cssSelector: '[id="headline"]',
          textQuote: 'A headline',
          tagName: 'h1',
          attributes: { id: 'headline' },
          documentUrl: 'https://example.com/',
          framePath: [],
          quadsCssPx: [[10, 20, 210, 20, 210, 80, 10, 80]],
        },

        reproduction: [],
      },
    });

    expect(
      projectReportOverlays([item], projectId, pageSessionId, 'https://example.com')
        .elementComments[0],
    ).toMatchObject({ status: 'rejected', rejectionReason: '请补充复现步骤' });
  });
});
