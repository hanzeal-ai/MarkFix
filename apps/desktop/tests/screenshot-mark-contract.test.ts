import { describe, expect, it } from 'vitest';
import {
  screenshotMarkSchema,
  screenshotStyleSchema,
  screenshotToolSchema,
} from '@markfix/contracts';

const base = {
  id: '11111111-1111-4111-8111-111111111111',
  color: '#ef4444',
  strokeWidth: 4 as const,
};

describe('screenshot mark contract', () => {
  it('supports every editor tool', () => {
    expect(
      screenshotToolSchema.options.map((tool) => screenshotToolSchema.parse(tool)),
    ).toHaveLength(8);
  });

  it.each([
    { ...base, type: 'rectangle', x: 10, y: 20, width: 100, height: 50 },
    { ...base, type: 'ellipse', x: 10, y: 20, width: 100, height: 50 },
    { ...base, type: 'mosaic', x: 10, y: 20, width: 100, height: 50 },
    { ...base, type: 'arrow', start: { x: 10, y: 20 }, end: { x: 110, y: 70 } },
    {
      ...base,
      type: 'pen',
      points: [
        { x: 10, y: 20 },
        { x: 11, y: 21 },
      ],
    },
    { ...base, type: 'text', position: { x: 10, y: 20 }, text: 'Button spacing' },
    { ...base, type: 'number', position: { x: 10, y: 20 }, label: 1 },
  ])('accepts a $type mark', (mark) => {
    expect(screenshotMarkSchema.parse(mark)).toEqual(mark);
  });

  it('limits editor styles to the supported stroke widths', () => {
    expect(screenshotStyleSchema.parse({ color: '#2563eb', strokeWidth: 6 })).toEqual({
      color: '#2563eb',
      strokeWidth: 6,
    });
    expect(() => screenshotStyleSchema.parse({ color: '#2563eb', strokeWidth: 5 })).toThrow();
  });
});
