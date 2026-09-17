import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import { randomBytes } from 'node:crypto';
import { mkdir, writeFile, rename, unlink } from 'node:fs/promises';
import { dirname } from 'node:path';
import { ZodError } from 'zod';
import { type LocalAgentService, LocalAgentError } from './service.js';

async function body(request: IncomingMessage) {
  const chunks: Buffer[] = [];
  let length = 0;
  for await (const chunk of request) {
    length += chunk.length;
    if (length > 160_000) throw new LocalAgentError(413, '请求过大');
    chunks.push(Buffer.from(chunk));
  }
  const text = Buffer.concat(chunks).toString();
  return request.headers['content-type']?.startsWith('application/x-www-form-urlencoded')
    ? new URLSearchParams(text)
    : JSON.parse(text || '{}');
}
export async function startLocalAgentServer(service: LocalAgentService, discoveryPath: string) {
  const transportSecret = randomBytes(32).toString('hex');
  let origin = '';
  const server = createServer((request, response) => {
    void handle(request, response);
  });
  async function handle(request: IncomingMessage, response: ServerResponse) {
    const send = (status: number, value: unknown, type = 'application/json') => {
      response.writeHead(status, {
        'Content-Type': type,
        'Cache-Control': 'no-store',
        'X-Content-Type-Options': 'nosniff',
        'Content-Security-Policy':
          "default-src 'none'; style-src 'unsafe-inline'; form-action 'self'; frame-ancestors 'none'",
        'Referrer-Policy': 'same-origin',
      });
      response.end(
        type === 'application/json' ? JSON.stringify(value) : (value as string | Buffer),
      );
    };
    try {
      if (
        request.headers.host !== new URL(origin).host ||
        (request.headers.origin && request.headers.origin !== origin)
      )
        throw new LocalAgentError(403, '拒绝跨站请求');
      const url = new URL(request.url ?? '/', origin);
      // Only same-user CLI processes can read the private discovery secret.
      if (request.headers['x-markfix-local-secret'] !== transportSecret)
        throw new LocalAgentError(403, '本机连接凭据无效');
      const input = request.method === 'POST' ? await body(request) : undefined;
      const screenshot = /^\/v1\/agent\/issues\/([^/]+)\/screenshot$/.exec(url.pathname);
      if (request.method === 'GET' && screenshot)
        return send(200, service.screenshot(screenshot[1] ?? ''), 'image/png');
      return send(200, service.request(request.method ?? 'GET', url, input));
    } catch (error) {
      send(
        error instanceof LocalAgentError
          ? error.status
          : error instanceof ZodError || error instanceof SyntaxError
            ? 400
            : 500,
        { message: error instanceof LocalAgentError ? error.message : '本机请求处理失败' },
      );
    }
  }
  server.requestTimeout = 15_000;
  server.headersTimeout = 10_000;
  await new Promise<void>((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', resolve);
  });
  const address = server.address();
  if (!address || typeof address === 'string') throw new Error('Local agent listener failed');
  origin = `http://127.0.0.1:${address.port}`;
  await mkdir(dirname(discoveryPath), { recursive: true, mode: 0o700 });
  const temp = `${discoveryPath}.${process.pid}.tmp`;
  await writeFile(
    temp,
    JSON.stringify({ origin, secret: transportSecret, identity: service.identity }),
    { mode: 0o600, flag: 'wx' },
  );
  await rename(temp, discoveryPath);
  return {
    origin,
    close: async () => {
      server.closeAllConnections();
      await new Promise<void>((resolve) => server.close(() => resolve()));
      await unlink(discoveryPath).catch(() => {});
    },
  };
}
