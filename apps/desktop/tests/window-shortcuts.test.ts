import { describe, expect, it } from 'vitest';
import type { ShortcutInput } from '../src/main/shortcut-input.js';
import { windowActionForShortcut } from '../src/main/window-shortcuts.js';

const input = (overrides: Partial<ShortcutInput> = {}): ShortcutInput => ({
  type: 'keyDown',
  code: 'KeyW',
  alt: false,
  control: false,
  meta: true,
  shift: false,
  isAutoRepeat: false,
  ...overrides,
});

describe('desktop window shortcuts', () => {
  it('minimizes the main window and closes child windows with Command+W', () => {
    expect(windowActionForShortcut(input(), 'main')).toBe('minimize');
    expect(windowActionForShortcut(input(), 'child')).toBe('close');
  });

  it('quits from either window context with Command+Q', () => {
    expect(windowActionForShortcut(input({ code: 'KeyQ' }), 'main')).toBe('quit');
    expect(windowActionForShortcut(input({ code: 'KeyQ' }), 'child')).toBe('quit');
  });

  it('opens settings from either window context with Command+,', () => {
    expect(windowActionForShortcut(input({ code: 'Comma' }), 'main')).toBe('settings');
    expect(windowActionForShortcut(input({ code: 'Comma' }), 'child')).toBe('settings');
  });

  it('ignores keyup, repeats, and extra modifiers', () => {
    expect(windowActionForShortcut(input({ type: 'keyUp' }), 'main')).toBeUndefined();
    expect(windowActionForShortcut(input({ isAutoRepeat: true }), 'main')).toBeUndefined();
    expect(windowActionForShortcut(input({ shift: true }), 'child')).toBeUndefined();
    expect(windowActionForShortcut(input({ meta: false }), 'child')).toBeUndefined();
  });
});

it('uses Ctrl on Windows, closes its main window, and leaves Windows-key shortcuts alone', () => {
  const ctrl = input({ meta: false, control: true });
  expect(windowActionForShortcut(ctrl, 'main', 'win32')).toBe('close');
  expect(windowActionForShortcut(ctrl, 'child', 'win32')).toBe('close');
  expect(windowActionForShortcut({ ...ctrl, code: 'Comma' }, 'main', 'win32')).toBe('settings');
  expect(windowActionForShortcut({ ...ctrl, code: 'KeyQ' }, 'main', 'win32')).toBe('quit');
  expect(windowActionForShortcut(input(), 'main', 'win32')).toBeUndefined();
  expect(windowActionForShortcut({ ...ctrl, meta: true }, 'main', 'win32')).toBeUndefined();
  expect(windowActionForShortcut(ctrl, 'main', 'darwin')).toBeUndefined();
});
