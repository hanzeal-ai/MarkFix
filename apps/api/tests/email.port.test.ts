import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  WebhookEmailAdapter,
  ResendEmailAdapter,
  configuredEmailAdapter,
  DevelopmentEmailAdapter,
} from '../src/email.port.js';

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

describe('Resend email adapter', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('sends plain-text verification with the configured sender and reply address', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue({ ok: true, json: async () => ({ id: 'message-id' }) });
    vi.stubGlobal('fetch', fetchMock);
    const adapter = new ResendEmailAdapter(
      'secret',
      'noreply@hanzeal.com',
      'hanzeal.ai@gmail.com',
      'https://markfix.hanzeal.com',
    );
    await adapter.sendVerification('user@example.test', 'a/b &c');
    const [endpoint, request] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(endpoint).toBe('https://api.resend.com/emails');
    expect(request.redirect).toBe('error');
    expect(request.signal).toBeInstanceOf(AbortSignal);
    const body = JSON.parse(String(request.body));
    expect(body).toMatchObject({
      from: 'noreply@hanzeal.com',
      to: ['user@example.test'],
      reply_to: 'hanzeal.ai@gmail.com',
    });
    expect(body.text).toContain('/verify-email?token=a%2Fb%20%26c');
    expect(body).not.toHaveProperty('html');
  });

  it('rejects provider failures and missing acknowledgments without exposing response bodies', async () => {
    const adapter = new ResendEmailAdapter(
      'secret',
      'noreply@hanzeal.com',
      undefined,
      'https://markfix.hanzeal.com',
    );
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, status: 403 }));
    await expect(adapter.sendPasswordReset('user@example.test', 'token')).rejects.toThrow(
      'status 403',
    );
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, json: async () => ({}) }));
    await expect(adapter.sendPasswordReset('user@example.test', 'token')).rejects.toThrow(
      'did not acknowledge',
    );
  });

  it('does not leak a malformed provider response through parsing errors', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(new Response('secret-provider-body', { status: 200 })),
    );
    const adapter = new ResendEmailAdapter(
      'secret',
      'noreply@hanzeal.com',
      undefined,
      'https://markfix.hanzeal.com',
    );
    await expect(adapter.sendVerification('user@example.test', 'secret-token')).rejects.toThrow(
      /^Email provider returned an invalid acknowledgment$/,
    );
  });

  it('requires credentials, a valid sender and HTTPS action links', () => {
    expect(
      () =>
        new ResendEmailAdapter('', 'noreply@hanzeal.com', undefined, 'https://markfix.hanzeal.com'),
    ).toThrow();
    expect(
      () => new ResendEmailAdapter('key', 'bad\naddress', undefined, 'https://markfix.hanzeal.com'),
    ).toThrow();
    expect(
      () =>
        new ResendEmailAdapter(
          'key',
          'noreply@hanzeal.com',
          undefined,
          'http://markfix.hanzeal.com',
        ),
    ).toThrow();
  });

  it('fails startup for production demo seeding, missing email or unsupported providers', () => {
    const origin = 'https://markfix.hanzeal.com';
    expect(() =>
      configuredEmailAdapter(
        { NODE_ENV: 'production', MARKFIX_EXPOSE_AUTH_TOKENS: 'true' },
        origin,
      ),
    ).toThrow('must not expose');
    expect(() => configuredEmailAdapter({ NODE_ENV: 'production' }, origin)).toThrow();
    expect(() =>
      configuredEmailAdapter(
        { NODE_ENV: 'production', MARKFIX_EMAIL_PROVIDER: 'development' },
        origin,
      ),
    ).toThrow();
    expect(() =>
      configuredEmailAdapter(
        {
          NODE_ENV: 'production',
          MARKFIX_EMAIL_PROVIDER: 'resend',
          MARKFIX_DEMO_EMAIL: 'admin@markfix.local',
        },
        origin,
      ),
    ).toThrow('demo');
    expect(() => configuredEmailAdapter({ MARKFIX_EMAIL_PROVIDER: 'unknown' }, origin)).toThrow();
    expect(
      configuredEmailAdapter(
        {
          NODE_ENV: 'production',
          MARKFIX_EMAIL_PROVIDER: 'resend',
          RESEND_API_KEY: 'key',
          MARKFIX_EMAIL_FROM: 'noreply@hanzeal.com',
        },
        origin,
      ),
    ).toBeInstanceOf(ResendEmailAdapter);
    expect(configuredEmailAdapter({}, origin)).toBeInstanceOf(DevelopmentEmailAdapter);
  });
});
