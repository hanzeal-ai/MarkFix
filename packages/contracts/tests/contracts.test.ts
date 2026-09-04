import { describe, expect, it } from 'vitest';
import {
  createProjectSchema,
  recorderEventSchema,
  regionAnchorSchema,
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
      }),
    ).toThrow();
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
