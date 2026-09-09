import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { mkdtemp, stat, readFile } from 'node:fs/promises';
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
test('help and version run without authorization; project reads fail closed', async () => {
  const home = await mkdtemp(join(tmpdir(), 'markfix-cli-test-'));
  const env = { ...process.env, MARKFIX_CLI_HOME: home };
  const cli = new URL('../src/cli.mjs', import.meta.url).pathname;
  assert.match((await exec(process.execPath, [cli, '--help'], { env })).stdout, /setup --server/);
  assert.equal((await exec(process.execPath, [cli, '--version'], { env })).stdout.trim(), '0.1.0');
  await assert.rejects(
    exec(process.execPath, [cli, 'projects', 'list'], { env }),
    (error) => error.code === 1 && /Authorization required/.test(error.stderr),
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
