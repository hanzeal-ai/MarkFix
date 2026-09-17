import { describe, expect, it, vi } from 'vitest';
import type { MenuItem, MenuItemConstructorOptions } from 'electron';
import { projectRefreshForShortcut, routeProjectRefreshMenu } from '../src/main/project-refresh';
import type { ShortcutInput } from '../src/main/shortcut-input';

const input = (overrides: Partial<ShortcutInput>): ShortcutInput => ({
  type: 'keyDown',
  code: 'KeyR',
  alt: false,
  meta: false,
  control: false,
  shift: false,
  isAutoRepeat: false,
  ...overrides,
});

describe('project refresh routing', () => {
  it('routes normal and cache-bypassing refresh keys', () => {
    expect(projectRefreshForShortcut(input({ meta: true }))).toBe('reload');
    expect(projectRefreshForShortcut(input({ control: true }))).toBe('reload');
    expect(projectRefreshForShortcut(input({ code: 'F5' }))).toBe('reload');
    expect(projectRefreshForShortcut(input({ meta: true, shift: true }))).toBe('ignore-cache');
    expect(projectRefreshForShortcut(input({ code: 'F5', control: true }))).toBe('ignore-cache');
    expect(projectRefreshForShortcut(input({}))).toBeUndefined();
    expect(projectRefreshForShortcut(input({ meta: true, alt: true }))).toBeUndefined();
    expect(projectRefreshForShortcut(input({ meta: true, type: 'keyUp' }))).toBeUndefined();
  });
  it('replaces shell reload menu roles with project actions and preserves other actions', () => {
    const refresh = vi.fn();
    const original = vi.fn();
    const items = routeProjectRefreshMenu(
      [
        {
          label: 'View',
          submenu: {
            items: [
              { role: 'reload', accelerator: 'CommandOrControl+R' },
              { role: 'forceReload', accelerator: 'CommandOrControl+Shift+R' },
              { role: 'toggleDevTools', click: original },
            ],
          },
        },
      ] as unknown as MenuItem[],
      refresh,
    );
    const submenu = items[0]?.submenu as MenuItemConstructorOptions[];
    expect(submenu[0]?.role).toBeUndefined();
    expect(submenu[1]?.role).toBeUndefined();
    (submenu[0]?.click as () => void)();
    (submenu[1]?.click as () => void)();
    expect(refresh.mock.calls).toEqual([[false], [true]]);
    expect(submenu[2]?.role).toBe('toggleDevTools');
    (submenu[2]?.click as () => void)();
    expect(original).toHaveBeenCalledOnce();
  });
});
