import { afterEach, describe, expect, it, vi } from 'vitest';
import { MarkFixApi } from '../src/index.js';

afterEach(() => vi.unstubAllGlobals());

describe('MarkFixApi request coordination', () => {
  it('requests only reports for the active page when building overlays', async () => {
    const fetchMock = vi.fn(async () => Response.json({ items: [] }));
    vi.stubGlobal('fetch', fetchMock);
    const api = new MarkFixApi('https://api.example.test');

    await api.listAllReports('project-1', { pageUrl: 'https://example.test/path?a=1' });

    expect(String(fetchMock.mock.calls[0]?.[0])).toContain(
      'pageUrl=https%3A%2F%2Fexample.test%2Fpath%3Fa%3D1',
    );
  });

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
      if (url.endsWith(`/${submissionId}/finalize`))
        return Response.json({
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
              url: 'https://example.test',
              title: 'Example',
              viewportWidthCssPx: 1,
              viewportHeightCssPx: 1,
              deviceScaleFactor: 1,
              capturedAt,
            },
            annotationKind: 'ELEMENT',
            annotations: [],
            reproduction: [],
          },
          createdAt: capturedAt,
          updatedAt: capturedAt,
        });
      return Response.json({ message: 'unexpected request' }, { status: 500 });
    });
    vi.stubGlobal('fetch', fetchMock);
    const api = new MarkFixApi('https://api.example.test');

    const result = await api.submitReport(
      {
        projectId,
        title: 'Element note',
        description: 'Fix this element',
        priority: 'MEDIUM',
        captureBundle: {
          schemaVersion: 1,
          page: {
            url: 'https://example.test',
            title: 'Example',
            viewportWidthCssPx: 1,
            viewportHeightCssPx: 1,
            deviceScaleFactor: 1,
            capturedAt,
          },
          annotationKind: 'ELEMENT',
          annotations: [],
          reproduction: [],
        },
      },
      'stable-local-id',
    );

    expect(result.id).toBe(reportId);
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(fetchMock.mock.calls.map(([input]) => String(input))).not.toContain(
      expect.stringContaining('/artifacts/presign'),
    );
  });

  it('uploads screenshot artifacts once using the latest raw PNG protocol', async () => {
    const projectId = '90e2a0c5-0755-49b9-9d5d-41534ed41b41';
    const submissionId = '60bba625-07f2-40f6-8eef-1ddb681f8513';
    const reportId = '49bbad52-952f-4c45-96e9-5020106f9324';
    const capturedAt = '2026-09-05T08:00:00.000Z';
    const requests: RequestInit[] = [];
    const fetchMock = vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
      requests.push(init ?? {});
      const url = String(input);
      if (url.endsWith('/report-submissions')) return Response.json({ id: submissionId });
      if (url.endsWith('/artifacts/presign'))
        return Response.json({ artifactId: 'artifact-1', uploadUrl: '/v1/uploads/artifact-1' });
      if (url.endsWith('/uploads/artifact-1')) return Response.json({ uploaded: true });
      if (url.endsWith(`/${submissionId}/finalize`))
        return Response.json({
          id: reportId,
          projectId,
          environmentId: null,
          title: 'Screenshot note',
          description: 'Fix this region',
          priority: 'MEDIUM',
          status: 'OPEN',
          version: 1,
          screenshotPath: 'artifact-1',
          captureBundle: {
            schemaVersion: 1,
            page: {
              url: 'https://example.test',
              title: 'Example',
              viewportWidthCssPx: 1,
              viewportHeightCssPx: 1,
              deviceScaleFactor: 1,
              capturedAt,
            },
            annotationKind: 'SCREENSHOT',
            annotations: [],
            reproduction: [],
          },
          createdAt: capturedAt,
          updatedAt: capturedAt,
        });
      return Response.json({ message: 'unexpected request' }, { status: 500 });
    });
    vi.stubGlobal('fetch', fetchMock);
    const api = new MarkFixApi('https://api.example.test');

    const result = await api.submitReport(
      {
        projectId,
        title: 'Screenshot note',
        description: 'Fix this region',
        priority: 'MEDIUM',
        screenshotDataUrl: 'data:image/png;base64,YQ==',
        captureBundle: {
          schemaVersion: 1,
          page: {
            url: 'https://example.test',
            title: 'Example',
            viewportWidthCssPx: 1,
            viewportHeightCssPx: 1,
            deviceScaleFactor: 1,
            capturedAt,
          },
          annotationKind: 'SCREENSHOT',
          annotations: [],
          reproduction: [],
        },
      },
      'stable-screenshot-id',
    );

    expect(result.id).toBe(reportId);
    expect(fetchMock).toHaveBeenCalledTimes(4);
    expect(new Headers(requests[2]?.headers).get('content-type')).toBe('image/png');
    expect(Array.from(requests[2]?.body as Uint8Array)).toEqual([97]);
  });

  it('stores cloud capture metadata separately from its PNG binaries', async () => {
    const projectId = '90e2a0c5-0755-49b9-9d5d-41534ed41b41';
    const captureId = '1d04602d-c0cb-4aac-bf5b-066b33273a03';
    const requests: Array<{ url: string; init: RequestInit }> = [];
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
        requests.push({ url: String(input), init: init ?? {} });
        return Response.json({ saved: true });
      }),
    );
    const api = new MarkFixApi('https://api.example.test');
    const now = new Date().toISOString();

    await api.saveCloudCapture({
      id: captureId,
      projectId,
      pageSessionId: crypto.randomUUID(),
      pageUrl: 'https://example.test/page',
      pageTitle: 'Example',
      status: 'draft',
      note: 'Capture',
      dataUrl: 'data:image/png;base64,YQ==',
      sourceDataUrl: 'data:image/png;base64,Yg==',
      widthCssPx: 100,
      heightCssPx: 80,
      marks: [],
      selection: {
        kind: 'region',
        xCssPx: 0,
        yCssPx: 0,
        widthCssPx: 100,
        heightCssPx: 80,
        documentUrl: 'https://example.test/page',
        scrollXCssPx: 0,
        scrollYCssPx: 0,
      },
      captureScale: 1,
      createdAt: now,
      updatedAt: now,
    });

    expect(requests).toHaveLength(3);
    expect(JSON.parse(String(requests[0]?.init.body))).not.toHaveProperty('dataUrl');
    expect(new Headers(requests[1]?.init.headers).get('content-type')).toBe('image/png');
    expect(new Headers(requests[2]?.init.headers).get('content-type')).toBe('image/png');
    expect(requests.slice(1).map(({ init }) => Array.from(init.body as Uint8Array))).toEqual([
      [97],
      [98],
    ]);
  });

  it('returns the validated diagnostic after the cloud acknowledgement', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => Response.json({ saved: true })),
    );
    const api = new MarkFixApi('https://api.example.test');
    const now = new Date().toISOString();
    const annotation = {
      id: crypto.randomUUID(),
      projectId: '90e2a0c5-0755-49b9-9d5d-41534ed41b41',
      pageSessionId: crypto.randomUUID(),
      pageUrl: 'https://example.test/page',
      pageTitle: 'Example',
      status: 'draft' as const,
      evidence: {
        id: crypto.randomUUID(),
        kind: 'console' as const,
        level: 'error' as const,
        timestamp: now,
        pageUrl: 'https://example.test/page',
        title: 'Error',
        message: 'Failure',
        redactions: [],
      },
      createdAt: now,
      updatedAt: now,
    };

    await expect(api.saveCloudDiagnostic(annotation)).resolves.toEqual(annotation);
  });
});
