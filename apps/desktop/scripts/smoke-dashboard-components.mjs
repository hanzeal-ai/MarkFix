import { app, BrowserWindow } from 'electron';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { URL } from 'node:url';
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve, extname } from 'node:path';
import process from 'node:process';
import console from 'node:console';
import { setTimeout } from 'node:timers/promises';

const output = mkdtempSync(join(tmpdir(), 'markfix-dashboard-components-'));
app.setPath('userData', join(output, 'profile'));
app.disableHardwareAcceleration();
const dist = resolve(import.meta.dirname, '../../dashboard/dist');
const now = new Date().toISOString();
const user = {
  id: 'user',
  displayName: '测试成员',
  email: 'member@example.test',
  role: 'ADMIN',
  annotationCount: 2,
  rejectedCount: 0,
  projectCategories: [{ category: '网站', count: 2 }],
  createdAt: now,
  updatedAt: now,
};
const project = {
  id: 'project',
  workspaceId: 'workspace',
  name: '组件验收项目',
  baseUrl: 'https://example.test',
  category: '网站',
  annotationCount: 2,
  resolvedCount: 1,
  pendingCount: 1,
  rejectedCount: 0,
  createdAt: now,
  updatedAt: now,
};
const overview = {
  metrics: { projects: 1, annotations: 2, pending: 1, rejected: 0 },
  projects: [project],
  users: [user],
};
const bootstrap = {
  user,
  workspaceId: 'workspace',
  workspaces: [
    { id: 'workspace', name: '验收工作区', role: 'ADMIN', createdAt: now, updatedAt: now },
  ],
  overview,
};
let annotationFailure = false;
let bootstrapDelay = 0;
const server = createServer(async (req, res) => {
  const path = new URL(req.url, 'http://localhost').pathname;
  res.setHeader('Access-Control-Allow-Origin', req.headers.origin ?? '*');
  res.setHeader('Access-Control-Allow-Credentials', 'true');
  res.setHeader('Access-Control-Allow-Headers', '*');
  if (req.method === 'OPTIONS') {
    res.end();
    return;
  }
  if (path === '/v1/me') {
    res.setHeader('Content-Type', 'application/json');
    res.end(JSON.stringify(user));
    return;
  }
  if (path.endsWith('/annotations')) {
    if (annotationFailure) {
      res.statusCode = 503;
      res.setHeader('Content-Type', 'application/json');
      res.end(JSON.stringify({ message: '审查用加载失败' }));
      return;
    }
    res.setHeader('Content-Type', 'application/json');
    res.end(
      JSON.stringify({
        items: [
          {
            id: 'annotation',
            referenceCode: 'MF-001',
            projectId: project.id,
            authorId: user.id,
            author: user,
            title: '审查用批注',
            note: '检查项目详情与编辑弹窗。',
            kind: 'ELEMENT',
            pageUrl: project.baseUrl,
            screenshotUrl: null,
            status: 'OPEN',
            rejectionReason: null,
            history: [],
            createdAt: now,
            updatedAt: now,
          },
        ],
        total: 1,
        page: 1,
        pageSize: 50,
      }),
    );
    return;
  }
  if (path.startsWith('/v1/commercial/')) {
    if (path.endsWith('/bootstrap')) await setTimeout(bootstrapDelay);
    res.setHeader('Content-Type', 'application/json');
    res.end(JSON.stringify(path.endsWith('/bootstrap') ? bootstrap : overview));
    return;
  }
  const file =
    path.startsWith('/assets/') || /\.(svg|png|webp|jpg)$/.test(path)
      ? join(dist, path)
      : join(dist, 'index.html');
  try {
    res.setHeader(
      'Content-Type',
      {
        '.html': 'text/html',
        '.js': 'text/javascript',
        '.css': 'text/css',
        '.svg': 'image/svg+xml',
        '.png': 'image/png',
        '.webp': 'image/webp',
        '.jpg': 'image/jpeg',
      }[extname(file)] ?? 'application/octet-stream',
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
  const win = new BrowserWindow({
    width: 1280,
    height: 900,
    show: false,
    webPreferences: {
      sandbox: true,
      contextIsolation: true,
      nodeIntegration: false,
      partition: 'dashboard-components-smoke',
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
  const run = (code) => win.webContents.executeJavaScript(code);
  const waitFor = async (code) => {
    for (let attempt = 0; attempt < 150; attempt++) {
      if (await run(code)) return;
      await setTimeout(100);
    }
    throw new Error('Timed out: ' + code);
  };
  try {
    if (process.env.MARKFIX_AUDIT_SURFACES) {
      for (const route of [
        '/',
        '/docs',
        '/pricing',
        '/download',
        '/privacy',
        '/terms',
        '/login',
        '/register',
        '/verify-email',
        '/forgot-password',
        '/reset-password',
        '/accept-invitation',
        '/account',
      ]) {
        await win.loadURL(origin + route);
        await waitFor(`!!document.querySelector('h1')`);
        await setTimeout(400);
        if (route === '/account')
          await waitFor(`document.querySelector('h1')?.textContent === '测试成员'`);
        const name = route === '/' ? 'home' : route.slice(1);
        writeFileSync(join(output, name + '.png'), (await win.webContents.capturePage()).toPNG());
        if (route === '/') {
          await run(
            `document.querySelector('#experience').scrollIntoView({behavior:'instant',block:'start'})`,
          );
          await setTimeout(400);
          writeFileSync(
            join(output, 'interactive-demo.png'),
            (await win.webContents.capturePage()).toPNG(),
          );
        }
        console.log(
          'SURFACE ' + route + ': ' + (await run(`document.querySelector('h1').textContent`)),
        );
      }
    }
    await win.loadURL(origin + '/app');
    await waitFor(`!!document.querySelector('[role="progressbar"]')`);
    assert.equal(
      await run(`document.querySelector('[role="progressbar"]').getAttribute('aria-valuenow')`),
      '50',
    );
    assert.ok(await run(`document.querySelectorAll('[data-slot="avatar-fallback"]').length > 0`));
    await setTimeout(300);
    writeFileSync(join(output, 'overview.png'), (await win.webContents.capturePage()).toPNG());
    await run(`document.querySelectorAll('.admin-nav button')[1].click()`);
    await waitFor(`!!document.querySelector('.project-progress [role="progressbar"]')`);
    assert.equal(
      await run(
        `document.querySelector('.project-progress [role="progressbar"]').getAttribute('aria-valuenow')`,
      ),
      '50',
    );
    await setTimeout(300);
    writeFileSync(join(output, 'projects.png'), (await win.webContents.capturePage()).toPNG());
    if (process.env.MARKFIX_AUDIT_SURFACES) {
      await run(`document.querySelector('.project-card-open').click()`);
      await waitFor(`!!document.querySelector('.annotation-row')`);
      await setTimeout(300);
      writeFileSync(
        join(output, 'project-drawer.png'),
        (await win.webContents.capturePage()).toPNG(),
      );
      await run(`document.querySelector('.annotation-summary-copy').click()`);
      await waitFor(`!!document.querySelector('.annotation-dialog')`);
      await setTimeout(300);
      writeFileSync(
        join(output, 'annotation-detail.png'),
        (await win.webContents.capturePage()).toPNG(),
      );
      await run(
        `[...document.querySelectorAll('.annotation-dialog button')].find(button => button.textContent.trim() === '关闭').click()`,
      );
      await waitFor(`!document.querySelector('.annotation-dialog')`);
      await run(`document.querySelector('.annotation-actions button[title="编辑"]').click()`);
      await waitFor(`!!document.querySelector('.annotation-dialog input')`);
      await setTimeout(300);
      writeFileSync(
        join(output, 'annotation-editor.png'),
        (await win.webContents.capturePage()).toPNG(),
      );
      await win.loadURL(origin + '/app');
      await waitFor(`!!document.querySelector('.admin-nav')`);
    }
    await run(`document.querySelectorAll('.admin-nav button')[2].click()`);
    await waitFor(`!!document.querySelector('table')`);
    assert.equal(await run(`document.querySelectorAll('table thead th').length`), 4);
    assert.equal(await run(`document.querySelectorAll('table tbody tr').length`), 1);
    assert.ok(
      await run(
        `document.querySelector('table tbody').textContent.includes('member@example.test')`,
      ),
    );
    await setTimeout(300);
    writeFileSync(join(output, 'users.png'), (await win.webContents.capturePage()).toPNG());
    await run(
      `const input=document.querySelector('.admin-search input');Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(input,'no-such-user');input.dispatchEvent(new Event('input',{bubbles:true}));`,
    );
    await waitFor(`!!document.querySelector('[data-slot="empty"]')`);
    assert.equal(await run(`document.querySelectorAll('table tbody tr').length`), 0);
    assert.equal(
      await run(`document.querySelector('[data-slot="empty-title"]').textContent`),
      '没有找到用户',
    );
    await setTimeout(300);
    writeFileSync(join(output, 'empty.png'), (await win.webContents.capturePage()).toPNG());
    if (process.env.MARKFIX_AUDIT_SURFACES) {
      bootstrap.workspaces[0].role = 'REPORTER';
      await win.loadURL(origin + '/app/projects');
      await waitFor(`!!document.querySelector('.project-card-open')`);
      await run(`document.querySelector('.project-card-open').click()`);
      await waitFor(`!!document.querySelector('.annotation-row')`);
      assert.equal(
        await run(`document.querySelectorAll('.annotation-actions, .category-editor').length`),
        0,
      );
      await setTimeout(300);
      writeFileSync(join(output, 'readonly.png'), (await win.webContents.capturePage()).toPNG());
      annotationFailure = true;
      await win.loadURL(origin + '/app/projects');
      await waitFor(`!!document.querySelector('.project-card-open')`);
      await run(`document.querySelector('.project-card-open').click()`);
      await waitFor(`!!document.querySelector('.project-sheet [role="alert"]')`);
      assert.equal(
        await run(`document.querySelectorAll('.project-sheet [data-slot="empty"]').length`),
        0,
      );
      await setTimeout(300);
      writeFileSync(
        join(output, 'annotation-failure.png'),
        (await win.webContents.capturePage()).toPNG(),
      );
      bootstrapDelay = 2000;
      await win.loadURL(origin + '/app');
      await waitFor(`!!document.querySelector('.admin-loading-page')`);
      writeFileSync(join(output, 'loading.png'), (await win.webContents.capturePage()).toPNG());
      await waitFor(`!!document.querySelector('.admin-nav')`);
    }
    console.log('PASS dashboard progress values, table, avatars and filtered empty state');
    console.log('Screenshots: ' + output);
  } catch (error) {
    console.error(error);
    writeFileSync(join(output, 'failure.png'), (await win.webContents.capturePage()).toPNG());
    console.log('Screenshots: ' + output);
    process.exitCode = 1;
  } finally {
    win.destroy();
    server.close();
    app.exit(process.exitCode ?? 0);
  }
}
void main().catch((error) => {
  console.error(error);
  app.exit(1);
});
