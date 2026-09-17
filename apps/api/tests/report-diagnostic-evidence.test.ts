import { describe, expect, it } from 'vitest';
import { diagnosticEvidenceSchema } from '@markfix/contracts';
import { reportToCommercialAnnotation } from '../src/commercial/report-annotation.js';

describe('commercial annotation diagnostic details', () => {
  it('returns uploaded request and response contents for annotation viewing and editing', () => {
    const evidence = diagnosticEvidenceSchema.parse({
      id: crypto.randomUUID(),
      kind: 'network',
      level: 'warning',
      timestamp: new Date().toISOString(),
      pageUrl: 'https://example.test/page',
      title: 'POST /api/save',
      message: '403 Forbidden',
      request: {
        method: 'POST',
        url: 'https://example.test/api/save',
        body: '{"id":42}',
        bodyState: 'captured',
        status: 403,
      },
      response: { body: '{"message":"Access denied"}', bodyState: 'captured' },
    });
    const result = reportToCommercialAnnotation({
      id: crypto.randomUUID(),
      projectId: crypto.randomUUID(),
      reporterId: null,
      title: 'No permission',
      description: 'Request fails',
      status: 'OPEN',
      rejectionReason: null,
      captureBundle: { page: { url: evidence.pageUrl }, evidence: [evidence] },
      createdAt: new Date(),
      updatedAt: new Date(),
    });
    expect(result.evidence).toEqual([evidence]);
  });
});
