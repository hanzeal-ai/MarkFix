import { afterEach, describe, expect, it, vi } from 'vitest';
import { WebhookEmailAdapter } from '../src/email.port.js';

describe('webhook email adapter', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('sends a provider-neutral reset message with an encoded action URL', async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, status: 202 });
    vi.stubGlobal('fetch', fetchMock);
    const adapter = new WebhookEmailAdapter(
      'https://email.example.test/send',
      'provider-key',
      'https://markfix.example.test',
    );

    await adapter.sendPasswordReset('user@example.test', 'token/with spaces');

    expect(fetchMock).toHaveBeenCalledOnce();
    const [endpoint, request] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(endpoint).toBe('https://email.example.test/send');
    expect(request.headers).toMatchObject({ authorization: 'Bearer provider-key' });
    expect(JSON.parse(String(request.body))).toEqual({
      template: 'reset-password',
      email: 'user@example.test',
      actionUrl: 'https://markfix.example.test/reset-password?token=token%2Fwith%20spaces',
    });
  });

  it('fails closed when the delivery provider rejects a message', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, status: 503 }));
    const adapter = new WebhookEmailAdapter(
      'https://email.example.test/send',
      undefined,
      'https://markfix.example.test',
    );

    await expect(adapter.sendVerification('user@example.test', 'token')).rejects.toThrow(
      'status 503',
    );
  });
});
