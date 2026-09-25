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
const dist =
  process.env.MARKFIX_TEST_DASHBOARD_DIST ?? resolve(import.meta.dirname, '../../dashboard/dist');
const now = new Date().toISOString();
const user = {
  id: 'user',
  displayName: '测试成员',
  email: 'member@example.test',
  projectRoles: { project: 'ADMIN' },
  projectIds: ['project'],
  annotationCount: 2,
  rejectedCount: 0,
  projectCategories: [{ category: '网站', count: 2 }],
  createdAt: now,
  updatedAt: now,
};
const project = {
  id: 'project',
  ownerId: 'user',
  role: 'ADMIN',
  name: '组件验收项目',
  baseUrl: 'https://example.test',
  category: '网站',
  annotationCount: 2,
  resolvedCount: 1,
  failedCount: 0,
  memberCount: 1,
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
  overview,
};
let downloadState = 'ready';
let repositoryBinding = { repositoryId: null, repositoryName: null };
let annotationFailure = false;
let annotationUpdate;
let bootstrapDelay = 0;
let readGrantActive = false;
let readGrantVersion = 0;
const server = createServer(async (req, res) => {
  const path = new URL(req.url, 'http://localhost').pathname;
  res.setHeader('Access-Control-Allow-Origin', req.headers.origin ?? '*');
  res.setHeader('Access-Control-Allow-Credentials', 'true');
  res.setHeader('Access-Control-Allow-Headers', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PATCH, DELETE, OPTIONS');
  if (req.method === 'OPTIONS') {
    res.end();
    return;
  }
  if (path === '/v1/projects/project/read-authorization') {
    res.setHeader('Content-Type', 'application/json');
    if (req.method === 'POST') {
      readGrantActive = true;
      readGrantVersion++;
    } else if (req.method === 'DELETE') readGrantActive = false;
    res.end(
      JSON.stringify({
        active: readGrantActive,
        expiresAt: readGrantActive ? '2099-01-01T00:00:00.000Z' : null,
        ...(req.method === 'POST'
          ? { authorizationUrl: `https://example.test/feed#token=fixture-${readGrantVersion}` }
          : {}),
      }),
    );
    return;
  }
  if (path.endsWith('/binding')) {
    res.setHeader('Content-Type', 'application/json');
    if (req.method === 'PATCH') {
      let body = '';
      for await (const chunk of req) body += chunk.toString();
      repositoryBinding = JSON.parse(body);
      assert.equal(repositoryBinding.repositoryId, '22222222-2222-4222-8222-222222222222');
    }
    res.end(JSON.stringify(repositoryBinding));
    return;
  }
  if (path.endsWith('/repositories')) {
    res.setHeader('Content-Type', 'application/json');
    res.end(
      JSON.stringify([
        { id: '22222222-2222-4222-8222-222222222222', name: 'markfix-ui', deviceName: 'QA Mac' },
      ]),
    );
    return;
  }
  if (path === '/v1/client-policy') {
    res.setHeader('Content-Type', 'application/json');
    if (downloadState === 'error') {
      res.statusCode = 503;
      res.end('{}');
      return;
    }
    const windows = new URL(req.url, 'http://localhost').searchParams.get('platform') === 'win32';
    const installer = windows ? 'MarkFix-windows-x64-setup.exe' : 'MarkFix-arm64.dmg';
    res.end(
      JSON.stringify({
        minimumVersion: '0.1.0',
        recommendedVersion: '0.1.0',
        currentVersion: '0.1.0',
        status: 'supported',
        features: {},
        ...(downloadState === 'ready'
          ? { downloadUrl: `https://downloads.example.test/${installer}`, distribution: 'trial' }
          : downloadState === 'unsafe'
            ? { downloadUrl: `http://downloads.example.test/${installer}` }
            : {}),
      }),
    );
    return;
  }
  if (path === '/v1/projects') {
    res.setHeader('Content-Type', 'application/json');
    res.end(
      JSON.stringify([
        {
          ...project,
          id: '11111111-1111-4111-8111-111111111111',
          ownerId: '22222222-2222-4222-8222-222222222222',
        },
      ]),
    );
    return;
  }
  if (path === '/v1/agent/grants') {
    res.setHeader('Content-Type', 'application/json');
    res.end(JSON.stringify([]));
    return;
  }
  if (path === '/v1/me') {
    res.setHeader('Content-Type', 'application/json');
    res.end(JSON.stringify(user));
    return;
  }
  if (path === '/v1/commercial/annotations/annotation' && req.method === 'PATCH') {
    let body = '';
    for await (const chunk of req) body += chunk.toString();
    annotationUpdate = JSON.parse(body);
    res.setHeader('Content-Type', 'application/json');
    res.end(JSON.stringify({ id: 'annotation', version: 2 }));
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
            version: 1,
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
  const run = (code) =>
    win.webContents.executeJavaScript(code).catch((error) => {
      console.error('Renderer expression:', code);
      throw error;
    });
  const waitFor = async (code) => {
    for (let attempt = 0; attempt < 150; attempt++) {
      if (await run(code)) return;
      await setTimeout(100);
    }
    throw new Error('Timed out: ' + code);
  };
  try {
    if (process.env.MARKFIX_WINDOWS_DOCS_SMOKE) {
      await win.loadURL(origin + '/docs#development');
      await waitFor("Boolean(document.querySelector('#development'))");
      await run(
        "document.querySelector('#development').scrollIntoView({block:'start',behavior:'instant'})",
      );
      await waitFor(
        "Math.abs(document.querySelector('#development').getBoundingClientRect().top) < 150",
      );
      await setTimeout(250);
      assert.equal(
        await run(
          "document.querySelector('#development').textContent.includes('Windows 安装与更新')",
        ),
        true,
      );
      writeFileSync(
        join(output, 'windows-install-docs.png'),
        (await win.webContents.capturePage()).toPNG(),
      );
      console.log('PASS Windows install documentation; Screenshots: ' + output);
      return;
    }
    if (process.env.MARKFIX_DOWNLOAD_SMOKE) {
      for (const platform of ['darwin', 'win32']) {
        for (const state of ['ready', 'unpublished', 'error', 'unsafe']) {
          downloadState = state;
          await win.loadURL(origin + '/download?platform=' + platform);
          await waitFor(
            "!!document.querySelector('.download-copy') && !document.body.textContent.includes('正在获取下载地址')",
          );
          const href = await run(
            "document.querySelector('.download-actions a[data-slot=button]')?.href ?? null",
          );
          const expected =
            platform === 'win32' ? 'MarkFix-windows-x64-setup.exe' : 'MarkFix-arm64.dmg';
          assert.equal(
            href,
            state === 'ready' ? 'https://downloads.example.test/' + expected : null,
          );
          if (state !== 'ready')
            assert.equal(
              await run("document.querySelector('.download-actions button').disabled"),
              true,
            );
          if (state === 'ready') {
            assert.equal(
              await run(
                "document.querySelector('[role=note]')?.textContent.includes('未签名试用版')",
              ),
              true,
            );
            await setTimeout(150);
            if (!process.env.MARKFIX_SMOKE_NO_SCREENSHOTS)
              writeFileSync(
                join(output, 'download-' + platform + '.png'),
                (await win.webContents.capturePage()).toPNG(),
              );
          }
        }
      }
      downloadState = 'ready';
      await win.loadURL(origin + '/download?platform=darwin');
      await waitFor("Boolean(document.querySelector('.download-actions a[data-slot=button]'))");
      await run(
        "[...document.querySelectorAll('.download-platforms button')].find(b=>b.textContent==='Windows').click()",
      );
      await waitFor(
        "document.querySelector('.download-actions a[data-slot=button]')?.href.endsWith('.exe')",
      );
      assert.equal(
        await run("document.querySelector('.download-platforms [aria-pressed=true]').textContent"),
        'Windows',
      );
      await run("document.querySelector('.download-platforms [aria-pressed=true]').click()");
      assert.equal(
        await run("Boolean(document.querySelector('.download-actions a[data-slot=button]'))"),
        true,
      );
      await run(
        "[...document.querySelectorAll('.download-platforms button')].find(b=>b.textContent==='macOS').click()",
      );
      await waitFor(
        "document.querySelector('.download-actions a[data-slot=button]')?.href.endsWith('.dmg')",
      );
      assert.equal(
        await run("document.querySelector('.download-platforms [aria-pressed=true]').textContent"),
        'macOS',
      );
      await win.loadURL(origin + '/docs#shortcuts');
      await waitFor("Boolean(document.querySelector('#shortcuts table'))");
      assert.equal(
        await run("document.querySelector('#shortcuts table').textContent.includes('Windows')"),
        true,
      );
      await run(
        "document.querySelector('#shortcuts').scrollIntoView({block:'start',behavior:'instant'})",
      );
      await setTimeout(250);
      if (!process.env.MARKFIX_SMOKE_NO_SCREENSHOTS)
        writeFileSync(
          join(output, 'windows-shortcuts.png'),
          (await win.webContents.capturePage()).toPNG(),
        );
      await run(
        "document.querySelector('#development').scrollIntoView({block:'start',behavior:'instant'})",
      );
      await setTimeout(250);
      if (!process.env.MARKFIX_SMOKE_NO_SCREENSHOTS)
        writeFileSync(
          join(output, 'windows-install-docs.png'),
          (await win.webContents.capturePage()).toPNG(),
        );
      await win.setSize(390, 844);
      await win.loadURL(origin + '/download?platform=win32');
      await waitFor("Boolean(document.querySelector('.download-actions a[data-slot=button]'))");
      assert.equal(await run('document.documentElement.scrollWidth <= innerWidth'), true);
      if (!process.env.MARKFIX_SMOKE_NO_SCREENSHOTS)
        writeFileSync(
          join(output, 'download-win32-mobile.png'),
          (await win.webContents.capturePage()).toPNG(),
        );
      console.log(
        'PASS Mac/Windows download routing, unavailable/error/unsafe states, platform switching, mobile layout and Windows docs',
      );
      console.log('Screenshots: ' + output);
      return;
    }
    await win.loadURL(origin + '/docs#agent');
    await waitFor(`!!document.querySelector('#cli-authorize pre code')`);
    assert.equal(
      await run(`document.querySelector('#cli-authorize pre code').textContent`),
      `cd /path/to/your-repository\nmarkfix projects list --server ${origin} --allow-local-http`,
    );
    await run(
      `document.querySelector('#agent').scrollIntoView({block:'start',behavior:'instant'})`,
    );
    await setTimeout(250);
    writeFileSync(
      join(output, 'cli-service-origin.png'),
      (await win.webContents.capturePage()).toPNG(),
    );
    console.log('PASS CLI first-use command uses the current website origin');
    for (const id of ['storage-mode', 'development']) {
      await run(
        `document.getElementById('${id}').scrollIntoView({block:'start',behavior:'instant'})`,
      );
      await setTimeout(250);
      writeFileSync(join(output, id + '.png'), (await win.webContents.capturePage()).toPNG());
    }
    if (process.env.MARKFIX_MARKETING_SMOKE) {
      const click = async (selector) => {
        await run(`document.querySelector(${JSON.stringify(selector)}).click()`);
        await setTimeout(100);
      };
      const note = async (value) => {
        await run(
          `(()=>{const el=document.querySelector('[aria-label="批注内容"]');Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype,'value').set.call(el,${JSON.stringify(value)});el.dispatchEvent(new Event('input',{bubbles:true}))})()`,
        );
        await setTimeout(100);
      };
      const screenshot = async (name) => {
        await setTimeout(200);
        writeFileSync(join(output, name + '.png'), (await win.webContents.capturePage()).toPNG());
      };
      await win.loadURL(origin);
      await waitFor(`!!document.querySelector('.mf-demo-shell')`);
      await run(`document.querySelectorAll('.premium-site img').forEach(img=>img.loading='eager')`);
      await waitFor(
        `[...document.querySelectorAll('.premium-site img')].every(img=>img.complete && img.naturalWidth>0)`,
      );
      await screenshot('marketing-home');
      assert.equal(await run(`document.querySelectorAll('.home-workflow li').length`), 4);
      await run(
        `document.querySelector('.home-workflow').scrollIntoView({block:'center',behavior:'instant'})`,
      );
      await screenshot('marketing-workflow');
      await click('.home-demo-disclosure summary');
      await run(
        `document.querySelector('.mf-demo-shell').scrollIntoView({block:'start',behavior:'instant'})`,
      );
      await click('[aria-label="标注页面主标题"]');
      await note('请调整标题间距');
      assert.equal(
        await run(`getComputedStyle(document.querySelector('[aria-label="批注内容"]')).fontSize`),
        '12px',
      );
      await screenshot('marketing-demo-note');
      await click('[aria-label="保存批注"]');
      assert.equal(
        await run(`document.querySelectorAll('.mf-demo-comment-list article').length`),
        1,
      );
      await click('.mf-demo-home .premium-hero-actions button:last-child');
      assert.equal(await run(`location.pathname`), '/');
      await waitFor(`!!document.querySelector('[aria-label="批注内容"]')`);
      await click('[aria-label="取消批注"]');
      await click('.mf-demo-replay');
      await note('修改后的标题建议');
      await click('[aria-label="保存批注"]');
      assert.equal(
        await run(`document.querySelectorAll('.mf-demo-comment-list article').length`),
        1,
      );
      assert.equal(
        await run(`document.querySelector('.mf-demo-replay p').textContent`),
        '修改后的标题建议',
      );
      await click('[aria-label="批注模式"]');
      await run(`document.querySelector('.mf-demo-site-header a[href="/pricing"]').click()`);
      await setTimeout(100);
      await click('[aria-label="批注模式"]');
      assert.equal(
        await run(`document.querySelectorAll('.mf-demo-comment-list article').length`),
        0,
      );
      await click('[aria-label="批注模式"]');
      await run(`document.querySelector('.mf-demo-site-header a[href="/"]').click()`);
      await setTimeout(100);
      await click('[aria-label="批注模式"]');
      assert.equal(
        await run(`document.querySelectorAll('.mf-demo-comment-list article').length`),
        1,
      );
      await click('[aria-label="截图模式"]');
      await run(
        `(()=>{const el=document.querySelector('.mf-capture-demo'),r=el.getBoundingClientRect();for(const [type,x,y] of [['pointerdown',30,180],['pointermove',350,400],['pointerup',350,400]])el.dispatchEvent(new PointerEvent(type,{bubbles:true,clientX:r.left+x,clientY:r.top+y,pointerId:1,button:0}))})()`,
      );
      await waitFor(`!!document.querySelector('.mf-capture-toolbar')`);
      assert.equal(
        await run(
          `getComputedStyle(document.querySelector('.mf-capture-toolbar')).backgroundColor`,
        ),
        'rgb(255, 255, 255)',
      );
      await screenshot('marketing-demo-capture');
      await click('.mf-capture-toolbar .is-finish');
      await note('截图备注');
      await click('[aria-label="保存批注"]');
      assert.equal(
        await run(`document.querySelectorAll('.mf-demo-comment-list article').length`),
        2,
      );
      await click('[aria-label="删除第 1 条批注"]');
      assert.equal(
        await run(`document.querySelectorAll('.mf-demo-comment-list article').length`),
        1,
      );
      for (const state of ['ready', 'unpublished', 'error', 'unsafe']) {
        downloadState = state;
        await win.loadURL(origin + '/download');
        await waitFor(
          `!!document.querySelector('.download-copy') && !document.body.textContent.includes('正在获取下载地址')`,
        );
        assert.equal(
          await run(
            `!!document.querySelector('.download-actions a[href="https://downloads.example.test/MarkFix-arm64.dmg"]')`,
          ),
          state === 'ready',
        );
        if (state !== 'ready')
          assert.equal(
            await run(`document.querySelector('.download-actions button').disabled`),
            true,
          );
        await screenshot('marketing-download-' + state);
      }
      for (const route of ['/docs', '/pricing']) {
        await win.loadURL(origin + route);
        await waitFor(`!!document.querySelector('h1')`);
        await screenshot('marketing' + route.replace('/', '-'));
        if (route === '/docs') {
          await run(
            `document.querySelector('#cli-local').scrollIntoView({block:'start',behavior:'instant'})`,
          );
          await screenshot('marketing-cli-local');
          assert.equal(
            await run(
              `document.querySelector('#cli-upgrade').textContent.includes('markfix skill install --force')`,
            ),
            true,
          );
        }
      }
      win.setContentSize(390, 844);
      await win.loadURL(origin);
      await waitFor(`!!document.querySelector('.mf-demo-shell')`);
      assert.equal(await run(`document.documentElement.scrollWidth <= innerWidth`), true);
      await screenshot('marketing-mobile');
      await click('.home-demo-disclosure summary');
      await run(`document.querySelector('.mf-demo-shell').scrollIntoView({behavior:'instant'})`);
      await click('[aria-label="标注页面主标题"]');
      await note('移动端建议');
      await click('[aria-label="保存批注"]');
      assert.equal(
        await run(`document.querySelectorAll('.mf-demo-comment-list article').length`),
        1,
      );
      await screenshot('marketing-mobile-demo');
      console.log(
        'PASS marketing: images, 12px notes, editing, page isolation, capture, deletion, download states, docs, pricing and mobile',
      );
      console.log('Screenshots: ' + output);
      return;
    }
    if (process.env.MARKFIX_AUDIT_SURFACES && !process.env.MARKFIX_AUDIT_APP_ONLY) {
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
        if (route === '/account') {
          await waitFor(`document.querySelector('h1')?.textContent === '测试成员'`);
          await waitFor(
            `document.body.textContent.includes('暂无设备授权。') && !document.body.textContent.includes('正在读取授权信息')`,
          );
          assert.equal(
            await run(`document.querySelectorAll('[role="alert"]').length`),
            0,
            await run(
              `Array.from(document.querySelectorAll('[role="alert"]')).map(node => node.textContent).join('\\n')`,
            ),
          );
        }
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
      await run(`document.querySelector('button[title="项目设置"]').click()`);
      await waitFor(`!!document.querySelector('.repository-binding [role="combobox"]')`);
      assert.equal(
        await run(
          `document.querySelector('.repository-binding [role="radio"][value="existing"]').getAttribute('aria-checked')`,
        ),
        'true',
      );
      await run(`document.querySelector('.repository-binding [role="combobox"]').click()`);
      await waitFor(`!!document.querySelector('[role="option"]')`);
      await run(`document.querySelector('[role="option"]').click()`);
      assert.ok(
        await run(
          `document.querySelector('.repository-binding [role="combobox"]').textContent.includes('markfix-ui')`,
        ),
      );
      await run(
        `[...document.querySelectorAll('.repository-binding button')].find(button=>button.textContent==='保存').click()`,
      );
      await waitFor(
        `document.querySelector('.repository-binding [role="status"]')?.textContent === '绑定已保存'`,
      );

      writeFileSync(
        join(output, 'project-settings.png'),
        (await win.webContents.capturePage()).toPNG(),
      );
      win.webContents.sendInputEvent({ type: 'keyDown', keyCode: 'Escape' });
      win.webContents.sendInputEvent({ type: 'keyUp', keyCode: 'Escape' });
      await waitFor(`!document.querySelector('.project-settings-dialog')`);
      await run(`document.querySelector('.project-card-open').click()`);
      await waitFor(`!!document.querySelector('.annotation-row')`);
      await run(`document.querySelector('.annotation-read-authorization summary').click()`);
      const grantButton = (label) =>
        `[...document.querySelectorAll('.annotation-read-authorization button')].find(button=>button.textContent===${JSON.stringify(label)})`;
      await waitFor(`Boolean(${grantButton('生成授权地址')})`);
      await run(`${grantButton('生成授权地址')}.click()`);
      await waitFor(
        `document.querySelector('[aria-label="授权地址"]')?.value.endsWith('fixture-1')`,
      );
      await run(`${grantButton('重新生成授权地址')}.click()`);
      await waitFor(
        `document.querySelector('[aria-label="授权地址"]')?.value.endsWith('fixture-2')`,
      );
      writeFileSync(
        join(output, 'read-authorization.png'),
        (await win.webContents.capturePage()).toPNG(),
      );
      await run(`${grantButton('撤销授权')}.click()`);
      await waitFor(
        `!document.querySelector('[aria-label="授权地址"]') && Boolean(${grantButton('生成授权地址')})`,
      );
      assert.equal(readGrantActive, false);
      assert.equal(readGrantVersion, 2);
      await run(`document.querySelector('.annotation-read-authorization summary').click()`);
      await setTimeout(300);
      writeFileSync(
        join(output, 'project-details.png'),
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
      await run(
        `document.querySelector('.annotation-actions button[title="更多操作"]').dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, button: 0, pointerType: 'mouse' }))`,
      );
      await waitFor(`!!document.querySelector('[role="menuitem"]')`);
      await run(
        `[...document.querySelectorAll('[role="menuitem"]')].find(item => item.textContent.trim() === '编辑').click()`,
      );
      await waitFor(`!!document.querySelector('.annotation-dialog input')`);
      await setTimeout(300);
      writeFileSync(
        join(output, 'annotation-editor.png'),
        (await win.webContents.capturePage()).toPNG(),
      );
      await run(
        `[...document.querySelectorAll('.annotation-dialog button')].find(button => button.textContent.trim() === '保存标注').click()`,
      );
      await waitFor(`!document.querySelector('.annotation-dialog')`);
      assert.equal(annotationUpdate?.expectedVersion, 1);
      assert.equal(annotationUpdate?.title, '审查用批注');
      console.log('PASS: annotation editor submits the displayed expectedVersion');
      await win.loadURL(origin + '/app');
      await waitFor(`!!document.querySelector('.admin-nav')`);
    }
    await run(`document.querySelectorAll('.admin-nav button')[2].click()`);
    await waitFor(`!!document.querySelector('table')`);
    assert.equal(await run(`document.querySelectorAll('table thead th').length`), 5);
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
      project.role = 'REPORTER';
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
      await waitFor(`!!document.querySelector('.project-details-page [role="alert"]')`);
      assert.equal(
        await run(`document.querySelectorAll('.project-details-page [data-slot="empty"]').length`),
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
