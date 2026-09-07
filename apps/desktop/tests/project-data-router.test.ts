import { describe, expect, it, vi } from 'vitest';
import type { SavedDiagnosticAnnotation, WebsiteProject } from '@markfix/contracts';
import { ProjectDataRouter } from '../src/main/project-data-router.js';

const localId = '90e2a0c5-0755-49b9-9d5d-41534ed41b41';
const cloudId = 'aa6ba68a-60ad-4116-acd8-bc42c496fa1c';
const workspaceId = 'bb0ee545-59c0-427f-ad9c-fb976ef266d5';

const project = (id: string, storageMode: 'LOCAL' | 'CLOUD'): WebsiteProject => {
  const base = {
    id,
    title: storageMode,
    origin: `https://${storageMode.toLowerCase()}.example.test`,
    entryUrl: `https://${storageMode.toLowerCase()}.example.test/start`,
    faviconUrl: null,
    faviconSource: 'markfix' as const,
    currentPageSessionId: crypto.randomUUID(),
    currentUrl: `https://${storageMode.toLowerCase()}.example.test/start`,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
  return storageMode === 'LOCAL' ? { ...base, storageMode } : { ...base, storageMode, workspaceId };
};

const annotation = (projectId: string): SavedDiagnosticAnnotation => ({
  id: crypto.randomUUID(),
  projectId,
  pageSessionId: crypto.randomUUID(),
  pageUrl: 'https://example.test/page',
  pageTitle: 'Example',
  status: 'draft',
  evidence: {
    id: crypto.randomUUID(),
    kind: 'console',
    level: 'error',
    timestamp: new Date().toISOString(),
    pageUrl: 'https://example.test/page',
    title: 'Error',
    message: 'Failure',
    redactions: [],
  },
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
});

describe('ProjectDataRouter', () => {
  it('keeps local project writes out of the cloud API', async () => {
    const saveDiagnosticAnnotation = vi.fn();
    const saveCloudDiagnostic = vi.fn();
    const projects = new Map([[localId, project(localId, 'LOCAL')]]);
    const router = new ProjectDataRouter(
      { saveCloudDiagnostic } as never,
      () => ({ saveDiagnosticAnnotation }) as never,
      (id) => projects.get(id),
    );

    await router.saveDiagnostic(annotation(localId));

    expect(saveDiagnosticAnnotation).toHaveBeenCalledOnce();
    expect(saveCloudDiagnostic).not.toHaveBeenCalled();
  });

  it('keeps cloud project writes out of local domain tables', async () => {
    const saveDiagnosticAnnotation = vi.fn();
    const saveCloudDiagnostic = vi.fn();
    const projects = new Map([[cloudId, project(cloudId, 'CLOUD')]]);
    const router = new ProjectDataRouter(
      { saveCloudDiagnostic } as never,
      () => ({ saveDiagnosticAnnotation }) as never,
      (id) => projects.get(id),
    );

    await router.saveDiagnostic(annotation(cloudId));

    expect(saveCloudDiagnostic).toHaveBeenCalledOnce();
    expect(saveDiagnosticAnnotation).not.toHaveBeenCalled();
  });

  it('rejects writes when no authoritative project mode exists', async () => {
    const router = new ProjectDataRouter(
      {} as never,
      () => ({}) as never,
      () => undefined,
    );

    await expect(router.saveDiagnostic(annotation(crypto.randomUUID()))).rejects.toThrow(
      '项目不存在或已被移除',
    );
  });

  it('scopes local deletes to the selected project', async () => {
    const deleteDiagnosticAnnotation = vi.fn();
    const projects = new Map([[localId, project(localId, 'LOCAL')]]);
    const router = new ProjectDataRouter(
      {} as never,
      () => ({ deleteDiagnosticAnnotation }) as never,
      (id) => projects.get(id),
    );

    await router.deleteDiagnostic(localId, 'annotation-1');

    expect(deleteDiagnosticAnnotation).toHaveBeenCalledWith('annotation-1', localId);
  });
});
