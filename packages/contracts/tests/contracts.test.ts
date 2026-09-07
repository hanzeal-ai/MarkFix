import { describe, expect, it } from 'vitest';
import {
  createEnvironmentSchema,
  createProjectSchema,
  createReportSchema,
  elementAnchorSchema,
  reportSchema,
  regionAnchorSchema,
  savedCaptureSchema,
  updateEnvironmentSchema,
  updateProjectSchema,
  websiteProjectSchema,
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

describe('elementAnchorSchema runtime evidence', () => {
  it('accepts source-search evidence while remaining optional for old records', () => {
    const base = {
      kind: 'element' as const,
      cssSelector: '#submit',
      textQuote: 'Submit',
      tagName: 'button',
      attributes: { id: 'submit' },
      documentUrl: 'https://example.com/form',
      framePath: [],
      quadsCssPx: [[0, 0, 80, 0, 80, 30, 0, 30]],
    };
    expect(elementAnchorSchema.safeParse(base).success).toBe(true);
    expect(
      elementAnchorSchema.parse({
        ...base,
        runtimeEvidence: {
          schemaVersion: 1,
          selectorCandidates: ['#submit', 'button[data-testid="submit"]'],
          classNames: ['primary'],
          accessibleName: 'Submit form',
          sanitizedOuterHtml: '<button id="submit">Submit</button>',
          ancestorPath: [
            { tagName: 'button', selectorSegment: 'button#submit', attributes: { id: 'submit' } },
          ],
          nearbyText: ['Cancel'],
          pageBuild: {
            scripts: [
              {
                url: 'https://example.com/app.js',
                sourceMapUrl: 'https://example.com/app.js.map',
              },
            ],
            stylesheets: ['https://example.com/app.css'],
            sourceMapHints: ['https://example.com/app.js.map'],
            metadata: { version: '1.0.0' },
            frameworkHints: ['react'],
          },
        },
      }).runtimeEvidence?.pageBuild.sourceMapHints,
    ).toEqual(['https://example.com/app.js.map']);
  });
});

describe('current desktop persistence schemas', () => {
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

describe('website project storage ownership', () => {
  const base = {
    id: crypto.randomUUID(),
    title: 'Example',
    origin: 'https://example.test',
    entryUrl: 'https://example.test/start',
    faviconUrl: null,
    faviconSource: 'markfix' as const,
    currentPageSessionId: crypto.randomUUID(),
    currentUrl: 'https://example.test/start',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };

  it('keeps local projects independent from cloud workspaces', () => {
    expect(websiteProjectSchema.parse({ ...base, storageMode: 'LOCAL' })).not.toHaveProperty(
      'workspaceId',
    );
    expect(
      websiteProjectSchema.safeParse({
        ...base,
        storageMode: 'LOCAL',
        workspaceId: crypto.randomUUID(),
      }).success,
    ).toBe(false);
  });

  it('requires every cloud project to belong to a workspace', () => {
    expect(websiteProjectSchema.safeParse({ ...base, storageMode: 'CLOUD' }).success).toBe(false);
    expect(
      websiteProjectSchema.safeParse({
        ...base,
        storageMode: 'CLOUD',
        workspaceId: crypto.randomUUID(),
      }).success,
    ).toBe(true);
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

  it('preserves a nullable rejection reason from server reports', () => {
    expect(reportSchema.shape.rejectionReason.safeParse('请补充复现步骤').success).toBe(true);
    expect(reportSchema.shape.rejectionReason.safeParse(null).success).toBe(true);
  });
});
