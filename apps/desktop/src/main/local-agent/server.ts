import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import { randomBytes } from 'node:crypto';
import { mkdir, writeFile, rename, unlink } from 'node:fs/promises';
import { dirname } from 'node:path';
import { ZodError } from 'zod';
import { agentTokenSchema, agentRefreshSchema } from '@markfix/contracts';
import { type LocalAgentService, LocalAgentError } from './service.js';

const escape = (value: string) =>
  value.replace(
    /[&<>"']/g,
    (char) =>
      ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char] ?? char,
  );
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
const html = (content: string) =>
  `<!doctype html><html lang="zh-CN"><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>MarkFix 本机授权</title><style>body{font:16px system-ui;color:#18181b;background:#fafafa;margin:60px auto;padding:24px;max-width:560px}main{background:white;border:1px solid #ddd;border-radius:16px;padding:28px}h1{font-size:26px}label{display:block;padding:12px 0}button{padding:10px 18px;margin:18px 10px 0 0;border-radius:8px;border:1px solid #ccc;cursor:pointer}button[value="yes"]{background:#6151e8;color:white}code{font-size:22px}p{line-height:1.6;color:#52525b}</style><main>${content}</main></html>`;
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
      if (url.pathname === '/devices') {
        if (url.searchParams.get('key') !== transportSecret)
          throw new LocalAgentError(403, '请从桌面设置打开设备管理');
        if (request.method === 'POST') {
          if (request.headers.origin !== origin) throw new LocalAgentError(403, '需要本机页面确认');
          const form = await body(request);
          if (!(form instanceof URLSearchParams) || form.get('csrf') !== transportSecret)
            throw new LocalAgentError(403, '无效的撤销请求');
          service.revoke(form.get('grantId') ?? '');
        } else if (request.method !== 'GET') throw new LocalAgentError(405, '不支持的方法');
        return send(
          200,
          html(
            `<h1>本机 CLI 授权设备</h1><p>撤销后该设备不能继续读取项目或回写结果。如有待同步结果，请先完成同步。</p>${
              service
                .grants()
                .map(
                  (grant) =>
                    `<form method="post"><p><strong>${escape(grant.deviceName)}</strong><br>项目数：${grant.projectIds.length} · 到期：${escape(grant.expiresAt)}</p><input type="hidden" name="csrf" value="${transportSecret}"><input type="hidden" name="grantId" value="${grant.id}"><button>撤销授权</button></form>`,
                )
                .join('') || '<p>没有有效的本机授权。</p>'
            }`,
          ),
          'text/html; charset=utf-8',
        );
      }
      if (url.pathname === '/authorize') {
        const ticket = url.searchParams.get('ticket') ?? '';
        if (request.method === 'GET') {
          const page = service.page(ticket);
          return send(
            200,
            html(
              `<h1>授权 CLI 访问本机项目</h1><p>请求设备：${escape(page.deviceName)}。标注和修复结果仅保存在此电脑，不上传云端。</p><p>请核对终端授权码：</p><code>${escape(page.code)}</code><form method="post"><input type="hidden" name="csrf" value="${page.csrf}"><input type="hidden" name="userCode" value="${page.code}">${page.projects.map((project) => `<label><input type="checkbox" name="projectIds" value="${project.id}"> ${escape(project.title)}</label>`).join('') || '<p>没有本机项目，请先在桌面创建项目，再重新授权。</p>'}<p>授权允许读取、领取标注和回写修复结果，有效期 30 天。可用 markfix logout --local 撤销。</p><button name="approve" value="yes">授权此设备</button><button name="approve" value="no">拒绝</button></form>`,
            ),
            'text/html; charset=utf-8',
          );
        }
        if (request.method === 'POST') {
          if (request.headers.origin !== origin) throw new LocalAgentError(403, '需要本机页面确认');
          const form = await body(request);
          if (!(form instanceof URLSearchParams)) throw new LocalAgentError(400, '无效表单');
          const result = service.decide(ticket, form.get('csrf') ?? '', {
            userCode: form.get('userCode'),
            approve: form.get('approve') === 'yes',
            projectIds: form.getAll('projectIds'),
          });
          return send(
            200,
            html(
              `<h1>${result.approved ? '已授权' : '已拒绝'}</h1><p>可以关闭此页并返回终端。</p>`,
            ),
            'text/html; charset=utf-8',
          );
        }
        throw new LocalAgentError(405, '不支持的方法');
      }
      // A private discovery secret prevents arbitrary websites from initiating local grants or API calls.
      if (request.headers['x-markfix-local-secret'] !== transportSecret)
        throw new LocalAgentError(403, '本机连接凭据无效');
      const input = request.method === 'POST' ? await body(request) : undefined;
      if (request.method === 'POST' && url.pathname === '/v1/agent/device')
        return send(200, service.device(input, origin));
      if (request.method === 'POST' && url.pathname === '/v1/agent/token')
        return send(200, service.token(agentTokenSchema.parse(input).deviceCode));
      if (request.method === 'POST' && url.pathname === '/v1/agent/token/refresh')
        return send(200, service.refresh(agentRefreshSchema.parse(input).refreshToken));
      const grant = service.authorize(request.headers.authorization?.replace(/^Bearer /, ''));
      const screenshot = /^\/v1\/agent\/issues\/([^/]+)\/screenshot$/.exec(url.pathname);
      if (request.method === 'GET' && screenshot)
        return send(200, service.screenshot(grant, screenshot[1] ?? ''), 'image/png');
      return send(200, service.request(grant, request.method ?? 'GET', url, input));
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
    managementUrl: `${origin}/devices?key=${transportSecret}`,
    close: async () => {
      server.closeAllConnections();
      await new Promise<void>((resolve) => server.close(() => resolve()));
      await unlink(discoveryPath).catch(() => {});
    },
  };
}
