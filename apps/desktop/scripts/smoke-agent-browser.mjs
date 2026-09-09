/* global fetch */
import { URL } from 'node:url';
import { Buffer } from 'node:buffer';
import { app, BrowserWindow } from 'electron';
import { createServer } from 'node:http';
import { readFile, mkdir, writeFile } from 'node:fs/promises';
import { resolve, extname, join } from 'node:path';
import { setTimeout } from 'node:timers/promises';
import assert from 'node:assert/strict';
import process from 'node:process';
import console from 'node:console';
const output = process.env.MARKFIX_TEST_OUTPUT;
assert(output && process.env.MARKFIX_TEST_API && process.env.MARKFIX_TEST_TOKEN);
app.setPath('userData', join(output, `browser-${process.env.MARKFIX_TEST_MODE}`));
app.disableHardwareAcceleration();
const dist =
  process.env.MARKFIX_TEST_DASHBOARD_DIST ?? resolve(import.meta.dirname, '../../dashboard/dist');
const server = createServer(async (req, res) => {
  const path = new URL(req.url, 'http://127.0.0.1').pathname;
  if (path.startsWith('/v1/')) {
    try {
      const chunks = [];
      for await (const chunk of req) chunks.push(chunk);
      const body = Buffer.concat(chunks);
      const response = await fetch(process.env.MARKFIX_TEST_API + req.url, {
        method: req.method,
        headers: {
          Authorization: `Bearer ${process.env.MARKFIX_TEST_TOKEN}`,
          Origin: 'http://127.0.0.1:14311',
          ...(body.length ? { 'Content-Type': 'application/json' } : {}),
        },
        ...(body.length ? { body } : {}),
      });
      res.writeHead(response.status, {
        'Content-Type': response.headers.get('content-type') ?? 'application/json',
      });
      res.end(Buffer.from(await response.arrayBuffer()));
    } catch {
      res.writeHead(502);
      res.end('{}');
    }
    return;
  }
  const file = path.startsWith('/assets/') ? resolve(dist, `.${path}`) : join(dist, 'index.html');
  if (!file.startsWith(dist + '/')) {
    res.writeHead(404);
    res.end();
    return;
  }
  try {
    const types = {
      '.js': 'text/javascript',
      '.css': 'text/css',
      '.html': 'text/html',
      '.svg': 'image/svg+xml',
    };
    res.setHeader('Content-Type', types[extname(file)] ?? 'application/octet-stream');
    res.end(await readFile(file));
  } catch {
    res.writeHead(404);
    res.end();
  }
});
app
  .whenReady()
  .then(async () => {
    await new Promise((resolve) => server.listen(14311, '127.0.0.1', resolve));
    const window = new BrowserWindow({
      width: 1280,
      height: 920,
      show: false,
      webPreferences: { contextIsolation: true, sandbox: true },
    });
    const run = (code) => window.webContents.executeJavaScript(code, true);
    async function waitFor(code) {
      for (let i = 0; i < 100; i++) {
        if (await run(code)) return;
        await setTimeout(100);
      }
      await screenshot('browser-failure.png');
      throw new Error(
        `UI assertion timed out: ${code}; page: ${await run('document.body.innerText')}`,
      );
    }
    async function screenshot(name) {
      await setTimeout(200);
      await writeFile(join(output, name), (await window.webContents.capturePage()).toPNG());
    }
    try {
      await mkdir(output, { recursive: true });
      if (process.env.MARKFIX_TEST_MODE === 'authorize') {
        await window.loadURL(
          `http://127.0.0.1:14311/agent/authorize?code=${process.env.MARKFIX_TEST_CODE}`,
        );
        await waitFor(`document.body.textContent.includes('授权此设备')`);
        assert.equal(
          await run(
            `Array.from(document.querySelectorAll('button')).find(b=>b.textContent==='授权此设备').disabled`,
          ),
          true,
        );
        await run(
          `Array.from(document.querySelectorAll('label')).find(l=>l.textContent==='Agent flow').querySelector('[role="checkbox"]').click()`,
        );
        await screenshot('authorization.png');
        await run(
          `Array.from(document.querySelectorAll('button')).find(b=>b.textContent==='授权此设备').click()`,
        );
        await waitFor(`document.body.textContent.includes('已授权，请返回终端')`);
        await screenshot('authorized.png');
      } else {
        await window.loadURL('http://127.0.0.1:14311/app/projects');
        await waitFor(`!!document.querySelector('.project-card-open')`);
        await run(
          `Array.from(document.querySelectorAll('.project-card-open')).find(b=>b.textContent.includes('Agent flow')).click()`,
        );
        await waitFor(`document.body.textContent.includes('Sum returns subtraction')`);
        await screenshot(`${process.env.MARKFIX_TEST_MODE}-project.png`);
        await run(
          `Array.from(document.querySelectorAll('.annotation-summary-copy')).find(r=>r.textContent.includes('Sum returns subtraction')).click()`,
        );
        await waitFor(`document.body.textContent.includes('Missing fixture')`);
        assert(
          await run(
            `document.body.textContent.includes(${JSON.stringify(process.env.MARKFIX_TEST_MODE === 'failed' ? '修复失败' : '已完成')})`,
          ),
        );
        await screenshot(`${process.env.MARKFIX_TEST_MODE}-detail.png`);
      }
      console.log(`PASS browser ${process.env.MARKFIX_TEST_MODE}: ${output}`);
    } finally {
      window.destroy();
      server.closeAllConnections();
      await new Promise((resolve) => server.close(resolve));
    }
    app.exit(0);
  })
  .catch((error) => {
    console.error(error);
    app.exit(1);
  });
