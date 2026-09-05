import { describe, expect, it } from 'vitest';
import { annotationSelectionReportInputs } from '../src/renderer/src/annotation-submission/report-inputs';

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
      elementComments: [{
        ...context,
        id: elementId,
        note: 'Element note',
        anchor: {
          kind: 'element',
          cssSelector: '#headline',
          textQuote: 'Headline',
          tagName: 'h1',
          attributes: { id: 'headline' },
          documentUrl: context.pageUrl,
          framePath: [],
          quadsCssPx: [[10, 20, 210, 20, 210, 80, 10, 80]],
        },
      }],
      captures: [{
        ...context,
        id: captureId,
        note: 'Screenshot note',
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
      }],
      diagnostics: [{
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
      }],
    });

    expect(inputs.map(({ idempotencyKey }) => idempotencyKey)).toEqual([
      elementId,
      captureId,
      diagnosticId,
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
    expect(inputs[0]?.report.screenshotDataUrl).toBeUndefined();
    expect(inputs[1]?.report.screenshotDataUrl).toBe('data:image/png;base64,YQ==');
    expect(inputs[2]?.report.captureBundle.anchor).toBeUndefined();
  });
});
