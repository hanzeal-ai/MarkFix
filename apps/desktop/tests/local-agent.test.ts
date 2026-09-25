import assert from 'node:assert/strict';
import { request as httpRequest } from 'node:http';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { mkdtemp, readFile, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { randomUUID } from 'node:crypto';
import { execFile } from 'node:child_process';
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
  };
}

describe('desktop LOCAL agent boundary', () => {
  it('allows every LOCAL project without approval while rejecting cloud and browser access', async () => {
    const f = await fixture();
    expect(
      (await f.send('/v1/agent/projects')).body.map((p: { id: string }) => p.id).sort(),
    ).toEqual([f.projectId, f.otherId].sort());
    expect((await f.send(`/v1/agent/issues?projectId=${f.otherId}`)).status).toBe(200);
    expect((await f.send(`/v1/agent/issues?projectId=${f.cloudId}`)).status).toBe(403);
    expect((await f.send(`/v1/agent/issues?projectId=${randomUUID()}`)).status).toBe(403);
    expect((await fetch(f.server.origin + '/v1/agent/projects')).status).toBe(403);
    const descriptor = JSON.parse(await readFile(f.discovery, 'utf8'));
    for (const headers of [
      { 'X-MarkFix-Local-Secret': 'wrong' },
      { 'X-MarkFix-Local-Secret': descriptor.secret, Origin: 'https://evil.test' },
    ])
      expect((await fetch(f.server.origin + '/v1/agent/projects', { headers })).status).toBe(403);
    const badHost = await new Promise<number | undefined>((resolve, reject) => {
      const req = httpRequest(
        f.server.origin + '/v1/agent/projects',
        {
          headers: { Host: 'evil.test', 'X-MarkFix-Local-Secret': descriptor.secret },
        },
        (res) => {
          res.resume();
          resolve(res.statusCode);
        },
      );
      req.on('error', reject);
      req.end();
    });
    expect(badHost).toBe(403);
    expect((await f.send('/authorize')).status).toBe(404);
    expect((await f.send('/devices')).status).toBe(404);
    const newId = randomUUID();
    const project = f.store.getWebsiteProject(f.projectId);
    assert(project);
    f.store.saveWebsiteProject({ ...project, id: newId });
    expect((await f.send(`/v1/agent/issues?projectId=${newId}`)).status).toBe(200);
    const repo = (await f.send('/v1/agent/repositories', { localId: randomUUID(), name: 'local' }))
      .body;
    f.service.bind(newId, { repositoryId: repo.id, repositoryName: repo.name });
    expect(f.service.binding(newId).repositoryId).toBe(repo.id);
    expect(() =>
      f.service.bind(f.cloudId, { repositoryId: repo.id, repositoryName: repo.name }),
    ).toThrow();
  });
  it.each(['root', 'run', 'repository'])(
    'rejects obsolete %s grant fields without modifying saved state, and restores current state',
    async (location) => {
      const f = await fixture();
      f.store.submitProjectAnnotations(f.projectId);
      const report = f.service.reports(f.projectId)[0];
      assert(report);
      const runId = randomUUID();
      await f.send(`/v1/agent/issues/${report.id}/claim`, {
        runId,
        expectedVersion: report.version,
      });
      const repo = (
        await f.send('/v1/agent/repositories', { localId: randomUUID(), name: 'existing' })
      ).body;
      f.service.bind(f.projectId, { repositoryId: repo.id, repositoryName: repo.name });
      const state = JSON.parse(f.store.readLocalAgentState() ?? '{}');
      const current = JSON.stringify(state);
      const grantId = randomUUID();
      if (location === 'root')
        state.grants = [{ id: grantId, projectIds: [f.projectId], revoked: true, expires: 0 }];
      if (location === 'run') state.runs[runId].grantId = grantId;
      if (location === 'repository') state.repositories[0].grantId = grantId;
      f.store.writeLocalAgentState(JSON.stringify(state));
      const unsupported = f.store.readLocalAgentState();
      expect(() => new LocalAgentService(f.store)).toThrow();
      expect(f.store.readLocalAgentState()).toBe(unsupported);
      f.store.writeLocalAgentState(current);
      const restored = new LocalAgentService(f.store);
      expect(restored.binding(f.projectId).repositoryId).toBe(repo.id);
      expect(restored.repositories(f.otherId)[0]?.id).toBe(repo.id);
      expect(
        restored.request('POST', new URL(`/v1/agent/fixes/${runId}/renew`, f.server.origin), {}),
      ).toHaveProperty('leaseExpiresAt');
      expect(restored.reports(f.projectId)[0]?.status).toBe('IN_PROGRESS');
    },
  );
  it('runs submitted snapshots through claim, failure, retry and idempotent completion without changing drafts or cloud data', async () => {
    const f = await fixture();
    const request = (path: string, body?: unknown) => f.send('/v1/agent' + path, body);
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
    expect((await request(`/fixes/${retry}/complete`, result)).body.report.status).toBe(
      'READY_FOR_VERIFY',
    );
    expect((await request(`/fixes/${retry}/complete`, result)).body.confirmed).toBe(true);
    expect((await request(`/fixes/${retry}/complete`, { ...result, summary: '替换' })).status).toBe(
      409,
    );
    expect(new LocalAgentService(f.store).reports(f.projectId)[0]?.status).toBe('READY_FOR_VERIFY');
    const pending = f.service.reports(f.projectId)[0];
    if (!pending) throw new Error('Missing pending report');
    expect(() =>
      f.service.review({
        projectId: f.otherId,
        reportId: pending.id,
        expectedVersion: pending.version,
        action: 'verify',
      }),
    ).toThrow('当前项目');
    expect(() =>
      f.service.review({
        projectId: f.projectId,
        reportId: pending.id,
        expectedVersion: pending.version - 1,
        action: 'verify',
      }),
    ).toThrow('已变化');
    expect(
      (
        await request(`/issues/${pending.id}/claim`, {
          runId: randomUUID(),
          expectedVersion: pending.version,
          retry: true,
        })
      ).status,
    ).toBe(409);
    const rejected = f.service.review({
      projectId: f.projectId,
      reportId: pending.id,
      expectedVersion: pending.version,
      action: 'reject',
      reason: '页面仍有偏移',
    });
    expect(rejected.status).toBe('OPEN');
    expect(rejected.reviewFeedback?.[0]?.reason).toBe('页面仍有偏移');
    expect(rejected.description).toBe(f.record.note);
    const finalRun = randomUUID();
    expect(
      (
        await request(`/issues/${pending.id}/claim`, {
          runId: finalRun,
          expectedVersion: rejected.version,
        })
      ).status,
    ).toBe(200);
    await request(`/fixes/${finalRun}/complete`, result);
    const finalPending = f.service.reports(f.projectId)[0];
    if (!finalPending) throw new Error('Missing final pending report');
    const verified = f.service.review({
      projectId: f.projectId,
      reportId: finalPending.id,
      expectedVersion: finalPending.version,
      action: 'verify',
    });
    expect(verified.status).toBe('RESOLVED');
    expect(new LocalAgentService(f.store).reports(f.projectId)[0]?.status).toBe('RESOLVED');
    expect(f.store.listElementComments(f.projectId)[0]?.note).toBe(f.record.note);
    expect(f.store.listWebsiteProjects('CLOUD')).toHaveLength(1);
    f.store.deleteWebsiteProject(f.projectId);
    expect((await request(`/issues/${report.id}`)).status).toBe(404);
    expect(f.store.readLocalAgentState()).not.toContain(f.record.note);
    expect(f.store.readLocalAgentState()).not.toContain('缺少测试资料');
    expect(new LocalAgentService(f.store).reports(f.projectId)).toEqual([]);
  });
  it('rejects stale repairs after a new submission, allows local task access, and expires leases', async () => {
    const f = await fixture();
    f.store.submitProjectAnnotations(f.projectId);
    const report = f.service.reports(f.projectId)[0];
    assert(report);
    const runId = randomUUID();
    await f.send(`/v1/agent/issues/${report.id}/claim`, { runId, expectedVersion: report.version });
    expect((await f.send(`/v1/agent/fixes/${runId}/renew`, {})).status).toBe(200);
    const clock = vi.spyOn(Date, 'now');
    clock.mockReturnValue(Date.now() + 16 * 60_000);
    expect((await f.send(`/v1/agent/fixes/${runId}/renew`, {})).status).toBe(409);
    clock.mockRestore();
    f.store.saveElementComment({
      ...f.record,
      updatedAt: '2026-09-10T00:00:00.000Z',
      note: '更新的要求',
    });
    f.store.submitProjectAnnotations(f.projectId);
    expect(
      (
        await f.send(`/v1/agent/fixes/${runId}/fail`, {
          summary: '失败',
          reason: '原因',
          stage: 'fix',
        })
      ).status,
    ).toBe(409);
    expect(f.service.reports(f.projectId)[0]?.description).toBe('更新的要求');
  });
  it('first-use CLI connects without approval or credential storage and resumes after restart', async () => {
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
    const first = await promisify(execFile)(
      process.execPath,
      [cli, 'projects', 'list', '--local'],
      { cwd: f.directory, env },
    );
    expect(
      JSON.parse(first.stdout)
        .map((p: { id: string }) => p.id)
        .sort(),
    ).toEqual([f.projectId, f.otherId].sort());
    expect(first.stderr).not.toContain('Authorize this device');
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
    const queuedPath = join(f.directory, 'cli/local/outbox', `${claim.id}.json`);
    const queued = JSON.parse(await readFile(queuedPath, 'utf8'));
    // Current LOCAL results must belong to the exact desktop identity.
    const mismatched = { ...queued, grantId: randomUUID() };
    await writeFile(queuedPath, JSON.stringify(mismatched));
    const restarted = await startLocalAgentServer(new LocalAgentService(f.store), f.discovery);
    cleanup.push(restarted.close);
    await expect(run('sync')).rejects.toMatchObject({ code: 1 });
    expect(JSON.parse(await readFile(queuedPath, 'utf8'))).toEqual(mismatched);
    expect(JSON.parse((await run('issues', 'get', f.record.id)).stdout).status).toBe('IN_PROGRESS');
    await writeFile(queuedPath, JSON.stringify(queued));
    const synchronized = JSON.parse((await run('sync')).stdout);
    expect(synchronized.results[0].confirmed).toBe(true);
    expect(synchronized.results[0].report.status).toBe('READY_FOR_VERIFY');

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
