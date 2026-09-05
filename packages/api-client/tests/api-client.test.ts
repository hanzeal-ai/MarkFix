import { afterEach, describe, expect, it, vi } from 'vitest';
import { MarkFixApi } from '../src/index.js';

afterEach(() => vi.unstubAllGlobals());

describe('MarkFixApi request coordination', () => {
  it('shares one refresh request across concurrent 401 responses', async () => {
    let refreshCalls = 0;
    let resourceCalls = 0;
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: string | URL | Request) => {
        const url = String(input);
        if (url.endsWith('/v1/auth/refresh')) {
          refreshCalls += 1;
          return Response.json({
            accessToken: 'next',
            refreshToken: 'next-refresh',
            expiresIn: 900,
          });
        }
        resourceCalls += 1;
        return resourceCalls <= 2
          ? Response.json({ message: 'expired' }, { status: 401 })
          : Response.json({ ok: true });
      }),
    );
    const api = new MarkFixApi('https://api.example.test');
    api.setTokens({ accessToken: 'expired', refreshToken: 'refresh' });

    const results = await Promise.all([
      api.requestJson<{ ok: boolean }>('/v1/one'),
      api.requestJson<{ ok: boolean }>('/v1/two'),
    ]);

    expect(results).toEqual([{ ok: true }, { ok: true }]);
    expect(refreshCalls).toBe(1);
    expect(resourceCalls).toBe(4);
  });

  it('finalizes a report without creating a screenshot artifact when no image is present', async () => {
    const projectId = '90e2a0c5-0755-49b9-9d5d-41534ed41b41';
    const submissionId = '60bba625-07f2-40f6-8eef-1ddb681f8513';
    const reportId = '49bbad52-952f-4c45-96e9-5020106f9324';
    const capturedAt = '2026-09-05T08:00:00.000Z';
    const fetchMock = vi.fn(async (input: string | URL | Request) => {
      const url = String(input);
      if (url.endsWith('/report-submissions')) return Response.json({ id: submissionId });
      if (url.endsWith(`/${submissionId}/finalize`)) return Response.json({
        id: reportId,
        projectId,
        environmentId: null,
        title: 'Element note',
        description: 'Fix this element',
        priority: 'MEDIUM',
        status: 'OPEN',
        version: 1,
        captureBundle: {
          schemaVersion: 1,
          page: {
            url: 'https://example.test', title: 'Example', viewportWidthCssPx: 1,
            viewportHeightCssPx: 1, deviceScaleFactor: 1, capturedAt,
          },
          annotationKind: 'ELEMENT', annotations: [], reproduction: [],
        },
        createdAt: capturedAt,
        updatedAt: capturedAt,
      });
      return Response.json({ message: 'unexpected request' }, { status: 500 });
    });
    vi.stubGlobal('fetch', fetchMock);
    const api = new MarkFixApi('https://api.example.test');

    const result = await api.submitReport({
      projectId,
      title: 'Element note',
      description: 'Fix this element',
      priority: 'MEDIUM',
      captureBundle: {
        schemaVersion: 1,
        page: {
          url: 'https://example.test', title: 'Example', viewportWidthCssPx: 1,
          viewportHeightCssPx: 1, deviceScaleFactor: 1, capturedAt,
        },
        annotationKind: 'ELEMENT', annotations: [], reproduction: [],
      },
    }, 'stable-local-id');

    expect(result.id).toBe(reportId);
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(fetchMock.mock.calls.map(([input]) => String(input))).not.toContain(
      expect.stringContaining('/artifacts/presign'),
    );
  });
});
