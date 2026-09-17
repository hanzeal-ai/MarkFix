import { describe, expect, it, vi } from 'vitest';
import type { WebContents } from 'electron';
import { diagnosticEvidenceSchema, diagnosticEvidenceSections } from '@markfix/contracts';
import { DiagnosticConsole } from '../src/main/diagnostic-console';
import { diagnosticBody, diagnosticHeaders } from '../src/main/diagnostic-payload';

const fixture = (run: (method: string, params: Record<string, unknown>) => Promise<unknown>) => {
  let receive: (event: unknown, method: string, params: Record<string, unknown>) => void = () =>
    undefined;
  const sendCommand = vi.fn(run);
  const contents = {
    debugger: {
      on: (_event: string, listener: typeof receive) => {
        receive = listener;
      },
      sendCommand,
    },
    getURL: () => 'https://example.test/page',
  } as unknown as WebContents;
  const console = new DiagnosticConsole(
    contents,
    () => '8a5e60dd-9154-4bc7-a656-12cff66cd6c3',
    vi.fn(),
  );
  return {
    console,
    sendCommand,
    emit: (method: string, params: Record<string, unknown>) => receive(null, method, params),
  };
};
const request = (id: string) => ({
  requestId: id,
  timestamp: 1,
  type: 'Fetch',
  request: {
    method: 'POST',
    url: `https://example.test/api/${id}`,
    headers: { Authorization: 'Bearer sensitive' },
    postData: JSON.stringify({ id, password: 'sensitive' }),
  },
});
const response = (id: string, mimeType = 'application/json') => ({
  requestId: id,
  timestamp: 2,
  response: {
    status: 200,
    statusText: 'OK',
    headers: { 'Content-Type': mimeType, 'Set-Cookie': 'sensitive' },
    mimeType,
  },
});

describe('complete diagnostic request evidence', () => {
  it('keeps concurrent request/response bodies on the same request and waits before quoting', async () => {
    const { console, emit } = fixture(async (_method, params) => ({
      body: JSON.stringify({ id: params.requestId, token: 'sensitive', code: 'FORBIDDEN' }),
      base64Encoded: false,
    }));
    for (const id of ['one', 'two']) {
      emit('Network.requestWillBeSent', request(id));
      emit('Network.responseReceived', response(id));
    }
    expect(console.list()).toEqual([]);
    for (const id of ['two', 'one'])
      emit('Network.loadingFinished', { requestId: id, timestamp: 3 });
    await vi.waitFor(() => expect(console.list()).toHaveLength(2));
    for (const entry of console.list()) {
      expect(diagnosticEvidenceSchema.safeParse(entry).success).toBe(true);
      expect(JSON.parse(entry.request?.body ?? '{}').id).toBe(entry.request?.requestId);
      expect(JSON.parse(entry.response?.body ?? '{}').id).toBe(entry.request?.requestId);
      expect(JSON.stringify(entry)).not.toContain('sensitive');
      expect(diagnosticEvidenceSections(entry)).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ label: '请求内容' }),
          expect.objectContaining({
            label: '响应内容',
            value: expect.stringContaining('FORBIDDEN'),
          }),
        ]),
      );
    }
  });
  it('marks binary, failed, unavailable and truncated responses explicitly', async () => {
    const { console, emit } = fixture(async (_method, params) => {
      if (params.requestId === 'missing') throw new Error('Body evicted');
      return { body: 'x'.repeat(30_000) };
    });
    for (const id of ['binary', 'missing', 'long', 'failed']) {
      emit('Network.requestWillBeSent', request(id));
      emit('Network.responseReceived', response(id, id === 'binary' ? 'image/png' : 'text/plain'));
      emit(id === 'failed' ? 'Network.loadingFailed' : 'Network.loadingFinished', {
        requestId: id,
        timestamp: 3,
        errorText: 'net::ERR_FAILED',
      });
    }
    await vi.waitFor(() => expect(console.list()).toHaveLength(4));
    const byId = Object.fromEntries(
      console.list().map((entry) => [entry.request?.requestId, entry]),
    );
    expect(byId.binary?.response?.bodyState).toBe('omitted');
    expect(byId.missing?.response?.bodyState).toBe('unavailable');
    expect(byId.long?.response?.bodyState).toBe('truncated');
    expect(byId.long?.response?.body).toHaveLength(20_000);
    expect(byId.failed?.level).toBe('error');
  });
  it('fetches omitted POST data for the quoted request', async () => {
    const { console, emit } = fixture(async (method) =>
      method === 'Network.getRequestPostData'
        ? { postData: '{"action":"save"}' }
        : { body: '{"ok":true}' },
    );
    emit('Network.requestWillBeSent', {
      requestId: 'one',
      timestamp: 1,
      request: { method: 'POST', url: 'https://example.test/save', hasPostData: true },
    });
    emit('Network.responseReceived', response('one'));
    emit('Network.loadingFinished', { requestId: 'one', timestamp: 2 });
    await vi.waitFor(() => expect(console.list()).toHaveLength(1));
    expect(JSON.parse(console.list()[0]?.request?.body ?? '{}')).toEqual({ action: 'save' });
    expect(console.list()[0]?.request?.bodyState).toBe('captured');
  });
  it('does not restore entries after clearing', async () => {
    let finish: (value: unknown) => void = () => undefined;
    const { console, emit } = fixture(async (method) =>
      method === 'Network.getRequestPostData'
        ? { postData: '{"action":"save"}' }
        : new Promise((resolve) => {
            finish = resolve;
          }),
    );
    emit('Network.requestWillBeSent', {
      requestId: 'one',
      timestamp: 1,
      request: { method: 'POST', url: 'https://example.test/save', hasPostData: true },
    });
    emit('Network.responseReceived', response('one'));
    emit('Network.loadingFinished', { requestId: 'one', timestamp: 2 });
    console.clear('network');
    finish({ body: '{}' });
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(console.list()).toEqual([]);
  });
  it('captures nested console objects without invoking getters', async () => {
    const { console, emit, sendCommand } = fixture(async (_method, params) =>
      params.objectId === 'outer'
        ? {
            result: [
              { name: 'payload', value: { objectId: 'inner', type: 'object' } },
              { name: 'computed' },
            ],
          }
        : {
            result: [
              { name: 'code', value: { value: 403 } },
              { name: 'password', value: { value: 'private' } },
            ],
          },
    );
    emit('Runtime.consoleAPICalled', {
      type: 'error',
      args: [{ objectId: 'outer', description: 'Object' }],
    });
    await vi.waitFor(() => expect(console.list()).toHaveLength(1));
    expect(console.list()[0]?.message).toContain('403');
    expect(console.list()[0]?.message).not.toContain('private');
    expect(console.list()[0]?.captureNotes).toContain('未执行 getter');
    expect(sendCommand.mock.calls.every(([method]) => method === 'Runtime.getProperties')).toBe(
      true,
    );
  });
  it('redacts nested JSON, form keys and headers before truncation', () => {
    expect(diagnosticBody('{"nested":{"access_token":"secret"},"id":2}').body).not.toContain(
      'secret',
    );
    expect(diagnosticBody('%70assword=hidden&id=2').body).not.toContain('hidden');
    expect(diagnosticHeaders({ Cookie: 'secret', 'X-Trace-ID': 'trace' })).toEqual({
      Cookie: '[REDACTED]',
      'X-Trace-ID': 'trace',
    });
  });
});
