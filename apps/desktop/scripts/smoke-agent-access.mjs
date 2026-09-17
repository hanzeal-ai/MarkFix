import { app, BrowserWindow } from 'electron';
import assert from 'node:assert/strict';
import { URL } from 'node:url';
import { createServer } from 'node:http';
import { readFileSync, writeFileSync, mkdtempSync } from 'node:fs';
import { join, resolve, extname } from 'node:path';
import { tmpdir } from 'node:os';
import { setTimeout } from 'node:timers/promises';
import console from 'node:console';
const output = mkdtempSync(join(tmpdir(), 'markfix-agent-access-'));
app.setPath('userData', join(output, 'profile'));
app.disableHardwareAcceleration();
app.on('window-all-closed', () => {});
const dist = resolve(import.meta.dirname, '../../dashboard/dist');
let decision;
let failDecision = false;
const projectId = '11111111-1111-4111-8111-111111111111';
let projects = [
  {
    id: projectId,
    ownerId: projectId,
    name: 'MarkFix 产品网站',
    baseUrl: 'https://example.test',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  },
];
const server = createServer(async (req, res) => {
  const path = new URL(req.url, 'http://localhost').pathname;
  res.setHeader('Access-Control-Allow-Origin', req.headers.origin ?? '*');
  res.setHeader('Access-Control-Allow-Credentials', 'true');
  res.setHeader('Access-Control-Allow-Headers', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  if (req.method === 'OPTIONS') return res.end();
  res.setHeader('Content-Type', 'application/json');
  if (path === '/v1/me') return res.end(JSON.stringify({ id: 'user', email: 'test@example.test' }));
  if (path === '/v1/projects') return res.end(JSON.stringify(projects));
  if (path === '/v1/agent/grants') return res.end('[]');
  if (path === '/v1/agent/device/decision') {
    let body = '';
    for await (const chunk of req) body += chunk;
    if (failDecision) {
      res.statusCode = 409;
      return res.end(JSON.stringify({ message: '请求已过期' }));
    }
    decision = JSON.parse(body);
    return res.end(JSON.stringify({ approved: decision.approve }));
  }
  if (path === '/v1/agent/device/ABCD1234')
    return res.end(
      JSON.stringify({
        deviceName: '开发用 Mac',
        agentType: 'codex',
        status: 'PENDING',
        expiresAt: new Date(Date.now() + 60000).toISOString(),
      }),
    );
  const file = path.startsWith('/assets/') ? join(dist, path) : join(dist, 'index.html');
  try {
    res.setHeader(
      'Content-Type',
      { '.js': 'text/javascript', '.css': 'text/css', '.html': 'text/html' }[extname(file)] ??
        'application/octet-stream',
    );
    res.end(readFileSync(file));
  } catch {
    res.statusCode = 404;
    res.end();
  }
});
async function main() {
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  await app.whenReady();
  const origin = `http://127.0.0.1:${server.address().port}`;
  let win;
  async function open(width = 1100) {
    win = new BrowserWindow({
      width,
      height: 850,
      show: false,
      webPreferences: {
        sandbox: true,
        contextIsolation: true,
        nodeIntegration: false,
        offscreen: true,
      },
    });
    win.webContents.session.webRequest.onBeforeRequest(
      { urls: ['*://*/v1/*'] },
      (request, callback) => {
        const url = new URL(request.url);
        callback(url.origin === origin ? {} : { redirectURL: origin + url.pathname + url.search });
      },
    );
    await win.loadURL(origin + '/agent/authorize?code=ABCD1234');
    await wait(`!!document.querySelector('.agent-actions')`);
  }
  const run = (code) => win.webContents.executeJavaScript(code);
  async function wait(code) {
    for (let i = 0; i < 100; i++) {
      if (await run(code)) return;
      await setTimeout(50);
    }
    throw Error('Timed out: ' + code);
  }
  async function screenshot(name) {
    await setTimeout(150);
    writeFileSync(join(output, name + '.png'), (await win.webContents.capturePage()).toPNG());
  }
  try {
    await open();
    assert.equal(await run(`document.querySelector('.agent-actions button').disabled`), true);
    assert.equal(await run(`document.body.textContent.includes('已授权设备')`), false);
    await run(`document.querySelector('[role="checkbox"]').click()`);
    await wait(`!document.querySelector('.agent-actions button').disabled`);
    await screenshot('authorize-desktop');
    failDecision = true;
    await run(`document.querySelector('.agent-actions button').click()`);
    await wait(`document.body.textContent.includes('请求已过期')`);
    assert.equal(await run(`!!document.querySelector('.agent-access-result')`), false);
    failDecision = false;
    await run(`document.querySelector('.agent-actions button').click()`);
    await wait(`!!document.querySelector('.agent-access-result')`);
    assert.deepEqual(decision, { userCode: 'ABCD1234', approve: true, projectIds: [projectId] });
    await screenshot('authorized');
    for (let i = 0; i < 40 && !win.isDestroyed(); i++) await setTimeout(100);
    assert.ok(win.isDestroyed(), 'authorization window closes after approval');
    await open(390);
    assert.equal(await run(`document.documentElement.scrollWidth <= innerWidth`), true);
    await screenshot('authorize-mobile');
    await run(`document.querySelectorAll('.agent-actions button')[1].click()`);
    await wait(`document.body.textContent.includes('已拒绝授权')`);
    assert.equal(decision.approve, false);
    for (let i = 0; i < 40 && !win.isDestroyed(); i++) await setTimeout(100);
    assert.ok(win.isDestroyed(), 'rejection window closes');
    projects = [];
    await open();
    assert.equal(await run(`document.querySelector('.agent-actions button').disabled`), true);
    assert.ok(await run(`document.body.textContent.includes('暂无可授权项目')`));
    console.log(
      'PASS project selection, failure, approval, rejection, automatic close, mobile and empty projects. Screenshots: ' +
        output,
    );
    win.destroy();
    server.close();
    app.exit(0);
  } catch (error) {
    console.error(error);
    if (win && !win.isDestroyed()) {
      await screenshot('failure');
      win.destroy();
    }
    console.log(output);
    server.close();
    app.exit(1);
  }
}
void main().catch((error) => {
  console.error(error);
  app.exit(1);
});
