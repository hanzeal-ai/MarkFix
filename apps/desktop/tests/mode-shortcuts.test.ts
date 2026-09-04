import { describe, expect, it } from 'vitest';
import { modeForShortcut, type ModeShortcutInput } from '../src/main/mode-shortcuts.js';

const input = (overrides: Partial<ModeShortcutInput> = {}): ModeShortcutInput => ({
  type: 'keyDown',
  code: 'KeyA',
  alt: true,
  control: false,
  meta: false,
  shift: false,
  isAutoRepeat: false,
  ...overrides,
});

describe('desktop mode shortcuts', () => {
  it('maps Option+A to capture and Option+W to comment', () => {
    expect(modeForShortcut(input())).toBe('capture');
    expect(modeForShortcut(input({ code: 'KeyW' }))).toBe('comment');
  });

  it('ignores keyup, repeats, and shortcuts with extra modifiers', () => {
    expect(modeForShortcut(input({ type: 'keyUp' }))).toBeUndefined();
    expect(modeForShortcut(input({ isAutoRepeat: true }))).toBeUndefined();
    expect(modeForShortcut(input({ meta: true }))).toBeUndefined();
    expect(modeForShortcut(input({ alt: false }))).toBeUndefined();
  });
});
