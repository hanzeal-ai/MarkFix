import type { ShortcutInput } from './shortcut-input.js';

export type WindowShortcutContext = 'main' | 'child';
export type WindowShortcutAction = 'minimize' | 'close' | 'quit' | 'settings';

export const windowActionForShortcut = (
  input: ShortcutInput,
  context: WindowShortcutContext,
): WindowShortcutAction | undefined => {
  if (
    input.type !== 'keyDown' ||
    input.isAutoRepeat ||
    !input.meta ||
    input.alt ||
    input.control ||
    input.shift
  )
    return undefined;

  if (input.code === 'KeyQ') return 'quit';
  if (input.code === 'Comma') return 'settings';
  if (input.code === 'KeyW') return context === 'main' ? 'minimize' : 'close';
  return undefined;
};
