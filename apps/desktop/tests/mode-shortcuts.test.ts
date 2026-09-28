import { describe, expect, it } from 'vitest';
import { modeForShortcut } from '../src/main/mode-shortcuts.js';
import type { ShortcutInput } from '../src/main/shortcut-input.js';

const input = (overrides: Partial<ShortcutInput> = {}): ShortcutInput => ({
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
    expect(modeForShortcut(input({ code: 'KeyV' }))).toBe('browse');
    expect(modeForShortcut(input({ code: 'KeyW' }))).toBe('comment');
  });

  it('maps Option+B to preview without the old Command modifier', () => {
    expect(modeForShortcut(input({ code: 'KeyB' }))).toBe('preview');
    expect(modeForShortcut(input({ code: 'KeyB', meta: true }))).toBeUndefined();
    expect(modeForShortcut(input({ code: 'KeyB', isAutoRepeat: true }))).toBeUndefined();
  });

  it('maps Command+Shift+C to diagnostics', () => {
    expect(modeForShortcut(input({ code: 'KeyC', alt: false, meta: true, shift: true }))).toBe(
      'diagnostics',
    );
  });

  it('maps Command+B to the sidebar and Command+N to a new annotation', () => {
    expect(modeForShortcut(input({ code: 'KeyB', alt: false, meta: true }))).toBe('toggle-sidebar');
    expect(modeForShortcut(input({ code: 'KeyN', alt: false, meta: true }))).toBe('new-annotation');
  });

  it('ignores keyup, repeats, and shortcuts with extra modifiers', () => {
    expect(modeForShortcut(input({ type: 'keyUp' }))).toBeUndefined();
    expect(modeForShortcut(input({ isAutoRepeat: true }))).toBeUndefined();
    expect(modeForShortcut(input({ meta: true }))).toBeUndefined();
    expect(modeForShortcut(input({ alt: false }))).toBeUndefined();
    expect(
      modeForShortcut(input({ code: 'KeyC', alt: false, meta: true, shift: false })),
    ).toBeUndefined();
    expect(
      modeForShortcut(input({ code: 'KeyB', alt: false, meta: true, shift: true })),
    ).toBeUndefined();
  });
});

it('uses Ctrl for Windows actions and Alt for annotation modes', () => {
  const ctrl = input({ alt: false, control: true });
  expect(modeForShortcut({ ...ctrl, code: 'KeyB' }, 'win32')).toBe('toggle-sidebar');
  expect(modeForShortcut({ ...ctrl, code: 'KeyN' }, 'win32')).toBe('new-annotation');
  expect(modeForShortcut({ ...ctrl, code: 'KeyC', shift: true }, 'win32')).toBe('diagnostics');
  expect(modeForShortcut(input(), 'win32')).toBe('capture');
  expect(modeForShortcut({ ...ctrl, code: 'KeyB', meta: true }, 'win32')).toBeUndefined();
  expect(modeForShortcut({ ...ctrl, code: 'KeyB' }, 'darwin')).toBeUndefined();
});
