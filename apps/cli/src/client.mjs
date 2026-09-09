import { loadCredential, saveCredential } from './storage.mjs';

export function serverUrl(input, allowLocal = false) {
  const url = new URL(input);
  if (url.username || url.password || url.search || url.hash || url.pathname !== '/')
    throw new Error('Server must be an origin without credentials, path or query');
  if (
    url.protocol !== 'https:' &&
    !(
      allowLocal &&
      url.protocol === 'http:' &&
      ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname)
    )
  )
    throw new Error(
      'HTTPS is required; --allow-local-http only permits loopback development servers',
    );
  return url.origin;
}
export class ApiError extends Error {
  constructor(status, body) {
    super(body.message ?? `Request failed (${status})`);
    this.status = status;
  }
}
export class Client {
  constructor(config) {
    this.config = config;
  }
  async send(path, body, token, method = body === undefined ? 'GET' : 'POST') {
    const response = await fetch(`${this.config.server}/v1/agent${path}`, {
      method,
      redirect: 'error',
      signal: AbortSignal.timeout(20_000),
      headers: {
        'Content-Type': 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    });
    const result = await response.json();
    if (!response.ok) throw new ApiError(response.status, result);
    return result;
  }
  async request(path, body, method) {
    let credential = await loadCredential(this.config);
    if (!credential) throw new Error('Authorization required: run markfix setup');
    if (Date.parse(credential.accessExpiresAt) <= Date.now() + 30_000) {
      credential = await this.send('/token/refresh', { refreshToken: credential.refreshToken });
      await saveCredential(this.config, credential);
    }
    return this.send(path, body, credential.accessToken, method);
  }
}
