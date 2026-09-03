import { describe, expect, it } from 'vitest';
import { applyAnnotationCommand, emptyAnnotationDocument } from '../src/index.js';

describe('applyAnnotationCommand', () => {
  it('does not add the same annotation twice', () => {
    const annotation = {
      id: '019cbbfd-78d7-7000-8000-000000000001',
      type: 'text' as const,
      color: '#ff4d5a',
      createdAt: new Date().toISOString(),
      position: { x: 10, y: 10 },
      text: 'Broken',
    };
    const once = applyAnnotationCommand(emptyAnnotationDocument(), { type: 'add', annotation });
    const twice = applyAnnotationCommand(once, { type: 'add', annotation });
    expect(twice.annotations).toHaveLength(1);
  });
});
