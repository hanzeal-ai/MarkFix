import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type {
  AnnotationSubmission,
  SavedCapture,
  SavedDiagnosticAnnotation,
  SavedElementComment,
  WebsiteProject,
} from '@markfix/contracts';
import { DraftStore } from '../src/main/draft-store.js';

const temporaryDirectories: string[] = [];

const createStore = (): DraftStore => {
  const directory = mkdtempSync(join(tmpdir(), 'markfix-outbox-'));
  temporaryDirectories.push(directory);
  return new DraftStore(join(directory, 'drafts.sqlite'));
};

afterEach(() => {
  vi.restoreAllMocks();
  for (const directory of temporaryDirectories.splice(0)) {
    rmSync(directory, { recursive: true, force: true });
  }
});

describe('DraftStore outbox', () => {
  it('deduplicates outstanding work and completes a claimed entry', () => {
    const store = createStore();
    const first = store.enqueue({ title: 'Broken menu' }, 'same-request');
    const duplicate = store.enqueue({ title: 'Broken menu' }, 'same-request');

    expect(duplicate.id).toBe(first.id);
    expect(store.claimDue()).toEqual([first]);
    expect(store.claimDue()).toEqual([]);

    store.markCompleted(first.id, 'report-1');
    expect(store.outboxStatus(first.id)).toEqual({ status: 'COMPLETED', reportId: 'report-1' });
    store.close();
  });

  it('applies retry backoff and recovers interrupted claims', () => {
    const now = 1_800_000_000_000;
    vi.spyOn(Date, 'now').mockReturnValue(now);
    const store = createStore();
    const entry = store.enqueue({ title: 'Offline report' }, 'offline-request');

    expect(store.claimDue()).toHaveLength(1);
    store.markFailed(entry.id, 1, 'network unavailable');
    expect(store.claimDue()).toEqual([]);

    vi.mocked(Date.now).mockReturnValue(now + 2_001);
    expect(store.claimDue()).toEqual([{ ...entry, attempts: 1 }]);
    store.recoverInterrupted();
    expect(store.claimDue()).toEqual([{ ...entry, attempts: 1 }]);
    store.close();
  });
});

describe('DraftStore screenshot annotations', () => {
  it('persists, updates, lists, and deletes captures independently', () => {
    const store = createStore();
    const capture: SavedCapture = {
      id: '1d04602d-c0cb-4aac-bf5b-066b33273a03',
      projectId: '90e2a0c5-0755-49b9-9d5d-41534ed41b41',
      pageSessionId: '60bba625-07f2-40f6-8eef-1ddb681f8513',
      pageTitle: 'Example page',
      status: 'draft',
      pageUrl: 'https://example.com/page',
      note: '按钮遮挡正文',
      dataUrl: 'data:image/png;base64,AA==',
      widthCssPx: 320,
      heightCssPx: 180,
      marks: [],
      selection: {
        kind: 'region',
        xCssPx: 24,
        yCssPx: 32,
        widthCssPx: 320,
        heightCssPx: 180,
        documentUrl: 'https://example.com/page',
        scrollXCssPx: 0,
        scrollYCssPx: 0,
      },
      sourceDataUrl: 'data:image/png;base64,AA==',
      captureScale: 1,
      evidence: [
        {
          id: '10d361f8-1164-4f93-b95d-bdf84e05968a',
          kind: 'network',
          level: 'error',
          timestamp: '2026-09-04T07:59:59.000Z',
          pageUrl: 'https://example.com/page',
          title: 'GET 500',
          message: '500 Internal Server Error',
          request: {
            method: 'GET',
            url: 'https://example.com/api/items',
            status: 500,
          },
          redactions: [],
        },
      ],
      createdAt: '2026-09-04T08:00:00.000Z',
      updatedAt: '2026-09-04T08:00:00.000Z',
    };

    store.saveCapture(capture);
    expect(store.listCaptures()).toEqual([capture]);
    expect(store.getCapture(capture.id)).toEqual(capture);

    store.saveCapture({ ...capture, note: '按钮遮挡正文与链接' });
    expect(store.listCaptures()).toEqual([{ ...capture, note: '按钮遮挡正文与链接' }]);

    store.deleteCapture(capture.id);
    expect(store.listCaptures()).toEqual([]);
    expect(store.getCapture(capture.id)).toBeUndefined();
    store.close();
  });
});

describe('DraftStore element comments', () => {
  it('persists, updates, lists, and deletes comments independently', () => {
    const store = createStore();
    const comment: SavedElementComment = {
      id: '86c28bc3-a8a0-40df-a4b6-c7f71823d41a',
      projectId: '90e2a0c5-0755-49b9-9d5d-41534ed41b41',
      pageSessionId: '60bba625-07f2-40f6-8eef-1ddb681f8513',
      pageTitle: 'Example page',
      status: 'draft',
      pageUrl: 'https://example.com/page',
      anchor: {
        kind: 'element',
        cssSelector: '[id="headline"]',
        textQuote: 'A headline',
        tagName: 'h1',
        attributes: { id: 'headline' },
        documentUrl: 'https://example.com/page',
        framePath: [],
        quadsCssPx: [[10, 20, 210, 20, 210, 80, 10, 80]],
      },
      note: '标题需要修改',
      createdAt: '2026-09-04T08:00:00.000Z',
      updatedAt: '2026-09-04T08:00:00.000Z',
    };

    store.saveElementComment(comment);
    expect(store.listElementComments()).toEqual([comment]);

    const updated = {
      ...comment,
      note: '标题字号需要缩小',
      updatedAt: '2026-09-04T08:05:00.000Z',
    };
    store.saveElementComment(updated);
    expect(store.listElementComments()).toEqual([updated]);

    store.deleteElementComment(comment.id);
    expect(store.listElementComments()).toEqual([]);
    store.close();
  });
});

describe('DraftStore annotation submissions', () => {
  it('persists the selected comments and screenshots as one submission', () => {
    const store = createStore();
    const submittedAt = '2026-09-04T09:00:00.000Z';
    const submission: AnnotationSubmission = {
      id: '65f6407e-9a65-47b5-a70a-f624813a1bbc',
      projectId: '90e2a0c5-0755-49b9-9d5d-41534ed41b41',
      elementComments: [
        {
          id: '80da5ff9-aa0e-4550-b5c8-d3f32fe15749',
          projectId: '90e2a0c5-0755-49b9-9d5d-41534ed41b41',
          pageSessionId: '60bba625-07f2-40f6-8eef-1ddb681f8513',
          pageTitle: 'Example page A',
          status: 'draft',
          pageUrl: 'https://example.com/page-a',
          anchor: {
            kind: 'element',
            cssSelector: '[id="headline"]',
            textQuote: 'Headline',
            tagName: 'h1',
            attributes: { id: 'headline' },
            documentUrl: 'https://example.com/page-a',
            framePath: [],
            quadsCssPx: [[10, 20, 210, 20, 210, 80, 10, 80]],
          },
          note: '标题需要修改',
          createdAt: submittedAt,
          updatedAt: submittedAt,
        },
      ],
      captures: [
        {
          id: '1c7e34ce-bdf0-471d-894d-447208f308f9',
          projectId: '90e2a0c5-0755-49b9-9d5d-41534ed41b41',
          pageSessionId: 'bb0ee545-59c0-427f-ad9c-fb976ef266d5',
          pageTitle: 'Example page B',
          status: 'draft',
          pageUrl: 'https://example.com/page-b',
          note: '截图中的按钮需要调整',
          dataUrl: 'data:image/png;base64,AA==',
          widthCssPx: 320,
          heightCssPx: 180,
          marks: [],
          selection: {
            kind: 'region',
            xCssPx: 24,
            yCssPx: 32,
            widthCssPx: 320,
            heightCssPx: 180,
            documentUrl: 'https://example.com/page-b',
            scrollXCssPx: 0,
            scrollYCssPx: 0,
          },
          sourceDataUrl: 'data:image/png;base64,AA==',
          captureScale: 1,
          createdAt: submittedAt,
          updatedAt: submittedAt,
        },
      ],
      diagnostics: [
        {
          id: 'cf3f22df-a04d-4ff2-839d-39d032f263a2',
          projectId: '90e2a0c5-0755-49b9-9d5d-41534ed41b41',
          pageSessionId: '60bba625-07f2-40f6-8eef-1ddb681f8513',
          pageTitle: 'Example page A',
          pageUrl: 'https://example.com/page-a',
          status: 'draft',
          evidence: {
            id: '10d361f8-1164-4f93-b95d-bdf84e05968a',
            kind: 'console',
            level: 'error',
            timestamp: submittedAt,
            pageUrl: 'https://example.com/page-a',
            title: 'TypeError',
            message: 'Cannot read properties of undefined',
            redactions: [],
          },
          createdAt: submittedAt,
          updatedAt: submittedAt,
        } satisfies SavedDiagnosticAnnotation,
      ],
      submittedAt,
    };

    for (const comment of submission.elementComments) store.saveElementComment(comment);
    for (const capture of submission.captures) store.saveCapture(capture);
    for (const diagnostic of submission.diagnostics) store.saveDiagnosticAnnotation(diagnostic);
    store.saveAnnotationSubmission(submission);

    expect(store.listAnnotationSubmissions()).toEqual([submission]);
    expect(store.listElementComments()).toEqual([
      {
        ...submission.elementComments[0],
        status: 'submitted',
        submittedAt,
      },
    ]);
    expect(store.listCaptures()).toEqual([
      { ...submission.captures[0], status: 'submitted', submittedAt },
    ]);
    expect(store.listDiagnosticAnnotations()).toEqual([
      {
        ...submission.diagnostics[0],
        status: 'submitted',
        submittedAt,
        updatedAt: submittedAt,
      },
    ]);
    store.close();
  });

  it('submits only draft records from the requested project', () => {
    const store = createStore();
    const projectA = '90e2a0c5-0755-49b9-9d5d-41534ed41b41';
    const projectB = 'aa6ba68a-60ad-4116-acd8-bc42c496fa1c';
    const base = {
      pageSessionId: '60bba625-07f2-40f6-8eef-1ddb681f8513',
      pageUrl: 'https://example.com/page',
      pageTitle: 'Example page',
      anchor: {
        kind: 'element' as const,
        cssSelector: '[id="headline"]',
        textQuote: 'Headline',
        tagName: 'h1',
        attributes: { id: 'headline' },
        documentUrl: 'https://example.com/page',
        framePath: [],
        quadsCssPx: [[10, 20, 210, 20, 210, 80, 10, 80]],
      },
      note: '标题需要修改',
      createdAt: '2026-09-04T08:00:00.000Z',
      updatedAt: '2026-09-04T08:00:00.000Z',
    };
    const records: SavedElementComment[] = [
      {
        ...base,
        id: '80da5ff9-aa0e-4550-b5c8-d3f32fe15749',
        projectId: projectA,
        status: 'draft',
      },
      {
        ...base,
        id: 'b7f54877-d9c9-4e3e-8a82-72e790bfa241',
        projectId: projectA,
        status: 'rejected',
        rejectionReason: '信息不足',
      },
      {
        ...base,
        id: '1e0697a1-9155-41f6-b029-0c18c2515740',
        projectId: projectB,
        status: 'draft',
      },
    ];
    records.forEach((record) => store.saveElementComment(record));

    const result = store.submitProjectAnnotations(projectA);
    const saved = store.listElementComments();

    expect(result.elementCommentIds).toEqual([records[0]?.id]);
    expect(saved.find(({ id }) => id === records[0]?.id)?.status).toBe('submitted');
    expect(saved.find(({ id }) => id === records[1]?.id)?.status).toBe('rejected');
    expect(saved.find(({ id }) => id === records[2]?.id)?.status).toBe('draft');
    store.close();
  });
});

describe('DraftStore website projects', () => {
  it('persists project metadata and stable page session IDs', () => {
    const store = createStore();
    const project: WebsiteProject = {
      id: '90e2a0c5-0755-49b9-9d5d-41534ed41b41',
      workspaceId: 'bb0ee545-59c0-427f-ad9c-fb976ef266d5',
      title: 'Example',
      origin: 'https://example.com',
      entryUrl: 'https://example.com/start',
      faviconUrl: 'https://example.com/favicon.ico',
      faviconSource: 'root',
      currentPageSessionId: '60bba625-07f2-40f6-8eef-1ddb681f8513',
      currentUrl: 'https://example.com/start',
      createdAt: '2026-09-04T08:00:00.000Z',
      updatedAt: '2026-09-04T08:00:00.000Z',
    };
    store.saveWebsiteProject(project);
    const first = store.recordProjectPage(project.id, 'https://example.com/page', 'Page');
    const second = store.recordProjectPage(project.id, 'https://example.com/page', 'Page updated');
    store.recordProjectPage(project.id, 'https://example.com/other', 'Other page');

    expect(store.findWebsiteProjectByOrigin(project.origin)?.id).toBe(project.id);
    expect(first?.currentPageSessionId).toBe(second?.currentPageSessionId);
    expect(store.stepProjectHistory(project.id, -1)?.url).toBe('https://example.com/page');
    expect(store.stepProjectHistory(project.id, 1)?.url).toBe('https://example.com/other');
    store.save({
      title: '',
      description: '',
      url: project.currentUrl,
      annotations: [],
      reproduction: [],
      projectId: project.id,
    });
    store.deleteWebsiteProject(project.id);
    expect(store.getWebsiteProject(project.id)).toBeUndefined();
    expect(store.stepProjectHistory(project.id, -1)).toBeUndefined();
    expect(store.load()).toBeUndefined();
    store.close();
  });

  it('migrates local project state when the server replaces a project ID', () => {
    const store = createStore();
    const previousId = '90e2a0c5-0755-49b9-9d5d-41534ed41b41';
    const projectId = 'aa6ba68a-60ad-4116-acd8-bc42c496fa1c';
    const project: WebsiteProject = {
      id: previousId,
      workspaceId: 'bb0ee545-59c0-427f-ad9c-fb976ef266d5',
      title: 'Example',
      origin: 'https://example.com',
      entryUrl: 'https://example.com/start',
      faviconUrl: 'https://example.com/favicon.ico',
      faviconSource: 'root',
      currentPageSessionId: '60bba625-07f2-40f6-8eef-1ddb681f8513',
      currentUrl: 'https://example.com/start',
      createdAt: '2026-09-04T08:00:00.000Z',
      updatedAt: '2026-09-04T08:00:00.000Z',
    };
    const comment: SavedElementComment = {
      id: '86c28bc3-a8a0-40df-a4b6-c7f71823d41a',
      projectId: previousId,
      pageSessionId: project.currentPageSessionId,
      pageTitle: 'Example page',
      status: 'draft',
      pageUrl: 'https://example.com/page',
      anchor: {
        kind: 'element',
        cssSelector: '[id="headline"]',
        textQuote: 'A headline',
        tagName: 'h1',
        attributes: { id: 'headline' },
        documentUrl: 'https://example.com/page',
        framePath: [],
        quadsCssPx: [[10, 20, 210, 20, 210, 80, 10, 80]],
      },
      note: '标题需要修改',
      createdAt: '2026-09-04T08:00:00.000Z',
      updatedAt: '2026-09-04T08:00:00.000Z',
    };
    store.saveWebsiteProject(project);
    store.recordProjectPage(project.id, project.entryUrl, project.title);
    store.recordProjectPage(project.id, comment.pageUrl, comment.pageTitle);
    store.saveElementComment(comment);
    store.save({
      title: '',
      description: '',
      url: comment.pageUrl,
      annotations: [],
      reproduction: [],
      projectId: previousId,
    });

    const migrated = store.migrateWebsiteProject(previousId, {
      ...project,
      id: projectId,
      workspaceId: 'cf3f22df-a04d-4ff2-839d-39d032f263a2',
    });

    expect(migrated.id).toBe(projectId);
    expect(store.getWebsiteProject(previousId)).toBeUndefined();
    expect(store.getWebsiteProject(projectId)).toEqual(migrated);
    expect(store.listElementComments()[0]?.projectId).toBe(projectId);
    expect(store.load()?.projectId).toBe(projectId);
    expect(store.stepProjectHistory(projectId, -1)?.url).toBe(project.entryUrl);
    store.close();
  });
});
