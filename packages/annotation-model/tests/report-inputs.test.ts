import { describe, expect, it } from 'vitest';
import { annotationSelectionReportInputs } from '@markfix/annotation-model';

const projectId = '90e2a0c5-0755-49b9-9d5d-41534ed41b41';
const pageSessionId = '60bba625-07f2-40f6-8eef-1ddb681f8513';
const createdAt = '2026-09-05T08:00:00.000Z';
const context = {
  projectId,
  pageSessionId,
  pageUrl: 'https://example.test/page',
  pageTitle: 'Example',
  status: 'draft' as const,
  createdAt,
  updatedAt: createdAt,
};

describe('annotationSelectionReportInputs', () => {
  it('creates one stable report input for every selected local annotation kind', () => {
    const elementId = '49bbad52-952f-4c45-96e9-5020106f9324';
    const captureId = '86c28bc3-a8a0-40df-a4b6-c7f71823d41a';
    const diagnosticId = '17ce2cf1-692b-4c46-84fb-9384fb025381';

    const inputs = annotationSelectionReportInputs(projectId, {
      elementComments: [
        {
          ...context,
          id: elementId,
          note: 'Element note',
          screenshotDataUrl: 'data:image/png;base64,YQ==',
          capture: {
            mode: 'element',
            imageWidthPx: 400,
            imageHeightPx: 120,
            widthCssPx: 200,
            heightCssPx: 60,
            originCssPx: { x: 10, y: 20 },
            captureScale: 2,
            truncated: false,
          },
          anchor: {
            kind: 'element',
            cssSelector: '#headline',
            textQuote: 'Headline',
            tagName: 'h1',
            attributes: { id: 'headline' },
            documentUrl: context.pageUrl,
            framePath: [],
            quadsCssPx: [[10, 20, 210, 20, 210, 80, 10, 80]],
            runtimeEvidence: {
              schemaVersion: 1,
              selectorCandidates: ['#headline'],
              classNames: ['headline'],
              ancestorPath: [
                {
                  tagName: 'h1',
                  selectorSegment: 'h1#headline',
                  attributes: { id: 'headline' },
                },
              ],
              nearbyText: ['Welcome'],
              pageBuild: {
                scripts: [
                  {
                    url: 'https://example.test/app.js',
                    sourceMapUrl: 'https://example.test/app.js.map',
                  },
                ],
                stylesheets: [],
                sourceMapHints: ['https://example.test/app.js.map'],
                metadata: {},
                frameworkHints: ['react'],
              },
            },
          },
        },
      ],
      captures: [
        {
          ...context,
          id: captureId,
          note: 'Screenshot note',
          dataUrl: 'data:image/png;base64,YQ==',
          sourceDataUrl: 'data:image/png;base64,YQ==',
          widthCssPx: 100,
          heightCssPx: 80,
          captureScale: 2,
          page: {
            url: context.pageUrl,
            title: context.pageTitle,
            viewportWidthCssPx: 1440,
            viewportHeightCssPx: 900,
            deviceScaleFactor: 1.25,
            capturedAt: createdAt,
          },
          capture: {
            mode: 'region',
            imageWidthPx: 200,
            imageHeightPx: 160,
            widthCssPx: 100,
            heightCssPx: 80,
            originCssPx: { x: 10, y: 20 },
            captureScale: 2,
            truncated: false,
          },
          marks: [],
          selection: {
            kind: 'region',
            xCssPx: 10,
            yCssPx: 20,
            widthCssPx: 100,
            heightCssPx: 80,
            documentUrl: context.pageUrl,
            scrollXCssPx: 0,
            scrollYCssPx: 0,
          },
        },
      ],
      diagnostics: [
        {
          ...context,
          id: diagnosticId,
          evidence: {
            id: diagnosticId,
            kind: 'console',
            level: 'error',
            title: 'Console error',
            message: 'Something failed',
            timestamp: createdAt,
            pageUrl: context.pageUrl,
            redactions: [],
          },
        },
      ],
    });

    expect(inputs.map(({ idempotencyKey }) => idempotencyKey)).toEqual([
      `${elementId}@${createdAt}`,
      `${captureId}@${createdAt}`,
      `${diagnosticId}@${createdAt}`,
    ]);
    expect(inputs.map(({ report }) => report.captureBundle.annotationKind)).toEqual([
      'ELEMENT',
      'SCREENSHOT',
      'COMMENT',
    ]);
    expect(inputs.map(({ report }) => report.captureBundle.sourceAnnotationId)).toEqual([
      elementId,
      captureId,
      diagnosticId,
    ]);
    expect(inputs[0]?.report.screenshotDataUrl).toBe('data:image/png;base64,YQ==');
    expect(
      inputs[0]?.report.captureBundle.anchor?.kind === 'element'
        ? inputs[0].report.captureBundle.anchor.runtimeEvidence?.pageBuild.sourceMapHints
        : undefined,
    ).toEqual(['https://example.test/app.js.map']);
    expect(inputs[0]?.report.captureBundle.capture?.mode).toBe('element');
    expect(inputs[1]?.report.screenshotDataUrl).toBe('data:image/png;base64,YQ==');
    expect(inputs[1]?.report.captureBundle.page).toEqual({
      url: context.pageUrl,
      title: context.pageTitle,
      viewportWidthCssPx: 1440,
      viewportHeightCssPx: 900,
      deviceScaleFactor: 1.25,
      capturedAt: createdAt,
    });
    expect(inputs[1]?.report.captureBundle.capture).toEqual({
      mode: 'region',
      imageWidthPx: 200,
      imageHeightPx: 160,
      widthCssPx: 100,
      heightCssPx: 80,
      originCssPx: { x: 10, y: 20 },
      captureScale: 2,
      truncated: false,
    });
    expect(inputs[2]?.report.captureBundle.anchor).toBeUndefined();
  });

  it('uses explicit viewport and capture metadata rather than the crop size', () => {
    const [input] = annotationSelectionReportInputs(projectId, {
      elementComments: [],
      captures: [
        {
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
          ...context,
          id: '86c28bc3-a8a0-40df-a4b6-c7f71823d41a',
          note: 'Current screenshot',
          dataUrl: 'data:image/png;base64,YQ==',
          sourceDataUrl: 'data:image/png;base64,YQ==',
          widthCssPx: 100,
          heightCssPx: 80,
          captureScale: 2,
          marks: [],
          selection: {
            kind: 'region',
            xCssPx: 10,
            yCssPx: 20,
            widthCssPx: 100,
            heightCssPx: 80,
            documentUrl: context.pageUrl,
            scrollXCssPx: 0,
            scrollYCssPx: 0,
          },
        },
      ],
      diagnostics: [],
    });

    expect(input?.report.captureBundle.page.viewportWidthCssPx).toBe(1200);
    expect(input?.report.captureBundle.page.viewportHeightCssPx).toBe(800);
    expect(input?.report.captureBundle.page.deviceScaleFactor).toBe(1);
    expect(input?.report.captureBundle.capture?.mode).toBe('region');
  });
});
