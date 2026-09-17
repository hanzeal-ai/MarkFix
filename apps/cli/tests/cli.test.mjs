import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { mkdtemp, stat, readFile, mkdir, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import process from 'node:process';
import { serverUrl } from '../src/client.mjs';
import {
  initializeStorage,
  saveCredential,
  loadCredential,
  removeCredential,
} from '../src/storage.mjs';
const exec = promisify(execFile);
test('requires HTTPS and forbids remote plaintext, credentials and redirecting paths', () => {
  assert.equal(serverUrl('https://example.test'), 'https://example.test');
  assert.equal(serverUrl('http://127.0.0.1:4310', true), 'http://127.0.0.1:4310');
  for (const url of [
    'http://remote.test',
    'https://user:secret@example.test',
    'file:///tmp/test',
    'https://example.test/path',
  ])
    assert.throws(() => serverUrl(url, true));
});
test('help and version remain offline; first use requires a service address', async () => {
  const home = await mkdtemp(join(tmpdir(), 'markfix-cli-test-'));
  const env = { ...process.env, MARKFIX_CLI_HOME: home };
  const cli = new URL('../src/cli.mjs', import.meta.url).pathname;
  assert.match((await exec(process.execPath, [cli, '--help'], { env })).stdout, /setup --server/);
  assert.equal((await exec(process.execPath, [cli, '--version'], { env })).stdout.trim(), '0.1.0');
  await assert.rejects(
    exec(process.execPath, [cli, 'projects', 'list'], { env }),
    (error) => error.code === 1 && /First use requires/.test(error.stderr),
  );
});
test('explicit file credentials use private permissions and can be removed', async () => {
  const previous = process.env.MARKFIX_CLI_HOME;
  const home = await mkdtemp(join(tmpdir(), 'markfix-cli-store-'));
  process.env.MARKFIX_CLI_HOME = home;
  try {
    await initializeStorage();
    const config = { server: 'https://example.test', credentialStore: 'file' };
    await saveCredential(config, { refreshToken: 'test-only' });
    assert.equal((await stat(home)).mode & 0o777, 0o700);
    assert.equal((await stat(join(home, 'credential.json'))).mode & 0o777, 0o600);
    assert.deepEqual(await loadCredential(config), { refreshToken: 'test-only' });
    await removeCredential(config);
    await assert.rejects(readFile(join(home, 'credential.json')), { code: 'ENOENT' });
  } finally {
    if (previous === undefined) delete process.env.MARKFIX_CLI_HOME;
    else process.env.MARKFIX_CLI_HOME = previous;
  }
});

import { createServer } from 'node:http';

async function firstUseFixture(t, { denied = false, unsafe = false } = {}) {
  const home = await mkdtemp(join(tmpdir(), 'markfix-cli-first-use-'));
  const bin = join(home, 'bin');
  await mkdir(bin);
  const browserLog = join(home, 'browser.json');
  const browserCommand = process.platform === 'darwin' ? 'open' : 'xdg-open';
  await writeFile(
    join(bin, browserCommand),
    `#!${process.execPath}\nimport fs from 'node:fs'; fs.writeFileSync(${JSON.stringify(browserLog)}, JSON.stringify(process.argv.slice(2)));`,
    { mode: 0o700 },
  );
  const calls = [];
  let origin;
  const server = createServer((request, response) => {
    calls.push(request.url);
    response.setHeader('Content-Type', 'application/json');
    if (request.url === '/v1/agent/device')
      return response.end(
        JSON.stringify({
          verificationUrl: unsafe ? 'http://remote.test/authorize' : `${origin}/authorize`,
          userCode: 'ABCD1234',
          deviceCode: 'test-device',
          interval: 5,
          expiresAt: new Date(Date.now() + 60_000).toISOString(),
        }),
      );
    if (request.url === '/v1/agent/token') {
      if (denied) {
        response.statusCode = 403;
        return response.end(JSON.stringify({ message: 'Authorization denied' }));
      }
      return response.end(
        JSON.stringify({
          status: 'AUTHORIZED',
          grantId: 'test-grant',
          accessToken: 'test-access',
          refreshToken: 'test-refresh',
          accessExpiresAt: new Date(Date.now() + 3600_000).toISOString(),
        }),
      );
    }
    if (request.url === '/v1/agent/repositories')
      return response.end(JSON.stringify({ id: 'registered' }));
    if (request.url === '/v1/agent/projects') {
      if (request.headers.authorization !== 'Bearer test-access') response.statusCode = 401;
      return response.end(JSON.stringify({ projects: [{ id: 'test-project' }] }));
    }
    response.statusCode = 404;
    response.end(JSON.stringify({ message: 'Not found' }));
  });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  origin = `http://127.0.0.1:${server.address().port}`;
  t.after(() => {
    server.closeAllConnections();
    server.close();
  });
  const env = {
    ...process.env,
    MARKFIX_CLI_HOME: join(home, 'state'),
    CODEX_HOME: join(home, 'codex'),
    MARKFIX_SERVER: origin,
    PATH: `${bin}:${process.env.PATH}`,
  };
  const cli = new URL('../src/cli.mjs', import.meta.url).pathname;
  const run = (...args) => exec(process.execPath, [cli, ...args], { env });
  return { home, env, calls, origin, browserLog, run };
}

test(
  'first service command opens authorization, registers repository and resumes with JSON; later calls reuse it',
  { skip: process.platform === 'win32' },
  async (t) => {
    const f = await firstUseFixture(t);
    const result = await f.run(
      'projects',
      'list',
      '--allow-local-http',
      '--credential-store',
      'file',
    );
    assert.deepEqual(JSON.parse(result.stdout), { projects: [{ id: 'test-project' }] });
    assert.deepEqual(JSON.parse(await readFile(f.browserLog, 'utf8')), [`${f.origin}/authorize`]);
    assert.match(result.stderr, /Code: ABCD1234/);
    assert.match(result.stderr, /Waiting for browser authorization/);
    assert.match(result.stderr, /Authorization complete. Continuing/);
    assert.equal(f.calls.filter((path) => path === '/v1/agent/device').length, 1);
    assert.ok(f.calls.includes('/v1/agent/repositories'));
    assert.ok(
      (await readFile(join(f.home, 'codex/skills/markfix/SKILL.md'), 'utf8')).includes('MarkFix'),
    );
    await f.run('projects', 'list');
    assert.equal(f.calls.filter((path) => path === '/v1/agent/device').length, 1);
    await assert.rejects(
      f.run('projects', 'list', '--server', 'https://other.test'),
      /another server/,
    );
  },
);

test(
  'denied first authorization does not store credentials or execute the requested operation',
  { skip: process.platform === 'win32' },
  async (t) => {
    const f = await firstUseFixture(t, { denied: true });
    await assert.rejects(
      f.run('projects', 'list', '--allow-local-http', '--credential-store', 'file', '--no-browser'),
      (error) => error.code === 2 && /Authorization denied/.test(error.stderr),
    );
    assert.ok(!f.calls.includes('/v1/agent/projects'));
    await assert.rejects(readFile(join(f.env.MARKFIX_CLI_HOME, 'config.json')), { code: 'ENOENT' });
    await assert.rejects(readFile(join(f.env.MARKFIX_CLI_HOME, 'credential.json')), {
      code: 'ENOENT',
    });
    await assert.rejects(readFile(f.browserLog), { code: 'ENOENT' });
  },
);

test('help, invalid commands, invalid arguments and logout never initiate authorization', async (t) => {
  const f = await firstUseFixture(t);
  await f.run('--help');
  await f.run('--version');
  await f.run('logout');
  await assert.rejects(f.run('unknown'), /Unknown command/);
  await assert.rejects(f.run('issues', 'get', 'not-an-id'), /UUID/);
  await assert.rejects(
    f.run('issues', 'claim', '11111111-1111-4111-8111-111111111111', '--run-id', 'bad'),
    /UUID/,
  );
  await assert.rejects(
    f.run('issues', 'list', '--project', '11111111-1111-4111-8111-111111111111', '--status', 'BAD'),
    /Invalid issue status/,
  );
  await assert.rejects(
    f.run(
      'fixes',
      'complete',
      '11111111-1111-4111-8111-111111111111',
      '--result-file',
      join(f.home, 'missing.json'),
    ),
    /ENOENT/,
  );
  assert.deepEqual(f.calls, []);
});

test('unsafe verification URL is rejected before opening a browser or fetching tokens', async (t) => {
  const f = await firstUseFixture(t, { unsafe: true });
  await assert.rejects(
    f.run('projects', 'list', '--allow-local-http', '--credential-store', 'file'),
    /Unsafe authorization/,
  );
  assert.deepEqual(f.calls, ['/v1/agent/device']);
  await assert.rejects(readFile(f.browserLog), { code: 'ENOENT' });
});
