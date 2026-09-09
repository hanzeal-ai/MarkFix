import { expect, it } from 'vitest';
import { annotationPanelWidth, isSidebarWidth } from '../src/sidebar-layout';

it('accepts collapsed and bounded widths and rejects invalid layout input', () => {
  for (const width of [0, 228, 300, 400]) expect(isSidebarWidth(width)).toBe(true);
  for (const width of [null, undefined, '300', NaN, Infinity, -1, 160, 401, 250.5])
    expect(isSidebarWidth(width)).toBe(false);
});

it('keeps room for the website when either sidebar or the window changes width', () => {
  expect(annotationPanelWidth(360, 0, 1060)).toBe(360);
  expect(annotationPanelWidth(400, 400, 1060)).toBe(340);
  expect(annotationPanelWidth(400, 400, 1440)).toBe(400);
  expect(annotationPanelWidth(200, 200, 1060)).toBe(200);
  expect(annotationPanelWidth(400, 400, 600)).toBe(0);
});
