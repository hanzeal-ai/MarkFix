export type ModeShortcutInput = {
  type: string;
  code: string;
  alt: boolean;
  control: boolean;
  meta: boolean;
  shift: boolean;
  isAutoRepeat: boolean;
};

export const modeForShortcut = (input: ModeShortcutInput): 'capture' | 'comment' | undefined => {
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
  return undefined;
};
