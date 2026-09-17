import { describe, expect, it } from 'vitest';
import {
  desktopPasswordChangeInput,
  desktopRegistrationInput,
} from '../src/main/desktop-auth-input.js';

describe('desktop auth IPC input boundary', () => {
  it('accepts only the expected registration strings', () => {
    expect(
      desktopRegistrationInput({
        displayName: 'Lin',
        email: 'lin@example.com',
        password: 'secret',
      }),
    ).toEqual({ displayName: 'Lin', email: 'lin@example.com', password: 'secret' });
    for (const input of [null, [], 'value', { email: 'lin@example.com', password: 'secret' }]) {
      expect(() => desktopRegistrationInput(input)).toThrow('Name, email and password');
    }
  });

  it('accepts only current and new password strings', () => {
    expect(desktopPasswordChangeInput({ currentPassword: 'current', newPassword: 'next' })).toEqual(
      { currentPassword: 'current', newPassword: 'next' },
    );
    for (const input of [null, [], 42, { currentPassword: 'current' }]) {
      expect(() => desktopPasswordChangeInput(input)).toThrow('Current and new passwords');
    }
  });
});
