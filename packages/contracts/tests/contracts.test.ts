import { describe, expect, it } from 'vitest';
import {
  createEnvironmentSchema,
  createProjectSchema,
  createReportSchema,
  desktopDraftSchema,
  recorderEventSchema,
  regionAnchorSchema,
  savedCaptureSchema,
  updateEnvironmentSchema,
  updateProjectSchema,
} from '../src/index.js';

describe('regionAnchorSchema', () => {
  it('rejects an empty capture region', () => {
    expect(() =>
      regionAnchorSchema.parse({
        kind: 'region',
        xCssPx: 1,
        yCssPx: 1,
        widthCssPx: 0,
        heightCssPx: 20,
        documentUrl: 'https://example.com',
        scrollXCssPx: 0,
        scrollYCssPx: 0,
      }),
    ).toThrow();
  });

  it('requires the current page scroll position', () => {
    expect(
      regionAnchorSchema.safeParse({
        kind: 'region',
        xCssPx: 1,
        yCssPx: 1,
        widthCssPx: 20,
        heightCssPx: 20,
        documentUrl: 'https://example.com',
      }).success,
    ).toBe(false);
  });
});

describe('current desktop persistence schemas', () => {
  it('rejects drafts without the current annotation collections', () => {
    expect(desktopDraftSchema.safeParse({ title: '', description: '', url: '' }).success).toBe(
      false,
    );
  });

  it('rejects captures without editable source context', () => {
    expect(
      savedCaptureSchema.safeParse({
        id: crypto.randomUUID(),
        projectId: crypto.randomUUID(),
        pageSessionId: crypto.randomUUID(),
        pageTitle: 'Example',
        status: 'draft',
        pageUrl: 'https://example.com',
        note: 'Missing source context',
        dataUrl: 'data:image/png;base64,AA==',
        widthCssPx: 20,
        heightCssPx: 20,
        marks: [],
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      }).success,
    ).toBe(false);
  });
});

describe('recorderEventSchema', () => {
  it('keeps input metadata but strips the entered value', () => {
    const event = recorderEventSchema.parse({
      protocolVersion: 1,
      runtimeId: crypto.randomUUID(),
      pageRevision: crypto.randomUUID(),
      type: 'input',
      timestampMs: Date.now(),
      elementName: 'Password',
      inputKind: 'password',
      valueLength: 12,
      value: 'must-not-cross-the-bridge',
    });

    expect(event.valueLength).toBe(12);
    expect(event).not.toHaveProperty('value');
  });
});

describe('project input schemas', () => {
  it('normalizes names and accepts an explicitly empty optional base URL', () => {
    expect(createProjectSchema.parse({ name: '  Storefront  ', baseUrl: '' })).toEqual({
      name: 'Storefront',
      baseUrl: '',
    });
  });

  it('rejects empty project updates and invalid URLs', () => {
    expect(() => updateProjectSchema.parse({})).toThrow();
    expect(() => createProjectSchema.parse({ name: 'Storefront', baseUrl: 'not-a-url' })).toThrow();
  });
});

describe('environment input schemas', () => {
  it('normalizes names and accepts web origins with paths', () => {
    expect(
      createEnvironmentSchema.parse({
        name: '  Staging  ',
        baseUrl: 'https://staging.example.test/app',
      }),
    ).toEqual({ name: 'Staging', baseUrl: 'https://staging.example.test/app' });
  });

  it('rejects non-web protocols and empty updates', () => {
    expect(() =>
      createEnvironmentSchema.parse({ name: 'Local files', baseUrl: 'file:///tmp/index.html' }),
    ).toThrow();
    expect(() => updateEnvironmentSchema.parse({})).toThrow();
  });
});

describe('report destination schema', () => {
  it('accepts an omitted environment while rejecting invalid environment IDs', () => {
    expect(createReportSchema.shape.environmentId.safeParse(undefined).success).toBe(true);
    expect(createReportSchema.shape.environmentId.safeParse('not-a-uuid').success).toBe(false);
  });
});
