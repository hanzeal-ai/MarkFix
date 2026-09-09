#!/usr/bin/env node
import process from 'node:process';
import console from 'node:console';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { hostname, homedir } from 'node:os';
import { basename, join, resolve } from 'node:path';
import { mkdir, readFile, readdir, unlink, writeFile, copyFile } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import { setTimeout as delay } from 'node:timers/promises';
import { Client, ApiError, serverUrl } from './client.mjs';
import {
  withInstallationLock,
  initializeStorage,
  readJson,
  writeJson,
  stateDirectory,
  saveCredential,
  loadCredential,
  removeCredential,
} from './storage.mjs';
const exec = promisify(execFile);
const help = `MarkFix CLI 0.1.0 — authorized project annotation repairs
setup --server <https-origin> [--credential-store keychain|file] [--no-browser] [--allow-local-http]
auth status | logout
repo register [--name <repository-name>]
projects list | projects resolve
issues list --project <id> [--status OPEN|FIX_FAILED|IN_PROGRESS|RESOLVED] [--cursor <id>]
issues get <id> | issues screenshot <id> --output <path>
issues claim <id> [--retry] [--run-id <uuid>]
fixes renew <run-id> | fixes release <run-id>
fixes complete <run-id> --result-file <path>
fixes fail <run-id> --result-file <path>
sync
All successful responses are JSON; --json is accepted. Git commands run in the current directory.`;
function parseArgs(argv) {
  const positional = [],
    options = {};
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (!arg.startsWith('--')) positional.push(arg);
    else if (
      ['--json', '--no-browser', '--allow-local-http', '--retry', '--help', '--version'].includes(
        arg,
      )
    )
      options[arg.slice(2)] = true;
    else {
      if (!argv[i + 1] || argv[i + 1].startsWith('--')) throw new Error(`Missing value for ${arg}`);
      options[arg.slice(2)] = argv[++i];
    }
  }
  return { positional, options };
}
const required = (value, name) => {
  if (!value) throw new Error(`${name} is required`);
  return value;
};
const identifier = (value) => {
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value ?? ''))
    throw new Error('A UUID is required');
  return value;
};
async function localRepository() {
  const { stdout } = await exec('git', ['rev-parse', '--show-toplevel'], { maxBuffer: 8192 });
  const root = stdout.trim();
  const directory = await initializeStorage();
  // Each root owns one private registration file; concurrent writes never lose another root.
  const { createHash } = await import('node:crypto');
  const key = createHash('sha256').update(root).digest('hex');
  const path = join(directory, `repo-${key}.json`);
  let repository = await readJson(path, null);
  if (!repository) {
    repository = { localId: randomUUID(), name: basename(root) };
    try {
      await writeFile(path, JSON.stringify(repository), { flag: 'wx', mode: 0o600 });
    } catch (error) {
      if (error.code !== 'EEXIST') throw error;
      repository = await readJson(path, null);
    }
  }
  return repository;
}
async function setup(options) {
  const directory = await initializeStorage();
  const credentialStore =
    options['credential-store'] ?? (process.platform === 'darwin' ? 'keychain' : undefined);
  if (
    !['keychain', 'file'].includes(credentialStore) ||
    (credentialStore === 'keychain' && process.platform !== 'darwin')
  )
    throw new Error('Choose --credential-store file on this platform');
  const config = {
    server: serverUrl(required(options.server, '--server'), options['allow-local-http']),
    credentialStore,
  };
  const oldConfig = await readJson(join(directory, 'config.json'), null);
  if (oldConfig)
    throw new Error('An installation is already configured; use markfix logout before a new setup');
  const client = new Client(config);
  const device = await client.send('/device', { deviceName: hostname(), agentType: 'codex' });
  const verify = new URL(device.verificationUrl);
  if (
    verify.protocol !== 'https:' &&
    !(
      options['allow-local-http'] &&
      ['127.0.0.1', 'localhost'].includes(verify.hostname) &&
      verify.protocol === 'http:'
    )
  )
    throw new Error('Unsafe authorization address');
  console.error(`Authorize this device in MarkFix: ${verify.href}\nCode: ${device.userCode}`);
  if (!options['no-browser']) {
    const command = process.platform === 'darwin' ? 'open' : 'xdg-open';
    await exec(command, [verify.href]).catch(() =>
      console.error('Open the authorization address manually.'),
    );
  }
  let tokens;
  while (Date.now() < Date.parse(device.expiresAt)) {
    await delay(Math.max(5, Number(device.interval) || 5) * 1000);
    const response = await client.send('/token', { deviceCode: device.deviceCode });
    if (response.status === 'AUTHORIZED') {
      tokens = response;
      break;
    }
    if (response.status !== 'PENDING') throw new Error('Unexpected authorization response');
  }
  if (!tokens) throw new Error('Authorization expired; run setup again');
  await saveCredential(config, tokens);
  await writeJson(join(directory, 'config.json'), config);
  const skillDirectory = join(
    process.env.CODEX_HOME ?? join(homedir(), '.codex'),
    'skills',
    'markfix',
  );
  await mkdir(skillDirectory, { recursive: true });
  const skillPath = join(skillDirectory, 'SKILL.md');
  try {
    await copyFile(new URL('../skills/markfix/SKILL.md', import.meta.url), skillPath, 1);
  } catch (error) {
    if (error.code !== 'EEXIST') throw error;
    console.error('Existing MarkFix Skill retained; review it before use.');
  }
  let repository = null;
  try {
    repository = await client.request('/repositories', await localRepository());
  } catch (error) {
    console.error(`Authorization saved. Repository registration pending: ${error.message}`);
  }
  return { authorized: true, repository, skillPath };
}
async function submitResult(client, config, id, action, result) {
  const directory = join(await initializeStorage(), 'outbox');
  await mkdir(directory, { recursive: true, mode: 0o700 });
  const path = join(directory, `${identifier(id)}.json`);
  const entry = {
    server: config.server,
    grantId: (await loadCredential(config)).grantId,
    id,
    action,
    result,
  };
  const saved = await readJson(path, null);
  if (saved && JSON.stringify(saved) !== JSON.stringify(entry))
    throw new Error('A different result for this run is already pending');
  await writeJson(path, entry);
  try {
    const response = await client.request(`/fixes/${id}/${action}`, result);
    await unlink(path);
    return response;
  } catch (error) {
    if (error instanceof ApiError && error.status < 500 && ![401, 429].includes(error.status))
      throw error;
    process.exitCode = 4;
    return {
      confirmed: false,
      queued: true,
      runId: id,
      message: 'Result saved locally. Retry with markfix sync.',
    };
  }
}
async function main() {
  const {
    positional: [command, action, id],
    options,
  } = parseArgs(process.argv.slice(2));
  if (options.version) {
    console.log('0.1.0');
    return;
  }
  if (options.help || !command) {
    console.log(help);
    return;
  }
  if (command === 'setup') return setup(options);
  const config = await readJson(join(stateDirectory(), 'config.json'), null);
  if (!config) throw new Error('Authorization required: run markfix setup --server <https-origin>');
  const client = new Client(config);
  if (command === 'auth' && action === 'status') return client.request('/status');
  if (command === 'logout') {
    let serverRevocationConfirmed = true;
    try {
      await client.request('/logout', {});
    } catch (error) {
      if (!(error instanceof ApiError) || error.status !== 401) throw error;
      serverRevocationConfirmed = false;
    }
    await removeCredential(config);
    await unlink(join(stateDirectory(), 'config.json'));
    return { loggedOut: true, serverRevocationConfirmed };
  }
  if (command === 'repo' && action === 'register') {
    const repository = await localRepository();
    return client.request('/repositories', {
      ...repository,
      name: options.name ?? repository.name,
    });
  }
  if (command === 'projects' && action === 'list') return client.request('/projects');
  if (command === 'projects' && action === 'resolve')
    return client.request(`/repositories/${(await localRepository()).localId}/projects`);
  if (command === 'issues' && action === 'list') {
    const query = new URLSearchParams({
      projectId: identifier(options.project),
      status: options.status ?? 'OPEN',
      ...(options.cursor ? { cursor: identifier(options.cursor) } : {}),
    });
    return client.request(`/issues?${query}`);
  }
  if (command === 'issues' && action === 'get') return client.request(`/issues/${identifier(id)}`);
  if (command === 'issues' && action === 'claim') {
    const report = await client.request(`/issues/${identifier(id)}`);
    return client.request(`/issues/${id}/claim`, {
      runId: options['run-id'] ? identifier(options['run-id']) : randomUUID(),
      expectedVersion: report.version,
      retry: Boolean(options.retry),
    });
  }
  if (command === 'issues' && action === 'screenshot') {
    await client.request('/status');
    const token = await loadCredential(config);
    const response = await fetch(`${config.server}/v1/agent/issues/${identifier(id)}/screenshot`, {
      redirect: 'error',
      signal: AbortSignal.timeout(20_000),
      headers: { Authorization: `Bearer ${token.accessToken}` },
    });
    if (!response.ok) throw new ApiError(response.status, { message: 'Screenshot request failed' });
    if (!response.headers.get('content-type')?.startsWith('image/png'))
      throw new Error('Invalid screenshot response');
    const bytes = Buffer.from(await response.arrayBuffer());
    if (
      bytes.length > 20 * 1024 * 1024 ||
      bytes.subarray(0, 8).toString('hex') !== '89504e470d0a1a0a'
    )
      throw new Error('Invalid PNG screenshot');
    const output = resolve(required(options.output, '--output'));
    await writeFile(output, bytes, { flag: 'wx', mode: 0o600 });
    return { path: output };
  }
  if (command === 'fixes' && ['renew', 'release'].includes(action))
    return client.request(`/fixes/${identifier(id)}/${action}`, {});
  if (command === 'fixes' && ['complete', 'fail'].includes(action)) {
    const text = await readFile(required(options['result-file'], '--result-file'), 'utf8');
    if (text.length > 150_000) throw new Error('Result file is too large');
    return submitResult(client, config, identifier(id), action, JSON.parse(text));
  }
  if (command === 'sync') {
    const directory = join(await initializeStorage(), 'outbox');
    const names = await readdir(directory).catch((error) => {
      if (error.code === 'ENOENT') return [];
      throw error;
    });
    const results = [];
    for (const name of names.filter((value) => value.endsWith('.json'))) {
      const entry = await readJson(join(directory, name), null);
      if (
        entry.server !== config.server ||
        entry.grantId !== (await loadCredential(config)).grantId
      )
        throw new Error('Pending result belongs to another authorization');
      results.push(await submitResult(client, config, entry.id, entry.action, entry.result));
    }
    return { results };
  }
  throw new Error(`Unknown command.\n${help}`);
}
withInstallationLock(main)
  .then((result) => {
    if (result !== undefined) console.log(JSON.stringify(result, null, 2));
  })
  .catch((error) => {
    console.error(
      JSON.stringify({ error: error.message, ...(error.status ? { status: error.status } : {}) }),
    );
    process.exitCode =
      error.status === 401 || error.status === 403 ? 2 : error.status === 409 ? 3 : 1;
  });
