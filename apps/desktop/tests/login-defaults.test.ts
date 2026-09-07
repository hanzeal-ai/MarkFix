import { describe, expect, it } from 'vitest';
import { defaultDesktopPassword } from '../src/renderer/src/auth/login-defaults.js';

describe('desktop login defaults', () => {
  it('prefills the local demo password during development', () => {
    expect(defaultDesktopPassword(true)).toBe('markfix-admin');
  });

  it('does not prefill a password in production', () => {
    expect(defaultDesktopPassword(false)).toBe('');
  });
});
