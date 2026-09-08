import { expect, it } from 'vitest';
import { isSidebarWidth } from '../src/sidebar-layout';

it('accepts collapsed and bounded widths and rejects invalid layout input', () => {
  for (const width of [0, 228, 300, 400]) expect(isSidebarWidth(width)).toBe(true);
  for (const width of [null, undefined, '300', NaN, Infinity, -1, 160, 401, 250.5])
    expect(isSidebarWidth(width)).toBe(false);
});
