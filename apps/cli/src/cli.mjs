#!/usr/bin/env node
import process from 'node:process';
import console from 'node:console';
import { createInterface } from 'node:readline/promises';
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
import { localConnection } from './local.mjs';
const exec = promisify(execFile);
const help = `MarkFix CLI 0.1.1 — authorized project annotation repairs
setup --server <https-origin> [--credential-store keychain|file] [--no-browser] [--allow-local-http]
skill install [--force]
auth status
logout
repo register [--name <repository-name>]
projects list | projects resolve
issues list --project <id> [--status OPEN|FIX_FAILED|IN_PROGRESS|READY_FOR_VERIFY|RESOLVED] [--cursor <id>]
issues get <id> | issues screenshot <id> --output <path>
issues claim <id> [--retry] [--run-id <uuid>]
fixes renew <run-id> | fixes release <run-id>
fixes complete <run-id> --result-file <path>
fixes fail <run-id> --result-file <path>
sync
Use --local on every command to access desktop LOCAL projects (desktop must be running).
Local commands connect automatically with full access to LOCAL projects.
Cloud commands open browser authorization on first use, then continue.
Pass --server <https-origin> or set MARKFIX_SERVER; an interactive terminal can prompt for it.
--help and --version never authorize. Installation does not authorize.
All successful responses are JSON; --json is accepted. Git commands run in the current directory.`;
function parseArgs(argv) {
  const positional = [],
    options = {};
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (!arg.startsWith('--')) positional.push(arg);
    else if (
      [
        '--force',
        '--local',
        '--json',
        '--no-browser',
        '--allow-local-http',
        '--retry',
        '--help',
        '--version',
      ].includes(arg)
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
  const local = options.local ? await localConnection() : undefined;
  if (options.local && options.server) throw new Error('--local and --server cannot be combined');
  options = { ...options, server: local?.server ?? options.server ?? process.env.MARKFIX_SERVER };
  if (!options.server && process.stdin.isTTY && process.stderr.isTTY) {
    const prompt = createInterface({ input: process.stdin, output: process.stderr });
    try {
      options.server = (await prompt.question('MarkFix API address: ')).trim();
    } finally {
      prompt.close();
    }
  }
  if (!options.server)
    throw new Error(
      'First use requires the MarkFix API address: pass --server <https-origin> or set MARKFIX_SERVER',
    );
  const directory = await initializeStorage();
  if (local) {
    const config = { server: local.server, local: true };
    await writeJson(join(directory, 'config.json'), config);
    return finishSetup(new Client(config));
  }
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
      ['127.0.0.1', 'localhost', '[::1]'].includes(verify.hostname) &&
      verify.protocol === 'http:'
    )
  )
    throw new Error('Unsafe authorization address');
  console.error(`Authorize this device in MarkFix: ${verify.href}\nCode: ${device.userCode}`);
  if (!options['no-browser']) {
    const command =
      process.platform === 'darwin'
        ? 'open'
        : process.platform === 'win32'
          ? 'explorer.exe'
          : 'xdg-open';
    await exec(command, [verify.href]).catch(() =>
      console.error('Open the authorization address manually.'),
    );
  }
  console.error('Waiting for browser authorization; this command will continue automatically.');
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
  if (!tokens) throw new Error('Authorization expired; run the command again');
  await saveCredential(config, tokens);
  await writeJson(join(directory, 'config.json'), config);
  console.error('Authorization complete. Continuing the requested command.');
  return finishSetup(client);
}
async function installSkill(force = false) {
  const skillDirectory = join(
    process.env.CODEX_HOME ?? join(homedir(), '.codex'),
    'skills',
    'markfix',
  );
  await mkdir(skillDirectory, { recursive: true });
  const skillPath = join(skillDirectory, 'SKILL.md');
  const source = await readFile(new URL('../skills/markfix/SKILL.md', import.meta.url), 'utf8');
  let existing;
  try {
    existing = await readFile(skillPath, 'utf8');
  } catch (error) {
    if (error.code !== 'ENOENT') throw error;
  }
  if (existing === source) return { skillPath, status: 'current' };
  if (existing !== undefined && !force) {
    console.error(
      'Existing MarkFix Skill retained; use markfix skill install --force to back up and update.',
    );
    return { skillPath, status: 'retained' };
  }
  let backupPath;
  if (existing !== undefined) {
    backupPath = `${skillPath}.${randomUUID()}.bak`;
    await copyFile(skillPath, backupPath, 1);
  }
  await writeFile(skillPath, source, { flag: existing === undefined ? 'wx' : 'w' });
  return {
    skillPath,
    status: existing === undefined ? 'installed' : 'updated',
    ...(backupPath ? { backupPath } : {}),
  };
}
async function finishSetup(client) {
  const { skillPath } = await installSkill();
  let repository = null;
  try {
    repository = await client.request('/repositories', await localRepository());
  } catch (error) {
    console.error(`Repository registration pending: ${error.message}`);
  }
  return { authorized: true, repository, skillPath };
}
async function submitResult(client, config, id, action, result) {
  const directory = join(await initializeStorage(), 'outbox');
  await mkdir(directory, { recursive: true, mode: 0o700 });
  const path = join(directory, `${identifier(id)}.json`);
  const entry = {
    server: config.server,
    grantId: config.local ? config.server : (await loadCredential(config)).grantId,
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
    console.log('0.1.1');
    return;
  }
  if (options.help || !command) {
    console.log(help);
    return;
  }
  if (command === 'skill' && action === 'install') return installSkill(Boolean(options.force));
  if (command === 'setup') return setup(options);
  const validCommand =
    (command === 'auth' && action === 'status') ||
    command === 'logout' ||
    (command === 'repo' && action === 'register') ||
    (command === 'projects' && ['list', 'resolve'].includes(action)) ||
    (command === 'issues' && ['list', 'get', 'claim', 'screenshot'].includes(action)) ||
    (command === 'fixes' && ['renew', 'release', 'complete', 'fail'].includes(action)) ||
    command === 'sync';
  if (!validCommand) throw new Error(`Unknown command.\n${help}`);
  if (command === 'issues' && action === 'list') {
    identifier(options.project);
    if (options.cursor) identifier(options.cursor);
  } else if (command === 'issues' || command === 'fixes') identifier(id);
  if (options['run-id']) identifier(options['run-id']);
  if (
    options.status &&
    !['OPEN', 'FIX_FAILED', 'IN_PROGRESS', 'READY_FOR_VERIFY', 'RESOLVED'].includes(options.status)
  )
    throw new Error('Invalid issue status');
  let resultInput;
  if (command === 'fixes' && ['complete', 'fail'].includes(action)) {
    const text = await readFile(required(options['result-file'], '--result-file'), 'utf8');
    if (text.length > 150_000) throw new Error('Result file is too large');
    resultInput = JSON.parse(text);
  }
  if (command === 'issues' && action === 'screenshot') required(options.output, '--output');
  if (command === 'fixes' && ['complete', 'fail'].includes(action))
    required(options['result-file'], '--result-file');
  if (options.local && options.server) throw new Error('--local and --server cannot be combined');
  let config = await readJson(join(stateDirectory(), 'config.json'), null);
  if (!config) {
    if (command === 'logout') return { loggedOut: true, serverRevocationConfirmed: false };
    await setup(options);
    config = await readJson(join(stateDirectory(), 'config.json'), null);
  } else if (
    options.server &&
    serverUrl(options.server, options['allow-local-http']) !== config.server
  ) {
    throw new Error(
      'This installation is authorized for another server. Use a separate MARKFIX_CLI_HOME or logout first.',
    );
  }
  const client = new Client(config);
  if (command === 'auth' && action === 'status') return client.request('/status');
  if (command === 'logout') {
    if (config.local)
      return {
        authorized: true,
        storageMode: 'LOCAL',
        message: 'Local CLI access is automatic; no logout is required.',
      };
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
    const token = config.local ? null : await loadCredential(config);
    const connection = config.local ? await localConnection() : config;
    if (connection.server !== config.server) throw new Error('Local desktop profile changed');
    const response = await fetch(
      `${connection.endpoint ?? config.server}/v1/agent/issues/${identifier(id)}/screenshot`,
      {
        redirect: 'error',
        signal: AbortSignal.timeout(20_000),
        headers: {
          ...(token ? { Authorization: `Bearer ${token.accessToken}` } : {}),
          ...(connection.localSecret ? { 'X-MarkFix-Local-Secret': connection.localSecret } : {}),
        },
      },
    );
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
    return submitResult(client, config, identifier(id), action, resultInput);
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
        entry.grantId !== (config.local ? config.server : (await loadCredential(config)).grantId)
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
