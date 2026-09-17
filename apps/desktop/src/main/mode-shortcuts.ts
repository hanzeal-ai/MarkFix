import type { ShortcutInput } from './shortcut-input.js';

export type DesktopShortcut =
  'capture' | 'comment' | 'preview' | 'diagnostics' | 'toggle-sidebar' | 'new-annotation';

export const modeForShortcut = (input: ShortcutInput): DesktopShortcut | undefined => {
  if (
    input.type === 'keyDown' &&
    !input.isAutoRepeat &&
    input.meta &&
    !input.shift &&
    !input.alt &&
    !input.control
  ) {
    if (input.code === 'KeyB') return 'toggle-sidebar';
    if (input.code === 'KeyN') return 'new-annotation';
  }
  if (
    input.type === 'keyDown' &&
    !input.isAutoRepeat &&
    input.code === 'KeyC' &&
    input.meta &&
    input.shift &&
    !input.alt &&
    !input.control
  )
    return 'diagnostics';
  if (
    input.type !== 'keyDown' ||
    input.isAutoRepeat ||
    !input.alt ||
    input.control ||
    input.meta ||
    input.shift
  )
    return undefined;
  if (input.code === 'KeyA') return 'capture';
  if (input.code === 'KeyW') return 'comment';
  if (input.code === 'KeyB') return 'preview';
  return undefined;
};
