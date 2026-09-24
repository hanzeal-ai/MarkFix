import { hasPrimaryModifier, type ShortcutInput } from './shortcut-input.js';

export type WindowShortcutContext = 'main' | 'child';
export type WindowShortcutAction = 'minimize' | 'close' | 'quit' | 'settings';

export const windowActionForShortcut = (
  input: ShortcutInput,
  context: WindowShortcutContext,
  platform = 'darwin',
): WindowShortcutAction | undefined => {
  if (
    input.type !== 'keyDown' ||
    input.isAutoRepeat ||
    !hasPrimaryModifier(input, platform) ||
    input.alt ||
    input.shift
  )
    return undefined;

  if (input.code === 'KeyQ') return 'quit';
  if (input.code === 'Comma') return 'settings';
  if (input.code === 'KeyW')
    return context === 'main' && platform === 'darwin' ? 'minimize' : 'close';
  return undefined;
};
