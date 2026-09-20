import { app, BrowserWindow, webContents } from 'electron';
import assert from 'node:assert/strict';
import { readFile, writeFile } from 'node:fs/promises';
import { mkdtempSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createServer } from 'node:http';
import { randomUUID } from 'node:crypto';
import { setTimeout as delay } from 'node:timers/promises';
import process from 'node:process';
import console from 'node:console';

const output = mkdtempSync(join(tmpdir(), 'markfix-local-smoke-'));
mkdirSync(join(output, 'profile'), { recursive: true });
app.setPath('userData', join(output, 'profile'));
app.disableHardwareAcceleration();
process.env.MARKFIX_LOCAL_AGENT_FILE = join(output, 'agent.json');
delete process.env.MARKFIX_ALLOW_HTTP;
async function main() {
  const website = createServer((req, res) => {
    if (req.url === '/redirect') {
      res.writeHead(302, { Location: '/redirected' });
      res.end();
      return;
    }
    res.setHeader('Content-Type', 'text/html');
    res.end('<html><title>Local smoke</title><body><h1>Local issue</h1></body></html>');
  });
  await new Promise((resolve) => website.listen(0, '127.0.0.1', resolve));
  const siteUrl = `http://127.0.0.1:${website.address().port}`;
  const originalFetch = globalThis.fetch;
  // No cloud API calls or existing account data are allowed in this isolated fixture.
  globalThis.fetch = (url, options) => {
    if (!String(url).startsWith('http://127.0.0.1:')) return new Promise(() => {});
    return originalFetch(url, options);
  };
  async function waitFor(check) {
    for (let attempt = 0; attempt < 300; attempt++) {
      const result = await check();
      if (result) return result;
      await delay(100);
    }
    throw new Error('UI state did not become ready');
  }
  try {
    await app.whenReady();
    await import('../out/main/index.js');
    const window = await waitFor(async () =>
      BrowserWindow.getAllWindows().find((item) => !item.isDestroyed()),
    );
    await waitFor(async () =>
      window.webContents
        .executeJavaScript("document.body.innerText.includes('仅在本机使用')")
        .catch(() => false),
    );
    await window.webContents.executeJavaScript(
      "[...document.querySelectorAll('button')].find(b=>b.textContent==='仅在本机使用').click()",
    );
    await waitFor(async () =>
      window.webContents.executeJavaScript(
        'Boolean(document.querySelector(\'form[aria-label="新建标注"]\'))',
      ),
    );
    assert.equal(
      await window.webContents.executeJavaScript(
        'Boolean(document.querySelector(\'[aria-label="云端协作"]\'))',
      ),
      false,
    );
    const project = await window.webContents.executeJavaScript(
      `window.markfix.createWebsiteProject('LOCAL', ${JSON.stringify(siteUrl)})`,
    );
    const projectId = project.project.id;
    const target = await waitFor(async () =>
      webContents.getAllWebContents().find((item) => item.getURL().startsWith(siteUrl)),
    );
    await waitFor(async () => !target.isLoading());
    assert.equal(await target.executeJavaScript('typeof process'), 'undefined');
    assert.equal(await target.executeJavaScript('typeof require'), 'undefined');
    assert.equal(await target.executeJavaScript('typeof window.markfix'), 'undefined');
    for (const path of ['/linked', '/redirect']) {
      await target.executeJavaScript(
        `location.href = ${JSON.stringify(siteUrl)} + ${JSON.stringify(path)}`,
      );
      await waitFor(
        async () =>
          target.getURL() === siteUrl + (path === '/redirect' ? '/redirected' : path) &&
          !target.isLoading(),
      );
    }
    const windowCount = BrowserWindow.getAllWindows().length;
    await target.executeJavaScript(`window.open(${JSON.stringify(siteUrl + '/popup')})`);
    await waitFor(async () => target.getURL() === siteUrl + '/popup' && !target.isLoading());
    assert.equal(BrowserWindow.getAllWindows().length, windowCount);
    await target.executeJavaScript("window.open('file:///etc/passwd')");
    await delay(200);
    assert.equal(target.getURL(), siteUrl + '/popup');
    await target.executeJavaScript(`location.href = ${JSON.stringify(siteUrl + '/')}`);
    await waitFor(async () => target.getURL() === siteUrl + '/' && !target.isLoading());
    await assert.rejects(
      window.webContents.executeJavaScript(
        `window.markfix.createWebsiteProject('CLOUD', ${JSON.stringify(siteUrl)})`,
      ),
    );
    const record = {
      id: randomUUID(),
      projectId,
      pageSessionId: project.project.currentPageSessionId,
      pageTitle: 'Local smoke',
      pageUrl: siteUrl + '/',
      status: 'draft',
      note: '本机批注持久化',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      anchor: {
        runtimeEvidence: {
          schemaVersion: 1,
          selectorCandidates: [],
          classNames: [],
          ancestorPath: [],
          nearbyText: [],
          pageBuild: {
            scripts: [],
            stylesheets: [],
            sourceMapHints: [],
            metadata: {},
            frameworkHints: [],
          },
        },
        kind: 'element',
        cssSelector: 'h1',
        textQuote: 'Local issue',
        tagName: 'h1',
        attributes: {},
        documentUrl: siteUrl + '/',
        framePath: [],
        quadsCssPx: [[0, 0, 100, 0, 100, 40, 0, 40]],
      },
    };
    await window.webContents.executeJavaScript(
      `window.markfix.saveElementComment(${JSON.stringify(record)})`,
    );
    await window.webContents.executeJavaScript(
      `window.markfix.saveAnnotationSubmission(${JSON.stringify({ id: randomUUID(), projectId, elementComments: [record], captures: [], diagnostics: [], submittedAt: new Date().toISOString() })})`,
    );
    const descriptor = JSON.parse(await readFile(process.env.MARKFIX_LOCAL_AGENT_FILE, 'utf8'));
    const request = async (path, body, token) => {
      const response = await originalFetch(descriptor.origin + '/v1/agent' + path, {
        method: body === undefined ? 'GET' : 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-MarkFix-Local-Secret': descriptor.secret,
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        ...(body === undefined ? {} : { body: JSON.stringify(body) }),
      });
      assert.equal(response.status, 200);
      return response.json();
    };
    const repo = await request('/repositories', { localId: randomUUID(), name: 'local-smoke' });
    await window.webContents.executeJavaScript(
      `window.markfix.setProjectRepository(${JSON.stringify(projectId)},${JSON.stringify({ repositoryId: repo.id, repositoryName: repo.name })})`,
    );
    const binding = await window.webContents.executeJavaScript(
      `window.markfix.getProjectAgentData(${JSON.stringify(projectId)})`,
    );
    assert.equal(binding.binding.repositoryId, repo.id);
    const report = await request('/issues/' + record.id, undefined);
    const runId = randomUUID();
    await request(`/issues/${record.id}/claim`, { runId, expectedVersion: report.version });
    await request(`/fixes/${runId}/fail`, {
      summary: '尚未完成',
      reason: '缺少测试账号',
      stage: 'verification',
    });
    const reports = await window.webContents.executeJavaScript(
      `window.markfix.listProjectAnnotationReports(${JSON.stringify(projectId)},${JSON.stringify(siteUrl + '/')})`,
    );
    assert.equal(reports[0].status, 'FIX_FAILED');
    assert.equal(reports[0].fixAttempts[0].reason, '缺少测试账号');
    // Reload the renderer so the project is selected through the regular bootstrap path.
    await window.reload();
    await waitFor(async () =>
      window.webContents.executeJavaScript("document.body.innerText.includes('仅在本机使用')"),
    );
    await window.webContents.executeJavaScript(
      "[...document.querySelectorAll('button')].find(b=>b.textContent==='仅在本机使用').click()",
    );
    await waitFor(async () =>
      window.webContents.executeJavaScript("document.body.innerText.includes('Local smoke')"),
    );
    await window.webContents.executeJavaScript(
      "[...document.querySelectorAll('button')].find(b=>b.textContent.includes('Local smoke')).click()",
    );
    await waitFor(async () =>
      window.webContents.executeJavaScript(
        'Boolean(document.querySelector(\'[title="批注（⌥W）"]\'))',
      ),
    );
    await window.webContents.executeJavaScript(
      'document.querySelector(\'[title="批注（⌥W）"]\').click()',
    );
    await window.webContents.executeJavaScript(
      "if (!document.querySelector('aside.comment-panel')) document.querySelector('.preview-toggle-button').click()",
    );
    // The current preview contains only draft/rejected records, not submitted reports.
    await waitFor(async () =>
      window.webContents.executeJavaScript(
        "Boolean(document.querySelector('aside.comment-panel'))",
      ),
    );
    assert.equal(
      await window.webContents.executeJavaScript(
        "document.querySelector('aside.comment-panel').innerText.includes('本机批注持久化')",
      ),
      false,
    );
    const reloadedReports = await window.webContents.executeJavaScript(
      `window.markfix.listProjectAnnotationReports(${JSON.stringify(projectId)},${JSON.stringify(siteUrl + '/')})`,
    );
    assert.equal(reloadedReports[0].description, record.note);
    assert.equal(reloadedReports[0].status, 'FIX_FAILED');
    assert.equal(reloadedReports[0].fixAttempts[0].reason, '缺少测试账号');
    await delay(350);
    await writeFile(join(output, 'desktop.png'), (await window.webContents.capturePage()).toPNG());
    const failedReport = await request('/issues/' + record.id, undefined);
    const retryId = randomUUID();
    await request(`/issues/${record.id}/claim`, {
      runId: retryId,
      expectedVersion: failedReport.version,
      retry: true,
    });
    await request(`/fixes/${retryId}/complete`, {
      summary: '隔离烟测修复完成',
      checks: [
        { command: 'local fixture verification', outcome: 'passed', details: '用例检查通过' },
      ],
    });
    const completedReports = await window.webContents.executeJavaScript(
      `window.markfix.listProjectAnnotationReports(${JSON.stringify(projectId)},${JSON.stringify(siteUrl + '/')})`,
    );
    assert.equal(completedReports[0].status, 'RESOLVED');
    assert.ok(
      completedReports[0].fixAttempts.some(
        (attempt) => attempt.summary === '隔离烟测修复完成' && attempt.status === 'SUCCEEDED',
      ),
    );
    await delay(350);
    await writeFile(
      join(output, 'completed.png'),
      (await window.webContents.capturePage()).toPNG(),
    );
    await window.webContents.executeJavaScript('window.markfix.openSettings()');
    const settings = await waitFor(async () =>
      BrowserWindow.getAllWindows().find((item) => item !== window && !item.isDestroyed()),
    );
    await waitFor(async () =>
      settings.webContents
        .executeJavaScript("document.body.innerText.includes('启动与新标注')")
        .catch(() => false),
    );
    assert.equal(
      await settings.webContents.executeJavaScript(
        "document.body.innerText.includes('管理本机授权')",
      ),
      false,
    );
    await delay(350);
    await writeFile(
      join(output, 'settings.png'),
      (await settings.webContents.capturePage()).toPNG(),
    );
    settings.close();
    console.log(
      JSON.stringify({
        passed: true,
        output,
        checks: [
          'HTTP entry, links, redirects and popup navigation without environment override',
          'unsafe popup blocked and target has no Node or shell bridge',
          'offline local entry',
          'cloud creation refused',
          'local submission',
          'local CLI without approval',
          'repository binding',
          'claim and failure writeback',
          'retry and completed result persisted',
          'settings without authorization management',
        ],
      }),
    );
  } catch (error) {
    console.error(error);
    process.exitCode = 1;
  } finally {
    website.close();
    if (process.exitCode) app.exit(process.exitCode);
    else app.quit();
  }
}
void main().catch((error) => {
  console.error(error);
  app.exit(1);
});
