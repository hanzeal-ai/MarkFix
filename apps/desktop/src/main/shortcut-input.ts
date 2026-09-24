export type ShortcutInput = {
  type: string;
  code: string;
  alt: boolean;
  control: boolean;
  meta: boolean;
  shift: boolean;
  isAutoRepeat: boolean;
};

export const hasPrimaryModifier = (input: ShortcutInput, platform: string): boolean =>
  platform === 'darwin' ? input.meta && !input.control : input.control && !input.meta;
