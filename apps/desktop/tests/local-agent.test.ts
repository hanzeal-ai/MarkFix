import assert from 'node:assert/strict';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { mkdtemp, readFile, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { randomUUID } from 'node:crypto';
import { execFile, spawn } from 'node:child_process';
import { promisify } from 'node:util';
import { DraftStore } from '../src/main/draft-store.js';
import { LocalAgentService } from '../src/main/local-agent/service.js';
import { startLocalAgentServer } from '../src/main/local-agent/server.js';
import type { SavedElementComment } from '@markfix/contracts';

const cleanup: Array<() => Promise<void>> = [];
afterEach(async () => {
  vi.restoreAllMocks();
  for (const run of cleanup.splice(0).reverse()) await run();
});
async function fixture() {
  const directory = await mkdtemp(join(tmpdir(), 'markfix-local-agent-'));
  cleanup.push(() => rm(directory, { recursive: true, force: true }));
  const store = new DraftStore(join(directory, 'draft.sqlite'));
  cleanup.push(async () => store.close());
  const projectId = randomUUID(),
    otherId = randomUUID(),
    cloudId = randomUUID();
  for (const id of [projectId, otherId, cloudId])
    store.saveWebsiteProject({
      id,
      storageMode: id === cloudId ? 'CLOUD' : 'LOCAL',
      title: '测试项目',
      origin: 'https://example.test',
      entryUrl: 'https://example.test/page',
      faviconUrl: null,
      faviconSource: 'markfix',
      currentPageSessionId: randomUUID(),
      currentUrl: 'https://example.test/page',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });
  const record: SavedElementComment = {
    id: randomUUID(),
    projectId,
    pageSessionId: randomUUID(),
    pageTitle: '本机标注',
    pageUrl: 'https://example.test/page',
    status: 'draft',
    note: '修复标题间距',
    screenshotDataUrl:
      'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jEioAAAAASUVORK5CYII=',
    createdAt: '2026-09-09T00:00:00.000Z',
    updatedAt: '2026-09-09T00:00:00.000Z',
    anchor: {
      kind: 'element',
      cssSelector: 'h1',
      textQuote: 'Title',
      tagName: 'h1',
      attributes: {},
      documentUrl: 'https://example.test/page',
      framePath: [],
      quadsCssPx: [[0, 0, 20, 0, 20, 20, 0, 20]],
    },
  };
  store.saveElementComment(record);
  const service = new LocalAgentService(store);
  const discovery = join(directory, 'agent.json');
  const server = await startLocalAgentServer(service, discovery);
  cleanup.push(server.close);
  const descriptor = JSON.parse(await readFile(discovery, 'utf8'));
  const send = async (path: string, body?: unknown, token?: string) => {
    const response = await fetch(server.origin + path, {
      method: body === undefined ? 'GET' : 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-MarkFix-Local-Secret': descriptor.secret,
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    });
    return { status: response.status, body: await response.json() };
  };
  const grant = async (ids = [projectId]) => {
    const device = await send('/v1/agent/device', { deviceName: 'Test CLI', agentType: 'codex' });
    const ticket = device.body.deviceCode;
    service.decide(ticket, service.page(ticket).csrf, {
      userCode: device.body.userCode,
      approve: true,
      projectIds: ids,
    });
    return (await send('/v1/agent/token', { deviceCode: ticket })).body;
  };
  return {
    store,
    service,
    server,
    directory,
    discovery,
    record,
    projectId,
    otherId,
    cloudId,
    send,
    grant,
  };
}

describe('desktop LOCAL agent boundary', () => {
  it('authorizes only selected LOCAL projects and rejects browser/API cross-origin access', async () => {
    const f = await fixture();
    const tokens = await f.grant();
    expect(
      (await f.send('/v1/agent/projects', undefined, tokens.accessToken)).body.map(
        (p: { id: string }) => p.id,
      ),
    ).toEqual([f.projectId]);
    expect(
      (await f.send(`/v1/agent/issues?projectId=${f.otherId}`, undefined, tokens.accessToken))
        .status,
    ).toBe(403);
    expect(
      (await f.send(`/v1/agent/issues?projectId=${f.cloudId}`, undefined, tokens.accessToken))
        .status,
    ).toBe(403);
    expect(
      (await fetch(f.server.origin + '/v1/agent/device', { method: 'POST', body: '{}' })).status,
    ).toBe(403);
    expect(
      (
        await fetch(f.server.origin + '/v1/agent/projects', {
          headers: { Origin: 'https://evil.test', Authorization: `Bearer ${tokens.accessToken}` },
        })
      ).status,
    ).toBe(403);
    const pending = await f.send('/v1/agent/device', { deviceName: 'Other', agentType: 'codex' });
    expect(() =>
      f.service.decide(pending.body.deviceCode, 'bad', {
        userCode: pending.body.userCode,
        approve: true,
        projectIds: [f.projectId],
      }),
    ).toThrow();
    expect(() =>
      f.service.decide(pending.body.deviceCode, f.service.page(pending.body.deviceCode).csrf, {
        userCode: pending.body.userCode,
        approve: true,
        projectIds: [f.cloudId],
      }),
    ).toThrow();
    await f.send('/v1/agent/logout', {}, tokens.accessToken);
    expect(
      (await f.send('/v1/agent/token/refresh', { refreshToken: tokens.refreshToken })).status,
    ).toBe(401);
  });
  it('runs submitted snapshots through claim, failure, retry and idempotent completion without changing drafts or cloud data', async () => {
    const f = await fixture();
    const tokens = await f.grant();
    const request = (path: string, body?: unknown) =>
      f.send('/v1/agent' + path, body, tokens.accessToken);
    expect((await request(`/issues?projectId=${f.projectId}`)).body.items).toEqual([]);
    f.store.submitProjectAnnotations(f.projectId);
    const report = (await request(`/issues/${f.record.id}`)).body;
    const runId = randomUUID();
    expect(
      (await request(`/issues/${report.id}/claim`, { runId, expectedVersion: report.version }))
        .status,
    ).toBe(200);
    expect(
      (
        await request(`/issues/${report.id}/claim`, {
          runId: randomUUID(),
          expectedVersion: report.version,
        })
      ).status,
    ).toBe(409);
    expect(
      (await request(`/fixes/${runId}/complete`, { summary: '未验证', checks: [] })).status,
    ).toBe(400);
    expect(
      (
        await request(`/fixes/${runId}/fail`, {
          summary: '未完成',
          reason: '缺少测试资料',
          stage: 'verification',
        })
      ).body.report.status,
    ).toBe('FIX_FAILED');
    const failed = (await request(`/issues/${report.id}`)).body;
    expect(failed.fixAttempts[0].reason).toBe('缺少测试资料');
    expect(
      (
        await request(`/issues/${report.id}/claim`, {
          runId: randomUUID(),
          expectedVersion: failed.version,
        })
      ).status,
    ).toBe(409);
    const retry = randomUUID();
    await request(`/issues/${report.id}/claim`, {
      runId: retry,
      expectedVersion: failed.version,
      retry: true,
    });
    const result = {
      summary: '已修正',
      checks: [{ command: 'pnpm test', outcome: 'passed', details: '通过' }],
    };
    expect((await request(`/fixes/${retry}/complete`, result)).body.report.status).toBe('RESOLVED');
    expect((await request(`/fixes/${retry}/complete`, result)).body.confirmed).toBe(true);
    expect((await request(`/fixes/${retry}/complete`, { ...result, summary: '替换' })).status).toBe(
      409,
    );
    expect(new LocalAgentService(f.store).reports(f.projectId)[0]?.status).toBe('RESOLVED');
    expect(f.store.listElementComments(f.projectId)[0]?.note).toBe(f.record.note);
    expect(f.store.listWebsiteProjects('CLOUD')).toHaveLength(1);
    f.store.deleteWebsiteProject(f.projectId);
    expect((await request(`/issues/${report.id}`)).status).toBe(404);
    expect(f.store.readLocalAgentState()).not.toContain(f.record.note);
    expect(f.store.readLocalAgentState()).not.toContain('缺少测试资料');
    expect(new LocalAgentService(f.store).reports(f.projectId)).toEqual([]);
  });
  it('rejects stale repairs after a new submission, isolates grants, and expires leases', async () => {
    const f = await fixture();
    const tokens = await f.grant();
    f.store.submitProjectAnnotations(f.projectId);
    const report = f.service.reports(f.projectId)[0];
    assert(report);
    const runId = randomUUID();
    await f.send(
      `/v1/agent/issues/${report.id}/claim`,
      { runId, expectedVersion: report.version },
      tokens.accessToken,
    );
    const other = await f.grant();
    expect((await f.send(`/v1/agent/fixes/${runId}/renew`, {}, other.accessToken)).status).toBe(
      404,
    );
    const clock = vi.spyOn(Date, 'now');
    clock.mockReturnValue(Date.now() + 16 * 60_000);
    const refreshed = (
      await f.send('/v1/agent/token/refresh', { refreshToken: tokens.refreshToken })
    ).body;
    expect((await f.send(`/v1/agent/fixes/${runId}/renew`, {}, refreshed.accessToken)).status).toBe(
      409,
    );
    clock.mockRestore();
    f.store.saveElementComment({
      ...f.record,
      updatedAt: '2026-09-10T00:00:00.000Z',
      note: '更新的要求',
    });
    f.store.submitProjectAnnotations(f.projectId);
    expect(
      (
        await f.send(
          `/v1/agent/fixes/${runId}/fail`,
          { summary: '失败', reason: '原因', stage: 'fix' },
          refreshed.accessToken,
        )
      ).status,
    ).toBe(409);
    expect(f.service.reports(f.projectId)[0]?.description).toBe('更新的要求');
  });
  it('first-use CLI connects to desktop, waits for browser approval, resumes and reuses local credentials', async () => {
    const f = await fixture();
    f.store.submitProjectAnnotations(f.projectId);
    await promisify(execFile)('git', ['init', f.directory]);
    const cli = resolve('../cli/src/cli.mjs');
    const env = {
      ...process.env,
      MARKFIX_CLI_HOME: join(f.directory, 'cli'),
      CODEX_HOME: join(f.directory, 'codex'),
      MARKFIX_LOCAL_AGENT_FILE: f.discovery,
    };
    const child = spawn(
      process.execPath,
      [cli, 'projects', 'list', '--local', '--credential-store', 'file', '--no-browser'],
      { cwd: f.directory, env },
    );
    let stdout = '',
      stderr = '';
    child.stdout.on('data', (chunk) => {
      stdout += chunk;
    });
    child.stderr.on('data', (chunk) => {
      stderr += chunk;
    });
    const done = new Promise<number | null>((resolve, reject) => {
      child.on('exit', resolve);
      child.on('error', reject);
    });
    await vi.waitFor(() => expect(stderr).toContain('Authorize this device'), { timeout: 5000 });
    const url = (/http:\/\/127\.0\.0\.1:\d+\/authorize\?ticket=[a-f0-9]+/.exec(stderr) ?? [])[0];
    assert(url);
    const page = await (await fetch(url)).text();
    const csrf = (/name="csrf" value="([^"]+)"/.exec(page) ?? [])[1];
    const code = (/name="userCode" value="([^"]+)"/.exec(page) ?? [])[1];
    assert(csrf && code);
    const approve = await fetch(url, {
      method: 'POST',
      headers: { Origin: f.server.origin, 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ csrf, userCode: code, approve: 'yes', projectIds: f.projectId }),
    });
    expect(approve.status).toBe(200);
    expect(await done).toBe(0);
    expect(JSON.parse(stdout)[0].id).toBe(f.projectId);
    expect(f.service.repositories(f.projectId)).toHaveLength(1);
    const second = await promisify(execFile)(
      process.execPath,
      [cli, 'issues', 'list', '--local', '--project', f.projectId],
      { cwd: f.directory, env },
    );
    expect(JSON.parse(second.stdout).items[0].id).toBe(f.record.id);
    expect(second.stderr).not.toContain('Authorize this device');
    const run = async (...args: string[]) =>
      promisify(execFile)(process.execPath, [cli, ...args, '--local'], { cwd: f.directory, env });
    const claim = JSON.parse((await run('issues', 'claim', f.record.id)).stdout);
    const resultPath = join(f.directory, 'result.json');
    await writeFile(
      resultPath,
      JSON.stringify({
        summary: '隔离用例修复完成',
        checks: [
          { command: 'local fixture verification', outcome: 'passed', details: '用例验证通过' },
        ],
      }),
    );
    await f.server.close();
    await expect(
      run('fixes', 'complete', claim.id, '--result-file', resultPath),
    ).rejects.toMatchObject({ code: 4 });
    const restarted = await startLocalAgentServer(new LocalAgentService(f.store), f.discovery);
    cleanup.push(restarted.close);
    const synchronized = JSON.parse((await run('sync')).stdout);
    expect(synchronized.results[0].confirmed).toBe(true);
    expect(synchronized.results[0].report.status).toBe('RESOLVED');

    await promisify(execFile)(
      process.execPath,
      [
        cli,
        'issues',
        'screenshot',
        f.record.id,
        '--local',
        '--output',
        join(f.directory, 'issue.png'),
      ],
      { cwd: f.directory, env },
    );
    expect((await readFile(join(f.directory, 'issue.png'))).subarray(0, 8).toString('hex')).toBe(
      '89504e470d0a1a0a',
    );
    expect(await readFile(join(f.directory, 'cli/local/config.json'), 'utf8')).not.toContain(
      'localSecret',
    );
    await expect(readFile(join(f.directory, 'cli/config.json'))).rejects.toThrow();
  }, 15000);
});
