import { localConnection } from './local.mjs';
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
    const messages = {
      'Authorization expired': '授权申请已过期，请重新执行原命令。',
      'Authorization denied or already consumed':
        '授权申请已被拒绝或已使用，请联系账号持有人确认；不要重复发起申请。',
      'Authorization expired or revoked':
        '授权已过期或被撤销。待同步结果仍保留，请先联系账号持有人处理，再重新申请。',
      'Agent authorization expired or revoked': '授权已过期或被撤销，请联系账号持有人确认。',
      'Too many requests; try again later': '申请或查询过于频繁，请稍后重试。',
    };
    super(
      messages[body.message] ?? body.message ?? `请求失败（${status}），请检查连接和账号权限。`,
    );
    this.status = status;
  }
}
export class Client {
  constructor(config) {
    this.config = config;
  }
  async send(path, body, token, method = body === undefined ? 'GET' : 'POST') {
    const connection = this.config.local ? await localConnection() : this.config;
    if (connection.server !== this.config.server) throw new Error('Local desktop profile changed');
    const response = await fetch(`${connection.endpoint ?? connection.server}/v1/agent${path}`, {
      method,
      redirect: 'error',
      signal: AbortSignal.timeout(20_000),
      headers: {
        'Content-Type': 'application/json',
        ...(connection.localSecret ? { 'X-MarkFix-Local-Secret': connection.localSecret } : {}),
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    });
    const result = await response.json();
    if (!response.ok) throw new ApiError(response.status, result);
    return result;
  }
  async request(path, body, method) {
    if (this.config.local) return this.send(path, body, undefined, method);
    let credential = await loadCredential(this.config);
    if (!credential) throw new Error('Authorization required: run markfix setup');
    if (Date.parse(credential.accessExpiresAt) <= Date.now() + 30_000) {
      credential = await this.send('/token/refresh', { refreshToken: credential.refreshToken });
      await saveCredential(this.config, credential);
    }
    try {
      return await this.send(path, body, credential.accessToken, method);
    } catch (error) {
      if (!(error instanceof ApiError) || error.status !== 401) throw error;
      credential = await this.send('/token/refresh', { refreshToken: credential.refreshToken });
      await saveCredential(this.config, credential);
      return this.send(path, body, credential.accessToken, method);
    }
  }
}
