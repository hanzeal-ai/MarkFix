import 'reflect-metadata';
import assert from 'node:assert/strict';
import { mkdtemp, writeFile, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { createHash, randomUUID } from 'node:crypto';
import { spawn, execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { NestFactory } from '@nestjs/core';
import { FastifyAdapter, type NestFastifyApplication } from '@nestjs/platform-fastify';
import { AppModule } from '../src/app.module.js';
import { DatabaseService } from '../src/database.service.js';
import { hashPassword } from '../src/auth-crypto.js';
const execute = promisify(execFile);
const url = process.env.TEST_DATABASE_URL;
assert(
  url && new URL(url).hostname === '127.0.0.1' && new URL(url).pathname === '/markfix_agent_audit',
);
process.env.DATABASE_URL = url;
process.env.NODE_ENV = 'test';
delete process.env.MARKFIX_DEMO_PASSWORD;
const output = await mkdtemp(join(tmpdir(), 'markfix-agent-flow-'));
process.env.ARTIFACT_DIR = join(output, 'artifacts');
process.env.MARKFIX_SERVICE_ORIGIN = 'http://127.0.0.1:14311';
const app = await NestFactory.create<NestFastifyApplication>(AppModule, new FastifyAdapter(), {
  logger: false,
});
app
  .getHttpAdapter()
  .getInstance()
  .addContentTypeParser('image/png', { parseAs: 'buffer' }, (_req, body, done) => done(null, body));
app.enableCors({ origin: 'http://127.0.0.1:14311', credentials: true });
let failCompletion = false;
app
  .getHttpAdapter()
  .getInstance()
  .addHook('onRequest', async (request, reply) => {
    if (failCompletion && request.url.endsWith('/complete'))
      return reply.code(503).send({ message: 'Simulated transient outage' });
  });
await app.listen(0, '127.0.0.1');
const origin = await app.getUrl();
const db = app.get(DatabaseService);
const password = randomUUID();
const owner = await db.user.create({
  data: {
    email: `${randomUUID()}@flow.test`,
    displayName: 'Flow owner',
    passwordHash: await hashPassword(password),
    emailVerifiedAt: new Date(),
    plan: 'TEAM',
  },
});
let accessToken = '';
async function request(
  path: string,
  body?: unknown,
  options: { token?: string; status?: number; method?: string } = {},
) {
  const response = await fetch(`${origin}/v1${path}`, {
    method: options.method ?? (body === undefined ? 'GET' : 'POST'),
    headers: {
      ...(body === undefined ? {} : { 'Content-Type': 'application/json' }),
      Origin: 'http://127.0.0.1:14311',
      Authorization: `Bearer ${options.token ?? accessToken}`,
    },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
  const result = (await response.json()) as Record<string, unknown>;
  assert.equal(
    response.status,
    options.status ?? (body === undefined ? 200 : 201),
    JSON.stringify({ path, result }),
  );
  return result;
}
const cli = resolve('../cli/src/cli.mjs');
const env = {
  ...process.env,
  MARKFIX_CLI_HOME: join(output, 'cli'),
  CODEX_HOME: join(output, 'codex'),
};
async function command(...args: string[]) {
  const result = await execute(process.execPath, [cli, ...args], { env, cwd: output });
  return JSON.parse(result.stdout) as Record<string, unknown>;
}
try {
  await execute('git', ['init', output]);
  accessToken = (
    await request('/auth/login', { email: owner.email, password, clientType: 'desktop' })
  ).accessToken as string;
  const project = await request('/projects', {
    name: 'Agent flow',
    baseUrl: 'https://example.test',
  });
  const other = await request('/projects', {
    name: 'Not authorized',
    baseUrl: 'https://other.test',
  });
  const setup = spawn(
    process.execPath,
    [
      cli,
      'setup',
      '--account',
      owner.email,
      '--server',
      origin,
      '--allow-local-http',
      '--credential-store',
      'file',
    ],
    { env, cwd: output },
  );
  let setupError = '',
    setupOutput = '';
  setup.stderr.on('data', (chunk) => {
    setupError += chunk;
  });
  setup.stdout.on('data', (chunk) => {
    setupOutput += chunk;
  });
  const closed = new Promise<void>((resolve, reject) => {
    setup.on('error', reject);
    setup.on('exit', (code) => (code === 0 ? resolve() : reject(new Error(setupError))));
  });
  const code = await new Promise<string>((resolve, reject) => {
    const timer = setTimeout(
      () => reject(new Error('Setup did not request authorization')),
      10_000,
    );
    setup.stderr.on('data', () => {
      const value = /申请码：([A-F0-9]{8})/.exec(setupError)?.[1];
      if (value) {
        clearTimeout(timer);
        resolve(value);
      }
    });
  });
  const intruder = await db.user.create({
    data: {
      email: `${randomUUID()}@flow.test`,
      displayName: 'Unrelated user',
      passwordHash: await hashPassword(password),
      emailVerifiedAt: new Date(),
    },
  });
  const intruderToken = (
    await request('/auth/login', { email: intruder.email, password, clientType: 'desktop' })
  ).accessToken as string;
  const pending = await request('/agent/requests');
  assert(
    (pending as unknown as Array<{ userCode: string }>).some((item) => item.userCode === code),
  );
  assert.deepEqual(await request('/agent/requests', undefined, { token: intruderToken }), []);
  await request(`/agent/device/${code}`, undefined, { token: intruderToken, status: 404 });
  await request(
    '/agent/device/decision',
    { userCode: code, approve: false },
    { token: intruderToken, status: 409 },
  );
  await request(
    '/agent/device/decision',
    { userCode: code, approve: true, projectIds: [project.id] },
    { token: intruderToken, status: 403 },
  );
  const missing = await request('/agent/device', {
    account: `${randomUUID()}@missing.test`,
    deviceName: 'Unknown target',
    agentType: 'codex',
  });
  await request(`/agent/device/${missing.userCode}`, undefined, { status: 404 });
  await request(
    '/agent/device/decision',
    { userCode: missing.userCode, approve: false },
    { status: 409 },
  );
  assert.equal(
    (await request('/agent/token', { deviceCode: missing.deviceCode })).status,
    'PENDING',
  );
  if (process.env.MARKFIX_DESKTOP_AGENT_SMOKE === 'true') {
    await execute(
      resolve('../desktop/node_modules/electron/dist/Electron.app/Contents/MacOS/Electron'),
      [resolve('../desktop/scripts/smoke-desktop-agent.mjs')],
      {
        env: {
          ...process.env,
          MARKFIX_TEST_OUTPUT: output,
          MARKFIX_TEST_API: origin,
          MARKFIX_TEST_EMAIL: owner.email,
          MARKFIX_TEST_PASSWORD: password,
          MARKFIX_TEST_CODE: code,
        },
        timeout: 60000,
      },
    );
  } else if (process.env.MARKFIX_BROWSER_SMOKE === 'true') {
    await execute(
      resolve('../desktop/node_modules/electron/dist/Electron.app/Contents/MacOS/Electron'),
      [resolve('../desktop/scripts/smoke-agent-browser.mjs')],
      {
        env: {
          ...process.env,
          MARKFIX_TEST_OUTPUT: output,
          MARKFIX_TEST_API: origin,
          MARKFIX_TEST_TOKEN: accessToken,
          MARKFIX_TEST_MODE: 'authorize',
          MARKFIX_TEST_CODE: code,
        },
        timeout: 60_000,
      },
    );
  } else
    await request('/agent/device/decision', {
      userCode: code,
      approve: true,
      projectIds: [project.id],
    });
  await closed;
  assert.equal(JSON.parse(setupOutput).authorized, true);
  const credential = JSON.parse(
    await readFile(join(env.MARKFIX_CLI_HOME, 'credential.json'), 'utf8'),
  ) as { grantId: string; accessToken: string; refreshToken: string };
  await request(
    '/agent/device/decision',
    { userCode: code, approve: true, projectIds: [project.id] },
    { status: 409 },
  );
  assert.equal((await command('auth', 'status')).authorized, true);
  const oldRefresh = credential.refreshToken;
  await db.agentGrant.update({
    where: { id: credential.grantId },
    data: { accessExpiresAt: new Date(0) },
  });
  assert.equal((await command('auth', 'status')).authorized, true);
  Object.assign(
    credential,
    JSON.parse(await readFile(join(env.MARKFIX_CLI_HOME, 'credential.json'), 'utf8')),
  );
  assert.notEqual(credential.refreshToken, oldRefresh);
  await request('/agent/token/refresh', { refreshToken: oldRefresh }, { status: 401 });
  const repository = await command('repo', 'register');
  assert.equal((await command('projects', 'resolve')).selectionRequired, true);
  await request(
    `/agent/projects/${project.id}/binding`,
    { repositoryId: repository.id, repositoryName: null },
    { method: 'PATCH', status: 200 },
  );
  assert.equal((await command('projects', 'resolve')).selectionRequired, false);
  await request(`/agent/issues?projectId=${other.id}`, undefined, {
    token: credential.accessToken,
    status: 403,
  });
  await request('/me', undefined, { token: credential.accessToken, status: 401 });
  const submission = await request(`/projects/${project.id}/report-submissions`, {
    projectId: project.id,
    title: 'Wrong total',
    description: 'Sum returns subtraction',
    priority: 'MEDIUM',
    captureBundle: {
      annotationKind: 'COMMENT',
      schemaVersion: 2,
      page: {
        url: 'https://example.test',
        title: 'Test',
        viewportWidthCssPx: 1280,
        viewportHeightCssPx: 720,
        deviceScaleFactor: 1,
        capturedAt: new Date().toISOString(),
      },

      reproduction: [],
    },
  });
  const png = Buffer.from(
    'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+a0X8AAAAASUVORK5CYII=',
    'base64',
  );
  const artifact = await request(`/report-submissions/${submission.id}/artifacts/presign`, {
    mimeType: 'image/png',
    size: png.length,
    sha256: createHash('sha256').update(png).digest('hex'),
  });
  const uploaded = await fetch(`${origin}${artifact.uploadUrl}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'image/png', Authorization: `Bearer ${accessToken}` },
    body: png,
  });
  assert.equal(uploaded.status, 200);
  const issue = await request(`/report-submissions/${submission.id}/finalize`, {});
  assert.equal(
    (await command('issues', 'list', '--project', project.id as string)).items instanceof Array,
    true,
  );
  const screenshot = join(output, 'annotation.png');
  await command('issues', 'screenshot', issue.id as string, '--output', screenshot);
  assert.deepEqual(await readFile(screenshot), png);
  const claims = await Promise.all(
    [randomUUID(), randomUUID()].map(async (runId) => {
      const response = await fetch(`${origin}/v1/agent/issues/${issue.id}/claim`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${credential.accessToken}`,
        },
        body: JSON.stringify({ runId, expectedVersion: issue.version }),
      });
      return { status: response.status, data: (await response.json()) as Record<string, unknown> };
    }),
  );
  assert.deepEqual(claims.map((claim) => claim.status).sort(), [201, 409]);
  const winner = claims.find((claim) => claim.status === 201);
  assert(winner);
  const run = winner.data;
  const competing = await Promise.allSettled([
    command('issues', 'claim', issue.id as string),
    command('issues', 'claim', issue.id as string),
  ]);
  assert(competing.every((result) => result.status === 'rejected'));
  await command('fixes', 'renew', run.id as string);
  const failedPath = join(output, 'failure.json');
  await writeFile(
    failedPath,
    JSON.stringify({
      summary: 'Could not reproduce',
      stage: 'verification',
      reason: 'Missing fixture',
    }),
  );
  await command('fixes', 'fail', run.id as string, '--result-file', failedPath);
  assert.equal(
    (await db.report.findUniqueOrThrow({ where: { id: issue.id as string } })).status,
    'FIX_FAILED',
  );
  if (process.env.MARKFIX_BROWSER_SMOKE === 'true')
    await execute(
      resolve('../desktop/node_modules/electron/dist/Electron.app/Contents/MacOS/Electron'),
      [resolve('../desktop/scripts/smoke-agent-browser.mjs')],
      {
        env: {
          ...process.env,
          MARKFIX_TEST_OUTPUT: output,
          MARKFIX_TEST_API: origin,
          MARKFIX_TEST_TOKEN: accessToken,
          MARKFIX_TEST_MODE: 'failed',
        },
        timeout: 60_000,
      },
    );
  await assert.rejects(command('issues', 'claim', issue.id as string));
  const retry = await command('issues', 'claim', issue.id as string, '--retry');
  const fixture = join(output, 'sum.mjs');
  await writeFile(fixture, 'export const sum = (a,b) => a+b;\n');
  await execute(
    process.execPath,
    [
      '--input-type=module',
      '-e',
      "import assert from 'node:assert/strict'; import {sum} from './sum.mjs'; assert.equal(sum(2,3),5)",
    ],
    { cwd: output },
  );
  const successPath = join(output, 'success.json');
  await writeFile(
    successPath,
    JSON.stringify({
      summary: 'Corrected total',
      checks: [{ command: 'node sum assertion', outcome: 'passed', details: 'sum(2,3) equals 5' }],
    }),
  );
  failCompletion = true;
  await assert.rejects(
    command('fixes', 'complete', retry.id as string, '--result-file', successPath),
    (error: unknown) => (error as { code?: number }).code === 4,
  );
  assert.equal(
    (await db.report.findUniqueOrThrow({ where: { id: issue.id as string } })).status,
    'IN_PROGRESS',
  );
  failCompletion = false;
  await command('sync');
  await command('fixes', 'complete', retry.id as string, '--result-file', successPath);
  await command('fixes', 'complete', retry.id as string, '--result-file', successPath);
  assert.equal(
    (await db.report.findUniqueOrThrow({ where: { id: issue.id as string } })).status,
    'READY_FOR_VERIFY',
  );
  const admin = await request(`/commercial/projects/${project.id}/annotations`);
  const projected = (
    admin.items as Array<{ status: string; fixAttempts: Array<{ reason: string }> }>
  )[0];
  assert.equal(projected?.status, 'READY_FOR_VERIFY');
  assert(projected?.fixAttempts.some((attempt) => attempt.reason === 'Missing fixture'));
  if (process.env.MARKFIX_BROWSER_SMOKE === 'true')
    await execute(
      resolve('../desktop/node_modules/electron/dist/Electron.app/Contents/MacOS/Electron'),
      [resolve('../desktop/scripts/smoke-agent-browser.mjs')],
      {
        env: {
          ...process.env,
          MARKFIX_TEST_OUTPUT: output,
          MARKFIX_TEST_API: origin,
          MARKFIX_TEST_TOKEN: accessToken,
          MARKFIX_TEST_MODE: 'completed',
        },
        timeout: 60_000,
      },
    );
  // Changed annotations reject old completion; release does not overwrite the edited report.
  await db.report.update({
    where: { id: issue.id as string },
    data: { status: 'OPEN', version: { increment: 1 } },
  });
  const changedRun = await command('issues', 'claim', issue.id as string);
  await db.report.update({
    where: { id: issue.id as string },
    data: { description: 'New requirement', version: { increment: 1 } },
  });
  await request(
    `/agent/fixes/${changedRun.id}/complete`,
    JSON.parse(await readFile(successPath, 'utf8')),
    { token: credential.accessToken, status: 409 },
  );
  await command('fixes', 'release', changedRun.id as string);
  const changedIssue = await db.report.findUniqueOrThrow({ where: { id: issue.id as string } });
  assert.equal(changedIssue.description, 'New requirement');
  assert.equal(changedIssue.status, 'IN_PROGRESS');
  await assert.rejects(command('issues', 'claim', issue.id as string));
  const abandoned = await command('issues', 'claim', issue.id as string, '--retry');
  await db.agentFixAttempt.update({
    where: { id: abandoned.id as string },
    data: { leaseExpiresAt: new Date(0) },
  });
  const available = await command('issues', 'list', '--project', project.id as string);
  assert((available.items as Array<{ id: string }>).some((item) => item.id === issue.id));
  assert.equal(
    (await db.agentFixAttempt.findUniqueOrThrow({ where: { id: abandoned.id as string } })).status,
    'INTERRUPTED',
  );
  const concurrent = await request('/agent/device', {
    account: owner.email,
    deviceName: 'Concurrent request',
    agentType: 'codex',
  });
  const post = (path: string, body: unknown) =>
    fetch(`${origin}/v1/agent${path}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Origin: 'http://127.0.0.1:14311',
        Authorization: `Bearer ${accessToken}`,
      },
      body: JSON.stringify(body),
    });
  const decisions = await Promise.all(
    [1, 2].map(() =>
      post('/device/decision', {
        userCode: concurrent.userCode,
        approve: true,
        projectIds: [project.id],
      }),
    ),
  );
  assert.deepEqual(decisions.map((item) => item.status).sort(), [201, 409]);
  const exchanges = await Promise.all(
    [1, 2].map(() => post('/token', { deviceCode: concurrent.deviceCode })),
  );
  assert.deepEqual(exchanges.map((item) => item.status).sort(), [201, 401]);
  await request('/agent/requests', undefined, { token: credential.accessToken, status: 401 });
  await request(
    '/agent/device/decision',
    { userCode: concurrent.userCode, approve: true, projectIds: [project.id] },
    { token: credential.accessToken, status: 401 },
  );
  const expiry = await request('/agent/device', {
    account: owner.email,
    deviceName: 'Expired device',
    agentType: 'codex',
  });
  await db.agentDeviceRequest.update({
    where: { userCode: expiry.userCode as string },
    data: { expiresAt: new Date(0) },
  });
  await request('/agent/token', { deviceCode: expiry.deviceCode }, { status: 401 });
  await db.membership.update({
    where: { projectId_userId: { projectId: project.id as string, userId: owner.id } },
    data: { status: 'SUSPENDED' },
  });
  await request(`/agent/issues?projectId=${project.id}`, undefined, {
    token: credential.accessToken,
    status: 403,
  });
  await db.membership.update({
    where: { projectId_userId: { projectId: project.id as string, userId: owner.id } },
    data: { status: 'ACTIVE' },
  });
  const deny = await request('/agent/device', {
    account: owner.email,
    deviceName: 'Denied device',
    agentType: 'codex',
  });
  await request('/agent/device/decision', {
    userCode: deny.userCode,
    approve: false,
    projectIds: [],
  });
  await request('/agent/token', { deviceCode: deny.deviceCode }, { status: 401 });
  await request(`/agent/grants/${credential.grantId}`, undefined, {
    method: 'DELETE',
    status: 200,
  });
  await assert.rejects(command('auth', 'status'));
  await request('/agent/token/refresh', { refreshToken: credential.refreshToken }, { status: 401 });
  console.log(
    `PASS authorized CLI setup → repository binding → existing submission + screenshot → claim → failure → retry → verified completion → admin history → revoke. Evidence: ${output}`,
  );
} finally {
  await app.close();
}
