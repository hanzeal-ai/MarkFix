import type { MenuItem, MenuItemConstructorOptions } from 'electron';
import type { ShortcutInput } from './shortcut-input';

export const projectRefreshForShortcut = (
  input: ShortcutInput,
): 'reload' | 'ignore-cache' | undefined => {
  if (input.type !== 'keyDown' || input.alt) return undefined;
  if (input.code === 'F5' || (input.code === 'KeyR' && (input.meta || input.control)))
    return input.shift || (input.code === 'F5' && input.control) ? 'ignore-cache' : 'reload';
  return undefined;
};

export const routeProjectRefreshMenu = (
  items: readonly MenuItem[],
  refresh: (ignoreCache: boolean) => void,
): MenuItemConstructorOptions[] =>
  items.map((item) => {
    const options: MenuItemConstructorOptions = {
      id: item.id,
      label: item.label,
      type: item.type,
      enabled: item.enabled,
      visible: item.visible,
      checked: item.checked,
      ...(item.accelerator ? { accelerator: item.accelerator } : {}),
    };
    if (item.role === 'reload' || item.role === 'forceReload') {
      return { ...options, click: () => refresh(item.role === 'forceReload') };
    }
    return {
      ...options,
      ...(item.submenu
        ? { submenu: routeProjectRefreshMenu(item.submenu.items, refresh) }
        : {
            ...(item.role ? { role: item.role } : {}),
            click: (menuItem, window, event) => item.click(menuItem, window, event),
          }),
    };
  });
