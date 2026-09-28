import { hasPrimaryModifier, type ShortcutInput } from './shortcut-input.js';

export type DesktopShortcut =
  | 'browse'
  | 'capture'
  | 'comment'
  | 'preview'
  | 'diagnostics'
  | 'toggle-sidebar'
  | 'new-annotation';

export const modeForShortcut = (
  input: ShortcutInput,
  platform = 'darwin',
): DesktopShortcut | undefined => {
  if (
    input.type === 'keyDown' &&
    !input.isAutoRepeat &&
    hasPrimaryModifier(input, platform) &&
    !input.shift &&
    !input.alt
  ) {
    if (input.code === 'KeyB') return 'toggle-sidebar';
    if (input.code === 'KeyN') return 'new-annotation';
  }
  if (
    input.type === 'keyDown' &&
    !input.isAutoRepeat &&
    input.code === 'KeyC' &&
    hasPrimaryModifier(input, platform) &&
    input.shift &&
    !input.alt
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
  if (input.code === 'KeyV') return 'browse';
  if (input.code === 'KeyA') return 'capture';
  if (input.code === 'KeyW') return 'comment';
  if (input.code === 'KeyB') return 'preview';
  return undefined;
};
