// Exercise the actual executable and its bundled SQLite using Node's built-in CDP client.
// On Windows, APPDATA/LOCALAPPDATA isolate all writes from the user's installed profile.
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { mkdtempSync, mkdirSync } from 'node:fs';
import { createServer } from 'node:http';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { setTimeout } from 'node:timers/promises';
import { setTimeout as startTimer, clearTimeout } from 'node:timers';
import process from 'node:process';
import console from 'node:console';

assert.ok(['win32', 'darwin'].includes(process.platform));
const windows = process.platform === 'win32';
if (!windows)
  assert.equal(
    process.env.GITHUB_ACTIONS,
    'true',
    'macOS packaged smoke requires an ephemeral GitHub runner',
  );
assert.ok(process.argv[2], 'Pass the installed MarkFix executable path');
const profile = mkdtempSync(join(tmpdir(), 'markfix-installed-'));
for (const name of ['Roaming', 'Local']) mkdirSync(join(profile, name));
const server = createServer((req, res) => {
  if (req.url.startsWith('/v1/client-policy')) {
    res.setHeader('Content-Type', 'application/json');
    res.end(
      JSON.stringify({
        currentVersion: '0.1.0',
        minimumVersion: '0.1.0',
        recommendedVersion: '0.1.0',
        status: 'supported',
        features: {},
      }),
    );
  } else if (req.url === '/fixture') {
    res.end('<!doctype html><title>Windows package fixture</title><h1>Packaged SQLite check</h1>');
  } else {
    res.statusCode = 404;
    res.end('{}');
  }
});
server.listen(0, '127.0.0.1');
await once(server, 'listening');
const origin = `http://127.0.0.1:${server.address().port}`;
let child;
let socket;
let exited;
let logs = '';
const pending = new Map();
let nextId = 0;

async function waitFor(check, label) {
  const end = Date.now() + 20000;
  while (Date.now() < end) {
    const result = await check();
    if (result) return result;
    await setTimeout(100);
  }
  throw new Error(`Timed out: ${label}\n${logs}`);
}
function command(method, params = {}) {
  const id = ++nextId;
  return new Promise((resolve, reject) => {
    const timer = startTimer(() => {
      pending.delete(id);
      reject(new Error(`CDP timeout: ${method}`));
    }, 10000);
    pending.set(id, { resolve, reject, timer });
    socket.send(JSON.stringify({ id, method, params }));
  });
}
async function evaluate(expression) {
  const response = await command('Runtime.evaluate', {
    expression,
    awaitPromise: true,
    returnByValue: true,
  });
  if (response.exceptionDetails) throw new Error(JSON.stringify(response.exceptionDetails));
  return response.result.value;
}
async function start() {
  logs = '';
  child = spawn(process.argv[2], ['--remote-debugging-port=0'], {
    env: {
      ...process.env,
      APPDATA: join(profile, 'Roaming'),
      LOCALAPPDATA: join(profile, 'Local'),
      MARKFIX_LOCAL_AGENT_FILE: join(profile, 'agent.json'),
      MARKFIX_SERVICE_ORIGIN: origin,
    },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  let launchError;
  child.on('error', (error) => {
    launchError = error;
  });
  child.stdout.on('data', (data) => {
    logs += data;
  });
  child.stderr.on('data', (data) => {
    logs += data;
  });
  exited = once(child, 'exit');
  // Attach rejection handling immediately, including executable launch errors.
  void exited.catch(() => {});
  const port = await waitFor(() => {
    if (launchError) throw launchError;
    if (child.exitCode !== null) throw new Error(`App exited during startup: ${logs}`);
    return logs.match(/DevTools listening on ws:\/\/127\.0\.0\.1:(\d+)/)?.[1];
  }, 'debug endpoint');
  const page = await waitFor(async () => {
    const response = await globalThis.fetch(`http://127.0.0.1:${port}/json/list`);
    return (await response.json()).find(
      (target) => target.type === 'page' && target.url.startsWith('file:'),
    );
  }, 'installed renderer');
  socket = new globalThis.WebSocket(page.webSocketDebuggerUrl);
  await new Promise((resolve, reject) => {
    socket.addEventListener('open', resolve, { once: true });
    socket.addEventListener('error', reject, { once: true });
  });
  socket.addEventListener('message', ({ data }) => {
    const message = JSON.parse(data);
    const request = pending.get(message.id);
    if (!request) return;
    pending.delete(message.id);
    clearTimeout(request.timer);
    if (message.error) request.reject(new Error(JSON.stringify(message.error)));
    else request.resolve(message.result);
  });
  await waitFor(
    () =>
      evaluate(
        "Boolean(window.markfix && [...document.querySelectorAll('button')].some(b=>b.textContent.includes('仅在本机使用')))",
      ),
    'local mode login',
  );
  assert.equal(await evaluate('window.markfix.platform'), process.platform);
  if (windows || process.env.RELEASE_MODE === 'trial')
    assert.equal(await evaluate('window.markfix.manualUpdates'), true);
  await evaluate(
    "[...document.querySelectorAll('button')].find(b=>b.textContent.includes('仅在本机使用')).click()",
  );
  await waitFor(
    () =>
      evaluate(
        "Boolean(document.querySelector('#new-project-url') || document.querySelector('.project-sidebar'))",
      ),
    'local workspace',
  );
  assert.equal(await evaluate('document.documentElement.dataset.platform'), process.platform);
}
async function stop() {
  if (!child || child.exitCode !== null) return;
  // Closing the main renderer follows the app's normal before-quit cleanup.
  await command('Runtime.evaluate', { expression: 'window.close()' }).catch(() => {});
  await Promise.race([
    exited,
    setTimeout(10000).then(() => {
      throw new Error('App did not exit cleanly');
    }),
  ]);
  socket?.close();
}
try {
  await start();
  await waitFor(
    () => evaluate("Boolean(document.querySelector('#new-project-url'))"),
    'new project form',
  );
  await evaluate(
    `(() => { const input = document.querySelector('#new-project-url'); Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(input, ${JSON.stringify(origin + '/fixture')}); input.dispatchEvent(new Event('input', { bubbles: true })); })()`,
  );
  await evaluate("document.querySelector('#new-project-url').form.requestSubmit()");
  await waitFor(
    () => evaluate("Boolean(document.querySelector('[aria-label=网站地址]'))"),
    'project toolbar',
  );
  const projectsBefore = await evaluate('window.markfix.listWebsiteProjects()');
  assert.equal(projectsBefore.length, 1, 'SQLite-backed project was created');
  const project = projectsBefore[0];
  assert.equal(
    await evaluate(
      "document.querySelector('[aria-label=网站地址]').getAttribute('aria-keyshortcuts')",
    ),
    windows ? 'Control+L' : 'Meta+L',
  );
  assert.equal(
    await evaluate('document.querySelector(\'[aria-keyshortcuts="Alt+W"]\').title'),
    windows ? '批注（Alt+W）' : '批注（⌥W）',
  );
  await command('Input.dispatchKeyEvent', {
    type: 'keyDown',
    key: 'l',
    code: 'KeyL',
    windowsVirtualKeyCode: 76,
    modifiers: windows ? 2 : 4,
  });
  await command('Input.dispatchKeyEvent', {
    type: 'keyUp',
    key: 'l',
    code: 'KeyL',
    windowsVirtualKeyCode: 76,
    modifiers: windows ? 2 : 4,
  });
  assert.equal(await evaluate("document.activeElement?.getAttribute('aria-label')"), '网站地址');
  await stop();
  await start();
  await waitFor(
    () => evaluate('window.markfix.listWebsiteProjects().then(projects => projects.length === 1)'),
    'persisted project bootstrap',
  );
  const projects = await evaluate('window.markfix.listWebsiteProjects()');
  assert.equal(projects.length, 1, 'Project survives restart');
  assert.equal(projects[0].id, project.id);
  await stop();
  console.log('PASS packaged executable, renderer, bundled SQLite and restart persistence');
} finally {
  socket?.close();
  if (child && child.exitCode === null) {
    if (windows) {
      const cleanup = spawn('taskkill', ['/PID', String(child.pid), '/T', '/F']);
      await once(cleanup, 'exit');
    } else {
      child.kill('SIGKILL');
      await exited;
    }
  }
  server.closeAllConnections();
  server.close();
  console.log(`Smoke profile: ${profile}`);
}
