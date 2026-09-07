import { describe, expect, it, vi } from 'vitest';
import type { WebContents } from 'electron';
import {
  DiagnosticConsole,
  parseCurlCommand,
  redactCurlInput,
  redactDiagnosticText,
  redactDiagnosticUrl,
} from '../src/main/diagnostic-console.js';

describe('diagnostic console', () => {
  it('enables CDP domains and normalizes console and failed network events', async () => {
    let messageListener:
      ((_event: unknown, method: string, parameters: Record<string, unknown>) => void) | undefined;
    const sendCommand = vi.fn(async (method: string, parameters?: Record<string, unknown>) => {
      void method;
      void parameters;
      return {};
    });
    const webContents = {
      debugger: {
        on: vi.fn((event: string, listener: typeof messageListener) => {
          if (event === 'message') messageListener = listener;
        }),
        isAttached: vi.fn(() => false),
        attach: vi.fn(),
        sendCommand,
      },
      getURL: vi.fn(() => 'https://example.test/page?token=secret'),
    } as unknown as WebContents;
    const onEntry = vi.fn();
    const diagnostics = new DiagnosticConsole(
      webContents,
      () => '8a5e60dd-9154-4bc7-a656-12cff66cd6c3',
      onEntry,
    );

    await diagnostics.start();
    messageListener?.(undefined, 'Runtime.consoleAPICalled', {
      type: 'error',
      args: [{ type: 'string', value: 'Authorization: Bearer secret-token' }],
    });
    messageListener?.(undefined, 'Network.requestWillBeSent', {
      requestId: 'request-1',
      timestamp: 10,
      type: 'Fetch',
      request: { method: 'POST', url: 'https://api.example.test/items?api_key=secret' },
    });
    messageListener?.(undefined, 'Network.loadingFailed', {
      requestId: 'request-1',
      timestamp: 10.25,
      errorText: 'net::ERR_FAILED',
    });

    expect(webContents.debugger.attach).toHaveBeenCalledWith('1.3');
    expect(sendCommand.mock.calls.map(([method]) => method)).toEqual([
      'Runtime.enable',
      'Log.enable',
      'Network.enable',
    ]);
    expect(diagnostics.list()).toEqual([
      expect.objectContaining({
        kind: 'console',
        level: 'error',
        message: 'Authorization: [REDACTED]',
        pageUrl: 'https://example.test/page?token=%5BREDACTED%5D',
      }),
      expect.objectContaining({
        kind: 'network',
        level: 'error',
        request: expect.objectContaining({
          method: 'POST',
          url: 'https://api.example.test/items?api_key=%5BREDACTED%5D',
          durationMs: 250,
        }),
      }),
    ]);
    expect(onEntry).toHaveBeenCalledTimes(2);

    diagnostics.clear('console');
    expect(diagnostics.list()).toEqual([
      expect.objectContaining({ kind: 'network', level: 'error' }),
    ]);
    diagnostics.clear('network');
    expect(diagnostics.list()).toEqual([]);
  });

  it('parses the supported safe cURL subset without invoking a shell', () => {
    expect(
      parseCurlCommand(
        "curl -L -X POST 'https://api.example.test/items?token=secret' -H 'Content-Type: application/json' --data-raw '{\"name\":\"demo\"}' --max-time 2",
      ),
    ).toEqual({
      url: 'https://api.example.test/items?token=secret',
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: '{"name":"demo"}',
      timeoutMs: 2_000,
      followRedirects: true,
    });
  });

  it('rejects file-backed cURL bodies and unsupported protocols', () => {
    expect(() => parseCurlCommand("curl https://example.test -d '@/tmp/secret'")).toThrow(
      '不支持从本地文件读取请求正文',
    );
    expect(() => parseCurlCommand('curl file:///tmp/secret')).toThrow('仅支持 HTTP 和 HTTPS');
  });

  it('redacts credentials before diagnostics are persisted', () => {
    expect(redactDiagnosticText('Authorization: Bearer abc.def')).toBe('Authorization: [REDACTED]');
    expect(redactDiagnosticUrl('https://example.test/path?token=secret&view=all')).toBe(
      'https://example.test/path?token=%5BREDACTED%5D&view=all',
    );
    expect(
      redactCurlInput("curl 'https://example.test/path?api_key=secret' -H 'X-Api-Key: abc'"),
    ).toBe("curl 'https://example.test/path?api_key=%5BREDACTED%5D' -H 'X-Api-Key: [REDACTED]'");
  });
});
